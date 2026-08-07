-- ============================================================================
-- migration/002_issue_management_system_verify.sql
-- Verification queries — run these after 002_issue_management_system.sql
-- completes. Mirrors the style of migration/verify.sql.
--
-- NOT everything below is read-only: queries 1-5 and 7-10 are plain
-- SELECT-only. Query 6 is the exception — it calls next_issue_id(), which
-- performs a real UPDATE against issue_tracking.issue_number_counters
-- (that's the whole point: it proves the function actually works). That
-- UPDATE is wrapped in an explicit BEGIN/ROLLBACK, so it leaves no persisted
-- change — but running it does require UPDATE privilege on
-- issue_number_counters, not just SELECT privilege. If this script is ever
-- run under a strictly read-only reporting role, query 6 will fail with a
-- permission error where every other query here succeeds.
-- ============================================================================

-- 1. Confirm all 7 new objects exist, in the correct schema, with the
--    correct object type.
SELECT
    'issue_tracking.management_users' AS object_name, 'table' AS expected_type,
    to_regclass('issue_tracking.management_users') IS NOT NULL AS exists
UNION ALL
SELECT 'issue_tracking.issue_number_counters', 'table',
    to_regclass('issue_tracking.issue_number_counters') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.issue_status_history', 'table',
    to_regclass('issue_tracking.issue_status_history') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.issue_assignment_history', 'table',
    to_regclass('issue_tracking.issue_assignment_history') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.issue_comments', 'table',
    to_regclass('issue_tracking.issue_comments') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.v_current_assignment', 'view',
    to_regclass('issue_tracking.v_current_assignment') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.next_issue_id', 'function',
    EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'issue_tracking' AND p.proname = 'next_issue_id'
    );
-- expect: exists = true for all 7 rows

-- 2. Confirm every new object is actually inside issue_tracking (not some
--    other schema by accident, e.g. public via search_path).
SELECT c.relname AS object_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' END AS object_type,
       n.nspname AS schema_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('management_users', 'issue_number_counters',
                     'issue_status_history', 'issue_assignment_history',
                     'issue_comments', 'v_current_assignment')
ORDER BY c.relname;
-- expect: schema_name = 'issue_tracking' for every row, 6 rows total

-- 3. Historical data preservation — the critical check. Must still read
--    exactly 4 and 92.
SELECT
    (SELECT count(*) FROM issue_tracking.issue_staff) AS staff_count,  -- expect 4
    (SELECT count(*) FROM issue_tracking.issues)       AS issue_count;  -- expect 92

-- 4. Historical table structure unchanged — column list/order must match
--    exactly what existed before this migration (no ALTER should have run).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'issue_tracking' AND table_name IN ('issue_staff', 'issues')
ORDER BY table_name, ordinal_position;
-- expect: 5 columns for issue_staff, 13 for issues — identical to the
-- pre-migration schema (see migration/002_issue_management_system_PROPOSAL.md §1)

-- 5. issue_number_counters seeded correctly — one row per staff_code, with
--    next_number = (max existing issue number for that code) + 1.
SELECT
    c.staff_code,
    c.next_number,
    COALESCE(MAX((split_part(i.issue_id, '-', 2))::int), 0) + 1 AS expected_next_number
FROM issue_tracking.issue_number_counters c
LEFT JOIN issue_tracking.issues i ON i.staff_code = c.staff_code
GROUP BY c.staff_code, c.next_number
ORDER BY c.staff_code;
-- expect: next_number = expected_next_number for every row (ND=46, SA=28,
-- ST=7, NV=15 today), and exactly 4 rows (one per current staff_code)

-- 6. next_issue_id() produces the expected format and does not collide with
--    any existing historical ID. Run inside a transaction you roll back —
--    this function has a real side effect (increments the counter) so it
--    must never be called outside a ROLLBACK during verification.
BEGIN;
SELECT issue_tracking.next_issue_id('ND') AS sample_generated_id;
-- expect: 'ND-046' (or current max+1) — a value that does NOT already exist
-- in issue_tracking.issues
ROLLBACK;
-- the ROLLBACK above undoes the counter increment this test caused —
-- confirm counters are unchanged after this block:
SELECT staff_code, next_number FROM issue_tracking.issue_number_counters ORDER BY staff_code;

-- 7. Foreign keys land on the correct tables/columns.
SELECT
    tc.table_name, tc.constraint_name, kcu.column_name,
    ccu.table_name AS references_table, ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'issue_tracking'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('issue_number_counters', 'issue_status_history',
                         'issue_assignment_history', 'issue_comments')
ORDER BY tc.table_name, kcu.column_name;
-- expect: issue_number_counters.staff_code -> issue_staff.staff_code;
-- issue_status_history.issue_id / issue_assignment_history.issue_id /
-- issue_comments.issue_id -> issues.issue_id; changed_by/assigned_to/
-- assigned_by/author_id -> management_users.user_id

-- 8. Role CHECK constraint contains exactly the approved 3 values.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'issue_tracking.management_users'::regclass
  AND contype = 'c';
-- expect one row whose definition mentions exactly 'staff', 'management', 'admin'

-- 9. comment_type and status CHECK constraints contain exactly the
--    approved values.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('issue_tracking.issue_comments'::regclass,
                    'issue_tracking.issue_status_history'::regclass)
  AND contype = 'c'
ORDER BY table_name, conname;
-- expect: issue_comments check mentions 'comment','investigation_note';
-- issue_status_history checks mention 'RED','AMBER','GREEN' (both from_status
-- and to_status)

-- 10. Indexes exist on every new table's issue_id / lookup columns.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'issue_tracking'
  AND tablename IN ('issue_status_history', 'issue_assignment_history', 'issue_comments')
ORDER BY tablename, indexname;
-- expect: PK index on each table, plus the explicit idx_* indexes created
-- in 002_issue_management_system.sql
