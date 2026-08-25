-- ============================================================================
-- migration/013_raised_by_staff_auth_verify.sql
--
-- READ-ONLY verification for migration/013_raised_by_staff_auth.sql.
-- Contains no BEGIN/COMMIT and no DDL/DML of any kind — every statement is a
-- SELECT. Safe to run at any time, before or after the migration, and it is
-- worth running BEFORE as well: sections 3-5 are the "nothing changed" baseline
-- to compare against afterwards.
--
-- No password_hash value is selected anywhere in this file. Section 5 reports
-- only whether a hash is present and how long it is, never the hash itself.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/013_raised_by_staff_auth_verify.sql
-- ============================================================================

\echo '== 1. Connection identity — BOTH values must match =='
\echo '   Expected:  current_database = varmen_db'
\echo '              current_user     = varmen_user'
\echo '   This is the same pair the migration and rollback gate on. If either'
\echo '   column differs, do not run 013 against this connection.'
\echo '   No connection string, host, port or password is selected — only the'
\echo '   two identity values the server reports.'
-- current_user is a reserved word, so the alias is quoted; current_database is
-- not, but both are quoted here for symmetry.
SELECT
    current_database()                  AS "current_database",
    current_user                        AS "current_user",
    (current_database() = 'varmen_db')  AS database_ok,
    (current_user = 'varmen_user')      AS user_ok,
    (current_database() = 'varmen_db' AND current_user = 'varmen_user') AS identity_ok;

\echo ''
\echo '== 2. The role constraint (AFTER: must list staff, management, admin, raised_by) =='
\echo '   BEFORE the migration this shows the three-value list; that is the'
\echo '   expected pre-state, not a failure.'
SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS definition,
    (pg_get_constraintdef(con.oid) LIKE '%raised_by%') AS accepts_raised_by
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'issue_tracking'
  AND rel.relname = 'management_users'
  AND con.contype = 'c'
ORDER BY con.conname;

\echo ''
\echo '== 3. Column shape UNCHANGED (no column added, dropped or retyped) =='
\echo '   Expect exactly: user_id, username, display_name, email, password_hash,'
\echo '   role, active, created_at, updated_at — and no staff_code.'
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'issue_tracking'
  AND table_name   = 'management_users'
ORDER BY ordinal_position;

\echo ''
\echo '== 4. Existing accounts UNCHANGED (compare against the pre-migration run) =='
\echo '   Every count here must be identical before and after. The migration'
\echo '   performs no INSERT/UPDATE/DELETE, so any difference means something'
\echo '   else wrote to this table.'
SELECT
    count(*)                                            AS users_total,
    count(*) FILTER (WHERE role = 'admin')              AS admin,
    count(*) FILTER (WHERE role = 'staff')              AS staff,
    count(*) FILTER (WHERE role = 'management')         AS management,
    count(*) FILTER (WHERE role = 'raised_by')          AS raised_by,
    count(*) FILTER (WHERE active)                      AS active_users,
    max(updated_at)                                     AS latest_updated_at
FROM issue_tracking.management_users;

\echo ''
\echo '== 5. Per-account snapshot (no password_hash value is selected) =='
SELECT
    user_id,
    username,
    display_name,
    role,
    active,
    (password_hash IS NOT NULL AND length(password_hash) > 0) AS has_password,
    length(password_hash)                                     AS hash_length,
    created_at,
    updated_at
FROM issue_tracking.management_users
ORDER BY user_id;

\echo ''
\echo '== 6. Every existing role value is still valid under the new constraint =='
\echo '   Must return 0 rows.'
SELECT user_id, username, role
FROM issue_tracking.management_users
WHERE role NOT IN ('staff', 'management', 'admin', 'raised_by')
ORDER BY user_id;

\echo ''
\echo '== 7. No migration probe row survived (must return 0) =='
\echo '   The migration and rollback each insert and remove a temporary probe'
\echo '   inside their transaction. Neither may leave anything behind.'
SELECT count(*) AS leftover_probe_rows
FROM issue_tracking.management_users
WHERE username LIKE '\_\_migration\_013%';

\echo ''
\echo '== 8. Warehouse Mobile identity is SEPARATE from login identity =='
\echo '   The WH reporter lives in issue_staff and is untouched by this'
\echo '   migration. A Raised-by-Staff login does not become an Issue raiser.'
SELECT staff_code, staff_name, active
FROM issue_tracking.issue_staff
WHERE staff_code = 'WH';

\echo ''
\echo '== 9. Nothing outside management_users was altered by 013 =='
\echo '   Row counts for the tables this feature reads. Informational baseline —'
\echo '   the migration touches none of them.'
SELECT 'issues'          AS table_name, count(*) AS rows FROM issue_tracking.issues
UNION ALL
SELECT 'issue_staff',          count(*) FROM issue_tracking.issue_staff
UNION ALL
SELECT 'issue_assignments',    count(*) FROM issue_tracking.issue_assignments
UNION ALL
SELECT 'issue_number_counters', count(*) FROM issue_tracking.issue_number_counters;
