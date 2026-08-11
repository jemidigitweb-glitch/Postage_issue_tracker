-- ============================================================================
-- migration/009_discussion_source_content_rollback.sql
-- Rollback for migration/009_discussion_source_content.sql.
-- WARNING: drops the source_content column, losing any transcribed
-- meeting-minute content stored there. Does not touch any other column,
-- table, or the Issues module. Run manually after taking a backup.
-- ============================================================================

-- PowerShell: $backupFile = "pre_009_rollback_$(Get-Date -Format yyyyMMdd_HHmmss).dump"; pg_dump --format=custom --file=$backupFile $env:DATABASE_URL
-- Bash:       pg_dump --format=custom --file="pre_009_rollback_$(date +%Y%m%d_%H%M%S).dump" "$DATABASE_URL"

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%".', current_database();
    END IF;
END $$;

ALTER TABLE issue_tracking.discussions DROP COLUMN IF EXISTS source_content;

COMMIT;
