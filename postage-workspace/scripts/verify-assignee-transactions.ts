// scripts/verify-assignee-transactions.ts
//
// Proves the Assignee account-creation behaviour against the REAL schema —
// and leaves ZERO rows behind.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:assignee-tx
//
// ── HOW "ZERO PERMANENT DATA" IS GUARANTEED ─────────────────────────────────
// Everything runs inside ONE transaction that is ALWAYS rolled back:
//   BEGIN
//     ... every scenario, each wrapped in its own SAVEPOINT ...
//   ROLLBACK          <- unconditional, in a finally block
// There is no COMMIT anywhere in this file. Even a crash mid-run ends the
// connection, which Postgres treats as a rollback. The row counts printed at
// the end are re-read on a SEPARATE connection after the rollback, so they
// independently confirm nothing persisted.
//
// SAVEPOINTs are needed because a failed statement (e.g. a deliberate unique
// violation) aborts the whole transaction otherwise; each negative test rolls
// back to its savepoint so the next one can run.
//
// Test identifiers are prefixed with a marker that could not collide with a
// real person, and the final check asserts none of them survived.

import type { PoolClient } from "pg";

import {
  AssigneeAlreadyLinkedError,
  createAssigneeWithLoginTx,
  createLoginForExistingAssigneeTx,
  DuplicateAssigneeNameError,
  DuplicateEmailError,
  DuplicateUsernameError,
} from "../lib/queries/assigneeAccounts";
import { getPool, getVerifiedClient, query } from "../lib/db";

const MARKER = "__stage5_verify__";
const FAKE_HASH = "$2b$12$0000000000000000000000000000000000000000000000000000"; // not a real credential

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
}

/** Runs `fn` inside a savepoint and always rolls back to it. */
async function inSavepoint<T>(client: PoolClient, name: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    return await fn();
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
  }
}

/** Captures the error thrown by `fn`, if any. */
async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

async function main(): Promise<void> {
  console.log("Assignee transaction verification. Everything below is ROLLED BACK.\n");

  const client = await getVerifiedClient();

  try {
    await client.query("BEGIN");

    // ── 1. Creating a brand new Assignee + login ──────────────────────────
    await inSavepoint(client, sp(1), async () => {
      const created = await createAssigneeWithLoginTx(client, {
        assigneeName: `${MARKER}_new_person`,
        email: `${MARKER}_new@example.invalid`,
        username: `${MARKER}_new`,
        passwordHash: FAKE_HASH,
        active: true,
      });

      const row = await client.query<{
        assignee_id: number;
        user_id: string | null;
        username: string;
        email: string;
        role: string;
        display_name: string;
        active: boolean;
        password_hash: string;
      }>(
        `SELECT au.assignee_id, au.user_id, mu.username, mu.email, mu.role,
                mu.display_name, mu.active, mu.password_hash
         FROM issue_tracking.assignment_users au
         JOIN issue_tracking.management_users mu ON mu.user_id = au.user_id
         WHERE au.assignee_id = $1`,
        [created.assigneeId]
      );
      const r = row.rows[0];

      check("new Assignee: assignment_users row created", r !== undefined, `assignee_id ${created.assigneeId}`);
      check("new Assignee: management_users row created", Number(r.user_id) === created.userId, `user_id ${created.userId}`);
      check("new Assignee: username stored", r.username === `${MARKER}_new`, r.username);
      check("new Assignee: email stored", r.email === `${MARKER}_new@example.invalid`, r.email);
      check("new Assignee: role is 'staff'", r.role === "staff", r.role);
      check("new Assignee: display_name is the assignee name", r.display_name === `${MARKER}_new_person`, r.display_name);
      check("new Assignee: user_id link correct", Number(r.user_id) === created.userId, `${r.user_id} == ${created.userId}`);
      check(
        "new Assignee: only the hash is stored (no plaintext)",
        r.password_hash === FAKE_HASH,
        "password_hash matches the hash passed in, nothing else"
      );
    });

    // ── 2. Atomicity: a failing login insert leaves NO assignee behind ────
    await inSavepoint(client, sp(2), async () => {
      // Seed one account, then attempt a second whose username collides.
      const first = await createAssigneeWithLoginTx(client, {
        assigneeName: `${MARKER}_atomic_a`,
        email: `${MARKER}_atomic_a@example.invalid`,
        username: `${MARKER}_dupe`,
        passwordHash: FAKE_HASH,
        active: true,
      });
      check("atomicity: seed account created", first.userId > 0, `user_id ${first.userId}`);

      await client.query(`SAVEPOINT inner_atomic`);
      const error = await captureError(() =>
        createAssigneeWithLoginTx(client, {
          assigneeName: `${MARKER}_atomic_b`,
          email: `${MARKER}_atomic_b@example.invalid`,
          username: `${MARKER}_dupe`, // collides
          passwordHash: FAKE_HASH,
          active: true,
        })
      );
      check(
        "atomicity: duplicate username rejected",
        error instanceof DuplicateUsernameError,
        error instanceof Error ? error.name : String(error)
      );
      await client.query(`ROLLBACK TO SAVEPOINT inner_atomic`);

      const orphan = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM issue_tracking.assignment_users WHERE assignee_name = $1`,
        [`${MARKER}_atomic_b`]
      );
      check(
        "atomicity: no orphan assignment_users row survives the failure",
        orphan.rows[0].count === "0",
        `${orphan.rows[0].count} rows named ${MARKER}_atomic_b`
      );
    });

    // ── 3. Uniqueness rejections ─────────────────────────────────────────
    await inSavepoint(client, sp(3), async () => {
      await createAssigneeWithLoginTx(client, {
        assigneeName: `${MARKER}_uniq`,
        email: `${MARKER}_uniq@example.invalid`,
        username: `${MARKER}_uniq`,
        passwordHash: FAKE_HASH,
        active: true,
      });

      for (const [label, expected, input] of [
        [
          "duplicate Assignee name",
          DuplicateAssigneeNameError,
          { assigneeName: `${MARKER}_uniq`, email: `${MARKER}_x@example.invalid`, username: `${MARKER}_x` },
        ],
        [
          "duplicate Username",
          DuplicateUsernameError,
          { assigneeName: `${MARKER}_y`, email: `${MARKER}_y@example.invalid`, username: `${MARKER}_uniq` },
        ],
        [
          "duplicate Email",
          DuplicateEmailError,
          { assigneeName: `${MARKER}_z`, email: `${MARKER}_uniq@example.invalid`, username: `${MARKER}_z` },
        ],
      ] as const) {
        await client.query(`SAVEPOINT dupe_check`);
        const error = await captureError(() =>
          createAssigneeWithLoginTx(client, { ...input, passwordHash: FAKE_HASH, active: true })
        );
        check(
          `${label} rejected`,
          error instanceof expected,
          error instanceof Error ? error.name : String(error)
        );
        await client.query(`ROLLBACK TO SAVEPOINT dupe_check`);
      }
    });

    // ── 4. Existing assignee (no login) receives one ─────────────────────
    await inSavepoint(client, sp(4), async () => {
      const unlinked = await client.query<{ assignee_id: number; assignee_name: string }>(
        `SELECT assignee_id, assignee_name
         FROM issue_tracking.assignment_users
         WHERE user_id IS NULL
         ORDER BY assignee_id
         LIMIT 1`
      );
      const target = unlinked.rows[0];
      if (!target) {
        console.log("  SKIP  no unlinked assignee available to test against");
        return;
      }

      const before = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM issue_tracking.assignment_users`
      );

      const created = await createLoginForExistingAssigneeTx(client, {
        assigneeId: target.assignee_id,
        email: `${MARKER}_existing@example.invalid`,
        username: `${MARKER}_existing`,
        passwordHash: FAKE_HASH,
        active: true,
      });

      const after = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM issue_tracking.assignment_users`
      );

      check(
        "existing Assignee: login created and linked",
        created.assigneeId === target.assignee_id && created.userId > 0,
        `${target.assignee_name} -> user_id ${created.userId}`
      );
      check(
        "existing Assignee: NO duplicate assignment_users row created",
        before.rows[0].count === after.rows[0].count,
        `${before.rows[0].count} before, ${after.rows[0].count} after`
      );
      check(
        "existing Assignee: display_name taken from the locked DB row, not the form",
        (
          await client.query<{ display_name: string }>(
            `SELECT display_name FROM issue_tracking.management_users WHERE user_id = $1`,
            [created.userId]
          )
        ).rows[0].display_name === target.assignee_name,
        target.assignee_name
      );

      // A second login attempt on the now-linked assignee must be refused.
      await client.query(`SAVEPOINT second_login`);
      const error = await captureError(() =>
        createLoginForExistingAssigneeTx(client, {
          assigneeId: target.assignee_id,
          email: `${MARKER}_second@example.invalid`,
          username: `${MARKER}_second`,
          passwordHash: FAKE_HASH,
          active: true,
        })
      );
      check(
        "linked Assignee cannot receive a second login",
        error instanceof AssigneeAlreadyLinkedError,
        error instanceof Error ? error.name : String(error)
      );
      await client.query(`ROLLBACK TO SAVEPOINT second_login`);
    });

    // ── 5. Deactivation preserves the assignee and their assignments ─────
    await inSavepoint(client, sp(5), async () => {
      const created = await createAssigneeWithLoginTx(client, {
        assigneeName: `${MARKER}_deact`,
        email: `${MARKER}_deact@example.invalid`,
        username: `${MARKER}_deact`,
        passwordHash: FAKE_HASH,
        active: true,
      });

      // Mirrors setAssigneeLoginActive(), run on this transaction's client.
      const deactivate = await client.query(
        `UPDATE issue_tracking.management_users mu
         SET active = $2, updated_at = now()
         FROM issue_tracking.assignment_users au
         WHERE au.assignee_id = $1 AND mu.user_id = au.user_id AND mu.role = 'staff'
         RETURNING mu.user_id`,
        [created.assigneeId, false]
      );
      check("deactivation: exactly one login row updated", deactivate.rowCount === 1, `rowCount ${deactivate.rowCount}`);

      const after = await client.query<{ login_active: boolean; assignee_still_there: boolean }>(
        `SELECT mu.active AS login_active, (au.assignee_id IS NOT NULL) AS assignee_still_there
         FROM issue_tracking.assignment_users au
         JOIN issue_tracking.management_users mu ON mu.user_id = au.user_id
         WHERE au.assignee_id = $1`,
        [created.assigneeId]
      );
      check("deactivation: login inactive", after.rows[0].login_active === false, "active = false");
      check("deactivation: assignment_users row preserved", after.rows[0].assignee_still_there === true, "row intact");

      const reactivate = await client.query(
        `UPDATE issue_tracking.management_users mu
         SET active = $2, updated_at = now()
         FROM issue_tracking.assignment_users au
         WHERE au.assignee_id = $1 AND mu.user_id = au.user_id AND mu.role = 'staff'
         RETURNING mu.active`,
        [created.assigneeId, true]
      );
      check("activation: restores eligibility", reactivate.rows[0].active === true, "active = true");
    });

    // ── 6. The Super Admin can never be flipped by this path ─────────────
    await inSavepoint(client, sp(6), async () => {
      const result = await client.query(
        `UPDATE issue_tracking.management_users mu
         SET active = false
         FROM issue_tracking.assignment_users au
         WHERE au.assignee_id = -1 AND mu.user_id = au.user_id AND mu.role = 'staff'
         RETURNING mu.user_id`
      );
      check(
        "login status change cannot touch the Super Admin",
        result.rowCount === 0,
        `rowCount ${result.rowCount} (role='staff' scope also excludes admin)`
      );
    });
  } finally {
    // UNCONDITIONAL. There is no COMMIT anywhere in this file.
    await client.query("ROLLBACK");
    client.release();
    console.log("\nTransaction ROLLED BACK.");
  }

  // ── Independent confirmation on a fresh connection ──────────────────────
  const leftovers = await query<{ assignment_users: string; management_users: string; marked: string }>(
    `SELECT
       (SELECT count(*) FROM issue_tracking.assignment_users) AS assignment_users,
       (SELECT count(*) FROM issue_tracking.management_users) AS management_users,
       (SELECT count(*) FROM issue_tracking.assignment_users WHERE assignee_name LIKE $1)
       + (SELECT count(*) FROM issue_tracking.management_users WHERE username LIKE $1 OR email LIKE $1) AS marked`,
    [`%${MARKER}%`]
  );
  const l = leftovers.rows[0];
  console.log(
    `\nPost-rollback: assignment_users=${l.assignment_users}, management_users=${l.management_users}`
  );
  check("ZERO test rows remain", l.marked === "0", `${l.marked} rows matching the test marker`);
}

/** Savepoint names must be identifiers, and are hard-coded here — never
 *  interpolated from input. */
function sp(n: number): string {
  return `stage5_sp_${n}`;
}

main()
  .then(async () => {
    await getPool().end();
    if (failures > 0) {
      console.error(`\n${failures} check(s) FAILED.`);
      process.exitCode = 1;
    } else {
      console.log("\nAll checks passed. Nothing was committed.");
    }
  })
  .catch(async (error) => {
    console.error("Verification error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
    try {
      await getPool().end();
    } catch {
      /* pool may never have opened */
    }
  });
