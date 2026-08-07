# components/issues

## Implemented

- `IssueTable.tsx` — list view for `app/dashboard/issues/page.tsx`, replaces
  the hardcoded data in `components/dashboard/OpenIssuesSummary.tsx` (that
  component itself is untouched — it's a separate dashboard-home widget).
  Renders an empty-state message when given zero issues.
- `IssueStatusBadge.tsx` — renders `RED`/`AMBER`/`GREEN` directly (the real
  database values — the mapping question flagged in
  `documentation/issue_tracker_application_structure.md` was resolved by
  taking that doc's "display the real values directly" option).
- `IssuePriorityBadge.tsx` — renders `critical`/`high`/`medium`/`low`, or a
  muted "—" when priority is `NULL` (the DB column is nullable).
- `IssueFilters.tsx` — plain GET `<form>` (search + staff/status/priority
  selects, no client JS) that resubmits `/dashboard/issues` with query
  params, which the page reads via `searchParams`.
- `IssueDetail.tsx` — detail view for `app/dashboard/issues/[issueId]/page.tsx`.
  Renders issue ID, title, description, staff, status, priority, created
  date, updated timestamp, and any `extra_data` fields present on that row
  (key names humanized, values displayed read-only — JSON-stringified for
  nested objects/arrays). Previous/Next navigation follows plain issue_id
  ordering (`lib/queries/issues.ts`'s `getAdjacentIssueIds()`), not the list
  page's created-date-first sort.

All of the above are Server Components that receive already-fetched data as
props — none of them import `lib/db.ts` or `lib/queries/*` directly; only
`app/dashboard/issues/page.tsx` does, per the server/client separation rule
in `documentation/issue_tracker_application_structure.md`.

## Planned, not yet implemented

- `AssignmentPanel.tsx` — assign/reassign UI (Management/Admin only)
- `CommentThread.tsx` — comments and investigation notes
- `StatusHistoryTimeline.tsx` — status/assignment history display
- `NewIssueForm.tsx` — submission form for `app/dashboard/issues/new/page.tsx`

Editing, assignment, comments, workflow, and issue creation are explicitly
out of scope for the current iteration — `app/dashboard/issues/page.tsx` is
list/read only.
