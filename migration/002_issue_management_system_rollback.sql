-- ============================================================================
-- migration/002_issue_management_system_rollback.sql
-- Rollback for migration/002_issue_management_system.sql — NEW objects only.
--
-- Nothing in this file runs automatically — every statement below must be
-- run manually and deliberately, after review, the same way
-- migration/rollback.sql works for the historical data migration.
--
-- This file NEVER touches issue_tracking.issue_staff or issue_tracking.issues.
-- It only removes the 7 objects created by 002_issue_management_system.sql,
-- in strict reverse-dependency order so no DROP fails on an existing
-- foreign-key reference:
--   1. v_current_assignment        (view — depends on issue_assignment_history)
--   2. issue_comments              (FK -> issues, management_users)
--   3. issue_status_history        (FK -> issues, management_users)
--   4. issue_assignment_history    (FK -> issues, management_users)
--   5. next_issue_id()             (function)
--   6. issue_number_counters       (FK -> issue_staff)
--   7. management_users            (referenced by 2/3/4 above — dropped last)
-- ============================================================================

-- ── MANDATORY FIRST STEP — take a full varmen_db backup before anything else ─
-- Run ONE of these (matching your shell), never with the connection string
-- typed directly into the command — it must come from the MIGRATION_DB_URL
-- environment variable, which is never printed by these commands.
--
-- PowerShell:
--   $backupFile = "pre_002_rollback_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
--   pg_dump --format=custom --file=$backupFile $env:MIGRATION_DB_URL
--
-- Bash:
--   pg_dump \
--     --format=custom \
--     --file="pre_002_rollback_$(date +%Y%m%d_%H%M%S).dump" \
--     "$MIGRATION_DB_URL"
--
-- Verify the backup before proceeding — do not skip this:
--
-- PowerShell:
--   $LASTEXITCODE                                  # must be 0
--   Test-Path $backupFile                          # must be True
--   (Get-Item $backupFile).Length -gt 0             # must be True
--
-- Bash:
--   echo $?                                        # must print 0
--   test -f "$backupFile" && echo "exists"          # must print "exists"
--   test -s "$backupFile" && echo "non-empty"       # must print "non-empty"
--
-- Do not proceed past this point without that backup file existing on disk
-- AND confirmed non-empty.


-- ── Rollback — drops only the 7 new objects, in dependency-safe order ──────
-- WARNING: this deletes all data in the new tables (management_users,
-- assignment/status/comment history, issue number counters) and the
-- function/view built on top of them. It does NOT touch issue_staff or
-- issues — the 4 historical staff rows and 92 historical issue rows are
-- entirely unaffected by anything in this file.

BEGIN;

-- ── Hard target-database safety check — enforced, not a comment ────────────
-- Aborts automatically (RAISE EXCEPTION) unless connected to exactly
-- "varmen_db". This runs before any DROP statement below. Because this
-- check itself is inside the transaction, an abort here — combined with the
-- COMMIT at the end of this file — guarantees zero objects are dropped
-- against the wrong database. Does not rely on the operator manually running
-- and eyeballing a separate check.
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects dropped.', current_database();
    END IF;
END $$;

DROP VIEW IF EXISTS issue_tracking.v_current_assignment;

DROP TABLE IF EXISTS issue_tracking.issue_comments;

DROP TABLE IF EXISTS issue_tracking.issue_status_history;

DROP TABLE IF EXISTS issue_tracking.issue_assignment_history;

DROP FUNCTION IF EXISTS issue_tracking.next_issue_id(VARCHAR);

DROP TABLE IF EXISTS issue_tracking.issue_number_counters;

DROP TABLE IF EXISTS issue_tracking.management_users;

-- Verify the historical tables are still exactly as they were — if this
-- ever fails, something outside this rollback's scope touched them, and the
-- transaction should not be trusted to commit.
DO $$
DECLARE
    v_staff_count INT;
    v_issue_count INT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;

    IF v_staff_count <> 4 THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_staff count is % (expected 4) after rollback — refusing to commit.', v_staff_count;
    END IF;

    IF v_issue_count <> 92 THEN
        RAISE EXCEPTION 'SAFETY ABORT: issues count is % (expected 92) after rollback — refusing to commit.', v_issue_count;
    END IF;
END $$;

COMMIT;
