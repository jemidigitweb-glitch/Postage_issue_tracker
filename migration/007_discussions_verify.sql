-- ============================================================================
-- migration/007_discussions_verify.sql
-- Verification queries — run these after 007_discussions.sql completes.
-- Mirrors the style of migration/002_issue_management_system_verify.sql.
--
-- NOT everything below is read-only: query 6 calls next_discussion_id(),
-- which performs a real UPDATE against issue_tracking.discussion_id_counter
-- (that's the whole point: it proves the function actually works). That
-- UPDATE is wrapped in an explicit BEGIN/ROLLBACK, so it leaves no
-- persisted change.
-- ============================================================================

-- 1. Confirm all 7 new objects exist, in the correct schema, with the
--    correct object type.
SELECT
    'issue_tracking.discussions' AS object_name, 'table' AS expected_type,
    to_regclass('issue_tracking.discussions') IS NOT NULL AS exists
UNION ALL
SELECT 'issue_tracking.discussion_id_counter', 'table',
    to_regclass('issue_tracking.discussion_id_counter') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.discussion_participants', 'table',
    to_regclass('issue_tracking.discussion_participants') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.discussion_points', 'table',
    to_regclass('issue_tracking.discussion_points') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.discussion_status_history', 'table',
    to_regclass('issue_tracking.discussion_status_history') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.discussion_comments', 'table',
    to_regclass('issue_tracking.discussion_comments') IS NOT NULL
UNION ALL
SELECT 'issue_tracking.next_discussion_id', 'function',
    EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'issue_tracking' AND p.proname = 'next_discussion_id'
    );
-- expect: exists = true for all 7 rows

-- 2. Confirm every new object is actually inside issue_tracking.
SELECT c.relname AS object_name, n.nspname AS schema_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('discussions', 'discussion_id_counter', 'discussion_participants',
                     'discussion_points', 'discussion_status_history', 'discussion_comments')
ORDER BY c.relname;
-- expect: schema_name = 'issue_tracking' for every row, 6 rows total

-- 3. Historical/Issue data preservation — the critical check.
SELECT
    (SELECT count(*) FROM issue_tracking.issue_staff) AS staff_count,
    (SELECT count(*) FROM issue_tracking.issues)       AS issue_count;
-- expect: same counts as immediately before this migration ran

-- 4. issue_staff / issues table structure unchanged — no ALTER should have
--    run against either.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'issue_tracking' AND table_name IN ('issue_staff', 'issues')
ORDER BY table_name, ordinal_position;

-- 5. discussion_id_counter seeded correctly — exactly one row, next_number = 1
--    (before any Discussion is created).
SELECT id, next_number FROM issue_tracking.discussion_id_counter;
-- expect: exactly 1 row, id = 1

-- 6. next_discussion_id() produces the expected format. Run inside a
--    transaction you roll back — this function has a real side effect
--    (increments the counter) so it must never be called outside a
--    ROLLBACK during verification.
BEGIN;
SELECT issue_tracking.next_discussion_id() AS sample_generated_id;
-- expect: 'DISC-001' (or current next+1, formatted correctly) if run before
-- any real Discussion has been created
ROLLBACK;
-- confirm the counter is unchanged after the rollback above:
SELECT id, next_number FROM issue_tracking.discussion_id_counter;

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
  AND tc.table_name IN ('discussions', 'discussion_participants', 'discussion_points',
                         'discussion_status_history', 'discussion_comments')
ORDER BY tc.table_name, kcu.column_name;
-- expect: discussion_points.linked_issue_id -> issues.issue_id (the ONLY
-- new FK into a pre-existing table); everything else -> discussions.discussion_id
-- or management_users.user_id

-- 8. status CHECK constraints on discussions/discussion_points/
--    discussion_status_history contain exactly the approved values.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('issue_tracking.discussions'::regclass,
                    'issue_tracking.discussion_points'::regclass,
                    'issue_tracking.discussion_status_history'::regclass)
  AND contype = 'c'
ORDER BY table_name, conname;
-- expect: status/from_status/to_status checks mention 'RED','AMBER','GREEN'

-- 9. Indexes exist on every new table's discussion_id / lookup columns.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'issue_tracking'
  AND tablename IN ('discussions', 'discussion_participants', 'discussion_points',
                     'discussion_status_history', 'discussion_comments')
ORDER BY tablename, indexname;
