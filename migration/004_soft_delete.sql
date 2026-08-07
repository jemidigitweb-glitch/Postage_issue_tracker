-- Adds soft-delete columns to issue_tracking.issues. No data is removed,
-- no other column is touched, issue_staff is not referenced or modified.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%".', current_database();
    END IF;
END $$;

ALTER TABLE issue_tracking.issues
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS deleted_by INTEGER NULL;

COMMIT;
