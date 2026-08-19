// PURE input rules for provisioning ONE Raised-by-Staff account.
//
// DELIBERATELY has no `server-only` import, no `next/*` import and no database
// import — same discipline as the rest of lib/access/*, so every rule is
// directly unit-testable (tests/provisionRaisedByStaff.test.ts) without a
// terminal, a password, or PostgreSQL.
// scripts/provision-raised-by-staff.ts is the CLI shell over this module: it
// collects the answers, calls in here, and only then touches the database.
//
// ── WHAT THIS DECIDES, AND WHAT IT DOES NOT ─────────────────────────────────
// It decides SHAPE: which answers are required, how long they may be, and what
// "no email" means. It decides nothing about EXISTENCE — whether a username is
// taken, whether a staff_code names a real active issue_staff row — because
// those are facts only the database holds, and the script checks them there.
//
// ── EMAIL IS OPTIONAL, AND OPTIONAL MEANS NULL ──────────────────────────────
// SUPERSEDED: email was required, because issue_tracking.management_users.email
// was NOT NULL. migration/016_management_users_email_optional.sql removed that,
// so a warehouse person with no work address can now have an account.
//
// "No email" is NULL and only NULL. An empty string is a real, non-null value:
// the column's UNIQUE constraint treats nulls as distinct from one another (so
// any number of accounts may have none) but would reject a SECOND ''. Writing
// '' would therefore mean the first email-less account silently blocked every
// later one. normaliseOptionalEmail() collapses blank input to null so that
// cannot happen.
//
// ── THIS ROLE ONLY ──────────────────────────────────────────────────────────
// Nothing here is imported by the Super Admin path (scripts/create-first-admin.ts
// keeps its own minimum of 12) or by the Assignee path
// (lib/access/assigneeValidation.ts keeps its own). Changing a rule in this file
// cannot reach either of them.

/** management_users column widths, verified read-only against varmen_db.
 *  Checked here so an over-long answer is refused with a readable message
 *  instead of a raw value-too-long error at the INSERT. */
export const RAISED_BY_MAX_USERNAME_LENGTH = 50;
export const RAISED_BY_MAX_DISPLAY_NAME_LENGTH = 100;
export const RAISED_BY_MAX_EMAIL_LENGTH = 255;
export const RAISED_BY_MAX_STAFF_CODE_LENGTH = 20;

/**
 * Raised-by-Staff password minimum, set by the owner.
 *
 * It is THIS ROLE'S OWN constant and is read by nothing else, so lowering it
 * cannot reach another account type. Nothing about how the password is
 * collected, hashed or stored depends on this number — bcrypt cost is still 12,
 * input is still masked, and the plaintext is still never logged.
 */
export const RAISED_BY_MIN_PASSWORD_LENGTH = 8;

/** The role every account provisioned through this path holds. */
export const RAISED_BY_ROLE = "raised_by";

/** Exactly what the INSERT needs. `email` is null when the person has none. */
export interface RaisedByAccountInput {
  username: string;
  displayName: string;
  email: string | null;
  staffCode: string;
}

export type RaisedByProvisioningCheck =
  | { ok: true; value: RaisedByAccountInput }
  | { ok: false; error: string };

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Turns a typed answer into what is stored.
 *
 * Blank, whitespace-only, or not a string at all -> null, which is how "this
 * person has no email" is recorded. Anything else is trimmed and kept as given:
 * no lower-casing, no rewriting, no canonicalisation. An address is somebody's
 * identity and this is not the place to reshape it.
 */
export function normaliseOptionalEmail(value: unknown): string | null {
  const text = trimmed(value);
  return text.length > 0 ? text : null;
}

/**
 * A very loose sanity check, applied ONLY when an address was actually given.
 *
 * Deliberately not an RFC 5322 validator: an over-strict pattern rejects real
 * addresses, and the cost of that is a person who cannot be given an account.
 * It refuses what could only be a typo — no "@", nothing before or after it,
 * more than one "@", or embedded whitespace — and accepts everything else.
 */
export function isPlausibleEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * The whole answer set, checked together.
 *
 * REQUIRED: username, display name, staff_code, password.
 * OPTIONAL: email — and only email.
 *
 * The password is passed in so the "required, and at least
 * RAISED_BY_MIN_PASSWORD_LENGTH" rule lives with the others rather than being
 * re-implemented at the call site. It is NEVER returned, never stored on the
 * result, and never included in an error message: the messages below name the
 * rule that failed, never the value that failed it.
 */
export function validateRaisedByProvisioning(input: {
  username: unknown;
  displayName: unknown;
  email: unknown;
  password: unknown;
  staffCode: unknown;
}): RaisedByProvisioningCheck {
  const username = trimmed(input.username);
  const displayName = trimmed(input.displayName);
  const staffCode = trimmed(input.staffCode);
  const email = normaliseOptionalEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";

  if (!username) {
    return { ok: false, error: "Username is required." };
  }
  if (username.length > RAISED_BY_MAX_USERNAME_LENGTH) {
    return { ok: false, error: `Username must be at most ${RAISED_BY_MAX_USERNAME_LENGTH} characters.` };
  }
  if (/\s/.test(username)) {
    return { ok: false, error: "Username must not contain spaces." };
  }

  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }
  if (displayName.length > RAISED_BY_MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Display name must be at most ${RAISED_BY_MAX_DISPLAY_NAME_LENGTH} characters.`,
    };
  }

  // REQUIRED. Without it the account can sign in but cannot register an Issue:
  // registration resolves the raiser through management_users.staff_code and
  // fails closed rather than borrowing somebody else's identity
  // (lib/queries/raiserLink.ts, app/mobile/register-actions.ts).
  if (!staffCode) {
    return { ok: false, error: "Staff code is required." };
  }
  if (staffCode.length > RAISED_BY_MAX_STAFF_CODE_LENGTH) {
    return {
      ok: false,
      error: `Staff code must be at most ${RAISED_BY_MAX_STAFF_CODE_LENGTH} characters.`,
    };
  }

  // OPTIONAL — and the ONLY optional answer. A blank one is already null by
  // this point, so these two checks apply to a real address only.
  if (email !== null) {
    if (email.length > RAISED_BY_MAX_EMAIL_LENGTH) {
      return { ok: false, error: `Email must be at most ${RAISED_BY_MAX_EMAIL_LENGTH} characters.` };
    }
    if (!isPlausibleEmail(email)) {
      return {
        ok: false,
        error: "That does not look like an email address. Leave it blank if there is none.",
      };
    }
  }

  if (!password) {
    return { ok: false, error: "Password is required." };
  }
  if (password.length < RAISED_BY_MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${RAISED_BY_MIN_PASSWORD_LENGTH} characters. Aborting. No writes made.`,
    };
  }

  return { ok: true, value: { username, displayName, email, staffCode } };
}
