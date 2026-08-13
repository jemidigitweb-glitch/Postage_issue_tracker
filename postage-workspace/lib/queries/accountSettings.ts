import "server-only";

import type { PoolClient } from "pg";

import { getVerifiedClient, query } from "../db";
import { translateUniqueViolation } from "./assigneeAccounts";

// SELF-SERVICE account reads and writes for the ASSIGNEE portal.
//
// Every statement in this file is scoped by BOTH:
//   user_id = $1        — the caller's OWN id, taken from the session only
//   role    = 'staff'   — so no path here can ever touch the Super Admin's row
// even if it were handed the wrong id. There is no function in this module
// that accepts an id and edits "some user"; each one edits exactly the row
// the session resolved to, and returns rowCount 0 rather than an error if
// that row does not match both conditions.
//
// What this module can change: management_users.username, .email,
// .password_hash. That is the entire surface.
//
// What it CANNOT change — there is no statement for any of them:
//   role · active · user_id · display_name · assignment_users.assignee_name
//   assignment_users.assignee_id · assignment_users.active · permissions
//   issue_staff (Raised By) · any issue_assignments row
//
// Database identity (varmen_db / varmen_user) is asserted before the first
// statement of the process by query() / getVerifiedClient() in lib/db.ts —
// see assertDatabaseIdentity() there. Nothing in this file needs (or is
// permitted) to re-check it with its own SELECT.
//
// password_hash is SELECTed in exactly one function below, whose result is
// consumed by bcrypt.compare inside the Server Action and never returned to
// the browser, never logged, and never placed in an action's return value.
//
// ── STRUCTURE ───────────────────────────────────────────────────────────────
// Writes follow the `…Tx(client, …)` + thin-wrapper split established by
// lib/queries/assigneeAccounts.ts, so scripts/verify-account-settings.ts can
// drive the real statements inside an outer transaction it always ROLLS BACK.
// The …Tx functions must never issue BEGIN, COMMIT, or ROLLBACK themselves.

/** Everything the Account Settings page displays. Never includes a hash. */
export interface AccountSettings {
  userId: number;
  /** management_users.username — editable by its owner. */
  username: string;
  /** management_users.email — editable by its owner. */
  email: string;
  /** assignment_users.assignee_name — READ-ONLY here. This is the name the
   *  assignment and admin interfaces show, so it is not the account owner's
   *  to change from this page. Null when the login is not linked to an
   *  assignee row. */
  assigneeName: string | null;
  /** management_users.active — the flag that decides whether this account can
   *  sign in (lib/auth.ts getCurrentUser + the login action both check it).
   *  READ-ONLY here: an Assignee cannot activate or deactivate themselves. */
  active: boolean;
}

/**
 * The caller's own account, by session-resolved user id.
 *
 * LEFT JOIN, not JOIN: a staff login that is not yet linked to an
 * assignment_users row still gets its page (with no Full Name) rather than a
 * blank screen. Scoped to role 'staff' — the Super Admin has no Account
 * Settings page in this stage, and this query would not serve them one.
 */
export async function getAccountSettings(userId: number): Promise<AccountSettings | null> {
  const result = await query<{
    user_id: string;
    username: string;
    email: string;
    assignee_name: string | null;
    active: boolean;
  }>(
    `SELECT mu.user_id,
            mu.username,
            mu.email,
            au.assignee_name,
            mu.active
     FROM issue_tracking.management_users mu
     LEFT JOIN issue_tracking.assignment_users au ON au.user_id = mu.user_id
     WHERE mu.user_id = $1
       AND mu.role = 'staff'
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
    email: row.email,
    assigneeName: row.assignee_name,
    active: row.active,
  };
}

/**
 * The caller's own bcrypt hash, for verifying the CURRENT password before a
 * change is allowed.
 *
 * The only SELECT of password_hash outside the login path. Its value must be
 * passed straight to bcrypt.compare and then dropped: never returned from a
 * Server Action, never logged, never rendered.
 */
export async function findOwnPasswordHash(userId: number): Promise<string | null> {
  const result = await query<{ password_hash: string }>(
    `SELECT password_hash
     FROM issue_tracking.management_users
     WHERE user_id = $1
       AND role = 'staff'
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.password_hash ?? null;
}

export interface UpdateOwnProfileInput {
  /** From the session. Never from a form field. */
  userId: number;
  username: string;
  email: string;
}

/** Statements only — see the structure note at the top of this file. */
export async function updateOwnProfileTx(
  client: PoolClient,
  input: UpdateOwnProfileInput
): Promise<boolean> {
  try {
    const result = await client.query<{ user_id: string }>(
      `UPDATE issue_tracking.management_users
       SET username = $2, email = $3, updated_at = now()
       WHERE user_id = $1
         AND role = 'staff'
       RETURNING user_id`,
      [input.userId, input.username, input.email]
    );
    return result.rowCount === 1;
  } catch (error) {
    // Reuses the existing constraint→error mapping so a duplicate username
    // and a duplicate email produce the same distinct, user-safe errors here
    // as they do at account creation.
    translateUniqueViolation(error);
  }
}

/**
 * Updates the caller's OWN username and email. Nothing else on the row is
 * touched — role, active, display_name and user_id are absent from the SET
 * clause, so no value the browser sends can reach them.
 *
 * Throws DuplicateUsernameError / DuplicateEmailError (from
 * lib/queries/assigneeAccounts.ts) when the database's UNIQUE constraint
 * rejects the write. That constraint — not an application SELECT — is the
 * authority on uniqueness, so two simultaneous submissions cannot both win.
 */
export async function updateOwnProfile(input: UpdateOwnProfileInput): Promise<boolean> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");
    const updated = await updateOwnProfileTx(client, input);
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateOwnPasswordInput {
  /** From the session. Never from a form field. */
  userId: number;
  /** The hash that was just verified against the submitted current password.
   *  Included in the WHERE clause — see the note on updateOwnPasswordTx. */
  expectedCurrentHash: string;
  /** bcrypt hash of the new password. Never plaintext. */
  newPasswordHash: string;
}

/**
 * Statements only — see the structure note at the top of this file.
 *
 * `password_hash = $2` in the WHERE clause is deliberate. Between reading the
 * hash to verify the current password and writing the new one, the row could
 * in principle have changed (an admin reset, a second tab). Matching on the
 * hash we actually verified makes the update a compare-and-set: if anything
 * changed underneath, rowCount is 0 and the caller reports a retry instead of
 * silently overwriting a newer credential. No row lock is needed for this.
 */
export async function updateOwnPasswordTx(
  client: PoolClient,
  input: UpdateOwnPasswordInput
): Promise<boolean> {
  const result = await client.query<{ user_id: string }>(
    `UPDATE issue_tracking.management_users
     SET password_hash = $3, updated_at = now()
     WHERE user_id = $1
       AND role = 'staff'
       AND password_hash = $2
     RETURNING user_id`,
    [input.userId, input.expectedCurrentHash, input.newPasswordHash]
  );
  return result.rowCount === 1;
}

/**
 * Replaces the caller's OWN password hash. Accepts an already-hashed value
 * only: this module never sees, logs, or stores plaintext.
 *
 * Returns false (rather than throwing) when no row matched — the account is
 * not a 'staff' row, or its hash changed since it was verified.
 */
export async function updateOwnPassword(input: UpdateOwnPasswordInput): Promise<boolean> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");
    const updated = await updateOwnPasswordTx(client, input);
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
