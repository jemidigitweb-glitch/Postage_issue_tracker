-- ============================================================================
-- migration/009_discussion_source_content.sql
-- Adds one additive, nullable JSONB column so an individual Discussion can
-- carry the ORIGINAL meeting-minute wording/structure as distinct,
-- optional sections (Discussion / Channels / Channels Covered / Requirement
-- / Action / Examples — with support for nested labeled sub-lists inside
-- Action, e.g. "Maintain updated knowledge of: <items>"), separate from the
-- operational workflow fields (objective/action_plan/implementation_progress/
-- final_outcome) that already exist and continue to drive the RED/AMBER/GREEN
-- workflow untouched.
--
-- Shape (TypeScript, see lib/queries/discussions.ts):
--   interface DiscussionSourceContent {
--     discussion?: string;
--     channelsLabel?: string;               // preserves "Channels" vs "Channels Covered" wording
--     channels?: string[];
--     requirement?: string;
--     action?: (string | { label: string; items: string[] })[];
--     examples?: string[];
--   }
-- Every key is optional — the UI renders a section only when that Discussion
-- actually has content for it (never a blank heading).
--
-- SAFETY MODEL (mirrors migration/008_discussion_groups.sql):
--  - HARD TARGET-DATABASE CHECK; PRECONDITION CHECK (discussions must exist).
--  - The ALTER adds exactly one new, nullable column — no existing column is
--    dropped, renamed, retyped, or made NOT NULL. Every existing discussions
--    row (including the 16 that exist as of migration 008) keeps every
--    value it already had.
--  - Populating this column for specific Discussions is a separate, later,
--    reviewable data-correction script (scripts/set-discussion-source-content.ts),
--    not this file — this file only adds the column.
--  - No object in this file lives outside issue_tracking. No statement
--    references ledsone, ph_dashboard, postgres, staff.users, or any other
--    schema/database. Never touches issue_tracking.issues or issue_staff.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%". No objects created.', current_database();
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('issue_tracking.discussions') IS NULL THEN
        RAISE EXCEPTION 'SAFETY ABORT: issue_tracking.discussions does not exist. No objects created.';
    END IF;
END $$;

DO $$
DECLARE
    v_discussion_count INT;
    v_discussion_ids   TEXT;
BEGIN
    SELECT count(*) INTO v_discussion_count FROM issue_tracking.discussions;
    SELECT string_agg(discussion_id, ',' ORDER BY discussion_id) INTO v_discussion_ids FROM issue_tracking.discussions;
    CREATE TEMP TABLE _pre_009_snapshot (discussion_count INT, discussion_ids TEXT) ON COMMIT DROP;
    INSERT INTO _pre_009_snapshot VALUES (v_discussion_count, v_discussion_ids);
END $$;

ALTER TABLE issue_tracking.discussions
    ADD COLUMN IF NOT EXISTS source_content JSONB;

DO $$
DECLARE
    v_discussion_count INT;
    v_discussion_ids   TEXT;
    v_pre_count        INT;
    v_pre_ids          TEXT;
BEGIN
    SELECT count(*) INTO v_discussion_count FROM issue_tracking.discussions;
    SELECT string_agg(discussion_id, ',' ORDER BY discussion_id) INTO v_discussion_ids FROM issue_tracking.discussions;
    SELECT discussion_count, discussion_ids INTO v_pre_count, v_pre_ids FROM _pre_009_snapshot;

    IF v_discussion_count <> v_pre_count THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: discussions row count changed from % to %. Rolling back.', v_pre_count, v_discussion_count;
    END IF;
    IF v_discussion_ids IS DISTINCT FROM v_pre_ids THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: discussion_id set changed. Rolling back.';
    END IF;
END $$;

COMMIT;
