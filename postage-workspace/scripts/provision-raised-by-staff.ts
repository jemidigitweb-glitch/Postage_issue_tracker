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
// ── PREREQUISITE ────────────────────────────────────────────────────────────
// migration/013_raised_by_staff_auth.sql MUST be applied first. Without it the
// role CHECK constraint still rejects 'raised_by' and this script aborts with a
// clear message instead of a raw constraint error. It does not apply the
// migration itself: schema change and account creation are two separate
// decisions and stay two separate steps.
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
//  - It creates NO issue_tracking.issue_staff row. The Warehouse Mobile
//    reporter (WH) is a separate, already-existing technical identity: whoever
//    signs in here, a Mobile Lite Issue is still raised by WH. Login identity
//    and Issue raiser are deliberately not the same thing.
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

const REQUIRED_DATABASE = "varmen_db";
const REQUIRED_USER = "varmen_user";
const REQUIRED_ROLE = "raised_by";
/**
 * Raised-by-Staff minimum, set by the owner. It is THIS SCRIPT'S OWN constant
 * and is read by nothing else, so lowering it cannot reach another account
 * type: the Super Admin keeps its own MIN_PASSWORD_LENGTH = 12 in
 * scripts/create-first-admin.ts, and the Assignee keeps PASSWORD_MIN_LENGTH in
 * lib/access/assigneeValidation.ts. Nothing about how the password is
 * collected, hashed or stored changes with this number — bcrypt cost is still
 * 12, input is still masked, and the plaintext is still never logged.
 */
const MIN_PASSWORD_LENGTH = 8;

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
    "Manual, one-time script for the SHARED read-only warehouse login.\n" +
      "Requires migration/013_raised_by_staff_auth.sql to be applied first.\n" +
      "Nothing typed here is ever printed back.\n"
  );

  const username = await prompt("Username: ");
  const displayName = await prompt("Display name: ");
  // REQUIRED, not optional. management_users.email is NOT NULL and UNIQUE
  // (verified read-only against varmen_db) — an earlier draft offered to skip
  // it, which would have failed at the INSERT with a not-null violation.
  const email = await prompt("Email: ");

  if (!username || !displayName || !email) {
    console.error(
      "Username, display name and email are all required. Aborting. No writes made."
    );
    process.exitCode = 1;
    return;
  }

  const password = await collectPassword();
  if (password === null) {
    process.exitCode = 1;
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters. Aborting. No writes made.`
    );
    process.exitCode = 1;
    return;
  }

  // Hash immediately — the plaintext is not referenced again after this point.
  const passwordHash = await bcrypt.hash(password, 12);

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

    // ── Never overwrite an existing account ────────────────────────────────
    const existing = await pool.query<{ user_id: number; username: string; role: string }>(
      `SELECT user_id, username, role
         FROM issue_tracking.management_users
        WHERE username = $1 OR ($2::text IS NOT NULL AND email = $2)
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
    const inserted = await pool.query<{
      user_id: number;
      username: string;
      display_name: string;
      role: string;
      active: boolean;
      created_at: string;
    }>(
      `INSERT INTO issue_tracking.management_users
         (username, display_name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING user_id, username, display_name, role, active, created_at;`,
      [username, displayName, email, passwordHash, REQUIRED_ROLE]
    );

    const row = inserted.rows[0];
    console.log("\nRaised-by-Staff account created:");
    console.log(`  user_id:      ${row.user_id}`);
    console.log(`  username:     ${row.username}`);
    console.log(`  display_name: ${row.display_name}`);
    console.log(`  role:         ${row.role}`);
    console.log(`  active:       ${row.active}`);
    console.log(`  created_at:   ${row.created_at}`);
    console.log("\n(Password and password hash are never printed.)");
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
