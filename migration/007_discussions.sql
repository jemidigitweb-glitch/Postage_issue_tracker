-- ============================================================================
-- migration/007_discussions.sql
-- Discussions module — NEW objects only. Additive sibling to the Issue
-- Management Application Layer (migration 002). Approved architecture
-- decisions recorded in the conversation that authorized this migration
-- (participants: Discussion-specific, not issue_staff/assignment_users;
-- workflow: separate from issueStatus.ts, with real reopen support; IDs:
-- one global sequence, fully independent of next_issue_id()).
--
-- SAFETY MODEL (mirrors migration/002_issue_management_system.sql):
--  - STRICT DATA-ONLY with respect to every pre-existing table. This script
--    NEVER issues CREATE, ALTER, DROP, TRUNCATE, UPDATE, or DELETE against
--    issue_tracking.issue_staff, issue_tracking.issues,
--    issue_tracking.management_users, issue_tracking.issue_number_counters,
--    issue_tracking.next_issue_id(), issue_tracking.issue_status_history,
--    issue_tracking.issue_assignment_history, issue_tracking.issue_comments,
--    issue_tracking.assignment_users, or issue_tracking.issue_assignments.
--    The only statements that reference them at all are read-only
--    REFERENCES clauses in new foreign keys on NEW tables.
--  - HARD TARGET-DATABASE CHECK: aborts immediately (RAISE EXCEPTION) unless
--    connected to exactly "varmen_db". Combined with wrapping the whole file
--    in one transaction, an abort here guarantees zero writes anywhere.
--  - PRECONDITION CHECK: aborts immediately if issue_tracking.issues,
--    issue_tracking.issue_staff, or issue_tracking.management_users do not
--    already exist.
--  - Every statement is schema-qualified to issue_tracking.* — nothing
--    relies on search_path.
--  - Everything below runs inside ONE transaction (BEGIN...COMMIT). An
--    in-transaction verification block immediately before COMMIT re-checks
--    that issue_staff and issues row counts are unchanged from immediately
--    before this migration started; if not, it raises and the whole
--    migration rolls back.
--  - This script does not execute itself — it must be run manually via
--    psql against DATABASE_URL, the same way prior migrations were run.
--  - No CREATE SCHEMA statement — issue_tracking already exists.
--  - No object in this file lives outside issue_tracking. No statement
--    references ledsone, ph_dashboard, postgres, staff.users, or any other
--    schema/database.
--  - Discussion ID generation (discussion_id_counter / next_discussion_id())
--    is a single, independent global sequence — it has no FK to, and never
--    reads or writes, issue_tracking.issue_number_counters or
--    issue_tracking.next_issue_id(). A bug in one can never affect the other.
--
-- Objects created (7 total):
--   1. issue_tracking.discussions
--   2. issue_tracking.discussion_id_counter (+ seed row)
--   3. issue_tracking.next_discussion_id()          [function]
--   4. issue_tracking.discussion_participants
--   5. issue_tracking.discussion_points
--   6. issue_tracking.discussion_status_history
--   7. issue_tracking.discussion_comments
-- ============================================================================

BEGIN;

-- ── Hard target-database safety check ───────────────────────────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects created.', current_database();
    END IF;
END $$;

-- ── Precondition: tables this migration's FKs reference must already exist ─
-- This migration assumes them and never creates, alters, or drops them.
DO $$
BEGIN
    IF to_regclass('issue_tracking.issue_staff') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issue_staff does not exist. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.issues') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issues does not exist. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.management_users') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.management_users does not exist. No objects created.';
    END IF;
END $$;

-- ── Pre-migration snapshot of historical counts, checked again before COMMIT
DO $$
DECLARE
    v_staff_count INT;
    v_issue_count INT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    -- Stashed in a session-local temp table (dropped automatically at
    -- COMMIT/session end) purely so the pre-COMMIT verification block below
    -- can compare against it without hardcoding a row count in this file.
    CREATE TEMP TABLE _pre_migration_counts (staff_count INT, issue_count INT) ON COMMIT DROP;
    INSERT INTO _pre_migration_counts VALUES (v_staff_count, v_issue_count);
END $$;

-- ============================================================================
-- 1. discussions
-- Header row for one Discussion (e.g. DISC-001). Independent of
-- issue_tracking.issues — no shared columns, no shared ID space. status
-- workflow (RED/AMBER/GREEN + reopen) is enforced entirely in the
-- application layer (lib/queries/discussionStatus.ts), matching the
-- precedent set for issue_tracking.issues (DECISION-002).
-- ============================================================================

CREATE TABLE issue_tracking.discussions (
    discussion_id            VARCHAR(20)  PRIMARY KEY,
    title                     TEXT         NOT NULL,
    meeting_date_start        DATE,
    meeting_date_end          DATE,
    coordinator_name          VARCHAR(150),
    domain                    VARCHAR(50),
    objective                 TEXT,
    status                    VARCHAR(20)  NOT NULL DEFAULT 'RED'
                                CHECK (status IN ('RED', 'AMBER', 'GREEN')),
    action_plan               TEXT,
    implementation_progress   TEXT,
    duration                  VARCHAR(100),
    process_started           BOOLEAN,
    process_start_date        DATE,
    estimated_finish_date     DATE,
    actual_finish_date        DATE,
    final_outcome              TEXT,
    created_by                 BIGINT       NOT NULL REFERENCES issue_tracking.management_users(user_id),
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at                 TIMESTAMPTZ  NULL,
    deleted_by                 BIGINT       NULL REFERENCES issue_tracking.management_users(user_id)
);

CREATE INDEX idx_discussions_status ON issue_tracking.discussions(status);
CREATE INDEX idx_discussions_domain ON issue_tracking.discussions(domain);

-- ============================================================================
-- 2 & 3. discussion_id_counter + next_discussion_id()
-- Single-row, atomic, concurrency-safe global counter — DISC-001, DISC-002,
-- ... DISC-999, DISC-1000, growing without a digit ceiling (same lpad/
-- GREATEST technique as issue_tracking.next_issue_id(), fixed for the
-- truncation bug already found and fixed there in migration 006 — this
-- function is written correctly from the start).
--
-- Deliberately NOT built on issue_tracking.issue_number_counters or
-- issue_tracking.next_issue_id(): those are staff_code-keyed and FK'd to
-- issue_staff, which has no meaning for a Discussion ID. This is a wholly
-- separate, independent object — nothing here reads or writes any Issue ID
-- allocation object.
-- ============================================================================

CREATE TABLE issue_tracking.discussion_id_counter (
    id           SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    next_number  INTEGER      NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO issue_tracking.discussion_id_counter (id, next_number) VALUES (1, 1);

CREATE OR REPLACE FUNCTION issue_tracking.next_discussion_id()
RETURNS VARCHAR AS $$
DECLARE
    v_number INTEGER;
BEGIN
    UPDATE issue_tracking.discussion_id_counter
    SET next_number = next_number + 1,
        updated_at = now()
    WHERE id = 1
    RETURNING next_number - 1 INTO v_number;

    IF v_number IS NULL THEN
        RAISE EXCEPTION 'discussion_id_counter row missing (id=1) — this should never happen.';
    END IF;

    -- GREATEST(3, ...) pads short numbers to 3 digits (DISC-001) and never
    -- truncates once the number itself is 3+ digits (DISC-1000, DISC-10000, ...).
    RETURN 'DISC-' || lpad(v_number::text, GREATEST(3, length(v_number::text)), '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. discussion_participants
-- Discussion-specific participant storage — deliberately NOT
-- issue_tracking.assignment_users (too limited a pool: Rajive/Mayurika/Arun/
-- Suman only) and NOT issue_tracking.issue_staff or any HR/company
-- staff-master table. A participant is always at least a free-text name;
-- the link to management_users is optional (most participants named in
-- real meetings — MD, warehouse owners, external-facing roles — will never
-- have a login account here).
-- ============================================================================

CREATE TABLE issue_tracking.discussion_participants (
    participant_id      BIGSERIAL    PRIMARY KEY,
    discussion_id        VARCHAR(20)  NOT NULL REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT,
    participant_name      VARCHAR(150) NOT NULL,
    role_title             VARCHAR(150),
    management_user_id     BIGINT       REFERENCES issue_tracking.management_users(user_id),
    is_coordinator          BOOLEAN      NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_discussion_participants_discussion_id ON issue_tracking.discussion_participants(discussion_id);

-- ============================================================================
-- 5. discussion_points
-- Child rows of a Discussion, individually trackable. issue_link_type
-- captures the required tri-state (discussion-only / linked to an existing
-- Issue / a new Issue is intentionally required but not yet created) without
-- ever forcing an Issue to be created for every point.
--
-- linked_issue_id is a nullable, read-only REFERENCE into the EXISTING
-- issue_tracking.issues table — no ALTER to issues, ever. Issue creation
-- itself is never performed by this schema; the application layer calls the
-- existing lib/queries/issues.ts createIssue() and stores the returned
-- issue_id here.
-- ============================================================================

CREATE TABLE issue_tracking.discussion_points (
    point_id                  BIGSERIAL    PRIMARY KEY,
    discussion_id              VARCHAR(20)  NOT NULL REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT,
    point_number                 INTEGER      NOT NULL,
    title                         TEXT         NOT NULL,
    details                       TEXT,
    action_required               TEXT,
    responsible_person            VARCHAR(150),
    domain                        VARCHAR(50),
    action_plan                   TEXT,
    implementation_progress       TEXT,
    status                        VARCHAR(20)  NOT NULL DEFAULT 'RED'
                                    CHECK (status IN ('RED', 'AMBER', 'GREEN')),
    process_started                BOOLEAN,
    estimated_finish_date          DATE,
    completed_date                  DATE,
    final_outcome                    TEXT,
    issue_link_type                  VARCHAR(20)  NOT NULL DEFAULT 'discussion_only'
                                        CHECK (issue_link_type IN ('discussion_only', 'linked_existing', 'new_issue_required')),
    linked_issue_id                   VARCHAR(20)  REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT,
    created_at                        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_discussion_point_number UNIQUE (discussion_id, point_number),
    CONSTRAINT chk_linked_issue_consistency CHECK (
        (issue_link_type = 'linked_existing' AND linked_issue_id IS NOT NULL)
        OR (issue_link_type <> 'linked_existing' AND linked_issue_id IS NULL)
    )
);

CREATE INDEX idx_discussion_points_discussion_id ON issue_tracking.discussion_points(discussion_id);
CREATE INDEX idx_discussion_points_linked_issue_id ON issue_tracking.discussion_points(linked_issue_id);

-- ============================================================================
-- 6. discussion_status_history
-- Append-only audit trail for Discussion RED->AMBER->GREEN progression AND
-- authorised reopening (is_reopen + required reason) — a real, used reopen
-- path, unlike issue_tracking.issue_status_history's is_reopen column which
-- the Issues application layer never sets. Entirely separate table, FK'd to
-- discussions only — lib/queries/issueStatus.ts and issue_status_history
-- are not read, written, or modified by anything here.
-- ============================================================================

CREATE TABLE issue_tracking.discussion_status_history (
    history_id    BIGSERIAL    PRIMARY KEY,
    discussion_id  VARCHAR(20)  NOT NULL REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT,
    from_status     VARCHAR(20)  CHECK (from_status IS NULL OR from_status IN ('RED', 'AMBER', 'GREEN')),
    to_status        VARCHAR(20)  NOT NULL CHECK (to_status IN ('RED', 'AMBER', 'GREEN')),
    changed_by        BIGINT       NOT NULL REFERENCES issue_tracking.management_users(user_id),
    changed_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_reopen           BOOLEAN      NOT NULL DEFAULT false,
    reason               TEXT
);

CREATE INDEX idx_discussion_status_history_discussion_id ON issue_tracking.discussion_status_history(discussion_id);
CREATE INDEX idx_discussion_status_history_changed_at ON issue_tracking.discussion_status_history(changed_at);

-- ============================================================================
-- 7. discussion_comments
-- Comments/history thread for a Discussion.
-- ============================================================================

CREATE TABLE issue_tracking.discussion_comments (
    comment_id    BIGSERIAL    PRIMARY KEY,
    discussion_id  VARCHAR(20)  NOT NULL REFERENCES issue_tracking.discussions(discussion_id) ON DELETE RESTRICT,
    author_id       BIGINT       NOT NULL REFERENCES issue_tracking.management_users(user_id),
    body             TEXT         NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_discussion_comments_discussion_id ON issue_tracking.discussion_comments(discussion_id);

-- ============================================================================
-- In-transaction verification — historical-data-preservation gate.
-- Nothing above writes to issue_staff/issues, so these counts cannot
-- actually change; this is a defense-in-depth check that aborts (rolling
-- back everything in this file) if they are ever anything other than the
-- counts captured immediately before this migration started.
-- ============================================================================

DO $$
DECLARE
    v_staff_count   INT;
    v_issue_count   INT;
    v_pre_staff     INT;
    v_pre_issue     INT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    SELECT staff_count, issue_count INTO v_pre_staff, v_pre_issue FROM _pre_migration_counts;

    IF v_staff_count <> v_pre_staff THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_staff count changed from % to % during this migration. Rolling back.', v_pre_staff, v_staff_count;
    END IF;

    IF v_issue_count <> v_pre_issue THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues count changed from % to % during this migration. Rolling back.', v_pre_issue, v_issue_count;
    END IF;
END $$;

COMMIT;
