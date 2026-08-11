import "server-only";

import { getVerifiedClient, query } from "../db";
import type { DiscussionStatus } from "./discussions";

// Status-change workflow for Discussions, recorded into
// issue_tracking.discussion_status_history (migration/007_discussions.sql).
//
// Deliberately a SEPARATE file and a SEPARATE table from
// lib/queries/issueStatus.ts / issue_tracking.issue_status_history — the
// Issue workflow is never read, written, or imported by anything in this
// file, and this file is never imported by issueStatus.ts.
//
// Final business rule for Discussions:
//   RED   = not started
//   AMBER = process started / in progress
//   GREEN = completed / finished — FINAL, no transitions out of GREEN
// Allowed transitions: RED -> AMBER; AMBER -> RED; AMBER -> GREEN.
// Explicitly rejected: RED -> GREEN, GREEN -> AMBER, GREEN -> RED.
// There is NO reopen workflow for Discussions — GREEN is terminal, full
// stop. (Earlier versions of this file had a separate reopenDiscussion()
// path; it has been removed, not merely hidden from the UI.)

const ALLOWED_TRANSITIONS: Readonly<Record<DiscussionStatus, readonly DiscussionStatus[]>> = {
  RED: ["AMBER"],
  AMBER: ["RED", "GREEN"],
  GREEN: [],
};

export class DiscussionStatusTransitionError extends Error {}

export interface UpdateDiscussionStatusInput {
  discussionId: string;
  newStatus: DiscussionStatus;
  changedByUserId: number;
}

interface DiscussionStatusRow {
  status: DiscussionStatus;
  final_outcome: string | null;
}

/**
 * Applies one status transition per the rule above, recording it in
 * discussion_status_history. Same-status "changes" are a no-op (rolled
 * back, not an error, no history row). Any transition not explicitly
 * listed in ALLOWED_TRANSITIONS is rejected here — enforced server-side
 * regardless of what the client submits, not just by hiding dropdown
 * options — and neither the discussions row nor discussion_status_history
 * is touched when a transition is rejected.
 */
export async function updateDiscussionStatus(input: UpdateDiscussionStatusInput): Promise<DiscussionStatus> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const current = await client.query<DiscussionStatusRow>(
      `SELECT status, final_outcome FROM issue_tracking.discussions WHERE discussion_id = $1 FOR UPDATE`,
      [input.discussionId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new DiscussionStatusTransitionError(`Discussion "${input.discussionId}" not found.`);
    }

    const fromStatus = row.status;
    const toStatus = input.newStatus;

    if (fromStatus === toStatus) {
      await client.query("ROLLBACK");
      return fromStatus;
    }

    const allowed = ALLOWED_TRANSITIONS[fromStatus];
    if (!allowed.includes(toStatus)) {
      throw new DiscussionStatusTransitionError(
        fromStatus === "GREEN"
          ? "GREEN is final — a Discussion cannot be moved out of GREEN."
          : `Cannot move from ${fromStatus} to ${toStatus}. Allowed: ${allowed.join(", ")}.`
      );
    }

    if (toStatus === "GREEN" && !row.final_outcome?.trim()) {
      throw new DiscussionStatusTransitionError(
        "A final outcome/resolution is required before marking this Discussion GREEN."
      );
    }

    await client.query(
      // $2 is cast explicitly on its first use — without this, Postgres's
      // parameter type inference can fail ("inconsistent types deduced for
      // parameter $2: text versus character varying") when the same
      // placeholder is later compared against a string literal inside the
      // CASE expression. Pinning the type once resolves every other bare
      // use of $2 in the same statement.
      `UPDATE issue_tracking.discussions
       SET status = $2::VARCHAR(20), updated_at = now(),
           actual_finish_date = CASE WHEN $2 = 'GREEN' THEN COALESCE(actual_finish_date, CURRENT_DATE) ELSE actual_finish_date END
       WHERE discussion_id = $1`,
      [input.discussionId, toStatus]
    );

    await client.query(
      `INSERT INTO issue_tracking.discussion_status_history
         (discussion_id, from_status, to_status, changed_by, is_reopen, reason)
       VALUES ($1, $2, $3, $4, false, NULL)`,
      [input.discussionId, fromStatus, toStatus, input.changedByUserId]
    );

    await client.query("COMMIT");
    return toStatus;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface DiscussionStatusHistoryEntry {
  historyId: number;
  fromStatus: DiscussionStatus | null;
  toStatus: DiscussionStatus;
  changedByName: string;
  changedAt: string;
  isReopen: boolean;
  reason: string | null;
}

interface DiscussionStatusHistoryRow {
  history_id: number;
  from_status: DiscussionStatus | null;
  to_status: DiscussionStatus;
  changed_by_name: string;
  changed_at: string;
  is_reopen: boolean;
  reason: string | null;
}

export async function listDiscussionStatusHistory(discussionId: string): Promise<DiscussionStatusHistoryEntry[]> {
  const result = await query<DiscussionStatusHistoryRow>(
    `SELECT h.history_id, h.from_status, h.to_status, mu.display_name AS changed_by_name,
            to_char(h.changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS changed_at,
            h.is_reopen, h.reason
     FROM issue_tracking.discussion_status_history h
     JOIN issue_tracking.management_users mu ON mu.user_id = h.changed_by
     WHERE h.discussion_id = $1
     ORDER BY h.changed_at DESC`,
    [discussionId]
  );

  return result.rows.map((row) => ({
    historyId: Number(row.history_id),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedByName: row.changed_by_name,
    changedAt: row.changed_at,
    isReopen: row.is_reopen,
    reason: row.reason,
  }));
}
