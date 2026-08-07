-- ============================================================================
-- migration/002_issue_management_system.sql
-- Issue Management Application Layer — NEW objects only.
--
-- Approved by: migration/002_architecture_decisions.md (8/8 decisions, all
-- Option A, signed off "Project Owner" 2026-08-06). Object design source:
-- migration/002_issue_management_system_PROPOSAL.md.
--
-- SAFETY MODEL (mirrors migration/migrate-issues.js):
--  - This script is STRICT DATA-ONLY with respect to the historical tables.
--    It NEVER issues CREATE, ALTER, DROP, TRUNCATE, UPDATE, or DELETE against
--    issue_tracking.issue_staff or issue_tracking.issues. The only statements
--    that reference them at all are read-only SELECTs and REFERENCES clauses
--    in new foreign keys on NEW tables — neither modifies the referenced
--    table's structure or data.
--  - HARD TARGET-DATABASE CHECK: the first statement inside the transaction
--    aborts immediately (RAISE EXCEPTION) unless connected to exactly
--    "varmen_db". Combined with wrapping the whole file in one transaction,
--    an abort here guarantees zero writes anywhere.
--  - PRECONDITION CHECK: aborts immediately if issue_tracking.issue_staff or
--    issue_tracking.issues do not already exist — this migration assumes
--    them and never creates them.
--  - Every statement is schema-qualified to issue_tracking.* — nothing
--    relies on search_path.
--  - Everything below runs inside ONE transaction (BEGIN...COMMIT). An
--    in-transaction verification block immediately before COMMIT re-checks
--    that issue_staff is still 4 rows and issues is still 92 rows; if not,
--    it raises and the whole migration rolls back.
--  - This script does not execute itself — it must be run manually via
--    psql against MIGRATION_DB_URL, the same way migrate-issues.js is run,
--    after the identity check confirms varmen_db.
--  - No CREATE SCHEMA statement — issue_tracking already exists.
--  - No object in this file lives outside issue_tracking. No statement
--    references ledsone, ph_dashboard, postgres, staff.users, or any other
--    schema/database.
--
-- Objects created (7 total, matching the 7 approved in
-- 002_architecture_decisions.md / 002_issue_management_system_PROPOSAL.md §3):
--   1. issue_tracking.management_users
--   2. issue_tracking.issue_number_counters (+ seed data, read-derived from
--      the existing issue_staff/issues via SELECT only)
--   3. issue_tracking.next_issue_id()               [function]
--   4. issue_tracking.issue_status_history
--   5. issue_tracking.issue_assignment_history
--   6. issue_tracking.v_current_assignment           [view]
--   7. issue_tracking.issue_comments
--
-- Role model (DECISION-005, approved): staff / management / admin — NOT the
-- earlier proposal draft's admin/manager/staff/viewer set. This file uses
-- the approved set.
-- ============================================================================

BEGIN;

-- ── Hard target-database safety check ───────────────────────────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects created.', current_database();
    END IF;
END $$;

-- ── Precondition: historical tables must already exist ─────────────────────
-- This migration assumes them and never creates, alters, or drops them.
DO $$
BEGIN
    IF to_regclass('issue_tracking.issue_staff') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issue_staff does not exist. This migration never creates it. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.issues') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issues does not exist. This migration never creates it. No objects created.';
    END IF;
END $$;

-- ============================================================================
-- 1. management_users
-- Independent from issue_staff (DECISION-006, Option A). issue_staff remains
-- the historical "who raised this issue" reference; this table is the app's
-- own login/identity system.
-- ============================================================================

CREATE TABLE issue_tracking.management_users (
    user_id       BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    display_name  VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('staff', 'management', 'admin')),
    active        BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. issue_number_counters
-- Atomic, per-staff-code counter backing server-side issue ID generation
-- (DECISION-008, Option A: scalable, no 3-digit ceiling). FK to issue_staff
-- is a read-only reference — does not modify issue_staff.
-- ============================================================================

CREATE TABLE issue_tracking.issue_number_counters (
    staff_code  VARCHAR(10) PRIMARY KEY REFERENCES issue_tracking.issue_staff(staff_code) ON UPDATE CASCADE,
    next_number INTEGER     NOT NULL DEFAULT 1,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed one counter row per existing staff_code, computed from the current
-- historical max issue number for that code (read-only SELECT against
-- issue_staff/issues — no write to either). Uses a live query rather than
-- hardcoded numbers so this migration stays correct regardless of when it
-- actually runs.
INSERT INTO issue_tracking.issue_number_counters (staff_code, next_number)
SELECT
    s.staff_code,
    COALESCE(MAX((split_part(i.issue_id, '-', 2))::int), 0) + 1 AS next_number
FROM issue_tracking.issue_staff s
LEFT JOIN issue_tracking.issues i ON i.staff_code = s.staff_code
GROUP BY s.staff_code;

-- ============================================================================
-- 3. next_issue_id() — atomic, concurrency-safe issue ID generator.
-- No 3-digit ceiling (DECISION-008): lpad() only pads short numbers and never
-- truncates, so output grows naturally past 999 (e.g. 'ND-1000') with no
-- future code change required. Historical IDs are never touched or renumbered
-- — this function only ever produces new IDs going forward.
-- ============================================================================

CREATE OR REPLACE FUNCTION issue_tracking.next_issue_id(p_staff_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_number INTEGER;
BEGIN
    UPDATE issue_tracking.issue_number_counters
    SET next_number = next_number + 1,
        updated_at = now()
    WHERE staff_code = p_staff_code
    RETURNING next_number - 1 INTO v_number;

    IF v_number IS NULL THEN
        RAISE EXCEPTION 'No issue_number_counters row for staff_code %', p_staff_code;
    END IF;

    RETURN p_staff_code || '-' || lpad(v_number::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. issue_status_history
-- Append-only audit trail for RED→AMBER→GREEN progression and authorised
-- reopenings (DECISION-001, DECISION-002, DECISION-004, all Option A).
-- Workflow rule enforcement itself (ordering, resolution-required-before-
-- GREEN, reopen authorization) happens in the application layer
-- (DECISION-002) — this table only records what happened.
-- ============================================================================

CREATE TABLE issue_tracking.issue_status_history (
    history_id  BIGSERIAL PRIMARY KEY,
    issue_id    VARCHAR(20) NOT NULL REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT,
    from_status VARCHAR(20) CHECK (from_status IS NULL OR from_status IN ('RED', 'AMBER', 'GREEN')),
    to_status   VARCHAR(20) NOT NULL CHECK (to_status IN ('RED', 'AMBER', 'GREEN')),
    changed_by  BIGINT      NOT NULL REFERENCES issue_tracking.management_users(user_id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_reopen   BOOLEAN     NOT NULL DEFAULT false,
    reason      TEXT
);

CREATE INDEX idx_issue_status_history_issue_id ON issue_tracking.issue_status_history(issue_id);
CREATE INDEX idx_issue_status_history_changed_at ON issue_tracking.issue_status_history(changed_at);

-- ============================================================================
-- 5. issue_assignment_history
-- Append-only audit trail of every assignment/reassignment.
-- ============================================================================

CREATE TABLE issue_tracking.issue_assignment_history (
    history_id  BIGSERIAL PRIMARY KEY,
    issue_id    VARCHAR(20) NOT NULL REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT,
    assigned_to BIGINT      NOT NULL REFERENCES issue_tracking.management_users(user_id),
    assigned_by BIGINT      NOT NULL REFERENCES issue_tracking.management_users(user_id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason      TEXT
);

CREATE INDEX idx_issue_assignment_history_issue_id ON issue_tracking.issue_assignment_history(issue_id);
CREATE INDEX idx_issue_assignment_history_assigned_to ON issue_tracking.issue_assignment_history(assigned_to);

-- ============================================================================
-- 6. v_current_assignment
-- Derives "who is currently assigned" from issue_assignment_history rather
-- than duplicating that state in a second table — single source of truth,
-- no sync risk. A view does not write data or modify any table.
-- ============================================================================

CREATE OR REPLACE VIEW issue_tracking.v_current_assignment AS
SELECT DISTINCT ON (issue_id) issue_id, assigned_to, assigned_by, assigned_at
FROM issue_tracking.issue_assignment_history
ORDER BY issue_id, assigned_at DESC;

-- ============================================================================
-- 7. issue_comments
-- Single table for comments and investigation notes, discriminated by
-- comment_type (DECISION-003, Option A).
-- ============================================================================

CREATE TABLE issue_tracking.issue_comments (
    comment_id   BIGSERIAL PRIMARY KEY,
    issue_id     VARCHAR(20) NOT NULL REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT,
    author_id    BIGINT      NOT NULL REFERENCES issue_tracking.management_users(user_id),
    comment_type VARCHAR(20) NOT NULL DEFAULT 'comment' CHECK (comment_type IN ('comment', 'investigation_note')),
    body         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_issue_comments_issue_id ON issue_tracking.issue_comments(issue_id);
CREATE INDEX idx_issue_comments_issue_id_type ON issue_tracking.issue_comments(issue_id, comment_type);

-- ============================================================================
-- In-transaction verification — historical-data-preservation gate.
-- Nothing above writes to issue_staff/issues, so these counts cannot
-- actually change; this is a defense-in-depth check that aborts (rolling
-- back everything in this file) if they are ever anything other than the
-- known-good counts.
-- ============================================================================

DO $$
DECLARE
    v_staff_count   INT;
    v_issue_count   INT;
    v_counter_count INT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    SELECT count(*) INTO v_counter_count FROM issue_tracking.issue_number_counters;

    IF v_staff_count <> 4 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_staff count is % (expected 4) — historical table appears changed. Rolling back.', v_staff_count;
    END IF;

    IF v_issue_count <> 92 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues count is % (expected 92) — historical table appears changed. Rolling back.', v_issue_count;
    END IF;

    IF v_counter_count <> v_staff_count THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_number_counters has % rows, expected % (one per staff_code). Rolling back.', v_counter_count, v_staff_count;
    END IF;
END $$;

COMMIT;
