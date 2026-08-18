-- ============================================================================
-- migration/013_raised_by_staff_auth_rollback.sql
--
-- Reverses migration/013_raised_by_staff_auth.sql by restoring the previous
-- three-value CHECK constraint on issue_tracking.management_users.role.
--
-- ── IT REFUSES TO RUN WHILE A raised_by ACCOUNT EXISTS ─────────────────────
-- Restoring the old constraint while any row holds role = 'raised_by' would
-- either fail loudly halfway through or, worse, tempt someone to delete or
-- rewrite a live account to force it through. So this file checks first and
-- stops with a clear message naming exactly what is in the way.
--
-- To roll back deliberately, an operator must FIRST decide what happens to
-- those accounts — deactivate them, change their role, or remove them — and do
-- that as its own reviewed step. This file will never make that decision, and
-- it never deletes or modifies an account.
--
-- Like the migration, it changes ONE constraint on ONE table inside schema
-- issue_tracking, creates and removes nothing else, and contains no credential.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/013_raised_by_staff_auth_rollback.sql
-- ============================================================================

BEGIN;

-- ── MANDATORY IDENTITY GATE — BOTH values, before ANY write ────────────────
-- Same project rule as the migration, and for the same reason: a rollback is a
-- schema write like any other. This is the FIRST statement after BEGIN, so a
-- wrong database OR a wrong user aborts before the DROP CONSTRAINT, the ADD
-- CONSTRAINT and the probe INSERT/DELETE — zero writes, constraint unchanged.
DO $$
BEGIN
    IF current_database() <> 'varmen_db' OR current_user <> 'varmen_user' THEN
        RAISE EXCEPTION
            'Refusing to run: expected varmen_user on varmen_db, connected as % on %. No writes performed.',
            current_user, current_database();
    END IF;
END $$;

-- The account safety condition, checked second — after identity, still before
-- every write. Fails clearly rather than destructively.
DO $$
DECLARE
    v_count INTEGER;
    v_names TEXT;
BEGIN
    SELECT count(*), COALESCE(string_agg(username, ', ' ORDER BY username), '')
      INTO v_count, v_names
    FROM issue_tracking.management_users
    WHERE role = 'raised_by';

    IF v_count > 0 THEN
        RAISE EXCEPTION
            'Refusing to roll back: % account(s) still hold role raised_by (%). Decide what happens to them first — this file will not change or delete an account.',
            v_count, v_names;
    END IF;
END $$;

ALTER TABLE issue_tracking.management_users
    DROP CONSTRAINT IF EXISTS management_users_role_check;

ALTER TABLE issue_tracking.management_users
    ADD CONSTRAINT management_users_role_check
    CHECK (role::text = ANY (ARRAY['staff', 'management', 'admin']::text[]));

-- Prove the restored constraint rejects 'raised_by' again before committing.
--
-- Same probe safety as the migration: a sentinel row only, no credential
-- (password_hash is a literal that can never authenticate), and it cannot
-- survive — here the INSERT is EXPECTED to fail, and the defensive DELETE
-- covers the case where it unexpectedly succeeds. Everything is inside the one
-- transaction, so a failure at the RAISE below rolls back the whole file.
--
-- All six supplied columns are NOT NULL on this table (verified read-only
-- against varmen_db); the sentinel email uses the reserved .invalid TLD.
DO $$
DECLARE
    v_rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO issue_tracking.management_users
            (username, display_name, email, password_hash, role, active)
        VALUES
            ('__migration_013_rollback_probe__',
             'migration 013 rollback probe',
             '__migration_013_rollback_probe__@migration.invalid',
             'not-a-credential',
             'raised_by',
             FALSE);
    EXCEPTION WHEN check_violation THEN
        v_rejected := TRUE;
    END;

    -- Scoped by the sentinel username, which is UNIQUE and matches no real
    -- account. Removes the row only in the unexpected case that it was created.
    DELETE FROM issue_tracking.management_users
     WHERE username = '__migration_013_rollback_probe__';

    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Refusing to commit: the restored constraint still accepts raised_by';
    END IF;
END $$;

COMMIT;
