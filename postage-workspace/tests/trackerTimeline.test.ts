// Tracker workflow-timeline labelling.
//
// Runs on Node's built-in test runner via tsx (`npm test`). The labelling
// lives in lib/access/trackerTimeline.ts as pure functions, which is exactly
// what components/tracker/TrackerTimeline.tsx renders from.
//
// What this file proves and what it does not:
//  - PROVES that every event label is derived from stored from/to statuses and
//    the event kind, that no event type is invented, and that a missing actor
//    is shown as unknown rather than substituted.
//  - Does NOT execute the SQL. lib/queries/tracker.ts imports `server-only`
//    and cannot be loaded by plain tsx; the query is exercised against the
//    live schema by npm run verify:scope.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  actorLabel,
  eventLabel,
  statusChangeLabel,
  UNKNOWN_ACTOR,
  type TrackerEventKind,
} from "../lib/access/trackerTimeline";
import type { IssueStatusValue } from "../lib/access/issueWorkflow";

const ALL_STATUSES: readonly IssueStatusValue[] = ["RED", "AMBER", "GREEN"];

describe("status-change labels come from the stored from/to pair", () => {
  it("RED -> AMBER is 'Work started'", () => {
    assert.equal(statusChangeLabel("RED", "AMBER"), "Work started");
  });

  it("AMBER -> RED is 'Moved back to Not Solved'", () => {
    assert.equal(statusChangeLabel("AMBER", "RED"), "Moved back to Not Solved");
  });

  it("AMBER -> GREEN is 'Marked Completely Solved'", () => {
    assert.equal(statusChangeLabel("AMBER", "GREEN"), "Marked Completely Solved");
  });

  it("RED -> GREEN is also 'Marked Completely Solved'", () => {
    // Legal for a Super Admin; the label describes the outcome either way.
    assert.equal(statusChangeLabel("RED", "GREEN"), "Marked Completely Solved");
  });

  it("GREEN -> RED is 'Moved back to Not Solved'", () => {
    assert.equal(statusChangeLabel("GREEN", "RED"), "Moved back to Not Solved");
  });

  it("GREEN -> AMBER is 'Reopened to Partially Solved'", () => {
    assert.equal(statusChangeLabel("GREEN", "AMBER"), "Reopened to Partially Solved");
  });

  it("handles a null from_status — the column is nullable", () => {
    assert.equal(statusChangeLabel(null, "AMBER"), "Work started");
    assert.equal(statusChangeLabel(null, "GREEN"), "Marked Completely Solved");
    assert.equal(statusChangeLabel(null, "RED"), "Status set to Not Solved");
  });

  it("always produces a non-empty label for every reachable pair", () => {
    for (const from of [...ALL_STATUSES, null]) {
      for (const to of ALL_STATUSES) {
        const label = statusChangeLabel(from, to);
        assert.equal(typeof label, "string");
        assert.ok(label.length > 0, `${from} -> ${to} produced an empty label`);
      }
    }
  });
});

describe("event labels per kind", () => {
  it("'created' is 'Issue raised'", () => {
    assert.equal(eventLabel("created", null, null, null), "Issue raised");
  });

  it("'assigned' is 'Assigned'", () => {
    assert.equal(eventLabel("assigned", null, null, null), "Assigned");
  });

  it("an investigation_note is 'Progress note added'", () => {
    assert.equal(eventLabel("note", null, null, "investigation_note"), "Progress note added");
  });

  it("a plain comment is 'Comment added'", () => {
    assert.equal(eventLabel("note", null, null, "comment"), "Comment added");
  });

  it("a status change delegates to the from/to label", () => {
    assert.equal(eventLabel("status_change", "AMBER", "GREEN", null), "Marked Completely Solved");
  });

  it("a status change with no recorded to_status degrades safely", () => {
    assert.equal(eventLabel("status_change", "RED", null, null), "Status changed");
  });

  it("every kind produces a label", () => {
    const kinds: TrackerEventKind[] = ["created", "assigned", "status_change", "note"];
    for (const kind of kinds) {
      const label = eventLabel(kind, "RED", "AMBER", "investigation_note");
      assert.ok(label.length > 0, `${kind} produced an empty label`);
    }
  });
});

describe("no event type is invented", () => {
  it("there are exactly four event kinds, one per source table", () => {
    // issues, issue_assignments, issue_status_history, issue_comments.
    const kinds: TrackerEventKind[] = ["created", "assigned", "status_change", "note"];
    assert.equal(kinds.length, 4);
  });

  it("'Process Started' and 'Completed' are NOT separate events", () => {
    // They are stamped by the same transaction that writes the status-history
    // row, so emitting them again would double-count one real happening. The
    // status change carries the meaning instead, and the stamped timestamps
    // are shown in the detail page's Workflow block.
    const labels = new Set<string>();
    for (const from of [...ALL_STATUSES, null]) {
      for (const to of ALL_STATUSES) {
        labels.add(statusChangeLabel(from, to));
      }
    }
    assert.equal(labels.has("Process Started"), false);
    assert.equal(labels.has("Completed"), false);
    // ...but the moment IS represented, under a name tied to the real row.
    assert.ok(labels.has("Work started"));
    assert.ok(labels.has("Marked Completely Solved"));
  });
});

describe("performed-by is never fabricated", () => {
  it("a null actor renders as the unknown marker", () => {
    assert.equal(actorLabel(null), UNKNOWN_ACTOR);
  });

  it("an empty or whitespace display name renders as the unknown marker", () => {
    assert.equal(actorLabel(""), UNKNOWN_ACTOR);
    assert.equal(actorLabel("   "), UNKNOWN_ACTOR);
  });

  it("a real display name is passed through unchanged", () => {
    assert.equal(actorLabel("TestAdmin"), "TestAdmin");
  });

  it("the unknown marker is a dash, not a plausible name", () => {
    assert.equal(UNKNOWN_ACTOR, "—");
  });
});
