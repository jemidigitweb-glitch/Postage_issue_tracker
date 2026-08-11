// scripts/migrate-german-market-points-to-discussions.ts
//
// One-time, idempotent DATA migration: converts the existing DISC-001
// "container" Discussion + its 14 discussion_points rows (migration 007's
// model) into the corrected model from migration/008_discussion_groups.sql
// — every point becomes its own independent, top-level Discussion (own
// DISC-xxx ID via the existing next_discussion_id(), own full workflow),
// grouped under one new issue_tracking.discussion_groups row that holds the
// shared meeting metadata (title, dates, coordinator, objective) instead of
// duplicating it 14 times.
//
// This script reads the LIVE current discussion_points rows rather than
// replaying hardcoded text, specifically so that any change already made
// through the app (e.g. a point's issue_link_type flipped during manual
// testing) is carried forward faithfully instead of being silently
// overwritten by stale seed content.
//
// Safety model (mirrors scripts/seed-german-market-discussion.ts):
//  - Hard target-database check before any write.
//  - Idempotent: if a discussion_groups row with the source title already
//    exists, the script exits with zero writes — safe to re-run.
//  - Single transaction: the new group, all 14 new discussions, all copied
//    participants, AND the soft-delete of the old DISC-001 container all
//    commit together or not at all. DISC-001 is only soft-deleted (never
//    hard-deleted) and only as the LAST statement in the same transaction
//    that successfully created its 14 replacements — if anything earlier
//    in the transaction fails, DISC-001 is untouched.
//  - DISC-001's discussion_points, discussion_comments, and
//    discussion_status_history rows are never deleted or modified by this
//    script — they remain attached to the (now soft-deleted) DISC-001 row,
//    fully intact and recoverable, not orphaned.
//  - Never touches issue_tracking.issues except a read-only existence
//    check; never creates a new Issue (SA-021 stays linked, not duplicated
//    — the exact linked_issue_id already on discussion_points is copied
//    onto its corresponding new Discussion).
//  - Never touches issue_tracking.issue_staff, issue_tracking.management_users
//    (read-only), or any schema/table outside issue_tracking.
//
// Usage (manual only):
//   npx tsx scripts/migrate-german-market-points-to-discussions.ts

import { getPool } from "./lib/db";

const REQUIRED_DATABASE = "varmen_db";
const SOURCE_DISCUSSION_ID = "DISC-001";

function combineObjective(details: string | null, actionRequired: string | null): string | null {
  const parts: string[] = [];
  if (details?.trim()) parts.push(details.trim());
  if (actionRequired?.trim()) parts.push(`Action Required: ${actionRequired.trim()}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

async function main() {
  const pool = getPool();

  try {
    const identity = await pool.query<{ current_database: string; current_user: string }>(
      "SELECT current_database(), current_user;"
    );
    const connectedDb = identity.rows[0]?.current_database;
    const connectedUser = identity.rows[0]?.current_user;
    console.log(`Connected as ${connectedUser ?? "(unknown)"} on ${connectedDb ?? "(unknown)"}`);

    if (connectedDb !== REQUIRED_DATABASE) {
      console.error(
        `SAFETY ABORT: connected database is "${connectedDb ?? "(unknown)"}", not "${REQUIRED_DATABASE}". No writes made.`
      );
      process.exitCode = 1;
      return;
    }

    const source = await pool.query<{
      discussion_id: string;
      title: string;
      meeting_date_start: string | null;
      meeting_date_end: string | null;
      coordinator_name: string | null;
      objective: string | null;
      action_plan: string | null;
      created_by: number;
    }>(
      `SELECT discussion_id, title, meeting_date_start, meeting_date_end, coordinator_name,
              objective, action_plan, created_by
       FROM issue_tracking.discussions
       WHERE discussion_id = $1 AND deleted_at IS NULL`,
      [SOURCE_DISCUSSION_ID]
    );
    const sourceRow = source.rows[0];

    // Idempotency guard — never create a duplicate group/set of Discussions.
    const existingGroup = await pool.query<{ group_id: number }>(
      `SELECT group_id FROM issue_tracking.discussion_groups WHERE title = $1`,
      [sourceRow?.title ?? "German Market Coordination & Sales Improvement Meeting"]
    );
    if (existingGroup.rows.length > 0) {
      console.log(`Already migrated: discussion_groups.group_id = ${existingGroup.rows[0].group_id}. No writes made.`);
      return;
    }

    if (!sourceRow) {
      console.log(
        `Source discussion "${SOURCE_DISCUSSION_ID}" not found (already deleted, or never existed) and no ` +
          `matching discussion_groups row exists either — nothing to migrate. No writes made.`
      );
      return;
    }

    const points = await pool.query<{
      point_id: number;
      point_number: number;
      title: string;
      details: string | null;
      action_required: string | null;
      responsible_person: string | null;
      domain: string | null;
      action_plan: string | null;
      implementation_progress: string | null;
      status: "RED" | "AMBER" | "GREEN";
      process_started: boolean | null;
      estimated_finish_date: string | null;
      completed_date: string | null;
      final_outcome: string | null;
      issue_link_type: string;
      linked_issue_id: string | null;
    }>(
      `SELECT point_id, point_number, title, details, action_required, responsible_person, domain,
              action_plan, implementation_progress, status, process_started,
              to_char(estimated_finish_date, 'YYYY-MM-DD') AS estimated_finish_date,
              to_char(completed_date, 'YYYY-MM-DD') AS completed_date,
              final_outcome, issue_link_type, linked_issue_id
       FROM issue_tracking.discussion_points
       WHERE discussion_id = $1
       ORDER BY point_number`,
      [SOURCE_DISCUSSION_ID]
    );

    if (points.rows.length === 0) {
      console.log(`Source discussion "${SOURCE_DISCUSSION_ID}" has no discussion_points rows. No writes made.`);
      return;
    }

    const participants = await pool.query<{
      participant_name: string;
      role_title: string | null;
      management_user_id: number | null;
      is_coordinator: boolean;
    }>(
      `SELECT participant_name, role_title, management_user_id, is_coordinator
       FROM issue_tracking.discussion_participants
       WHERE discussion_id = $1`,
      [SOURCE_DISCUSSION_ID]
    );

    console.log(
      `Migrating ${SOURCE_DISCUSSION_ID} ("${sourceRow.title}"): ${points.rows.length} points, ` +
        `${participants.rows.length} participants.`
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ── 1. Discussion Group — shared meeting metadata, stored once ──────
      const groupObjective = [sourceRow.objective, sourceRow.action_plan].filter((v) => v?.trim()).join("\n\n");
      const groupResult = await client.query<{ group_id: number }>(
        `INSERT INTO issue_tracking.discussion_groups
           (title, meeting_date_start, meeting_date_end, coordinator_name, objective, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING group_id`,
        [
          sourceRow.title,
          sourceRow.meeting_date_start,
          sourceRow.meeting_date_end,
          sourceRow.coordinator_name,
          groupObjective || null,
          sourceRow.created_by,
        ]
      );
      const groupId = groupResult.rows[0].group_id;

      const createdDiscussionIds: string[] = [];

      // ── 2. One independent Discussion per former point ──────────────────
      for (const point of points.rows) {
        const idResult = await client.query<{ next_discussion_id: string }>(
          "SELECT issue_tracking.next_discussion_id() AS next_discussion_id"
        );
        const newDiscussionId = idResult.rows[0].next_discussion_id;

        const objective = combineObjective(point.details, point.action_required);
        // Preserve responsible_person even though coordinator_name defaults
        // to the meeting's coordinator — appended as a labeled note rather
        // than dropped, since discussions has no dedicated column for it.
        const objectiveWithResponsible =
          point.responsible_person && point.responsible_person !== sourceRow.coordinator_name
            ? [objective, `Responsible Person/Team: ${point.responsible_person}`].filter(Boolean).join("\n\n")
            : objective;

        await client.query(
          `INSERT INTO issue_tracking.discussions
             (discussion_id, title, meeting_date_start, meeting_date_end, coordinator_name, domain,
              objective, status, action_plan, implementation_progress, process_started,
              estimated_finish_date, actual_finish_date, final_outcome, issue_link_type,
              linked_issue_id, created_by, group_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            newDiscussionId,
            point.title,
            sourceRow.meeting_date_start,
            sourceRow.meeting_date_end,
            sourceRow.coordinator_name,
            point.domain,
            objectiveWithResponsible,
            point.status,
            point.action_plan,
            point.implementation_progress,
            point.process_started,
            point.estimated_finish_date,
            point.completed_date,
            point.final_outcome,
            point.issue_link_type,
            point.linked_issue_id,
            sourceRow.created_by,
            groupId,
          ]
        );

        for (const participant of participants.rows) {
          await client.query(
            `INSERT INTO issue_tracking.discussion_participants
               (discussion_id, participant_name, role_title, management_user_id, is_coordinator)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              newDiscussionId,
              participant.participant_name,
              participant.role_title,
              participant.management_user_id,
              participant.is_coordinator,
            ]
          );
        }

        createdDiscussionIds.push(`${newDiscussionId} (${point.title})`);
      }

      // ── 3. Soft-delete the old container — LAST, only after every ───────
      // replacement Discussion committed successfully in this same
      // transaction. discussion_points/discussion_comments/
      // discussion_status_history rows for DISC-001 are left completely
      // untouched (still in the database, still attached to DISC-001).
      await client.query(
        `UPDATE issue_tracking.discussions
         SET deleted_at = now(), deleted_by = $2
         WHERE discussion_id = $1 AND deleted_at IS NULL`,
        [SOURCE_DISCUSSION_ID, sourceRow.created_by]
      );

      await client.query("COMMIT");

      console.log(`\nCreated discussion_groups.group_id = ${groupId} ("${sourceRow.title}").`);
      console.log(`Created ${createdDiscussionIds.length} independent Discussions:`);
      for (const line of createdDiscussionIds) console.log(`  - ${line}`);
      console.log(`\nSoft-deleted ${SOURCE_DISCUSSION_ID} (removed from active list; data preserved in the database).`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
