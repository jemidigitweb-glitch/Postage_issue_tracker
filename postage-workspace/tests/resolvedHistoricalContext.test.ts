// The resolved-issues-only rule for Gemini historical context.
//
// The AI may only be given PREVIOUSLY COMPLETED Issues as background evidence.
// An unresolved Issue must be excluded BEFORE ranking, so no amount of
// similarity can promote a guess into the model's context.
//
// No network, no database, no Gemini. The SQL predicate itself is asserted by
// reading the retrieval module's source, because the filter lives in SQL — a
// fake in-memory corpus could only test a re-implementation of it, which would
// prove nothing about what the database actually returns.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildAnalysisPrompt, MAX_SIMILAR_FOR_ANALYSIS } from "../lib/ai/analysisFlow";
import {
  sanitizeHistoricalIssueForAi,
  sanitizeIssueForAi,
  type SanitizedHistoricalIssueForAi,
} from "../lib/access/aiSanitization";

const ROOT = join(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
function codeOnly(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

const RETRIEVAL = codeOnly("lib/ai/similarIssueRetrieval.ts");

const SUBJECT = sanitizeIssueForAi({
  title: "Barcode missing from printed shipping label",
  description: "The printed label shows a blank barcode block.",
  category: "postage",
  priority: "high",
  resolution: null,
  extraData: {},
});

/** A resolved candidate as the retrieval layer would produce it: confirmed
 *  outcome, and NO intake-time proposal (that column is not even selected). */
function resolvedContext(overrides: { issueId?: string; finalResolution?: string } = {}) {
  return sanitizeHistoricalIssueForAi({
    issueId: overrides.issueId ?? "AA-001",
    title: "Label printed without a barcode",
    category: "postage",
    resolution: null,
    finalResolution: overrides.finalResolution ?? "Billing account corrected and label reprinted.",
    extraData: { rootCause: "Billing account was wrong." },
  });
}

// ---------------------------------------------------------------------------
// The predicate
// ---------------------------------------------------------------------------

describe("the resolved predicate is enforced in SQL, before ranking", () => {
  it("requires status GREEN", () => {
    assert.ok(RETRIEVAL.includes("i.status = 'GREEN'"));
  });

  it("requires a non-empty final_resolution", () => {
    assert.ok(RETRIEVAL.includes("i.final_resolution IS NOT NULL"));
    assert.ok(RETRIEVAL.includes("btrim(i.final_resolution) <> ''"));
  });

  it("requires a completion timestamp", () => {
    assert.ok(RETRIEVAL.includes("i.completed_at IS NOT NULL"));
  });

  it("applies the predicate inside the candidate query, not afterwards", () => {
    assert.ok(
      RETRIEVAL.includes("AND ${RESOLVED_PREDICATE}"),
      "the predicate must be part of the WHERE clause"
    );
  });

  it("never admits RED or AMBER — the only status accepted is GREEN", () => {
    assert.equal(/status\s*=\s*'RED'/.test(RETRIEVAL), false);
    assert.equal(/status\s*=\s*'AMBER'/.test(RETRIEVAL), false);
    assert.equal(/status\s*(<>|!=)\s*'GREEN'/.test(RETRIEVAL), false);
    const statusComparisons = RETRIEVAL.match(/i\.status\s*=\s*'[A-Z]+'/g) ?? [];
    assert.deepEqual(statusComparisons, ["i.status = 'GREEN'"]);
  });

  it("does not fetch the intake-time resolution at all", () => {
    // Not selected, so it cannot be used as a fallback outcome even by
    // accident — the sanitizer receives null for it.
    assert.equal(RETRIEVAL.includes("i.resolution,"), false);
    assert.ok(RETRIEVAL.includes("resolution: null"));
  });

  it("still excludes the subject Issue and stays inside the frozen corpus", () => {
    assert.ok(RETRIEVAL.includes("i.issue_id <> $3"));
    assert.ok(RETRIEVAL.includes("i.created_at >= $1::timestamptz"));
    assert.ok(RETRIEVAL.includes("i.created_at <  $2::timestamptz"));
  });

  it("remains read-only", () => {
    const upper = RETRIEVAL.toUpperCase();
    for (const statement of ["INSERT INTO", "UPDATE ", "DELETE FROM", "COMMIT"]) {
      assert.equal(upper.includes(statement), false, `retrieval contains ${statement}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Slot behaviour — never backfilled
// ---------------------------------------------------------------------------

describe("context slots are never padded with unresolved Issues", () => {
  it("0 resolved matches → no background section at all", () => {
    const prompt = buildAnalysisPrompt(SUBJECT, []);
    assert.equal(prompt.includes("BACKGROUND EVIDENCE"), false);
    assert.equal(prompt.includes("Past Context"), false);
  });

  it("1 resolved match → exactly one context", () => {
    const prompt = buildAnalysisPrompt(SUBJECT, [resolvedContext()]);
    assert.ok(prompt.includes("Past Context A"));
    assert.equal(prompt.includes("Past Context B"), false);
  });

  it("3 resolved matches → the strongest two only", () => {
    const three = [
      resolvedContext({ issueId: "AA-001" }),
      resolvedContext({ issueId: "AA-002" }),
      resolvedContext({ issueId: "AA-003" }),
    ];
    const prompt = buildAnalysisPrompt(SUBJECT, three);
    assert.ok(prompt.includes("Past Context A"));
    assert.ok(prompt.includes("Past Context B"));
    assert.equal(prompt.includes("Past Context C"), false);
    assert.equal(MAX_SIMILAR_FOR_ANALYSIS, 2);
  });
});

// ---------------------------------------------------------------------------
// Resolution semantics
// ---------------------------------------------------------------------------

describe("resolution semantics", () => {
  it("uses final_resolution as the confirmed outcome", () => {
    const context = resolvedContext({ finalResolution: "Account corrected; barcode verified." });
    assert.equal(context.priorActionOrResolution, "Account corrected; barcode verified.");
    const prompt = buildAnalysisPrompt(SUBJECT, [context]);
    assert.ok(prompt.includes("Confirmed resolution: Account corrected; barcode verified."));
  });

  it("labels the section as previously COMPLETED Issues", () => {
    const prompt = buildAnalysisPrompt(SUBJECT, [resolvedContext()]);
    assert.ok(prompt.includes("previously COMPLETED Issues with confirmed resolutions"));
  });

  it("never presents an intake-time proposal as a confirmed resolution", () => {
    // What the retrieval layer produces: resolution null, so nothing can fall
    // back to it.
    const context = sanitizeHistoricalIssueForAi({
      issueId: "AA-009",
      title: "Some past Issue",
      category: "postage",
      resolution: "INTAKE-PROPOSAL-SHOULD-NEVER-APPEAR",
      finalResolution: "The real confirmed outcome.",
      extraData: {},
    });
    assert.equal(context.priorActionOrResolution, "The real confirmed outcome.");
    const prompt = buildAnalysisPrompt(SUBJECT, [context]);
    assert.equal(prompt.includes("INTAKE-PROPOSAL-SHOULD-NEVER-APPEAR"), false);
  });

  it("still marks a past root cause as unconfirmed — it was recorded at intake", () => {
    const prompt = buildAnalysisPrompt(SUBJECT, [resolvedContext()]);
    assert.ok(prompt.includes("Root cause recorded at the time (unconfirmed)"));
  });
});

// ---------------------------------------------------------------------------
// Privacy is unchanged by this correction
// ---------------------------------------------------------------------------

describe("resolved context is still hidden and still de-identified", () => {
  const contexts: SanitizedHistoricalIssueForAi[] = [
    resolvedContext({ issueId: "ND-011" }),
    resolvedContext({ issueId: "SA-009" }),
  ];

  it("sends no real Issue identifier", () => {
    const prompt = buildAnalysisPrompt(SUBJECT, contexts);
    assert.equal(prompt.includes("ND-011"), false);
    assert.equal(prompt.includes("SA-009"), false);
  });

  it("renders no historical section in the UI", () => {
    const panel = codeOnly("components/issues/IssueAiAssistant.tsx");
    for (const forbidden of [
      "Similar Past Issues",
      "Resolved Issues",
      "similarIssues",
      "referenceLabel",
      "Past Context",
    ]) {
      assert.equal(panel.includes(forbidden), false, `panel renders "${forbidden}"`);
    }
  });

  it("retrieval still happens only on the AI request, never on page render", () => {
    const page = codeOnly("app/dashboard/issues/[issueId]/page.tsx");
    assert.equal(page.includes("findSimilarPastIssues"), false);
    const action = codeOnly("app/dashboard/issues/ai-actions.ts");
    assert.ok(action.includes("findSimilarPastIssues("));
  });

  it("authorization is unchanged for both portals", () => {
    const action = codeOnly("app/dashboard/issues/ai-actions.ts");
    assert.ok(action.includes('"issue:analyse_any"'));
    assert.ok(action.includes('"issue:analyse_own_assigned"'));
    assert.ok(action.includes("getIssueById(issueId, scope)"));
    assert.ok(action.includes('scope.kind !== "assignee"'));
  });

  it("the AI path still writes nothing", () => {
    const action = codeOnly("app/dashboard/issues/ai-actions.ts").toUpperCase();
    for (const statement of ["INSERT INTO", "UPDATE ", "DELETE FROM", "REVALIDATEPATH"]) {
      assert.equal(action.includes(statement), false, `action contains ${statement}`);
    }
  });
});
