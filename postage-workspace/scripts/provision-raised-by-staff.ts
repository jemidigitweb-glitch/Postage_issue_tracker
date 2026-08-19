// scripts/provision-raised-by-staff.ts
//
// Manual, one-time provisioning script for the SHARED "Raised by Staff"
// account (role `raised_by`) used by the warehouse team to sign in to
// Warehouse Mobile Lite and to read the Issue list on the web.
//
// Modelled directly on scripts/create-first-admin.ts — same safety model,
// same masked prompt, same hard target-database gate, same "never print a
// secret" rule. Only the role and the pre-checks differ.
//
// Usage (manual only — never wired into build/dev/start/deploy):
//   npm run provision-raised-by
//
// ── PREREQUISITES ───────────────────────────────────────────────────────────
// Three migrations MUST be applied first. This script applies none of them:
// schema change and account creation are separate decisions and stay separate
// steps. Each is pre-checked below so a missing one produces a clear message
// instead of a raw constraint error.
//   013_raised_by_staff_auth.sql            role CHECK accepts 'raised_by'
//   014_raised_by_staff_link.sql            management_users.staff_code exists
//   016_management_users_email_optional.sql email may be NULL
//
// ── EMAIL IS OPTIONAL ───────────────────────────────────────────────────────
// SUPERSEDED: email was REQUIRED here, because management_users.email was NOT
// NULL and an earlier draft that offered to skip it would have failed at the
// INSERT. 016 removed the NOT NULL, so a warehouse person with no work address
// can now be given an account: press Enter at the Email prompt and NULL is
// stored. Nothing else became optional — username, display name, staff code and
// password are all still required.
//
// An empty string is NOT stored in place of a missing address. email is UNIQUE,
// and while any number of rows may be NULL (nulls are distinct), a SECOND ''
// would be rejected — so writing '' would let the first email-less account
// silently block every later one. lib/access/raisedByProvisioning.ts collapses
// blank input to null.
//
// ── SAFETY MODEL ────────────────────────────────────────────────────────────
//  - Never runs automatically. Not imported by any app code, not called from
//    any build or deploy step.
//  - No hardcoded username, display name, email or password anywhere in this
//    file. Every value is typed at run time.
//  - The password is read via a masked interactive prompt, or — only when
//    stdin is not a TTY — from RAISED_BY_PASSWORD in the environment, so it
//    can be piped from a password manager. NEVER a CLI argument: those land in
//    shell history and in the process list.
//  - The plaintext is hashed with bcrypt cost 12 immediately and is never
//    written to disk, logged, or included in any error message. Neither is the
//    hash.
//  - HARD TARGET-DATABASE CHECK, mandatory and unconditional: runs
//    `SELECT current_database(), current_user;` and aborts with ZERO writes
//    unless the result is exactly varmen_db / varmen_user.
//  - Writes to issue_tracking.management_users and nothing else. One INSERT,
//    fully parameterised, fully qualified. No UPDATE and no DELETE — it will
//    never overwrite an existing account's password; if the username is taken
//    it aborts and says so.
//  - It creates NO issue_tracking.issue_staff row. The staff code typed at the
//    prompt must ALREADY name an active issue_staff row, and must not already
//    be claimed by another login; both are checked read-only before the INSERT
//    and the script aborts rather than inventing a raiser. issue_staff itself is
//    never written to, in any circumstance.
//
// ── WHAT THIS ACCOUNT CAN DO ────────────────────────────────────────────────
// Exactly two permissions, from lib/access/permissions.ts:
//   issue:view_all   — read the Issue list and Issue details, all Issues
//   mobile:submit    — use /mobile to register a Warehouse Mobile Issue
// It cannot create, edit, assign, comment on, resolve or delete anything
// through the web portal, and it cannot reach the dashboard, booking,
// couriers, reports, tracker or account-settings screens. Those refusals are
// enforced by the permission matrix and route guards, not by this script.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";

import { getPool } from "./lib/db";
// The answer rules — what is required, how long it may be, and what "no email"
// means — live in ONE pure module so a test can EXECUTE them instead of
// asserting against this file's source text. It is this role's own module and
// is imported by nothing else: the Super Admin keeps its own
// MIN_PASSWORD_LENGTH = 12 in scripts/create-first-admin.ts, and the Assignee
// keeps PASSWORD_MIN_LENGTH in lib/access/assigneeValidation.ts, so changing a
// value there cannot reach either of them.
//
// Nothing about how the password is collected, hashed or stored moved with
// them: bcrypt cost is still 12, input is still masked, and the plaintext is
// still never logged.
import {
  RAISED_BY_MIN_PASSWORD_LENGTH,
  RAISED_BY_ROLE,
  validateRaisedByProvisioning,
} from "../lib/access/raisedByProvisioning";

const REQUIRED_DATABASE = "varmen_db";
const REQUIRED_USER = "varmen_user";
const REQUIRED_ROLE = RAISED_BY_ROLE;

// Control characters as explicit \u escapes — never literal control bytes in
// source, which are invisible and fragile to edit correctly.
const KEY_CTRL_C = "\u0003";
const KEY_DEL = "\u007f"; // what most terminals send for Backspace
const KEY_BS = "\u0008"; // some terminals send BS instead

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Reads a password from the terminal without echoing it — same recipe as
 * create-first-admin.ts: raw mode, intercept keypresses, print '*' instead of
 * the real character, never let the real character reach the terminal.
 */
async function promptMaskedPassword(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);

    let input = "";
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(wasRaw ?? false);
      stdin.pause();
    }

    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(input);
          return;
        }
        if (char === KEY_CTRL_C) {
          cleanup();
          stdout.write("\n");
          reject(new Error("Aborted by user."));
          return;
        }
        if (char === KEY_DEL || char === KEY_BS) {
          if (input.length > 0) {
            input = input.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        input += char;
        stdout.write("*");
      }
    }

    stdin.on("data", onData);
  });
}

/**
 * Collects the password. Interactive and masked when there is a terminal;
 * otherwise from RAISED_BY_PASSWORD so the value can be piped in from a
 * password manager without ever appearing in a command line.
 */
async function collectPassword(): Promise<string | null> {
  if (stdin.isTTY) {
    const password = await promptMaskedPassword("Password: ");
    const confirmation = await promptMaskedPassword("Confirm password: ");
    if (password !== confirmation) {
      console.error("Passwords did not match. Aborting. No writes made.");
      return null;
    }
    return password;
  }

  const fromEnv = process.env.RAISED_BY_PASSWORD;
  if (!fromEnv) {
    console.error(
      "No terminal available for a masked prompt and RAISED_BY_PASSWORD is not set. " +
        "Aborting. No writes made."
    );
    return null;
  }
  console.log("Reading the password from RAISED_BY_PASSWORD (not a terminal session).");
  return fromEnv;
}

async function main() {
  console.log("=== Raised-by-Staff Account Provisioning ===");
  console.log(
    "Manual, one-time script for a read-only warehouse login.\n" +
      "Requires migrations 013, 014 and 016 to be applied first.\n" +
      `Password minimum: ${RAISED_BY_MIN_PASSWORD_LENGTH} characters. Email is optional.\n` +
      "Nothing typed here is ever printed back.\n"
  );

  const typedUsername = await prompt("Username: ");
  const typedDisplayName = await prompt("Display name: ");
  // OPTIONAL — the only optional answer. Enter on its own stores NULL.
  const typedEmail = await prompt("Email (optional — press Enter for none): ");
  // REQUIRED. The Issue raiser this login IS: without it the account can sign
  // in but cannot register an Issue, because registration resolves the raiser
  // through management_users.staff_code and fails closed.
  const typedStaffCode = await prompt("Staff code (must already exist in issue_staff): ");

  const password = await collectPassword();
  if (password === null) {
    process.exitCode = 1;
    return;
  }

  // ── ONE PLACE DECIDES WHAT IS REQUIRED ─────────────────────────────────────
  // Shape only — length, blankness, and "no email means null". Whether the
  // username is free and whether the staff code names a real active raiser are
  // database facts, checked below against the real rows.
  const check = validateRaisedByProvisioning({
    username: typedUsername,
    displayName: typedDisplayName,
    email: typedEmail,
    password,
    staffCode: typedStaffCode,
  });
  if (!check.ok) {
    console.error(`${check.error} Aborting. No writes made.`);
    process.exitCode = 1;
    return;
  }
  const { username, displayName, email, staffCode } = check.value;

  // Hash immediately — the plaintext is not referenced again after this point.
  const passwordHash = await bcrypt.hash(password, 12);

  console.log(
    email === null
      ? "No email given — this account will be created without one, and signs in with its username."
      : "An email was given — this account can sign in with either its username or that address."
  );

  const pool = getPool();

  try {
    // ── Identity gate: BOTH database AND user — mandatory, unconditional ────
    // Runs before every query below and before the single INSERT. Same pair the
    // 013 migration and rollback gate on.
    const identity = await pool.query<{ current_database: string; current_user: string }>(
      "SELECT current_database(), current_user;"
    );
    const connectedDb = identity.rows[0]?.current_database;
    const connectedUser = identity.rows[0]?.current_user;

    if (connectedDb !== REQUIRED_DATABASE || connectedUser !== REQUIRED_USER) {
      console.error(
        `SAFETY ABORT: connected as "${connectedUser ?? "(unknown)"}" on ` +
          `"${connectedDb ?? "(unknown)"}", not "${REQUIRED_USER}" on "${REQUIRED_DATABASE}". ` +
          "Refusing to write. No account was created."
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Target confirmed: ${connectedUser} on ${connectedDb}`);

    // ── Migration pre-check — a clear message beats a constraint stack trace ─
    const constraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(con.oid) AS definition
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'issue_tracking'
          AND rel.relname = 'management_users'
          AND con.conname = 'management_users_role_check'
        LIMIT 1;`
    );
    const definition = constraint.rows[0]?.definition ?? "";
    if (!definition.includes(REQUIRED_ROLE)) {
      console.error(
        "SAFETY ABORT: issue_tracking.management_users still rejects the " +
          `"${REQUIRED_ROLE}" role. Apply migration/013_raised_by_staff_auth.sql first. ` +
          "No account was created."
      );
      process.exitCode = 1;
      return;
    }

    // ── Migration pre-check: the column shape this script now relies on ─────
    // 016 made email nullable and 014 added staff_code. Reading both from
    // information_schema turns a missing migration into one clear sentence
    // rather than a not-null violation or an undefined-column error.
    const columns = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'issue_tracking'
          AND table_name   = 'management_users'
          AND column_name IN ('email', 'staff_code');`
    );
    const emailColumn = columns.rows.find((row) => row.column_name === "email");
    const staffCodeColumn = columns.rows.find((row) => row.column_name === "staff_code");

    if (!staffCodeColumn) {
      console.error(
        "SAFETY ABORT: issue_tracking.management_users has no staff_code column. " +
          "Apply migration/014_raised_by_staff_link.sql first. No account was created."
      );
      process.exitCode = 1;
      return;
    }
    // Only blocks when there is actually no email to store — an account WITH an
    // address is unaffected by whether the column happens to be nullable yet.
    if (email === null && emailColumn?.is_nullable !== "YES") {
      console.error(
        "SAFETY ABORT: issue_tracking.management_users.email is still NOT NULL, so an " +
          "account cannot be created without one. Apply " +
          "migration/016_management_users_email_optional.sql first, or supply an email. " +
          "No account was created."
      );
      process.exitCode = 1;
      return;
    }

    // ── Never overwrite an existing account ────────────────────────────────
    // The email half of this check is skipped entirely when there is no email:
    // `email = NULL` is never true in SQL, so passing null would silently match
    // nothing — correct by accident, but only by accident. The explicit
    // IS NOT NULL guard makes "no email means username is the only clash to
    // look for" a stated rule rather than a side effect of three-valued logic.
    const existing = await pool.query<{ user_id: number; username: string; role: string }>(
      `SELECT user_id, username, role
         FROM issue_tracking.management_users
        WHERE username = $1
           OR ($2::text IS NOT NULL AND email = $2::text)
        LIMIT 1;`,
      [username, email]
    );
    if (existing.rows.length > 0) {
      const clash = existing.rows[0];
      console.error(
        `A management_users account already uses this username or email ` +
          `(user_id ${clash.user_id}, role ${clash.role}). Aborting. No writes made. ` +
          "This script never changes an existing account's password."
      );
      process.exitCode = 1;
      return;
    }

    // ── The staff code must name a real, active, unclaimed raiser ──────────
    // READ-ONLY. This script never inserts into issue_staff: if the code does
    // not exist, that is a decision for whoever owns the staff list, not
    // something to invent here. And staff_code is UNIQUE on management_users,
    // so a code already claimed by another login is refused with a message
    // rather than a constraint error.
    const raiser = await pool.query<{ staff_code: string; staff_name: string; active: boolean }>(
      `SELECT staff_code, staff_name, active
         FROM issue_tracking.issue_staff
        WHERE staff_code = $1
        LIMIT 1;`,
      [staffCode]
    );
    if (raiser.rows.length === 0) {
      console.error(
        `SAFETY ABORT: no issue_staff row has staff_code "${staffCode}". ` +
          "This script never creates one. Aborting. No writes made."
      );
      process.exitCode = 1;
      return;
    }
    if (!raiser.rows[0].active) {
      console.error(
        `SAFETY ABORT: issue_staff "${staffCode}" is not active. ` +
          "Aborting. No writes made."
      );
      process.exitCode = 1;
      return;
    }

    const claimed = await pool.query<{ user_id: number; username: string }>(
      `SELECT user_id, username
         FROM issue_tracking.management_users
        WHERE staff_code = $1
        LIMIT 1;`,
      [staffCode]
    );
    if (claimed.rows.length > 0) {
      console.error(
        `SAFETY ABORT: staff code "${staffCode}" is already linked to account ` +
          `"${claimed.rows[0].username}" (user_id ${claimed.rows[0].user_id}). ` +
          "One raiser, one login. Aborting. No writes made."
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Raiser confirmed: ${staffCode} — ${raiser.rows[0].staff_name}`);

    // ── Report, don't block, on an existing shared account ─────────────────
    // More than one raised_by account is a decision, not an error — but it
    // should be a deliberate one, so it is stated before the write.
    const already = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM issue_tracking.management_users
        WHERE role = $1;`,
      [REQUIRED_ROLE]
    );
    const alreadyCount = Number(already.rows[0]?.count ?? "0");
    if (alreadyCount > 0) {
      console.log(
        `Note: ${alreadyCount} ${REQUIRED_ROLE} account(s) already exist. ` +
          "Creating an additional one."
      );
    }

    // ── The only write in this script ──────────────────────────────────────
    // $3 is null when there is no email. It is bound as a parameter like every
    // other value — never interpolated, and never turned into '' on the way.
    const inserted = await pool.query<{
      user_id: number;
      username: string;
      display_name: string;
      role: string;
      active: boolean;
      created_at: string;
      has_email: boolean;
      staff_code: string | null;
    }>(
      `INSERT INTO issue_tracking.management_users
         (username, display_name, email, password_hash, role, active, staff_code)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING user_id, username, display_name, role, active, created_at,
                 (email IS NOT NULL) AS has_email, staff_code;`,
      [username, displayName, email, passwordHash, REQUIRED_ROLE, staffCode]
    );

    const row = inserted.rows[0];
    console.log("\nRaised-by-Staff account created:");
    console.log(`  user_id:      ${row.user_id}`);
    console.log(`  username:     ${row.username}`);
    console.log(`  display_name: ${row.display_name}`);
    console.log(`  email:        ${row.has_email ? "(set)" : "(none)"}`);
    console.log(`  staff_code:   ${row.staff_code}`);
    console.log(`  role:         ${row.role}`);
    console.log(`  active:       ${row.active}`);
    console.log(`  created_at:   ${row.created_at}`);
    console.log("\n(Password and password hash are never printed.)");
    console.log(
      row.has_email
        ? "Sign in with the username or the email address."
        : "Sign in with the USERNAME — this account has no email to sign in with."
    );
    console.log(
      "This account can read the Issue list and use /mobile. It cannot create, " +
        "edit, assign, comment on, resolve or delete anything through the web portal."
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
