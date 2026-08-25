-- ============================================================================
-- migration/014_raised_by_staff_link.sql
--
-- PREPARED ONLY — NOT EXECUTED. Pending owner review, and pending the owner's
-- choice of a staff_code for the existing Raised-by-Staff account.
--
-- Purpose: give a login account a way to say "I am this Issue raiser", so a
-- role='raised_by' user can be the actual Raised By on the Issues they create,
-- instead of every Mobile Lite Issue being attributed to the generic
-- WH / "Warehouse Mobile" row.
--
-- ── WHAT THIS FILE DOES ────────────────────────────────────────────────────
-- Exactly three things, all on ONE table:
--   1. ADD COLUMN issue_tracking.management_users.staff_code VARCHAR(20) NULL
--   2. FOREIGN KEY (staff_code) -> issue_tracking.issue_staff(staff_code)
--   3. UNIQUE (staff_code)   — makes the relationship 1:1
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
--   - It links NOBODY. No UPDATE anywhere. Every one of the 12 existing
--     accounts keeps staff_code = NULL, including the Raised-by-Staff account,
--     which stays exactly as provisioned.
--   - It creates NO issue_staff row. In particular it does NOT invent a
--     staff_code for the Raised-by-Staff account — that code is the owner's
--     decision and appears nowhere in this file.
--   - It does NOT add the "every raised_by login must have a staff_code"
--     CHECK. That constraint is correct and wanted, but adding it HERE would
--     abort the migration: the existing raised_by account has no staff_code
--     yet, so the CHECK would be violated by an existing row the moment it is
--     created. It therefore belongs in a later migration, applied AFTER the
--     account is linked. See "SEQUENCING" below.
--   - It touches NOTHING else: not issue_staff, not issues, not
--     issue_number_counters, not assignment_users, not next_issue_id(), and
--     nothing outside schema issue_tracking.
--
-- ── AUDIT FIRST (read-only introspection against varmen_db, 2026-08-18) ────
-- issue_tracking.issue_staff
--   staff_code  varchar(20)  NOT NULL  PRIMARY KEY
--   staff_name  varchar(150) NOT NULL  CHECK (btrim(staff_name) <> '')
--   active      boolean      NOT NULL  DEFAULT true
--   created_at / updated_at  timestamptz NOT NULL DEFAULT now()
--   Rows: AT Atisraj · ND Nandhi · NV Nivarnan · SA Sasi · ST Sathis ·
--         WH "Warehouse Mobile"   (all active)
--
-- Who already points AT issue_staff:
--   issues.staff_code               FK -> issue_staff(staff_code)
--                                   ON UPDATE CASCADE ON DELETE RESTRICT
--   issue_number_counters.staff_code FK -> issue_staff(staff_code)
--                                   ON UPDATE CASCADE
-- Both are untouched by this migration. Adding a third FK in the same
-- direction, with the same ON UPDATE CASCADE, keeps one convention.
--
-- issue_tracking.management_users has NO existing link to issue_staff — no
-- staff_code column, no join table, nothing. This was checked before
-- proposing a new column, and it is why a schema change is unavoidable.
--
-- ── WHY NOT REUSE assignment_users ─────────────────────────────────────────
-- assignment_users ALREADY links a login to a person:
--   assignment_users.user_id  BIGINT NULL  FK -> management_users(user_id)
--                                          ON DELETE RESTRICT
-- It is tempting to reuse. It must not be reused: assignment_users answers
-- "who is this Issue ASSIGNED to", issue_staff answers "who RAISED it". They
-- are different people for the same Issue, and the codebase states this
-- separation in a dozen places (lib/queries/assigneeLink.ts,
-- lib/access/permissions.ts, lib/queries/tracker.ts). Overloading one table
-- with both meanings would make "Raised By" and "Assignee" mutually
-- contaminating, and an assignee-scope query would start matching raisers.
--
-- ── WHY THE COLUMN IS ON management_users, NOT ON issue_staff ──────────────
-- Both directions work. The owner asked for management_users.staff_code, and
-- it is compatible, so that is what this file implements.
--
-- Recorded for the reviewer, because it is the one place this design differs
-- from the existing house pattern: the Assignee link runs the OTHER way
-- (the domain table assignment_users carries user_id pointing at the auth
-- table). Putting staff_code on management_users means the two links point in
-- opposite directions. The tradeoff is deliberate and small either way:
--   management_users.staff_code (this file) — one column on the auth table;
--     UNIQUE gives a true 1:1; reads well as "this login IS that raiser".
--   issue_staff.user_id (alternative)       — matches assignment_users
--     exactly; keeps the auth table free of Issue-domain foreign keys.
-- If the reviewer prefers the alternative, say so and this file is rewritten
-- before anything is applied — nothing has been executed.
--
-- ── SEQUENCING (what comes after this file) ────────────────────────────────
--   014 (this file)  add the nullable, unique, FK'd column.        NO writes.
--   -- owner chooses the staff_code for the Raised-by-Staff account --
--   015 (later)      create that issue_staff row AND set the account's
--                    staff_code, in ONE transaction, so a login can never
--                    exist with a dangling raiser or vice versa.
--   016 (later)      add CHECK (role <> 'raised_by' OR staff_code IS NOT NULL)
--                    once no row can violate it, making the invariant a
--                    database guarantee rather than an application promise.
-- Application changes (server-derived raiser on /mobile and on any future
-- Raised-by creation path) land alongside 015. Until then nothing about Issue
-- creation changes, and Mobile Lite keeps raising as WH.
--
-- ── NULLABLE IS THE POINT ──────────────────────────────────────────────────
-- The 11 non-raised_by accounts must stay unlinked forever: a Super Admin and
-- an Assignee are not Issue raisers. NULL is their permanent, correct value,
-- and UNIQUE permits any number of NULLs in PostgreSQL, so it constrains only
-- the rows that actually carry a code.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/014_raised_by_staff_link.sql
-- Rollback: migration/014_raised_by_staff_link_rollback.sql
-- Verify:   migration/014_raised_by_staff_link_verify.sql
-- ============================================================================

BEGIN;

-- ── MANDATORY IDENTITY GATE — BOTH values, before ANY write ────────────────
-- First statement after BEGIN, so it runs before the ADD COLUMN and before
-- either ADD CONSTRAINT. A wrong database OR a wrong user aborts the
-- transaction with zero schema change.
DO $$
BEGIN
    IF current_database() <> 'varmen_db' OR current_user <> 'varmen_user' THEN
        RAISE EXCEPTION
            'Refusing to run: expected varmen_user on varmen_db, connected as % on %. No writes performed.',
            current_user, current_database();
    END IF;
END $$;

-- Refuse to run unless both tables are the ones this migration was written
-- against, and unless migration 013 is already applied (this column is only
-- meaningful once a raised_by role can exist).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'issue_tracking' AND table_name = 'management_users'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: issue_tracking.management_users does not exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'issue_tracking' AND table_name = 'issue_staff'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: issue_tracking.issue_staff does not exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'issue_tracking'
          AND rel.relname = 'management_users'
          AND con.conname = 'management_users_role_check'
          AND pg_get_constraintdef(con.oid) LIKE '%raised_by%'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: migration 013 is not applied (role raised_by is not accepted yet)';
    END IF;
END $$;

-- Refuse to run twice. IF NOT EXISTS would be silent; this is loud, because a
-- second run would mean someone lost track of what is applied.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'management_users'
          AND column_name  = 'staff_code'
    ) THEN
        RAISE EXCEPTION 'Refusing to run: management_users.staff_code already exists — migration 014 appears to be applied already';
    END IF;
END $$;

-- ── THE CHANGE ─────────────────────────────────────────────────────────────
-- Nullable, so every existing row is valid the instant the column appears and
-- no table rewrite with a default is needed.
ALTER TABLE issue_tracking.management_users
    ADD COLUMN staff_code VARCHAR(20);

-- Same target, same ON UPDATE CASCADE as the two FKs that already point at
-- issue_staff. ON DELETE RESTRICT matches issues.staff_code: a raiser with a
-- login attached must not be deletable out from under it.
ALTER TABLE issue_tracking.management_users
    ADD CONSTRAINT management_users_staff_code_fkey
    FOREIGN KEY (staff_code)
    REFERENCES issue_tracking.issue_staff(staff_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

-- 1:1. Two logins must never claim to be the same raiser, or an Issue's
-- "Raised By" would no longer identify one person. NULLs are exempt, which is
-- exactly right for the Super Admin and the ten Assignees.
ALTER TABLE issue_tracking.management_users
    ADD CONSTRAINT management_users_staff_code_key UNIQUE (staff_code);

COMMENT ON COLUMN issue_tracking.management_users.staff_code IS
    'The issue_staff row this login IS, for role=raised_by accounts. NULL for every other role: a Super Admin and an Assignee are not Issue raisers. Set only by the linked provisioning flow, never by a browser form.';

-- ── STRUCTURAL VERIFICATION, BEFORE COMMIT ─────────────────────────────────
-- Deliberately NO probe row here, unlike migration 013. A probe would have to
-- either write a staff_code onto a real account (unacceptable — this migration
-- links nobody) or invent a throwaway issue_staff row and login pair, which is
-- a heavier fabrication than the thing being tested. The FK and UNIQUE are
-- declarative and are verified structurally instead; migration 015, which
-- performs the first real link, is where a behavioural check belongs.
DO $$
DECLARE
    v_unlinked INTEGER;
    v_total    INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name = 'management_users'
          AND column_name = 'staff_code'
          AND data_type = 'character varying'
          AND character_maximum_length = 20
          AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: staff_code column is not nullable varchar(20) as intended';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'issue_tracking'
          AND rel.relname = 'management_users'
          AND con.conname = 'management_users_staff_code_fkey'
          AND con.contype = 'f'
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: the foreign key to issue_staff was not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'issue_tracking'
          AND rel.relname = 'management_users'
          AND con.conname = 'management_users_staff_code_key'
          AND con.contype = 'u'
    ) THEN
        RAISE EXCEPTION 'Refusing to commit: the UNIQUE constraint was not created';
    END IF;

    -- Nobody was linked. This is the assertion that proves the migration did
    -- not quietly attach an account to a raiser.
    SELECT count(*), count(*) FILTER (WHERE staff_code IS NULL)
      INTO v_total, v_unlinked
    FROM issue_tracking.management_users;

    IF v_total <> v_unlinked THEN
        RAISE EXCEPTION
            'Refusing to commit: % of % accounts already carry a staff_code — this migration must link nobody',
            v_total - v_unlinked, v_total;
    END IF;
END $$;

COMMIT;
