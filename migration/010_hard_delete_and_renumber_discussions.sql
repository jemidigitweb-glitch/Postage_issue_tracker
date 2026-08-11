-- ============================================================================
-- migration/010_hard_delete_and_renumber_discussions.sql
-- ONE-TIME, EXPLICITLY CONFIRMED, DESTRUCTIVE data operation. Executed only
-- after the task owner explicitly confirmed (via 3 direct questions):
--   1. Hard-delete DISC-002 (TEST discussion) — permanent, not soft-delete.
--   2. Hard-delete DISC-001 (old, already soft-deleted "container" from the
--      original wrong points-based design) — permanent.
--   3. Renumber the 14 German Market Discussions from DISC-003..016 down to
--      DISC-001..014 (title order preserved), reversing this project's
--      earlier "never renumber" rule for this one, explicitly confirmed
--      case only.
--
-- MANDATORY FIRST STEP (already performed manually before this file runs):
--   pg_dump --format=custom --file=backups/pre_discussion_renumber_<ts>.dump $DATABASE_URL
-- This is the actual rollback mechanism for this file — hard deletes and
-- primary-key renumbering are not soft-reversible. Do not run this file
-- without a confirmed, non-empty backup already on disk.
--
-- SAFETY MODEL:
--  - HARD TARGET-DATABASE CHECK before any statement.
--  - Pre-write snapshot of issues/issue_staff (must be provably unchanged
--    after commit — this file never touches issue_tracking.issues or
--    issue_tracking.issue_staff).
--  - Pre-write snapshot of exactly which discussion_id currently holds the
--    SA-021 Issue link, re-verified post-write against the KNOWN new ID it
--    must now hold (DISC-010 -> DISC-008), aborting otherwise.
--  - Child rows (discussion_participants/points/comments/status_history)
--    for DISC-001 and DISC-002 are deleted BEFORE their parent row (FK
--    ON DELETE RESTRICT would otherwise block the parent DELETE) — nothing
--    is left orphaned, nothing is silently skipped.
--  - The 4 discussion_id foreign keys are DROPped and RE-ADDed (not
--    CASCADE-ed) inside this same transaction, specifically so Postgres
--    re-validates every remaining reference against the new IDs before
--    COMMIT — any mistake in the renumbering surfaces as a constraint
--    violation here, not as silent data corruption.
--  - Renumbering processes the 14 rows in strict ascending current-ID
--    order (DISC-003 -> DISC-001 first, ..., DISC-016 -> DISC-014 last) —
--    each target ID was vacated by the immediately preceding hard-delete or
--    rename, so no temporary collision with the UNIQUE discussion_id
--    constraint is possible at any point.
--  - issue_tracking.discussion_id_counter is deliberately left UNCHANGED
--    (still produces DISC-017 next) — resetting it was not part of what was
--    confirmed, and this project's established rule is to never reset an
--    ID counter. A gap between DISC-014 and the next new Discussion is an
--    accepted, intentional consequence of renumbering, not a bug.
--  - No object in this file lives outside issue_tracking. No statement
--    references ledsone, ph_dashboard, postgres, staff.users, issues, or
--    issue_staff.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No writes made.', current_database();
    END IF;
END $$;

-- ── Pre-write snapshot ───────────────────────────────────────────────────────
DO $$
DECLARE
    v_issue_count  INT;
    v_staff_count  INT;
    v_sa021_holder TEXT;
BEGIN
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT discussion_id INTO v_sa021_holder FROM issue_tracking.discussions WHERE linked_issue_id = 'SA-021' AND deleted_at IS NULL;

    IF v_sa021_holder IS DISTINCT FROM 'DISC-010' THEN
        RAISE EXCEPTION 'SAFETY ABORT: expected SA-021 currently linked to DISC-010, found "%". Refusing to proceed with an unexpected starting state.', v_sa021_holder;
    END IF;

    CREATE TEMP TABLE _pre_snapshot (issue_count INT, staff_count INT, sa021_holder TEXT) ON COMMIT DROP;
    INSERT INTO _pre_snapshot VALUES (v_issue_count, v_staff_count, v_sa021_holder);
END $$;

-- Precondition: exactly the expected starting rows exist (catches this
-- script being run twice, or against a database that has already changed).
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM issue_tracking.discussions
      WHERE discussion_id IN ('DISC-001','DISC-002','DISC-003','DISC-004','DISC-005','DISC-006','DISC-007',
                               'DISC-008','DISC-009','DISC-010','DISC-011','DISC-012','DISC-013','DISC-014',
                               'DISC-015','DISC-016');
    IF v_count <> 16 THEN
        RAISE EXCEPTION 'SAFETY ABORT: expected exactly 16 discussions (DISC-001..016) before this operation, found %. Refusing to guess. No writes made.', v_count;
    END IF;
END $$;

-- ============================================================================
-- 1. Hard-delete DISC-001 (old container) — children first, then parent.
-- ============================================================================
DELETE FROM issue_tracking.discussion_comments       WHERE discussion_id = 'DISC-001';
DELETE FROM issue_tracking.discussion_status_history  WHERE discussion_id = 'DISC-001';
DELETE FROM issue_tracking.discussion_points          WHERE discussion_id = 'DISC-001';
DELETE FROM issue_tracking.discussion_participants    WHERE discussion_id = 'DISC-001';
DELETE FROM issue_tracking.discussions                WHERE discussion_id = 'DISC-001';

-- ============================================================================
-- 2. Hard-delete DISC-002 (TEST discussion) — children first, then parent.
-- ============================================================================
DELETE FROM issue_tracking.discussion_comments       WHERE discussion_id = 'DISC-002';
DELETE FROM issue_tracking.discussion_status_history  WHERE discussion_id = 'DISC-002';
DELETE FROM issue_tracking.discussion_points          WHERE discussion_id = 'DISC-002';
DELETE FROM issue_tracking.discussion_participants    WHERE discussion_id = 'DISC-002';
DELETE FROM issue_tracking.discussions                WHERE discussion_id = 'DISC-002';

-- ============================================================================
-- 3. Drop the 4 discussion_id foreign keys so the parent PK can be updated
--    and child rows repointed without an immediate (non-deferrable)
--    constraint violation. Re-added and re-validated in step 5.
-- ============================================================================
ALTER TABLE issue_tracking.discussion_participants   DROP CONSTRAINT discussion_participants_discussion_id_fkey;
ALTER TABLE issue_tracking.discussion_points         DROP CONSTRAINT discussion_points_discussion_id_fkey;
ALTER TABLE issue_tracking.discussion_comments       DROP CONSTRAINT discussion_comments_discussion_id_fkey;
ALTER TABLE issue_tracking.discussion_status_history DROP CONSTRAINT discussion_status_history_discussion_id_fkey;

-- ============================================================================
-- 4. Renumber. Strict ascending order: each target ID was vacated by the
--    hard-deletes above (DISC-001/002) or by the immediately preceding
--    rename in this same list — never a collision.
-- ============================================================================
DO $$
DECLARE
    v_mapping TEXT[][] := ARRAY[
        ['DISC-003','DISC-001'], ['DISC-004','DISC-002'], ['DISC-005','DISC-003'], ['DISC-006','DISC-004'],
        ['DISC-007','DISC-005'], ['DISC-008','DISC-006'], ['DISC-009','DISC-007'], ['DISC-010','DISC-008'],
        ['DISC-011','DISC-009'], ['DISC-012','DISC-010'], ['DISC-013','DISC-011'], ['DISC-014','DISC-012'],
        ['DISC-015','DISC-013'], ['DISC-016','DISC-014']
    ];
    v_pair TEXT[];
BEGIN
    FOREACH v_pair SLICE 1 IN ARRAY v_mapping LOOP
        UPDATE issue_tracking.discussion_participants   SET discussion_id = v_pair[2] WHERE discussion_id = v_pair[1];
        UPDATE issue_tracking.discussion_points         SET discussion_id = v_pair[2] WHERE discussion_id = v_pair[1];
        UPDATE issue_tracking.discussion_comments       SET discussion_id = v_pair[2] WHERE discussion_id = v_pair[1];
        UPDATE issue_tracking.discussion_status_history SET discussion_id = v_pair[2] WHERE discussion_id = v_pair[1];
        UPDATE issue_tracking.discussions               SET discussion_id = v_pair[2] WHERE discussion_id = v_pair[1];
    END LOOP;
END $$;

-- ============================================================================
-- 5. Re-add the 4 foreign keys — Postgres re-validates every row against
--    the new IDs right now; any mistake above surfaces here as an error,
--    aborting the whole transaction.
-- ============================================================================
ALTER TABLE issue_tracking.discussion_participants
    ADD CONSTRAINT discussion_participants_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT;
ALTER TABLE issue_tracking.discussion_points
    ADD CONSTRAINT discussion_points_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT;
ALTER TABLE issue_tracking.discussion_comments
    ADD CONSTRAINT discussion_comments_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT;
ALTER TABLE issue_tracking.discussion_status_history
    ADD CONSTRAINT discussion_status_history_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT;

-- ============================================================================
-- In-transaction verification — aborts (rolls back everything) if anything
-- doesn't match exactly what was confirmed.
-- ============================================================================
DO $$
DECLARE
    v_issue_count      INT;
    v_staff_count      INT;
    v_sa021_holder     TEXT;
    v_pre_issue        INT;
    v_pre_staff        INT;
    v_discussion_count INT;
    v_disc002_title_ok BOOLEAN;
    v_old_disc001_gone BOOLEAN;
    v_titles_ok        BOOLEAN;
BEGIN
    SELECT issue_count, staff_count INTO v_pre_issue, v_pre_staff FROM _pre_snapshot;

    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    IF v_issue_count <> v_pre_issue THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues count changed from % to %. Rolling back.', v_pre_issue, v_issue_count;
    END IF;
    IF v_staff_count <> v_pre_staff THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_staff count changed from % to %. Rolling back.', v_pre_staff, v_staff_count;
    END IF;

    SELECT discussion_id INTO v_sa021_holder FROM issue_tracking.discussions WHERE linked_issue_id = 'SA-021' AND deleted_at IS NULL;
    IF v_sa021_holder IS DISTINCT FROM 'DISC-008' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: SA-021 must now be linked to DISC-008 ("Minimum Product Price Review"), found "%". Rolling back.', v_sa021_holder;
    END IF;

    SELECT count(*) INTO v_discussion_count FROM issue_tracking.discussions WHERE deleted_at IS NULL;
    IF v_discussion_count <> 14 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: expected exactly 14 active discussions, found %. Rolling back.', v_discussion_count;
    END IF;

    -- DISC-002 is EXPECTED to exist after renumbering (it now holds
    -- "Customer Complaint Management", the 2nd of the 14) — this checks
    -- that it holds the correct NEW content, not the old TEST discussion.
    SELECT (SELECT title FROM issue_tracking.discussions WHERE discussion_id = 'DISC-002') = 'Customer Complaint Management'
    INTO v_disc002_title_ok;
    IF NOT v_disc002_title_ok THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: DISC-002 does not hold "Customer Complaint Management" after renumbering. Rolling back.';
    END IF;

    SELECT NOT EXISTS(
        SELECT 1 FROM issue_tracking.discussions
        WHERE discussion_id = 'DISC-001' AND title = 'German Market Coordination & Sales Improvement Meeting'
    ) INTO v_old_disc001_gone;
    IF NOT v_old_disc001_gone THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: old DISC-001 container still present. Rolling back.';
    END IF;

    SELECT (SELECT title FROM issue_tracking.discussions WHERE discussion_id = 'DISC-001') = 'German Market Data Understanding & Monitoring'
       AND (SELECT title FROM issue_tracking.discussions WHERE discussion_id = 'DISC-014') = 'Team Leader Coordination'
    INTO v_titles_ok;
    IF NOT v_titles_ok THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: DISC-001/DISC-014 titles do not match the expected renumbering. Rolling back.';
    END IF;
END $$;

COMMIT;
