// Assignee-login validation tests — Stage 5.
//
// Pure: no database, no Next.js context, and NO account of any kind is
// created. The uniqueness rules these mirror are owned by the database
// constraints and are proven separately, against the live schema, by
// scripts/verify-assignee-transactions.ts (which always rolls back).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  validateAssigneeLogin,
} from "../lib/access/assigneeValidation";

const VALID = {
  assigneeName: "Example Person",
  email: "example.person@example.com",
  username: "example.person",
  password: "correct-horse-battery",
  confirmPassword: "correct-horse-battery",
};

function expectError(input: Partial<typeof VALID>, expected: string) {
  const result = validateAssigneeLogin({ ...VALID, ...input });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, expected);
  }
}

describe("assignee login validation — accepted input", () => {
  it("accepts a complete, well-formed submission", () => {
    const result = validateAssigneeLogin(VALID);
    assert.equal(result.ok, true);
  });

  it("trims the name and username, and lower-cases the email", () => {
    const result = validateAssigneeLogin({
      ...VALID,
      assigneeName: "  Example Person  ",
      username: "  Example.Person  ",
      email: "  Example.Person@EXAMPLE.com ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.assigneeName, "Example Person");
      assert.equal(result.value.username, "Example.Person");
      // Lower-casing is what stops "A@b.com" and "a@b.com" both slipping
      // past management_users_email_key.
      assert.equal(result.value.email, "example.person@example.com");
    }
  });

  it("never returns confirmPassword — only the single password to hash", () => {
    const result = validateAssigneeLogin(VALID);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal("confirmPassword" in result.value, false);
      assert.deepEqual(Object.keys(result.value).sort(), [
        "assigneeName",
        "email",
        "password",
        "username",
      ]);
    }
  });
});

describe("assignee login validation — required fields", () => {
  it("rejects a missing name", () => expectError({ assigneeName: "   " }, "Assignee name is required."));
  it("rejects a missing email", () => expectError({ email: "" }, "Email is required."));
  it("rejects a missing username", () => expectError({ username: "" }, "Username is required."));
  it("rejects a missing password", () => expectError({ password: "", confirmPassword: "" }, "Password is required."));
  it("rejects a missing confirm password", () =>
    expectError({ confirmPassword: "" }, "Confirm Password is required."));
});

describe("assignee login validation — email format", () => {
  const invalid = [
    "plainstring",
    "no-at-sign.example.com",
    "two@@example.com",
    "trailing@dot.",
    "@example.com",
    "spaces in@example.com",
    "user@localhost",
    "user@example",
  ];
  for (const email of invalid) {
    it(`rejects ${JSON.stringify(email)}`, () => expectError({ email }, "Enter a valid email address."));
  }

  const valid = [
    "a@b.co",
    "first.last@sub.domain.example.com",
    "user+tag@example.org",
    "USER@EXAMPLE.COM",
  ];
  for (const email of valid) {
    it(`accepts ${JSON.stringify(email)}`, () => {
      assert.equal(validateAssigneeLogin({ ...VALID, email }).ok, true);
    });
  }
});

describe("assignee login validation — username rules", () => {
  it("rejects a username that is too short", () =>
    expectError({ username: "ab" }, `Username must be between 3 and ${USERNAME_MAX_LENGTH} characters.`));

  it("rejects a username longer than the column allows", () =>
    expectError(
      { username: "u".repeat(USERNAME_MAX_LENGTH + 1) },
      `Username must be between 3 and ${USERNAME_MAX_LENGTH} characters.`
    ));

  const badChars = ["has space", "has@at", "has/slash", "has'quote", "has;semi"];
  for (const username of badChars) {
    it(`rejects ${JSON.stringify(username)}`, () =>
      expectError(
        { username },
        "Username may contain only letters, numbers, dots, underscores, and hyphens."
      ));
  }

  it("rejects an email-shaped username, so login input stays unambiguous", () => {
    // findUserForLogin() matches username OR email; allowing '@' in a
    // username would let one account's username collide with another's email.
    const result = validateAssigneeLogin({ ...VALID, username: "someone@example.com" });
    assert.equal(result.ok, false);
  });

  it("accepts letters, digits, dots, underscores and hyphens", () => {
    assert.equal(validateAssigneeLogin({ ...VALID, username: "a.b_c-d123" }).ok, true);
  });
});

describe("assignee login validation — password rules", () => {
  it("rejects a password shorter than the minimum", () =>
    expectError(
      { password: "short", confirmPassword: "short" },
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    ));

  it("rejects a 7-character password", () =>
    expectError(
      { password: "abcdefg", confirmPassword: "abcdefg" },
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    ));

  it("accepts a password of exactly the minimum length", () => {
    const password = "abcdefgh"; // 8
    assert.equal(password.length, PASSWORD_MIN_LENGTH);
    assert.equal(validateAssigneeLogin({ ...VALID, password, confirmPassword: password }).ok, true);
  });

  it("rejects mismatched passwords", () =>
    expectError({ confirmPassword: "correct-horse-batteryX" }, "Passwords do not match."));

  it("mismatch message never echoes either password", () => {
    const result = validateAssigneeLogin({
      ...VALID,
      password: "supersecretvalue1",
      confirmPassword: "supersecretvalue2",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.includes("supersecret"), false);
    }
  });

  it("uses an assignee minimum of 8, independent of the Super Admin's own rule", () => {
    // scripts/create-first-admin.ts keeps its own MIN_PASSWORD_LENGTH = 12.
    // The constants are deliberately separate so relaxing the assignee floor
    // cannot relax the admin's.
    assert.equal(PASSWORD_MIN_LENGTH, 8);
  });
});
