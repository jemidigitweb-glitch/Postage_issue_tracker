-- ============================================================================
-- migration/015_link_testuser_raiser.sql
--
-- Purpose: make the existing Raised-by-Staff LOGIN and a new Issue RAISER the
-- same person, in one transaction.
--
--   issue_staff              TU / "TestUser" / active     <- created here
--   management_users.staff_code = 'TU' on the raised_by account  <- set here
--
-- staff_code 'TU' and staff_name 'TestUser' are the OWNER'S CHOICE, supplied
-- 2026-08-18. Nothing in this file guesses them, and nothing derives them from
-- the account's username or display name.
--
-- ── WHY BOTH HALVES ARE IN ONE TRANSACTION ─────────────────────────────────
-- The two failure modes this file exists to make impossible:
--   - a raiser row with no login  -> a person in the Raised By filter who
--     cannot sign in, silently accumulating Issues nobody can file.
--   - a login with no raiser      -> exactly today's bug: TestUser signs in,
--     submits from Mobile Lite, and the Issue is attributed to the generic
--     WH / "Warehouse Mobile" instead of to them.
-- Either both exist and are linked at COMMIT, or neither does.
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
--   - It does not touch the account's username, email, password_hash, role or
--     active flag. The ONLY column it writes on management_users is
--     staff_code, and only on the single raised_by row.
--   - It does not touch WH / "Warehouse Mobile", or any of AT/ND/NV/SA/ST.
--   - It does not touch a single row in issues. WH-001 and the 144 historical
--     Issues are not read for modification and not written.
--   - It does not create an Issue, and it does not consume TU-001. The counter
--     row for TU is left absent on purpose: next_issue_id('TU') provisions it
--     lazily at 1, so the FIRST REAL Issue TestUser raises is TU-001.
--   - It does not modify issue_tracking.next_issue_id() or introduce any
--     second numbering scheme.
--   - It touches nothing outside schema issue_tracking.
--
-- ── AUDIT FIRST (read-only, against varmen_db, 2026-08-18) ─────────────────
-- issue_staff: AT, ND, NV, SA, ST, WH — 'TU' is free.
-- management_users: 12 accounts; exactly 1 with role='raised_by', staff_code
--   NULL (migration 014 applied, links nobody).
-- issues by staff_code: AT 30, ND 67, NV 14, SA 27, ST 6, WH 1. No TU.
-- issue_number_counters: AT 54, ND 68, NV 15, SA 28, ST 7, WH 2. No TU.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/015_link_testuser_raiser.sql
-- Rollback: migration/015_link_testuser_raiser_rollback.sql
-- Verify:   migration/015_link_testuser_raiser_verify.sql
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

-- Migration 014 must be applied: without the column there is nothing to link.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'management_users'
          AND column_name  = 'staff_code'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: management_users.staff_code does not exist — apply migration 014 first';
    END IF;
END $$;

-- ── THE LINK ───────────────────────────────────────────────────────────────
-- One block, so the account is identified once, by role, and every later
-- statement reuses that id rather than re-running a lookup that could drift.
DO $$
DECLARE
    v_user_id     BIGINT;
    v_linked      TEXT;
    v_raised_by   INTEGER;
    v_tu_owner    TEXT;
    v_staff_rows  INTEGER;
    v_linked_rows INTEGER;
    v_tu_issues   INTEGER;
BEGIN
    -- B. Exactly ONE raised_by account. Zero means nothing to link; more than
    -- one means this file cannot know which person 'TU' is, and guessing would
    -- attach a real identity to the wrong login.
    SELECT count(*) INTO v_raised_by
    FROM issue_tracking.management_users
    WHERE role = 'raised_by';

    IF v_raised_by <> 1 THEN
        RAISE EXCEPTION
            'Refusing to run: expected exactly 1 raised_by account, found %. This migration links one named person and will not choose between accounts.',
            v_raised_by;
    END IF;

    SELECT user_id, staff_code INTO v_user_id, v_linked
    FROM issue_tracking.management_users
    WHERE role = 'raised_by';

    -- Already linked? Then this migration has run, or someone linked by hand.
    -- Either way it must not silently re-point an existing link.
    IF v_linked IS NOT NULL THEN
        RAISE EXCEPTION
            'Refusing to run: the raised_by account is already linked to staff_code %. Nothing to do, and this file will not re-point an existing link.',
            v_linked;
    END IF;

    -- C. 'TU' must be free. If it exists it belongs to somebody — possibly a
    -- real person added through Add Staff — and stealing their code would
    -- silently re-attribute every Issue they have ever raised.
    SELECT staff_name INTO v_tu_owner
    FROM issue_tracking.issue_staff
    WHERE staff_code = 'TU';

    IF v_tu_owner IS NOT NULL THEN
        RAISE EXCEPTION
            'Refusing to run: staff_code TU already exists and belongs to "%". Choose a different code rather than reassigning this one.',
            v_tu_owner;
    END IF;

    -- D. Create the raiser. INSERT only — no ON CONFLICT, because a conflict
    -- here would mean the check above was wrong and the run must fail loudly.
    INSERT INTO issue_tracking.issue_staff (staff_code, staff_name, active)
    VALUES ('TU', 'TestUser', TRUE);

    -- E. Link the login. Scoped by the user_id captured above, so it can reach
    -- exactly one row, and it writes exactly one column.
    UPDATE issue_tracking.management_users
    SET staff_code = 'TU',
        updated_at = now()
    WHERE user_id = v_user_id;

    -- F. Prove the end state before COMMIT.
    SELECT count(*) INTO v_staff_rows
    FROM issue_tracking.issue_staff
    WHERE staff_code = 'TU' AND staff_name = 'TestUser' AND active = TRUE;

    IF v_staff_rows <> 1 THEN
        RAISE EXCEPTION 'Refusing to commit: expected exactly 1 active TU/TestUser raiser, found %', v_staff_rows;
    END IF;

    -- Exactly one account carries TU, it is the raised_by one, and no other
    -- account was touched. (The UNIQUE constraint from 014 already makes a
    -- second one impossible; this asserts it rather than assuming it.)
    SELECT count(*) INTO v_linked_rows
    FROM issue_tracking.management_users
    WHERE staff_code = 'TU';

    IF v_linked_rows <> 1 THEN
        RAISE EXCEPTION 'Refusing to commit: % accounts are linked to TU, expected exactly 1', v_linked_rows;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM issue_tracking.management_users
        WHERE user_id = v_user_id AND role = 'raised_by' AND staff_code = 'TU' AND active = TRUE
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: the raised_by account is not correctly linked to TU';
    END IF;

    -- No other account may have acquired a staff_code as a side effect.
    SELECT count(*) INTO v_linked_rows
    FROM issue_tracking.management_users
    WHERE staff_code IS NOT NULL;

    IF v_linked_rows <> 1 THEN
        RAISE EXCEPTION
            'Refusing to commit: % accounts carry a staff_code, expected exactly 1 (only the raised_by account)',
            v_linked_rows;
    END IF;

    -- TU must own no Issues and no counter, so the first real Issue is TU-001.
    SELECT count(*) INTO v_tu_issues
    FROM issue_tracking.issues
    WHERE staff_code = 'TU';

    IF v_tu_issues <> 0 THEN
        RAISE EXCEPTION 'Refusing to commit: TU already has % Issue(s) — this migration must create none', v_tu_issues;
    END IF;

    IF EXISTS (SELECT 1 FROM issue_tracking.issue_number_counters WHERE staff_code = 'TU') THEN
        RAISE EXCEPTION 'Refusing to commit: a TU counter row exists — next_issue_id must provision it lazily so the first Issue is TU-001';
    END IF;
END $$;

-- The pre-existing raisers must all still be there, untouched.
DO $$
DECLARE
    v_missing TEXT;
BEGIN
    SELECT string_agg(code, ', ')
      INTO v_missing
    FROM unnest(ARRAY['AT', 'ND', 'NV', 'SA', 'ST', 'WH']) AS code
    WHERE NOT EXISTS (
        SELECT 1 FROM issue_tracking.issue_staff s WHERE s.staff_code = code
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Refusing to commit: pre-existing raiser(s) missing: %', v_missing;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM issue_tracking.issue_staff
        WHERE staff_code = 'WH' AND staff_name = 'Warehouse Mobile' AND active = TRUE
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: WH / Warehouse Mobile was altered';
    END IF;
END $$;

COMMIT;
