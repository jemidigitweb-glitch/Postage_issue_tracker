-- ============================================================================
-- migration/012_issue_work_details_verify.sql
--
-- READ-ONLY verification for migration/012_issue_work_details.sql.
-- Contains no BEGIN/COMMIT and no DDL/DML of any kind — every statement is a
-- SELECT. Safe to run at any time, before or after the migration.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/012_issue_work_details_verify.sql
-- ============================================================================

\echo '== 1. Connected database (must be varmen_db) =='
SELECT current_database() AS database;

\echo ''
\echo '== 2. The five columns added by migration 012 (expect 5 rows, all YES/nullable) =='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'issue_tracking'
  AND table_name   = 'issues'
  AND column_name IN (
      'implementation_progress',
      'implementation_done',
      'final_resolution',
      'process_started_at',
      'completed_at'
  )
ORDER BY column_name;

\echo ''
\echo '== 3. Pre-existing columns that must be UNCHANGED (resolution, completed_date) =='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'issue_tracking'
  AND table_name   = 'issues'
  AND column_name IN ('resolution', 'completed_date', 'status', 'created_date')
ORDER BY column_name;

\echo ''
\echo '== 4. Historical content preserved =='
\echo '   issues total, resolution non-null (historical "Fix & Action Required"),'
\echo '   and the count of rows whose status/ID could have been disturbed.'
SELECT
    count(*)                                        AS issues_total,
    count(resolution)                               AS resolution_non_null,
    count(*) FILTER (WHERE status = 'RED')          AS red,
    count(*) FILTER (WHERE status = 'AMBER')        AS amber,
    count(*) FILTER (WHERE status = 'GREEN')        AS green
FROM issue_tracking.issues;

\echo ''
\echo '== 5. Tables REUSED rather than duplicated (must still exist, untouched) =='
SELECT 'issue_status_history' AS table_name, count(*) AS rows FROM issue_tracking.issue_status_history
UNION ALL
SELECT 'issue_comments',        count(*) FROM issue_tracking.issue_comments
UNION ALL
SELECT 'issue_assignments',     count(*) FROM issue_tracking.issue_assignments;

\echo ''
\echo '== 6. Work-detail consistency invariants (each must return 0) =='
\echo '   a) GREEN with no final resolution'
\echo '   b) GREEN with no implementation done'
\echo '   c) GREEN with no completion timestamp'
\echo '   d) AMBER with no implementation progress'
\echo '   e) completed_at set but completed_date missing (or vice versa)'
\echo '   Rows recorded before migration 012 was applied are excluded from'
\echo '   (a)-(d) via process_started_at/completed_at IS NOT NULL where'
\echo '   relevant; a clean database returns 0 for all of them regardless.'
SELECT
    count(*) FILTER (WHERE status = 'GREEN' AND coalesce(btrim(final_resolution), '')    = '') AS a_green_no_final_resolution,
    count(*) FILTER (WHERE status = 'GREEN' AND coalesce(btrim(implementation_done), '') = '') AS b_green_no_implementation_done,
    count(*) FILTER (WHERE status = 'GREEN' AND completed_at IS NULL)                          AS c_green_no_completed_at,
    count(*) FILTER (WHERE status = 'AMBER' AND coalesce(btrim(implementation_progress), '') = ''
                       AND process_started_at IS NOT NULL)                                     AS d_amber_no_progress,
    count(*) FILTER (WHERE (completed_at IS NULL) <> (completed_date IS NULL))                 AS e_completion_stamp_mismatch
FROM issue_tracking.issues;

\echo ''
\echo '== 7. Any Issue currently carrying work details (informational) =='
SELECT
    issue_id,
    status,
    process_started_at,
    completed_at,
    completed_date,
    left(coalesce(implementation_progress, ''), 60) AS progress_preview,
    left(coalesce(implementation_done, ''), 60)     AS done_preview,
    left(coalesce(final_resolution, ''), 60)        AS final_resolution_preview
FROM issue_tracking.issues
WHERE implementation_progress IS NOT NULL
   OR implementation_done     IS NOT NULL
   OR final_resolution        IS NOT NULL
   OR process_started_at      IS NOT NULL
   OR completed_at            IS NOT NULL
ORDER BY issue_id;
