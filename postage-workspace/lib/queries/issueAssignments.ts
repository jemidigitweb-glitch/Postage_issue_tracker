import "server-only";

import { getVerifiedClient, query } from "../db";
import type { IssuePriority, IssueStatus } from "./issues";

// Reads/writes against issue_tracking.issue_assignments (+ assignment_users
// for the assignee name), the "Assign To" system — see
// migration/005_assignment_users.sql. Independent of
// issue_tracking.issue_staff_assignments (the older, unrelated "who raised
// this issue" assignment feature in lib/queries/assignments.ts) — never
// mixed together.

export interface CurrentAssignment {
  issueId: string;
  assigneeId: number;
  assigneeName: string;
  assignedAt: string;
}

interface CurrentAssignmentRow {
  issue_id: string;
  assignee_id: number;
  assignee_name: string;
  assigned_at: string;
}

/** Current assignment (if any) for a single issue. */
export async function getCurrentIssueAssignment(issueId: string): Promise<CurrentAssignment | null> {
  const result = await query<CurrentAssignmentRow>(
    `SELECT ia.issue_id, ia.assignee_id, au.assignee_name,
            to_char(ia.assigned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS assigned_at
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
     WHERE ia.issue_id = $1 AND ia.is_current = true`,
    [issueId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    issueId: row.issue_id,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    assignedAt: row.assigned_at,
  };
}

export interface AssignIssuesResult {
  /** Issue IDs that were newly assigned by this call. */
  assignedIds: string[];
  /** Issue IDs that already had a current assignee and were left untouched
   *  — an issue can only be assigned once, and the original assignee/date
   *  is preserved rather than overwritten. */
  alreadyAssignedIds: string[];
}

/**
 * Assigns one or more issues to a single assignee. An issue can only be
 * assigned once: any issue in `issueIds` that already has a current row in
 * issue_assignments is skipped (returned in `alreadyAssignedIds`) rather
 * than reassigned — this preserves the original assignee and assigned_at
 * for that issue. The partial unique index uidx_issue_assignments_one_current
 * still guarantees at most one current row per issue even under concurrent
 * calls; the pre-check here just avoids attempting (and failing) an insert
 * for issues we already know are taken.
 */
/** True for a Postgres unique_violation (SQLSTATE 23505) against the
 *  partial unique index that enforces "at most one current assignee per
 *  issue" — see migration/005_assignment_users.sql. */
function isUniqueAssignmentViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * One attempt: SELECT current assignments, then INSERT for whatever's left,
 * inside one transaction. Returns null (instead of throwing) specifically
 * when the INSERT lost a race against a concurrent assignIssues() call for
 * one of the same issue_ids — see the race-condition note on assignIssues()
 * below — so the caller can recompute against fresh state rather than
 * surfacing a misleading generic error for what is actually a legitimate
 * "already assigned" outcome.
 */
async function attemptAssign(
  client: Awaited<ReturnType<typeof getVerifiedClient>>,
  issueIds: string[],
  assigneeId: number,
  assignedByUserId: number | null
): Promise<AssignIssuesResult | null> {
  await client.query("BEGIN");

  const existing = await client.query<{ issue_id: string }>(
    `SELECT issue_id FROM issue_tracking.issue_assignments
     WHERE issue_id = ANY($1::text[]) AND is_current = true`,
    [issueIds]
  );
  const alreadyAssignedIds = existing.rows.map((row) => row.issue_id);
  const alreadyAssignedSet = new Set(alreadyAssignedIds);
  const toAssign = issueIds.filter((id) => !alreadyAssignedSet.has(id));

  let assignedIds: string[] = [];
  if (toAssign.length > 0) {
    try {
      const result = await client.query<{ issue_id: string }>(
        `INSERT INTO issue_tracking.issue_assignments (issue_id, assignee_id, assigned_by, is_current)
         SELECT unnest($1::text[]), $2, $3, true
         RETURNING issue_id`,
        [toAssign, assigneeId, assignedByUserId]
      );
      assignedIds = result.rows.map((row) => row.issue_id);
    } catch (error) {
      if (isUniqueAssignmentViolation(error)) {
        await client.query("ROLLBACK");
        return null;
      }
      throw error;
    }
  }

  await client.query("COMMIT");
  return { assignedIds, alreadyAssignedIds };
}

/**
 * Assigns one or more issues to a single assignee — see assignIssues() doc
 * comment above attemptAssign(). Bounded retry (max 2 attempts): the SELECT
 * "who's already assigned" and the INSERT run as separate statements under
 * READ COMMITTED, so a concurrent assignIssues() call for the same issue_id
 * can commit in between them; uidx_issue_assignments_one_current (the
 * partial unique index — the real source of truth) then rejects our INSERT
 * with a unique_violation instead of silently double-assigning. Previously
 * that violation propagated as a generic "Could not save this assignment"
 * error even though the outcome was actually a legitimate "already
 * assigned" case; retrying once against fresh state resolves it the same
 * way the sequential (non-racing) case already does.
 */
export async function assignIssues(
  issueIds: string[],
  assigneeId: number,
  assignedByUserId: number | null
): Promise<AssignIssuesResult> {
  if (issueIds.length === 0) {
    return { assignedIds: [], alreadyAssignedIds: [] };
  }

  const client = await getVerifiedClient();
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await attemptAssign(client, issueIds, assigneeId, assignedByUserId);
      if (result) {
        return result;
      }
      // result === null: lost the race on attempt 1, already rolled back — retry once.
    }
    // Extremely unlikely (would require losing the race twice in a row);
    // treat every requested issue as already assigned rather than looping
    // forever or throwing a confusing error.
    return { assignedIds: [], alreadyAssignedIds: issueIds };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Everything the Assigned Issues card needs — a superset of the plain
 *  issue-list row, since each card renders the full issue content
 *  (description, root cause, etc.) rather than a table line. */
export interface AssignedIssueCardData {
  issueId: string;
  title: string;
  description: string;
  category: string;
  /** Source: issues.resolution ("Fix & Action Required" on the card). */
  resolution: string | null;
  extraData: Record<string, unknown>;
  status: IssueStatus;
  priority: IssuePriority | null;
  staffName: string;
  createdDate: string;
  assigneeId: number;
  assigneeName: string;
  assignedAt: string;
}

export interface ListAssignedIssuesParams {
  page?: number;
  pageSize?: number;
  assigneeId?: number | null;
  status?: string;
}

export interface ListAssignedIssuesResult {
  issues: AssignedIssueCardData[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const VALID_STATUSES: readonly IssueStatus[] = ["RED", "AMBER", "GREEN"];

interface AssignedIssueRow {
  issue_id: string;
  issue_title: string;
  issue_description: string;
  category: string;
  resolution: string | null;
  extra_data: Record<string, unknown> | null;
  status: IssueStatus;
  priority: IssuePriority | null;
  staff_name: string;
  created_date: string;
  assignee_id: number;
  assignee_name: string;
  assigned_at: string;
  total_count: string;
}

/**
 * Lists currently-assigned issues for the Assigned Issues tab (card view)
 * — only issues with a current row in issue_assignments, excluding
 * soft-deleted issues (same convention as lib/queries/issues.ts's
 * listIssues()).
 */
export async function listAssignedIssues(
  params: ListAssignedIssuesParams = {}
): Promise<ListAssignedIssuesResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  const assigneeId =
    params.assigneeId && Number.isFinite(params.assigneeId) && params.assigneeId > 0 ? params.assigneeId : null;
  const status =
    params.status && (VALID_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as IssueStatus)
      : null;

  const result = await query<AssignedIssueRow>(
    `SELECT
       i.issue_id,
       i.issue_title,
       i.issue_description,
       i.category,
       i.resolution,
       i.extra_data,
       i.status,
       i.priority,
       s.staff_name,
       to_char(i.created_date, 'YYYY-MM-DD') AS created_date,
       au.assignee_id,
       au.assignee_name,
       to_char(ia.assigned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS assigned_at,
       COUNT(*) OVER() AS total_count
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
     WHERE ia.is_current = true
       AND i.deleted_at IS NULL
       AND ($1::int IS NULL OR ia.assignee_id = $1)
       AND ($2::text IS NULL OR i.status = $2)
     ORDER BY ia.assigned_at DESC
     LIMIT $3 OFFSET $4`,
    [assigneeId, status, pageSize, offset]
  );

  const totalCount = result.rows[0] ? Number(result.rows[0].total_count) : 0;

  return {
    issues: result.rows.map((row) => ({
      issueId: row.issue_id,
      title: row.issue_title,
      description: row.issue_description,
      category: row.category,
      resolution: row.resolution,
      extraData: row.extra_data ?? {},
      status: row.status,
      priority: row.priority,
      staffName: row.staff_name,
      createdDate: row.created_date,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      assignedAt: row.assigned_at,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
