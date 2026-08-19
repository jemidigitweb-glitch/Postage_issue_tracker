import "server-only";

import { getPool } from "../db";
import type { Role } from "../auth";

// Authentication-only query layer against issue_tracking.management_users.
// Parameterized queries exclusively — no string-concatenated SQL, matching
// the discipline already established in migration/migrate-issues.js. Reads
// only; nothing in this file writes to management_users (provisioning is a
// separate, explicitly-approved script — see scripts/create-first-admin.ts).

/** DTO-shaped user record — never includes password_hash. Safe to pass to
 *  anything that only needs identity/role, per the Data Access Layer / DTO
 *  pattern in the Next.js authentication guide. */
export interface ManagementUserRecord {
  userId: number;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
}

/** Login-only shape — includes password_hash. Never expose this outside
 *  the login Server Action; never log or return this value as-is. */
export interface ManagementUserForLogin extends ManagementUserRecord {
  passwordHash: string;
}

interface ManagementUserRow {
  // BIGSERIAL in Postgres (migration/002_issue_management_system.sql) — the
  // `pg` driver returns int8/bigint columns as strings by default (no
  // precision loss above Number.MAX_SAFE_INTEGER), not numbers. This type
  // annotation describes the intended shape, not the raw runtime value; see
  // the explicit Number(...) coercion below where the row is mapped.
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
}

interface ManagementUserRowWithHash extends ManagementUserRow {
  password_hash: string;
}

/**
 * Finds a management_users row by login identifier — username OR email,
 * matching the approved design (issue_tracker_auth_architecture_decision.md
 * §2: "username (or email)"). Includes password_hash for verification —
 * this function exists specifically to support the login Server Action.
 * Returns null if no row matches; does not distinguish "not found" from
 * any other failure to the caller.
 *
 * ── ACCOUNTS WITH NO EMAIL ──────────────────────────────────────────────────
 * management_users.email is nullable (migration/016), because a Raised-by-Staff
 * account may belong to somebody with no work address. Such an account signs in
 * with its USERNAME, and this query needs no special case to allow that:
 *
 *   `email = $1` against a NULL email evaluates to NULL, not true, so the row
 *   is matched by the username half of the OR and by nothing else.
 *
 * The guard below is therefore not about correctness of the match — it is about
 * what a NULL identifier would mean. `email IS NOT NULL` also means an empty or
 * absent address can never be "the identifier somebody typed", which is the one
 * way an email-less account could otherwise be reached without knowing its
 * username. An account WITH an address keeps signing in with either one,
 * exactly as before.
 */
export async function findUserForLogin(
  identifier: string
): Promise<ManagementUserForLogin | null> {
  const result = await getPool().query<ManagementUserRowWithHash>(
    `SELECT user_id, username, display_name, password_hash, role, active
     FROM issue_tracking.management_users
     WHERE username = $1
        OR (email IS NOT NULL AND email = $1)
     LIMIT 1`,
    [identifier]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    userId: Number(row.user_id),
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    active: row.active,
  };
}

/**
 * Finds a management_users row by primary key — used by
 * lib/auth.ts's getCurrentUser() to re-resolve a session's userId into a
 * fresh identity/role/active check on every call (the "role freshness"
 * decision in issue_tracker_auth_architecture_decision.md §2). Never
 * includes password_hash.
 */
export async function findUserById(
  userId: number
): Promise<ManagementUserRecord | null> {
  const result = await getPool().query<ManagementUserRow>(
    `SELECT user_id, username, display_name, role, active
     FROM issue_tracking.management_users
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    userId: Number(row.user_id),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
  };
}
