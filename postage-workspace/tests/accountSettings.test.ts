// lib/access/accountSettings.ts — the Assignee's own Account Settings rules.
//
// Pure validation only: no database, no request context, no bcrypt. What is
// PROVEN here is the shape of every accept/reject decision. Ownership
// enforcement and uniqueness live in the Server Action and the database
// respectively, and are proven against the real schema by
// scripts/verify-account-settings.ts (which always ROLLS BACK).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  validatePasswordChange,
  validateProfileUpdate,
} from "../lib/access/accountSettings";

const VALID_PROFILE = { username: "rajive.k", email: "rajive@example.com" };

describe("validateProfileUpdate — accepted input", () => {
  it("accepts a valid username and email", () => {
    const result = validateProfileUpdate(VALID_PROFILE);
    assert.equal(result.ok, true);
  });

  it("trims whitespace from the username", () => {
    const result = validateProfileUpdate({ ...VALID_PROFILE, username: "  rajive.k  " });
    assert.ok(result.ok);
    assert.equal(result.value.username, "rajive.k");
  });

  it("trims and lower-cases the email so case cannot bypass the UNIQUE index", () => {
    const result = validateProfileUpdate({ ...VALID_PROFILE, email: "  Rajive@Example.COM " });
    assert.ok(result.ok);
    assert.equal(result.value.email, "rajive@example.com");
  });

  it("preserves username case", () => {
    const result = validateProfileUpdate({ ...VALID_PROFILE, username: "Rajive.K" });
    assert.ok(result.ok);
    assert.equal(result.value.username, "Rajive.K");
  });
});

describe("validateProfileUpdate — username rejections", () => {
  const CASES: [string, string, string][] = [
    ["empty", "", "Username is required."],
    ["whitespace only", "   ", "Username is required."],
    ["too short", "ab", "Username must be between 3 and 50 characters."],
    ["too long", "a".repeat(51), "Username must be between 3 and 50 characters."],
    [
      "contains a space",
      "raj ive",
      "Username may contain only letters, numbers, dots, underscores, and hyphens.",
    ],
    [
      "contains @ (would be ambiguous with an email at the login prompt)",
      "raj@ive",
      "Username may contain only letters, numbers, dots, underscores, and hyphens.",
    ],
  ];

  for (const [label, username, expected] of CASES) {
    it(`rejects a username that is ${label}`, () => {
      const result = validateProfileUpdate({ ...VALID_PROFILE, username });
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.error, expected);
    });
  }
});

describe("validateProfileUpdate — email rejections", () => {
  const INVALID_EMAILS = [
    "not-an-email",
    "no-at-sign.com",
    "two@@at.com",
    "spaces in@example.com",
    "trailing@dot.",
    "@example.com",
    "user@example",
  ];

  it("rejects an empty email", () => {
    const result = validateProfileUpdate({ ...VALID_PROFILE, email: "  " });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "Email address is required.");
  });

  for (const email of INVALID_EMAILS) {
    it(`rejects "${email}"`, () => {
      const result = validateProfileUpdate({ ...VALID_PROFILE, email });
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.error, "Enter a valid email address.");
    });
  }

  it("rejects an email longer than the column allows", () => {
    const email = `${"a".repeat(250)}@example.com`;
    const result = validateProfileUpdate({ ...VALID_PROFILE, email });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "Email address must be 255 characters or fewer.");
  });
});

describe("validateProfileUpdate — cannot express a privileged field", () => {
  it("returns only username and email, whatever else is passed in", () => {
    const result = validateProfileUpdate({
      ...VALID_PROFILE,
      // Deliberately smuggled in the way a crafted request would.
      ...({
        role: "admin",
        active: true,
        userId: 1,
        assigneeId: 1,
        assigneeName: "Someone Else",
        displayName: "Someone Else",
      } as unknown as { username: string; email: string }),
    });
    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.value).sort(), ["email", "username"]);
  });
});

const VALID_CHANGE = {
  currentPassword: "old-password-1",
  newPassword: "new-password-1",
  confirmPassword: "new-password-1",
};

describe("validatePasswordChange", () => {
  it("accepts a valid change", () => {
    const result = validatePasswordChange(VALID_CHANGE);
    assert.equal(result.ok, true);
  });

  it("requires the current password", () => {
    const result = validatePasswordChange({ ...VALID_CHANGE, currentPassword: "" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "Enter your current password.");
  });

  it("requires a new password", () => {
    const result = validatePasswordChange({ ...VALID_CHANGE, newPassword: "", confirmPassword: "" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "Enter a new password.");
  });

  it(`rejects a new password shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    const result = validatePasswordChange({
      ...VALID_CHANGE,
      newPassword: short,
      confirmPassword: short,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "New password must be at least 8 characters.");
  });

  it(`accepts a new password of exactly ${PASSWORD_MIN_LENGTH} characters`, () => {
    const exact = "a".repeat(PASSWORD_MIN_LENGTH);
    const result = validatePasswordChange({
      ...VALID_CHANGE,
      newPassword: exact,
      confirmPassword: exact,
    });
    assert.equal(result.ok, true);
  });

  it("requires the confirmation field", () => {
    const result = validatePasswordChange({ ...VALID_CHANGE, confirmPassword: "" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "Confirm your new password.");
  });

  it("rejects a confirmation mismatch", () => {
    const result = validatePasswordChange({ ...VALID_CHANGE, confirmPassword: "different-1" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "New passwords do not match.");
  });

  it("rejects reusing the current password", () => {
    const result = validatePasswordChange({
      currentPassword: "same-password-1",
      newPassword: "same-password-1",
      confirmPassword: "same-password-1",
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.error,
      "Your new password must be different from your current password."
    );
  });

  it("does not trim passwords — spaces are legitimate characters", () => {
    const withSpaces = "  spaced password  ";
    const result = validatePasswordChange({
      currentPassword: "old-password-1",
      newPassword: withSpaces,
      confirmPassword: withSpaces,
    });
    assert.ok(result.ok);
    assert.equal(result.value.newPassword, withSpaces);
  });

  it("never echoes a password in an error message", () => {
    const secret = "SUPER_SECRET_VALUE_1";
    const result = validatePasswordChange({
      currentPassword: secret,
      newPassword: "x",
      confirmPassword: "y",
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error.includes(secret), false);
  });
});

describe("the minimum password length is the Assignee floor, not the admin's", () => {
  it("is 8", () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8);
  });
});
