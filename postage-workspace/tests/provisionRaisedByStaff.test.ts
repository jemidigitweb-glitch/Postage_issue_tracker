import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RAISED_BY_MAX_DISPLAY_NAME_LENGTH,
  RAISED_BY_MAX_EMAIL_LENGTH,
  RAISED_BY_MAX_STAFF_CODE_LENGTH,
  RAISED_BY_MAX_USERNAME_LENGTH,
  RAISED_BY_MIN_PASSWORD_LENGTH,
  RAISED_BY_ROLE,
  isPlausibleEmail,
  normaliseOptionalEmail,
  validateRaisedByProvisioning,
} from "../lib/access/raisedByProvisioning";

// Raised-by-Staff provisioning.
//
// ── TWO HALVES, FOR TWO REASONS ─────────────────────────────────────────────
// The RULES live in lib/access/raisedByProvisioning.ts and are EXECUTED here:
// what is required, what "no email" means, and the password minimum are real
// function calls, so a changed rule is caught by behaviour rather than by a
// string match.
//
// The SAFETY PROPERTIES of the CLI shell are still read as source, because
// scripts/provision-raised-by-staff.ts calls main() at module load: importing
// it would try to prompt for credentials and open a database connection.
//
// NOTHING here touches PostgreSQL. No account is created, and no connection is
// opened, by any test in this file.

const source = readFileSync(join(process.cwd(), "scripts/provision-raised-by-staff.ts"), "utf8");

/** Source with comment lines removed — safety prose documents what the script
 *  must NOT do, so a "must not appear" assertion has to look at code. */
const code = source
  .split("\n")
  .filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  })
  .join("\n");

/** A complete, valid answer set. Individual tests override one field. */
function answers(over: Partial<Record<string, unknown>> = {}) {
  return {
    username: "nandhi.wh",
    displayName: "Nandhi",
    email: "",
    password: "12345678",
    staffCode: "ND",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Email is optional
// ---------------------------------------------------------------------------

describe("Raised-by-Staff — email is OPTIONAL", () => {
  it("a blank email is accepted, and is stored as NULL", () => {
    for (const blank of ["", "   ", "\t", "\n", undefined, null, 7, {}]) {
      const result = validateRaisedByProvisioning(answers({ email: blank }));
      assert.equal(result.ok, true, `${JSON.stringify(blank)} must be accepted as "no email"`);
      assert.equal(result.ok && result.value.email, null, "no email must be null, never a string");
    }
  });

  it("EMPTY STRING is never what gets stored", () => {
    // email is UNIQUE. Nulls are distinct so any number of accounts may have
    // none, but a SECOND '' would be rejected — which would mean the first
    // email-less account silently blocked every later one.
    const result = validateRaisedByProvisioning(answers({ email: "" }));
    assert.equal(result.ok && result.value.email, null);
    assert.notEqual(result.ok && result.value.email, "");
    assert.equal(normaliseOptionalEmail(""), null);
    assert.equal(normaliseOptionalEmail("   "), null);
  });

  it("an email that IS given is kept, trimmed, and not rewritten", () => {
    const result = validateRaisedByProvisioning(answers({ email: "  Nandhi.W@Ledsone.co.uk  " }));
    assert.equal(result.ok, true);
    assert.equal(
      result.ok && result.value.email,
      "Nandhi.W@Ledsone.co.uk",
      "trimmed only — never lower-cased or canonicalised"
    );
  });

  it("an obvious typo is refused rather than stored", () => {
    for (const typo of ["nandhi", "nandhi@", "@ledsone.co.uk", "a@b@c.com", "a b@c.com", "a@b"]) {
      const result = validateRaisedByProvisioning(answers({ email: typo }));
      assert.equal(result.ok, false, `${typo} must be refused`);
      assert.equal(isPlausibleEmail(typo), false);
    }
  });

  it("ordinary addresses are accepted", () => {
    for (const address of [
      "a@b.co",
      "nandhi.w@ledsone.co.uk",
      "postage+mobile@ledsone.co.uk",
      "first_last@sub.domain.example",
    ]) {
      assert.equal(isPlausibleEmail(address), true, `${address} must be accepted`);
      assert.equal(validateRaisedByProvisioning(answers({ email: address })).ok, true);
    }
  });

  it("an over-long address is refused, not truncated into the column", () => {
    const tooLong = `${"a".repeat(RAISED_BY_MAX_EMAIL_LENGTH)}@ledsone.co.uk`;
    const result = validateRaisedByProvisioning(answers({ email: tooLong }));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /at most 255 characters/);
  });
});

// ---------------------------------------------------------------------------
// Everything else is still required
// ---------------------------------------------------------------------------

describe("Raised-by-Staff — email is the ONLY optional answer", () => {
  it("username is required", () => {
    for (const blank of ["", "   ", undefined, null]) {
      const result = validateRaisedByProvisioning(answers({ username: blank }));
      assert.equal(result.ok, false);
      assert.match(result.ok === false ? result.error : "", /Username is required/);
    }
  });

  it("display name is required", () => {
    for (const blank of ["", "   ", undefined, null]) {
      const result = validateRaisedByProvisioning(answers({ displayName: blank }));
      assert.equal(result.ok, false);
      assert.match(result.ok === false ? result.error : "", /Display name is required/);
    }
  });

  it("staff code is required — without it the account cannot raise an Issue", () => {
    for (const blank of ["", "   ", undefined, null]) {
      const result = validateRaisedByProvisioning(answers({ staffCode: blank }));
      assert.equal(result.ok, false);
      assert.match(result.ok === false ? result.error : "", /Staff code is required/);
    }
  });

  it("password is required", () => {
    const result = validateRaisedByProvisioning(answers({ password: "" }));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Password is required/);
  });

  it("every required answer is refused independently of the others", () => {
    // A missing email must NOT mask a missing username, and vice versa.
    const result = validateRaisedByProvisioning(answers({ email: "", username: "" }));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Username is required/);
  });

  it("column widths are enforced before the INSERT can hit them", () => {
    const cases: Array<[string, string, number, RegExp]> = [
      ["username", "u", RAISED_BY_MAX_USERNAME_LENGTH, /Username must be at most 50/],
      ["displayName", "d", RAISED_BY_MAX_DISPLAY_NAME_LENGTH, /Display name must be at most 100/],
      ["staffCode", "S", RAISED_BY_MAX_STAFF_CODE_LENGTH, /Staff code must be at most 20/],
    ];
    for (const [field, char, max, message] of cases) {
      assert.equal(
        validateRaisedByProvisioning(answers({ [field]: char.repeat(max) })).ok,
        true,
        `${field} at exactly ${max} must be accepted`
      );
      const over = validateRaisedByProvisioning(answers({ [field]: char.repeat(max + 1) }));
      assert.equal(over.ok, false, `${field} at ${max + 1} must be refused`);
      assert.match(over.ok === false ? over.error : "", message);
    }
  });

  it("a valid set with no email produces exactly what the INSERT needs", () => {
    const result = validateRaisedByProvisioning(answers({ email: "" }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, {
      username: "nandhi.wh",
      displayName: "Nandhi",
      email: null,
      staffCode: "ND",
    });
  });

  it("the password is never carried on the result", () => {
    const result = validateRaisedByProvisioning(answers({ password: "correct horse battery" }));
    assert.equal(result.ok, true);
    const serialised = JSON.stringify(result.ok ? result.value : {});
    assert.equal(serialised.includes("correct horse battery"), false);
    assert.equal(serialised.includes("password"), false);
  });

  it("no error message ever quotes the password", () => {
    const secret = "hunter2!";
    for (const password of ["", "short", secret.slice(0, 3)]) {
      const result = validateRaisedByProvisioning(answers({ password }));
      if (result.ok) continue;
      assert.equal(result.error.includes(password) && password.length > 0, false, result.error);
    }
  });
});

// ---------------------------------------------------------------------------
// Password minimum — unchanged at 8
// ---------------------------------------------------------------------------

describe("Raised-by-Staff password minimum — 8 characters", () => {
  const accepted = (password: string) => validateRaisedByProvisioning(answers({ password })).ok;

  it("declares a minimum of 8", () => {
    assert.equal(RAISED_BY_MIN_PASSWORD_LENGTH, 8);
  });

  it("rejects 7 characters", () => {
    assert.equal(accepted("1234567"), false);
    assert.equal(accepted("abcdefg"), false);
  });

  it("accepts exactly 8 characters", () => {
    assert.equal(accepted("12345678"), true);
    assert.equal(accepted("abcdefgh"), true);
  });

  it("accepts 9 or more", () => {
    for (const password of ["123456789", "a".repeat(12), "a".repeat(40)]) {
      assert.equal(accepted(password), true, `${password.length} chars must be accepted`);
    }
  });

  it("still rejects everything shorter, down to empty", () => {
    for (let length = 0; length < RAISED_BY_MIN_PASSWORD_LENGTH; length += 1) {
      assert.equal(accepted("x".repeat(length)), false, `${length} chars must be rejected`);
    }
  });

  it("renders the message the owner asked for", () => {
    const result = validateRaisedByProvisioning(answers({ password: "short" }));
    assert.equal(
      result.ok === false ? result.error : "",
      "Password must be at least 8 characters. Aborting. No writes made."
    );
  });

  it("changes NO other account type's minimum", () => {
    // The Super Admin script keeps its own 12, and the Assignee keeps its own
    // constant. This module is imported by the Raised-by script and nothing else.
    const admin = readFileSync(join(process.cwd(), "scripts/create-first-admin.ts"), "utf8");
    assert.ok(admin.includes("const MIN_PASSWORD_LENGTH = 12;"));
    assert.equal(admin.includes("raisedByProvisioning"), false);
    const assignee = readFileSync(join(process.cwd(), "lib/access/assigneeValidation.ts"), "utf8");
    assert.equal(assignee.includes("raisedByProvisioning"), false);
    // Comments stripped: the module DOCUMENTS which other validators exist and
    // that it is not one of them, so only the code may be searched.
    const rules = readFileSync(join(process.cwd(), "lib/access/raisedByProvisioning.ts"), "utf8")
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
      })
      .join("\n");
    assert.equal(rules.includes("import"), false, "the rules import nothing at all");
    for (const forbidden of ["assigneeValidation", "accountSettings", "create-first-admin"]) {
      assert.equal(rules.includes(forbidden), false, `the rules must not reach ${forbidden}`);
    }
  });
});

// ---------------------------------------------------------------------------
// The CLI shell — nothing was weakened by making email optional
// ---------------------------------------------------------------------------

describe("Raised-by-Staff provisioning — nothing else was weakened", () => {
  it("still hashes with bcrypt cost 12", () => {
    assert.ok(code.includes("await bcrypt.hash(password, 12)"));
  });

  it("still masks the password and still confirms it", () => {
    assert.ok(code.includes("promptMaskedPassword(\"Password: \")"));
    assert.ok(code.includes("promptMaskedPassword(\"Confirm password: \")"));
    assert.ok(code.includes("if (password !== confirmation)"));
    // Masking is real: raw mode on, asterisk echoed, never the character typed.
    assert.ok(code.includes("stdin.setRawMode?.(true)"));
    assert.ok(code.includes('stdout.write("*")'));
  });

  it("never logs the plaintext password or the hash", () => {
    for (const line of code.split("\n")) {
      if (!/console\.(log|error|warn|info)/.test(line)) continue;
      for (const forbidden of ["password", "passwordHash", "confirmation"]) {
        assert.equal(
          new RegExp(`\\$\\{\\s*${forbidden}\\b`).test(line),
          false,
          `a console call must not interpolate ${forbidden}: ${line.trim()}`
        );
      }
    }
    // The success block prints only non-sensitive fields — and reports whether
    // an email exists as a BOOLEAN, never by echoing the address back.
    assert.ok(code.includes("(email IS NOT NULL) AS has_email"));
    assert.equal(code.includes("RETURNING password_hash"), false);
    assert.equal(/RETURNING[^;]*\bemail\b(?!\s+IS)/.test(code), false, "never returns the address");
  });

  it("never accepts a password as a CLI argument", () => {
    for (const forbidden of ["process.argv", "argv[2]", "minimist", "yargs"]) {
      assert.equal(code.includes(forbidden), false, `must not read ${forbidden}`);
    }
  });

  it("still gates on BOTH database and user before any query", () => {
    assert.ok(code.includes('const REQUIRED_DATABASE = "varmen_db"'));
    assert.ok(code.includes('const REQUIRED_USER = "varmen_user"'));
    assert.ok(
      code.includes("connectedDb !== REQUIRED_DATABASE || connectedUser !== REQUIRED_USER")
    );
    // The gate precedes the INSERT.
    assert.ok(code.indexOf("REQUIRED_DATABASE ||") < code.indexOf("INSERT INTO"));
  });

  it("still writes one parameterised INSERT, and no UPDATE or DELETE", () => {
    assert.ok(code.includes("INSERT INTO issue_tracking.management_users"));
    assert.ok(code.includes("VALUES ($1, $2, $3, $4, $5, true, $6)"));
    assert.equal(code.split("INSERT INTO").length - 1, 1, "exactly one INSERT");
    for (const forbidden of ["UPDATE issue_tracking", "DELETE FROM issue_tracking", "TRUNCATE"]) {
      assert.equal(code.includes(forbidden), false, `must not contain ${forbidden}`);
    }
    // The email parameter is bound, never interpolated, and never coerced to ''.
    assert.equal(code.includes("email || ''"), false);
    assert.equal(code.includes('email ?? ""'), false);
  });

  it("still refuses to touch an existing account", () => {
    assert.ok(code.includes("A management_users account already uses this username or email"));
    assert.ok(code.includes("This script never changes an existing account's password."));
    // A null email must not be compared with `=`, which is never true — the
    // guard states the intent instead of relying on three-valued logic.
    assert.ok(code.includes("($2::text IS NOT NULL AND email = $2::text)"));
  });

  it("still creates the raised_by role only, and requires the migrations", () => {
    assert.ok(code.includes("const REQUIRED_ROLE = RAISED_BY_ROLE"));
    assert.equal(RAISED_BY_ROLE, "raised_by");
    assert.ok(code.includes("!definition.includes(REQUIRED_ROLE)"));
    assert.ok(code.includes("013_raised_by_staff_auth.sql"));
    assert.ok(code.includes("014_raised_by_staff_link.sql"));
    assert.ok(code.includes("016_management_users_email_optional.sql"));
    for (const forbidden of ['"admin"', '"management"', '"staff"']) {
      assert.equal(code.includes(forbidden), false, `must not reference role ${forbidden}`);
    }
  });

  it("refuses to create an email-less account against an un-migrated column", () => {
    // A clear sentence instead of a not-null violation — and only when there is
    // actually no email to store.
    assert.ok(code.includes('email === null && emailColumn?.is_nullable !== "YES"'));
    assert.ok(code.includes("is still NOT NULL"));
  });

  it("reads issue_staff to CHECK the raiser, and never writes to it", () => {
    assert.ok(code.includes("FROM issue_tracking.issue_staff"));
    assert.ok(code.includes("This script never creates one."), "no invented staff_code");
    assert.ok(code.includes("is not active"), "an inactive raiser is refused");
    assert.ok(code.includes("One raiser, one login."), "a claimed code is refused");
    for (const forbidden of [
      "INSERT INTO issue_tracking.issue_staff",
      "assignment_users",
      "issue_assignments",
    ]) {
      assert.equal(code.includes(forbidden), false, `must not write ${forbidden}`);
    }
  });

  it("hardcodes no credential of any kind", () => {
    assert.equal(/const\s+\w*[Pp]assword\w*\s*=\s*["'`]/.test(code), false);
    assert.equal(code.includes("DATABASE_URL"), false, "the connection is opened by scripts/lib/db");
  });
});
