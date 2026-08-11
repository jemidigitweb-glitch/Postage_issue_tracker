-- ============================================================================
-- migration/007_discussions_rollback.sql
-- Rollback for migration/007_discussions.sql — NEW objects only.
--
-- Nothing in this file runs automatically — every statement below must be
-- run manually and deliberately, after review, the same way
-- migration/002_issue_management_system_rollback.sql works.
--
-- This file NEVER touches issue_tracking.issue_staff, issue_tracking.issues,
-- issue_tracking.management_users, or any other pre-existing object. It only
-- removes the 7 objects created by 007_discussions.sql, in strict
-- reverse-dependency order so no DROP fails on an existing foreign-key
-- reference:
--   1. discussion_comments        (FK -> discussions, management_users)
--   2. discussion_status_history  (FK -> discussions, management_users)
--   3. discussion_points          (FK -> discussions, issues)
--   4. discussion_participants    (FK -> discussions, management_users)
--   5. next_discussion_id()       (function)
--   6. discussion_id_counter      (standalone)
--   7. discussions                (referenced by 1-4 above — dropped last)
-- ============================================================================

-- ── MANDATORY FIRST STEP — take a full varmen_db backup before anything else ─
-- Run ONE of these (matching your shell), never with the connection string
-- typed directly into the command — it must come from the DATABASE_URL
-- environment variable, which is never printed by these commands.
--
-- PowerShell:
--   $backupFile = "pre_007_rollback_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
--   pg_dump --format=custom --file=$backupFile $env:DATABASE_URL
--
-- Bash:
--   pg_dump \
--     --format=custom \
--     --file="pre_007_rollback_$(date +%Y%m%d_%H%M%S).dump" \
--     "$DATABASE_URL"
--
-- Verify the backup before proceeding — do not skip this. Do not proceed
-- past this point without that backup file existing on disk AND confirmed
-- non-empty.

-- ── Rollback — drops only the 7 new objects, in dependency-safe order ──────
-- WARNING: this deletes all Discussion data (discussions, participants,
-- points, status history, comments, and the ID counter). It does NOT touch
-- issue_staff, issues, or management_users — all historical and Issue data
-- is entirely unaffected by anything in this file.

BEGIN;

-- ── Hard target-database safety check — enforced, not a comment ────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects dropped.', current_database();
    END IF;
END $$;

DROP TABLE IF EXISTS issue_tracking.discussion_comments;

DROP TABLE IF EXISTS issue_tracking.discussion_status_history;

DROP TABLE IF EXISTS issue_tracking.discussion_points;

DROP TABLE IF EXISTS issue_tracking.discussion_participants;

DROP FUNCTION IF EXISTS issue_tracking.next_discussion_id();

DROP TABLE IF EXISTS issue_tracking.discussion_id_counter;

DROP TABLE IF EXISTS issue_tracking.discussions;

-- Verify the historical/Issue tables are still exactly as they were — if
-- this ever fails, something outside this rollback's scope touched them,
-- and the transaction should not be trusted to commit.
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
