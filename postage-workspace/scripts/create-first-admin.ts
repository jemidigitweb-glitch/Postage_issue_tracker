// scripts/create-first-admin.ts
//
// Manual, one-time provisioning script for the first admin account.
// Approved design: documentation/issue_tracker_auth_implementation_plan.md §4
// (DECISION-004 in documentation/issue_tracker_auth_architecture_decision.md).
//
// Usage (manual only — never wired into build/dev/start):
//   npm run create-first-admin
//
// Safety model:
//  - Never run automatically. Not imported by any app code, not called
//    from any build/deploy step.
//  - No hardcoded username, email, or password anywhere in this file.
//  - Password is read via a masked interactive terminal prompt only —
//    never a CLI argument (shell history / process list exposure) and
//    never an environment variable.
//  - Password is hashed (bcrypt, cost 12) immediately after input; the
//    plaintext is never written to disk, logged, or included in any error
//    message.
//  - HARD TARGET-DATABASE CHECK, mandatory and unconditional, mirroring
//    every SQL script in migration/: runs `SELECT current_database(),
//    current_user;` and aborts with ZERO writes unless the result is
//    exactly "varmen_db". This check happens AFTER the password is
//    collected and hashed (so re-running after a failed check doesn't
//    require re-typing) but strictly BEFORE any INSERT.
//  - Writes only to issue_tracking.management_users. No other table, no
//    other schema, no other database is ever referenced.
//  - Never prints the password or the computed hash — success output is
//    limited to non-sensitive fields (user_id, username, role, created_at).

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";

import { getPool } from "./lib/db";

const REQUIRED_DATABASE = "varmen_db";
const MIN_PASSWORD_LENGTH = 12;

// Control characters as explicit \u escapes — never literal control bytes
// in source, which are invisible and fragile to edit correctly.
const KEY_CTRL_C = "";
const KEY_DEL = ""; // what most terminals send for Backspace
const KEY_BS = ""; // some terminals send BS instead

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
 * Reads a password from the terminal without echoing it — standard Node
 * recipe: put stdin in raw mode, intercept keypresses, print '*' instead of
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

async function main() {
  console.log("=== First Admin Account Provisioning ===");
  console.log(
    "Manual, one-time script. Nothing here runs automatically, and nothing " +
      "typed here (except your database connection) is ever printed back.\n"
  );

  const username = await prompt("Username: ");
  const email = await prompt("Email: ");
  const displayName = await prompt("Display name: ");

  if (!username || !email || !displayName) {
    console.error("Username, email, and display name are all required. Aborting. No writes made.");
    process.exitCode = 1;
    return;
  }

  const password = await promptMaskedPassword("Password: ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters. Aborting. No writes made.`
    );
    process.exitCode = 1;
    return;
  }

  const confirmPassword = await promptMaskedPassword("Confirm password: ");
  if (password !== confirmPassword) {
    console.error("Passwords did not match. Aborting. No writes made.");
    process.exitCode = 1;
    return;
  }

  // Hash immediately — the plaintext variables above are not referenced
  // again after this point.
  const passwordHash = await bcrypt.hash(password, 12);

  const pool = getPool();

  try {
    // ── Hard target-database safety check — mandatory, unconditional ──
    const identity = await pool.query<{ current_database: string; current_user: string }>(
      "SELECT current_database(), current_user;"
    );
    const connectedDb = identity.rows[0]?.current_database;
    const connectedUser = identity.rows[0]?.current_user;

    console.log(`Connected user: ${connectedUser ?? "(unknown)"}`);

    if (connectedDb !== REQUIRED_DATABASE) {
      console.error(
        `SAFETY ABORT: connected database is "${connectedDb ?? "(unknown)"}", ` +
          `not "${REQUIRED_DATABASE}". Refusing to write. No account was created.`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Target database confirmed: ${connectedDb}`);

    // ── Friendly pre-check — avoid a raw constraint-violation stack trace ──
    const existing = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM issue_tracking.management_users WHERE username = $1 OR email = $2 LIMIT 1;`,
      [username, email]
    );
    if (existing.rows.length > 0) {
      console.error(
        "A management_users account with this username or email already exists. Aborting. No writes made."
      );
      process.exitCode = 1;
      return;
    }

    // ── The only write in this script — issue_tracking.management_users only ──
    const inserted = await pool.query<{
      user_id: number;
      username: string;
      role: string;
      created_at: string;
    }>(
      `INSERT INTO issue_tracking.management_users
         (username, email, display_name, password_hash, role, active)
       VALUES ($1, $2, $3, $4, 'admin', true)
       RETURNING user_id, username, role, created_at;`,
      [username, email, displayName, passwordHash]
    );

    const row = inserted.rows[0];
    console.log("\nAdmin account created:");
    console.log(`  user_id:    ${row.user_id}`);
    console.log(`  username:   ${row.username}`);
    console.log(`  role:       ${row.role}`);
    console.log(`  created_at: ${row.created_at}`);
    console.log("\n(Password and password hash are never printed.)");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
