-- ============================================================================
-- migration/012_issue_work_details.sql
--
-- Purpose (Stage 6): let an Assignee's Issue status change capture the actual
-- work done, using the SAME RED -> AMBER -> GREEN workflow that already
-- exists. Nothing about the workflow, ownership model, or login architecture
-- changes here — this file only adds the columns that had nowhere to live.
--
-- ── AUDIT FIRST (what already existed, read-only introspection 2026-08-12) ──
-- issue_tracking.issues already carries:
--   resolution     TEXT  — IN USE. 125 of 145 rows are populated, and the
--                          application renders it as "Fix & Action Required"
--                          (components/issues/AssignedIssueCard.tsx). This is
--                          historical content describing the RECOMMENDED fix
--                          at intake time, NOT the assignee's final outcome.
--                          It is therefore NOT reused and NOT written by the
--                          Stage 6 workflow. Nothing in this migration or in
--                          the application ever overwrites it.
--   completed_date DATE  — REUSED. 0 rows populated, no application code
--                          reads or writes it. It becomes the calendar-date
--                          half of the completion stamp (see completed_at
--                          below), so no duplicate "date completed" concept
--                          is introduced.
--   status, updated_at, extra_data — unchanged.
--
-- issue_tracking.issue_status_history already exists with a `reason` TEXT
-- column (currently NULL on every row). REUSED as-is: the work detail
-- captured AT a transition is recorded there, in the existing append-only
-- audit table. No new history table is created.
--
-- issue_tracking.issue_comments already exists with
-- comment_type IN ('comment','investigation_note'). REUSED as-is: each
-- progress update made WHILE an Issue is AMBER (no status change, so no
-- status-history row) is appended as an 'investigation_note', so earlier
-- progress text is preserved rather than silently overwritten. No new
-- comment/progress-log table is created.
--
-- Nothing existed for: "implementation in progress" text, "implementation
-- done" text, "final resolution" text, or a process-start timestamp. Those
-- four gaps are what this migration fills, plus a precise completion
-- timestamp to go with the reused completed_date.
--
-- Column names mirror issue_tracking.discussions
-- (implementation_progress / final_outcome / process_start_date), which is
-- the same RED/AMBER/GREEN work-detail concept already approved for the
-- Discussions module — so this is one vocabulary, not a second one.
-- `final_resolution` is named distinctly from discussions.final_outcome
-- purely because `issues.resolution` is already taken by historical content
-- and the two must never be confused.
--
-- ── SAFETY MODEL (mirrors migrations 002-011) ───────────────────────────────
--  - HARD TARGET-DATABASE CHECK: aborts with ZERO writes unless connected to
--    exactly "varmen_db".
--  - PRECONDITION CHECK: aborts unless issue_tracking.issues,
--    issue_status_history and issue_comments already exist. This migration
--    never creates any of them.
--  - Scope: issue_tracking only. No statement references ledsone,
--    ph_dashboard, postgres, staff.users, or any other schema/database.
--  - NON-DESTRUCTIVE: the only DDL is ADD COLUMN. There is no DROP, ALTER
--    TYPE, TRUNCATE, DELETE, or UPDATE anywhere in this file. No existing
--    column is altered or dropped. No row in any table is written, moved, or
--    removed. No issue_id is touched or renumbered.
--  - Every new column is NULLABLE with no DEFAULT, so all 145 existing rows
--    remain valid and physically unchanged (a nullable ADD COLUMN with no
--    default does not rewrite the table).
--  - Everything runs inside ONE transaction. An in-transaction verification
--    block immediately before COMMIT re-counts issues, issue_status_history,
--    issue_comments and issue_assignments against values captured BEFORE the
--    DDL, and re-checks that `resolution` still holds exactly as many
--    non-null values as it did. Any difference raises and rolls the whole
--    file back.
--  - This script does not execute itself. Run manually via psql against
--    MIGRATION_DB_URL, the same way every other migration in this folder is
--    run.
--
-- Observed row counts at audit time (2026-08-12, read-only):
--   issues               = 145  (144 RED, 1 AMBER, 0 GREEN)
--   issues.resolution    = 125 non-null
--   issues.completed_date= 0 non-null
--   issue_status_history = 1
--   issue_comments       = 0
--   issue_assignments    = 1
-- The verification block compares before/after dynamically rather than
-- hardcoding these, so the migration stays correct whenever it is run.
--
-- Objects created (5 columns, 0 tables, 0 indexes):
--   1. issue_tracking.issues.implementation_progress  TEXT
--   2. issue_tracking.issues.implementation_done      TEXT
--   3. issue_tracking.issues.final_resolution         TEXT
--   4. issue_tracking.issues.process_started_at       TIMESTAMPTZ
--   5. issue_tracking.issues.completed_at             TIMESTAMPTZ
--
-- No index is added: every read of these columns is by issue_id, which is
-- already the primary key.
-- ============================================================================

BEGIN;

-- ── Hard target-database safety check ───────────────────────────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects created.', current_database();
    END IF;
END $$;

-- ── Precondition: the tables this stage REUSES must already exist ───────────
DO $$
BEGIN
    IF to_regclass('issue_tracking.issues') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issues does not exist. This migration never creates it.';
    END IF;
    IF to_regclass('issue_tracking.issue_status_history') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issue_status_history does not exist. This migration never creates it.';
    END IF;
    IF to_regclass('issue_tracking.issue_comments') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issue_comments does not exist. This migration never creates it.';
    END IF;
    IF to_regclass('issue_tracking.issue_assignments') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issue_assignments does not exist. This migration never creates it.';
    END IF;
END $$;

-- ── Capture pre-migration state into a transaction-scoped temp table ────────
CREATE TEMP TABLE _m012_before ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM issue_tracking.issues)                        AS issues,
    (SELECT count(resolution) FROM issue_tracking.issues)               AS issues_resolution_non_null,
    (SELECT count(completed_date) FROM issue_tracking.issues)           AS issues_completed_date_non_null,
    (SELECT count(*) FROM issue_tracking.issue_status_history)          AS status_history,
    (SELECT count(*) FROM issue_tracking.issue_comments)                AS comments,
    (SELECT count(*) FROM issue_tracking.issue_assignments)             AS assignments,
    (SELECT count(*) FROM issue_tracking.issue_staff)                   AS staff,
    (SELECT md5(string_agg(issue_id, ',' ORDER BY issue_id))
       FROM issue_tracking.issues)                                      AS issue_id_fingerprint;

-- ============================================================================
-- 1. implementation_progress — "Implementation In Progress".
--
-- The CURRENT progress text for an Issue: what work has started, what is
-- being investigated, what action is being taken. Written on RED -> AMBER
-- and refreshed by later AMBER progress updates. Every superseded value is
-- preserved elsewhere (issue_status_history.reason for the transition,
-- issue_comments 'investigation_note' for each subsequent update), so
-- refreshing this column never destroys evidence.
-- ============================================================================
ALTER TABLE issue_tracking.issues
    ADD COLUMN IF NOT EXISTS implementation_progress TEXT NULL;

-- ============================================================================
-- 2. implementation_done — "Implementation Done".
--
-- Exactly what action/fix was implemented. Written on AMBER -> GREEN.
-- ============================================================================
ALTER TABLE issue_tracking.issues
    ADD COLUMN IF NOT EXISTS implementation_done TEXT NULL;

-- ============================================================================
-- 3. final_resolution — "Final Resolution".
--
-- The final outcome and why the Issue is considered solved. Written on
-- AMBER -> GREEN.
--
-- DELIBERATELY NOT issues.resolution. That column already holds intake-time
-- "Fix & Action Required" content for 125 historical Issues and is displayed
-- as such; reusing it would overwrite historical content, which this stage
-- forbids.
-- ============================================================================
ALTER TABLE issue_tracking.issues
    ADD COLUMN IF NOT EXISTS final_resolution TEXT NULL;

-- ============================================================================
-- 4. process_started_at — when work actually started.
--
-- Set automatically (server clock, never client-supplied) on the first
-- RED -> AMBER transition, and never moved afterwards, so the record of when
-- work began cannot be rewritten by a later progress update.
--
-- TIMESTAMPTZ rather than the DATE used by discussions.process_start_date:
-- an Issue can move RED -> AMBER -> GREEN inside a single day, and a DATE
-- would make "Process Started" and "Completed" indistinguishable.
-- ============================================================================
ALTER TABLE issue_tracking.issues
    ADD COLUMN IF NOT EXISTS process_started_at TIMESTAMPTZ NULL;

-- ============================================================================
-- 5. completed_at — when the Issue was completely solved.
--
-- Set automatically on the transition into GREEN. The pre-existing (and
-- entirely unused) issues.completed_date is set in the same statement to the
-- calendar-date part of the same instant, so the historical DATE column
-- becomes correct rather than being left permanently empty beside a new one
-- — one concept, one write, two precisions.
--
-- issues.created_date is always CURRENT_DATE at insert time (see
-- createIssue() in lib/queries/issues.ts), so it can never be in the future
-- and the pre-existing chk_completed_date (completed_date >= created_date)
-- can never be violated by writing CURRENT_DATE.
-- ============================================================================
ALTER TABLE issue_tracking.issues
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

-- ============================================================================
-- In-transaction verification — data-preservation gate.
--
-- Nullable ADD COLUMN with no DEFAULT cannot change row counts or existing
-- values, so these checks can never fail in normal operation. They are
-- defence in depth: any difference rolls back everything in this file.
-- ============================================================================
DO $$
DECLARE
    b RECORD;
    v_issues            BIGINT;
    v_resolution        BIGINT;
    v_completed_date    BIGINT;
    v_status_history    BIGINT;
    v_comments          BIGINT;
    v_assignments       BIGINT;
    v_staff             BIGINT;
    v_fingerprint       TEXT;
    v_missing           TEXT;
    v_new_non_null      BIGINT;
BEGIN
    SELECT * INTO b FROM _m012_before;

    SELECT count(*)               INTO v_issues         FROM issue_tracking.issues;
    SELECT count(resolution)      INTO v_resolution     FROM issue_tracking.issues;
    SELECT count(completed_date)  INTO v_completed_date FROM issue_tracking.issues;
    SELECT count(*)               INTO v_status_history FROM issue_tracking.issue_status_history;
    SELECT count(*)               INTO v_comments       FROM issue_tracking.issue_comments;
    SELECT count(*)               INTO v_assignments    FROM issue_tracking.issue_assignments;
    SELECT count(*)               INTO v_staff          FROM issue_tracking.issue_staff;
    SELECT md5(string_agg(issue_id, ',' ORDER BY issue_id))
      INTO v_fingerprint FROM issue_tracking.issues;

    IF v_issues <> b.issues THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues went from % to %. Rolling back.', b.issues, v_issues;
    END IF;
    IF v_fingerprint IS DISTINCT FROM b.issue_id_fingerprint THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: the set of issue_id values changed. Historical IDs must never be altered or renumbered. Rolling back.';
    END IF;
    IF v_resolution <> b.issues_resolution_non_null THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues.resolution non-null count went from % to % — historical "Fix & Action Required" content must not change. Rolling back.', b.issues_resolution_non_null, v_resolution;
    END IF;
    IF v_completed_date <> b.issues_completed_date_non_null THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues.completed_date non-null count went from % to %. This migration writes no data. Rolling back.', b.issues_completed_date_non_null, v_completed_date;
    END IF;
    IF v_status_history <> b.status_history THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_status_history went from % to %. Rolling back.', b.status_history, v_status_history;
    END IF;
    IF v_comments <> b.comments THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_comments went from % to %. Rolling back.', b.comments, v_comments;
    END IF;
    IF v_assignments <> b.assignments THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_assignments went from % to %. Rolling back.', b.assignments, v_assignments;
    END IF;
    IF v_staff <> b.staff THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_staff went from % to %. Rolling back.', b.staff, v_staff;
    END IF;

    -- All five columns must exist after this file runs.
    SELECT string_agg(c.name, ', ') INTO v_missing
    FROM (VALUES
        ('implementation_progress'),
        ('implementation_done'),
        ('final_resolution'),
        ('process_started_at'),
        ('completed_at')
    ) AS c(name)
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'issues'
          AND column_name  = c.name
    );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: column(s) not created: %. Rolling back.', v_missing;
    END IF;

    -- This migration populates nothing. Every new column must be entirely NULL.
    SELECT count(*) INTO v_new_non_null
    FROM issue_tracking.issues
    WHERE implementation_progress IS NOT NULL
       OR implementation_done     IS NOT NULL
       OR final_resolution        IS NOT NULL
       OR process_started_at      IS NOT NULL
       OR completed_at            IS NOT NULL;
    IF v_new_non_null <> 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: % row(s) already carry work-detail values — this migration writes no data. Rolling back.', v_new_non_null;
    END IF;

    RAISE NOTICE 'Migration 012 verification passed. issues=%, resolution non-null=% (unchanged), status_history=%, comments=%, assignments=%, new columns all NULL.',
        v_issues, v_resolution, v_status_history, v_comments, v_assignments;
END $$;

COMMIT;
