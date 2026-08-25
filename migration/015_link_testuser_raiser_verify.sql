-- ============================================================================
-- migration/015_link_testuser_raiser_verify.sql
--
-- READ-ONLY verification for migration/015_link_testuser_raiser.sql.
-- No BEGIN/COMMIT, no DDL, no DML — every statement is a SELECT. Safe to run
-- before as well as after.
--
-- No password_hash value is selected anywhere in this file.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/015_link_testuser_raiser_verify.sql
-- ============================================================================

\echo '== 1. Connection identity — BOTH values must match =='
SELECT
    current_database()                  AS "current_database",
    current_user                        AS "current_user",
    (current_database() = 'varmen_db' AND current_user = 'varmen_user') AS identity_ok;

\echo ''
\echo '== 2. The TU raiser (AFTER: exactly 1, TestUser, active) =='
SELECT staff_code, staff_name, active, created_at
FROM issue_tracking.issue_staff
WHERE staff_code = 'TU';

\echo ''
\echo '== 3. Every raiser — the Raised By filter source (expect 7) =='
\echo '   The six pre-existing rows must be byte-identical; TU is the only'
\echo '   addition.'
SELECT staff_code, staff_name, active
FROM issue_tracking.issue_staff
ORDER BY staff_code;

\echo ''
\echo '== 4. The link is 1:1 (expect exactly 1 linked account) =='
SELECT
    count(*)                                        AS users_total,
    count(*) FILTER (WHERE role = 'admin')          AS admin,
    count(*) FILTER (WHERE role = 'staff')          AS staff,
    count(*) FILTER (WHERE role = 'management')     AS management,
    count(*) FILTER (WHERE role = 'raised_by')      AS raised_by,
    count(staff_code)                               AS linked_accounts,
    count(*) FILTER (WHERE staff_code = 'TU')       AS linked_to_tu
FROM issue_tracking.management_users;

\echo ''
\echo '== 5. The linked account (no hash selected) =='
SELECT
    user_id,
    username,
    display_name,
    role,
    active,
    staff_code AS linked_staff_code,
    (password_hash IS NOT NULL AND length(password_hash) > 0) AS has_password
FROM issue_tracking.management_users
WHERE staff_code IS NOT NULL
ORDER BY user_id;

\echo ''
\echo '== 6. Nobody else is linked (must return 0 rows) =='
SELECT user_id, username, role, staff_code
FROM issue_tracking.management_users
WHERE staff_code IS NOT NULL
  AND role <> 'raised_by'
ORDER BY user_id;

\echo ''
\echo '== 7. TU has raised NOTHING yet, and owns no counter =='
\echo '   Both zero is what makes the first real Issue TU-001:'
\echo '   next_issue_id(TU) provisions the counter lazily at 1.'
SELECT
    (SELECT count(*) FROM issue_tracking.issues WHERE staff_code = 'TU')                 AS tu_issues,
    (SELECT count(*) FROM issue_tracking.issue_number_counters WHERE staff_code = 'TU')  AS tu_counter_rows,
    'TU-001'                                                                             AS next_real_issue_id;

\echo ''
\echo '== 8. Issues per raiser, and their counters — UNCHANGED =='
SELECT s.staff_code,
       (SELECT count(*) FROM issue_tracking.issues i WHERE i.staff_code = s.staff_code) AS issues,
       c.next_number
FROM issue_tracking.issue_staff s
LEFT JOIN issue_tracking.issue_number_counters c ON c.staff_code = s.staff_code
ORDER BY s.staff_code;

\echo ''
\echo '== 9. Historical Warehouse Mobile Issues still raised by WH =='
\echo '   The raiser and the SOURCE are different facts: these keep staff_code'
\echo '   WH, and mobileSource still records where they came from.'
SELECT issue_id, staff_code, created_date, (extra_data->>'mobileSource') AS mobile_source
FROM issue_tracking.issues
WHERE staff_code = 'WH'
   OR extra_data->>'mobileSource' IS NOT NULL
ORDER BY issue_id;

\echo ''
\echo '== 10. Total Issues — must be unchanged by 014 and 015 =='
SELECT count(*) AS issues_total, count(DISTINCT staff_code) AS distinct_raisers
FROM issue_tracking.issues;

\echo ''
\echo '== 11. No orphan relationships (all three must return 0) =='
\echo '   a) an account linked to a staff_code that does not exist'
\echo '   b) an Issue whose raiser does not exist'
\echo '   c) a counter whose staff_code does not exist'
SELECT
    (SELECT count(*) FROM issue_tracking.management_users mu
      WHERE mu.staff_code IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM issue_tracking.issue_staff s WHERE s.staff_code = mu.staff_code)) AS a_account_orphans,
    (SELECT count(*) FROM issue_tracking.issues i
      WHERE NOT EXISTS (SELECT 1 FROM issue_tracking.issue_staff s WHERE s.staff_code = i.staff_code))   AS b_issue_orphans,
    (SELECT count(*) FROM issue_tracking.issue_number_counters c
      WHERE NOT EXISTS (SELECT 1 FROM issue_tracking.issue_staff s WHERE s.staff_code = c.staff_code))   AS c_counter_orphans;
