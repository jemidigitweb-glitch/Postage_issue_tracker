-- ============================================================================
-- migration/016_management_users_email_optional_rollback.sql
--
-- Reverses migration/016_management_users_email_optional.sql: restores
-- NOT NULL on issue_tracking.management_users.email.
--
-- ── WHAT THIS FILE DOES ────────────────────────────────────────────────────
-- Exactly one thing: ALTER COLUMN email SET NOT NULL.
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
--   - It deletes NO account, and it invents NO email. If an account has been
--     created WITHOUT an email since 016 was applied, this file REFUSES and
--     tells you how many. Filling those rows in with a placeholder address, or
--     deleting the accounts, would be a data decision this script has no
--     authority to make — and a fabricated address on an operational record is
--     worse than a rollback that stops and asks.
--   - It touches NO other column, NO other table, NO role and NO password.
--   - It does not drop or alter the UNIQUE constraint on email, which 016 did
--     not touch either.
--
-- ── HOW TO UNBLOCK A REFUSED ROLLBACK ──────────────────────────────────────
-- Run the report at the top of the verify script to see which accounts have no
-- email, then decide — deliberately, with the owner — whether each one should
-- be given an address or removed. Re-run this file afterwards.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/016_management_users_email_optional_rollback.sql
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
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'issue_tracking' AND table_name = 'management_users'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: issue_tracking.management_users does not exist';
    END IF;
END $$;

-- ── REFUSE RATHER THAN FABRICATE ───────────────────────────────────────────
-- SET NOT NULL would fail on its own with a not-null violation, but the raw
-- error names neither the table's purpose nor the number of affected accounts.
-- This says exactly what is in the way, before anything is attempted.
DO $$
DECLARE
    v_without INTEGER;
BEGIN
    SELECT count(*) INTO v_without
      FROM issue_tracking.management_users
     WHERE email IS NULL;

    IF v_without > 0 THEN
        RAISE EXCEPTION
            'Refusing to roll back: % management_users account(s) have no email. '
            'Restoring NOT NULL would require inventing an address or deleting an account, '
            'and this script does neither. No writes performed.',
            v_without;
    END IF;
END $$;

ALTER TABLE issue_tracking.management_users
    ALTER COLUMN email SET NOT NULL;

-- Confirm the constraint is genuinely back before committing.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'issue_tracking'
           AND table_name   = 'management_users'
           AND column_name  = 'email'
           AND is_nullable  = 'NO'
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: management_users.email is still nullable';
    END IF;
END $$;

COMMIT;
