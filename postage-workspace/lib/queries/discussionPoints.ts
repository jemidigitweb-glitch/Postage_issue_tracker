import "server-only";

import { getVerifiedClient, query } from "../db";
import type { DiscussionStatus } from "./discussions";
import { createIssue, type CreateIssueInput } from "./issues";

// Queries against issue_tracking.discussion_points (migration/007_discussions.sql).
// A point's `issue_link_type` is one of three states, exactly per the
// approved design:
//   discussion_only     — a genuine discussion topic, no Issue is warranted
//   linked_existing      — points at a real row in issue_tracking.issues
//   new_issue_required    — flagged as needing a new Issue, not yet created
//
// createIssueForPoint() below is the ONLY path that creates an Issue from a
// Discussion Point, and it does so by calling the existing
// lib/queries/issues.ts createIssue() — no second Issue-creation mechanism
// is implemented here. No Issue is ever auto-created for every point; a
// point stays 'discussion_only' unless a human explicitly links or creates.

export type IssueLinkType = "discussion_only" | "linked_existing" | "new_issue_required";

export interface DiscussionPoint {
  pointId: number;
  discussionId: string;
  pointNumber: number;
  title: string;
  details: string | null;
  actionRequired: string | null;
  responsiblePerson: string | null;
  domain: string | null;
  actionPlan: string | null;
  implementationProgress: string | null;
  status: DiscussionStatus;
  processStarted: boolean | null;
  estimatedFinishDate: string | null;
  completedDate: string | null;
  finalOutcome: string | null;
  issueLinkType: IssueLinkType;
  linkedIssueId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DiscussionPointRow {
  point_id: number;
  discussion_id: string;
  point_number: number;
  title: string;
  details: string | null;
  action_required: string | null;
  responsible_person: string | null;
  domain: string | null;
  action_plan: string | null;
  implementation_progress: string | null;
  status: DiscussionStatus;
  process_started: boolean | null;
  estimated_finish_date: string | null;
  completed_date: string | null;
  final_outcome: string | null;
  issue_link_type: IssueLinkType;
  linked_issue_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DiscussionPointRow): DiscussionPoint {
  return {
    pointId: Number(row.point_id),
    discussionId: row.discussion_id,
    pointNumber: row.point_number,
    title: row.title,
    details: row.details,
    actionRequired: row.action_required,
    responsiblePerson: row.responsible_person,
    domain: row.domain,
    actionPlan: row.action_plan,
    implementationProgress: row.implementation_progress,
    status: row.status,
    processStarted: row.process_started,
    estimatedFinishDate: row.estimated_finish_date,
    completedDate: row.completed_date,
    finalOutcome: row.final_outcome,
    issueLinkType: row.issue_link_type,
    linkedIssueId: row.linked_issue_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const POINT_COLUMNS = `
  point_id, discussion_id, point_number, title, details, action_required,
  responsible_person, domain, action_plan, implementation_progress, status,
  process_started, to_char(estimated_finish_date, 'YYYY-MM-DD') AS estimated_finish_date,
  to_char(completed_date, 'YYYY-MM-DD') AS completed_date, final_outcome,
  issue_link_type, linked_issue_id,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
`;

export async function listDiscussionPoints(discussionId: string): Promise<DiscussionPoint[]> {
  const result = await query<DiscussionPointRow>(
    `SELECT ${POINT_COLUMNS}
     FROM issue_tracking.discussion_points
     WHERE discussion_id = $1
     ORDER BY point_number ASC`,
    [discussionId]
  );
  return result.rows.map(mapRow);
}

export async function getDiscussionPointById(pointId: number): Promise<DiscussionPoint | null> {
  const result = await query<DiscussionPointRow>(
    `SELECT ${POINT_COLUMNS} FROM issue_tracking.discussion_points WHERE point_id = $1`,
    [pointId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export interface AddDiscussionPointInput {
  discussionId: string;
  title: string;
  details: string | null;
  actionRequired: string | null;
  responsiblePerson: string | null;
  domain: string | null;
  actionPlan: string | null;
  implementationProgress: string | null;
  processStarted: boolean | null;
  estimatedFinishDate: string | null;
}

export class InvalidDiscussionError extends Error {}

/**
 * Adds one new point to a Discussion, auto-numbering it (max existing
 * point_number + 1, starting at 1). Locks the parent discussions row
 * FOR UPDATE for the duration of the transaction so two concurrent adds to
 * the same Discussion can't compute the same next point_number — the
 * (discussion_id, point_number) UNIQUE constraint is the real backstop
 * either way.
 */
export async function addDiscussionPoint(input: AddDiscussionPointInput): Promise<DiscussionPoint> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const discussion = await client.query<{ discussion_id: string }>(
      `SELECT discussion_id FROM issue_tracking.discussions WHERE discussion_id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [input.discussionId]
    );
    if (discussion.rows.length === 0) {
      throw new InvalidDiscussionError(`Discussion "${input.discussionId}" not found.`);
    }

    const maxResult = await client.query<{ next_number: number }>(
      `SELECT COALESCE(MAX(point_number), 0) + 1 AS next_number
       FROM issue_tracking.discussion_points WHERE discussion_id = $1`,
      [input.discussionId]
    );
    const pointNumber = maxResult.rows[0].next_number;

    const inserted = await client.query<DiscussionPointRow>(
      `INSERT INTO issue_tracking.discussion_points
         (discussion_id, point_number, title, details, action_required, responsible_person,
          domain, action_plan, implementation_progress, process_started, estimated_finish_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${POINT_COLUMNS}`,
      [
        input.discussionId,
        pointNumber,
        input.title,
        input.details,
        input.actionRequired,
        input.responsiblePerson,
        input.domain,
        input.actionPlan,
        input.implementationProgress,
        input.processStarted,
        input.estimatedFinishDate,
      ]
    );

    await client.query("COMMIT");
    return mapRow(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateDiscussionPointInput {
  pointId: number;
  title: string;
  details: string | null;
  actionRequired: string | null;
  responsiblePerson: string | null;
  domain: string | null;
  actionPlan: string | null;
  implementationProgress: string | null;
  processStarted: boolean | null;
  estimatedFinishDate: string | null;
  completedDate: string | null;
}

/** Updates a point's editable fields — never status or issue linking (see
 *  updateDiscussionPointStatus() / linkExistingIssueToPoint() below). */
export async function updateDiscussionPoint(input: UpdateDiscussionPointInput): Promise<DiscussionPoint | null> {
  const result = await query<DiscussionPointRow>(
    `UPDATE issue_tracking.discussion_points
     SET title = $2, details = $3, action_required = $4, responsible_person = $5, domain = $6,
         action_plan = $7, implementation_progress = $8, process_started = $9,
         estimated_finish_date = $10, completed_date = $11, updated_at = now()
     WHERE point_id = $1
     RETURNING ${POINT_COLUMNS}`,
    [
      input.pointId,
      input.title,
      input.details,
      input.actionRequired,
      input.responsiblePerson,
      input.domain,
      input.actionPlan,
      input.implementationProgress,
      input.processStarted,
      input.estimatedFinishDate,
      input.completedDate,
    ]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

const POINT_STATUS_RANK: Readonly<Record<DiscussionStatus, number>> = { RED: 0, AMBER: 1, GREEN: 2 };

export class PointStatusTransitionError extends Error {}

export interface UpdateDiscussionPointStatusInput {
  pointId: number;
  newStatus: DiscussionStatus;
  /** Required when newStatus is GREEN and the point has no final_outcome yet. */
  finalOutcome?: string | null;
}

/**
 * Forward-only RED -> AMBER -> GREEN for a single point (same-status is a
 * no-op). There is no per-point reopen — only the parent Discussion supports
 * authorised reopening (lib/queries/discussionStatus.ts); reopening a whole
 * Discussion is how a mis-closed point gets revisited. GREEN requires a
 * final_outcome (existing or supplied here), mirroring the Discussion-level
 * rule.
 */
export async function updateDiscussionPointStatus(
  input: UpdateDiscussionPointStatusInput
): Promise<DiscussionPoint> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const current = await client.query<{ status: DiscussionStatus; final_outcome: string | null }>(
      `SELECT status, final_outcome FROM issue_tracking.discussion_points WHERE point_id = $1 FOR UPDATE`,
      [input.pointId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new PointStatusTransitionError(`Discussion point ${input.pointId} not found.`);
    }

    if (row.status === input.newStatus) {
      await client.query("ROLLBACK");
      const unchanged = await getDiscussionPointById(input.pointId);
      if (!unchanged) throw new PointStatusTransitionError(`Discussion point ${input.pointId} not found.`);
      return unchanged;
    }

    if (POINT_STATUS_RANK[input.newStatus] < POINT_STATUS_RANK[row.status]) {
      throw new PointStatusTransitionError(
        "Point status cannot move backwards. Reopen the parent Discussion instead."
      );
    }

    const finalOutcome = input.finalOutcome?.trim() || row.final_outcome?.trim() || null;
    if (input.newStatus === "GREEN" && !finalOutcome) {
      throw new PointStatusTransitionError("Final outcome is required before marking a point GREEN.");
    }

    const updated = await client.query<DiscussionPointRow>(
      `UPDATE issue_tracking.discussion_points
       SET status = $2, final_outcome = COALESCE($3, final_outcome), updated_at = now()
       WHERE point_id = $1
       RETURNING ${POINT_COLUMNS}`,
      [input.pointId, input.newStatus, input.finalOutcome?.trim() || null]
    );

    await client.query("COMMIT");
    return mapRow(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class InvalidIssueError extends Error {}

/** Links a point to an existing, real Issue — validates the Issue exists
 *  first (never trusts a client-supplied ID blindly). */
export async function linkExistingIssueToPoint(pointId: number, issueId: string): Promise<DiscussionPoint> {
  const issueCheck = await query<{ issue_id: string }>(
    `SELECT issue_id FROM issue_tracking.issues WHERE issue_id = $1 AND deleted_at IS NULL`,
    [issueId]
  );
  if (issueCheck.rows.length === 0) {
    throw new InvalidIssueError(`Issue "${issueId}" not found.`);
  }

  const result = await query<DiscussionPointRow>(
    `UPDATE issue_tracking.discussion_points
     SET issue_link_type = 'linked_existing', linked_issue_id = $2, updated_at = now()
     WHERE point_id = $1
     RETURNING ${POINT_COLUMNS}`,
    [pointId, issueId]
  );
  const row = result.rows[0];
  if (!row) throw new PointStatusTransitionError(`Discussion point ${pointId} not found.`);
  return mapRow(row);
}

/** Flags a point as needing a new Issue, without creating one yet — a human
 *  decision recorded distinctly from "discussion only". */
export async function markPointNewIssueRequired(pointId: number): Promise<DiscussionPoint> {
  const result = await query<DiscussionPointRow>(
    `UPDATE issue_tracking.discussion_points
     SET issue_link_type = 'new_issue_required', linked_issue_id = NULL, updated_at = now()
     WHERE point_id = $1
     RETURNING ${POINT_COLUMNS}`,
    [pointId]
  );
  const row = result.rows[0];
  if (!row) throw new PointStatusTransitionError(`Discussion point ${pointId} not found.`);
  return mapRow(row);
}

/** Reverts a point to plain "discussion only" — clears any link/flag. */
export async function markPointDiscussionOnly(pointId: number): Promise<DiscussionPoint> {
  const result = await query<DiscussionPointRow>(
    `UPDATE issue_tracking.discussion_points
     SET issue_link_type = 'discussion_only', linked_issue_id = NULL, updated_at = now()
     WHERE point_id = $1
     RETURNING ${POINT_COLUMNS}`,
    [pointId]
  );
  const row = result.rows[0];
  if (!row) throw new PointStatusTransitionError(`Discussion point ${pointId} not found.`);
  return mapRow(row);
}

/**
 * Creates a brand-new Issue from a point that has been explicitly flagged
 * 'new_issue_required', by calling the EXISTING, unmodified createIssue()
 * from lib/queries/issues.ts — no second Issue-ID generator, no duplicate
 * Issue-creation logic. The point is then updated to 'linked_existing' with
 * the new issue_id. If the point-update step fails after the Issue was
 * created, the Issue itself is unaffected (it simply isn't linked yet) —
 * never rolled back or deleted, since Issue data is out of scope for this
 * module to touch destructively.
 */
export async function createIssueForPoint(
  pointId: number,
  issueInput: CreateIssueInput
): Promise<{ point: DiscussionPoint; issueId: string }> {
  const issueId = await createIssue(issueInput);

  const result = await query<DiscussionPointRow>(
    `UPDATE issue_tracking.discussion_points
     SET issue_link_type = 'linked_existing', linked_issue_id = $2, updated_at = now()
     WHERE point_id = $1
     RETURNING ${POINT_COLUMNS}`,
    [pointId, issueId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new PointStatusTransitionError(
      `Issue ${issueId} was created, but discussion point ${pointId} was not found to link it to.`
    );
  }
  return { point: mapRow(row), issueId };
}
