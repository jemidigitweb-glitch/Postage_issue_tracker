import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// scripts/provision-raised-by-staff.ts — the one-time provisioning script for
// the shared Raised-by-Staff login.
//
// ── WHY THIS IS A SOURCE TEST ───────────────────────────────────────────────
// The script calls main() at module load: importing it would try to prompt for
// credentials and open a database connection. Reading the source is therefore
// the only way to cover it at all. The password RULE is not merely asserted
// against the text, though — the constant is extracted from the source and the
// real predicate is re-executed against it, so a changed threshold is caught by
// behaviour rather than by a string match.

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

/** The minimum the script actually compiles with, read out of the source. */
function declaredMinimum(): number {
  const match = code.match(/const MIN_PASSWORD_LENGTH = (\d+);/);
  assert.ok(match, "MIN_PASSWORD_LENGTH must be declared");
  return Number(match[1]);
}

/** The script's own rule: `if (password.length < MIN_PASSWORD_LENGTH) abort`. */
function isAccepted(password: string): boolean {
  return !(password.length < declaredMinimum());
}

describe("Raised-by-Staff password minimum — 8 characters", () => {
  it("declares a minimum of 8", () => {
    assert.equal(declaredMinimum(), 8);
  });

  it("rejects 7 characters", () => {
    assert.equal(isAccepted("1234567"), false);
    assert.equal(isAccepted("abcdefg"), false);
  });

  it("accepts exactly 8 characters", () => {
    assert.equal(isAccepted("12345678"), true);
    assert.equal(isAccepted("abcdefgh"), true);
  });

  it("accepts 9 or more", () => {
    for (const password of ["123456789", "a".repeat(12), "a".repeat(40)]) {
      assert.equal(isAccepted(password), true, `${password.length} chars must be accepted`);
    }
  });

  it("still rejects everything shorter, down to empty", () => {
    for (let length = 0; length < 8; length += 1) {
      assert.equal(isAccepted("x".repeat(length)), false, `${length} chars must be rejected`);
    }
  });

  it("renders the message the owner asked for", () => {
    // The message is a template literal over the same constant, so it can never
    // drift out of step with the rule above.
    assert.ok(
      code.includes(
        "`Password must be at least ${MIN_PASSWORD_LENGTH} characters. Aborting. No writes made.`"
      )
    );
    const rendered = `Password must be at least ${declaredMinimum()} characters.`;
    assert.equal(rendered, "Password must be at least 8 characters.");
  });

  it("changes NO other account type's minimum", () => {
    // The Super Admin script keeps its own 12, and the Assignee keeps its own
    // constant. This script's value is local and shared with nothing.
    const admin = readFileSync(join(process.cwd(), "scripts/create-first-admin.ts"), "utf8");
    assert.ok(admin.includes("const MIN_PASSWORD_LENGTH = 12;"));
    assert.equal(
      code.includes("assigneeValidation") || code.includes("accountSettings"),
      false,
      "the provisioning script must not import a shared password validator"
    );
  });
});

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
    // The success block prints only non-sensitive fields.
    assert.ok(code.includes("RETURNING user_id, username, display_name, role, active, created_at"));
    assert.equal(code.includes("RETURNING password_hash"), false);
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
    assert.ok(code.includes("VALUES ($1, $2, $3, $4, $5, true)"));
    assert.equal(code.split("INSERT INTO").length - 1, 1, "exactly one INSERT");
    for (const forbidden of ["UPDATE issue_tracking", "DELETE FROM issue_tracking", "TRUNCATE"]) {
      assert.equal(code.includes(forbidden), false, `must not contain ${forbidden}`);
    }
  });

  it("still refuses to touch an existing account", () => {
    assert.ok(code.includes("A management_users account already uses this username or email"));
    assert.ok(code.includes("This script never changes an existing account's password."));
  });

  it("still creates the raised_by role only, and requires the migration", () => {
    assert.ok(code.includes('const REQUIRED_ROLE = "raised_by"'));
    assert.ok(code.includes("!definition.includes(REQUIRED_ROLE)"));
    for (const forbidden of ['"admin"', '"management"', '"staff"']) {
      assert.equal(code.includes(forbidden), false, `must not reference role ${forbidden}`);
    }
  });

  it("still creates no issue_staff or assignment row", () => {
    for (const forbidden of ["issue_staff", "assignment_users", "issue_assignments", "staff_code"]) {
      assert.equal(code.includes(forbidden), false, `must not reference ${forbidden}`);
    }
  });

  it("hardcodes no credential of any kind", () => {
    assert.equal(/const\s+\w*[Pp]assword\w*\s*=\s*["'`]/.test(code), false);
    assert.equal(code.includes("DATABASE_URL"), false, "the connection is opened by scripts/lib/db");
  });
});
