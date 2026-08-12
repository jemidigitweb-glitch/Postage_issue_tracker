// Assignee status wording — status names only, no explanatory suffixes.
//
// Runs on Node's built-in test runner via tsx (`npm test`). The wording lives
// in lib/access/issueStatusLabels.ts as plain data, which is exactly what the
// status control renders, so it is assertable without mounting a Client
// Component that pulls in a Server Action.
//
// The markup half — that the control renders no native <select> — is proven by
// tests/listbox.test.ts, which actually renders the dropdown.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ASSIGNEE_STATUS_LABELS,
  assigneeStatusOptionList,
  CHANGE_STATUS_LABEL,
  CURRENT_STATUS_LABEL,
  STATUS_PLACEHOLDER,
} from "../lib/access/issueStatusLabels";
import { classifyAssigneeTransition, type IssueStatusValue } from "../lib/access/issueWorkflow";

/** Wording that must NOT appear anywhere in a label or placeholder. */
const BANNED_FRAGMENTS = [
  "—",
  " - ",
  "Work not started",
  "Work started",
  "implementation in progress",
  "Issue completely solved",
  "Select a new status",
];

describe("status labels are the status name and nothing else", () => {
  it("RED reads 'Not Solved'", () => {
    assert.equal(ASSIGNEE_STATUS_LABELS.RED, "Not Solved");
  });

  it("AMBER reads 'Partially Solved'", () => {
    assert.equal(ASSIGNEE_STATUS_LABELS.AMBER, "Partially Solved");
  });

  it("GREEN reads 'Completely Solved'", () => {
    assert.equal(ASSIGNEE_STATUS_LABELS.GREEN, "Completely Solved");
  });

  for (const [status, label] of Object.entries(ASSIGNEE_STATUS_LABELS)) {
    for (const banned of BANNED_FRAGMENTS) {
      it(`${status} label does not contain "${banned}"`, () => {
        assert.equal(label.includes(banned), false, `"${label}" still contains "${banned}"`);
      });
    }
  }
});

describe("headings and placeholder", () => {
  it("the current-status heading is 'Status' (renders as STATUS)", () => {
    assert.equal(CURRENT_STATUS_LABEL, "Status");
  });

  it("the change heading is 'Change status' — not 'Change status to'", () => {
    assert.equal(CHANGE_STATUS_LABEL, "Change status");
    assert.equal(CHANGE_STATUS_LABEL.toLowerCase().endsWith(" to"), false);
  });

  it("the placeholder is 'Select status' — not 'Select a new status…'", () => {
    assert.equal(STATUS_PLACEHOLDER, "Select status");
    assert.equal(STATUS_PLACEHOLDER.includes("new"), false);
    assert.equal(STATUS_PLACEHOLDER.includes("…"), false);
    assert.equal(STATUS_PLACEHOLDER.includes("..."), false);
  });
});

describe("dropdown options per current status", () => {
  it("RED offers exactly ['Partially Solved']", () => {
    assert.deepEqual(
      assigneeStatusOptionList("RED").map((option) => option.label),
      ["Partially Solved"]
    );
  });

  it("AMBER offers exactly ['Not Solved', 'Completely Solved']", () => {
    assert.deepEqual(
      assigneeStatusOptionList("AMBER").map((option) => option.label),
      ["Not Solved", "Completely Solved"]
    );
  });

  it("GREEN offers nothing — the dropdown is not rendered", () => {
    assert.deepEqual(assigneeStatusOptionList("GREEN"), []);
  });

  it("no option label carries an explanatory suffix", () => {
    for (const from of ["RED", "AMBER", "GREEN"] as IssueStatusValue[]) {
      for (const option of assigneeStatusOptionList(from)) {
        for (const banned of BANNED_FRAGMENTS) {
          assert.equal(
            option.label.includes(banned),
            false,
            `option "${option.label}" (from ${from}) contains "${banned}"`
          );
        }
      }
    }
  });

  it("every offered option is one the server would accept", () => {
    // The labels are cosmetic; the SET still comes from the enforced matrix.
    for (const from of ["RED", "AMBER", "GREEN"] as IssueStatusValue[]) {
      for (const option of assigneeStatusOptionList(from)) {
        assert.equal(
          classifyAssigneeTransition(from, option.value),
          "allowed",
          `dropdown offers ${from} -> ${option.value} but the server would refuse it`
        );
      }
    }
  });

  it("never offers the status the Issue is already in", () => {
    for (const from of ["RED", "AMBER", "GREEN"] as IssueStatusValue[]) {
      assert.equal(
        assigneeStatusOptionList(from).some((option) => option.value === from),
        false,
        `${from} is offered as a change from itself`
      );
    }
  });
});
