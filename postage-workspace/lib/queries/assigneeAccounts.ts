import "server-only";

import type { PoolClient } from "pg";

import { getVerifiedClient, query } from "../db";

// Creation and lifecycle of ASSIGNEE accounts — the only place in the
// application that writes a login row.
//
// Two tables, one atomic unit:
//   issue_tracking.assignment_users  — who an Issue can be assigned to
//   issue_tracking.management_users  — how that person signs in (role 'staff')
// linked by assignment_users.user_id (migration 011).
//
// issue_tracking.issue_staff ("Raised By") is NEVER touched by this module.
// Raised-By people have no login, no email, and no username, and are never
// an ownership source. That path lives in lib/queries/staff.ts and is
// unchanged.
//
// ── STRUCTURE: why every operation is split in two ──────────────────────────
// Each operation exists as a `…Tx(client, …)` function containing only the
// statements, plus a thin public wrapper that owns BEGIN/COMMIT/ROLLBACK.
// That lets scripts/verify-assignee-transactions.ts drive the real statements
// inside an outer transaction it always ROLLS BACK, so the atomicity and
// uniqueness behaviour can be proven against the live database without
// leaving a single row behind. The …Tx functions must never issue BEGIN,
// COMMIT, or ROLLBACK themselves.
//
// Passwords: this module accepts an ALREADY-HASHED password only. It never
// sees, logs, or stores plaintext, and never writes any password material to
// assignment_users.

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

function constraintName(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const e = error as { code?: unknown; constraint?: unknown };
    if (e.code === UNIQUE_VIOLATION && typeof e.constraint === "string") {
      return e.constraint;
    }
  }
  return null;
}

export class DuplicateAssigneeNameError extends Error {
  constructor() {
    super("An assignee with this name already exists.");
    this.name = "DuplicateAssigneeNameError";
  }
}
export class DuplicateUsernameError extends Error {
  constructor() {
    super("This username is already taken.");
    this.name = "DuplicateUsernameError";
  }
}
export class DuplicateEmailError extends Error {
  constructor() {
    super("This email address is already in use.");
    this.name = "DuplicateEmailError";
  }
}
export class AssigneeAlreadyLinkedError extends Error {
  constructor() {
    super("This assignee already has a login.");
    this.name = "AssigneeAlreadyLinkedError";
  }
}
export class AssigneeNotFoundError extends Error {
  constructor() {
    super("Assignee not found.");
    this.name = "AssigneeNotFoundError";
  }
}
export class AssigneeLinkVerificationError extends Error {
  constructor(detail: string) {
    super(`Link verification failed: ${detail}`);
    this.name = "AssigneeLinkVerificationError";
  }
}

/** Maps a Postgres unique violation onto the specific field that collided.
 *  Every other error is rethrown untouched. */
export function translateUniqueViolation(error: unknown): never {
  switch (constraintName(error)) {
    case "assignment_users_assignee_name_key":
      throw new DuplicateAssigneeNameError();
    case "management_users_username_key":
      throw new DuplicateUsernameError();
    case "management_users_email_key":
      throw new DuplicateEmailError();
    case "uidx_assignment_users_user_id":
      throw new AssigneeAlreadyLinkedError();
    default:
      throw error;
  }
}

export interface CreateAssigneeLoginInput {
  assigneeName: string;
  email: string;
  username: string;
  /** bcrypt hash — never plaintext. */
  passwordHash: string;
  active: boolean;
}

export interface CreatedAssigneeAccount {
  assigneeId: number;
  userId: number;
  assigneeName: string;
  username: string;
  email: string;
}

/**
 * Confirms the 1:1 link actually landed, from the database's own point of
 * view, before the caller is allowed to commit. Belt and braces on top of
 * uidx_assignment_users_user_id: proves the assignee row points at exactly
 * this login, that the login is role 'staff', and that no second assignee
 * row shares it.
 */
async function verifyLinkTx(client: PoolClient, assigneeId: number, userId: number): Promise<void> {
  const linked = await client.query<{ user_id: string | null; role: string; link_count: string }>(
    `SELECT au.user_id,
            mu.role,
            (SELECT count(*) FROM issue_tracking.assignment_users x WHERE x.user_id = $2) AS link_count
     FROM issue_tracking.assignment_users au
     JOIN issue_tracking.management_users mu ON mu.user_id = au.user_id
     WHERE au.assignee_id = $1`,
    [assigneeId, userId]
  );

  const row = linked.rows[0];
  if (!row) {
    throw new AssigneeLinkVerificationError("assignee is not linked to any login");
  }
  if (Number(row.user_id) !== userId) {
    throw new AssigneeLinkVerificationError("assignee is linked to a different login");
  }
  if (row.role !== "staff") {
    throw new AssigneeLinkVerificationError(`login role is "${row.role}", expected "staff"`);
  }
  if (Number(row.link_count) !== 1) {
    throw new AssigneeLinkVerificationError(`login is linked to ${row.link_count} assignee rows, expected 1`);
  }
}

/** Statements only — see the structure note at the top of this file. */
export async function createAssigneeWithLoginTx(
  client: PoolClient,
  input: CreateAssigneeLoginInput
): Promise<CreatedAssigneeAccount> {
  // A. the assignee record
  let assigneeId: number;
  try {
    const inserted = await client.query<{ assignee_id: number }>(
      `INSERT INTO issue_tracking.assignment_users (assignee_name, active)
       VALUES ($1, $2)
       RETURNING assignee_id`,
      [input.assigneeName, input.active]
    );
    assigneeId = inserted.rows[0].assignee_id;
  } catch (error) {
    translateUniqueViolation(error);
  }

  // B. the login. role is the literal 'staff' — never taken from input, so
  //    this path cannot mint an admin.
  let userId: number;
  try {
    const inserted = await client.query<{ user_id: string }>(
      `INSERT INTO issue_tracking.management_users
         (username, display_name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, 'staff', $5)
       RETURNING user_id`,
      [input.username, input.assigneeName, input.email, input.passwordHash, input.active]
    );
    userId = Number(inserted.rows[0].user_id);
  } catch (error) {
    translateUniqueViolation(error);
  }

  // C. the link
  try {
    await client.query(
      `UPDATE issue_tracking.assignment_users SET user_id = $2 WHERE assignee_id = $1`,
      [assigneeId, userId]
    );
  } catch (error) {
    translateUniqueViolation(error);
  }

  await verifyLinkTx(client, assigneeId, userId);

  return {
    assigneeId,
    userId,
    assigneeName: input.assigneeName,
    username: input.username,
    email: input.email,
  };
}

/**
 * Creates a brand new Assignee AND their login in ONE transaction. Either
 * both rows exist and are linked, or neither exists — there is no code path
 * that can leave an orphan login or an assignee without the login the caller
 * asked for.
 */
export async function createAssigneeWithLogin(
  input: CreateAssigneeLoginInput
): Promise<CreatedAssigneeAccount> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");
    const result = await createAssigneeWithLoginTx(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface CreateLoginForAssigneeInput {
  assigneeId: number;
  email: string;
  username: string;
  passwordHash: string;
  active: boolean;
}

/** Statements only — see the structure note at the top of this file. */
export async function createLoginForExistingAssigneeTx(
  client: PoolClient,
  input: CreateLoginForAssigneeInput
): Promise<CreatedAssigneeAccount> {
  // 1. Lock the assignee row. FOR UPDATE is what makes step 2 meaningful:
  //    two concurrent "Create Login" submissions for the same assignee
  //    serialize here, so the second one sees the first one's user_id.
  const locked = await client.query<{ assignee_name: string; user_id: string | null }>(
    `SELECT assignee_name, user_id
     FROM issue_tracking.assignment_users
     WHERE assignee_id = $1
     FOR UPDATE`,
    [input.assigneeId]
  );

  const assignee = locked.rows[0];
  if (!assignee) {
    throw new AssigneeNotFoundError();
  }

  // 2. Still unlinked? No existing assignment_users row is ever duplicated
  //    by this path — it only ever fills in user_id on the row that is
  //    already there.
  if (assignee.user_id !== null) {
    throw new AssigneeAlreadyLinkedError();
  }

  // 3. The login.
  let userId: number;
  try {
    const inserted = await client.query<{ user_id: string }>(
      `INSERT INTO issue_tracking.management_users
         (username, display_name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, 'staff', $5)
       RETURNING user_id`,
      [input.username, assignee.assignee_name, input.email, input.passwordHash, input.active]
    );
    userId = Number(inserted.rows[0].user_id);
  } catch (error) {
    translateUniqueViolation(error);
  }

  // 4. The link.
  try {
    await client.query(
      `UPDATE issue_tracking.assignment_users SET user_id = $2 WHERE assignee_id = $1`,
      [input.assigneeId, userId]
    );
  } catch (error) {
    translateUniqueViolation(error);
  }

  // 5. Verify.
  await verifyLinkTx(client, input.assigneeId, userId);

  return {
    assigneeId: input.assigneeId,
    userId,
    assigneeName: assignee.assignee_name,
    username: input.username,
    email: input.email,
  };
}

/** Adds a login to an EXISTING assignee, in one transaction. Never inserts a
 *  second assignment_users row for that person. */
export async function createLoginForExistingAssignee(
  input: CreateLoginForAssigneeInput
): Promise<CreatedAssigneeAccount> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");
    const result = await createLoginForExistingAssigneeTx(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface AssigneeAccountRow {
  assigneeId: number;
  assigneeName: string;
  /** assignment_users.active — controls appearance in the Assign To pool. */
  assigneeActive: boolean;
  userId: number | null;
  username: string | null;
  email: string | null;
  /** management_users.active — controls whether they can sign in. Null when
   *  there is no login yet. */
  loginActive: boolean | null;
  /** Currently-assigned, non-deleted Issues. Shown so an admin can see what
   *  deactivating a login would leave stranded. */
  assignedIssueCount: number;
}

/** Every assignee with their login status. Never selects password_hash. */
export async function listAssigneeAccounts(): Promise<AssigneeAccountRow[]> {
  const result = await query<{
    assignee_id: number;
    assignee_name: string;
    assignee_active: boolean;
    user_id: string | null;
    username: string | null;
    email: string | null;
    login_active: boolean | null;
    assigned_issue_count: string;
  }>(
    `SELECT au.assignee_id,
            au.assignee_name,
            au.active AS assignee_active,
            au.user_id,
            mu.username,
            mu.email,
            mu.active AS login_active,
            (SELECT count(*)
               FROM issue_tracking.issue_assignments ia
               JOIN issue_tracking.issues i ON i.issue_id = ia.issue_id
              WHERE ia.assignee_id = au.assignee_id
                AND ia.is_current = true
                AND i.deleted_at IS NULL) AS assigned_issue_count
     FROM issue_tracking.assignment_users au
     LEFT JOIN issue_tracking.management_users mu ON mu.user_id = au.user_id
     ORDER BY au.assignee_name`
  );

  return result.rows.map((row) => ({
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    assigneeActive: row.assignee_active,
    userId: row.user_id === null ? null : Number(row.user_id),
    username: row.username,
    email: row.email,
    loginActive: row.login_active,
    assignedIssueCount: Number(row.assigned_issue_count),
  }));
}

/**
 * Activates or deactivates an Assignee's LOGIN only.
 *
 * Deactivation sets management_users.active = false, which
 * lib/auth.ts's getCurrentUser() and the login Server Action both already
 * treat as "not authenticated" — so the account cannot sign in and any live
 * session stops resolving on its next request.
 *
 * Deliberately does NOT touch assignment_users or issue_assignments: the
 * assignee record and every current Issue assignment are preserved exactly
 * as they were. There is no account-deletion path in this module.
 *
 * Scoped with `role = 'staff'` so this can never flip the Super Admin's own
 * account, even if given a wrong assignee_id.
 */
export async function setAssigneeLoginActive(assigneeId: number, active: boolean): Promise<boolean> {
  const result = await query<{ user_id: string }>(
    `UPDATE issue_tracking.management_users mu
     SET active = $2, updated_at = now()
     FROM issue_tracking.assignment_users au
     WHERE au.assignee_id = $1
       AND mu.user_id = au.user_id
       AND mu.role = 'staff'
     RETURNING mu.user_id`,
    [assigneeId, active]
  );
  return result.rowCount === 1;
}
