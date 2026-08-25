-- ============================================================================
-- migration/016_management_users_email_optional.sql
--
-- Purpose: allow issue_tracking.management_users.email to hold NULL, so a
-- Raised-by-Staff account can be created for a warehouse person who has no
-- work email address.
--
-- ── WHAT THIS FILE DOES ────────────────────────────────────────────────────
-- Exactly one thing: it drops the NOT NULL constraint on
-- issue_tracking.management_users.email.
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
--   - It creates NO account. No INSERT, no UPDATE, no DELETE against any real
--     row. Provisioning stays a separate, deliberate step:
--     postage-workspace/scripts/provision-raised-by-staff.ts
--   - It does NOT drop, recreate, weaken or rename the UNIQUE constraint on
--     email. See "WHY THE UNIQUE CONSTRAINT IS LEFT ALONE" below — it already
--     has exactly the required behaviour, and replacing it would be a larger,
--     riskier change for no gain.
--   - It does NOT clear, blank or rewrite any existing email. All 12 existing
--     accounts keep the address they have; NULL becomes possible for FUTURE
--     rows only.
--   - It touches NO other column, NO other table, and nothing outside schema
--     issue_tracking.
--   - It changes NO role, NO permission, NO password and NO password hash. The
--     Super Admin and the Assignee accounts are not read for anything except
--     the read-only pre-flight counts below, and are not written at all.
--   - It adds NO column and NO constraint of its own.
--
-- ── AUDIT FIRST (read-only introspection against varmen_db, 2026-08-19) ────
-- issue_tracking.management_users:
--   user_id       bigint       NOT NULL  PRIMARY KEY
--   username      varchar(50)  NOT NULL  UNIQUE (management_users_username_key)
--   display_name  varchar(100) NOT NULL
--   email         varchar(255) NOT NULL  UNIQUE (management_users_email_key)   <-- the NOT NULL this file removes
--   password_hash text         NOT NULL
--   role          varchar(20)  NOT NULL  CHECK IN (staff, management, admin, raised_by)
--   active        boolean      NOT NULL
--   created_at    timestamptz  NOT NULL
--   updated_at    timestamptz  NOT NULL
--   staff_code    varchar(20)  NULL      UNIQUE, FK -> issue_staff(staff_code)
--
-- Existing rows: admin = 1, raised_by = 1, staff = 10 — 12 in total, and all
-- 12 currently have a non-null email. So NOTHING becomes NULL by applying
-- this: the column simply stops refusing NULL from now on.
--
-- ── WHY THE UNIQUE CONSTRAINT IS LEFT ALONE ────────────────────────────────
-- The requirement is "keep UNIQUE behaviour for non-null emails". A plain
-- PostgreSQL UNIQUE constraint ALREADY behaves that way: by default nulls are
-- treated as distinct from one another (NULLS DISTINCT), so a unique index
-- permits any number of NULL rows while still rejecting a duplicate non-null
-- value. management_users_email_key is such a constraint, and it keeps working
-- unchanged once the column is nullable.
--
-- A partial unique index (`... WHERE email IS NOT NULL`) would produce the
-- SAME behaviour, so building one would mean dropping a constraint that other
-- objects may depend on and replacing it with something no better. It is not
-- done. The probe below PROVES both halves of the requirement against the real
-- constraint before this transaction is allowed to commit.
--
-- ── EMPTY STRING IS NOT "NO EMAIL" ─────────────────────────────────────────
-- '' is a real, non-null value and would collide with a second '' under the
-- unique constraint. "No email" is NULL, and only NULL. The provisioning
-- script normalises a blank answer to NULL rather than to ''; this migration
-- deliberately adds no CHECK to enforce that, because a CHECK here would be a
-- new constraint on rows this migration was not asked to police.
--
-- Usage:    psql "$MIGRATION_DB_URL" -f migration/016_management_users_email_optional.sql
-- Rollback: migration/016_management_users_email_optional_rollback.sql
-- Verify:   migration/016_management_users_email_optional_verify.sql
-- ============================================================================

BEGIN;

-- ── MANDATORY IDENTITY GATE — BOTH values, before ANY write ────────────────
-- Project rule: every database write is preceded by a check of BOTH
-- current_database() AND current_user. Database alone is not enough — the same
-- database can be reached by a different role with different privileges, and
-- the schema name exists in other environments too.
--
-- This is the FIRST statement after BEGIN, so it runs before the ALTER and
-- before the probe. RAISE EXCEPTION aborts the transaction, so a wrong
-- database OR a wrong user ends with zero writes and NOT NULL still in place.
DO $$
BEGIN
    IF current_database() <> 'varmen_db' OR current_user <> 'varmen_user' THEN
        RAISE EXCEPTION
            'Refusing to run: expected varmen_user on varmen_db, connected as % on %. No writes performed.',
            current_user, current_database();
    END IF;
END $$;

-- Refuse to run if the table is not the one this migration was written against.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'issue_tracking' AND table_name = 'management_users'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: issue_tracking.management_users does not exist';
    END IF;
END $$;

-- Refuse to run if the UNIQUE constraint this migration relies on is absent.
-- Dropping NOT NULL without it would leave email with no uniqueness at all,
-- which is NOT what was asked for.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
         WHERE nsp.nspname = 'issue_tracking'
           AND rel.relname = 'management_users'
           AND con.contype = 'u'
           AND pg_get_constraintdef(con.oid) = 'UNIQUE (email)'
    ) THEN
        RAISE EXCEPTION
            'Refusing to run: no UNIQUE (email) constraint on issue_tracking.management_users. '
            'Making the column nullable without it would drop uniqueness entirely.';
    END IF;
END $$;

-- Record the pre-change account count, and re-check it after the ALTER. A
-- DDL-only migration must not change one single row, and this makes that a
-- checked fact rather than a claim. The count is held in a temporary table so
-- it is visible to the later DO block; it lives only for this session.
CREATE TEMP TABLE migration_016_before ON COMMIT DROP AS
SELECT
    count(*)                                              AS total_rows,
    count(email)                                          AS rows_with_email,
    count(*) FILTER (WHERE role = 'admin')                AS admins,
    count(*) FILTER (WHERE role = 'staff')                AS staff,
    count(*) FILTER (WHERE role = 'management')           AS management,
    count(*) FILTER (WHERE role = 'raised_by')            AS raised_by,
    count(*) FILTER (WHERE active)                        AS active_rows,
    md5(string_agg(user_id::text || ':' || username || ':' || coalesce(email, '<null>') ||
                   ':' || role || ':' || active::text || ':' || password_hash,
                   '|' ORDER BY user_id))                 AS fingerprint
FROM issue_tracking.management_users;

-- ── THE CHANGE ─────────────────────────────────────────────────────────────
-- One statement. NOT NULL is a table constraint, so dropping it rewrites no
-- row data and touches no existing value.
ALTER TABLE issue_tracking.management_users
    ALTER COLUMN email DROP NOT NULL;

-- ── PROBE ──────────────────────────────────────────────────────────────────
-- Proves, before COMMIT, all three properties the change is supposed to have:
--   1. a row with email = NULL is now accepted
--   2. a SECOND row with email = NULL is also accepted (nulls stay distinct)
--   3. a duplicate NON-NULL email is still rejected
--
-- Why it is safe:
--   - It creates NO account. The rows are throwaways with sentinel usernames,
--     inserted with active = FALSE, and DELETEd a few lines later.
--   - They cannot survive. The DELETEs remove them; and because the whole file
--     runs in ONE transaction, any later failure — including the RAISEs below
--     — rolls the INSERTs back too. There is no path where COMMIT happens with
--     a probe row present.
--   - They cannot touch a real account. username and email are UNIQUE, so the
--     sentinel values match nothing that exists, and every UPDATE/DELETE is
--     scoped by a user_id returned from THIS block's own INSERT — never by a
--     name lookup.
--   - They use NO credential. password_hash is the literal string
--     'not-a-credential' — not a hash, not derived from one, and it can never
--     authenticate: bcrypt.compare against a non-bcrypt string always fails.
--     Nothing here is printed, returned or logged.
--   - staff_code is left NULL, so no issue_staff row is claimed or touched.
--
-- The duplicate-email handler catches unique_violation ONLY. Anything else —
-- a length error, a check violation — must stay an unexpected migration
-- failure rather than be mistaken for the constraint doing its job.
--
-- A SAVEPOINT wraps the failing INSERT: in PL/pgSQL a BEGIN...EXCEPTION block
-- is itself a subtransaction, so catching the violation leaves the outer
-- transaction usable and the earlier probe rows intact for the DELETEs.
DO $$
DECLARE
    v_null_a   BIGINT;
    v_null_b   BIGINT;
    v_dupe     BIGINT;
    v_rejected BOOLEAN := FALSE;
BEGIN
    -- 1. NULL email is accepted.
    INSERT INTO issue_tracking.management_users
        (username, display_name, email, password_hash, role, active)
    VALUES
        ('__migration_016_probe_a__', 'migration 016 probe a', NULL,
         'not-a-credential', 'raised_by', FALSE)
    RETURNING user_id INTO v_null_a;

    -- 2. A SECOND NULL email is also accepted — this is the "unique but many
    --    nulls" behaviour the requirement depends on.
    INSERT INTO issue_tracking.management_users
        (username, display_name, email, password_hash, role, active)
    VALUES
        ('__migration_016_probe_b__', 'migration 016 probe b', NULL,
         'not-a-credential', 'raised_by', FALSE)
    RETURNING user_id INTO v_null_b;

    -- 3. Uniqueness for NON-NULL values is unchanged.
    UPDATE issue_tracking.management_users
       SET email = '__migration_016_probe__@migration.invalid'
     WHERE user_id = v_null_a;

    BEGIN
        INSERT INTO issue_tracking.management_users
            (username, display_name, email, password_hash, role, active)
        VALUES
            ('__migration_016_probe_c__', 'migration 016 probe c',
             '__migration_016_probe__@migration.invalid',
             'not-a-credential', 'raised_by', FALSE)
        RETURNING user_id INTO v_dupe;
    EXCEPTION WHEN unique_violation THEN
        v_rejected := TRUE;
    END;

    DELETE FROM issue_tracking.management_users
     WHERE user_id IN (v_null_a, v_null_b)
        OR (v_dupe IS NOT NULL AND user_id = v_dupe);

    IF NOT v_rejected THEN
        RAISE EXCEPTION
            'Refusing to commit: a duplicate non-null email was accepted — uniqueness was lost.';
    END IF;
END $$;

-- ── NO ROW MAY HAVE CHANGED ────────────────────────────────────────────────
-- Counts, per-role totals and a fingerprint over every account's identity,
-- email, role, active flag and password hash. If the probe leaked a row, or if
-- anything at all was altered, this aborts and nothing commits.
DO $$
DECLARE
    v_before migration_016_before%ROWTYPE;
    v_after  migration_016_before%ROWTYPE;
BEGIN
    SELECT * INTO v_before FROM migration_016_before;

    SELECT
        count(*),
        count(email),
        count(*) FILTER (WHERE role = 'admin'),
        count(*) FILTER (WHERE role = 'staff'),
        count(*) FILTER (WHERE role = 'management'),
        count(*) FILTER (WHERE role = 'raised_by'),
        count(*) FILTER (WHERE active),
        md5(string_agg(user_id::text || ':' || username || ':' || coalesce(email, '<null>') ||
                       ':' || role || ':' || active::text || ':' || password_hash,
                       '|' ORDER BY user_id))
      INTO v_after
      FROM issue_tracking.management_users;

    IF v_after.fingerprint IS DISTINCT FROM v_before.fingerprint
       OR v_after.total_rows <> v_before.total_rows
       OR v_after.rows_with_email <> v_before.rows_with_email
       OR v_after.admins <> v_before.admins
       OR v_after.staff <> v_before.staff
       OR v_after.management <> v_before.management
       OR v_after.raised_by <> v_before.raised_by
       OR v_after.active_rows <> v_before.active_rows THEN
        RAISE EXCEPTION
            'Refusing to commit: management_users changed. Before % rows (% with email), after % rows (% with email).',
            v_before.total_rows, v_before.rows_with_email,
            v_after.total_rows, v_after.rows_with_email;
    END IF;
END $$;

-- ── AND THE COLUMN REALLY IS NULLABLE ──────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'issue_tracking'
           AND table_name   = 'management_users'
           AND column_name  = 'email'
           AND is_nullable  = 'NO'
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: management_users.email is still NOT NULL';
    END IF;
END $$;

COMMIT;
