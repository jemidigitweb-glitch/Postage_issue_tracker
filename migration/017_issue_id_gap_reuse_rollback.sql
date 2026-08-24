-- ============================================================================
-- migration/017_issue_id_gap_reuse_rollback.sql
--
-- Reverses migration/017_issue_id_gap_reuse.sql: restores
-- issue_tracking.next_issue_id() to the migration 006 behaviour (lazy
-- counter provisioning + straight increment, never reusing a released
-- number).
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
-- It does NOT rename any archived ('...~released~...') issue_id back to its
-- original human-facing code, and it does NOT touch issue_tracking.issues,
-- issue_number_counters, or any other table. If 017 already reused a gap
-- before this rollback runs, that reused Issue keeps the code it was given
-- and the old archived row keeps its archived id — reversing that would be
-- a data decision (which Issue "deserves" the code back), not something
-- this rollback can safely infer.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/017_issue_id_gap_reuse_rollback.sql
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
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.next_issue_id(varchar) does not exist. Nothing to roll back.';
    END IF;
END $$;

-- Byte-for-byte migration/006_next_issue_id_lazy_counter.sql's function body.
CREATE OR REPLACE FUNCTION issue_tracking.next_issue_id(p_staff_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_number INTEGER;
BEGIN
    INSERT INTO issue_tracking.issue_number_counters (staff_code, next_number)
    SELECT p_staff_code, COALESCE(MAX((split_part(i.issue_id, '-', 2))::int), 0) + 1
    FROM issue_tracking.issues i
    WHERE i.staff_code = p_staff_code
    ON CONFLICT (staff_code) DO NOTHING;

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

DO $$
BEGIN
    IF to_regprocedure('issue_tracking.next_issue_id(varchar)') IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_tracking.next_issue_id(varchar) missing after rollback. Rolling back.';
    END IF;
END $$;

COMMIT;
