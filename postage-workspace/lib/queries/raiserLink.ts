import "server-only";

import { getPool } from "../db";

// The account -> Issue raiser link, and nothing else.
//
// ── WHAT THIS ANSWERS ───────────────────────────────────────────────────────
// "This signed-in account IS which issue_staff row?" — the question that turns
// a Raised-by-Staff LOGIN into the person recorded as Raised By on an Issue.
//
// The link is issue_tracking.management_users.staff_code, added by
// migration/014_raised_by_staff_link.sql: nullable, UNIQUE, FK'd to
// issue_tracking.issue_staff(staff_code). NULL is the correct, permanent value
// for a Super Admin and for an Assignee — neither is an Issue raiser — so a
// null result here is an ordinary answer, not an error.
//
// ── WHY IT IS ONE QUERY, NOT THREE CHECKS ───────────────────────────────────
// A caller needs three facts to be true together: the account is linked, the
// raiser it names exists, and that raiser is still active. Splitting them
// across separate round trips would leave a window where a raiser is
// deactivated between the check and the write, and would tempt a caller to
// implement "linked but inactive" differently each time. The JOIN answers all
// three at once and returns null unless every one of them holds.
//
// ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
// Not an ownership source. issue_staff answers "who RAISED this", never "who
// may act on it" — that is issue_assignments, resolved through
// assignment_users (lib/queries/assigneeLink.ts). The two are deliberately
// separate people on the same Issue, and nothing here may be used to widen
// what an account is permitted to do.
//
// Read-only. This module contains no INSERT, UPDATE or DELETE: the link is
// written exclusively by the reviewed migration, never by a request.

/** An issue_staff row a login is entitled to raise Issues as. */
export interface LinkedRaiser {
  /** issue_staff.staff_code — also the Issue ID prefix, e.g. "TU" -> TU-001. */
  staffCode: string;
  /** issue_staff.staff_name — what "Raised By" displays. */
  staffName: string;
}

/**
 * Resolves the ACTIVE issue_staff row this account is linked to.
 *
 * Returns null when the account is not linked, or its linked raiser has been
 * deactivated. Callers must treat null as a refusal and must NOT substitute a
 * fallback raiser: attributing an Issue to a different person because the real
 * link is missing is a fabrication, not a graceful degradation.
 *
 * @param userId management_users.user_id, from the verified session — never
 *               from a request body.
 */
export async function findRaiserForUser(userId: number): Promise<LinkedRaiser | null> {
  const result = await getPool().query<{ staff_code: string; staff_name: string }>(
    `SELECT s.staff_code, s.staff_name
       FROM issue_tracking.management_users mu
       JOIN issue_tracking.issue_staff s ON s.staff_code = mu.staff_code
      WHERE mu.user_id = $1
        AND mu.active = true
        AND s.active = true
      LIMIT 1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return { staffCode: row.staff_code, staffName: row.staff_name };
}
