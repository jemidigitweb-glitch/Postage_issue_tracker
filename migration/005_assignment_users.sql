-- New, independent assignment-user system for the "Assign To" workflow.
-- Rajive/Mayurika/Arun/Suman are NOT issue_staff (historical issue raisers)
-- and NOT management_users (login accounts) — they are a third, separate
-- concept: people issues get assigned to. Nothing here touches issue_staff
-- or issues' structure/data; both are only referenced read-only via FK.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%".', current_database();
    END IF;
END $$;

-- ============================================================================
-- 1. assignment_users — the fixed pool of assignable people.
-- ============================================================================

CREATE TABLE IF NOT EXISTS issue_tracking.assignment_users (
    assignee_id   SERIAL PRIMARY KEY,
    assignee_name VARCHAR(100) NOT NULL UNIQUE,
    active        BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO issue_tracking.assignment_users (assignee_name)
VALUES ('Rajive'), ('Mayurika'), ('Arun'), ('Suman')
ON CONFLICT (assignee_name) DO NOTHING;

-- ============================================================================
-- 2. issue_assignments — every assignment ever made (history), with at most
-- one is_current=true row per issue at any time (enforced by the partial
-- unique index below, not just application logic).
-- ============================================================================

CREATE TABLE IF NOT EXISTS issue_tracking.issue_assignments (
    assignment_id BIGSERIAL   PRIMARY KEY,
    issue_id      VARCHAR(20) NOT NULL REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT,
    assignee_id   INTEGER     NOT NULL REFERENCES issue_tracking.assignment_users(assignee_id),
    assigned_by   INTEGER     REFERENCES issue_tracking.management_users(user_id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_current    BOOLEAN     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_issue_assignments_issue_id ON issue_tracking.issue_assignments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_assignee_current
    ON issue_tracking.issue_assignments(assignee_id) WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_issue_assignments_one_current
    ON issue_tracking.issue_assignments(issue_id) WHERE is_current;

COMMIT;
