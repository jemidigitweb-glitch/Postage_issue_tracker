-- ============================================================================
-- migration/008_discussion_groups_rollback.sql
-- Rollback for migration/008_discussion_groups.sql.
--
-- Nothing in this file runs automatically — every statement below must be
-- run manually and deliberately, after review.
--
-- WARNING: if any discussions row has a non-NULL group_id or
-- linked_issue_id by the time this runs, dropping those columns loses that
-- linkage data (the discussions row itself is NOT deleted — only the
-- group_id/issue_link_type/linked_issue_id column values on it). Confirm
-- nothing depends on this data before rolling back. Does NOT touch
-- issue_staff, issues, management_users, or any discussions row's other
-- columns (title, status, objective, etc.), and does NOT touch
-- discussion_points, discussion_participants, discussion_comments, or
-- discussion_status_history at all.
-- ============================================================================

-- ── MANDATORY FIRST STEP — take a full varmen_db backup before anything else ─
-- PowerShell:
--   $backupFile = "pre_008_rollback_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
--   pg_dump --format=custom --file=$backupFile $env:DATABASE_URL
-- Bash:
--   pg_dump --format=custom --file="pre_008_rollback_$(date +%Y%m%d_%H%M%S).dump" "$DATABASE_URL"
-- Verify the backup file exists and is non-empty before proceeding.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%".', current_database();
    END IF;
END $$;

ALTER TABLE issue_tracking.discussions DROP CONSTRAINT IF EXISTS chk_discussions_linked_issue_consistency;

DROP INDEX IF EXISTS issue_tracking.idx_discussions_linked_issue_id;
DROP INDEX IF EXISTS issue_tracking.idx_discussions_group_id;

ALTER TABLE issue_tracking.discussions
    DROP COLUMN IF EXISTS linked_issue_id,
    DROP COLUMN IF EXISTS issue_link_type,
    DROP COLUMN IF EXISTS group_id;

DROP TABLE IF EXISTS issue_tracking.discussion_groups;

-- Verify historical/Issue tables and existing discussions rows untouched.
DO $$
DECLARE
    v_staff_count INT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    IF to_regclass('issue_tracking.issues') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issues no longer exists after rollback — refusing to commit.';
    END IF;
    IF v_staff_count < 1 THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_staff is unexpectedly empty after rollback — refusing to commit.';
    END IF;
END $$;

COMMIT;
