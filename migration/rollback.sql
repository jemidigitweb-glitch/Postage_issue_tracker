-- Rollback plan for the issue_tracking migration.
-- Nothing in this file runs automatically — every statement below must be
-- run manually and deliberately. Read the warnings before running anything.

-- ── MANDATORY FIRST STEP — take a FULL varmen_db backup before anything else ─
-- A schema-only backup of issue_tracking is not sufficient here: on the
-- first migration, issue_tracking does not exist yet, and varmen_db may
-- contain other existing schemas/tables that this backup should also
-- protect against operator error. Take a full-database backup instead.
--
-- Run ONE of these (matching your shell), never with the connection string
-- typed directly into the command — it must come from the MIGRATION_DB_URL
-- environment variable, which is never printed by these commands.
--
-- PowerShell:
--   $backupFile = "pre_issue_tracking_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
--   pg_dump --format=custom --file=$backupFile $env:MIGRATION_DB_URL
--
-- Bash:
--   pg_dump \
--     --format=custom \
--     --file="pre_issue_tracking_$(date +%Y%m%d_%H%M%S).dump" \
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


-- ── OPTION 1: Data-only rollback (safe, reversible via re-run) ─────────────
-- Removes only the migrated ROWS. Table structure, constraints, and indexes
-- are left in place. Use this if you want to fix a data problem and then
-- re-run migrate-issues.js --execute afterward.
--
-- WARNING: this deletes every row in both tables. Confirm you have the
-- pg_dump backup above before running it.
BEGIN;
DELETE FROM issue_tracking.issues;
DELETE FROM issue_tracking.issue_staff;
COMMIT;


-- ── OPTION 2: Full schema removal (destructive, NOT reversible) ────────────
-- Drops the tables AND the issue_tracking schema entirely. Only use this if
-- you want to remove the feature completely, not just reset its data.
--
-- WARNING — DESTRUCTIVE, IRREVERSIBLE: this permanently deletes the table
-- structure, all constraints/indexes, and all data. There is no "undo" other
-- than restoring from the pg_dump backup above. It is commented out
-- deliberately — uncomment only after you have confirmed the backup exists
-- and you genuinely intend to remove the schema, not just its data.
--
-- DROP TABLE IF EXISTS issue_tracking.issues;
-- DROP TABLE IF EXISTS issue_tracking.issue_staff;
-- DROP SCHEMA IF EXISTS issue_tracking;
