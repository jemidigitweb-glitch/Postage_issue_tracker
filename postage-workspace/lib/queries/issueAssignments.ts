import "server-only";

import { getVerifiedClient, query } from "../db";
import { effectiveAssigneeFilter, type IssueAccessScope } from "../access/permissions";
import { escapeLikePattern, type IssuePriority, type IssueStatus, type IssueWorkDetails } from "./issues";

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

/** Assignment may only be changed while an Issue has not been started.
 *
 *  Once work is under way (AMBER) or finished (GREEN), moving it to someone
 *  else would hand over a part-done investigation — or rewrite the owner of a
 *  completed one — so the whole assignment surface is closed at that point.
 *  Enforced HERE, inside the transaction that has the row locked, because the
 *  UI hiding a control is never the guard. */
export const ASSIGNABLE_STATUS = "RED";

export interface AssignIssuesResult {
  /** Issue IDs that had no current assignee and now have one. */
  assignedIds: string[];
  /** Issue IDs that were moved from a DIFFERENT assignee to this one. Their
   *  previous row is kept as history (is_current = false), never deleted. */
  reassignedIds: string[];
  /** Issue IDs already current-assigned to this same person — a no-op, so no
   *  new row is written and assigned_at is preserved. */
  unchangedIds: string[];
  /** Issue IDs left untouched because they are no longer RED. */
  blockedIds: string[];
}

/**
 * Sets the current assignee for one or more issues.
 *
 * Reassignment IS allowed: an issue that already has a current assignee has
 * that row closed (is_current = false — kept as history, never deleted) and a
 * new current row inserted, all in one transaction. Re-selecting the person
 * who already holds it is a deliberate no-op.
 *
 * The partial unique index uidx_issue_assignments_one_current still guarantees
 * at most one current row per issue; the close-then-insert order is what keeps
 * this true at every point.
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

  // Status gate, read from the LOCKED issues rows: only a RED (not started)
  // Issue may have its assignment changed. Anything else is reported back
  // untouched rather than silently skipped.
  const statuses = await client.query<{ issue_id: string; status: string }>(
    `SELECT issue_id, status FROM issue_tracking.issues
     WHERE issue_id = ANY($1::text[]) AND deleted_at IS NULL
     FOR UPDATE`,
    [issueIds]
  );
  const statusByIssue = new Map(statuses.rows.map((row) => [row.issue_id, row.status]));
  const blockedIds = issueIds.filter((id) => statusByIssue.get(id) !== ASSIGNABLE_STATUS);
  const eligibleIds = issueIds.filter((id) => statusByIssue.get(id) === ASSIGNABLE_STATUS);

  // Locked, so a concurrent assign/reassign/unassign for the same issue waits
  // here instead of racing the close-then-insert below.
  const existing = await client.query<{ issue_id: string; assignee_id: number }>(
    `SELECT issue_id, assignee_id FROM issue_tracking.issue_assignments
     WHERE issue_id = ANY($1::text[]) AND is_current = true
     FOR UPDATE`,
    [eligibleIds]
  );
  const currentByIssue = new Map(existing.rows.map((row) => [row.issue_id, Number(row.assignee_id)]));

  const unchangedIds = eligibleIds.filter((id) => currentByIssue.get(id) === assigneeId);
  const toAssign = eligibleIds.filter((id) => currentByIssue.get(id) !== assigneeId);
  const reassignedIds = toAssign.filter((id) => currentByIssue.has(id));

  if (toAssign.length > 0) {
    // Close the outgoing assignment FIRST — the row stays as history.
    await client.query(
      `UPDATE issue_tracking.issue_assignments
          SET is_current = false
        WHERE issue_id = ANY($1::text[]) AND is_current = true`,
      [toAssign]
    );
    try {
      await client.query(
        `INSERT INTO issue_tracking.issue_assignments (issue_id, assignee_id, assigned_by, is_current)
         SELECT unnest($1::text[]), $2, $3, true`,
        [toAssign, assigneeId, assignedByUserId]
      );
    } catch (error) {
      if (isUniqueAssignmentViolation(error)) {
        await client.query("ROLLBACK");
        return null;
      }
      throw error;
    }
  }

  await client.query("COMMIT");
  return {
    assignedIds: toAssign.filter((id) => !currentByIssue.has(id)),
    reassignedIds,
    unchangedIds,
    blockedIds,
  };
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
    return { assignedIds: [], reassignedIds: [], unchangedIds: [], blockedIds: [] };
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
    // report "nothing changed" rather than looping forever or throwing a
    // confusing error.
    return { assignedIds: [], reassignedIds: [], unchangedIds: issueIds, blockedIds: [] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// UNASSIGN
//
// The mirror of assignIssues(): it closes the current assignment and creates
// NOTHING in its place, so the issue ends with zero current rows and drops out
// of every assignee's portal (which reads is_current = true) while remaining
// fully visible to the Super Admin.
//
// It never DELETEs: the closed row stays exactly where it is, with its
// assignee_id and assigned_at intact, so the assignment history is unchanged.
// It touches no other column and no other table — status, priority, progress,
// resolution and Issue content are all outside this statement.
// ---------------------------------------------------------------------------

export interface UnassignIssueResult {
  /** False when the issue already had no current assignee — a no-op, not an error. */
  cleared: boolean;
  /** Who held it, for the confirmation message. Null when nothing was cleared. */
  previousAssigneeId: number | null;
  /** True when the Issue is no longer RED, so its assignment is locked. */
  blockedByStatus: boolean;
}

export async function unassignIssue(issueId: string): Promise<UnassignIssueResult> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    // Same gate as assignIssues(), read from the locked row.
    const issue = await client.query<{ status: string }>(
      `SELECT status FROM issue_tracking.issues
        WHERE issue_id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [issueId]
    );
    if (issue.rows[0]?.status !== ASSIGNABLE_STATUS) {
      await client.query("COMMIT");
      return { cleared: false, previousAssigneeId: null, blockedByStatus: true };
    }

    const current = await client.query<{ assignee_id: number }>(
      `SELECT assignee_id FROM issue_tracking.issue_assignments
       WHERE issue_id = $1 AND is_current = true
       FOR UPDATE`,
      [issueId]
    );
    const previous = current.rows[0];
    if (!previous) {
      await client.query("COMMIT");
      return { cleared: false, previousAssigneeId: null, blockedByStatus: false };
    }

    await client.query(
      `UPDATE issue_tracking.issue_assignments
          SET is_current = false
        WHERE issue_id = $1 AND is_current = true`,
      [issueId]
    );

    await client.query("COMMIT");
    return { cleared: true, previousAssigneeId: Number(previous.assignee_id), blockedByStatus: false };
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
  /** Stage 6 work/implementation details — see IssueWorkDetails. The card
   *  shows the current progress text so an assignee can see what they last
   *  recorded without opening the Issue. Distinct from `resolution` above,
   *  which is the historical intake-time "Fix & Action Required". */
  work: IssueWorkDetails;
}

export interface ListAssignedIssuesParams {
  page?: number;
  pageSize?: number;
  /** The assignee the CLIENT asked for (e.g. `?assignee=3`). Honoured only
   *  for an "all" scope; for an "assignee" scope it is discarded and replaced
   *  with the session-derived id by effectiveAssigneeFilter(). */
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
// Matches the issues_priority_check constraint. Used by the assignee table's
// Priority filter below; an unrecognized value is ignored (treated as "no
// filter") rather than rejected, exactly as listIssues() does.
const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

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
  implementation_progress: string | null;
  implementation_done: string | null;
  final_resolution: string | null;
  process_started_at: string | null;
  completed_at: string | null;
  completed_date: string | null;
  total_count: string;
}

/**
 * Lists currently-assigned issues for the Assigned Issues tab (card view)
 * — only issues with a current row in issue_assignments, excluding
 * soft-deleted issues (same convention as lib/queries/issues.ts's
 * listIssues()).
 */
export async function listAssignedIssues(
  scope: IssueAccessScope,
  params: ListAssignedIssuesParams = {}
): Promise<ListAssignedIssuesResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  // A "none" scope must never reach the database with an open filter — it
  // returns an empty page directly. (effectiveAssigneeFilter() would give
  // null for it, which as an `ia.assignee_id = NULL` comparison also matches
  // nothing, but returning early makes the fail-closed intent explicit and
  // saves the round trip.)
  if (scope.kind === "none") {
    return { issues: [], totalCount: 0, page, pageSize, totalPages: 1 };
  }

  const requestedAssigneeId =
    params.assigneeId && Number.isFinite(params.assigneeId) && params.assigneeId > 0 ? params.assigneeId : null;
  // URL-tampering guard: for an "assignee" scope this discards whatever the
  // client asked for and substitutes the authenticated identity's own id.
  const assigneeId = effectiveAssigneeFilter(scope, requestedAssigneeId);
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
       i.implementation_progress,
       i.implementation_done,
       i.final_resolution,
       to_char(i.process_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS process_started_at,
       to_char(i.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
       to_char(i.completed_date, 'YYYY-MM-DD') AS completed_date,
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
      work: {
        implementationProgress: row.implementation_progress,
        implementationDone: row.implementation_done,
        finalResolution: row.final_resolution,
        processStartedAt: row.process_started_at,
        completedAt: row.completed_at,
        completedDate: row.completed_date,
      },
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// ASSIGNEE PORTAL — Assigned Issues table
//
// A SEPARATE read from listAssignedIssues() above, deliberately not a set of
// extra optional parameters bolted onto it. listAssignedIssues() backs the
// Super Admin's card view and must keep behaving exactly as it does today;
// nothing below is reachable from that path, so the admin list cannot be
// altered by anything in this section.
//
// It is also LEAN: the card view needs description / extra_data / resolution
// to render a whole Issue per row, and a 20-row table pulling every images
// JSON blob for columns it never shows would be wasteful. This selects only
// the columns the table renders.
//
// FAIL-CLOSED: it refuses to run for any scope other than "assignee". There
// is no code path here that can produce an unfiltered result set, so a future
// call site cannot accidentally use it to list somebody else's Issues.
// ---------------------------------------------------------------------------

/** One row of the Assignee's Assigned Issues table. */
export interface AssigneeIssueRow {
  issueId: string;
  title: string;
  /** issue_staff.staff_name — "Raised By". Display only; NEVER an ownership
   *  source (ownership is issue_assignments.assignee_id, see below). */
  staffName: string;
  /** issues.category — the "Domain" column/filter. */
  category: string;
  /** assignment_users.assignee_name for the CURRENT assignment. For an
   *  assignee scope this is always their own name — read-only in the UI. */
  assigneeName: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  /** ISO calendar date (YYYY-MM-DD) — "Date Raised". */
  createdDate: string;
}

export interface ListAssigneeIssuesParams {
  page?: number;
  pageSize?: number;
  /** Matches issue_id or issue_title (case-insensitive, substring). */
  search?: string;
  status?: string;
  /** Matches issues.category exactly (the "Domain" filter). */
  category?: string;
  priority?: string;
  /** Sort key from the URL. Resolved against ASSIGNEE_SORT_COLUMNS below;
   *  anything unrecognized falls back to the default order. */
  sort?: string;
  /** "asc" | "desc" — anything else is treated as "asc". */
  order?: string;
}

export interface ListAssigneeIssuesResult {
  issues: AssigneeIssueRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Sorting whitelist — assignee table only.
//
// SECURITY: the URL's ?sort= value is NEVER interpolated into SQL. It is only
// ever used as a lookup key into this frozen map; an unknown key resolves to
// null and the default ORDER BY is used instead. The values are fixed literals
// written by hand here — no user input reaches them. The direction is narrowed
// to the two literals "ASC"/"DESC" before use. Same discipline as
// ISSUE_SORT_COLUMNS in lib/queries/issues.ts, kept as a separate map so the
// two tables' sortable columns can differ without touching each other.
// ---------------------------------------------------------------------------
const ASSIGNEE_SORT_COLUMNS = Object.freeze({
  issueId: "i.issue_id",
  title: "i.issue_title",
  staff: "s.staff_name",
  domain: "i.category",
  // Workflow order, not alphabetical: RED -> AMBER -> GREEN.
  status: "CASE i.status WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END",
  // low=1 … critical=4, so ascending runs least->most urgent.
  priority:
    "CASE i.priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 WHEN 'critical' THEN 4 ELSE 0 END",
  created: "i.created_date",
} as const);

export type AssigneeIssueSortKey = keyof typeof ASSIGNEE_SORT_COLUMNS;

/** Default when no (or an unrecognized) sort key is supplied: most recently
 *  assigned first, matching the card view this table replaces. */
const ASSIGNEE_DEFAULT_ORDER_BY = "ia.assigned_at DESC, i.issue_id DESC";

function buildAssigneeOrderBy(sort: string | undefined, order: string | undefined): string {
  const column =
    sort && Object.prototype.hasOwnProperty.call(ASSIGNEE_SORT_COLUMNS, sort)
      ? ASSIGNEE_SORT_COLUMNS[sort as AssigneeIssueSortKey]
      : null;
  if (!column) {
    return ASSIGNEE_DEFAULT_ORDER_BY;
  }
  const direction = order === "desc" ? "DESC" : "ASC";
  // issue_id tiebreaker keeps paging stable when the sort column has ties.
  return `${column} ${direction} NULLS LAST, i.issue_id ASC`;
}

interface AssigneeIssueQueryRow {
  issue_id: string;
  issue_title: string;
  staff_name: string;
  category: string;
  assignee_name: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  created_date: string;
  total_count: string;
}

/**
 * The Assignee's own currently-assigned Issues, with search, filters,
 * whitelisted sorting and pagination.
 *
 * OWNERSHIP: the assignee id comes from `scope`, which lib/auth.ts resolves
 * from the session as
 *   management_users.user_id -> assignment_users.user_id
 *   -> assignment_users.assignee_id -> issue_assignments.assignee_id
 * with is_current = true. issue_staff / "Raised By" is never consulted. No
 * client-supplied assignee value exists on this path at all — there is no
 * parameter to tamper with, and any ?assignee= in the URL is simply not read.
 *
 * Returns an empty page for any scope other than "assignee" rather than
 * widening: "all" and "none" both get nothing, so this function can never
 * become a second way to list every Issue.
 */
export async function listAssigneeIssues(
  scope: IssueAccessScope,
  params: ListAssigneeIssuesParams = {}
): Promise<ListAssigneeIssuesResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  if (scope.kind !== "assignee") {
    return { issues: [], totalCount: 0, page, pageSize, totalPages: 1 };
  }
  const assigneeId = scope.assigneeId;

  const trimmedSearch = params.search?.trim();
  const search = trimmedSearch ? escapeLikePattern(trimmedSearch) : null;
  const status =
    params.status && (VALID_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as IssueStatus)
      : null;
  const category = params.category?.trim() || null;
  const priority =
    params.priority && (VALID_PRIORITIES as readonly string[]).includes(params.priority)
      ? (params.priority as IssuePriority)
      : null;
  // Resolved from the frozen whitelist above — never from raw input.
  const orderBy = buildAssigneeOrderBy(params.sort, params.order);

  const result = await query<AssigneeIssueQueryRow>(
    `SELECT
       i.issue_id,
       i.issue_title,
       s.staff_name,
       i.category,
       au.assignee_name,
       i.status,
       i.priority,
       to_char(i.created_date, 'YYYY-MM-DD') AS created_date,
       COUNT(*) OVER() AS total_count
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
     WHERE ia.is_current = true
       AND ia.assignee_id = $1
       AND i.deleted_at IS NULL
       AND ($2::text IS NULL OR i.issue_id ILIKE '%' || $2 || '%' ESCAPE '\\' OR i.issue_title ILIKE '%' || $2 || '%' ESCAPE '\\')
       AND ($3::text IS NULL OR i.status = $3)
       AND ($4::text IS NULL OR i.category = $4)
       AND ($5::text IS NULL OR i.priority = $5)
     ORDER BY ${orderBy}
     LIMIT $6 OFFSET $7`,
    [assigneeId, search, status, category, priority, pageSize, offset]
  );

  const totalCount = result.rows[0] ? Number(result.rows[0].total_count) : 0;

  return {
    issues: result.rows.map((row) => ({
      issueId: row.issue_id,
      title: row.issue_title,
      staffName: row.staff_name,
      category: row.category,
      assigneeName: row.assignee_name,
      status: row.status,
      priority: row.priority,
      createdDate: row.created_date,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/**
 * The distinct Domain values across THIS assignee's current assignments —
 * used to populate their Domain filter. Deliberately not listCategories()
 * from lib/queries/issues.ts, which returns every domain in the system and
 * would let an assignee infer the shape of Issues they cannot see.
 */
export async function listAssigneeCategories(scope: IssueAccessScope): Promise<string[]> {
  if (scope.kind !== "assignee") {
    return [];
  }

  const result = await query<{ category: string }>(
    `SELECT DISTINCT i.category
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     WHERE ia.is_current = true
       AND ia.assignee_id = $1
       AND i.deleted_at IS NULL
     ORDER BY i.category`,
    [scope.assigneeId]
  );

  return result.rows.map((row) => row.category);
}
