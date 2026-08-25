-- ============================================================================
-- migration/017_issue_id_gap_reuse_verify.sql
--
-- READ-ONLY. Confirms migration/017_issue_id_gap_reuse.sql landed and that
-- nothing else moved with it.
--
-- Contains NO INSERT, NO UPDATE, NO DELETE and NO DDL. Safe to run at any
-- time, before or after the migration, as many times as you like.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/017_issue_id_gap_reuse_verify.sql
-- ============================================================================

\echo '--- 0. Identity (must be varmen_db / varmen_user) ---'
SELECT current_database(), current_user;

\echo ''
\echo '--- 1. next_issue_id() exists and its body mentions the new gap logic ---'
SELECT p.proname,
       pg_get_functiondef(p.oid) ILIKE '%released%' AS has_gap_reuse_logic,
       pg_get_functiondef(p.oid) ILIKE '%SKIP LOCKED%' AS has_skip_locked
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'issue_tracking'
   AND p.proname = 'next_issue_id';

\echo ''
\echo '--- 2. issue_number_counters is untouched in shape (staff_code, next_number, updated_at) ---'
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'issue_tracking'
   AND table_name   = 'issue_number_counters'
 ORDER BY ordinal_position;

\echo ''
\echo '--- 3. No ACTIVE issue has ever had its issue_id touched: every non-deleted row still matches <code>-<digits> ---'
SELECT count(*) AS active_rows_with_malformed_id
  FROM issue_tracking.issues
 WHERE deleted_at IS NULL
   AND issue_id !~ '^[A-Za-z0-9]{1,10}-[0-9]+$';

\echo ''
\echo '--- 4. Any archived (reused-gap) rows so far, and whether each is genuinely childless ---'
SELECT i.issue_id AS archived_id,
       i.deleted_at,
       (SELECT count(*) FROM issue_tracking.issue_status_history h WHERE h.issue_id = i.issue_id) AS status_history_rows,
       (SELECT count(*) FROM issue_tracking.issue_assignment_history a WHERE a.issue_id = i.issue_id) AS assignment_history_rows,
       (SELECT count(*) FROM issue_tracking.issue_comments c WHERE c.issue_id = i.issue_id) AS comment_rows
  FROM issue_tracking.issues i
 WHERE i.issue_id LIKE '%~released~%'
 ORDER BY i.deleted_at;

\echo ''
\echo '--- 5. No two rows currently share the same issue_id (PK still holds) ---'
SELECT issue_id, count(*)
  FROM issue_tracking.issues
 GROUP BY issue_id
HAVING count(*) > 1;
