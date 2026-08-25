import "server-only";

import { getVerifiedClient, query } from "../db";
import { issueScopeQueryArgs, type IssueAccessScope } from "../access/permissions";

// Queries against issue_tracking.issues, joined to issue_tracking.issue_staff
// for the staff name. Never a DELETE statement anywhere in this file —
// "deletion" is soft (deleted_at/deleted_by columns, see
// migration/004_soft_delete.sql); issue rows are never physically removed.
// An ACTIVE Issue's issue_id is never altered or renumbered. The one
// exception lives entirely inside issue_tracking.next_issue_id() (database
// function, see migration/017_issue_id_gap_reuse.sql): a soft-deleted Issue
// with zero related rows anywhere may have its issue_id silently archived so
// its released number can be handed to a brand-new Issue — nothing in this
// file issues that rename directly.
//
// ── ACCESS SCOPE (Stage 3) ──────────────────────────────────────────────────
// Every read in this file that can return an Issue takes an IssueAccessScope
// as a REQUIRED argument — deliberately not optional and not defaulted, so a
// new call site cannot silently get unrestricted access by forgetting it.
// The scope is resolved server-side from the session (lib/auth.ts's
// getIssueAccessScope) and is never taken from a query parameter, a form
// field, or any other client-controlled input.
//
// The predicate is identical everywhere:
//
//   AND ($u::boolean OR EXISTS (
//         SELECT 1 FROM issue_tracking.issue_assignments sa
//         WHERE sa.issue_id = <issue> AND sa.is_current = true
//           AND sa.assignee_id = $a::int))
//
// with $u/$a from issueScopeQueryArgs(). A "none" scope binds $u = false and
// $a = NULL; `assignee_id = NULL` is never true, so the fail-closed case
// returns zero rows through the same code path as everything else.
//
// Ownership is defined ONLY by a current row in issue_assignments.
// issue_staff ("Raised By") is never used as an ownership source.

/** The scope predicate, parameterized. `issueColumn` is a hard-coded column
 *  reference supplied by the CALLING MODULE only — never user input.
 *
 *  Exported (Stage 6) so lib/queries/issueWorkProgress.ts scopes its reads
 *  with the identical predicate rather than hand-rolling a second copy that
 *  could drift. Every caller must keep passing a literal column reference. */
export function scopePredicate(
  issueColumn: string,
  unrestrictedParam: number,
  assigneeParam: number
): string {
  return `($${unrestrictedParam}::boolean OR EXISTS (
            SELECT 1 FROM issue_tracking.issue_assignments sa
            WHERE sa.issue_id = ${issueColumn}
              AND sa.is_current = true
              AND sa.assignee_id = $${assigneeParam}::int))`;
}

export type IssueStatus = "RED" | "AMBER" | "GREEN";
export type IssuePriority = "critical" | "high" | "medium" | "low";

// Matches the CHECK constraints in migration/001_create_tables.sql exactly.
const VALID_STATUSES: readonly IssueStatus[] = ["RED", "AMBER", "GREEN"];
const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

export interface IssueListItem {
  issueId: string;
  title: string;
  /** issue_tracking.issues.issue_description. The list does NOT render it as a
   *  column — it is carried only so a Mobile Issue whose stored title is the
   *  old generated stamp can show the worker's own first line instead of a
   *  blank cell (lib/access/mobileEvidence.ts displayIssueTitle). */
  description: string;
  staffCode: string;
  staffName: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  /** issue_tracking.issues.category — the "Domain" column/filter. */
  category: string;
  /** ISO calendar date (YYYY-MM-DD) — formatted in SQL to avoid `pg`'s
   *  DATE-to-JS-Date local-timezone conversion gotcha. */
  createdDate: string;
  /** Who the issue is currently assigned to, via issue_tracking.issue_assignments
   *  (the Rajive/Mayurika/Arun/Suman "Assign To" system) — distinct from
   *  `staffName` (who raised it). Null if unassigned. */
  assignedStaffName: string | null;
}

export interface ListIssuesParams {
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /** Matches against issue_id or issue_title (case-insensitive, substring). */
  search?: string;
  staffCode?: string;
  status?: string;
  priority?: string;
  /** Matches issue_tracking.issues.category exactly (the "Domain" filter). */
  category?: string;
  /** false (default): only non-deleted issues. true: only soft-deleted
   *  issues — never both mixed together. */
  showDeleted?: boolean;
  /** Sort key from the URL. Resolved against ISSUE_SORT_COLUMNS below;
   *  anything unrecognized falls back to the default order. */
  sort?: string;
  /** "asc" | "desc" — anything else is treated as "asc". */
  order?: string;
}

// ---------------------------------------------------------------------------
// Sorting whitelist.
//
// SECURITY: the URL's ?sort= value is NEVER interpolated into SQL. It is only
// ever used as a lookup key into this frozen map; an unknown key resolves to
// null and the default ORDER BY is used instead. The values below are fixed
// literals written by hand in this file — no user input reaches them. The
// direction is likewise narrowed to the two literals "ASC"/"DESC" before use.
// This is the only safe way to do dynamic ordering, since PostgreSQL cannot
// parameterise an ORDER BY expression.
// ---------------------------------------------------------------------------
const ISSUE_SORT_COLUMNS = Object.freeze({
  issueId: "i.issue_id",
  title: "i.issue_title",
  staff: "s.staff_name",
  assigned: "au.assignee_name",
  domain: "i.category",
  created: "i.created_date",
  // extra_data is JSONB; ->> yields text. Present so ?sort=member works even
  // though the list table has no Member column of its own.
  member: "i.extra_data->>'member'",
  // Workflow order, not alphabetical: RED -> AMBER -> GREEN. Alphabetical
  // would give AMBER, GREEN, RED, which is meaningless to an operator.
  status: "CASE i.status WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END",
  // "Priority Score": low=1 … critical=4, so ascending runs least→most urgent
  // and descending puts critical first.
  priority:
    "CASE i.priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 WHEN 'critical' THEN 4 ELSE 0 END",
} as const);

export type IssueSortKey = keyof typeof ISSUE_SORT_COLUMNS;

/** The default applied when no (or an unrecognized) sort key is supplied —
 *  identical to the ordering this query used before sorting existed. */
const ISSUE_DEFAULT_ORDER_BY = "i.created_date DESC, i.issue_id DESC";

function buildIssueOrderBy(sort: string | undefined, order: string | undefined): string {
  const column = sort && Object.prototype.hasOwnProperty.call(ISSUE_SORT_COLUMNS, sort)
    ? ISSUE_SORT_COLUMNS[sort as IssueSortKey]
    : null;
  if (!column) {
    return ISSUE_DEFAULT_ORDER_BY;
  }
  const direction = order === "desc" ? "DESC" : "ASC";
  // issue_id tiebreaker keeps paging stable when the sort column has ties.
  return `${column} ${direction} NULLS LAST, i.issue_id ASC`;
}

export interface ListIssuesResult {
  issues: IssueListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  showDeleted: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// issue_id is VARCHAR(20), always "<staff_code>-<digits>" in practice (see
// issue_tracking.next_issue_id() in migration/002_issue_management_system.sql
// and the historical seed data in migration/001_create_tables.sql). Used to
// reject obviously-malformed input before it ever reaches a query — lets
// the detail page distinguish "Invalid Issue ID" from "Issue not found"
// instead of treating every non-match the same way.
//
// An ARCHIVED row (see migration/017_issue_id_gap_reuse.sql — a soft-deleted,
// childless Issue whose number has been released back for reuse) instead
// holds "<staff_code>-<digits>~released~<epoch_ms>", which this pattern
// deliberately does NOT match — an archived row is never a valid lookup
// target from the UI.
const ISSUE_ID_PATTERN = /^[A-Za-z0-9]{1,10}-[0-9]+$/;

export function isValidIssueId(issueId: string): boolean {
  return issueId.length <= 20 && ISSUE_ID_PATTERN.test(issueId);
}

export interface IssueDetail {
  issueId: string;
  title: string;
  description: string;
  staffCode: string;
  staffName: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  /** issue_tracking.issues.category — the "Domain" field. */
  category: string;
  createdDate: string;
  /** ISO timestamp (UTC) — null only if the column is somehow null; the
   *  column itself is NOT NULL DEFAULT now() in the schema. */
  updatedAt: string | null;
  /** Free-form JSONB captured by the historical migration (member,
   *  rootCause, whatIsHappening, documentGap, dataLink, and any
   *  pre-normalization original* values) — shape varies per row. Display
   *  only; never written back. */
  extraData: Record<string, unknown>;
  /** ISO timestamp (UTC), or null if not deleted. See
   *  migration/004_soft_delete.sql. */
  deletedAt: string | null;
  /** issue_tracking.issues.resolution — the historical intake-time
   *  "Fix & Action Required" text. NOT the Stage 6 outcome: that is
   *  work.finalResolution below, and this column is never written by the
   *  work-progress workflow.
   *
   *  Rendered only where a caller explicitly asks for it (the Assignee
   *  detail view). components/issues/IssueDetail.tsx does not display it by
   *  default, so the Super Admin's detail page output is unchanged. */
  resolution: string | null;
  // ── Work / implementation details (Stage 6) ──────────────────────────────
  // Source: the five columns added by migration/012_issue_work_details.sql,
  // plus the pre-existing (previously unused) issues.completed_date. All are
  // null on an Issue where work has not started. Read-only here; every write
  // goes through lib/queries/issueStatus.ts or lib/queries/issueWorkProgress.ts,
  // which enforce ownership and atomicity.
  //
  // NOT to be confused with `resolution` above — that is the historical
  // intake-time "Fix & Action Required" text and is never written by the
  // Stage 6 workflow.
  work: IssueWorkDetails;
}

/** The Stage 6 "WORK PROGRESS" block for one Issue. */
export interface IssueWorkDetails {
  /** Current "Implementation In Progress" text (RED -> AMBER, refreshed by
   *  later progress updates). Superseded values are preserved in the work
   *  log — see lib/queries/issueWorkProgress.ts. */
  implementationProgress: string | null;
  /** "Implementation Done" — what was actually fixed (set on -> GREEN). */
  implementationDone: string | null;
  /** "Final Resolution" — the outcome and why it is considered solved
   *  (set on -> GREEN). */
  finalResolution: string | null;
  /** ISO timestamp (UTC) when work started, or null if not started. */
  processStartedAt: string | null;
  /** ISO timestamp (UTC) when the Issue was completed, or null. */
  completedAt: string | null;
  /** ISO calendar date (YYYY-MM-DD) of completion — the pre-existing
   *  issues.completed_date column, written alongside completedAt. */
  completedDate: string | null;
}

export interface AdjacentIssueIds {
  previousId: string | null;
  nextId: string | null;
}

interface IssueDetailRow {
  issue_id: string;
  issue_title: string;
  issue_description: string;
  staff_code: string;
  staff_name: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  category: string;
  created_date: string;
  updated_at: string | null;
  extra_data: Record<string, unknown> | null;
  deleted_at: string | null;
  resolution: string | null;
  implementation_progress: string | null;
  implementation_done: string | null;
  final_resolution: string | null;
  process_started_at: string | null;
  completed_at: string | null;
  completed_date: string | null;
}

interface IssueRow {
  issue_id: string;
  issue_title: string;
  issue_description: string;
  staff_code: string;
  staff_name: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  category: string;
  created_date: string;
  assigned_staff_name: string | null;
  total_count: string;
}

/** Escapes ILIKE wildcard characters so a search term like "50%" or "a_b" is
 *  matched literally rather than as a pattern.
 *
 *  Exported (Assignee Portal stage) so the assignee list in
 *  lib/queries/issueAssignments.ts escapes search input exactly the same way
 *  rather than growing a second, divergent copy. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (!value) {
    return null;
  }
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Lists issues with server-side pagination, search, and filtering. Unknown
 * or invalid `status`/`priority` values are silently ignored (treated as
 * "no filter") rather than rejected — this endpoint is read-only, so an
 * unrecognized filter value can never cause a wrong write, only a wider
 * result set than intended.
 */
export async function listIssues(
  scope: IssueAccessScope,
  params: ListIssuesParams = {}
): Promise<ListIssuesResult> {
  const { unrestricted, assigneeId: scopeAssigneeId } = issueScopeQueryArgs(scope);
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  const trimmedSearch = params.search?.trim();
  const search = trimmedSearch ? escapeLikePattern(trimmedSearch) : null;
  const staffCode = params.staffCode?.trim() || null;
  const status = normalizeEnum(params.status, VALID_STATUSES);
  const priority = normalizeEnum(params.priority, VALID_PRIORITIES);
  const category = params.category?.trim() || null;
  const showDeleted = params.showDeleted ?? false;
  // Resolved from the frozen whitelist above — never from raw input.
  const orderBy = buildIssueOrderBy(params.sort, params.order);

  const result = await query<IssueRow>(
    `SELECT
       i.issue_id,
       i.issue_title,
       -- DISPLAY ONLY, and only for a Mobile Issue whose stored title is the
       -- old generated stamp: components/issues/IssueTable.tsx recovers the
       -- worker's first line from it (lib/access/mobileEvidence.ts
       -- displayIssueTitle). The list renders no description of its own.
       i.issue_description,
       i.staff_code,
       s.staff_name,
       i.status,
       i.priority,
       i.category,
       to_char(i.created_date, 'YYYY-MM-DD') AS created_date,
       au.assignee_name AS assigned_staff_name,
       COUNT(*) OVER() AS total_count
     FROM issue_tracking.issues i
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     LEFT JOIN issue_tracking.issue_assignments ia ON ia.issue_id = i.issue_id AND ia.is_current = true
     LEFT JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
     WHERE
       ($1::text IS NULL OR i.issue_id ILIKE '%' || $1 || '%' ESCAPE '\\' OR i.issue_title ILIKE '%' || $1 || '%' ESCAPE '\\')
       AND ($2::text IS NULL OR i.staff_code = $2)
       AND ($3::text IS NULL OR i.status = $3)
       AND ($4::text IS NULL OR i.priority = $4)
       AND (($7::boolean AND i.deleted_at IS NOT NULL) OR (NOT $7::boolean AND i.deleted_at IS NULL))
       AND ($8::text IS NULL OR i.category = $8)
       AND ${scopePredicate("i.issue_id", 9, 10)}
     ORDER BY ${orderBy}
     LIMIT $5 OFFSET $6`,
    [
      search,
      staffCode,
      status,
      priority,
      pageSize,
      offset,
      showDeleted,
      category,
      unrestricted,
      scopeAssigneeId,
    ]
  );

  const totalCount = result.rows[0] ? Number(result.rows[0].total_count) : 0;

  return {
    issues: result.rows.map((row) => ({
      issueId: row.issue_id,
      title: row.issue_title,
      description: row.issue_description,
      staffCode: row.staff_code,
      staffName: row.staff_name,
      status: row.status,
      priority: row.priority,
      category: row.category,
      createdDate: row.created_date,
      assignedStaffName: row.assigned_staff_name,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    showDeleted,
  };
}

/**
 * Lists the distinct `category` values ("Domain") in use across non-deleted
 * issues — used to populate the Domain filter dropdown on the issue list.
 * Read-only; no schema change (category is the historical "domain" field,
 * see migration/001_create_tables.sql).
 */
export async function listCategories(): Promise<string[]> {
  const result = await query<{ category: string }>(
    `SELECT DISTINCT category
     FROM issue_tracking.issues
     WHERE deleted_at IS NULL
     ORDER BY category`
  );

  return result.rows.map((row) => row.category);
}

/**
 * Fetches a single issue by its exact issue_id, joined to issue_staff for
 * the staff name. Returns null if no row matches — callers distinguish
 * "not found" from "invalid format" by calling isValidIssueId() first (this
 * function does not validate the shape of `issueId` itself; it just runs a
 * parameterized exact-match query, which is safe against any input).
 *
 * `includeDeleted` defaults to false, matching every other read in this
 * file. The issue detail PAGE passes `true` deliberately — it's the one
 * place a soft-deleted issue must still be viewable, so it can show the
 * Deleted badge and Restore action.
 */
export async function getIssueById(
  issueId: string,
  scope: IssueAccessScope,
  options: { includeDeleted?: boolean } = {}
): Promise<IssueDetail | null> {
  const includeDeleted = options.includeDeleted ?? false;
  const { unrestricted, assigneeId } = issueScopeQueryArgs(scope);

  const result = await query<IssueDetailRow>(
    `SELECT
       i.issue_id,
       i.issue_title,
       i.issue_description,
       i.staff_code,
       s.staff_name,
       i.status,
       i.priority,
       i.category,
       to_char(i.created_date, 'YYYY-MM-DD') AS created_date,
       to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
       i.extra_data,
       to_char(i.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deleted_at,
       i.resolution,
       i.implementation_progress,
       i.implementation_done,
       i.final_resolution,
       to_char(i.process_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS process_started_at,
       to_char(i.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
       to_char(i.completed_date, 'YYYY-MM-DD') AS completed_date
     FROM issue_tracking.issues i
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     WHERE i.issue_id = $1
       AND ($2::boolean OR i.deleted_at IS NULL)
       AND ${scopePredicate("i.issue_id", 3, 4)}
     LIMIT 1`,
    [issueId, includeDeleted, unrestricted, assigneeId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    issueId: row.issue_id,
    title: row.issue_title,
    description: row.issue_description,
    staffCode: row.staff_code,
    staffName: row.staff_name,
    status: row.status,
    priority: row.priority,
    category: row.category,
    createdDate: row.created_date,
    updatedAt: row.updated_at,
    extraData: row.extra_data ?? {},
    deletedAt: row.deleted_at,
    resolution: row.resolution,
    work: {
      implementationProgress: row.implementation_progress,
      implementationDone: row.implementation_done,
      finalResolution: row.final_resolution,
      processStartedAt: row.process_started_at,
      completedAt: row.completed_at,
      completedDate: row.completed_date,
    },
  };
}

/**
 * Finds the issue_id immediately before and after the given one, ordered
 * lexicographically by issue_id (matches the column's own btree primary-key
 * index — no separate ORDER BY column needed, no extra index required).
 * Does not assume the given issueId exists; if it doesn't, this still
 * returns the nearest neighbors on either side, which is harmless since the
 * detail page only renders these as "Previous"/"Next" links.
 */
export async function getAdjacentIssueIds(
  issueId: string,
  scope: IssueAccessScope
): Promise<AdjacentIssueIds> {
  const { unrestricted, assigneeId } = issueScopeQueryArgs(scope);

  // Scoped identically to the list and the detail page: an assignee can only
  // ever step to another Issue that is currently assigned to them, so
  // Previous/Next can never be used to discover someone else's issue_id.
  const [previousResult, nextResult] = await Promise.all([
    // The `i` alias is REQUIRED, not cosmetic: an unqualified `issue_id`
    // inside the EXISTS subquery would resolve to the subquery's own
    // issue_tracking.issue_assignments.issue_id column, making the
    // correlation `sa.issue_id = sa.issue_id` — trivially true, and the
    // scope filter would silently do nothing. Always correlate on i.issue_id.
    query<{ issue_id: string }>(
      `SELECT i.issue_id FROM issue_tracking.issues i
       WHERE i.issue_id < $1 AND i.deleted_at IS NULL
         AND ${scopePredicate("i.issue_id", 2, 3)}
       ORDER BY i.issue_id DESC
       LIMIT 1`,
      [issueId, unrestricted, assigneeId]
    ),
    query<{ issue_id: string }>(
      `SELECT i.issue_id FROM issue_tracking.issues i
       WHERE i.issue_id > $1 AND i.deleted_at IS NULL
         AND ${scopePredicate("i.issue_id", 2, 3)}
       ORDER BY i.issue_id ASC
       LIMIT 1`,
      [issueId, unrestricted, assigneeId]
    ),
  ]);

  return {
    previousId: previousResult.rows[0]?.issue_id ?? null,
    nextId: nextResult.rows[0]?.issue_id ?? null,
  };
}

export interface CreateIssueInput {
  staffCode: string;
  title: string;
  description: string;
  category: string;
  priority: IssuePriority | null;
  /** issues.resolution — the historical intake-time "Fix & Action Required".
   *  Optional. NOT final_resolution, which is the Stage 6 completion outcome
   *  and is written only by the work-progress workflow. */
  resolution?: string | null;
  /** Anything collected by the form that doesn't map to a real column. */
  extraData?: Record<string, unknown>;
}

/** Thrown when staffCode doesn't exist in issue_staff, or exists but is inactive. */
export class InvalidStaffError extends Error {}

/**
 * Creates exactly one new issue. issue_id is allocated server-side via the
 * existing issue_tracking.next_issue_id(staff_code) function (see
 * migration/002_issue_management_system.sql, self-healing as of
 * migration/006_next_issue_id_lazy_counter.sql — a staff_code added after
 * migration 002's original seed no longer needs any manual counter setup).
 * next_issue_id() is atomic and concurrency-safe. ID allocation + INSERT run
 * in one transaction so a failed insert can never burn a number silently.
 *
 * As of migration/017_issue_id_gap_reuse.sql, next_issue_id() may return a
 * previously-issued number instead of a brand-new one: if a soft-deleted,
 * childless Issue (no comments/status-history/assignment-history/
 * discussion links — see the migration for the full eligibility rule) holds
 * a released number for this staff_code, that number is reused here and the
 * old row is archived (renamed) under the hood, never renumbered visibly and
 * never hard-deleted. An ACTIVE Issue's issue_id, or any Issue that has ever
 * had activity recorded against it, is never touched or renumbered.
 *
 * New issues always start at status 'RED' — not a caller-supplied value.
 */
/**
 * The STATEMENTS of createIssue(), with no transaction control of its own.
 *
 * Extracted verbatim so a second caller (Warehouse Mobile Lite, which must
 * take an advisory lock and check for an existing Issue in the SAME
 * transaction) can reuse the exact creation rules instead of duplicating them:
 * the staff validation, issue_tracking.next_issue_id(), the hard-coded 'RED',
 * CURRENT_DATE, and the extra_data write all live here and nowhere else.
 *
 * BEHAVIOUR IS UNCHANGED for the desktop path — createIssue() below simply
 * wraps this in the BEGIN/COMMIT/ROLLBACK it always had. This function must
 * never issue BEGIN, COMMIT or ROLLBACK itself; its caller owns them.
 */
export async function createIssueTx(
  client: Awaited<ReturnType<typeof getVerifiedClient>>,
  input: CreateIssueInput
): Promise<string> {
  // Validate staffCode exists and is active *before* allocating an issue
  // ID for it — catches both an unknown code and a deactivated one with a
  // clear message, rather than letting an unknown code fail later as an
  // opaque FK violation on the issues insert.
  const staffCheck = await client.query<{ active: boolean }>(
    `SELECT active FROM issue_tracking.issue_staff WHERE staff_code = $1`,
    [input.staffCode]
  );
  const staffRow = staffCheck.rows[0];
  if (!staffRow) {
    throw new InvalidStaffError(`Unknown staff code "${input.staffCode}".`);
  }
  if (!staffRow.active) {
    throw new InvalidStaffError(`Staff code "${input.staffCode}" is not active.`);
  }

  const idResult = await client.query<{ next_issue_id: string }>(
    "SELECT issue_tracking.next_issue_id($1) AS next_issue_id",
    [input.staffCode]
  );
  const issueId = idResult.rows[0]?.next_issue_id;
  if (!issueId) {
    throw new Error(`Could not allocate an issue ID for staff_code "${input.staffCode}".`);
  }

  await client.query(
    `INSERT INTO issue_tracking.issues
       (issue_id, staff_code, issue_title, issue_description, category, status, priority, resolution, created_date, extra_data)
     VALUES ($1, $2, $3, $4, $5, 'RED', $6, $7, CURRENT_DATE, $8::jsonb)`,
    [
      issueId,
      input.staffCode,
      input.title,
      input.description,
      input.category,
      input.priority,
      input.resolution ?? null,
      JSON.stringify(input.extraData ?? {}),
    ]
  );

  return issueId;
}

export async function createIssue(input: CreateIssueInput): Promise<string> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    // Validate staffCode exists and is active *before* allocating an issue
    // ID for it — catches both an unknown code and a deactivated one with a
    // clear message, rather than letting an unknown code fail later as an
    // opaque FK violation on the issues insert (or, previously, an
    // even-more-opaque next_issue_id() failure).
    const staffCheck = await client.query<{ active: boolean }>(
      `SELECT active FROM issue_tracking.issue_staff WHERE staff_code = $1`,
      [input.staffCode]
    );
    const staffRow = staffCheck.rows[0];
    if (!staffRow) {
      throw new InvalidStaffError(`Unknown staff code "${input.staffCode}".`);
    }
    if (!staffRow.active) {
      throw new InvalidStaffError(`Staff code "${input.staffCode}" is not active.`);
    }

    const idResult = await client.query<{ next_issue_id: string }>(
      "SELECT issue_tracking.next_issue_id($1) AS next_issue_id",
      [input.staffCode]
    );
    const issueId = idResult.rows[0]?.next_issue_id;
    if (!issueId) {
      throw new Error(`Could not allocate an issue ID for staff_code "${input.staffCode}".`);
    }

    await client.query(
      `INSERT INTO issue_tracking.issues
         (issue_id, staff_code, issue_title, issue_description, category, status, priority, resolution, created_date, extra_data)
       VALUES ($1, $2, $3, $4, $5, 'RED', $6, $7, CURRENT_DATE, $8::jsonb)`,
      [
        issueId,
        input.staffCode,
        input.title,
        input.description,
        input.category,
        input.priority,
        input.resolution ?? null,
        JSON.stringify(input.extraData ?? {}),
      ]
    );

    await client.query("COMMIT");
    return issueId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** What createMobileIssue() did: a fresh Issue, or the one this submission
 *  already created. */
export interface MobileIssueResult {
  issueId: string;
  /** True when an earlier attempt with the same submission id had already
   *  committed — nothing was inserted this time. */
  alreadyRegistered: boolean;
}

/**
 * Creates the ONE Issue for a Warehouse Mobile Lite submission — idempotently.
 *
 * ── ONE REGISTER PRESS = ONE ISSUE ──────────────────────────────────────────
 * Inside a single transaction:
 *   1. pg_advisory_xact_lock(hashtext(submissionId)) — a BUILT-IN lock needing
 *      no table and no migration. Two simultaneous submissions of the same
 *      report serialise here; the lock is released automatically at COMMIT or
 *      ROLLBACK.
 *   2. look for an Issue already carrying this submission id in extra_data. If
 *      one exists, RETURN ITS ID and insert nothing — which is exactly what a
 *      retry after a lost response needs.
 *   3. otherwise delegate to createIssueTx(), so the Issue ID, the 'RED'
 *      status, the timestamps and the insert rules are the SAME code the
 *      desktop uses.
 *
 * No schema change, no unique constraint and no migration is required: the
 * advisory lock provides the mutual exclusion, and the lookup is a trivial
 * scan at this data volume.
 *
 * An unknown or inactive staff code raises InvalidStaffError from
 * createIssueTx() — Mobile Lite relies on that to fail cleanly when the
 * Warehouse Mobile reporter row has not been created yet, rather than
 * substituting some other staff code.
 */
export async function createMobileIssue(input: {
  submissionId: string;
  staffCode: string;
  title: string;
  description: string;
  category: string;
  extraData: Record<string, unknown>;
}): Promise<MobileIssueResult> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.submissionId]);

    const existing = await client.query<{ issue_id: string }>(
      `SELECT issue_id FROM issue_tracking.issues
        WHERE extra_data->>'mobileSubmissionId' = $1
        LIMIT 1`,
      [input.submissionId]
    );
    const already = existing.rows[0]?.issue_id;
    if (already) {
      await client.query("COMMIT");
      return { issueId: already, alreadyRegistered: true };
    }

    const issueId = await createIssueTx(client, {
      staffCode: input.staffCode,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: null,
      resolution: null,
      extraData: input.extraData,
    });

    await client.query("COMMIT");
    return { issueId, alreadyRegistered: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Soft-deletes one or more issues: sets deleted_at/deleted_by on
 * issue_tracking.issues. No DELETE statement anywhere, no other table is
 * touched — assignments, history, and comments are all preserved
 * untouched, and issue_id is never altered. Already-deleted issues in the
 * list are simply left alone (idempotent, not an error). One transaction;
 * any failure rolls back the whole batch.
 */
export async function softDeleteIssues(issueIds: string[], deletedByUserId: number): Promise<string[]> {
  if (issueIds.length === 0) {
    return [];
  }

  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ issue_id: string }>(
      `UPDATE issue_tracking.issues
       SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $2
       WHERE issue_id = ANY($1::text[]) AND deleted_at IS NULL
       RETURNING issue_id`,
      [issueIds, deletedByUserId]
    );

    await client.query("COMMIT");
    return result.rows.map((row) => row.issue_id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Restores one or more soft-deleted issues: clears deleted_at/deleted_by.
 * Already-active issues in the list are simply left alone. One
 * transaction; any failure rolls back the whole batch.
 */
export async function restoreIssues(issueIds: string[]): Promise<string[]> {
  if (issueIds.length === 0) {
    return [];
  }

  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ issue_id: string }>(
      `UPDATE issue_tracking.issues
       SET deleted_at = NULL, deleted_by = NULL
       WHERE issue_id = ANY($1::text[]) AND deleted_at IS NOT NULL
       RETURNING issue_id`,
      [issueIds]
    );

    await client.query("COMMIT");
    return result.rows.map((row) => row.issue_id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateIssueDetailsInput {
  title: string;
  description: string;
  /** issues.category — the "Domain" field. */
  category: string;
  priority: IssuePriority | null;
  /** issues.resolution — the historical intake-time "Fix & Action Required".
   *  NOT final_resolution, which the work-progress workflow owns exclusively. */
  resolution: string | null;
  /** Full replacement for issues.extra_data — the caller (edit-actions.ts)
   *  builds this by merging any edited fields on top of the EXISTING value,
   *  so every key this function does not know about (images, attachments,
   *  intake metadata, anything not rendered as an editable input) is carried
   *  over unchanged. This function never merges; it writes exactly what it
   *  is given. */
  extraData: Record<string, unknown>;
}

/**
 * Updates the normal, editable fields of exactly one Issue: Title,
 * Description, Domain, Priority, Fix & Action Required, and the editable
 * subset of extra_data (Additional details).
 *
 * Deliberately NEVER touches: issue_id, staff_code, status, created_date,
 * created_at, deleted_at/deleted_by, or any of the Stage 6 work-progress
 * columns (implementation_progress, implementation_done, final_resolution,
 * process_started_at, completed_at, completed_date) — those belong to their
 * own dedicated workflows (status-actions.ts, assign-actions.ts,
 * delete-actions.ts) and this function has no path that writes to them.
 *
 * WHERE ... AND deleted_at IS NULL means a soft-deleted Issue can never be
 * edited through this function — editing history that has already been
 * removed from the active list is not a supported operation. Returns false
 * (no row matched) rather than throwing, so the caller can distinguish
 * "nothing to update" from a real database error.
 */
export async function updateIssueDetails(
  issueId: string,
  input: UpdateIssueDetailsInput
): Promise<boolean> {
  const result = await query(
    `UPDATE issue_tracking.issues
     SET issue_title = $2,
         issue_description = $3,
         category = $4,
         priority = $5,
         resolution = $6,
         extra_data = $7,
         updated_at = now()
     WHERE issue_id = $1 AND deleted_at IS NULL
     RETURNING issue_id`,
    [
      issueId,
      input.title,
      input.description,
      input.category,
      input.priority,
      input.resolution,
      JSON.stringify(input.extraData),
    ]
  );
  return (result.rowCount ?? 0) > 0;
}
