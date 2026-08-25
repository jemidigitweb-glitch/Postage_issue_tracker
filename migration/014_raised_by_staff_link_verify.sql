-- ============================================================================
-- migration/014_raised_by_staff_link_verify.sql
--
-- READ-ONLY verification for migration/014_raised_by_staff_link.sql.
-- Contains no BEGIN/COMMIT and no DDL/DML — every statement is a SELECT. Safe
-- to run before as well as after: sections 4-7 are the "nothing changed"
-- baseline to compare against.
--
-- No password_hash value is selected anywhere in this file.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/014_raised_by_staff_link_verify.sql
-- ============================================================================

\echo '== 1. Connection identity — BOTH values must match =='
\echo '   Expected:  current_database = varmen_db / current_user = varmen_user'
SELECT
    current_database()                  AS "current_database",
    current_user                        AS "current_user",
    (current_database() = 'varmen_db' AND current_user = 'varmen_user') AS identity_ok;

\echo ''
\echo '== 2. The staff_code column (AFTER: nullable varchar(20)) =='
\echo '   BEFORE the migration this returns 0 rows — the expected pre-state.'
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'issue_tracking'
  AND table_name   = 'management_users'
  AND column_name  = 'staff_code';

\echo ''
\echo '== 3. The two constraints it must carry (AFTER: expect both) =='
\echo '   management_users_staff_code_fkey -> issue_staff(staff_code)'
\echo '   management_users_staff_code_key  -> UNIQUE, giving a 1:1 link'
SELECT con.conname AS constraint_name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'issue_tracking'
  AND rel.relname = 'management_users'
  AND con.conname IN ('management_users_staff_code_fkey', 'management_users_staff_code_key')
ORDER BY con.conname;

\echo ''
\echo '== 4. NOBODY is linked by this migration (linked must be 0) =='
\echo '   Migration 014 adds structure only. The first real link is a later,'
\echo '   separately-approved step.'
SELECT
    count(*)                                     AS users_total,
    count(*) FILTER (WHERE role = 'admin')       AS admin,
    count(*) FILTER (WHERE role = 'staff')       AS staff,
    count(*) FILTER (WHERE role = 'management')  AS management,
    count(*) FILTER (WHERE role = 'raised_by')   AS raised_by,
    max(updated_at)                              AS latest_updated_at
FROM issue_tracking.management_users;

\echo ''
\echo '== 5. Raised-by accounts and their link state (no hash selected) =='
\echo '   AFTER 014 and BEFORE the linking migration, linked_staff_code is'
\echo '   expected to be NULL — that is the pending work, not a failure.'
-- linked_staff_code is read through to_jsonb so this file runs unchanged both
-- BEFORE the column exists (returns NULL) and after. The row's password_hash
-- is never projected — only the staff_code key is extracted.
SELECT
    mu.user_id,
    mu.username,
    mu.display_name,
    mu.role,
    mu.active,
    (mu.password_hash IS NOT NULL AND length(mu.password_hash) > 0) AS has_password,
    (to_jsonb(mu) ->> 'staff_code') AS linked_staff_code
FROM issue_tracking.management_users mu
WHERE mu.role = 'raised_by'
ORDER BY mu.user_id;

\echo ''
\echo '== 6. Issue raisers — the source of the Raised By filter — UNCHANGED =='
\echo '   Expected: AT, ND, NV, SA, ST, WH. No row added, removed or renamed'
\echo '   by this migration.'
SELECT staff_code, staff_name, active, created_at
FROM issue_tracking.issue_staff
ORDER BY staff_code;

\echo ''
\echo '== 7. Issues and ID counters UNCHANGED =='
\echo '   staff_code drives issue_id via issue_tracking.next_issue_id(); this'
\echo '   migration must not disturb a single Issue or a single counter.'
SELECT i.staff_code, count(*) AS issues, max(c.next_number) AS next_number
FROM issue_tracking.issues i
LEFT JOIN issue_tracking.issue_number_counters c ON c.staff_code = i.staff_code
GROUP BY i.staff_code
ORDER BY i.staff_code;

\echo ''
\echo '== 8. Historical Warehouse Mobile Issues (must remain raised by WH) =='
SELECT issue_id, staff_code, created_date, (extra_data->>'mobileSource') AS mobile_source
FROM issue_tracking.issues
WHERE staff_code = 'WH'
   OR extra_data->>'mobileSource' IS NOT NULL
ORDER BY issue_id;

\echo ''
\echo '== 9. PENDING INVARIANT — raised_by accounts with no raiser =='
\echo '   Reported, NOT enforced. A CHECK making this impossible belongs in a'
\echo '   migration applied AFTER every raised_by account is linked; adding it'
\echo '   now would abort against the account that already exists.'
SELECT
    count(*)                                                          AS raised_by_total,
    count(*) FILTER (WHERE (to_jsonb(mu) ->> 'staff_code') IS NULL)   AS without_staff_code,
    count(*) FILTER (WHERE (to_jsonb(mu) ->> 'staff_code') IS NOT NULL) AS linked
FROM issue_tracking.management_users mu
WHERE mu.role = 'raised_by';

\echo ''
\echo '== 10. Assignee link is a SEPARATE relationship and is untouched =='
\echo '   assignment_users answers "assigned to whom", issue_staff answers'
\echo '   "raised by whom". They must not be conflated.'
SELECT count(*) AS assignment_users_total, count(user_id) AS with_login
FROM issue_tracking.assignment_users;
