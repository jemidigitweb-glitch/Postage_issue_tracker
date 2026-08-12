// Super Admin Issue-detail markup — the regression half of the Stage 6 scope
// correction.
//
// tests/issueDetailView.test.ts proves the DECISION (which sections each role
// gets). This file proves the MARKUP: it actually renders
// components/issues/IssueDetail.tsx with react-dom/server and asserts that the
// Super Admin's output contains none of the Stage 6 additions, and that the
// optional props added for the Assignee are completely inert when omitted.
//
// Why this component and not the whole page: IssueDetail is a plain Server
// Component whose only runtime imports are IssueStatusBadge and
// IssuePriorityBadge (both plain too) — no `server-only`, no `next/*`, no
// database, no Server Action — so it renders in a bare Node test. The
// Assignee-only blocks that sit AROUND it on the page
// (AssigneeStatusControl, IssueWorkProgress) pull in "use client" modules and
// a "use server" action, which cannot be rendered outside Next; those are
// covered by the pure view-decision test instead.
//
// Written with React.createElement rather than JSX so the file stays a .ts
// and is picked up by the existing `tests/*.test.ts` glob.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import IssueDetail from "../components/issues/IssueDetail";
import type { IssueDetail as IssueDetailData } from "../lib/queries/issues";

// A fully-populated Issue: every Stage 6 work field carries a distinctive
// value, so if any of them ever leaked into the Super Admin's markup the
// assertions below would catch the value itself, not just a heading.
const PROGRESS = "STAGE6_PROGRESS_SENTINEL";
const DONE = "STAGE6_DONE_SENTINEL";
const FINAL = "STAGE6_FINAL_SENTINEL";
const FIX_AND_ACTION = "HISTORICAL_FIX_AND_ACTION_SENTINEL";

const ISSUE: IssueDetailData = {
  issueId: "ND-001",
  title: "Missing Sendungsnummer on a Trossingen label",
  description: "The DHL label printed without a tracking barcode.",
  staffCode: "ND",
  staffName: "Nanthi",
  status: "AMBER",
  priority: "high",
  category: "postage",
  createdDate: "2026-06-26",
  updatedAt: "2026-08-12T09:15:00Z",
  extraData: { member: "Laksika", rootCause: "Wrong billing account selected." },
  deletedAt: null,
  resolution: FIX_AND_ACTION,
  work: {
    implementationProgress: PROGRESS,
    implementationDone: DONE,
    finalResolution: FINAL,
    processStartedAt: "2026-08-12T08:00:00Z",
    completedAt: "2026-08-12T09:00:00Z",
    completedDate: "2026-08-12",
  },
};

/** What the Super Admin's detail page passes: neither optional prop. */
function renderAsAdmin(): string {
  return renderToStaticMarkup(createElement(IssueDetail, { issue: ISSUE }));
}

/** What the Assignee's detail page passes. */
function renderAsAssignee(): string {
  return renderToStaticMarkup(
    createElement(IssueDetail, {
      issue: ISSUE,
      assignedToName: "Rajive",
      fixAndActionRequired: ISSUE.resolution,
    })
  );
}

describe("Super Admin markup — no Stage 6 additions", () => {
  const markup = renderAsAdmin();

  // Every heading the correction is required to remove from this page.
  const FORBIDDEN_HEADINGS = [
    "Work Progress",
    "Process Started",
    "Completed",
    "Implementation In Progress",
    "Implementation Done",
    "Final Resolution",
    "Save progress",
    "Save status",
    "Work Log",
    "Change status to",
    "Assigned To",
    "Fix &amp; Action Required",
  ];

  for (const heading of FORBIDDEN_HEADINGS) {
    it(`does not render "${heading}"`, () => {
      assert.equal(markup.includes(heading), false, `found "${heading}" in the Super Admin markup`);
    });
  }

  // And none of the underlying VALUES, in case a heading is ever renamed.
  for (const [name, value] of [
    ["implementation_progress", PROGRESS],
    ["implementation_done", DONE],
    ["final_resolution", FINAL],
    ["resolution (Fix & Action Required)", FIX_AND_ACTION],
  ] as const) {
    it(`does not leak the ${name} value`, () => {
      assert.equal(markup.includes(value), false, `found the ${name} value in the Super Admin markup`);
    });
  }
});

describe("Super Admin markup — original content is intact", () => {
  const markup = renderAsAdmin();

  const EXPECTED = [
    "ND-001",
    "Missing Sendungsnummer on a Trossingen label",
    "Raised By",
    "Nanthi",
    "Date Raised",
    "26/06/2026",
    "Domain",
    "postage",
    "Member",
    "Laksika",
    "Updated",
    "12/08/2026 09:15 UTC",
    "Description",
    "The DHL label printed without a tracking barcode.",
    "Additional details",
    "Root Cause",
    "Wrong billing account selected.",
    "AMBER",
    "high",
  ];

  for (const fragment of EXPECTED) {
    it(`still renders "${fragment}"`, () => {
      assert.ok(markup.includes(fragment), `missing "${fragment}" from the Super Admin markup`);
    });
  }
});

describe("the Assignee-only props are inert when omitted", () => {
  it("passing them as undefined is byte-identical to omitting them", () => {
    const omitted = renderAsAdmin();
    const explicitlyUndefined = renderToStaticMarkup(
      createElement(IssueDetail, {
        issue: ISSUE,
        assignedToName: undefined,
        fixAndActionRequired: undefined,
      })
    );
    assert.equal(explicitlyUndefined, omitted);
  });

  it("null is treated as 'not supplied' too — no empty section is rendered", () => {
    // The page passes `undefined` for a Super Admin, but a future call site
    // could pass a nullish value; it must not produce an empty heading.
    const withNulls = renderToStaticMarkup(
      createElement(IssueDetail, {
        issue: ISSUE,
        assignedToName: null,
        fixAndActionRequired: null,
      })
    );
    assert.equal(withNulls.includes("Assigned To"), false);
    assert.equal(withNulls.includes("Fix &amp; Action Required"), false);
  });
});

describe("Assignee markup — the extra blocks appear only when asked for", () => {
  const markup = renderAsAssignee();

  it("renders Assigned To with the assignee's name", () => {
    assert.ok(markup.includes("Assigned To"));
    assert.ok(markup.includes("Rajive"));
  });

  it("renders Fix & Action Required from issues.resolution", () => {
    assert.ok(markup.includes("Fix &amp; Action Required"));
    assert.ok(markup.includes(FIX_AND_ACTION));
  });

  it("still does NOT render the work-progress fields — those live in IssueWorkProgress", () => {
    // Proves the two components stay separated: IssueDetail never duplicates
    // the Stage 6 block, so gating that block gates all of it.
    assert.equal(markup.includes("Work Progress"), false);
    assert.equal(markup.includes(PROGRESS), false);
    assert.equal(markup.includes(DONE), false);
    assert.equal(markup.includes(FINAL), false);
  });

  it("shows the same core content the Super Admin sees", () => {
    const adminMarkup = renderAsAdmin();
    for (const fragment of ["ND-001", "Raised By", "Nanthi", "Description", "Additional details"]) {
      assert.ok(markup.includes(fragment));
      assert.ok(adminMarkup.includes(fragment));
    }
  });
});
