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

export class DuplicateAssigneeNameError extends Error {
  constructor(public readonly assigneeName: string) {
    super(`Assignee "${assigneeName}" already exists.`);
    this.name = "DuplicateAssigneeNameError";
  }
}

/** Postgres unique/primary-key violation — same constant and detection
 *  approach as lib/queries/staff.ts's createStaff(). */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export interface CreateAssignmentUserInput {
  assigneeName: string;
  active: boolean;
}

/**
 * Inserts exactly one new row into issue_tracking.assignment_users.
 * INSERT-only, mirroring createStaff(): assignee_name carries a UNIQUE
 * constraint (migration/005_assignment_users.sql), so a duplicate raises
 * DuplicateAssigneeNameError rather than silently overwriting the existing
 * row's active flag — there is no UPDATE path in this function.
 *
 * Deliberately writes ONLY to assignment_users. issue_staff, issues, and
 * every assignment/history table are untouched; the same person is never
 * created in two tables.
 */
export async function createAssignmentUser(
  input: CreateAssignmentUserInput
): Promise<AssignmentUser> {
  try {
    const result = await query<AssignmentUserRow>(
      `INSERT INTO issue_tracking.assignment_users (assignee_name, active)
       VALUES ($1, $2)
       RETURNING assignee_id, assignee_name, active`,
      [input.assigneeName, input.active]
    );

    const row = result.rows[0];
    return { assigneeId: row.assignee_id, assigneeName: row.assignee_name, active: row.active };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateAssigneeNameError(input.assigneeName);
    }
    throw error;
  }
}
