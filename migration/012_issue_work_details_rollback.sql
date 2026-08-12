-- ============================================================================
-- migration/012_issue_work_details_rollback.sql
--
-- Reverses migration/012_issue_work_details.sql by dropping ONLY the five
-- columns that file added.
--
-- ⚠ DESTRUCTIVE OF STAGE-6 WORK DETAILS. Dropping these columns permanently
--   discards every "Implementation In Progress" / "Implementation Done" /
--   "Final Resolution" value and every process-start / completion timestamp
--   recorded since 012 was applied. The append-only evidence written into
--   issue_tracking.issue_status_history (reason) and
--   issue_tracking.issue_comments ('investigation_note') is NOT touched by
--   this file and survives, so the work log itself is not lost — only the
--   current-value columns are.
--
--   Run this only if migration 012 is being withdrawn.
--
-- What this file does NOT do, ever:
--  - touch issue_tracking.issues.resolution (historical "Fix & Action
--    Required" content) or completed_date — neither was created by 012;
--  - drop, truncate, or delete any table or any row;
--  - alter any issue_id.
--
-- Guarded identically to the forward migration: varmen_db check, single
-- transaction, and an in-transaction verification that row counts and the
-- issue_id set are unchanged.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". Nothing dropped.', current_database();
    END IF;
END $$;

CREATE TEMP TABLE _m012_rb_before ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM issue_tracking.issues)               AS issues,
    (SELECT count(resolution) FROM issue_tracking.issues)      AS issues_resolution_non_null,
    (SELECT count(*) FROM issue_tracking.issue_status_history) AS status_history,
    (SELECT count(*) FROM issue_tracking.issue_comments)       AS comments,
    (SELECT count(*) FROM issue_tracking.issue_assignments)    AS assignments,
    (SELECT md5(string_agg(issue_id, ',' ORDER BY issue_id))
       FROM issue_tracking.issues)                             AS issue_id_fingerprint;

ALTER TABLE issue_tracking.issues DROP COLUMN IF EXISTS implementation_progress;
ALTER TABLE issue_tracking.issues DROP COLUMN IF EXISTS implementation_done;
ALTER TABLE issue_tracking.issues DROP COLUMN IF EXISTS final_resolution;
ALTER TABLE issue_tracking.issues DROP COLUMN IF EXISTS process_started_at;
ALTER TABLE issue_tracking.issues DROP COLUMN IF EXISTS completed_at;

DO $$
DECLARE
    b RECORD;
    v_issues      BIGINT;
    v_resolution  BIGINT;
    v_history     BIGINT;
    v_comments    BIGINT;
    v_assignments BIGINT;
    v_fingerprint TEXT;
    v_remaining   TEXT;
BEGIN
    SELECT * INTO b FROM _m012_rb_before;

    SELECT count(*)          INTO v_issues      FROM issue_tracking.issues;
    SELECT count(resolution) INTO v_resolution  FROM issue_tracking.issues;
    SELECT count(*)          INTO v_history     FROM issue_tracking.issue_status_history;
    SELECT count(*)          INTO v_comments    FROM issue_tracking.issue_comments;
    SELECT count(*)          INTO v_assignments FROM issue_tracking.issue_assignments;
    SELECT md5(string_agg(issue_id, ',' ORDER BY issue_id))
      INTO v_fingerprint FROM issue_tracking.issues;

    IF v_issues <> b.issues THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issues went from % to %.', b.issues, v_issues;
    END IF;
    IF v_fingerprint IS DISTINCT FROM b.issue_id_fingerprint THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: the set of issue_id values changed.';
    END IF;
    IF v_resolution <> b.issues_resolution_non_null THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issues.resolution non-null count went from % to %.', b.issues_resolution_non_null, v_resolution;
    END IF;
    IF v_history <> b.status_history THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issue_status_history went from % to % — the work log must survive a rollback.', b.status_history, v_history;
    END IF;
    IF v_comments <> b.comments THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issue_comments went from % to % — the progress log must survive a rollback.', b.comments, v_comments;
    END IF;
    IF v_assignments <> b.assignments THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: issue_assignments went from % to %.', b.assignments, v_assignments;
    END IF;

    SELECT string_agg(c.name, ', ') INTO v_remaining
    FROM (VALUES
        ('implementation_progress'),
        ('implementation_done'),
        ('final_resolution'),
        ('process_started_at'),
        ('completed_at')
    ) AS c(name)
    WHERE EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'issues'
          AND column_name  = c.name
    );
    IF v_remaining IS NOT NULL THEN
        RAISE EXCEPTION 'ROLLBACK VERIFICATION FAILED: column(s) still present: %.', v_remaining;
    END IF;

    RAISE NOTICE 'Migration 012 rollback verified. issues=%, resolution non-null=% (unchanged), status_history=% (preserved), comments=% (preserved).',
        v_issues, v_resolution, v_history, v_comments;
END $$;

COMMIT;
