-- ============================================================================
-- migration/013_raised_by_staff_auth.sql
--
-- Purpose: allow issue_tracking.management_users.role to hold a fourth value,
-- 'raised_by', for the shared read-only "Raised by Staff" login that may also
-- use Warehouse Mobile Lite.
--
-- ── WHAT THIS FILE DOES ────────────────────────────────────────────────────
-- Exactly one thing: it replaces the existing CHECK constraint on
-- management_users.role with the same constraint plus 'raised_by'.
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
--   - It creates NO account. No INSERT, no UPDATE, no DELETE anywhere.
--   - It contains NO username, NO password and NO password hash. Provisioning
--     is a separate, deliberate step:
--     postage-workspace/scripts/provision-raised-by-staff.ts
--   - It adds NO column. In particular it does NOT add
--     management_users.staff_code: this is ONE shared role, not one login per
--     Raised-By person, so there is nothing to link to issue_tracking.issue_staff.
--     A Warehouse Mobile Issue is still raised by WH / "Warehouse Mobile"
--     regardless of who is signed in — authentication identity and the
--     technical Issue raiser stay separate.
--   - It touches NOTHING outside schema issue_tracking, and nothing outside
--     the single table management_users.
--   - It does not alter, re-hash, deactivate or reorder any existing row. The
--     1 admin and 10 staff accounts present at the time of writing are
--     untouched, and all of their role values remain valid under the new
--     constraint.
--
-- ── AUDIT FIRST (read-only introspection against varmen_db, 2026-08-18) ────
-- issue_tracking.management_users — EVERY column is NOT NULL:
--   user_id       bigint      NOT NULL  PRIMARY KEY
--   username      varchar     NOT NULL  UNIQUE
--   display_name  varchar     NOT NULL
--   email         varchar     NOT NULL  UNIQUE
--   password_hash text        NOT NULL
--   role          varchar     NOT NULL  CHECK (see below)
--   active        boolean     NOT NULL
--   created_at    timestamptz NOT NULL
--   updated_at    timestamptz NOT NULL
-- Existing constraint:
--   management_users_role_check
--     CHECK (role::text = ANY (ARRAY['staff','management','admin']::text[]))
-- Existing rows by role: admin = 1, staff = 10, management = 0.
--
-- The NOT NULL detail matters: an earlier draft of the probe below passed NULL
-- for email, which would have aborted this migration on a not-null violation.
-- Every probe column is now supplied explicitly.
--
-- ── WHY A DROP + ADD RATHER THAN AN ALTER ──────────────────────────────────
-- PostgreSQL has no "extend a CHECK constraint" statement; a check is replaced
-- wholesale. Both statements run inside ONE transaction, so the table is never
-- left without the constraint: either the new one is in place at COMMIT, or
-- the old one is still in place after ROLLBACK.
--
-- The ADD is written with the full list rather than generated from the old
-- definition, so what the constraint will contain is reviewable here, in this
-- file, rather than inferred at run time.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/013_raised_by_staff_auth.sql
-- Rollback: migration/013_raised_by_staff_auth_rollback.sql
-- Verify:   migration/013_raised_by_staff_auth_verify.sql
-- ============================================================================

BEGIN;

-- ── MANDATORY IDENTITY GATE — BOTH values, before ANY write ────────────────
-- Project rule: every database write is preceded by a check of BOTH
-- current_database() AND current_user. Database alone is not enough — the same
-- database can be reached by a different role with different privileges, and
-- the schema name exists in other environments too.
--
-- This is the FIRST statement after BEGIN, so it runs before the DROP
-- CONSTRAINT, before the ADD CONSTRAINT, and before the probe INSERT/DELETE.
-- RAISE EXCEPTION aborts the transaction, so a wrong database OR a wrong user
-- ends with zero writes and the original constraint still in place.
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

-- Refuse to run if any existing row would violate the NEW constraint. Nothing
-- can today (the old constraint is stricter), but this makes that a checked
-- fact rather than an assumption.
DO $$
DECLARE
    v_bad INTEGER;
BEGIN
    SELECT count(*) INTO v_bad
    FROM issue_tracking.management_users
    WHERE role NOT IN ('staff', 'management', 'admin', 'raised_by');

    IF v_bad > 0 THEN
        RAISE EXCEPTION 'Refusing to run: % existing management_users row(s) hold a role outside the new list', v_bad;
    END IF;
END $$;

ALTER TABLE issue_tracking.management_users
    DROP CONSTRAINT IF EXISTS management_users_role_check;

ALTER TABLE issue_tracking.management_users
    ADD CONSTRAINT management_users_role_check
    CHECK (role::text = ANY (ARRAY['staff', 'management', 'admin', 'raised_by']::text[]));

-- ── CONSTRAINT PROBE ───────────────────────────────────────────────────────
-- Proves, before COMMIT, that the new constraint accepts 'raised_by' and still
-- rejects anything else.
--
-- Why it is safe:
--   - It creates NO account. The row is a throwaway with a sentinel username,
--     it is inserted with active = FALSE, and it is DELETEd a few lines later.
--   - It cannot survive. The DELETE removes it; and because the whole file runs
--     in ONE transaction, any later failure — including the RAISE below —
--     rolls the INSERT back too. There is no path where COMMIT happens with
--     the probe row present.
--   - It cannot touch a real account. username and email are UNIQUE, so the
--     sentinel values match nothing that exists; the UPDATE and DELETE are
--     scoped by the user_id returned from THIS insert, not by a name lookup,
--     so they can only ever reach the row this block created.
--   - It uses NO credential. password_hash is the literal string
--     'not-a-credential' — not a hash, not derived from one, and it can never
--     authenticate: bcrypt.compare against a non-bcrypt string always fails.
--     Nothing here is printed, returned or logged.
--
-- NOT NULL note: username, display_name, email, password_hash, role and active
-- are ALL NOT NULL on this table (verified read-only against varmen_db), so
-- every one of them is supplied. The sentinel email uses the reserved
-- .invalid TLD (RFC 2606) — it can never be a real address.
--
-- NEGATIVE TEST VALUE: 'not_a_role' (10 chars) must FIT role's varchar(20), so
-- that the CHECK constraint is what rejects it. A first attempt used a
-- 21-character value, which PostgreSQL refused on column length
-- (string_data_right_truncation) before the CHECK could evaluate it at all —
-- the probe proved nothing and the transaction aborted.
--
-- The handler below deliberately catches check_violation ONLY. A length error
-- must stay an unexpected migration failure: treating it as a pass would let
-- the probe "succeed" without the constraint ever having been consulted.
DO $$
DECLARE
    v_probe_id BIGINT;
    v_rejected BOOLEAN := FALSE;
BEGIN
    INSERT INTO issue_tracking.management_users
        (username, display_name, email, password_hash, role, active)
    VALUES
        ('__migration_013_probe__',
         'migration 013 probe',
         '__migration_013_probe__@migration.invalid',
         'not-a-credential',
         'raised_by',
         FALSE)
    RETURNING user_id INTO v_probe_id;

    BEGIN
        UPDATE issue_tracking.management_users
        SET role = 'not_a_role'
        WHERE user_id = v_probe_id;
    EXCEPTION WHEN check_violation THEN
        v_rejected := TRUE;
    END;

    DELETE FROM issue_tracking.management_users WHERE user_id = v_probe_id;

    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Refusing to commit: the new constraint accepted an invalid role';
    END IF;
END $$;

COMMIT;
