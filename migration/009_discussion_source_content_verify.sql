-- migration/009_discussion_source_content_verify.sql

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'issue_tracking' AND table_name = 'discussions' AND column_name = 'source_content';
-- expect: 1 row, data_type = 'jsonb', is_nullable = 'YES'

SELECT
    (SELECT count(*) FROM issue_tracking.issue_staff) AS staff_count,
    (SELECT count(*) FROM issue_tracking.issues)       AS issue_count,
    (SELECT count(*) FROM issue_tracking.discussions)  AS discussion_count;

SELECT discussion_id, source_content FROM issue_tracking.discussions ORDER BY discussion_id;
-- expect: source_content NULL for every row immediately after this migration
-- (population happens in a separate script)
