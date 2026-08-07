import "server-only";

import { getVerifiedClient, query } from "../db";

// Queries against issue_tracking.issues, joined to issue_tracking.issue_staff
// for the staff name. Never a DELETE statement anywhere in this file —
// "deletion" is soft (deleted_at/deleted_by columns, see
// migration/004_soft_delete.sql); issue rows are never physically removed
// and issue_id is never altered or renumbered.

export type IssueStatus = "RED" | "AMBER" | "GREEN";
export type IssuePriority = "critical" | "high" | "medium" | "low";

// Matches the CHECK constraints in migration/001_create_tables.sql exactly.
const VALID_STATUSES: readonly IssueStatus[] = ["RED", "AMBER", "GREEN"];
const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

export interface IssueListItem {
  issueId: string;
  title: string;
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
}

interface IssueRow {
  issue_id: string;
  issue_title: string;
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
 *  matched literally rather than as a pattern. */
function escapeLikePattern(input: string): string {
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
export async function listIssues(params: ListIssuesParams = {}): Promise<ListIssuesResult> {
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

  const result = await query<IssueRow>(
    `SELECT
       i.issue_id,
       i.issue_title,
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
     ORDER BY i.created_date DESC, i.issue_id DESC
     LIMIT $5 OFFSET $6`,
    [search, staffCode, status, priority, pageSize, offset, showDeleted, category]
  );

  const totalCount = result.rows[0] ? Number(result.rows[0].total_count) : 0;

  return {
    issues: result.rows.map((row) => ({
      issueId: row.issue_id,
      title: row.issue_title,
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
  options: { includeDeleted?: boolean } = {}
): Promise<IssueDetail | null> {
  const includeDeleted = options.includeDeleted ?? false;

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
       to_char(i.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deleted_at
     FROM issue_tracking.issues i
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     WHERE i.issue_id = $1
       AND ($2::boolean OR i.deleted_at IS NULL)
     LIMIT 1`,
    [issueId, includeDeleted]
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
export async function getAdjacentIssueIds(issueId: string): Promise<AdjacentIssueIds> {
  const [previousResult, nextResult] = await Promise.all([
    query<{ issue_id: string }>(
      `SELECT issue_id FROM issue_tracking.issues
       WHERE issue_id < $1 AND deleted_at IS NULL
       ORDER BY issue_id DESC
       LIMIT 1`,
      [issueId]
    ),
    query<{ issue_id: string }>(
      `SELECT issue_id FROM issue_tracking.issues
       WHERE issue_id > $1 AND deleted_at IS NULL
       ORDER BY issue_id ASC
       LIMIT 1`,
      [issueId]
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
 * next_issue_id() is atomic and concurrency-safe, and only ever hands out
 * new numbers, so historical issue_ids are never touched or renumbered. ID
 * allocation + INSERT run in one transaction so a failed insert can never
 * burn a number silently.
 *
 * New issues always start at status 'RED' — not a caller-supplied value.
 */
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
         (issue_id, staff_code, issue_title, issue_description, category, status, priority, created_date, extra_data)
       VALUES ($1, $2, $3, $4, $5, 'RED', $6, CURRENT_DATE, $7::jsonb)`,
      [
        issueId,
        input.staffCode,
        input.title,
        input.description,
        input.category,
        input.priority,
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
