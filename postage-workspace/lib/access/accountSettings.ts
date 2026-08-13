// Pure, server-side validation for the ASSIGNEE's own Account Settings page.
//
// No `server-only`, no `next/*`, no database import — same discipline as
// lib/access/permissions.ts and lib/access/assigneeValidation.ts, so every
// rule is directly unit-testable (tests/accountSettings.test.ts) without a
// request context or a database.
//
// The username/email rules and the password floor are IMPORTED from
// lib/access/assigneeValidation.ts rather than restated, so an account
// created by the Super Admin and the same account edited by its owner are
// held to exactly one set of rules. Nothing in that module's behaviour is
// changed by this one.
//
// Uniqueness is NOT decided here — this module never queries anything. It is
// owned by management_users_username_key / management_users_email_key and
// re-checked at write time in lib/queries/accountSettings.ts.
//
// No message returned here echoes a submitted value, and no message ever
// contains a password.

import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "./assigneeValidation";

export { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, EMAIL_MAX_LENGTH };

// ---------------------------------------------------------------------------
// Profile (username + email)
// ---------------------------------------------------------------------------

export interface ProfileUpdateInput {
  username: string;
  email: string;
}

export interface NormalizedProfileUpdate {
  /** Trimmed, case preserved — matches how a username is stored at creation. */
  username: string;
  /** Trimmed and lower-cased, so "A@b.com" and "a@b.com" cannot both slip
   *  past the UNIQUE constraint as different strings. */
  email: string;
}

export type ProfileValidationResult =
  | { ok: true; value: NormalizedProfileUpdate }
  | { ok: false; error: string };

/**
 * Validates the only two fields an Assignee may change about themselves.
 *
 * Deliberately does NOT accept — and this function has no parameter for —
 * full name, role, assignee_id, user_id, account status, permissions, or
 * staff/Raised By identity. A field that cannot be expressed here cannot be
 * smuggled through the form.
 */
export function validateProfileUpdate(input: ProfileUpdateInput): ProfileValidationResult {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();

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
    return {
      ok: false,
      error: "Username may contain only letters, numbers, dots, underscores, and hyphens.",
    };
  }

  if (!email) {
    return { ok: false, error: "Email address is required." };
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return { ok: false, error: `Email address must be ${EMAIL_MAX_LENGTH} characters or fewer.` };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  return { ok: true, value: { username, email } };
}

// ---------------------------------------------------------------------------
// Password change
// ---------------------------------------------------------------------------

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface NormalizedPasswordChange {
  /** Never trimmed — leading/trailing spaces are legitimate password
   *  characters, and trimming would silently change what the user typed. */
  currentPassword: string;
  newPassword: string;
}

export type PasswordValidationResult =
  | { ok: true; value: NormalizedPasswordChange }
  | { ok: false; error: string };

/**
 * Validates a self-service password change.
 *
 * The CURRENT password is required by this function's own shape: there is no
 * code path that produces `ok: true` without one. Whether it is CORRECT is a
 * separate question, answered by bcrypt.compare in the Server Action — this
 * module never sees a hash.
 */
export function validatePasswordChange(input: PasswordChangeInput): PasswordValidationResult {
  const { currentPassword, newPassword, confirmPassword } = input;

  if (!currentPassword) {
    return { ok: false, error: "Enter your current password." };
  }
  if (!newPassword) {
    return { ok: false, error: "Enter a new password." };
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (!confirmPassword) {
    return { ok: false, error: "Confirm your new password." };
  }
  if (newPassword !== confirmPassword) {
    // Never states which of the two is "wrong", and never echoes either.
    return { ok: false, error: "New passwords do not match." };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: "Your new password must be different from your current password." };
  }

  return { ok: true, value: { currentPassword, newPassword } };
}
