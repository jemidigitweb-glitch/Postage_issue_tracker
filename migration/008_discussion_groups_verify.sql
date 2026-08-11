-- ============================================================================
-- migration/008_discussion_groups_verify.sql
-- Verification queries — run these after 008_discussion_groups.sql completes.
-- ============================================================================

-- 1. Confirm the new table/columns exist.
SELECT 'issue_tracking.discussion_groups' AS object_name,
    to_regclass('issue_tracking.discussion_groups') IS NOT NULL AS exists;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'issue_tracking' AND table_name = 'discussions'
  AND column_name IN ('group_id', 'issue_link_type', 'linked_issue_id')
ORDER BY column_name;
-- expect: 3 rows, all is_nullable = 'YES' (issue_link_type has a NOT NULL
-- DEFAULT applied at write time via the DEFAULT clause, but the column
-- itself still reports nullable=NO because of its own NOT NULL — confirm
-- it shows 'NO' specifically for issue_link_type, 'YES' for the other two)

-- 2. Historical/Issue data preservation.
SELECT
    (SELECT count(*) FROM issue_tracking.issue_staff) AS staff_count,
    (SELECT count(*) FROM issue_tracking.issues)       AS issue_count;

-- 3. Every discussions row that existed before this migration still exists,
--    with every pre-existing column unchanged (spot check DISC-001/DISC-002).
SELECT discussion_id, title, status, coordinator_name, group_id, issue_link_type, linked_issue_id
FROM issue_tracking.discussions
ORDER BY discussion_id;
-- expect: group_id/linked_issue_id NULL and issue_link_type = 'discussion_only'
-- for every row that existed before this migration (nothing backfilled)

-- 4. New CHECK constraint definition.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'issue_tracking.discussions'::regclass
  AND conname = 'chk_discussions_linked_issue_consistency';

-- 5. FK targets are correct.
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS references_table, ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'issue_tracking' AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'discussions' AND kcu.column_name IN ('group_id', 'linked_issue_id');
-- expect: group_id -> discussion_groups.group_id; linked_issue_id -> issues.issue_id

-- 6. Indexes exist.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'issue_tracking' AND tablename = 'discussions'
  AND indexname IN ('idx_discussions_group_id', 'idx_discussions_linked_issue_id');
