-- ============================================================================
-- migration/014_raised_by_staff_link_rollback.sql
--
-- PREPARED ONLY — NOT EXECUTED.
--
-- Reverses migration/014_raised_by_staff_link.sql by dropping the UNIQUE
-- constraint, the foreign key and the staff_code column from
-- issue_tracking.management_users.
--
-- ── IT REFUSES TO RUN WHILE ANY ACCOUNT IS LINKED ──────────────────────────
-- Dropping the column would silently destroy every account-to-raiser link, and
-- unlike a constraint that is a loss of DATA, not of structure — there would be
-- no record of which login was which raiser. So this file checks first and
-- stops with a message naming the accounts in the way.
--
-- To roll back deliberately, an operator must FIRST decide what happens to
-- those links and unlink them as its own reviewed step. This file will never
-- make that decision, and it never modifies an account.
--
-- It touches NOTHING else: no issue_staff row is removed (the raisers created
-- by a later migration are real people and outlive this column), no Issue is
-- touched, and nothing outside issue_tracking is referenced.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/014_raised_by_staff_link_rollback.sql
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

-- Nothing to do is not an error worth a stack trace, but it IS worth saying.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'management_users'
          AND column_name  = 'staff_code'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: management_users.staff_code does not exist — migration 014 is not applied';
    END IF;
END $$;

-- ── THE SAFETY CONDITION ───────────────────────────────────────────────────
-- Checked after identity, still before every write. Fails clearly rather than
-- destructively.
DO $$
DECLARE
    v_count INTEGER;
    v_codes TEXT;
BEGIN
    SELECT count(*), COALESCE(string_agg(staff_code, ', ' ORDER BY staff_code), '')
      INTO v_count, v_codes
    FROM issue_tracking.management_users
    WHERE staff_code IS NOT NULL;

    IF v_count > 0 THEN
        RAISE EXCEPTION
            'Refusing to roll back: % account(s) are linked to raisers (%). Unlink them first as a separate reviewed step — this file will not modify an account, and dropping the column would destroy the link with no record of it.',
            v_count, v_codes;
    END IF;
END $$;

-- Dropped in reverse order of creation. Dropping the column alone would remove
-- both constraints implicitly, but naming them makes the rollback readable
-- against the migration it reverses.
ALTER TABLE issue_tracking.management_users
    DROP CONSTRAINT IF EXISTS management_users_staff_code_key;

ALTER TABLE issue_tracking.management_users
    DROP CONSTRAINT IF EXISTS management_users_staff_code_fkey;

ALTER TABLE issue_tracking.management_users
    DROP COLUMN IF EXISTS staff_code;

-- Prove the reversal is complete, and that nothing else was disturbed.
DO $$
DECLARE
    v_users INTEGER;
    v_staff INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name = 'management_users'
          AND column_name = 'staff_code'
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: staff_code column still present';
    END IF;

    SELECT count(*) INTO v_users FROM issue_tracking.management_users;
    SELECT count(*) INTO v_staff FROM issue_tracking.issue_staff;

    IF v_users = 0 OR v_staff = 0 THEN
        RAISE EXCEPTION 'Refusing to commit: accounts=% staff=% — a rollback must remove neither', v_users, v_staff;
    END IF;
END $$;

COMMIT;
