-- ============================================================================
-- migration/011_assignment_user_login_link.sql
--
-- STATUS: PROPOSAL — NOT EXECUTED. Pending Varmen review and approval.
--
-- Purpose: give each row in issue_tracking.assignment_users an OPTIONAL 1:1
-- link to a login account in issue_tracking.management_users, so the
-- application can resolve "the signed-in user" to "the assignee this Issue
-- belongs to" and enforce assignee-scoped Issue access server-side.
--
-- This single nullable column is the entire missing structural piece
-- identified in the Stage 1 audit. management_users already carries
-- username / email / password_hash / role / active; assignment_users already
-- carries the assignee registry; nothing connected the two.
--
-- ── SAFETY MODEL (mirrors migrations 002-010) ───────────────────────────────
--  - HARD TARGET-DATABASE CHECK: aborts with ZERO writes unless connected to
--    exactly "varmen_db".
--  - PRECONDITION CHECK: aborts unless both issue_tracking.assignment_users
--    and issue_tracking.management_users already exist. This migration never
--    creates either.
--  - Scope: issue_tracking only. No statement references ledsone,
--    ph_dashboard, postgres, staff.users, or any other schema/database.
--  - NON-DESTRUCTIVE: the only DDL is ADD COLUMN + CREATE INDEX. There is no
--    DROP, TRUNCATE, DELETE, or UPDATE anywhere in this file. No existing
--    column is altered. No row in any table is written, moved, or removed.
--  - The new column is NULLABLE with no DEFAULT, so all 10 existing
--    assignment_users rows remain valid and unchanged, and an assignee
--    without a login account continues to work exactly as it does today.
--  - Everything runs inside ONE transaction. An in-transaction verification
--    block immediately before COMMIT re-counts assignment_users,
--    management_users, issues, and issue_assignments against the values
--    captured BEFORE the DDL ran; any difference raises and rolls back the
--    whole file.
--  - This script does not execute itself. Run manually via psql against
--    MIGRATION_DB_URL, the same way every other migration in this folder is
--    run, and only after approval.
--
-- Observed row counts at audit time (2026-08-12, read-only introspection):
--   assignment_users   = 10
--   management_users   = 1   (user_id=1, username 'admin_test', role 'admin')
--   issues             = 144 (all non-deleted)
--   issue_assignments  = 0
-- The verification block below compares before/after dynamically rather than
-- hardcoding these numbers, so the migration stays correct if rows are
-- legitimately added between approval and execution.
--
-- Objects created (2):
--   1. issue_tracking.assignment_users.user_id                     [column]
--   2. issue_tracking.uidx_assignment_users_user_id                [index]
-- ============================================================================

BEGIN;

-- ── Hard target-database safety check ───────────────────────────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects created.', current_database();
    END IF;
END $$;

-- ── Precondition: both tables must already exist ────────────────────────────
DO $$
BEGIN
    IF to_regclass('issue_tracking.assignment_users') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.assignment_users does not exist. This migration never creates it. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.management_users') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.management_users does not exist. This migration never creates it. No objects created.';
    END IF;
END $$;

-- ── Capture pre-migration counts into a temp table ──────────────────────────
-- Temporary, transaction-scoped (ON COMMIT DROP) — never persists, never
-- appears in the schema after this migration finishes.
CREATE TEMP TABLE _m011_before ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM issue_tracking.assignment_users)  AS assignment_users,
    (SELECT count(*) FROM issue_tracking.management_users)  AS management_users,
    (SELECT count(*) FROM issue_tracking.issues)            AS issues,
    (SELECT count(*) FROM issue_tracking.issue_assignments) AS issue_assignments,
    (SELECT count(*) FROM issue_tracking.issue_staff)       AS issue_staff;

-- ============================================================================
-- 1. assignment_users.user_id — nullable FK to management_users.
--
-- NULLABLE and no DEFAULT on purpose:
--   - every existing row stays valid with no data write;
--   - an assignee with no login account remains fully usable in the
--     "Assign To" dropdown, exactly as today;
--   - linking is a later, separate, explicitly-approved provisioning step.
--
-- ON DELETE RESTRICT (matches the convention in migrations 003/005): a
-- management_users row that is linked to an assignee cannot be deleted out
-- from under the link. Unlinking is an explicit UPDATE, never a side effect.
-- Nothing in the application deletes management_users rows today.
--
-- Type is BIGINT to match management_users.user_id (BIGSERIAL/bigint).
-- ============================================================================

ALTER TABLE issue_tracking.assignment_users
    ADD COLUMN IF NOT EXISTS user_id BIGINT NULL
        REFERENCES issue_tracking.management_users(user_id) ON DELETE RESTRICT;

-- ============================================================================
-- 2. uidx_assignment_users_user_id — enforces the 1:1 half of the link.
--
-- PARTIAL unique index (WHERE user_id IS NOT NULL): at most ONE assignee row
-- may point at any given login account, while any number of assignee rows may
-- remain unlinked (NULL). A plain UNIQUE constraint would work in Postgres
-- (NULLs are distinct) but the partial index states the intent explicitly and
-- matches uidx_issue_assignments_one_current in migration 005.
--
-- The other half of the 1:1 (one assignee row per login) is guaranteed by
-- assignment_users.assignee_id being the primary key.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uidx_assignment_users_user_id
    ON issue_tracking.assignment_users(user_id)
    WHERE user_id IS NOT NULL;

-- ============================================================================
-- In-transaction verification — data-preservation gate.
--
-- ADD COLUMN (nullable, no default) and CREATE INDEX cannot change row
-- counts, so these checks can never fail in normal operation. They are
-- defense in depth: if any count differs from what was captured before the
-- DDL, everything in this file rolls back.
-- ============================================================================

DO $$
DECLARE
    b RECORD;
    v_assignment_users  BIGINT;
    v_management_users  BIGINT;
    v_issues            BIGINT;
    v_issue_assignments BIGINT;
    v_issue_staff       BIGINT;
    v_non_null_links    BIGINT;
    v_column_ok         BOOLEAN;
    v_index_ok          BOOLEAN;
BEGIN
    SELECT * INTO b FROM _m011_before;

    SELECT count(*) INTO v_assignment_users  FROM issue_tracking.assignment_users;
    SELECT count(*) INTO v_management_users  FROM issue_tracking.management_users;
    SELECT count(*) INTO v_issues            FROM issue_tracking.issues;
    SELECT count(*) INTO v_issue_assignments FROM issue_tracking.issue_assignments;
    SELECT count(*) INTO v_issue_staff       FROM issue_tracking.issue_staff;

    IF v_assignment_users <> b.assignment_users THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: assignment_users went from % to %. Rolling back.', b.assignment_users, v_assignment_users;
    END IF;
    IF v_management_users <> b.management_users THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: management_users went from % to %. Rolling back.', b.management_users, v_management_users;
    END IF;
    IF v_issues <> b.issues THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues went from % to %. Rolling back.', b.issues, v_issues;
    END IF;
    IF v_issue_assignments <> b.issue_assignments THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_assignments went from % to %. Rolling back.', b.issue_assignments, v_issue_assignments;
    END IF;
    IF v_issue_staff <> b.issue_staff THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_staff went from % to %. Rolling back.', b.issue_staff, v_issue_staff;
    END IF;

    -- This migration links nobody. Every row must still be unlinked.
    SELECT count(*) INTO v_non_null_links
    FROM issue_tracking.assignment_users WHERE user_id IS NOT NULL;
    IF v_non_null_links <> 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: % assignment_users row(s) already linked — this migration links nobody. Rolling back.', v_non_null_links;
    END IF;

    -- The two new objects must actually exist.
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'assignment_users'
          AND column_name  = 'user_id'
    ) INTO v_column_ok;
    IF NOT v_column_ok THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: assignment_users.user_id was not created. Rolling back.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'issue_tracking'
          AND indexname  = 'uidx_assignment_users_user_id'
    ) INTO v_index_ok;
    IF NOT v_index_ok THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: uidx_assignment_users_user_id was not created. Rolling back.';
    END IF;

    RAISE NOTICE 'Migration 011 verification passed. assignment_users=%, management_users=%, issues=%, issue_assignments=%, issue_staff=%, linked=0',
        v_assignment_users, v_management_users, v_issues, v_issue_assignments, v_issue_staff;
END $$;

COMMIT;
