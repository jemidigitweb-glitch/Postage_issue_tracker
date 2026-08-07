import "server-only";

import { query } from "../db";

// Queries against issue_tracking.issue_staff. The original 4 historical rows
// (ND/SA/ST/NV, see migration/002_issue_management_system.sql's stated
// safety model for that one-time migration script) are never UPDATEd or
// DELETEd by anything in this file — createStaff() below is strictly
// INSERT-only and rejects a duplicate staff_code rather than overwriting an
// existing row (historical or otherwise).

export interface StaffRecord {
  staffCode: string;
  staffName: string;
  active: boolean;
}

interface StaffRow {
  staff_code: string;
  staff_name: string;
  active: boolean;
}

/**
 * Lists every staff row (active and inactive) ordered by name — used to
 * populate the staff filter dropdown on the issue list. Inactive staff are
 * included because historical issues can still reference them.
 */
export async function listStaff(): Promise<StaffRecord[]> {
  const result = await query<StaffRow>(
    `SELECT staff_code, staff_name, active
     FROM issue_tracking.issue_staff
     ORDER BY staff_name`
  );

  return result.rows.map((row) => ({
    staffCode: row.staff_code,
    staffName: row.staff_name,
    active: row.active,
  }));
}

/**
 * Lists only active staff, ordered by name — used to populate the "who is
 * raising this issue" dropdown on the New Issue form. Unlike listStaff(),
 * inactive staff are excluded here: browsing/filtering existing issues by a
 * now-inactive staff member is legitimate, but attributing a brand new
 * issue to one is not.
 */
export async function listActiveStaff(): Promise<StaffRecord[]> {
  const result = await query<StaffRow>(
    `SELECT staff_code, staff_name, active
     FROM issue_tracking.issue_staff
     WHERE active = true
     ORDER BY staff_name`
  );

  return result.rows.map((row) => ({
    staffCode: row.staff_code,
    staffName: row.staff_name,
    active: row.active,
  }));
}

export interface CreateStaffInput {
  /** Already validated/normalized by the caller (trimmed, uppercased). */
  staffCode: string;
  staffName: string;
  active: boolean;
}

/** Thrown when staff_code already exists — createStaff() never overwrites. */
export class DuplicateStaffCodeError extends Error {
  constructor(public readonly staffCode: string) {
    super(`Staff code ${staffCode} already exists.`);
    this.name = "DuplicateStaffCodeError";
  }
}

/** Postgres unique/primary-key violation — see https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * Inserts exactly one new staff row. INSERT-only: staff_code is the primary
 * key, so a duplicate raises DuplicateStaffCodeError instead of silently
 * overwriting the existing row's name/active flag — there is no UPDATE path
 * in this function at all.
 */
export async function createStaff(input: CreateStaffInput): Promise<StaffRecord> {
  try {
    const result = await query<StaffRow>(
      `INSERT INTO issue_tracking.issue_staff (staff_code, staff_name, active)
       VALUES ($1, $2, $3)
       RETURNING staff_code, staff_name, active`,
      [input.staffCode, input.staffName, input.active]
    );

    const row = result.rows[0];
    return { staffCode: row.staff_code, staffName: row.staff_name, active: row.active };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateStaffCodeError(input.staffCode);
    }
    throw error;
  }
}
