-- ============================================================================
-- migration/011_assignment_user_login_link_verify.sql
--
-- STATUS: PROPOSAL — NOT EXECUTED.
--
-- Read-only verification for migration/011_assignment_user_login_link.sql.
-- Run manually AFTER 011 has been applied. Contains SELECT statements only —
-- no BEGIN/COMMIT, no DDL, no DML, nothing that can modify a single row.
--
-- Expected values below are the counts observed at Stage 1 audit time
-- (2026-08-12). If assignees or issues are legitimately added between the
-- audit and execution, the *counts* will differ but the *relationships* and
-- *preservation* checks (queries 4-8) must still hold exactly as stated.
-- ============================================================================


-- ── 1. The new column exists, with the right type and nullability ───────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'issue_tracking'
  AND table_name   = 'assignment_users'
  AND column_name  = 'user_id';
-- EXPECT: exactly 1 row
--         data_type      = 'bigint'
--         is_nullable    = 'YES'
--         column_default = NULL


-- ── 2. The foreign key to management_users exists ───────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'issue_tracking'::regnamespace
  AND conrelid     = 'issue_tracking.assignment_users'::regclass
  AND contype      = 'f';
-- EXPECT: exactly 1 row, definition =
--   FOREIGN KEY (user_id) REFERENCES issue_tracking.management_users(user_id) ON DELETE RESTRICT


-- ── 3. The partial unique index exists and is genuinely UNIQUE + PARTIAL ────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'issue_tracking'
  AND tablename  = 'assignment_users'
ORDER BY indexname;
-- EXPECT: uidx_assignment_users_user_id present, and its indexdef contains
--         both 'CREATE UNIQUE INDEX' and 'WHERE (user_id IS NOT NULL)'.
--         assignment_users_pkey and assignment_users_assignee_name_key must
--         still be present and unchanged.


-- ── 4. All pre-existing assignment_users rows are intact and unmodified ─────
SELECT assignee_id, assignee_name, active, created_at, user_id
FROM issue_tracking.assignment_users
ORDER BY assignee_id;
-- EXPECT: 10 rows, assignee_id 1..10 —
--         1 Rajive, 2 Mayurika, 3 Arun, 4 Suman, 5 Manoranjiny,
--         6 Luxcika, 7 Janany, 8 Varman, 9 Muhuntha, 10 Bietrick
--         active = true for every row
--         created_at unchanged
--         user_id = NULL for EVERY row (011 links nobody)


-- ── 5. Nothing was linked by the migration itself ───────────────────────────
SELECT count(*) AS linked_rows
FROM issue_tracking.assignment_users
WHERE user_id IS NOT NULL;
-- EXPECT: 0
-- (After provisioning, this becomes the count of assignees who have a login.)


-- ── 6. Row counts preserved across the whole issue_tracking module ──────────
SELECT
    (SELECT count(*) FROM issue_tracking.assignment_users)                          AS assignment_users,
    (SELECT count(*) FROM issue_tracking.management_users)                          AS management_users,
    (SELECT count(*) FROM issue_tracking.issues)                                    AS issues,
    (SELECT count(*) FROM issue_tracking.issues WHERE deleted_at IS NULL)           AS issues_active,
    (SELECT count(*) FROM issue_tracking.issue_staff)                               AS issue_staff,
    (SELECT count(*) FROM issue_tracking.issue_assignments)                         AS issue_assignments,
    (SELECT count(*) FROM issue_tracking.issue_assignments WHERE is_current)        AS issue_assignments_current,
    (SELECT count(*) FROM issue_tracking.issue_status_history)                      AS issue_status_history,
    (SELECT count(*) FROM issue_tracking.issue_comments)                            AS issue_comments;
-- EXPECT (values observed at audit time, 2026-08-12):
--   assignment_users          = 10
--   management_users          = 1
--   issues                    = 144
--   issues_active             = 144
--   issue_staff               = 5
--   issue_assignments         = 0
--   issue_assignments_current = 0
--   issue_status_history      = 0
--   issue_comments            = 0
-- Every one of these must be UNCHANGED from the pre-migration value.


-- ── 7. The existing Super Admin login is untouched ──────────────────────────
SELECT user_id, username, display_name, email, role, active, created_at, updated_at
FROM issue_tracking.management_users
ORDER BY user_id;
-- EXPECT: exactly 1 row — user_id = 1, username = 'admin_test',
--         role = 'admin', active = true. 011 must not have altered it.


-- ── 8. The 1:1 invariant holds (must return zero rows, always) ──────────────
SELECT user_id, count(*) AS assignee_rows
FROM issue_tracking.assignment_users
WHERE user_id IS NOT NULL
GROUP BY user_id
HAVING count(*) > 1;
-- EXPECT: 0 rows. Any row here means one login is linked to more than one
--         assignee, which uidx_assignment_users_user_id should have made
--         impossible.


-- ── 9. Ownership chain is resolvable end to end (read-only sanity check) ────
-- Proves the join path the application will use:
--   management_users.user_id -> assignment_users.user_id
--   -> assignment_users.assignee_id -> issue_assignments.assignee_id -> issues
SELECT
    mu.user_id,
    mu.username,
    mu.role,
    au.assignee_id,
    au.assignee_name,
    count(ia.issue_id) AS currently_assigned_issues
FROM issue_tracking.management_users mu
JOIN issue_tracking.assignment_users au ON au.user_id = mu.user_id
LEFT JOIN issue_tracking.issue_assignments ia
       ON ia.assignee_id = au.assignee_id AND ia.is_current
LEFT JOIN issue_tracking.issues i
       ON i.issue_id = ia.issue_id AND i.deleted_at IS NULL
GROUP BY mu.user_id, mu.username, mu.role, au.assignee_id, au.assignee_name
ORDER BY au.assignee_name;
-- EXPECT immediately after 011: 0 rows (nobody is linked yet).
-- After provisioning: one row per linked assignee. This query must never
-- return the Super Admin (user_id = 1) — the Super Admin is not an assignee.
