import "server-only";

import { query } from "../db";

// Resolves a login account (issue_tracking.management_users.user_id) to the
// assignee it represents (issue_tracking.assignment_users.assignee_id).
//
// ── MIGRATION 011 COMPATIBILITY — read this before editing ──────────────────
// The linking column, issue_tracking.assignment_users.user_id, is PROPOSED
// but NOT YET APPLIED to the live database (see
// migration/011_assignment_user_login_link.sql, unexecuted as of 2026-08-12).
//
// This module therefore NEVER references that column unconditionally. It
// first asks information_schema whether the column exists, and only issues
// the real lookup if it does. While 011 is unapplied, findAssigneeIdForUser()
// returns null for everyone, which resolves to IssueAccessScope "none" — a
// staff/assignee account sees zero Issues (fail closed). Nothing here has to
// change when 011 is applied; the link simply starts resolving.
//
// This is why the Stage 3 hardening is deployable ahead of the migration:
// no query in the application can reference a nonexistent column.

/** Cached availability of assignment_users.user_id. */
let linkAvailable = false;
/** When linkAvailable is false, the epoch-ms after which we re-check. */
let recheckAfter = 0;

/** How long a negative result is cached. Short enough that applying
 *  migration 011 takes effect without a redeploy or process restart, long
 *  enough that the check is not a per-request cost. */
const NEGATIVE_CACHE_MS = 30_000;

/**
 * True once issue_tracking.assignment_users.user_id exists. A positive
 * result is cached for the life of the process (a column is never dropped
 * in normal operation; the 011 rollback is a manual, deliberate action that
 * would be accompanied by a redeploy). A negative result is re-checked at
 * most every NEGATIVE_CACHE_MS.
 */
export async function isAssigneeLinkAvailable(): Promise<boolean> {
  if (linkAvailable) {
    return true;
  }
  if (Date.now() < recheckAfter) {
    return false;
  }

  try {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'issue_tracking'
           AND table_name   = 'assignment_users'
           AND column_name  = 'user_id'
       ) AS exists`
    );
    linkAvailable = result.rows[0]?.exists === true;
  } catch (error) {
    // Never fail open. A database problem here must mean "no assignee
    // identity could be established", not "grant wider access".
    console.error("[assigneeLink] could not check for assignment_users.user_id:", error);
    linkAvailable = false;
  }

  if (!linkAvailable) {
    recheckAfter = Date.now() + NEGATIVE_CACHE_MS;
  }
  return linkAvailable;
}

export interface LinkedAssignee {
  assigneeId: number;
  /** issue_tracking.assignment_users.assignee_name — the Assignee's own
   *  name. NOT issue_staff.staff_name; "Raised By" is a different concept
   *  and is never read here. */
  assigneeName: string;
}

/**
 * The assignee this login account represents, or null if there is none.
 *
 * Returns null — never throws, never guesses — when:
 *   - migration 011 has not been applied (column absent);
 *   - the account is not linked to any assignee row;
 *   - the linked assignee row is inactive;
 *   - the lookup fails for any reason.
 *
 * Ownership (and the header name) is derived ONLY from this link.
 * issue_tracking.issue_staff ("Raised By") is never consulted here and must
 * never be used as an ownership source.
 */
export async function findAssigneeForUser(userId: number): Promise<LinkedAssignee | null> {
  if (!(await isAssigneeLinkAvailable())) {
    return null;
  }

  try {
    const result = await query<{ assignee_id: number; assignee_name: string }>(
      `SELECT assignee_id, assignee_name
       FROM issue_tracking.assignment_users
       WHERE user_id = $1 AND active = true
       LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    return row ? { assigneeId: Number(row.assignee_id), assigneeName: row.assignee_name } : null;
  } catch (error) {
    console.error("[assigneeLink] could not resolve assignee for user:", error);
    return null;
  }
}

/** Id-only convenience over findAssigneeForUser() — the shape the Issue
 *  access scope needs. Same null semantics. */
export async function findAssigneeIdForUser(userId: number): Promise<number | null> {
  const assignee = await findAssigneeForUser(userId);
  return assignee ? assignee.assigneeId : null;
}
