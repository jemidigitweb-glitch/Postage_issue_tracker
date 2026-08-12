-- ============================================================================
-- migration/011_assignment_user_login_link_rollback.sql
--
-- STATUS: PROPOSAL — NOT EXECUTED.
--
-- Rollback for migration/011_assignment_user_login_link.sql.
--
-- Removes ONLY the two objects that 011 created:
--   1. issue_tracking.uidx_assignment_users_user_id   [index]
--   2. issue_tracking.assignment_users.user_id        [column]
--
-- Nothing else is touched. No row in assignment_users, management_users,
-- issues, issue_assignments, issue_staff, or any discussion table is
-- inserted, updated, or deleted by this file. issue_staff and issues are not
-- referenced at all.
--
-- WARNING — what is lost: dropping the column discards every login↔assignee
-- link recorded in it. The management_users login accounts themselves are NOT
-- deleted (they live in a different table and are not referenced here), and
-- no Issue or assignment data is affected — but after this rollback the
-- application can no longer resolve a signed-in user to an assignee, so
-- assignee-scoped Issue access stops working until 011 is re-applied and the
-- links are re-established.
--
-- Take a backup first:
--   PowerShell: $backupFile = "pre_011_rollback_$(Get-Date -Format yyyyMMdd_HHmmss).dump"; pg_dump --format=custom --file=$backupFile $env:DATABASE_URL
--   Bash:       pg_dump --format=custom --file="pre_011_rollback_$(date +%Y%m%d_%H%M%S).dump" "$DATABASE_URL"
--
-- Before running, capture what will be lost (read-only):
--   SELECT assignee_id, assignee_name, user_id
--   FROM issue_tracking.assignment_users
--   WHERE user_id IS NOT NULL
--   ORDER BY assignee_id;
-- ============================================================================

BEGIN;

-- ── Hard target-database safety check ───────────────────────────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". Nothing dropped.', current_database();
    END IF;
END $$;

-- ── Capture pre-rollback counts (transaction-scoped) ────────────────────────
CREATE TEMP TABLE _m011r_before ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM issue_tracking.assignment_users)  AS assignment_users,
    (SELECT count(*) FROM issue_tracking.management_users)  AS management_users,
    (SELECT count(*) FROM issue_tracking.issues)            AS issues,
    (SELECT count(*) FROM issue_tracking.issue_assignments) AS issue_assignments,
    (SELECT count(*) FROM issue_tracking.issue_staff)       AS issue_staff;

-- ── 1. Drop the index created by 011 ────────────────────────────────────────
-- Dropped explicitly before the column so the intent is recorded, even though
-- DROP COLUMN would remove it implicitly.
DROP INDEX IF EXISTS issue_tracking.uidx_assignment_users_user_id;

-- ── 2. Drop the column created by 011 ───────────────────────────────────────
-- The FK constraint added inline by 011 is owned by this column and is
-- removed with it. No other constraint on assignment_users is affected.
ALTER TABLE issue_tracking.assignment_users DROP COLUMN IF EXISTS user_id;

-- ============================================================================
-- In-transaction verification — nothing except 011's own objects may change.
-- ============================================================================

DO $$
DECLARE
    b RECORD;
    v_assignment_users BIGINT;
    v_management_users BIGINT;
    v_issues           BIGINT;
    v_issue_assignments BIGINT;
    v_issue_staff      BIGINT;
    v_column_gone      BOOLEAN;
    v_index_gone       BOOLEAN;
BEGIN
    SELECT * INTO b FROM _m011r_before;

    SELECT count(*) INTO v_assignment_users  FROM issue_tracking.assignment_users;
    SELECT count(*) INTO v_management_users  FROM issue_tracking.management_users;
    SELECT count(*) INTO v_issues            FROM issue_tracking.issues;
    SELECT count(*) INTO v_issue_assignments FROM issue_tracking.issue_assignments;
    SELECT count(*) INTO v_issue_staff       FROM issue_tracking.issue_staff;

    IF v_assignment_users <> b.assignment_users THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: assignment_users went from % to %. Aborting.', b.assignment_users, v_assignment_users;
    END IF;
    IF v_management_users <> b.management_users THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: management_users went from % to %. Aborting.', b.management_users, v_management_users;
    END IF;
    IF v_issues <> b.issues THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issues went from % to %. Aborting.', b.issues, v_issues;
    END IF;
    IF v_issue_assignments <> b.issue_assignments THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issue_assignments went from % to %. Aborting.', b.issue_assignments, v_issue_assignments;
    END IF;
    IF v_issue_staff <> b.issue_staff THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issue_staff went from % to %. Aborting.', b.issue_staff, v_issue_staff;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'assignment_users'
          AND column_name  = 'user_id'
    ) INTO v_column_gone;
    IF NOT v_column_gone THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: assignment_users.user_id still exists. Aborting.';
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'issue_tracking'
          AND indexname  = 'uidx_assignment_users_user_id'
    ) INTO v_index_gone;
    IF NOT v_index_gone THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: uidx_assignment_users_user_id still exists. Aborting.';
    END IF;

    RAISE NOTICE 'Migration 011 rollback verification passed. assignment_users=%, management_users=%, issues=%, issue_assignments=%, issue_staff=%',
        v_assignment_users, v_management_users, v_issues, v_issue_assignments, v_issue_staff;
END $$;

COMMIT;
