import "server-only";

import { query } from "../db";
import {
  completionPercent,
  normalizeTrackingState,
  resolveTrackerOrderBy,
  TRACKING_STATE_STALE_DAYS,
  type TrackingState,
} from "../access/tracker";
import type { TrackerEventKind } from "../access/trackerTimeline";
import { escapeLikePattern, type IssuePriority, type IssueStatus } from "./issues";

// ── SUPER ADMIN TRACKER — READ ONLY ─────────────────────────────────────────
//
// Every statement in this file is a SELECT. There is no INSERT, UPDATE,
// DELETE, or DDL anywhere, and no transaction is opened: the Tracker only
// ever observes. It cannot change an Issue, an assignment, a status, or a
// work-progress field.
//
// ── TABLES READ ─────────────────────────────────────────────────────────────
//   issue_tracking.assignment_users      Assignee identity + the active pool
//   issue_tracking.issue_assignments     WHO holds an Issue (is_current only)
//   issue_tracking.issues                the Issue itself
//   issue_tracking.issue_status_history  activity: status changes
//   issue_tracking.issue_comments        activity: investigation notes
//   issue_tracking.issue_staff           DISPLAY ONLY — the "Raised By" name
//
// ── OWNERSHIP RULE ──────────────────────────────────────────────────────────
// An Issue belongs to an Assignee ONLY through
//   issue_assignments.assignee_id -> assignment_users.assignee_id
// with is_current = true. issue_tracking.issue_staff is joined in exactly one
// place, to print the "Raised By" column, and its staff_code/staff_name is
// never used to decide who an Issue is assigned to. Those are two different
// people and conflating them is the specific mistake this comment exists to
// prevent.
//
// ── ACCESS ──────────────────────────────────────────────────────────────────
// This module takes no IssueAccessScope, because the Tracker is not a scoped
// view: it is Super Admin only, gated by the `tracker:view` permission at
// app/dashboard/tracker/page.tsx. No Assignee-facing code path imports it.
// If that ever changes, the caller must add scoping — do not assume these
// functions filter by viewer, because they deliberately do not.

/** Deleted Issues never appear in the Tracker — same convention as every
 *  other listing (migration/004_soft_delete.sql). */
const NOT_DELETED = "i.deleted_at IS NULL";

/**
 * The most recent genuine activity on an Issue, as one SQL expression.
 *
 * Fallback order is documented in LAST_ACTIVITY_FALLBACK
 * (lib/access/tracker.ts) and implemented here exactly:
 *   GREATEST(latest status change, latest investigation note)  -- 1 & 2
 *   -> assigned_at                                             -- 3
 *   -> issues.updated_at                                       -- 4
 *
 * GREATEST ignores NULLs in PostgreSQL, so whichever of the first two exists
 * wins and the COALESCE only falls through when neither does. Every value is
 * a stored timestamp — nothing is synthesised.
 *
 * Correlated subqueries rather than joins: an Issue can have many history
 * rows and many notes, and joining both would multiply rows and corrupt the
 * summary counts. Both source columns are indexed by issue_id
 * (idx_issue_status_history_issue_id, idx_issue_comments_issue_id).
 */
const LAST_ACTIVITY_SQL = `
  COALESCE(
    GREATEST(
      (SELECT max(h.changed_at) FROM issue_tracking.issue_status_history h
        WHERE h.issue_id = i.issue_id),
      (SELECT max(c.created_at) FROM issue_tracking.issue_comments c
        WHERE c.issue_id = i.issue_id AND c.comment_type = 'investigation_note')
    ),
    ia.assigned_at,
    i.updated_at
  )`;

/**
 * Whole days between the Issue being raised and either its completion or
 * today. Computed in SQL from stored columns; nothing is written back and no
 * stored date is modified.
 *
 * A GREEN Issue stops counting at completed_at (falling back to the
 * pre-existing completed_date, then to today if a historical GREEN row has
 * neither). GREATEST(0, …) guards the theoretical case of a completion date
 * before the raise date — chk_completed_date already forbids it, so this is
 * belt and braces rather than an expected path.
 */
const DAYS_OPEN_SQL = `
  GREATEST(0,
    CASE WHEN i.status = 'GREEN'
      THEN COALESCE(i.completed_at::date, i.completed_date, CURRENT_DATE) - i.created_date
      ELSE CURRENT_DATE - i.created_date
    END)`;

// ---------------------------------------------------------------------------
// 0. Overview — the KPI strip
// ---------------------------------------------------------------------------

export interface TrackerOverview {
  totalAssigned: number;
  notSolved: number;
  partiallySolved: number;
  completelySolved: number;
  /** 0-100, whole number. 0 when nothing is assigned anywhere. */
  completionPercent: number;
}

/**
 * Organisation-wide totals across every CURRENT assignment.
 *
 * Deliberately its own aggregate rather than summing
 * listAssigneeTrackerSummary() in TypeScript: the KPI strip is the headline
 * number a manager reads first, and it should come from the database in one
 * pass rather than depending on the per-assignee query staying in sync.
 */
export async function getTrackerOverview(): Promise<TrackerOverview> {
  const result = await query<{
    total_assigned: string;
    not_solved: string;
    partially_solved: string;
    completely_solved: string;
  }>(
    `SELECT
       count(*)::text                                    AS total_assigned,
       count(*) FILTER (WHERE i.status = 'RED')::text    AS not_solved,
       count(*) FILTER (WHERE i.status = 'AMBER')::text  AS partially_solved,
       count(*) FILTER (WHERE i.status = 'GREEN')::text  AS completely_solved
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     WHERE ia.is_current = true
       AND ${NOT_DELETED}`
  );

  const row = result.rows[0];
  const totalAssigned = Number(row?.total_assigned ?? 0);
  const completelySolved = Number(row?.completely_solved ?? 0);

  return {
    totalAssigned,
    notSolved: Number(row?.not_solved ?? 0),
    partiallySolved: Number(row?.partially_solved ?? 0),
    completelySolved,
    completionPercent: completionPercent(totalAssigned, completelySolved),
  };
}

// ---------------------------------------------------------------------------
// 1. Assignee summary
// ---------------------------------------------------------------------------

export interface TrackerAssigneeSummary {
  assigneeId: number;
  /** issue_tracking.assignment_users.assignee_name — the Assignee's own
   *  name. NEVER issue_staff.staff_name. */
  assigneeName: string;
  totalAssigned: number;
  notSolved: number;
  partiallySolved: number;
  completelySolved: number;
  /** 0-100, whole number. 0 when the Assignee holds nothing. */
  completionPercent: number;
  /** ISO date (YYYY-MM-DD) of the earliest still-open Issue, or null when
   *  they have none open. */
  oldestOpenDate: string | null;
  /** Days that oldest open Issue has been open, or null. */
  oldestOpenDays: number | null;
  /** ISO timestamp (UTC) of the most recent activity across their current
   *  Issues, or null if they hold none. */
  lastActivityAt: string | null;
}

interface SummaryRow {
  assignee_id: number;
  assignee_name: string;
  total_assigned: string;
  not_solved: string;
  partially_solved: string;
  completely_solved: string;
  oldest_open_date: string | null;
  oldest_open_days: string | null;
  last_activity_at: string | null;
}

/**
 * One row per ACTIVE Assignee, including those holding nothing.
 *
 * The LEFT JOINs are what make the zero case work: an Assignee with no
 * current assignment still produces a row, and every aggregate resolves to 0
 * or NULL rather than dropping them from the list. `count(i.issue_id)` (not
 * `count(*)`) is deliberate — count(*) would return 1 for that row.
 *
 * Only CURRENT assignments are counted (ia.is_current = true, applied in the
 * JOIN condition so it cannot accidentally turn the LEFT JOIN into an inner
 * one), and soft-deleted Issues are excluded the same way.
 */
export async function listAssigneeTrackerSummary(): Promise<TrackerAssigneeSummary[]> {
  const result = await query<SummaryRow>(
    `SELECT
       au.assignee_id,
       au.assignee_name,
       count(i.issue_id)::text                                          AS total_assigned,
       count(*) FILTER (WHERE i.status = 'RED')::text                   AS not_solved,
       count(*) FILTER (WHERE i.status = 'AMBER')::text                 AS partially_solved,
       count(*) FILTER (WHERE i.status = 'GREEN')::text                 AS completely_solved,
       to_char(min(i.created_date) FILTER (WHERE i.status <> 'GREEN'), 'YYYY-MM-DD')
                                                                        AS oldest_open_date,
       (CURRENT_DATE - min(i.created_date) FILTER (WHERE i.status <> 'GREEN'))::text
                                                                        AS oldest_open_days,
       to_char(max(${LAST_ACTIVITY_SQL}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                                                        AS last_activity_at
     FROM issue_tracking.assignment_users au
     LEFT JOIN issue_tracking.issue_assignments ia
            ON ia.assignee_id = au.assignee_id AND ia.is_current = true
     LEFT JOIN issue_tracking.issues i
            ON i.issue_id = ia.issue_id AND i.deleted_at IS NULL
     WHERE au.active = true
     GROUP BY au.assignee_id, au.assignee_name
     ORDER BY au.assignee_name`
  );

  return result.rows.map((row) => {
    const totalAssigned = Number(row.total_assigned);
    const completelySolved = Number(row.completely_solved);
    return {
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      totalAssigned,
      notSolved: Number(row.not_solved),
      partiallySolved: Number(row.partially_solved),
      completelySolved,
      completionPercent: completionPercent(totalAssigned, completelySolved),
      oldestOpenDate: row.oldest_open_date,
      oldestOpenDays: row.oldest_open_days === null ? null : Number(row.oldest_open_days),
      lastActivityAt: row.last_activity_at,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Tracker Issue table
// ---------------------------------------------------------------------------

export interface TrackerIssueRow {
  issueId: string;
  title: string;
  /** assignment_users.assignee_name. */
  assigneeName: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  /** issues.category — the "Domain" column/filter. */
  category: string;
  /** issue_staff.staff_name — DISPLAY ONLY ("Raised By"). Never ownership. */
  staffName: string;
  /** ISO date (YYYY-MM-DD). */
  createdDate: string;
  /** ISO timestamp (UTC) the current assignment was made. */
  assignedAt: string;
  daysOpen: number;
  /** ISO timestamp (UTC), or null in the (impossible in practice) case that
   *  every fallback source is null. */
  lastActivityAt: string | null;
  /** The management signal. Null when the stored evidence supports none of
   *  the defined states — the UI renders "—" rather than guessing. */
  trackingState: TrackingState | null;
  // ── The evidence Tracking State is derived from, carried on the row ──────
  // Exposed so the derivation can be independently cross-checked (see
  // scripts/verify-issue-scope.ts) instead of taken on trust, and so a
  // reviewer can see why a row says what it says.
  /** ISO timestamp (UTC) when work first started, or null. */
  processStartedAt: string | null;
  /** True if this Issue has ever had a recorded status change. */
  hasStatusHistory: boolean;
  /** True if an AMBER -> RED transition is recorded for this Issue. */
  returnedFromAmber: boolean;
}

export interface ListTrackerIssuesParams {
  page?: number;
  pageSize?: number;
  /** Matches issue_id or issue_title (case-insensitive, substring). */
  search?: string;
  assigneeId?: number | null;
  status?: string;
  /** One of TRACKING_STATES, or undefined for no filter. */
  trackingState?: string;
  /** Matches issues.category exactly. */
  category?: string;
  priority?: string;
  /** Inclusive ISO date bounds (YYYY-MM-DD) on issues.created_date. */
  raisedFrom?: string;
  raisedTo?: string;
  /** Inclusive ISO date bounds (YYYY-MM-DD) on the assignment date. */
  assignedFrom?: string;
  assignedTo?: string;
  sort?: string;
  order?: string;
}

export interface ListTrackerIssuesResult {
  issues: TrackerIssueRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const VALID_STATUSES: readonly IssueStatus[] = ["RED", "AMBER", "GREEN"];
const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

/** Accepts only a well-formed ISO calendar date; anything else becomes null
 *  ("no bound") rather than reaching the query as a cast that could error. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !ISO_DATE_PATTERN.test(trimmed)) {
    return null;
  }
  // Reject impossible dates (2026-13-45) that match the shape but would make
  // ::date throw. Date.parse on the ISO form is UTC and exact.
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(trimmed)) {
    return null;
  }
  return trimmed;
}

interface TrackerIssueQueryRow {
  issue_id: string;
  issue_title: string;
  assignee_name: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  category: string;
  staff_name: string;
  created_date: string;
  assigned_at: string;
  days_open: string;
  last_activity_at: string | null;
  tracking_state: TrackingState | null;
  process_started_at: string | null;
  has_status_history: boolean;
  returned_from_amber: boolean;
  total_count: string;
}

/**
 * The Tracking State rule — the ONE place it is defined.
 *
 * Deliberately SQL rather than TypeScript: the column has to be filterable and
 * sortable server-side, so the database must be able to compute it. A second
 * copy in TypeScript would be a second rule that could drift from this one.
 *
 * Every branch reads stored evidence. Nothing is inferred from absence except
 * where absence is itself the evidence ("no history at all and no process
 * start" really does mean work never began).
 *
 *   GREEN                                       -> Completed
 *   AMBER + last activity older than the stale
 *           threshold                           -> No Recent Update
 *   AMBER                                       -> In Progress
 *   RED   + a recorded AMBER->RED transition,
 *           or a process_started_at stamp       -> Returned to Not Solved
 *   RED   + no status history at all and no
 *           process_started_at                  -> Not Started
 *   anything else                               -> NULL (renders as "—")
 *
 * The final NULL is not a failure — it is the honest answer for a RED Issue
 * that has history but no return transition and no start stamp, which the
 * evidence simply does not classify.
 *
 * Written against the `base` CTE's own column names.
 */
const TRACKING_STATE_SQL = `
  CASE
    WHEN status = 'GREEN' THEN 'Completed'
    WHEN status = 'AMBER' THEN
      CASE
        WHEN last_activity_at IS NOT NULL
         AND last_activity_at < now() - (${TRACKING_STATE_STALE_DAYS} * INTERVAL '1 day')
        THEN 'No Recent Update'
        ELSE 'In Progress'
      END
    WHEN status = 'RED' THEN
      CASE
        WHEN returned_from_amber OR process_started_at IS NOT NULL
          THEN 'Returned to Not Solved'
        WHEN NOT has_status_history AND process_started_at IS NULL
          THEN 'Not Started'
        ELSE NULL
      END
    ELSE NULL
  END`;

/**
 * Every currently-assigned, non-deleted Issue, with search, filters,
 * whitelisted sorting and pagination.
 *
 * The join to issue_assignments is an INNER join with is_current = true, so
 * an unassigned Issue never appears (the Tracker monitors assigned work) and
 * a superseded assignment row never does either.
 *
 * Every filter is a bind parameter. The ONLY interpolated fragment is
 * `orderBy`, which comes from resolveTrackerOrderBy() — a lookup into a
 * frozen map of hand-written literals, never from the URL value itself.
 */
export async function listTrackerIssues(
  params: ListTrackerIssuesParams = {}
): Promise<ListTrackerIssuesResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE))
  );
  const offset = (page - 1) * pageSize;

  const trimmedSearch = params.search?.trim();
  const search = trimmedSearch ? escapeLikePattern(trimmedSearch) : null;
  const assigneeId =
    params.assigneeId && Number.isFinite(params.assigneeId) && params.assigneeId > 0
      ? params.assigneeId
      : null;
  const status =
    params.status && (VALID_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as IssueStatus)
      : null;
  const category = params.category?.trim() || null;
  const priority =
    params.priority && (VALID_PRIORITIES as readonly string[]).includes(params.priority)
      ? (params.priority as IssuePriority)
      : null;
  const trackingState = normalizeTrackingState(params.trackingState);
  const raisedFrom = normalizeDate(params.raisedFrom);
  const raisedTo = normalizeDate(params.raisedTo);
  const assignedFrom = normalizeDate(params.assignedFrom);
  const assignedTo = normalizeDate(params.assignedTo);
  const orderBy = resolveTrackerOrderBy(params.sort, params.order);

  // Two CTEs because Tracking State has to EXIST before it can be filtered or
  // sorted on, and SQL cannot reference an output alias in WHERE/ORDER BY:
  //   base    — joins, and the raw evidence columns
  //   tracked — the derived columns (days open, tracking state)
  // The outer SELECT then filters and orders over that projection, which is
  // why TRACKER_SORT_COLUMNS uses unqualified names.
  const result = await query<TrackerIssueQueryRow>(
    `WITH base AS (
       SELECT
         i.issue_id,
         i.issue_title,
         au.assignee_name,
         i.status,
         i.priority,
         i.category,
         s.staff_name,
         i.created_date,
         ia.assigned_at,
         ia.assignee_id,
         i.process_started_at,
         ${DAYS_OPEN_SQL} AS days_open,
         ${LAST_ACTIVITY_SQL} AS last_activity_at,
         EXISTS (
           SELECT 1 FROM issue_tracking.issue_status_history h
            WHERE h.issue_id = i.issue_id
         ) AS has_status_history,
         EXISTS (
           SELECT 1 FROM issue_tracking.issue_status_history h
            WHERE h.issue_id = i.issue_id
              AND h.from_status = 'AMBER' AND h.to_status = 'RED'
         ) AS returned_from_amber
       FROM issue_tracking.issue_assignments ia
       JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
       JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
       -- issue_staff is joined for the displayed "Raised By" name ONLY. It is
       -- never used to decide who the Issue is assigned to.
       JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
       WHERE ia.is_current = true
         AND ${NOT_DELETED}
     ),
     tracked AS (
       SELECT base.*, ${TRACKING_STATE_SQL} AS tracking_state
       FROM base
     )
     SELECT
       issue_id,
       issue_title,
       assignee_name,
       status,
       priority,
       category,
       staff_name,
       to_char(created_date, 'YYYY-MM-DD') AS created_date,
       to_char(assigned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS assigned_at,
       days_open::text AS days_open,
       to_char(last_activity_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_activity_at,
       tracking_state,
       to_char(process_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS process_started_at,
       has_status_history,
       returned_from_amber,
       COUNT(*) OVER() AS total_count
     FROM tracked
     WHERE ($1::text  IS NULL OR issue_id ILIKE '%' || $1 || '%' ESCAPE '\\' OR issue_title ILIKE '%' || $1 || '%' ESCAPE '\\')
       AND ($2::int   IS NULL OR assignee_id = $2)
       AND ($3::text  IS NULL OR status = $3)
       AND ($4::text  IS NULL OR category = $4)
       AND ($5::text  IS NULL OR priority = $5)
       AND ($6::date  IS NULL OR assigned_at >= $6::date)
       AND ($7::date  IS NULL OR assigned_at < ($7::date + INTERVAL '1 day'))
       AND ($8::text  IS NULL OR tracking_state = $8)
       AND ($9::date  IS NULL OR created_date >= $9::date)
       AND ($10::date IS NULL OR created_date <= $10::date)
     ORDER BY ${orderBy}
     LIMIT $11 OFFSET $12`,
    [
      search,
      assigneeId,
      status,
      category,
      priority,
      assignedFrom,
      assignedTo,
      trackingState,
      raisedFrom,
      raisedTo,
      pageSize,
      offset,
    ]
  );

  const totalCount = result.rows[0] ? Number(result.rows[0].total_count) : 0;

  return {
    issues: result.rows.map((row) => ({
      issueId: row.issue_id,
      title: row.issue_title,
      assigneeName: row.assignee_name,
      status: row.status,
      priority: row.priority,
      category: row.category,
      staffName: row.staff_name,
      createdDate: row.created_date,
      assignedAt: row.assigned_at,
      daysOpen: Number(row.days_open),
      lastActivityAt: row.last_activity_at,
      trackingState: row.tracking_state,
      processStartedAt: row.process_started_at,
      hasStatusHistory: row.has_status_history,
      returnedFromAmber: row.returned_from_amber,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/**
 * Distinct Domain values across currently-assigned, non-deleted Issues — the
 * Tracker's Domain filter. Deliberately not listCategories() from
 * lib/queries/issues.ts: that returns every domain in the system including
 * ones on unassigned Issues, which would offer filter values that can never
 * match a Tracker row.
 */
export async function listTrackerCategories(): Promise<string[]> {
  const result = await query<{ category: string }>(
    `SELECT DISTINCT i.category
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     WHERE ia.is_current = true
       AND ${NOT_DELETED}
     ORDER BY i.category`
  );

  return result.rows.map((row) => row.category);
}

// ---------------------------------------------------------------------------
// 3. Tracker Issue detail  (/dashboard/tracker/[issueId])
// ---------------------------------------------------------------------------

export interface TrackerIssueDetail {
  issueId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  /** issues.category — "Domain". */
  category: string;
  /** issue_staff.staff_name — DISPLAY ONLY ("Raised By"). Never ownership. */
  staffName: string;
  /** assignment_users.assignee_name for the CURRENT assignment. */
  assigneeName: string;
  /** ISO date (YYYY-MM-DD). */
  createdDate: string;
  /** ISO timestamp (UTC) of the current assignment. */
  assignedAt: string;
  daysOpen: number;
  lastActivityAt: string | null;
  /** issues.extra_data — free-form JSONB; the images gallery reads it. */
  extraData: Record<string, unknown>;
  /** The historical intake-time "Fix & Action Required". Never the Stage 6
   *  outcome — that is finalResolution below. */
  resolution: string | null;
  // ── Workflow / process details (migration 012) ──────────────────────────
  processStartedAt: string | null;
  implementationProgress: string | null;
  implementationDone: string | null;
  finalResolution: string | null;
  completedAt: string | null;
  completedDate: string | null;
}

interface TrackerDetailRow {
  issue_id: string;
  issue_title: string;
  issue_description: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  category: string;
  staff_name: string;
  assignee_name: string;
  created_date: string;
  assigned_at: string;
  days_open: string;
  last_activity_at: string | null;
  extra_data: Record<string, unknown> | null;
  resolution: string | null;
  process_started_at: string | null;
  implementation_progress: string | null;
  implementation_done: string | null;
  final_resolution: string | null;
  completed_at: string | null;
  completed_date: string | null;
}

/**
 * One currently-assigned Issue, with everything the Tracker detail page shows.
 *
 * Returns null when the Issue does not exist, is soft-deleted, or has no
 * CURRENT assignment — the Tracker monitors assigned work, so an unassigned
 * Issue has nothing to track and the page renders its "not found" panel rather
 * than a half-empty record.
 *
 * Read-only. `issueId` is only ever a bind parameter for an exact match.
 */
export async function getTrackerIssueDetail(issueId: string): Promise<TrackerIssueDetail | null> {
  const result = await query<TrackerDetailRow>(
    `SELECT
       i.issue_id,
       i.issue_title,
       i.issue_description,
       i.status,
       i.priority,
       i.category,
       s.staff_name,
       au.assignee_name,
       to_char(i.created_date, 'YYYY-MM-DD') AS created_date,
       to_char(ia.assigned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS assigned_at,
       ${DAYS_OPEN_SQL}::text AS days_open,
       to_char(${LAST_ACTIVITY_SQL} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_activity_at,
       i.extra_data,
       i.resolution,
       to_char(i.process_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS process_started_at,
       i.implementation_progress,
       i.implementation_done,
       i.final_resolution,
       to_char(i.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
       to_char(i.completed_date, 'YYYY-MM-DD') AS completed_date
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
     -- issue_staff joined for the displayed "Raised By" name ONLY.
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     WHERE ia.is_current = true
       AND ${NOT_DELETED}
       AND i.issue_id = $1
     LIMIT 1`,
    [issueId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    issueId: row.issue_id,
    title: row.issue_title,
    description: row.issue_description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    staffName: row.staff_name,
    assigneeName: row.assignee_name,
    createdDate: row.created_date,
    assignedAt: row.assigned_at,
    daysOpen: Number(row.days_open),
    lastActivityAt: row.last_activity_at,
    extraData: row.extra_data ?? {},
    resolution: row.resolution,
    processStartedAt: row.process_started_at,
    implementationProgress: row.implementation_progress,
    implementationDone: row.implementation_done,
    finalResolution: row.final_resolution,
    completedAt: row.completed_at,
    completedDate: row.completed_date,
  };
}

// ---------------------------------------------------------------------------
// 4. Tracker workflow timeline
// ---------------------------------------------------------------------------

export interface TrackerTimelineEvent {
  /** Unique within one Issue's timeline: source table prefix + primary key,
   *  so an assignment_id and a history_id can never collide. */
  key: string;
  kind: TrackerEventKind;
  /** ISO timestamp (UTC). */
  at: string;
  /** management_users.display_name of whoever performed it, or null when the
   *  schema genuinely records no actor — see UNKNOWN_ACTOR. */
  actorName: string | null;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  /** issue_comments.comment_type for a note; null otherwise. */
  commentType: string | null;
  /** The recorded text: issue_status_history.reason for a status change,
   *  issue_comments.body for a note, the assignee name for an assignment,
   *  the Raised By name for creation. Null when nothing was recorded. */
  detail: string | null;
}

interface TimelineRow {
  key: string;
  kind: TrackerEventKind;
  at: string;
  actor_name: string | null;
  from_status: IssueStatus | null;
  to_status: IssueStatus | null;
  comment_type: string | null;
  detail: string | null;
}

/**
 * Every recorded workflow event for one Issue, oldest first.
 *
 * FOUR real sources, UNION ALLed — one timeline row per stored table row, and
 * nothing invented (see lib/access/trackerTimeline.ts for why there is no
 * separate "Process Started"/"Completed" event):
 *
 *   1. issues.created_at            -> "Issue raised".  No actor: the issues
 *                                      table has no created_by column, so the
 *                                      timeline shows none rather than
 *                                      substituting the Raised By staff member,
 *                                      who is a different concept. The staff
 *                                      name is carried in `detail` instead,
 *                                      clearly labelled by the UI.
 *   2. issue_assignments.assigned_at-> "Assigned".  EVERY row, not just the
 *                                      current one, so a reassignment history
 *                                      is visible. Actor = assigned_by's
 *                                      display_name (nullable).
 *   3. issue_status_history         -> the status changes, with from/to and
 *                                      the work detail stored in `reason`.
 *                                      Actor = changed_by's display_name.
 *   4. issue_comments               -> progress notes (investigation_note)
 *                                      and comments. Actor = author_id's
 *                                      display_name.
 *
 * LEFT JOINs to management_users throughout: a nullable actor must not drop
 * the event from the timeline.
 *
 * Read-only, parameterised, fully schema-qualified. issue_staff appears once,
 * for the displayed Raised By name only.
 */
export async function getTrackerIssueTimeline(issueId: string): Promise<TrackerTimelineEvent[]> {
  const result = await query<TimelineRow>(
    // Each branch formats its own timestamp to a zero-padded UTC ISO string.
    // ORDER BY can only reference output columns across a UNION, and that
    // format sorts chronologically as plain text, so ordering by `at`
    // directly is both correct and simple — no extra raw column needed.
    `SELECT
         'i:' || i.issue_id  AS key,
         'created'           AS kind,
         to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
         NULL::text          AS actor_name,
         NULL::text          AS from_status,
         NULL::text          AS to_status,
         NULL::text          AS comment_type,
         s.staff_name::text  AS detail
       FROM issue_tracking.issues i
       JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
       WHERE i.issue_id = $1

     UNION ALL

     SELECT
         'a:' || ia.assignment_id::text,
         'assigned',
         to_char(ia.assigned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         u.display_name::text,
         NULL, NULL, NULL,
         au.assignee_name::text
       FROM issue_tracking.issue_assignments ia
       JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
       LEFT JOIN issue_tracking.management_users u ON u.user_id = ia.assigned_by
       WHERE ia.issue_id = $1

     UNION ALL

     SELECT
         'h:' || h.history_id::text,
         'status_change',
         to_char(h.changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         u.display_name::text,
         h.from_status::text,
         h.to_status::text,
         NULL,
         h.reason
       FROM issue_tracking.issue_status_history h
       LEFT JOIN issue_tracking.management_users u ON u.user_id = h.changed_by
       WHERE h.issue_id = $1

     UNION ALL

     SELECT
         'c:' || c.comment_id::text,
         'note',
         to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         u.display_name::text,
         NULL, NULL,
         c.comment_type::text,
         c.body
       FROM issue_tracking.issue_comments c
       LEFT JOIN issue_tracking.management_users u ON u.user_id = c.author_id
       WHERE c.issue_id = $1

     ORDER BY at ASC, key ASC`,
    [issueId]
  );

  return result.rows.map((row) => ({
    key: row.key,
    kind: row.kind,
    at: row.at,
    actorName: row.actor_name,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    commentType: row.comment_type,
    detail: row.detail,
  }));
}
