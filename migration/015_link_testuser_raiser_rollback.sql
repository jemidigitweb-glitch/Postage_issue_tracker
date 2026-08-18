-- ============================================================================
-- migration/015_link_testuser_raiser_rollback.sql
--
-- Reverses migration/015_link_testuser_raiser.sql: clears the account's
-- staff_code and removes the TU raiser row.
--
-- ── IT REFUSES ONCE TU HAS RAISED ANYTHING ─────────────────────────────────
-- If any Issue carries staff_code = 'TU', this file stops. It does NOT delete
-- those Issues, and it does not detach them — an Issue without a raiser is not
-- a state this schema allows (issues.staff_code is NOT NULL with an FK), and
-- deleting real Issues to undo a link would be catastrophic and irreversible.
-- The FK is ON DELETE RESTRICT, so the database would refuse anyway; this
-- check exists so the operator gets a sentence explaining why instead of a
-- constraint error.
--
-- It also refuses if TU's number counter has advanced past its initial state,
-- because that means Issue IDs were handed out — TU-001 may exist somewhere
-- outside the issues table's current contents, and rolling back would let the
-- same ID be issued twice later.
--
-- ── WHAT IT NEVER TOUCHES ──────────────────────────────────────────────────
-- The TestUser LOGIN survives intact: username, email, password_hash, role and
-- active are not written. Only staff_code returns to NULL, which is exactly
-- the state migration 014 left it in. WH / "Warehouse Mobile" and the five
-- historical raisers are never referenced for modification.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/015_link_testuser_raiser_rollback.sql
-- ============================================================================

BEGIN;

-- ── MANDATORY IDENTITY GATE — BOTH values, before ANY write ────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' OR current_user <> 'varmen_user' THEN
        RAISE EXCEPTION
            'Refusing to run: expected varmen_user on varmen_db, connected as % on %. No writes performed.',
            current_user, current_database();
    END IF;
END $$;

DO $$
DECLARE
    v_tu_issues  INTEGER;
    v_issue_ids  TEXT;
    v_next       INTEGER;
    v_linked     INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM issue_tracking.issue_staff WHERE staff_code = 'TU') THEN
        RAISE EXCEPTION 'Refusing to run: no TU raiser exists — migration 015 is not applied';
    END IF;

    -- ── SAFETY 1: TU must not have raised any Issue ────────────────────────
    SELECT count(*), COALESCE(string_agg(issue_id, ', ' ORDER BY issue_id), '')
      INTO v_tu_issues, v_issue_ids
    FROM issue_tracking.issues
    WHERE staff_code = 'TU';

    IF v_tu_issues > 0 THEN
        RAISE EXCEPTION
            'Refusing to roll back: TU has raised % Issue(s) (%). Their raiser cannot be removed, and this file will never delete an Issue to make a rollback possible.',
            v_tu_issues, v_issue_ids;
    END IF;

    -- ── SAFETY 2: no TU Issue ID may already have been handed out ──────────
    SELECT next_number INTO v_next
    FROM issue_tracking.issue_number_counters
    WHERE staff_code = 'TU';

    IF v_next IS NOT NULL AND v_next > 1 THEN
        RAISE EXCEPTION
            'Refusing to roll back: TU''s counter is at % — Issue ID(s) have already been allocated. Removing the raiser now could let the same ID be issued again later.',
            v_next;
    END IF;
END $$;

-- ── THE REVERSAL ───────────────────────────────────────────────────────────
-- Order matters: the link and the counter both reference issue_staff, so they
-- go first. Only staff_code is written on the account — no credential, no role,
-- no active flag.
UPDATE issue_tracking.management_users
SET staff_code = NULL,
    updated_at = now()
WHERE staff_code = 'TU';

-- Present only if next_issue_id('TU') was called and left it at 1; safety 2
-- above has already refused anything higher. FK'd to issue_staff, so it must
-- go before the raiser row.
DELETE FROM issue_tracking.issue_number_counters
WHERE staff_code = 'TU' AND next_number = 1;

DELETE FROM issue_tracking.issue_staff
WHERE staff_code = 'TU';

-- Prove the reversal is complete and nothing else moved.
DO $$
DECLARE
    v_linked INTEGER;
    v_staff  INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM issue_tracking.issue_staff WHERE staff_code = 'TU') THEN
        RAISE EXCEPTION 'Refusing to commit: the TU raiser row is still present';
    END IF;

    SELECT count(*) INTO v_linked
    FROM issue_tracking.management_users
    WHERE staff_code IS NOT NULL;

    IF v_linked <> 0 THEN
        RAISE EXCEPTION 'Refusing to commit: % account(s) still carry a staff_code', v_linked;
    END IF;

    -- The login itself must have survived, and so must the other raisers.
    IF NOT EXISTS (SELECT 1 FROM issue_tracking.management_users WHERE role = 'raised_by' AND active = TRUE) THEN
        RAISE EXCEPTION 'Refusing to commit: the raised_by login is gone or deactivated — a rollback must not touch the account';
    END IF;

    SELECT count(*) INTO v_staff FROM issue_tracking.issue_staff;
    IF v_staff <> 6 THEN
        RAISE EXCEPTION 'Refusing to commit: expected the 6 pre-existing raisers to remain, found %', v_staff;
    END IF;
END $$;

COMMIT;
