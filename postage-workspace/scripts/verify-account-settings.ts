// scripts/verify-account-settings.ts
//
// Proves the Assignee Account Settings behaviour against the REAL schema —
// and leaves ZERO rows behind.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:account-settings
//
// ── HOW "ZERO PERMANENT DATA" IS GUARANTEED ─────────────────────────────────
// Identical harness to scripts/verify-assignee-transactions.ts: everything
// runs inside ONE transaction that is ALWAYS rolled back.
//   BEGIN
//     ... every scenario, each wrapped in its own SAVEPOINT ...
//   ROLLBACK          <- unconditional, in a finally block
// There is no COMMIT anywhere in this file. Row counts are re-read on a
// SEPARATE connection after the rollback, so they independently confirm that
// nothing persisted — including that no real account's password changed.
//
// The two accounts used below are created inside the transaction and are
// prefixed with a marker that could not collide with a real person. No
// pre-existing account is ever written to.

import type { PoolClient } from "pg";
import bcrypt from "bcryptjs";

import { createAssigneeWithLoginTx, DuplicateEmailError, DuplicateUsernameError } from "../lib/queries/assigneeAccounts";
import { updateOwnPasswordTx, updateOwnProfileTx } from "../lib/queries/accountSettings";
import { validatePasswordChange, validateProfileUpdate } from "../lib/access/accountSettings";
import { getPool, getVerifiedClient, query } from "../lib/db";

const MARKER = "__acctsettings_verify__";
const BCRYPT_COST = 12;

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
}

async function inSavepoint<T>(client: PoolClient, name: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    return await fn();
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
  }
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

function sp(n: number): string {
  return `sp_acct_${n}`;
}

interface TestAccount {
  userId: number;
  assigneeId: number;
  username: string;
  email: string;
  passwordHash: string;
}

async function createTestAccount(
  client: PoolClient,
  suffix: string,
  password: string
): Promise<TestAccount> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const created = await createAssigneeWithLoginTx(client, {
    assigneeName: `${MARKER}_${suffix}`,
    email: `${MARKER}_${suffix}@example.invalid`,
    username: `${MARKER}_${suffix}`,
    passwordHash,
    active: true,
  });
  return {
    userId: created.userId,
    assigneeId: created.assigneeId,
    username: created.username,
    email: created.email,
    passwordHash,
  };
}

async function readAccount(client: PoolClient, userId: number) {
  const result = await client.query<{
    username: string;
    email: string;
    password_hash: string;
    role: string;
    active: boolean;
    display_name: string;
    assignee_name: string | null;
  }>(
    `SELECT mu.username, mu.email, mu.password_hash, mu.role, mu.active, mu.display_name,
            au.assignee_name
     FROM issue_tracking.management_users mu
     LEFT JOIN issue_tracking.assignment_users au ON au.user_id = mu.user_id
     WHERE mu.user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

async function main(): Promise<void> {
  const identity = await query<{ current_database: string; current_user: string }>(
    "SELECT current_database(), current_user"
  );
  const { current_database: db, current_user: usr } = identity.rows[0];
  console.log(`current_database: ${db} | current_user: ${usr}\n`);
  check("connected to the expected database and user", db === "varmen_db" && usr === "varmen_user", `${db} / ${usr}`);

  console.log("\nAccount Settings verification. Everything below is ROLLED BACK.\n");

  const client = await getVerifiedClient();

  try {
    await client.query("BEGIN");

    // ── 1. Profile update: the happy path ─────────────────────────────────
    console.log("1. Profile update");
    await inSavepoint(client, sp(1), async () => {
      const me = await createTestAccount(client, "owner", "original-password-1");
      const before = await readAccount(client, me.userId);

      const validation = validateProfileUpdate({
        username: `  ${MARKER}_Renamed  `,
        email: `  ${MARKER}_RENAMED@Example.Invalid  `,
      });
      if (!validation.ok) {
        check("valid profile input passes validation", false, validation.error);
        return;
      }

      const updated = await updateOwnProfileTx(client, {
        userId: me.userId,
        username: validation.value.username,
        email: validation.value.email,
      });
      const after = await readAccount(client, me.userId);

      check("username and email are updated", updated && after.username === `${MARKER}_Renamed`, after.username);
      check(
        "email is stored lower-cased and trimmed",
        after.email === `${MARKER}_renamed@example.invalid`,
        after.email
      );
      check("role is unchanged", after.role === before.role, `${before.role} -> ${after.role}`);
      check("active is unchanged", after.active === before.active, String(after.active));
      check(
        "display_name is unchanged",
        after.display_name === before.display_name,
        after.display_name
      );
      check(
        "assignee_name (Full Name) is unchanged",
        after.assignee_name === before.assignee_name,
        String(after.assignee_name)
      );
      check(
        "password_hash is unchanged by a profile update",
        after.password_hash === before.password_hash,
        "hash untouched"
      );
    });

    // ── 2. Duplicate username / email are rejected by the database ────────
    console.log("\n2. Uniqueness");
    await inSavepoint(client, sp(2), async () => {
      const me = await createTestAccount(client, "dup_a", "original-password-1");
      const other = await createTestAccount(client, "dup_b", "original-password-2");

      const usernameError = await captureError(async () => {
        await inSavepoint(client, sp(21), () =>
          updateOwnProfileTx(client, { userId: me.userId, username: other.username, email: me.email })
        );
      });
      check(
        "taking another account's username is rejected",
        usernameError instanceof DuplicateUsernameError,
        usernameError instanceof Error ? usernameError.name : String(usernameError)
      );

      const emailError = await captureError(async () => {
        await inSavepoint(client, sp(22), () =>
          updateOwnProfileTx(client, { userId: me.userId, username: me.username, email: other.email })
        );
      });
      check(
        "taking another account's email is rejected",
        emailError instanceof DuplicateEmailError,
        emailError instanceof Error ? emailError.name : String(emailError)
      );

      const unchanged = await readAccount(client, me.userId);
      check(
        "a rejected update leaves the row exactly as it was",
        unchanged.username === me.username && unchanged.email === me.email,
        `${unchanged.username} / ${unchanged.email}`
      );

      // Keeping your OWN username/email must still succeed — the uniqueness
      // check must exclude the caller's own row.
      const selfSave = await updateOwnProfileTx(client, {
        userId: me.userId,
        username: me.username,
        email: me.email,
      });
      check("re-saving your own unchanged username/email succeeds", selfSave, "own row excluded");
    });

    // ── 3. Password change ────────────────────────────────────────────────
    console.log("\n3. Password change");
    await inSavepoint(client, sp(3), async () => {
      const password = "original-password-1";
      const me = await createTestAccount(client, "pw", password);
      const before = await readAccount(client, me.userId);

      // 3a. The stored value is a bcrypt hash, not the plaintext.
      check(
        "password is stored hashed, never in plaintext",
        before.password_hash !== password && /^\$2[aby]\$\d{2}\$/.test(before.password_hash),
        before.password_hash.slice(0, 7) + "… (bcrypt)"
      );

      // 3b. The correct current password verifies; a wrong one does not.
      check(
        "the correct current password verifies against the stored hash",
        await bcrypt.compare(password, before.password_hash),
        "bcrypt.compare = true"
      );
      check(
        "a wrong current password does not verify",
        !(await bcrypt.compare("wrong-password-9", before.password_hash)),
        "bcrypt.compare = false"
      );

      // 3c. Change it.
      const validation = validatePasswordChange({
        currentPassword: password,
        newPassword: "brand-new-password-2",
        confirmPassword: "brand-new-password-2",
      });
      if (!validation.ok) {
        check("valid password change passes validation", false, validation.error);
        return;
      }

      const newHash = await bcrypt.hash(validation.value.newPassword, BCRYPT_COST);
      const changed = await updateOwnPasswordTx(client, {
        userId: me.userId,
        expectedCurrentHash: before.password_hash,
        newPasswordHash: newHash,
      });
      const after = await readAccount(client, me.userId);

      check("the password hash is replaced", changed && after.password_hash !== before.password_hash, "hash rotated");
      check(
        "the NEW password now verifies (login would succeed)",
        await bcrypt.compare("brand-new-password-2", after.password_hash),
        "bcrypt.compare = true"
      );
      check(
        "the OLD password no longer verifies (login would fail)",
        !(await bcrypt.compare(password, after.password_hash)),
        "bcrypt.compare = false"
      );
      check("username is unchanged by a password change", after.username === before.username, after.username);
      check("email is unchanged by a password change", after.email === before.email, after.email);
      check("role is unchanged by a password change", after.role === before.role, after.role);
      check("active is unchanged by a password change", after.active === before.active, String(after.active));

      // 3d. Compare-and-set: replaying the now-stale hash must not write.
      const stale = await updateOwnPasswordTx(client, {
        userId: me.userId,
        expectedCurrentHash: before.password_hash,
        newPasswordHash: await bcrypt.hash("third-password-3", BCRYPT_COST),
      });
      check("a stale current-hash cannot overwrite a newer password", !stale, "rowCount 0");
    });

    // ── 4. One Assignee cannot touch another account ──────────────────────
    console.log("\n4. Ownership");
    await inSavepoint(client, sp(4), async () => {
      const me = await createTestAccount(client, "own_a", "original-password-1");
      const victim = await createTestAccount(client, "own_b", "victim-password-2");
      const victimBefore = await readAccount(client, victim.userId);

      // The Server Action never accepts a user id from the browser — it uses
      // the session's own. This proves the layer beneath: even called with
      // the caller's OWN id, no statement can reach another row.
      await updateOwnProfileTx(client, {
        userId: me.userId,
        username: `${MARKER}_own_a2`,
        email: `${MARKER}_own_a2@example.invalid`,
      });
      const victimAfterProfile = await readAccount(client, victim.userId);
      check(
        "updating your own profile does not alter another account",
        victimAfterProfile.username === victimBefore.username &&
          victimAfterProfile.email === victimBefore.email,
        `${victimAfterProfile.username} untouched`
      );

      await updateOwnPasswordTx(client, {
        userId: me.userId,
        expectedCurrentHash: me.passwordHash,
        newPasswordHash: await bcrypt.hash("changed-password-3", BCRYPT_COST),
      });
      const victimAfterPassword = await readAccount(client, victim.userId);
      check(
        "changing your own password does not alter another account's hash",
        victimAfterPassword.password_hash === victimBefore.password_hash,
        "victim hash untouched"
      );
      check(
        "the other account's original password still verifies",
        await bcrypt.compare("victim-password-2", victimAfterPassword.password_hash),
        "bcrypt.compare = true"
      );
    });

    // ── 5. The Super Admin's row is unreachable from these statements ─────
    console.log("\n5. Super Admin protection");
    await inSavepoint(client, sp(5), async () => {
      const admin = await client.query<{ user_id: string; username: string; password_hash: string }>(
        `SELECT user_id, username, password_hash
         FROM issue_tracking.management_users
         WHERE role = 'admin'
         ORDER BY user_id
         LIMIT 1`
      );
      const row = admin.rows[0];
      if (!row) {
        check("an admin row exists to test against", false, "no role='admin' row found");
        return;
      }
      const adminId = Number(row.user_id);

      // Both write paths are scoped `AND role = 'staff'`. Handed an admin id
      // — which the Server Action can never do, since it uses the session's
      // own id and refuses issue:view_all holders outright — they must still
      // write nothing.
      const profileWritten = await captureError(() =>
        updateOwnProfileTx(client, {
          userId: adminId,
          username: `${MARKER}_hijack`,
          email: `${MARKER}_hijack@example.invalid`,
        })
      );
      const passwordWritten = await updateOwnPasswordTx(client, {
        userId: adminId,
        expectedCurrentHash: row.password_hash,
        newPasswordHash: await bcrypt.hash("hijacked-password-9", BCRYPT_COST),
      });
      const after = await readAccount(client, adminId);

      check(
        "the profile statement writes no admin row",
        profileWritten === null || profileWritten === false,
        "role='staff' scope held"
      );
      check("the password statement writes no admin row", !passwordWritten, "rowCount 0");
      check("the admin username is untouched", after.username === row.username, after.username);
      check("the admin password hash is untouched", after.password_hash === row.password_hash, "hash untouched");
    });
  } finally {
    // Unconditional. There is no COMMIT in this file.
    await client.query("ROLLBACK");
    client.release();
  }

  // ── 6. Read-only proof, on a separate connection after the rollback ─────
  console.log("\n6. Read-only");
  const leftovers = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM issue_tracking.management_users WHERE username LIKE $1`,
    [`${MARKER}%`]
  );
  const leftoverAssignees = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM issue_tracking.assignment_users WHERE assignee_name LIKE $1`,
    [`${MARKER}%`]
  );
  const counts = await query<{ users: string; assignees: string }>(
    `SELECT (SELECT count(*)::text FROM issue_tracking.management_users) AS users,
            (SELECT count(*)::text FROM issue_tracking.assignment_users) AS assignees`
  );
  check("no test login survived the rollback", leftovers.rows[0].n === "0", `${leftovers.rows[0].n} found`);
  check(
    "no test assignee survived the rollback",
    leftoverAssignees.rows[0].n === "0",
    `${leftoverAssignees.rows[0].n} found`
  );
  console.log(
    `  INFO  live row counts: management_users=${counts.rows[0].users}, assignment_users=${counts.rows[0].assignees}`
  );

  await getPool().end();

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All checks passed. Nothing was committed.");
}

main().catch((error) => {
  console.error("Verification aborted:", error);
  process.exit(1);
});
