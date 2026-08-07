# lib/queries

## Implemented

- **`users.ts`** (Stage 14b) — authentication-only reads against
  `issue_tracking.management_users`: `findUserForLogin(identifier)` (by
  username or email, includes `password_hash` — login use only) and
  `findUserById(userId)` (DTO-shaped, no `password_hash` — used by
  `lib/auth.ts`'s `getCurrentUser()`). Read-only; no write is issued from
  this file. See `documentation/issue_tracker_auth_implementation_plan.md`.
- **`staff.ts`** — read-only lookups against `issue_tracking.issue_staff`:
  `listStaff()` returns every staff row (active and inactive), used to
  populate the staff filter on `/dashboard/issues`.
- **`issues.ts`** — read-only against `issue_tracking.issues` (joined to
  `issue_tracking.issue_staff` for the staff name):
  - `listIssues({ page, pageSize, search, staffCode, status, priority })`
    returns a server-side-paginated page of issues plus `totalCount`. Search
    matches `issue_id`/`issue_title` (ILIKE, wildcards escaped). `status`
    and `priority` are validated against the DB's CHECK-constraint values;
    unrecognized values are treated as "no filter", never rejected.
  - `getIssueById(issueId)` — single-issue lookup by exact `issue_id`,
    including `issue_description`, `updated_at`, and `extra_data`. Returns
    `null` if no row matches.
  - `getAdjacentIssueIds(issueId)` — previous/next `issue_id` by plain
    lexicographic ordering (matches the primary key's own btree index).
  - `isValidIssueId(issueId)` — format check only (no query), lets callers
    distinguish "invalid ID" from "valid ID, not found".

  No write is issued from this file. List/read only — no editing,
  assignment, comments, workflow, or issue creation yet.

Both `staff.ts` and `issues.ts` call `lib/db.ts`'s `query()` helper (not
`getPool().query()` directly) — `query()` confirms
`current_database() = 'varmen_db'` once per process before the first real
query runs, per the safety requirement carried from
`migration/002_issue_management_system.sql`.

## Planned, not yet implemented

- `comments.ts` — `issue_tracking.issue_comments`
- `assignments.ts` — `issue_tracking.issue_assignment_history` +
  `issue_tracking.v_current_assignment`
- `statusHistory.ts` — `issue_tracking.issue_status_history`

Every module here will:
- Import the pool from `../db.ts` only — never create its own connection
- Use parameterized queries exclusively (no string-concatenated SQL),
  matching the discipline already established in `migration/migrate-issues.js`
- Stay scoped to `issue_tracking.*` — never query `ledsone`, `ph_dashboard`,
  `postgres`, `staff.users`, or any HR/company staff table
- Be called only from Server Actions or Route Handlers — never imported by
  a Client Component
