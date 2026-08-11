-- ============================================================================
-- migration/008_discussion_groups.sql
-- Discussions module structural refactor — additive.
--
-- Context: the module's original design nested "Discussion Points" as
-- children of a single "container" Discussion (see migration/007). That
-- model is being corrected: every topic that was a child point must become
-- its own independent, top-level Discussion (own ID, own full workflow),
-- while shared meeting metadata (title, dates, coordinator, objective) is
-- factored out into a new "Discussion Group" (meeting) entity so it is
-- never duplicated across the individual Discussions that came from the
-- same meeting. This file only adds the schema needed for that model —
-- the actual data conversion (turning migration 007's DISC-001 + its 14
-- discussion_points rows into 14 independent Discussions under one new
-- Discussion Group) is a separate, reviewable data-migration script
-- (scripts/migrate-german-market-points-to-discussions.ts), not run from
-- SQL, so it can read the LIVE current state of the rows (which may have
-- changed since original seeding) rather than replaying stale hardcoded
-- values.
--
-- SAFETY MODEL (mirrors migration/007_discussions.sql):
--  - STRICT DATA-ONLY with respect to every pre-existing table EXCEPT one
--    additive, nullable ALTER on issue_tracking.discussions itself (see
--    below) — discussions is a Discussions-module table this project
--    created and owns (migration 007), not one of the protected historical
--    Issue tables (issue_tracking.issue_staff, issue_tracking.issues),
--    which this file never touches, creates, alters, or drops.
--  - HARD TARGET-DATABASE CHECK: aborts immediately unless connected to
--    exactly "varmen_db".
--  - PRECONDITION CHECK: aborts immediately if issue_tracking.discussions,
--    issue_tracking.discussion_points, or issue_tracking.management_users
--    do not already exist.
--  - Everything below runs inside ONE transaction. An in-transaction
--    verification block immediately before COMMIT re-checks that
--    issue_staff and issues row counts are unchanged from immediately
--    before this migration started, and that no existing discussions row
--    was deleted or renumbered.
--  - The ALTER TABLE below adds three NEW, NULLABLE columns only
--    (group_id, issue_link_type, linked_issue_id) — it does not drop,
--    rename, retype, or add a NOT NULL constraint to any existing column,
--    so every existing discussions row (DISC-001, DISC-002, and any other)
--    remains valid and unchanged in every column it already had.
--  - No object in this file lives outside issue_tracking. No statement
--    references ledsone, ph_dashboard, postgres, staff.users, or any other
--    schema/database.
--
-- Objects created/changed:
--   1. issue_tracking.discussion_groups                       [new table]
--   2. issue_tracking.discussions.group_id                    [new column, nullable FK -> discussion_groups]
--   3. issue_tracking.discussions.issue_link_type              [new column, nullable-with-default]
--   4. issue_tracking.discussions.linked_issue_id               [new column, nullable FK -> issues, read-only reference]
--   5. issue_tracking.chk_discussions_linked_issue_consistency  [new CHECK constraint]
--   6. indexes on the new columns
-- ============================================================================

BEGIN;

-- ── Hard target-database safety check ───────────────────────────────────────
DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects created.', current_database();
    END IF;
END $$;

-- ── Precondition: tables this migration's FKs/ALTER reference must exist ───
DO $$
BEGIN
    IF to_regclass('issue_tracking.discussions') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.discussions does not exist. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.discussion_points') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.discussion_points does not exist. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.management_users') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.management_users does not exist. No objects created.';
    END IF;
    IF to_regclass('issue_tracking.issues') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.issues does not exist. No objects created.';
    END IF;
END $$;

-- ── Pre-migration snapshot, re-checked before COMMIT ────────────────────────
DO $$
DECLARE
    v_staff_count       INT;
    v_issue_count       INT;
    v_discussion_count  INT;
    v_discussion_ids    TEXT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    SELECT count(*) INTO v_discussion_count FROM issue_tracking.discussions;
    SELECT string_agg(discussion_id, ',' ORDER BY discussion_id) INTO v_discussion_ids FROM issue_tracking.discussions;

    CREATE TEMP TABLE _pre_migration_snapshot (
        staff_count INT, issue_count INT, discussion_count INT, discussion_ids TEXT
    ) ON COMMIT DROP;
    INSERT INTO _pre_migration_snapshot VALUES (v_staff_count, v_issue_count, v_discussion_count, v_discussion_ids);
END $$;

-- ============================================================================
-- 1. discussion_groups
-- Shared meeting metadata (title, date range, coordinator, objective) for a
-- set of independent Discussions that came from the same meeting. Deliberately
-- minimal: only the fields that would otherwise be duplicated verbatim across
-- every Discussion in the group. Each Discussion still carries its OWN
-- coordinator_name/participants/status/etc. independently (migration 007) —
-- this table never becomes a second source of truth for per-Discussion
-- workflow state.
-- ============================================================================

CREATE TABLE issue_tracking.discussion_groups (
    group_id            BIGSERIAL    PRIMARY KEY,
    title                 TEXT         NOT NULL,
    meeting_date_start     DATE,
    meeting_date_end        DATE,
    coordinator_name          VARCHAR(150),
    objective                  TEXT,
    created_by                  BIGINT       NOT NULL REFERENCES issue_tracking.management_users(user_id),
    created_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2-4. discussions: group_id, issue_link_type, linked_issue_id
-- Additive, nullable columns only. group_id lets a top-level Discussion
-- optionally belong to a Discussion Group (NULL = standalone, exactly like
-- every Discussion created before this migration, e.g. DISC-002). This is
-- what makes a former "child point" a real, independent Discussion (own
-- workflow) while still being able to display which meeting it came from.
--
-- issue_link_type / linked_issue_id mirror discussion_points' existing
-- columns of the same name exactly (same three-state design, same
-- read-only REFERENCES into issue_tracking.issues) — now available at the
-- Discussion level too, since "optional linked Issue" is a required
-- capability of every independent Discussion under the corrected model.
-- discussion_points keeps its own identical columns, untouched — Discussions
-- that still use points (e.g. the existing DISC-002 TEST discussion) are
-- completely unaffected by this addition.
-- ============================================================================

ALTER TABLE issue_tracking.discussions
    ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES issue_tracking.discussion_groups(group_id),
    ADD COLUMN IF NOT EXISTS issue_link_type VARCHAR(20) NOT NULL DEFAULT 'discussion_only'
        CHECK (issue_link_type IN ('discussion_only', 'linked_existing', 'new_issue_required')),
    ADD COLUMN IF NOT EXISTS linked_issue_id VARCHAR(20) REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT;

ALTER TABLE issue_tracking.discussions
    ADD CONSTRAINT chk_discussions_linked_issue_consistency CHECK (
        (issue_link_type = 'linked_existing' AND linked_issue_id IS NOT NULL)
        OR (issue_link_type <> 'linked_existing' AND linked_issue_id IS NULL)
    );

CREATE INDEX idx_discussions_group_id ON issue_tracking.discussions(group_id);
CREATE INDEX idx_discussions_linked_issue_id ON issue_tracking.discussions(linked_issue_id);

-- ============================================================================
-- In-transaction verification — every discussions row that existed before
-- this migration must still exist, unchanged in discussion_id, after it.
-- Nothing above issues an UPDATE or DELETE against discussions, so this can
-- only fail if something outside this file's intended scope ran concurrently.
-- ============================================================================

DO $$
DECLARE
    v_staff_count      INT;
    v_issue_count      INT;
    v_discussion_count INT;
    v_discussion_ids   TEXT;
    v_pre_staff        INT;
    v_pre_issue        INT;
    v_pre_discussion   INT;
    v_pre_ids          TEXT;
BEGIN
    SELECT count(*) INTO v_staff_count FROM issue_tracking.issue_staff;
    SELECT count(*) INTO v_issue_count FROM issue_tracking.issues;
    SELECT count(*) INTO v_discussion_count FROM issue_tracking.discussions;
    SELECT string_agg(discussion_id, ',' ORDER BY discussion_id) INTO v_discussion_ids FROM issue_tracking.discussions;

    SELECT staff_count, issue_count, discussion_count, discussion_ids
      INTO v_pre_staff, v_pre_issue, v_pre_discussion, v_pre_ids
      FROM _pre_migration_snapshot;

    IF v_staff_count <> v_pre_staff THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issue_staff count changed from % to %. Rolling back.', v_pre_staff, v_staff_count;
    END IF;
    IF v_issue_count <> v_pre_issue THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: issues count changed from % to %. Rolling back.', v_pre_issue, v_issue_count;
    END IF;
    IF v_discussion_count <> v_pre_discussion THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: discussions row count changed from % to % (this migration must not add/remove any discussions row). Rolling back.', v_pre_discussion, v_discussion_count;
    END IF;
    IF v_discussion_ids IS DISTINCT FROM v_pre_ids THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: discussion_id set changed (was "%", now "%"). Rolling back.', v_pre_ids, v_discussion_ids;
    END IF;
END $$;

COMMIT;
