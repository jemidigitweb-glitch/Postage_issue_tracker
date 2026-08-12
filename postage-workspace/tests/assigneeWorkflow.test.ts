// Assignee Portal — the assignee status-transition matrix.
//
// Runs on Node's built-in test runner via tsx (`npm test`). No database, no
// framework, no live account: the matrix lives in lib/access/issueWorkflow.ts
// as a pure function, which is exactly what the status transaction calls.
//
// What this file proves and what it does not:
//  - PROVES the assignee matrix itself, that the dropdown options are derived
//    from that same matrix (so UI and server cannot disagree), and — the
//    point of the whole stage — that the SUPER ADMIN's rules are byte-for-byte
//    unchanged by the assignee rules existing.
//  - Does NOT execute the Server Action or the SQL. Those are proven
//    end-to-end against the real schema, with zero permanent rows, by
//    scripts/verify-issue-work-progress.ts (`npm run verify:work-progress`),
//    which drives updateIssueStatusTx directly for both workflows.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ASSIGNEE_ALLOWED_TRANSITIONS,
  assigneeStatusOptions,
  classifyAssigneeTransition,
  classifyTransition,
  STATUS_RANK,
  type IssueStatusValue,
} from "../lib/access/issueWorkflow";
import { requiredWorkDetailFields } from "../lib/access/issueWorkDetails";

const ALL_STATUSES: readonly IssueStatusValue[] = ["RED", "AMBER", "GREEN"];

describe("assignee matrix — allowed transitions", () => {
  it("RED -> AMBER is allowed (start work)", () => {
    assert.equal(classifyAssigneeTransition("RED", "AMBER"), "allowed");
  });

  it("AMBER -> RED is allowed (stop work)", () => {
    assert.equal(classifyAssigneeTransition("AMBER", "RED"), "allowed");
  });

  it("AMBER -> GREEN is allowed (completely solved)", () => {
    assert.equal(classifyAssigneeTransition("AMBER", "GREEN"), "allowed");
  });
});

describe("assignee matrix — blocked transitions", () => {
  it("RED -> GREEN is blocked — work must be started first", () => {
    assert.equal(classifyAssigneeTransition("RED", "GREEN"), "blocked");
  });

  it("GREEN -> AMBER is blocked — GREEN is final", () => {
    assert.equal(classifyAssigneeTransition("GREEN", "AMBER"), "blocked");
  });

  it("GREEN -> RED is blocked — GREEN is final", () => {
    assert.equal(classifyAssigneeTransition("GREEN", "RED"), "blocked");
  });

  it("GREEN has no outgoing transition at all", () => {
    assert.deepEqual(ASSIGNEE_ALLOWED_TRANSITIONS.GREEN, []);
    for (const to of ALL_STATUSES) {
      const expected = to === "GREEN" ? "noop" : "blocked";
      assert.equal(classifyAssigneeTransition("GREEN", to), expected, `GREEN -> ${to}`);
    }
  });
});

describe("assignee matrix — same status is a no-op, never an error", () => {
  for (const status of ALL_STATUSES) {
    it(`${status} -> ${status} is a no-op`, () => {
      assert.equal(classifyAssigneeTransition(status, status), "noop");
    });
  }
});

describe("assignee matrix — the complete 3x3 grid", () => {
  // Pinned exhaustively so any future edit to the matrix has to be deliberate.
  const EXPECTED: Record<IssueStatusValue, Record<IssueStatusValue, string>> = {
    RED: { RED: "noop", AMBER: "allowed", GREEN: "blocked" },
    AMBER: { RED: "allowed", AMBER: "noop", GREEN: "allowed" },
    GREEN: { RED: "blocked", AMBER: "blocked", GREEN: "noop" },
  };

  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      it(`${from} -> ${to} is ${EXPECTED[from][to]}`, () => {
        assert.equal(classifyAssigneeTransition(from, to), EXPECTED[from][to]);
      });
    }
  }
});

describe("assignee status options offered by the UI", () => {
  // The detail-page control renders straight from this function, so the
  // dropdown and the server rule can never drift apart.
  it("RED offers only AMBER", () => {
    assert.deepEqual(assigneeStatusOptions("RED"), ["AMBER"]);
  });

  it("AMBER offers RED and GREEN", () => {
    assert.deepEqual(assigneeStatusOptions("AMBER"), ["RED", "GREEN"]);
  });

  it("GREEN offers nothing — no status-change control is rendered", () => {
    assert.deepEqual(assigneeStatusOptions("GREEN"), []);
  });

  it("every offered option is one the server would accept", () => {
    for (const from of ALL_STATUSES) {
      for (const to of assigneeStatusOptions(from)) {
        assert.equal(
          classifyAssigneeTransition(from, to),
          "allowed",
          `UI offers ${from} -> ${to} but the server would refuse it`
        );
      }
    }
  });
});

describe("work details required by each assignee transition", () => {
  it("RED -> AMBER requires Implementation In Progress", () => {
    assert.deepEqual(requiredWorkDetailFields("AMBER"), ["implementationProgress"]);
  });

  it("AMBER -> GREEN requires Implementation Done and Final Resolution", () => {
    assert.deepEqual(requiredWorkDetailFields("GREEN"), ["implementationDone", "finalResolution"]);
  });

  it("AMBER -> RED requires nothing — stopping work is not a completion", () => {
    assert.deepEqual(requiredWorkDetailFields("RED"), []);
  });
});

describe("SUPER ADMIN workflow is UNCHANGED by the assignee matrix", () => {
  // The regression guard for this stage. classifyTransition() is the only
  // rule a caller without `workflow: "assignee"` ever sees; every assertion
  // below is the behaviour that existed before the assignee matrix was added.
  it("still ranks RED < AMBER < GREEN", () => {
    assert.ok(STATUS_RANK.RED < STATUS_RANK.AMBER);
    assert.ok(STATUS_RANK.AMBER < STATUS_RANK.GREEN);
  });

  it("still allows RED -> GREEN in one step", () => {
    assert.equal(classifyTransition("RED", "GREEN"), "forward");
  });

  it("still REJECTS AMBER -> RED as backward", () => {
    // Deliberately opposite to the assignee rule above. Widening this for
    // assignees must not widen it for the Super Admin.
    assert.equal(classifyTransition("AMBER", "RED"), "backward");
  });

  it("still rejects every move out of GREEN as backward", () => {
    assert.equal(classifyTransition("GREEN", "AMBER"), "backward");
    assert.equal(classifyTransition("GREEN", "RED"), "backward");
  });

  it("still classifies forward moves as forward and same-status as noop", () => {
    assert.equal(classifyTransition("RED", "AMBER"), "forward");
    assert.equal(classifyTransition("AMBER", "GREEN"), "forward");
    for (const status of ALL_STATUSES) {
      assert.equal(classifyTransition(status, status), "noop");
    }
  });

  it("the two rule sets genuinely differ — this is not one rule wearing two names", () => {
    // If a refactor ever collapsed them, this fails.
    assert.notEqual(
      classifyTransition("AMBER", "RED") === "backward",
      classifyAssigneeTransition("AMBER", "RED") === "blocked"
    );
    assert.notEqual(
      classifyTransition("RED", "GREEN") === "forward",
      classifyAssigneeTransition("RED", "GREEN") === "allowed"
    );
  });
});
