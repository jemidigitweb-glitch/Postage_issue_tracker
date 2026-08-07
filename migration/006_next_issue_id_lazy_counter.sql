-- Fixes a real bug: adding a new staff_code via the app's Add Staff feature
-- (issue_tracking.issue_staff INSERT only) never provisioned a matching row
-- in issue_tracking.issue_number_counters (created by migration 002, seeded
-- once for the 4 staff_codes that existed at that time). The very first
-- issue created for any staff_code added after that seed fails with:
--   ERROR: No issue_number_counters row for staff_code <code>  (SQLSTATE P0001,
--   raised by issue_tracking.next_issue_id())
-- which lib/queries/issues.ts's createIssue() rolls back and rethrows, and
-- the UI reports as the generic "Could not save this issue."
--
-- Fix: next_issue_id() now lazily provisions its own counter row the first
-- time it's called for a staff_code that doesn't have one yet, computed
-- from the highest existing issue number for that staff_code (never just
-- resets to 1 if issues already exist for that prefix without a counter
-- row — matches the exact formula migration 002 used to seed the original
-- 4 rows). ON CONFLICT DO NOTHING makes the lazy provisioning race-safe:
-- if two concurrent calls for the same brand-new staff_code both attempt it,
-- only one INSERT succeeds and the other is a no-op; both then proceed
-- through the pre-existing atomic UPDATE ... RETURNING, which is what
-- actually serializes the number allocation (unchanged from migration 002 —
-- still not a MAX()+1-per-call scheme).
--
-- If staff_code doesn't exist in issue_staff at all, the lazy INSERT fails
-- on the existing FK (issue_number_counters.staff_code REFERENCES
-- issue_staff(staff_code)) and the whole call fails loudly — same
-- "reject, don't guess" behavior as before, just via a different (more
-- specific) Postgres error.
--
-- No historical data touched: issue_staff and issues are only read here
-- (SELECT/REFERENCES), never written. No existing counter row is ever
-- reset — ON CONFLICT DO NOTHING guarantees an existing row is left exactly
-- as-is.
--
-- SECOND BUG FIXED HERE, found while testing the above: migration 002's
-- original lpad(v_number::text, 3, '0') does not just "pad short numbers
-- and never truncate" as its own comment claimed — Postgres's lpad()
-- TRUNCATES on the right when the input is already longer than the target
-- width. Confirmed live: lpad('1000', 3, '0') = '100'. That means the
-- original function would have silently produced "<CODE>-100" (colliding
-- with the real 100th issue for that prefix) instead of "<CODE>-1000" the
-- moment any staff_code's counter reached 1000 — exactly the 4-digit case
-- this task requires to work (see its own "XY-1000" example). Fixed by
-- padding to GREATEST(3, actual digit count) instead of a fixed 3, which is
-- a no-op (never truncates) once the number is already >= 3 digits.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%".', current_database();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION issue_tracking.next_issue_id(p_staff_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_number INTEGER;
BEGIN
    -- Lazily provision a missing counter row (e.g. staff added after the
    -- migration 002 seed). Starting value = highest existing issue number
    -- for this staff_code + 1 (0 + 1 = 1 if none exist yet) — same formula
    -- migration 002 used, so a staff_code with pre-existing issues but no
    -- counter row still resumes correctly instead of colliding at "-001".
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

    -- GREATEST(3, ...) keeps the "-001" style for small numbers while never
    -- truncating once the number itself is 3+ digits (lpad() truncates on
    -- the right if asked to pad to a width shorter than the input — see
    -- comment above).
    RETURN p_staff_code || '-' || lpad(v_number::text, GREATEST(3, length(v_number::text)), '0');
END;
$$ LANGUAGE plpgsql;

COMMIT;
