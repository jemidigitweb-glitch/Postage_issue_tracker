// Pure rules and metrics for the Super Admin Tracker.
//
// DELIBERATELY has no `server-only` import, no `next/*` import and no
// database import — same discipline as the rest of lib/access/*. That is what
// lets the sort whitelist and the completion maths be unit-tested directly
// (tests/tracker.test.ts); `npm test` runs plain tsx, which cannot import
// anything under lib/queries/* because those modules pull in `server-only`.
//
// The SQL fragments below are hand-written literals kept in this file so the
// whitelist itself is testable. No user input ever reaches them: the URL's
// ?sort= value is only ever used as a LOOKUP KEY into the frozen map, never
// interpolated, and the direction is narrowed to the two literals ASC/DESC.

/** Every column the Tracker table can be sorted by, per the approved list. */
export type TrackerSortKey =
  | "issueId"
  | "title"
  | "assignee"
  | "status"
  | "priority"
  | "domain"
  | "created"
  | "assigned"
  | "daysOpen"
  | "lastActivity";

/**
 * Sort key -> SQL expression. Frozen, hand-written, and never built from
 * input. `daysOpen` and `lastActivity` reference the computed expressions the
 * query aliases in its SELECT list — see lib/queries/tracker.ts, which keeps
 * the same names.
 */
// Column names are those of the `tracked` CTE in listTrackerIssues(), not
// table-qualified ones: the Tracking State has to be computed before it can be
// filtered on, so the query projects everything through a CTE and both the
// WHERE and the ORDER BY read from that projection.
export const TRACKER_SORT_COLUMNS = Object.freeze({
  issueId: "issue_id",
  title: "issue_title",
  assignee: "assignee_name",
  // Workflow order, not alphabetical: RED -> AMBER -> GREEN. Alphabetical
  // would give AMBER, GREEN, RED, which is meaningless to an operator.
  status: "CASE status WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END",
  // low=1 … critical=4, so ascending runs least -> most urgent and descending
  // puts critical first.
  priority:
    "CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 WHEN 'critical' THEN 4 ELSE 0 END",
  domain: "category",
  created: "created_date",
  assigned: "assigned_at",
  daysOpen: "days_open",
  lastActivity: "last_activity_at",
} as const);

/** Longest-assigned first — the view a monitor wants by default. */
export const TRACKER_DEFAULT_ORDER_BY = "assigned_at DESC, issue_id DESC";

// ---------------------------------------------------------------------------
// Tracking State
//
// A MANAGEMENT signal, deliberately separate from the Issue's actual Status
// (which is still shown in its own column and is never replaced). Status says
// where the Issue is; Tracking State says what that means for supervision.
//
// Derived ENTIRELY from stored evidence — the current status, the presence of
// specific issue_status_history rows, issues.process_started_at, and the last
// activity timestamp. The rule itself lives in ONE place, the SQL CASE in
// lib/queries/tracker.ts, because it must be filterable and sortable
// server-side; duplicating it in TypeScript would create two rules that could
// drift. What lives here is the vocabulary, the threshold, and the validation
// the filter uses.
//
// When the evidence does not support any of these, the column shows "—" rather
// than a guess.
// ---------------------------------------------------------------------------

export const TRACKING_STATES = Object.freeze([
  "Not Started",
  "In Progress",
  "Completed",
  "Returned to Not Solved",
  "No Recent Update",
] as const);

export type TrackingState = (typeof TRACKING_STATES)[number];

/**
 * How long an in-progress Issue may sit without any recorded activity before
 * it is flagged "No Recent Update".
 *
 * This is a chosen supervision threshold, not a fact read from the database —
 * it is stated here as a single named constant so it is visible and adjustable
 * rather than buried in a query. What it is applied TO is entirely real: the
 * last-activity timestamp computed from stored rows (see
 * LAST_ACTIVITY_FALLBACK). It applies only to AMBER Issues: a RED Issue that
 * nobody has touched is already described by "Not Started", and a GREEN one is
 * finished.
 */
export const TRACKING_STATE_STALE_DAYS = 14;

/** Narrows a raw URL value to a real Tracking State, or null for "no filter".
 *  Never throws and never lets an unrecognized value reach SQL. */
export function normalizeTrackingState(value: string | undefined): TrackingState | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return (TRACKING_STATES as readonly string[]).includes(trimmed)
    ? (trimmed as TrackingState)
    : null;
}

/**
 * Resolves the URL's sort/order into a safe ORDER BY clause.
 *
 * An unrecognized key falls back to the default order rather than erroring:
 * this is a read-only listing, so a hand-edited ?sort= can only ever produce
 * a differently-ordered page, never a wrong write and never a SQL error.
 *
 * The issue_id tiebreaker keeps paging stable when the sort column has ties —
 * without it, two pages can show the same row.
 */
export function resolveTrackerOrderBy(
  sort: string | undefined,
  order: string | undefined
): string {
  const column =
    sort && Object.prototype.hasOwnProperty.call(TRACKER_SORT_COLUMNS, sort)
      ? TRACKER_SORT_COLUMNS[sort as TrackerSortKey]
      : null;
  if (!column) {
    return TRACKER_DEFAULT_ORDER_BY;
  }
  const direction = order === "desc" ? "DESC" : "ASC";
  // Unqualified, like the map above: the ORDER BY runs over the `tracked`
  // CTE's projection, not over the base tables.
  return `${column} ${direction} NULLS LAST, issue_id ASC`;
}

/**
 * Completion percentage for one Assignee: Completely Solved / Total × 100.
 *
 * Returns 0 when the Assignee has no assignments — the divide-by-zero case is
 * handled here rather than in SQL or in the component, so there is exactly one
 * place it can be got wrong. Rounded to a whole number: the Tracker is a
 * monitoring view, and "66.666…%" is noise.
 *
 * Defensive against nonsense inputs (negative totals, green > total) because
 * the counts arrive as strings from `pg` and are Number()-ed at the boundary.
 */
export function completionPercent(totalAssigned: number, completelySolved: number): number {
  if (!Number.isFinite(totalAssigned) || totalAssigned <= 0) {
    return 0;
  }
  if (!Number.isFinite(completelySolved) || completelySolved <= 0) {
    return 0;
  }
  const solved = Math.min(completelySolved, totalAssigned);
  return Math.round((solved / totalAssigned) * 100);
}

/**
 * How "Last Activity" is derived, in the order actually implemented.
 *
 * Documented here (and asserted in tests) because the stage brief requires
 * the real fallback to be stated rather than assumed:
 *
 *   1 & 2. the most recent of  issue_status_history.changed_at
 *                        and  issue_comments.created_at (investigation_note)
 *          — both are genuine recorded activity, so the LATER of the two is
 *            used rather than letting an older status change mask a newer
 *            progress note. Postgres GREATEST ignores NULLs, so whichever
 *            exists wins and NULL only survives if neither does.
 *   3.     issue_assignments.assigned_at  — the Issue was assigned and
 *          nothing has happened since.
 *   4.     issues.updated_at              — last resort; always non-null.
 *
 * Nothing is invented: every candidate is a stored timestamp, and the result
 * is null only if all four are somehow null.
 */
export const LAST_ACTIVITY_FALLBACK = Object.freeze([
  "issue_status_history.changed_at (latest)",
  "issue_comments.created_at where comment_type = 'investigation_note' (latest)",
  "issue_assignments.assigned_at",
  "issues.updated_at",
] as const);
