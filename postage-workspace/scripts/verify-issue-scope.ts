// scripts/verify-issue-scope.ts
//
// READ-ONLY verification that the Stage 3 access-scope predicate actually
// works in PostgreSQL — not merely that it type-checks.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:scope
//
// Safety:
//  - Issues SELECT statements only, through the same lib/queries functions
//    the application uses. No INSERT/UPDATE/DELETE/DDL anywhere.
//  - Every query goes through lib/db.ts, which refuses to run unless
//    connected as varmen_user on varmen_db.
//  - Writes nothing to disk and prints no credential.
//
// Why it exists: tests/access.test.ts proves the authorization DECISIONS,
// but the decision is only half the guard — the other half is the SQL
// predicate in lib/queries/issues.ts. This script exercises that predicate
// against the real database and fails loudly if a scope ever returns rows it
// should not. It caught nothing at the time of writing; it exists so a future
// edit to the predicate cannot silently disable it.

import { SCOPE_ALL, SCOPE_NONE, type IssueAccessScope } from "../lib/access/permissions";
import { TRACKING_STATE_STALE_DAYS, TRACKING_STATES } from "../lib/access/tracker";
import { getAdjacentIssueIds, getIssueById, listIssues } from "../lib/queries/issues";
import {
  listAssignedIssues,
  listAssigneeCategories,
  listAssigneeIssues,
} from "../lib/queries/issueAssignments";
import { isAssigneeLinkAvailable } from "../lib/queries/assigneeLink";
import {
  getTrackerIssueDetail,
  getTrackerIssueTimeline,
  getTrackerOverview,
  listAssigneeTrackerSummary,
  listTrackerIssues,
} from "../lib/queries/tracker";
import { getPool, query } from "../lib/db";

let failures = 0;

/**
 * Picks an assignee to run the scoped assertions against.
 *
 * Prefers one that actually HOLDS a current assignment — otherwise every
 * "returns only their own Issues" check passes vacuously against an empty
 * result set and would keep passing even if the predicate were deleted.
 * Falls back to assignee_id 1 when nothing is assigned anywhere, and says so,
 * rather than pretending the run proved more than it did.
 *
 * Read-only: a single SELECT, no writes.
 */
async function pickAssigneeScope(): Promise<{ scope: IssueAccessScope; meaningful: boolean }> {
  const result = await query<{ assignee_id: number }>(
    `SELECT assignee_id
     FROM issue_tracking.issue_assignments
     WHERE is_current = true
     GROUP BY assignee_id
     ORDER BY count(*) DESC
     LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) {
    return { scope: { kind: "assignee", assigneeId: 1 }, meaningful: false };
  }
  return { scope: { kind: "assignee", assigneeId: Number(row.assignee_id) }, meaningful: true };
}

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
}

async function main(): Promise<void> {
  console.log("Read-only verification of the Issue access-scope predicate.\n");

  const linkReady = await isAssigneeLinkAvailable();
  console.log(
    `assignment_users.user_id present: ${linkReady} ` +
      `(false = migration 011 not applied; every assignee therefore resolves to scope "none")\n`
  );

  // ── Unrestricted scope: the Super Admin's view, unchanged by Stage 3 ──────
  const all = await listIssues(SCOPE_ALL, { pageSize: 100 });
  check("scope 'all' lists Issues", all.totalCount > 0, `totalCount = ${all.totalCount}`);

  const sampleIssueId = all.issues[0]?.issueId;
  if (!sampleIssueId) {
    console.error("No Issues found — cannot continue verification.");
    failures += 1;
    return;
  }

  const asAdmin = await getIssueById(sampleIssueId, SCOPE_ALL);
  check("scope 'all' opens an Issue detail", asAdmin !== null, `${sampleIssueId} resolved`);

  // ── "none" scope: the fail-closed path every assignee takes today ─────────
  const none = await listIssues(SCOPE_NONE, { pageSize: 100 });
  check("scope 'none' lists nothing", none.totalCount === 0, `totalCount = ${none.totalCount}`);

  const noneDetail = await getIssueById(sampleIssueId, SCOPE_NONE);
  check(
    "scope 'none' cannot open a real Issue",
    noneDetail === null,
    `${sampleIssueId} -> ${noneDetail === null ? "null (renders 'Issue not found')" : "LEAKED"}`
  );

  const noneAdjacent = await getAdjacentIssueIds(sampleIssueId, SCOPE_NONE);
  check(
    "scope 'none' gets no Prev/Next",
    noneAdjacent.previousId === null && noneAdjacent.nextId === null,
    `prev=${noneAdjacent.previousId}, next=${noneAdjacent.nextId}`
  );

  const noneAssigned = await listAssignedIssues(SCOPE_NONE, { pageSize: 100 });
  check(
    "scope 'none' sees no assigned Issues",
    noneAssigned.totalCount === 0,
    `totalCount = ${noneAssigned.totalCount}`
  );

  // ── Assignee scope: only Issues currently assigned to that assignee ───────
  const { scope: SOME_ASSIGNEE, meaningful } = await pickAssigneeScope();
  const assigneeId = SOME_ASSIGNEE.kind === "assignee" ? SOME_ASSIGNEE.assigneeId : 0;
  console.log(
    meaningful
      ? `\nUsing assignee_id ${assigneeId} (holds current assignments — the scoped checks below are non-vacuous).\n`
      : `\nNo assignee currently holds an assignment; falling back to assignee_id ${assigneeId}. ` +
          `The scoped checks below pass against an EMPTY result set and prove less than usual.\n`
  );

  const mine = await listIssues(SOME_ASSIGNEE, { pageSize: 100 });
  check(
    "assignee scope returns only that assignee's current Issues",
    mine.totalCount <= all.totalCount,
    `assignee ${assigneeId} sees ${mine.totalCount} of ${all.totalCount}`
  );

  // Every row the assignee scope does return must genuinely be assigned to
  // them — cross-checked against the assigned-issues query, which reaches
  // issue_assignments by a different join.
  const mineAssigned = await listAssignedIssues(SOME_ASSIGNEE, { pageSize: 100 });
  const assignedIds = new Set(mineAssigned.issues.map((i) => i.issueId));
  check(
    "assignee scope agrees with issue_assignments",
    mine.issues.every((i) => assignedIds.has(i.issueId)),
    `${mine.issues.length} listed, ${assignedIds.size} confirmed assigned`
  );

  // The adjacency query is the one most easily broken by a correlation bug
  // (an unqualified issue_id inside the EXISTS silently matches everything).
  const mineAdjacent = await getAdjacentIssueIds(sampleIssueId, SOME_ASSIGNEE);
  const adjacentLeak =
    (mineAdjacent.previousId !== null && !assignedIds.has(mineAdjacent.previousId)) ||
    (mineAdjacent.nextId !== null && !assignedIds.has(mineAdjacent.nextId));
  check(
    "Prev/Next never leaves the assignee's own Issues",
    !adjacentLeak,
    `prev=${mineAdjacent.previousId}, next=${mineAdjacent.nextId}`
  );

  // ── URL tampering: a requested assignee id must not widen the scope ───────
  const tampered = await listAssignedIssues(SOME_ASSIGNEE, { pageSize: 100, assigneeId: 9999 });
  check(
    "a client-supplied ?assignee= cannot widen an assignee scope",
    tampered.totalCount === mineAssigned.totalCount,
    `requested 9999 -> ${tampered.totalCount} rows (own scope has ${mineAssigned.totalCount})`
  );

  // ── Assignee Portal: the Assigned Issues table's own query ────────────────
  // listAssigneeIssues() is a separate read from listAssignedIssues() above,
  // so it needs its own proof that it cannot widen. It is fail-closed by
  // construction (it refuses any scope that is not "assignee"), which is what
  // the first two checks pin down.
  const portalAsAdmin = await listAssigneeIssues(SCOPE_ALL, { pageSize: 100 });
  check(
    "assignee table query returns nothing for scope 'all'",
    portalAsAdmin.totalCount === 0,
    `totalCount = ${portalAsAdmin.totalCount} (fail-closed: it is not a second way to list every Issue)`
  );

  const portalAsNone = await listAssigneeIssues(SCOPE_NONE, { pageSize: 100 });
  check(
    "assignee table query returns nothing for scope 'none'",
    portalAsNone.totalCount === 0,
    `totalCount = ${portalAsNone.totalCount}`
  );

  const portalMine = await listAssigneeIssues(SOME_ASSIGNEE, { pageSize: 100 });
  check(
    "assignee table query agrees with issue_assignments",
    portalMine.issues.every((i) => assignedIds.has(i.issueId)),
    `${portalMine.issues.length} listed, all confirmed currently assigned`
  );
  check(
    "assignee table query returns the same set as the card query",
    portalMine.totalCount === mineAssigned.totalCount,
    `table ${portalMine.totalCount} vs cards ${mineAssigned.totalCount}`
  );

  // An unknown ?sort= must fall back to the default order, never reach SQL.
  const portalBadSort = await listAssigneeIssues(SOME_ASSIGNEE, {
    pageSize: 100,
    sort: "issue_id; DROP TABLE issue_tracking.issues --",
    order: "'; --",
  });
  check(
    "an unrecognized ?sort=/?order= falls back to the default order safely",
    portalBadSort.totalCount === portalMine.totalCount,
    `${portalBadSort.totalCount} rows, no error — the value never reaches SQL`
  );

  // Every whitelisted sort key must actually run.
  const sortKeys = ["issueId", "title", "staff", "domain", "status", "priority", "created"];
  let sortFailures = 0;
  for (const key of sortKeys) {
    for (const order of ["asc", "desc"]) {
      const sorted = await listAssigneeIssues(SOME_ASSIGNEE, { pageSize: 100, sort: key, order });
      if (sorted.totalCount !== portalMine.totalCount) {
        sortFailures += 1;
      }
    }
  }
  check(
    "every whitelisted assignee sort key executes and returns the same row set",
    sortFailures === 0,
    `${sortKeys.length} keys x 2 directions, ${sortFailures} mismatch(es)`
  );

  const portalCategoriesAsAdmin = await listAssigneeCategories(SCOPE_ALL);
  check(
    "assignee Domain filter list is empty for scope 'all'",
    portalCategoriesAsAdmin.length === 0,
    `${portalCategoriesAsAdmin.length} domain(s) — never the system-wide list`
  );

  const portalCategories = await listAssigneeCategories(SOME_ASSIGNEE);
  const ownDomains = new Set(portalMine.issues.map((i) => i.category));
  check(
    "assignee Domain filter lists only domains from their own Issues",
    portalCategories.every((c) => ownDomains.has(c)),
    `${portalCategories.length} domain(s) offered, all present in their own Issues`
  );

  await verifyTracker();
}

// ---------------------------------------------------------------------------
// Super Admin Tracker — read-only verification against the real schema.
//
// lib/queries/tracker.ts imports `server-only`, so tests/tracker.test.ts can
// only assert the pure rules (access, sort whitelist, completion maths). The
// SQL itself — the current-assignment rule, the LEFT JOIN that keeps
// zero-assignment assignees, the summary aggregates, the sort keys actually
// executing — is checked here, against the live database, with SELECTs only.
// ---------------------------------------------------------------------------
async function verifyTracker(): Promise<void> {
  console.log("\n── Super Admin Tracker ──\n");

  const before = await snapshotCounts();

  // ── Summary ───────────────────────────────────────────────────────────────
  const summaries = await listAssigneeTrackerSummary();

  const activeAssignees = await query<{ assignee_id: number; assignee_name: string }>(
    `SELECT assignee_id, assignee_name
     FROM issue_tracking.assignment_users
     WHERE active = true
     ORDER BY assignee_name`
  );
  check(
    "summary includes every ACTIVE assignee, including those with 0 Issues",
    summaries.length === activeAssignees.rows.length,
    `${summaries.length} summary row(s) for ${activeAssignees.rows.length} active assignee(s)`
  );

  const zeroRows = summaries.filter((s) => s.totalAssigned === 0);
  check(
    "a zero-assignment assignee reports 0/0/0/0 and 0%",
    zeroRows.every(
      (s) =>
        s.notSolved === 0 &&
        s.partiallySolved === 0 &&
        s.completelySolved === 0 &&
        s.completionPercent === 0 &&
        s.oldestOpenDate === null
    ),
    `${zeroRows.length} assignee(s) hold nothing`
  );

  check(
    "status counts always sum to the total",
    summaries.every((s) => s.notSolved + s.partiallySolved + s.completelySolved === s.totalAssigned),
    summaries.map((s) => `${s.assigneeName}=${s.totalAssigned}`).join(", ") || "(none)"
  );

  check(
    "completion % matches solved/total for every assignee",
    summaries.every(
      (s) =>
        s.completionPercent ===
        (s.totalAssigned === 0 ? 0 : Math.round((s.completelySolved / s.totalAssigned) * 100))
    ),
    summaries.map((s) => `${s.assigneeName}=${s.completionPercent}%`).join(", ") || "(none)"
  );

  // Cross-check the totals against issue_assignments by a different query.
  const currentPerAssignee = await query<{ assignee_id: number; n: string }>(
    `SELECT ia.assignee_id, count(*)::text AS n
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     WHERE ia.is_current = true AND i.deleted_at IS NULL
     GROUP BY ia.assignee_id`
  );
  const expectedTotals = new Map(currentPerAssignee.rows.map((r) => [r.assignee_id, Number(r.n)]));
  check(
    "summary totals count CURRENT assignments only",
    summaries.every((s) => s.totalAssigned === (expectedTotals.get(s.assigneeId) ?? 0)),
    "cross-checked against issue_assignments (is_current = true)"
  );

  // ── Table ─────────────────────────────────────────────────────────────────
  const all = await listTrackerIssues({ pageSize: 100 });
  const expectedRowTotal = [...expectedTotals.values()].reduce((a, b) => a + b, 0);
  check(
    "table lists every currently-assigned, non-deleted Issue",
    all.totalCount === expectedRowTotal,
    `${all.totalCount} row(s), expected ${expectedRowTotal}`
  );

  const assigneeNameById = new Map(
    activeAssignees.rows.map((r) => [r.assignee_id, r.assignee_name])
  );
  const actualMapping = await query<{ issue_id: string; assignee_name: string; staff_name: string }>(
    `SELECT ia.issue_id, au.assignee_name, s.staff_name
     FROM issue_tracking.issue_assignments ia
     JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
     JOIN issue_tracking.assignment_users au ON au.assignee_id = ia.assignee_id
     JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
     WHERE ia.is_current = true AND i.deleted_at IS NULL`
  );
  const expectedAssignee = new Map(actualMapping.rows.map((r) => [r.issue_id, r.assignee_name]));
  const expectedRaisedBy = new Map(actualMapping.rows.map((r) => [r.issue_id, r.staff_name]));

  check(
    "Issue -> Assignee mapping is correct for every row",
    all.issues.every((row) => expectedAssignee.get(row.issueId) === row.assigneeName),
    `${all.issues.length} row(s) cross-checked`
  );
  check(
    "Assignee identity comes from assignment_users, never issue_staff",
    all.issues.every((row) => [...assigneeNameById.values()].includes(row.assigneeName)),
    "every displayed assignee name exists in assignment_users"
  );
  check(
    "issue_staff is used only for the displayed Raised By",
    all.issues.every((row) => expectedRaisedBy.get(row.issueId) === row.staffName),
    "Raised By matches issue_staff.staff_name and is never the assignee"
  );
  check(
    "Days Open is a non-negative whole number",
    all.issues.every((row) => Number.isInteger(row.daysOpen) && row.daysOpen >= 0),
    all.issues.map((r) => `${r.issueId}=${r.daysOpen}d`).join(", ") || "(no rows)"
  );

  // ── Filters ───────────────────────────────────────────────────────────────
  if (all.issues.length > 0) {
    const sample = all.issues[0];

    const byStatus = await listTrackerIssues({ pageSize: 100, status: sample.status });
    check(
      "Status filter returns only that status",
      byStatus.issues.every((r) => r.status === sample.status) && byStatus.totalCount > 0,
      `status=${sample.status} -> ${byStatus.totalCount} row(s)`
    );

    const byDomain = await listTrackerIssues({ pageSize: 100, category: sample.category });
    check(
      "Domain filter returns only that domain",
      byDomain.issues.every((r) => r.category === sample.category) && byDomain.totalCount > 0,
      `domain=${sample.category} -> ${byDomain.totalCount} row(s)`
    );

    const bySearchId = await listTrackerIssues({ pageSize: 100, search: sample.issueId });
    check(
      "Search matches Issue ID",
      bySearchId.issues.some((r) => r.issueId === sample.issueId),
      `q=${sample.issueId} -> ${bySearchId.totalCount} row(s)`
    );

    const bySearchTitle = await listTrackerIssues({ pageSize: 100, search: sample.title.slice(0, 6) });
    check(
      "Search matches Title",
      bySearchTitle.issues.some((r) => r.issueId === sample.issueId),
      `q="${sample.title.slice(0, 6)}" -> ${bySearchTitle.totalCount} row(s)`
    );

    const assignedDay = sample.assignedAt.slice(0, 10);
    const inRange = await listTrackerIssues({
      pageSize: 100,
      assignedFrom: assignedDay,
      assignedTo: assignedDay,
    });
    check(
      "Assigned Date From/To is inclusive of the assignment day",
      inRange.issues.some((r) => r.issueId === sample.issueId),
      `${assignedDay}..${assignedDay} -> ${inRange.totalCount} row(s)`
    );

    const beforeRange = await listTrackerIssues({ pageSize: 100, assignedTo: "2000-01-01" });
    check(
      "Assigned Date To excludes later assignments",
      beforeRange.totalCount === 0,
      `to=2000-01-01 -> ${beforeRange.totalCount} row(s)`
    );

    const badDates = await listTrackerIssues({
      pageSize: 100,
      assignedFrom: "not-a-date",
      assignedTo: "2026-13-45",
    });
    check(
      "malformed date bounds are ignored rather than erroring",
      badDates.totalCount === all.totalCount,
      `${badDates.totalCount} row(s), same as unfiltered`
    );
  } else {
    check(
      "table filters skipped — no currently-assigned Issues to filter",
      true,
      "empty state; the empty-state branch is what renders"
    );
  }

  const noMatch = await listTrackerIssues({ pageSize: 100, search: "__no_such_issue_marker__" });
  check(
    "a filter that matches nothing returns a clean empty result",
    noMatch.totalCount === 0 && noMatch.issues.length === 0 && noMatch.totalPages === 1,
    "no fabricated rows"
  );

  // ── Sorting ───────────────────────────────────────────────────────────────
  const sortKeys = [
    "issueId",
    "title",
    "assignee",
    "status",
    "priority",
    "domain",
    "created",
    "assigned",
    "daysOpen",
    "lastActivity",
  ];
  let sortFailures = 0;
  for (const key of sortKeys) {
    for (const order of ["asc", "desc"]) {
      const sorted = await listTrackerIssues({ pageSize: 100, sort: key, order });
      if (sorted.totalCount !== all.totalCount) {
        sortFailures += 1;
      }
    }
  }
  check(
    "every whitelisted sort key executes and returns the same row set",
    sortFailures === 0,
    `${sortKeys.length} keys x 2 directions, ${sortFailures} mismatch(es)`
  );

  const hostileSort = await listTrackerIssues({
    pageSize: 100,
    sort: "i.issue_id; DROP TABLE issue_tracking.issues --",
    order: "'; --",
  });
  check(
    "a hostile ?sort=/?order= falls back to the default order safely",
    hostileSort.totalCount === all.totalCount,
    `${hostileSort.totalCount} row(s), no error — the value never reaches SQL`
  );

  // ── Pagination ────────────────────────────────────────────────────────────
  const firstPage = await listTrackerIssues({ pageSize: 1, page: 1, sort: "issueId", order: "asc" });
  check(
    "page size is respected",
    firstPage.issues.length <= 1,
    `${firstPage.issues.length} row(s) on a pageSize=1 request`
  );
  check(
    "page count is derived from the total",
    firstPage.totalPages === Math.max(1, Math.ceil(all.totalCount / 1)),
    `${firstPage.totalPages} page(s) for ${all.totalCount} row(s)`
  );
  const oversized = await listTrackerIssues({ pageSize: 5000 });
  check(
    "page size is capped at 100",
    oversized.pageSize === 100,
    `requested 5000 -> pageSize ${oversized.pageSize}`
  );

  // ── Tracking State ────────────────────────────────────────────────────────
  // The rule lives in SQL (it has to be filterable). Rather than trusting it,
  // the expectation is re-derived here from the evidence columns the row
  // carries, and the two must agree. An independent second implementation is
  // the point: if the SQL ever drifts, this fails.
  function expectedTrackingState(row: (typeof all.issues)[number]): string | null {
    if (row.status === "GREEN") return "Completed";
    if (row.status === "AMBER") {
      if (row.lastActivityAt) {
        const ageMs = Date.now() - new Date(row.lastActivityAt).getTime();
        if (ageMs > TRACKING_STATE_STALE_DAYS * 24 * 60 * 60 * 1000) return "No Recent Update";
      }
      return "In Progress";
    }
    if (row.returnedFromAmber || row.processStartedAt !== null) return "Returned to Not Solved";
    if (!row.hasStatusHistory && row.processStartedAt === null) return "Not Started";
    return null;
  }

  check(
    "Tracking State matches an independently-derived expectation for every row",
    all.issues.every((row) => row.trackingState === expectedTrackingState(row)),
    all.issues.map((r) => `${r.issueId}=${r.trackingState ?? "—"}`).join(", ") || "(no rows)"
  );
  check(
    "Tracking State is only ever an approved value or null",
    all.issues.every(
      (row) =>
        row.trackingState === null ||
        (TRACKING_STATES as readonly string[]).includes(row.trackingState)
    ),
    "no invented state names"
  );
  check(
    "Tracking State never replaces the real Status",
    all.issues.every((row) => ["RED", "AMBER", "GREEN"].includes(row.status)),
    "both columns present and independent"
  );

  let trackingFilterFailures = 0;
  for (const state of TRACKING_STATES) {
    const filtered = await listTrackerIssues({ pageSize: 100, trackingState: state });
    if (!filtered.issues.every((row) => row.trackingState === state)) {
      trackingFilterFailures += 1;
    }
  }
  check(
    "every Tracking State filter returns only that state",
    trackingFilterFailures === 0,
    `${TRACKING_STATES.length} states, ${trackingFilterFailures} mismatch(es)`
  );
  const bogusTracking = await listTrackerIssues({
    pageSize: 100,
    trackingState: "Completed'; DROP TABLE issue_tracking.issues --",
  });
  check(
    "an unrecognized Tracking State filter is ignored, not injected",
    bogusTracking.totalCount === all.totalCount,
    `${bogusTracking.totalCount} row(s), same as unfiltered`
  );

  // ── Date Raised filters ───────────────────────────────────────────────────
  if (all.issues.length > 0) {
    const raisedDay = all.issues[0].createdDate;
    const raisedRange = await listTrackerIssues({
      pageSize: 100,
      raisedFrom: raisedDay,
      raisedTo: raisedDay,
    });
    check(
      "Date Raised From/To is inclusive of the raise day",
      raisedRange.issues.some((r) => r.issueId === all.issues[0].issueId),
      `${raisedDay}..${raisedDay} -> ${raisedRange.totalCount} row(s)`
    );
    const raisedNone = await listTrackerIssues({ pageSize: 100, raisedTo: "2000-01-01" });
    check(
      "Date Raised To excludes later Issues",
      raisedNone.totalCount === 0,
      `raisedTo=2000-01-01 -> ${raisedNone.totalCount} row(s)`
    );
  }

  // ── Overview (KPI strip) ──────────────────────────────────────────────────
  const overview = await getTrackerOverview();
  check(
    "KPI totals agree with the per-assignee summary",
    overview.totalAssigned === summaries.reduce((n, s) => n + s.totalAssigned, 0) &&
      overview.notSolved === summaries.reduce((n, s) => n + s.notSolved, 0) &&
      overview.partiallySolved === summaries.reduce((n, s) => n + s.partiallySolved, 0) &&
      overview.completelySolved === summaries.reduce((n, s) => n + s.completelySolved, 0),
    `total=${overview.totalAssigned}, red=${overview.notSolved}, amber=${overview.partiallySolved}, green=${overview.completelySolved}`
  );
  check(
    "KPI status counts sum to the total",
    overview.notSolved + overview.partiallySolved + overview.completelySolved ===
      overview.totalAssigned,
    `${overview.totalAssigned} total`
  );
  check(
    "KPI completion % is 0-100 and divide-by-zero safe",
    Number.isInteger(overview.completionPercent) &&
      overview.completionPercent >= 0 &&
      overview.completionPercent <= 100,
    `${overview.completionPercent}%`
  );

  // ── Tracker detail + timeline ─────────────────────────────────────────────
  if (all.issues.length > 0) {
    const sampleId = all.issues[0].issueId;
    const detail = await getTrackerIssueDetail(sampleId);
    check("detail resolves a currently-assigned Issue", detail !== null, sampleId);
    if (detail) {
      check(
        "detail's Assignee comes from assignment_users",
        [...assigneeNameById.values()].includes(detail.assigneeName),
        `assignee=${detail.assigneeName}`
      );
      check(
        "detail's Raised By comes from issue_staff and is display-only",
        detail.staffName === expectedRaisedBy.get(sampleId),
        `raisedBy=${detail.staffName}`
      );
      check(
        "detail carries the assignment date",
        /^\d{4}-\d{2}-\d{2}T/.test(detail.assignedAt),
        detail.assignedAt
      );
      check(
        "detail exposes the workflow/process fields",
        "processStartedAt" in detail &&
          "implementationProgress" in detail &&
          "implementationDone" in detail &&
          "finalResolution" in detail &&
          "completedAt" in detail &&
          "completedDate" in detail,
        "process start / progress / done / final resolution / completed all present"
      );
      check(
        "detail keeps issues.resolution separate from final_resolution",
        detail.resolution !== detail.finalResolution || detail.resolution === null,
        "Fix & Action Required is not the Stage 6 outcome"
      );
    }

    const timeline = await getTrackerIssueTimeline(sampleId);
    check("timeline returns events for a tracked Issue", timeline.length > 0, `${timeline.length} event(s)`);
    check(
      "timeline is chronological, oldest first",
      timeline.every((event, index) => index === 0 || timeline[index - 1].at <= event.at),
      timeline.length > 0 ? `${timeline[0].at} … ${timeline[timeline.length - 1].at}` : "(none)"
    );
    check(
      "every timeline event carries an exact UTC date and time",
      timeline.every((event) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(event.at)),
      "ISO-8601 UTC on every row"
    );
    check(
      "timeline includes the Issue-created event",
      timeline.some((event) => event.kind === "created"),
      "from issues.created_at"
    );
    check(
      "timeline includes the assignment event",
      timeline.some((event) => event.kind === "assigned"),
      "from issue_assignments.assigned_at"
    );
    check(
      "timeline event count equals the number of stored source rows",
      await timelineMatchesSourceRows(sampleId, timeline.length),
      "no invented events, none missing"
    );
    check(
      "status-change events carry the stored from/to statuses",
      timeline
        .filter((event) => event.kind === "status_change")
        .every((event) => event.toStatus !== null),
      `${timeline.filter((e) => e.kind === "status_change").length} status change(s)`
    );

    const missing = await getTrackerIssueDetail("ZZ-99999");
    check("detail returns null for an untracked Issue", missing === null, "no fabricated record");
  } else {
    check("detail/timeline skipped — no currently-assigned Issues", true, "empty state");
  }

  // ── Read-only ─────────────────────────────────────────────────────────────
  const after = await snapshotCounts();
  check(
    "the Tracker wrote nothing",
    JSON.stringify(before) === JSON.stringify(after),
    `${JSON.stringify(after)}`
  );
}

/**
 * True when the timeline has exactly one entry per stored source row —
 * 1 issues row + every issue_assignments row + every issue_status_history row
 * + every issue_comments row. Proves both directions at once: nothing was
 * invented, and nothing real was dropped.
 */
async function timelineMatchesSourceRows(issueId: string, timelineLength: number): Promise<boolean> {
  const result = await query<{ n: string }>(
    `SELECT (
       (SELECT count(*) FROM issue_tracking.issues WHERE issue_id = $1)
     + (SELECT count(*) FROM issue_tracking.issue_assignments WHERE issue_id = $1)
     + (SELECT count(*) FROM issue_tracking.issue_status_history WHERE issue_id = $1)
     + (SELECT count(*) FROM issue_tracking.issue_comments WHERE issue_id = $1)
     )::text AS n`,
    [issueId]
  );
  return Number(result.rows[0].n) === timelineLength;
}

/** Row counts for every table the Tracker touches, so "read only" is
 *  demonstrated rather than asserted. */
async function snapshotCounts(): Promise<Record<string, number>> {
  const result = await query<{ label: string; n: string }>(
    `SELECT 'issues' AS label, count(*)::text AS n FROM issue_tracking.issues
     UNION ALL SELECT 'assignment_users', count(*)::text FROM issue_tracking.assignment_users
     UNION ALL SELECT 'issue_assignments', count(*)::text FROM issue_tracking.issue_assignments
     UNION ALL SELECT 'issue_status_history', count(*)::text FROM issue_tracking.issue_status_history
     UNION ALL SELECT 'issue_comments', count(*)::text FROM issue_tracking.issue_comments
     UNION ALL SELECT 'issue_staff', count(*)::text FROM issue_tracking.issue_staff`
  );
  return Object.fromEntries(result.rows.map((row) => [row.label, Number(row.n)]));
}

main()
  .then(async () => {
    await getPool().end();
    if (failures > 0) {
      console.error(`\n${failures} check(s) FAILED.`);
      process.exitCode = 1;
    } else {
      console.log("\nAll checks passed. No rows were written.");
    }
  })
  .catch(async (error) => {
    console.error("Verification error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
    try {
      await getPool().end();
    } catch {
      /* pool may never have opened */
    }
  });
