-- New object: issue_tracking.issue_staff_assignments — current assignment
-- (one row per issue, no history) so an issue can be assigned to an
-- issue_staff.staff_code directly (the pre-existing
-- issue_assignment_history/v_current_assignment pair references
-- management_users instead, which doesn't fit "assign to the staff who
-- raised issues" — kept unused, not modified, not dropped).
-- Never touches issue_staff or issues structure/data — read-only REFERENCES.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'varmen_db' THEN
        RAISE EXCEPTION 'SAFETY ABORT: connected database must be varmen_db, got "%".', current_database();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS issue_tracking.issue_staff_assignments (
    issue_id    VARCHAR(20) PRIMARY KEY
                 REFERENCES issue_tracking.issues(issue_id) ON DELETE RESTRICT,
    staff_code  VARCHAR(10) NOT NULL
                 REFERENCES issue_tracking.issue_staff(staff_code) ON UPDATE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
