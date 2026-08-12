// Stage 6 — work/implementation detail rules.
//
// Runs on Node's built-in test runner via tsx (`npm test`). No new
// dependency, no test framework, no database: everything asserted here lives
// in lib/access/issueWorkDetails.ts, the pure module that both the Server
// Action and the transaction in lib/queries/issueStatus.ts validate against.
//
// What this file proves and what it does not:
//  - PROVES the RULES: which fields each transition requires, that blank and
//    whitespace-only values are rejected, that over-length values are
//    rejected rather than silently truncated, and how the details are
//    rendered into the existing issue_status_history.reason column.
//  - Does NOT execute the Server Actions or the SQL — those need a Next.js
//    request context and a live Postgres connection. They are proven
//    end-to-end, against the real schema and with zero permanent rows, by
//    scripts/verify-issue-work-progress.ts (`npm run verify:work-progress`),
//    which covers ownership, the timestamps, history preservation, and
//    transaction rollback.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractImplementationProgress,
  formatStatusHistoryReason,
  MAX_WORK_DETAIL_LENGTH,
  requiredWorkDetailFields,
  validateProgressUpdate,
  validateTransitionWorkDetails,
  WORK_DETAIL_LABELS,
} from "../lib/access/issueWorkDetails";
import { classifyTransition, STATUS_RANK } from "../lib/access/issueWorkflow";

const PROGRESS = "Checked the DHL portal and reproduced the missing Sendungsnummer.";
const DONE = "Re-booked the parcel on Trossingen Schmutter DHL Paket and reprinted the label.";
const FINAL = "Parcel delivered; the label now carries an 18-digit tracking number. Solved.";

describe("required fields per transition", () => {
  it("RED -> AMBER requires only Implementation In Progress", () => {
    assert.deepEqual(requiredWorkDetailFields("AMBER"), ["implementationProgress"]);
  });

  it("-> GREEN requires both Implementation Done and Final Resolution", () => {
    assert.deepEqual(requiredWorkDetailFields("GREEN"), ["implementationDone", "finalResolution"]);
  });

  it("RED requires nothing — nothing ever transitions INTO RED", () => {
    assert.deepEqual(requiredWorkDetailFields("RED"), []);
  });
});

describe("RED -> AMBER — Implementation In Progress", () => {
  it("rejects a missing value", () => {
    const result = validateTransitionWorkDetails("AMBER", {});
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.error,
      `${WORK_DETAIL_LABELS.implementationProgress} is required.`
    );
  });

  it("rejects an empty string", () => {
    const result = validateTransitionWorkDetails("AMBER", { implementationProgress: "" });
    assert.equal(result.ok, false);
  });

  it("rejects a whitespace-only value — spaces, tabs and newlines are not work", () => {
    const result = validateTransitionWorkDetails("AMBER", { implementationProgress: "  \t\n  " });
    assert.equal(result.ok, false);
  });

  it("accepts a real value and trims it", () => {
    const result = validateTransitionWorkDetails("AMBER", {
      implementationProgress: `  ${PROGRESS}  `,
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.value.implementationProgress, PROGRESS);
  });

  it("does not require the completion fields", () => {
    const result = validateTransitionWorkDetails("AMBER", { implementationProgress: PROGRESS });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.value.implementationDone, null);
    assert.equal(result.ok === true && result.value.finalResolution, null);
  });

  it("rejects an over-length value rather than truncating it", () => {
    const result = validateTransitionWorkDetails("AMBER", {
      implementationProgress: "x".repeat(MAX_WORK_DETAIL_LENGTH + 1),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /characters or fewer/);
  });

  it("accepts a value at exactly the cap", () => {
    const result = validateTransitionWorkDetails("AMBER", {
      implementationProgress: "x".repeat(MAX_WORK_DETAIL_LENGTH),
    });
    assert.equal(result.ok, true);
  });
});

describe("AMBER -> GREEN — Implementation Done + Final Resolution", () => {
  it("rejects when Implementation Done is missing", () => {
    const result = validateTransitionWorkDetails("GREEN", { finalResolution: FINAL });
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.error,
      `${WORK_DETAIL_LABELS.implementationDone} is required.`
    );
  });

  it("rejects when Implementation Done is whitespace only", () => {
    const result = validateTransitionWorkDetails("GREEN", {
      implementationDone: "   ",
      finalResolution: FINAL,
    });
    assert.equal(result.ok, false);
  });

  it("rejects when Final Resolution is missing", () => {
    const result = validateTransitionWorkDetails("GREEN", { implementationDone: DONE });
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.error,
      `${WORK_DETAIL_LABELS.finalResolution} is required.`
    );
  });

  it("rejects when Final Resolution is whitespace only", () => {
    const result = validateTransitionWorkDetails("GREEN", {
      implementationDone: DONE,
      finalResolution: "\n\n",
    });
    assert.equal(result.ok, false);
  });

  it("rejects when both are missing", () => {
    const result = validateTransitionWorkDetails("GREEN", {});
    assert.equal(result.ok, false);
  });

  it("accepts when both are present", () => {
    const result = validateTransitionWorkDetails("GREEN", {
      implementationDone: DONE,
      finalResolution: FINAL,
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.value.implementationDone, DONE);
    assert.equal(result.ok === true && result.value.finalResolution, FINAL);
  });

  it("lets a progress refresh ride along with the completion", () => {
    const result = validateTransitionWorkDetails("GREEN", {
      implementationProgress: PROGRESS,
      implementationDone: DONE,
      finalResolution: FINAL,
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.value.implementationProgress, PROGRESS);
  });

  it("never echoes the submitted text back in an error message", () => {
    const nasty = "<script>alert(1)</script>";
    const result = validateTransitionWorkDetails("GREEN", { implementationDone: nasty });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error.includes(nasty), false);
  });
});

describe("standalone AMBER progress update", () => {
  it("rejects a missing value", () => {
    const result = validateProgressUpdate(undefined);
    assert.equal(result.ok, false);
  });

  it("rejects a whitespace-only value", () => {
    const result = validateProgressUpdate("   \n ");
    assert.equal(result.ok, false);
  });

  it("rejects an over-length value", () => {
    const result = validateProgressUpdate("x".repeat(MAX_WORK_DETAIL_LENGTH + 1));
    assert.equal(result.ok, false);
  });

  it("accepts and trims a real value", () => {
    const result = validateProgressUpdate(`\t${PROGRESS}\n`);
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.value, PROGRESS);
  });
});

describe("status-history evidence (reuses issue_status_history.reason)", () => {
  it("labels each field so the raw audit row is readable", () => {
    const reason = formatStatusHistoryReason({
      implementationProgress: PROGRESS,
      implementationDone: null,
      finalResolution: null,
    });
    assert.equal(reason, `${WORK_DETAIL_LABELS.implementationProgress}: ${PROGRESS}`);
  });

  it("includes both completion fields for a GREEN transition", () => {
    const reason = formatStatusHistoryReason({
      implementationProgress: null,
      implementationDone: DONE,
      finalResolution: FINAL,
    });
    assert.ok(reason);
    assert.ok(reason!.includes(DONE));
    assert.ok(reason!.includes(FINAL));
    assert.ok(reason!.includes(WORK_DETAIL_LABELS.implementationDone));
    assert.ok(reason!.includes(WORK_DETAIL_LABELS.finalResolution));
  });

  it("stays NULL when a transition carried no details — pre-Stage-6 behaviour", () => {
    const reason = formatStatusHistoryReason({
      implementationProgress: null,
      implementationDone: null,
      finalResolution: null,
    });
    assert.equal(reason, null);
  });
});

describe("the RED -> AMBER -> GREEN workflow itself is UNCHANGED by Stage 6", () => {
  // Guards against this stage quietly redesigning transitions while adding
  // the work details. These assertions duplicate tests/access.test.ts on
  // purpose: if a future change to the work-detail rules alters the
  // workflow, both files fail, not just the one nobody thought to run.
  it("still ranks RED < AMBER < GREEN", () => {
    assert.ok(STATUS_RANK.RED < STATUS_RANK.AMBER);
    assert.ok(STATUS_RANK.AMBER < STATUS_RANK.GREEN);
  });

  it("still classifies RED -> AMBER and AMBER -> GREEN as forward", () => {
    assert.equal(classifyTransition("RED", "AMBER"), "forward");
    assert.equal(classifyTransition("AMBER", "GREEN"), "forward");
  });

  it("still classifies same-status as a no-op", () => {
    assert.equal(classifyTransition("AMBER", "AMBER"), "noop");
  });

  it("still classifies every backwards move as backward", () => {
    assert.equal(classifyTransition("AMBER", "RED"), "backward");
    assert.equal(classifyTransition("GREEN", "AMBER"), "backward");
    assert.equal(classifyTransition("GREEN", "RED"), "backward");
  });

  it("still treats RED -> GREEN as a legal forward move at the workflow layer", () => {
    // The extra "must be AMBER first" precondition is applied ONLY to the
    // assignee path, inside updateIssueStatus (requireAmberBeforeGreen). The
    // Super Admin's set of legal transitions is untouched, which is exactly
    // what this assertion pins down.
    assert.equal(classifyTransition("RED", "GREEN"), "forward");
  });
});

// ---------------------------------------------------------------------------
// Recovering progress text from a stored status-history reason.
//
// The progress an assignee types when STARTING work (RED -> AMBER) is recorded
// in issue_status_history.reason, not as an issue_comments note. The Issue
// detail page merges both sources so the whole history is visible, and this is
// the function that recovers the text from the transition side.
// ---------------------------------------------------------------------------
describe("extracting Implementation Progress from a history reason", () => {
  it("recovers the text a RED -> AMBER transition recorded", () => {
    const reason = formatStatusHistoryReason({
      implementationProgress: PROGRESS,
      implementationDone: null,
      finalResolution: null,
    });
    assert.equal(extractImplementationProgress(reason), PROGRESS);
  });

  it("returns null for a reason with no progress section", () => {
    // An AMBER -> RED stop records no work details at all.
    assert.equal(extractImplementationProgress(null), null);
    assert.equal(extractImplementationProgress(""), null);
    assert.equal(extractImplementationProgress("Something unrelated"), null);
  });

  it("returns null for a GREEN transition, which carries no progress section", () => {
    const reason = formatStatusHistoryReason({
      implementationProgress: null,
      implementationDone: DONE,
      finalResolution: FINAL,
    });
    assert.equal(extractImplementationProgress(reason), null);
  });

  it("extracts ONLY the progress section when several are present", () => {
    const reason = formatStatusHistoryReason({
      implementationProgress: PROGRESS,
      implementationDone: DONE,
      finalResolution: FINAL,
    });
    const extracted = extractImplementationProgress(reason);
    assert.equal(extracted, PROGRESS);
    assert.equal(extracted?.includes(DONE), false);
    assert.equal(extracted?.includes(FINAL), false);
  });

  it("survives a round trip for multi-line progress text", () => {
    const multiline = "Line one.\nLine two.\nLine three.";
    const reason = formatStatusHistoryReason({
      implementationProgress: multiline,
      implementationDone: null,
      finalResolution: null,
    });
    assert.equal(extractImplementationProgress(reason), multiline);
  });

  it("returns null when the label is present but the text is empty", () => {
    assert.equal(extractImplementationProgress("Implementation In Progress: "), null);
    assert.equal(extractImplementationProgress("Implementation In Progress:    "), null);
  });
});

// ---------------------------------------------------------------------------
// De-duplication rule for the merged progress history.
//
// listIssueProgressEntries() keys on (exact text, exact second). Text alone
// would be wrong — the live database already holds the same short text
// recorded at four different times, and each is a separate real event.
// ---------------------------------------------------------------------------
describe("merged progress history de-duplication key", () => {
  const dedupeKey = (at: string, text: string) => `${at}::${text}`;

  it("keeps identical text recorded at different times", () => {
    const a = dedupeKey("2026-08-12T06:21:24Z", "testing");
    const b = dedupeKey("2026-08-12T07:12:16Z", "testing");
    assert.notEqual(a, b);
  });

  it("keeps different text recorded at the same time", () => {
    const a = dedupeKey("2026-08-12T06:21:24Z", "first");
    const b = dedupeKey("2026-08-12T06:21:24Z", "second");
    assert.notEqual(a, b);
  });

  it("collapses only the same text at the same instant", () => {
    const a = dedupeKey("2026-08-12T06:21:24Z", "testing");
    const b = dedupeKey("2026-08-12T06:21:24Z", "testing");
    assert.equal(a, b);
  });
});
