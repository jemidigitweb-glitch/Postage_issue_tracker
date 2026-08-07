import "server-only";

import { query } from "../db";

// Read-only lookups against issue_tracking.assignment_users — the
// "Assign To" pool (Rajive/Mayurika/Arun/Suman). Deliberately separate from
// issue_tracking.issue_staff (historical issue raisers) and
// issue_tracking.management_users (login accounts) — see
// migration/005_assignment_users.sql.

export interface AssignmentUser {
  assigneeId: number;
  assigneeName: string;
  active: boolean;
}

interface AssignmentUserRow {
  assignee_id: number;
  assignee_name: string;
  active: boolean;
}

export async function listAssignmentUsers(): Promise<AssignmentUser[]> {
  const result = await query<AssignmentUserRow>(
    `SELECT assignee_id, assignee_name, active
     FROM issue_tracking.assignment_users
     WHERE active = true
     ORDER BY assignee_name`
  );

  return result.rows.map((row) => ({
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    active: row.active,
  }));
}
