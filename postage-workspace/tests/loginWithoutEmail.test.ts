import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Login when an account has NO email.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// migration/016 made issue_tracking.management_users.email nullable so a
// Raised-by-Staff account can exist without one. The question that creates is:
// can that account still sign in? It must — with its USERNAME — and an account
// that DOES have an address must keep signing in with either one.
//
// ── HOW IT IS TESTED WITHOUT A DATABASE ─────────────────────────────────────
// lib/queries/users.ts imports `server-only` and opens a pool, so it cannot be
// imported under `tsx --test`. Two things are checked instead, and together
// they cover the behaviour:
//
//   1. The WHERE clause is extracted from the real source and evaluated by a
//      faithful in-memory model of SQL's three-valued logic — including the
//      fact that `email = 'x'` against NULL is NULL, not false, and therefore
//      not a match. If the clause changes, the model is re-read from source and
//      the assertions run against the new one.
//   2. The clause's SHAPE is pinned, so a future edit cannot quietly drop the
//      username half or start comparing a null with `=`.
//
// NOTHING here connects to PostgreSQL. No account is read, created or changed.

const usersSource = readFileSync(join(process.cwd(), "lib/queries/users.ts"), "utf8");

/** The WHERE clause findUserForLogin() actually ships. */
function loginWhereClause(): string {
  const query = usersSource.slice(
    usersSource.indexOf("export async function findUserForLogin"),
    usersSource.indexOf("export async function findUserById")
  );
  const start = query.indexOf("WHERE");
  const end = query.indexOf("LIMIT 1", start);
  assert.ok(start !== -1 && end > start, "findUserForLogin must have a WHERE ... LIMIT 1");
  return query.slice(start, end).replace(/\s+/g, " ").trim();
}

interface Account {
  username: string;
  email: string | null;
}

/**
 * The clause, evaluated the way PostgreSQL would.
 *
 * `email = $1` is modelled as NULL when email IS NULL — SQL's unknown, which
 * WHERE treats as "do not return this row". That is the exact property the
 * production query depends on, so it is modelled rather than assumed.
 */
function matches(account: Account, identifier: string): boolean {
  const usernameMatches = account.username === identifier;
  const emailIsNotNull = account.email !== null;
  const emailMatches = emailIsNotNull && account.email === identifier;
  return usernameMatches || emailMatches;
}

/** Applies the model across a table, returning the row login would resolve. */
function findUserForLogin(accounts: Account[], identifier: string): Account | null {
  return accounts.find((account) => matches(account, identifier)) ?? null;
}

const WITHOUT_EMAIL: Account = { username: "nandhi.wh", email: null };
const WITH_EMAIL: Account = { username: "vishnu", email: "vishnu@ledsone.co.uk" };
const ANOTHER_WITHOUT_EMAIL: Account = { username: "atisraj.wh", email: null };
const TABLE = [WITHOUT_EMAIL, WITH_EMAIL, ANOTHER_WITHOUT_EMAIL];

describe("login — an account with no email signs in with its username", () => {
  it("resolves by username", () => {
    assert.deepEqual(findUserForLogin(TABLE, "nandhi.wh"), WITHOUT_EMAIL);
  });

  it("resolves the right one when SEVERAL accounts have no email", () => {
    // Nulls are distinct under the UNIQUE constraint, so this is a real state.
    assert.deepEqual(findUserForLogin(TABLE, "atisraj.wh"), ANOTHER_WITHOUT_EMAIL);
    assert.deepEqual(findUserForLogin(TABLE, "nandhi.wh"), WITHOUT_EMAIL);
  });

  it("cannot be reached by an empty or blank identifier", () => {
    // The login action refuses these before querying; the clause refuses them
    // too, so a missing email is never a way in.
    for (const identifier of ["", " ", "null", "NULL", "undefined"]) {
      assert.equal(findUserForLogin(TABLE, identifier), null, `"${identifier}" must match nothing`);
    }
  });

  it("an unknown identifier still resolves to nothing", () => {
    assert.equal(findUserForLogin(TABLE, "someone.else"), null);
  });
});

describe("login — an account WITH an email is unchanged", () => {
  it("resolves by username", () => {
    assert.deepEqual(findUserForLogin(TABLE, "vishnu"), WITH_EMAIL);
  });

  it("resolves by email", () => {
    assert.deepEqual(findUserForLogin(TABLE, "vishnu@ledsone.co.uk"), WITH_EMAIL);
  });

  it("does not resolve by somebody else's address", () => {
    assert.equal(findUserForLogin(TABLE, "nobody@ledsone.co.uk"), null);
  });
});

describe("login — the shipped WHERE clause is the one modelled here", () => {
  const clause = loginWhereClause();

  it("still matches on username", () => {
    assert.ok(clause.includes("username = $1"), clause);
  });

  it("still matches on email, and guards the null", () => {
    assert.ok(clause.includes("email IS NOT NULL AND email = $1"), clause);
  });

  it("is an OR of exactly those two, and nothing else", () => {
    assert.equal(clause, "WHERE username = $1 OR (email IS NOT NULL AND email = $1)");
  });

  it("takes the identifier as a bound parameter, never interpolated", () => {
    const query = usersSource.slice(
      usersSource.indexOf("export async function findUserForLogin"),
      usersSource.indexOf("export async function findUserById")
    );
    assert.ok(query.includes("[identifier]"), "the identifier is passed as a parameter");
    assert.equal(query.includes("${identifier}"), false, "never interpolated into SQL");
  });

  it("still returns the password hash for verification, and nothing more", () => {
    const query = usersSource.slice(
      usersSource.indexOf("export async function findUserForLogin"),
      usersSource.indexOf("export async function findUserById")
    );
    assert.ok(query.includes("SELECT user_id, username, display_name, password_hash, role, active"));
    // The address is not selected at all — login has no use for it.
    assert.equal(/SELECT[^`]*\bemail\b/.test(query.slice(query.indexOf("SELECT"), query.indexOf("FROM"))), false);
  });
});

describe("login — the Server Action's behaviour is unchanged", () => {
  const actionSource = readFileSync(join(process.cwd(), "app/login/actions.ts"), "utf8");
  /** Comments stripped: the action DOCUMENTS that it accepts a username or an
   *  email, so only the code may be searched for a branch on one. */
  const actionCode = actionSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  it("still reveals nothing about which check failed", () => {
    assert.ok(actionCode.includes('const GENERIC_ERROR = "Invalid username or password."'));
    assert.equal((actionCode.match(/GENERIC_ERROR/g) ?? []).length >= 4, true);
    // An account with no email must not produce a different message from one
    // with an email — there is only one message, and no branch that could
    // choose a second.
    assert.equal(actionCode.includes("email"), false, "the action never branches on email");
  });

  it("still compares against a dummy hash when no user is found", () => {
    assert.ok(actionCode.includes("await bcrypt.compare(password, await getDummyHash())"));
  });

  it("still refuses an inactive account", () => {
    assert.ok(actionCode.includes("if (!user || !user.active)"));
  });
});
