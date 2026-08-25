-- ============================================================================
-- migration/017_issue_id_gap_reuse.sql
-- Adds released-number reuse to issue_tracking.next_issue_id(), while
-- preserving every soft-deleted Issue's data (migration/004_soft_delete.sql
-- history is never hard-deleted, and no ACTIVE or historically-touched
-- Issue is ever renumbered — see the eligibility rule below).
--
-- BACKGROUND / WHY A GAP CAN BE REUSED AT ALL
-- issue_id is issue_tracking.issues' PRIMARY KEY, so two rows can never hold
-- the same value at once — even one soft-deleted (deleted_at IS NOT NULL)
-- and one new/active. To free a human-facing code like "AT-058" for reuse
-- while keeping its old row and history intact, the OLD row's issue_id is
-- renamed ("archived") to a reserved, never-user-facing form
-- ('<code>-<digits>~released~<epoch_ms>'), and the NEW Issue is inserted
-- under the now-free code, inside the SAME transaction as the archive
-- rename. No child row is ever touched.
--
-- ELIGIBILITY — a soft-deleted Issue's number is reused ONLY if:
--   1. It is soft-deleted (deleted_at IS NOT NULL).
--   2. Its number is >= the lowest number ever issued for that prefix (the
--      historical floor) — implied by "it was already issued", checked
--      explicitly too so numbers below the floor are never invented.
--   3. It has ZERO rows in every table that references issue_id:
--      issue_status_history, issue_assignment_history, issue_comments,
--      issue_staff_assignments, issue_assignments, discussion_points
--      (linked_issue_id), discussions (linked_issue_id).
--      This is a hard safety rule, not a preference: those foreign keys are
--      ON DELETE RESTRICT / ON UPDATE NO ACTION, so if any of them
--      referenced the old issue_id, renaming it would either fail outright
--      (Postgres re-checks the FK the instant the parent key changes) or,
--      if it somehow succeeded, would make an old Issue's comments/history
--      ambiguous with the new Issue reusing its code. An Issue that was
--      ever commented on, assigned, had a status change recorded, or
--      linked to a Discussion keeps its number permanently retired, exactly
--      as before this migration.
--   4. Smallest eligible number wins (deterministic — lowest gap filled
--      first).
--
-- CONCURRENCY — the eligible row is selected with
-- `FOR UPDATE OF i SKIP LOCKED`, so two simultaneous callers for the same
-- staff_code can never select and archive the same gap: the loser simply
-- skips it (falls through to the next-smallest gap, or the normal counter
-- path if none remain). The archive-rename and the caller's own INSERT of
-- the new Issue happen in the SAME transaction
-- (lib/queries/issues.ts's createIssueTx/createIssue/createMobileIssue
-- already wrap next_issue_id() + INSERT in one BEGIN/COMMIT/ROLLBACK) — a
-- rollback (e.g. the INSERT fails) undoes the archive rename too, so a
-- failed creation can never burn a released number, exactly like the
-- existing counter path already guaranteed for brand-new numbers.
--
-- WHEN NO GAP QUALIFIES — behaviour is unchanged from migration 006: the
-- per-staff_code counter increments and a brand-new number is issued. No
-- number below the historical floor is ever invented.
--
-- NOTHING ELSE CHANGES: no ACTIVE Issue's issue_id is ever touched by this
-- function, no DELETE statement anywhere, no table structure changes. The
-- regex filter `issue_id ~ ('^' || p_staff_code || '-[0-9]+$')` is applied
-- everywhere split_part(...)::int is computed, so an already-archived row
-- (holding a '~released~' suffix) is never mistaken for a normal numbered
-- Issue and never crashes the cast.
--
-- Verified live against issue_tracking's actual tables before writing this
-- file (information_schema introspection): issue_status_history,
-- issue_assignment_history, issue_comments, issue_staff_assignments,
-- issue_assignments, discussion_points, discussions all exist with the
-- issue_id / linked_issue_id foreign keys this function checks.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' OR current_user <> 'varmen_user' THEN
        RAISE EXCEPTION 'SAFETY ABORT: expected varmen_user on varmen_db, connected as % on %. No changes made.', current_user, current_database();
    END IF;
END $$;

DO $$
BEGIN
    IF to_regprocedure('issue_tracking.next_issue_id(varchar)') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.next_issue_id(varchar) does not exist. This migration only replaces it, never creates it from scratch.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION issue_tracking.next_issue_id(p_staff_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_floor        INTEGER;
    v_gap_issue_id VARCHAR;
    v_archive_id   VARCHAR;
    v_number       INTEGER;
BEGIN
    -- Lazily provision a missing counter row (unchanged from migration 006).
    -- Pattern-filtered so an already-archived row ('...~released~...') is
    -- never fed into the ::int cast.
    INSERT INTO issue_tracking.issue_number_counters (staff_code, next_number)
    SELECT p_staff_code, COALESCE(MAX((split_part(i.issue_id, '-', 2))::int), 0) + 1
    FROM issue_tracking.issues i
    WHERE i.staff_code = p_staff_code
      AND i.issue_id ~ ('^' || p_staff_code || '-[0-9]+$')
    ON CONFLICT (staff_code) DO NOTHING;

    -- Historical floor: the lowest number ever issued for this prefix.
    -- Numbers below this are never invented, reused, or created.
    SELECT MIN((split_part(i.issue_id, '-', 2))::int) INTO v_floor
    FROM issue_tracking.issues i
    WHERE i.staff_code = p_staff_code
      AND i.issue_id ~ ('^' || p_staff_code || '-[0-9]+$');

    -- Smallest reusable gap: soft-deleted, at/above the floor, and with
    -- ZERO rows in any table that references issue_id (see eligibility
    -- rule above). SKIP LOCKED so a concurrent caller for the same prefix
    -- falls through to the next candidate instead of blocking.
    SELECT i.issue_id INTO v_gap_issue_id
    FROM issue_tracking.issues i
    WHERE i.staff_code = p_staff_code
      AND i.issue_id ~ ('^' || p_staff_code || '-[0-9]+$')
      AND i.deleted_at IS NOT NULL
      AND v_floor IS NOT NULL
      AND (split_part(i.issue_id, '-', 2))::int >= v_floor
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.issue_status_history h WHERE h.issue_id = i.issue_id)
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.issue_assignment_history a WHERE a.issue_id = i.issue_id)
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.issue_comments c WHERE c.issue_id = i.issue_id)
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.issue_staff_assignments sa WHERE sa.issue_id = i.issue_id)
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.issue_assignments asg WHERE asg.issue_id = i.issue_id)
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.discussion_points dp WHERE dp.linked_issue_id = i.issue_id)
      AND NOT EXISTS (SELECT 1 FROM issue_tracking.discussions d WHERE d.linked_issue_id = i.issue_id)
    ORDER BY (split_part(i.issue_id, '-', 2))::int ASC
    FOR UPDATE OF i SKIP LOCKED
    LIMIT 1;

    IF v_gap_issue_id IS NOT NULL THEN
        v_archive_id := v_gap_issue_id || '~released~' || floor(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::text;

        -- Renames ONLY this one soft-deleted, childless row. No other
        -- Issue (active or historical) is touched. If a concurrent write
        -- has, against expectation, added a child row for this Issue
        -- between the check above and here, the ON DELETE RESTRICT /
        -- NO ACTION foreign keys on issue_id make this UPDATE fail loudly
        -- (never silently) rather than orphan or misattribute anything.
        UPDATE issue_tracking.issues
        SET issue_id = v_archive_id
        WHERE issue_id = v_gap_issue_id;

        RETURN v_gap_issue_id;
    END IF;

    -- No eligible gap: fall back to the normal, unchanged counter path.
    UPDATE issue_tracking.issue_number_counters
    SET next_number = next_number + 1,
        updated_at = now()
    WHERE staff_code = p_staff_code
    RETURNING next_number - 1 INTO v_number;

    IF v_number IS NULL THEN
        RAISE EXCEPTION 'No issue_number_counters row for staff_code % (staff_code likely does not exist in issue_staff)', p_staff_code;
    END IF;

    RETURN p_staff_code || '-' || lpad(v_number::text, GREATEST(3, length(v_number::text)), '0');
END;
$$ LANGUAGE plpgsql;

-- ── Verification ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('issue_tracking.next_issue_id(varchar)') IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_tracking.next_issue_id(varchar) missing after CREATE OR REPLACE. Rolling back.';
    END IF;
END $$;

COMMIT;
