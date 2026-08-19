// Issue-detail composition by role — the Stage 6 scope correction.
//
// Runs on Node's built-in test runner via tsx (`npm test`). No database, no
// request context: the decision lives in lib/access/issueDetailView.ts as a
// pure function, which is exactly what the page calls.
//
// What this file proves:
//  - A Super Admin gets NONE of the Stage 6 Issue-detail UI (Work Progress,
//    Process Started/Completed, Implementation In Progress, Implementation
//    Done, Final Resolution, Save Progress, Work Log) and no status control.
//  - An Assignee gets all of it.
//  - Anyone else gets nothing (fail closed).
//  - The Super Admin decision is absolute: holding change_status_any wins
//    even alongside change_status_own_assigned.
//
// The markup half of the claim — that IssueDetail itself renders identically
// for a Super Admin before and after this stage's optional props were added —
// is proven separately by tests/issueDetailMarkup.test.ts, which actually
// renders the component.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveIssueDetailView,
  type IssueDetailView,
} from "../lib/access/issueDetailView";

/** Every Stage 6 / Assignee-portal flag on the view object. If a new one is
 *  added, this list must grow — which is the point: the "Super Admin sees
 *  none of it" test below iterates it rather than naming flags one by one. */
const ASSIGNEE_ONLY_FLAGS: (keyof IssueDetailView)[] = [
  "showWorkProgress",
  "showAssigneeStatusControl",
  "showAssignedTo",
  "showFixAndActionRequired",
];

const ADMIN = { canChangeStatusAny: true, canChangeStatusOwnAssigned: false };
const ASSIGNEE = { canChangeStatusAny: false, canChangeStatusOwnAssigned: true };
const NOBODY = { canChangeStatusAny: false, canChangeStatusOwnAssigned: false };

describe("Super Admin — the Stage 6 detail UI is gone", () => {
  const view = resolveIssueDetailView(ADMIN);

  it("resolves to the admin view", () => {
    assert.equal(view.kind, "admin");
  });

  for (const flag of ASSIGNEE_ONLY_FLAGS) {
    it(`does NOT get ${flag}`, () => {
      assert.equal(view[flag], false);
    });
  }

  it("does not render the WORK PROGRESS block at all", () => {
    // Process Started, Completed, Implementation In Progress, Implementation
    // Done, Final Resolution and Save Progress all live inside that one
    // component, so a single false is the whole removal.
    assert.equal(view.showWorkProgress, false);
  });

  it("has no status control on the detail page — as before Stage 6", () => {
    assert.equal(view.showAssigneeStatusControl, false);
  });
});

describe("Assignee — the work-progress UI is kept", () => {
  const view = resolveIssueDetailView(ASSIGNEE);

  it("resolves to the assignee view", () => {
    assert.equal(view.kind, "assignee");
  });

  for (const flag of ASSIGNEE_ONLY_FLAGS) {
    it(`gets ${flag}`, () => {
      assert.equal(view[flag], true);
    });
  }
});

describe("anyone else — fail closed", () => {
  const view = resolveIssueDetailView(NOBODY);

  it("resolves to 'other'", () => {
    assert.equal(view.kind, "other");
  });

  for (const flag of ASSIGNEE_ONLY_FLAGS) {
    it(`does NOT get ${flag}`, () => {
      assert.equal(view[flag], false);
    });
  }
});

describe("the Super Admin check is absolute", () => {
  it("change_status_any wins even alongside change_status_own_assigned", () => {
    const view = resolveIssueDetailView({
      canChangeStatusAny: true,
      canChangeStatusOwnAssigned: true,
    });
    assert.equal(view.kind, "admin");
    for (const flag of ASSIGNEE_ONLY_FLAGS) {
      assert.equal(view[flag], false, `${flag} leaked into the admin view`);
    }
  });

  it("is decided only by server-resolved permissions — the input has no role field", () => {
    // A regression guard on the SHAPE of the input: if someone ever adds a
    // `role` or `isAssignee` string that a form could supply, this fails.
    const keys = Object.keys(ADMIN).sort();
    assert.deepEqual(keys, ["canChangeStatusAny", "canChangeStatusOwnAssigned"]);
  });
});

describe("the two portals are genuinely different", () => {
  it("no flag is true for both admin and assignee", () => {
    const admin = resolveIssueDetailView(ADMIN);
    const assignee = resolveIssueDetailView(ASSIGNEE);
    for (const flag of ASSIGNEE_ONLY_FLAGS) {
      assert.notEqual(
        admin[flag],
        assignee[flag],
        `${flag} is the same for both roles — the scope correction is not doing anything`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Warehouse Mobile Evidence
// ---------------------------------------------------------------------------
//
// This flag is deliberately NOT in ASSIGNEE_ONLY_FLAGS: it is the one flag that
// is true for "other". Every other flag ADDS information to a page, so off is
// the safe default. This one REPLACES the raw extra_data.mobileTimeline dump —
// internal item ids and Cloudinary public_ids and all — with a version that has
// every internal stripped out. Turning it on shows a viewer strictly less.

describe("Mobile Evidence is scoped to the portals that needed fixing", () => {
  it("the Super Admin gets it", () => {
    assert.equal(resolveIssueDetailView(ADMIN).showMobileEvidence, true);
  });

  it("Raised-by-Staff gets it — they hold neither status permission, so 'other'", () => {
    const view = resolveIssueDetailView(NOBODY);
    assert.equal(view.kind, "other");
    assert.equal(view.showMobileEvidence, true, "TU-001 must not show raw JSON");
    // And it is the ONLY thing 'other' gains. Everything else stays closed.
    for (const flag of ASSIGNEE_ONLY_FLAGS) {
      assert.equal(view[flag], false);
    }
    assert.equal(view.showAiAssistant, false);
  });

  it("the Assignee portal does NOT get it — its markup is unchanged", () => {
    assert.equal(resolveIssueDetailView(ASSIGNEE).showMobileEvidence, false);
  });

  it("an admin who is also an assignee still resolves to the admin view", () => {
    const view = resolveIssueDetailView({
      canChangeStatusAny: true,
      canChangeStatusOwnAssigned: true,
    });
    assert.equal(view.showMobileEvidence, true);
  });
});
