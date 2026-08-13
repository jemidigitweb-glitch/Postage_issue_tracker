// Pure, server-side validation rules for creating an Assignee login.
//
// No `server-only`, no `next/*`, no database import — same discipline as
// lib/access/permissions.ts, so every rule is directly unit-testable
// (tests/assigneeValidation.test.ts).
//
// These rules are the FIRST line only. Uniqueness is ultimately owned by the
// database constraints (management_users_username_key,
// management_users_email_key, assignment_users_assignee_name_key,
// uidx_assignment_users_user_id), which are re-checked inside the creating
// transaction — this module never queries anything and cannot decide
// uniqueness on its own.
//
// Every message returned here is safe to show a user: no field echoing that
// could reflect script, no internal identifier, no hint about what else
// exists in the database beyond the duplicate itself.

/** Matches management_users.username VARCHAR(50). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;

/** Matches management_users.email VARCHAR(255). */
export const EMAIL_MAX_LENGTH = 255;

/** Matches assignment_users.assignee_name VARCHAR(100). */
export const ASSIGNEE_NAME_MAX_LENGTH = 100;

/**
 * Minimum password length for an ASSIGNEE account.
 *
 * Deliberately independent of scripts/create-first-admin.ts, which keeps its
 * own MIN_PASSWORD_LENGTH = 12 for the Super Admin. The two constants are
 * separate on purpose: relaxing the assignee floor must not relax the
 * admin's. Changing this value affects assignee accounts only.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Letters, digits, dot, underscore, hyphen. No spaces, no '@' (so a
 *  username can never be mistaken for an email at the login prompt, where
 *  findUserForLogin() accepts either).
 *
 *  Exported so lib/access/accountSettings.ts (an Assignee editing their own
 *  username) applies the SAME rule rather than growing a second, divergent
 *  copy. Export only — the value and every rule below are unchanged. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Deliberately conservative: a non-empty local part, a single '@', a domain
 * with at least one dot and a 2+ character TLD, and no whitespace anywhere.
 * This is a sanity check for typos, not an RFC 5322 implementation — the
 * authoritative test of an address is whether mail reaches it, which is out
 * of scope for this stage (no email is sent).
 *
 * Exported for the same reason as USERNAME_PATTERN above: one email rule,
 * used both when an account is created and when its owner edits it.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export interface AssigneeLoginInput {
  assigneeName: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface NormalizedAssigneeLogin {
  assigneeName: string;
  /** Lower-cased and trimmed — stored this way so "A@b.com" and "a@b.com"
   *  cannot both be inserted past the UNIQUE constraint. */
  email: string;
  /** Trimmed, case preserved. */
  username: string;
  password: string;
}

export type ValidationResult =
  | { ok: true; value: NormalizedAssigneeLogin }
  | { ok: false; error: string };

/** Validates the fields shared by both creation paths (brand new Assignee,
 *  and adding a login to an existing Assignee). `assigneeName` is read-only
 *  in the second path but is still validated — never trust the client. */
export function validateAssigneeLogin(input: AssigneeLoginInput): ValidationResult {
  const assigneeName = input.assigneeName.trim();
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const { password, confirmPassword } = input;

  if (!assigneeName) {
    return { ok: false, error: "Assignee name is required." };
  }
  if (assigneeName.length > ASSIGNEE_NAME_MAX_LENGTH) {
    return { ok: false, error: `Assignee name must be ${ASSIGNEE_NAME_MAX_LENGTH} characters or fewer.` };
  }

  if (!email) {
    return { ok: false, error: "Email is required." };
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return { ok: false, error: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.` };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!username) {
    return { ok: false, error: "Username is required." };
  }
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "Username may contain only letters, numbers, dots, underscores, and hyphens." };
  }

  if (!password) {
    return { ok: false, error: "Password is required." };
  }
  if (!confirmPassword) {
    return { ok: false, error: "Confirm Password is required." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    // Never states which one is "wrong", and never echoes either value.
    return { ok: false, error: "Passwords do not match." };
  }

  return { ok: true, value: { assigneeName, email, username, password } };
}
