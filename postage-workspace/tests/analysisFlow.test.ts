// Gemini Stage 4 — the Assignee AI flow: gates, prompt contract, neutral
// labelling, and response handling.
//
// EVERY test uses a FAKE sender that records its calls. No test constructs the
// SDK, reads GEMINI_API_KEY, opens a socket, or consumes API quota. The
// recording is what proves the "no request was made" claims.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ANALYSIS_SYSTEM_INSTRUCTIONS,
  BLOCKED_MESSAGES,
  buildAnalysisPrompt,
  MAX_SIMILAR_FOR_ANALYSIS,
  pastContextLabelFor,
  runIssueAnalysis,
  type AnalysisSender,
} from "../lib/ai/analysisFlow";
import { HUMAN_VERIFICATION_WARNING } from "../lib/ai/analysisSchema";
import {
  sanitizeHistoricalIssueForAi,
  sanitizeIssueForAi,
  type SanitizedHistoricalIssueForAi,
} from "../lib/access/aiSanitization";
import { hasMeaningfulOverlap, rankHistoricalCandidates, scoreBreakdown } from "../lib/ai/similarityRanking";
import type { GeminiFeatureStatus } from "../lib/ai/geminiPolicy";

// ---------------------------------------------------------------------------
// Fixtures (synthetic)
// ---------------------------------------------------------------------------

function status(overrides: Partial<GeminiFeatureStatus> = {}): GeminiFeatureStatus {
  return {
    enabled: true,
    configured: true,
    model: "gemini-3.6-flash",
    allowRealIssueData: true,
    ...overrides,
  };
}

const ISSUE = sanitizeIssueForAi({
  title: "Barcode missing from printed shipping label",
  description: "The printed label shows a blank barcode block.",
  category: "postage",
  priority: "high",
  resolution: "Reprint after confirming the billing account.",
  extraData: {
    whatIsHappening: "Labels print but the barcode block is empty.",
    rootCause: "Wrong billing account selected.",
    member: "Laksika",
    dataLink: "https://dashboard.internal.example/x",
  },
});

const HISTORY: SanitizedHistoricalIssueForAi[] = [
  sanitizeHistoricalIssueForAi({
    issueId: "ND-011",
    title: "Label printed without barcode",
    category: "postage",
    resolution: "Reprint the label.",
    finalResolution: null,
    extraData: { rootCause: "Billing account was wrong." },
  }),
  sanitizeHistoricalIssueForAi({
    issueId: "SA-009",
    title: "Blank barcode area on label",
    category: "postage",
    resolution: null,
    finalResolution: "Billing account corrected.",
    extraData: { rootCause: null },
  }),
];

function validResponse(): string {
  return JSON.stringify({
    summary: "Labels are printing without a barcode block.",
    likelyRootCauses: [
      { cause: "Wrong billing account.", whyLikely: "The intake note records it.", confidence: "MEDIUM" },
    ],
    confidence: "MEDIUM",
    areasToCheck: [
      { area: "the system that records billing accounts", reason: "Account may be wrong.", check: "Compare the account." },
    ],
    investigationSteps: ["Reprint one label and inspect the barcode block."],
    suggestedFix: "Correct the billing account and reprint.",
    alternativeSolutions: ["Raise the shipment manually."],
    warnings: ["Confirm before reprinting at scale."],
  });
}

function fakeSender(reply: string): { send: AnalysisSender; calls: { system: string; prompt: string }[] } {
  const calls: { system: string; prompt: string }[] = [];
  const send: AnalysisSender = async (request) => {
    calls.push(request);
    return { text: reply };
  };
  return { send, calls };
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

describe("feature flags — no request may escape a closed gate", () => {
  it("GEMINI_ENABLED=false → blocked, no request", async () => {
    const { send, calls } = fakeSender(validResponse());
    const outcome = await runIssueAnalysis(status({ enabled: false }), { issue: ISSUE }, send);
    assert.equal(calls.length, 0);
    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.status === "blocked" && outcome.reason, "AI_DISABLED");
  });

  it("key missing → blocked, no request, no crash", async () => {
    const { send, calls } = fakeSender(validResponse());
    const outcome = await runIssueAnalysis(status({ configured: false }), { issue: ISSUE }, send);
    assert.equal(calls.length, 0);
    assert.equal(outcome.status === "blocked" && outcome.reason, "AI_NOT_CONFIGURED");
  });

  it("GEMINI_ALLOW_REAL_ISSUE_DATA=false → AI_REAL_DATA_BLOCKED, no request", async () => {
    const { send, calls } = fakeSender(validResponse());
    const outcome = await runIssueAnalysis(
      status({ allowRealIssueData: false }),
      { issue: ISSUE },
      send
    );
    assert.equal(calls.length, 0, "a request was made while the real-data gate was closed");
    assert.equal(outcome.status === "blocked" && outcome.reason, "AI_REAL_DATA_BLOCKED");
    assert.equal(
      outcome.status === "blocked" && outcome.message,
      "AI analysis is configured but real Issue data is disabled for this environment."
    );
  });

  it("the blocked message never leaks an environment variable name or value", () => {
    for (const message of Object.values(BLOCKED_MESSAGES)) {
      assert.equal(/GEMINI_|API_KEY|process\.env/.test(message), false, message);
    }
  });

  it("all gates open → the request is made and the response is processed", async () => {
    const { send, calls } = fakeSender(validResponse());
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.equal(calls.length, 1);
    assert.equal(outcome.status, "ok");
  });
});

// ---------------------------------------------------------------------------
// What may enter the request
// ---------------------------------------------------------------------------

describe("only sanitized content can enter the request", () => {
  it("carries the sanitized Issue fields", async () => {
    const { send, calls } = fakeSender(validResponse());
    await runIssueAnalysis(status(), { issue: ISSUE }, send);
    const sent = calls[0].prompt;
    assert.ok(sent.includes("Barcode missing from printed shipping label"));
    assert.ok(sent.includes("postage"));
  });

  it("never carries member, dataLink, attachments, staff names or provenance", async () => {
    const { send, calls } = fakeSender(validResponse());
    await runIssueAnalysis(status(), { issue: ISSUE }, send);
    const sent = `${calls[0].system}\n${calls[0].prompt}`;
    for (const forbidden of ["Laksika", "dashboard.internal.example", "sourceFile", "public_id", "cloudinary"]) {
      assert.equal(sent.includes(forbidden), false, `prompt leaked ${forbidden}`);
    }
    assert.equal(/https?:\/\//.test(sent), false, "prompt contains a URL");
  });

  it("PERFORMANCE: sends no historical Issue content at all", async () => {
    const { send, calls } = fakeSender(validResponse());
    await runIssueAnalysis(status(), { issue: ISSUE }, send);
    const sent = `${calls[0].system}\n${calls[0].prompt}`;
    // Neither the real references nor the historical text is transmitted —
    // deterministic retrieval already produced that, and the UI renders it.
    for (const forbidden of ["ND-011", "SA-009", "Similar Issue", "SIMILAR PAST ISSUES"]) {
      assert.equal(sent.includes(forbidden), false, `prompt still carries "${forbidden}"`);
    }
  });

  it("PERFORMANCE: omits every empty optional field", () => {
    const sparse = sanitizeIssueForAi({
      title: "Short title",
      description: "Short description.",
      category: "postage",
      priority: null,
      resolution: null,
      extraData: {},
    });
    const prompt = buildAnalysisPrompt(sparse);
    for (const label of ["Priority:", "What is happening:", "Root cause", "Fix proposed"]) {
      assert.equal(prompt.includes(label), false, `empty field "${label}" was still sent`);
    }
    assert.ok(prompt.includes("Title: Short title"));
  });

  it("PERFORMANCE: a sparse Issue produces a materially smaller prompt", () => {
    const sparse = sanitizeIssueForAi({
      title: "Short title",
      description: "Short description.",
      category: "postage",
      priority: null,
      resolution: null,
      extraData: {},
    });
    assert.ok(buildAnalysisPrompt(sparse).length < buildAnalysisPrompt(ISSUE).length);
  });

  it("labels intake text as unconfirmed, never as a proven resolution", () => {
    const prompt = buildAnalysisPrompt(ISSUE);
    assert.ok(prompt.includes("unconfirmed"));
    assert.equal(/\bResolved Issues\b/.test(prompt), false);
  });

  it("states the mandatory instructions", () => {
    for (const phrase of [
      "ADVISORY ONLY",
      "BE CONCISE",
      "no chain-of-thought",
      "Do not claim certainty",
      "Do not invent facts",
      "Do not invent company system names",
      "PREVIOUSLY COMPLETED Issue",
      "supporting investigation evidence",
      "NEVER mention, quote, label, number or otherwise identify",
      "UNCONFIRMED",
      "You cannot change any record",
      "LOW, MEDIUM or HIGH",
    ]) {
      assert.ok(ANALYSIS_SYSTEM_INSTRUCTIONS.includes(phrase), `missing instruction: ${phrase}`);
    }
  });
});

describe("past Issues are HIDDEN CONTEXT, never shown back", () => {
  it("labels contexts A, B — never as numbered Issues", () => {
    assert.equal(pastContextLabelFor(0), "Past Context A");
    assert.equal(pastContextLabelFor(1), "Past Context B");
  });

  it("PERFORMANCE: sends at most two, even when more are supplied", () => {
    const many = Array.from({ length: 6 }, (_v, index) =>
      sanitizeHistoricalIssueForAi({
        issueId: `AA-${String(index).padStart(3, "0")}`,
        title: `Past issue ${index}`,
        category: "postage",
        resolution: null,
        finalResolution: null,
        extraData: {},
      })
    );
    const prompt = buildAnalysisPrompt(ISSUE, many);
    assert.ok(prompt.includes("Past Context A"));
    assert.ok(prompt.includes("Past Context B"));
    assert.equal(prompt.includes("Past Context C"), false);
    assert.equal(MAX_SIMILAR_FOR_ANALYSIS, 2);
  });

  it("PERFORMANCE: 0 stays 0 — no background section at all", () => {
    const prompt = buildAnalysisPrompt(ISSUE, []);
    assert.equal(prompt.includes("BACKGROUND EVIDENCE"), false);
    assert.equal(prompt.includes("Past Context"), false);
  });

  it("PERFORMANCE: 1 stays 1 — the slots are never padded", () => {
    const prompt = buildAnalysisPrompt(ISSUE, [HISTORY[0]]);
    assert.ok(prompt.includes("Past Context A"));
    assert.equal(prompt.includes("Past Context B"), false);
  });

  it("never sends a real historical Issue reference to the model", () => {
    const prompt = buildAnalysisPrompt(ISSUE, HISTORY);
    assert.equal(prompt.includes("ND-011"), false);
    assert.equal(prompt.includes("SA-009"), false);
  });

  it("sends no staff name, attachment, link or raw extra_data as context", () => {
    const prompt = buildAnalysisPrompt(ISSUE, HISTORY);
    for (const forbidden of ["Laksika", "Nanthi", "dataLink", "images", "extraData", "sourceFile"]) {
      assert.equal(prompt.includes(forbidden), false, `context leaked ${forbidden}`);
    }
    assert.equal(/https?:\/\//.test(prompt), false);
  });

  it("presents past context as COMPLETED with a CONFIRMED resolution", () => {
    const prompt = buildAnalysisPrompt(ISSUE, HISTORY);
    assert.ok(prompt.includes("previously COMPLETED Issues with confirmed resolutions"));
    assert.ok(prompt.includes("Confirmed resolution:"));
    // The current Issue's own intake text is still marked unconfirmed.
    assert.ok(prompt.includes("Root cause recorded at intake (unconfirmed)"));
  });

  it("instructs the model not to assume the past root cause applies", () => {
    assert.ok(
      ANALYSIS_SYSTEM_INSTRUCTIONS.includes(
        "Do NOT assume a past context's root cause automatically applies here"
      )
    );
    assert.ok(ANALYSIS_SYSTEM_INSTRUCTIONS.includes("PREVIOUSLY COMPLETED Issue"));
    assert.ok(ANALYSIS_SYSTEM_INSTRUCTIONS.includes("If you are given no past context, that is normal"));
  });

  it("the outcome carries no historical data back to the browser", async () => {
    const { send } = fakeSender(validResponse());
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE, history: HISTORY }, send);
    assert.ok(outcome.status === "ok");
    const serialized = JSON.stringify(outcome);
    for (const forbidden of ["ND-011", "SA-009", "Past Context", "similarIssues"]) {
      assert.equal(serialized.includes(forbidden), false, `outcome leaked ${forbidden}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

describe("response handling", () => {
  it("accepts and returns a valid analysis", async () => {
    const { send } = fakeSender(validResponse());
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.ok(outcome.status === "ok");
    assert.equal(outcome.analysis.confidence, "MEDIUM");
  });

  it("always includes the human-verification warning", async () => {
    const stripped = JSON.parse(validResponse());
    stripped.warnings = [];
    const { send } = fakeSender(JSON.stringify(stripped));
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.ok(outcome.status === "ok");
    assert.ok(outcome.analysis.warnings.includes(HUMAN_VERIFICATION_WARNING));
  });

  it("rejects malformed JSON safely", async () => {
    const { send } = fakeSender("not json at all");
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.equal(outcome.status === "failed" && outcome.reason, "AI_INVALID_RESPONSE");
  });

  it("rejects a schema-invalid response", async () => {
    const bad = JSON.parse(validResponse());
    bad.confidence = 0.9;
    const { send } = fakeSender(JSON.stringify(bad));
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.equal(outcome.status === "failed" && outcome.reason, "AI_INVALID_RESPONSE");
  });

  it("rejects an empty response", async () => {
    const { send } = fakeSender("   ");
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.equal(outcome.status === "failed" && outcome.reason, "AI_EMPTY_RESPONSE");
  });

  it("turns a transport error into a failure state, never an exception", async () => {
    const send: AnalysisSender = async () => {
      throw new Error("503 UNAVAILABLE");
    };
    const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
    assert.equal(outcome.status === "failed" && outcome.reason, "AI_REQUEST_FAILED");
  });


  it("confidence can only be LOW, MEDIUM or HIGH", async () => {
    for (const level of ["LOW", "MEDIUM", "HIGH"]) {
      const draft = JSON.parse(validResponse());
      draft.confidence = level;
      const { send } = fakeSender(JSON.stringify(draft));
      const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
      assert.equal(outcome.status, "ok");
    }
    for (const level of ["VERY HIGH", "high", "87%", 5]) {
      const draft = JSON.parse(validResponse());
      draft.confidence = level;
      const { send } = fakeSender(JSON.stringify(draft));
      const outcome = await runIssueAnalysis(status(), { issue: ISSUE }, send);
      assert.equal(outcome.status, "failed");
    }
  });
});

// ---------------------------------------------------------------------------
// Similarity: the Stage 4 meaningful-match rule
// ---------------------------------------------------------------------------

describe("meaningful-match rule", () => {
  const subject = {
    issueId: "AA-100",
    title: "Barcode missing from printed shipping label",
    description: "Blank barcode block on the printed label.",
    category: "postage",
    priority: "high" as string | null,
    whatIsHappening: "Labels print but the barcode block is empty.",
    rootCause: "Billing account wrong.",
  };

  function candidate(over: Partial<typeof subject> & { resolution?: string | null; finalResolution?: string | null } = {}) {
    return {
      issueId: "AA-200",
      title: "Completely unrelated spreadsheet column formatting",
      description: "A column is formatted incorrectly.",
      category: "postage",
      priority: "high" as string | null,
      whatIsHappening: null,
      rootCause: null,
      resolution: null,
      finalResolution: null,
      ...over,
    };
  }

  it("rejects a candidate whose only evidence is the shared domain", () => {
    const domainOnly = candidate();
    const parts = scoreBreakdown(subject, domainOnly);
    assert.equal(parts.domain > 0, true);
    assert.equal(hasMeaningfulOverlap(parts), false);
    assert.equal(rankHistoricalCandidates(subject, [domainOnly]).length, 0);
  });

  it("rejects domain + priority with no lexical overlap", () => {
    const both = candidate({ priority: "high" });
    assert.equal(rankHistoricalCandidates(subject, [both]).length, 0);
  });

  it("keeps a candidate with genuine title overlap", () => {
    const real = candidate({ issueId: "AA-300", title: "Printed label missing its barcode" });
    assert.equal(rankHistoricalCandidates(subject, [real]).length, 1);
  });

  it("keeps a candidate whose only overlap is rootCause", () => {
    const real = candidate({ issueId: "AA-400", rootCause: "Billing account wrong." });
    assert.ok(hasMeaningfulOverlap(scoreBreakdown(subject, real)));
    assert.equal(rankHistoricalCandidates(subject, [real]).length, 1);
  });

  it("keeps a strong lexical match in a DIFFERENT domain", () => {
    const crossDomain = candidate({
      issueId: "AA-500",
      category: "listing",
      title: "Printed label missing its barcode",
      description: "Blank barcode block on the printed label.",
    });
    assert.equal(rankHistoricalCandidates(subject, [crossDomain]).length, 1);
  });

  it("still returns at most five", () => {
    const many = Array.from({ length: 20 }, (_v, index) =>
      candidate({ issueId: `AA-${String(index).padStart(3, "0")}`, title: "Printed label missing its barcode" })
    );
    assert.equal(rankHistoricalCandidates(subject, many).length, 5);
  });
});

// ---------------------------------------------------------------------------
// Structural guarantees
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
function codeOnly(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

describe("the frozen synthetic analysis prompt", () => {
  it("is byte-identical to what the real prompt builder renders", async () => {
    const { buildSyntheticAnalysisPrompt } = await import("../lib/ai/syntheticAnalysisFixture");
    const { GEMINI_SYNTHETIC_ANALYSIS_PROMPT } = await import("../lib/ai/geminiPolicy");
    assert.equal(
      buildSyntheticAnalysisPrompt(),
      GEMINI_SYNTHETIC_ANALYSIS_PROMPT,
      "the fixture and the frozen gate constant have drifted apart"
    );
  });

  it("contains only fictional content", async () => {
    const { GEMINI_SYNTHETIC_ANALYSIS_PROMPT } = await import("../lib/ai/geminiPolicy");
    for (const needle of ["issue_tracking", "http", "@", "Laksika", "Nanthi", "Rajive", "WCSN"]) {
      assert.equal(
        GEMINI_SYNTHETIC_ANALYSIS_PROMPT.includes(needle),
        false,
        `synthetic prompt contains "${needle}"`
      );
    }
    assert.ok(GEMINI_SYNTHETIC_ANALYSIS_PROMPT.includes("fictional test data"));
  });

  it("is allowed by the gate, while a real Issue prompt is still refused", async () => {
    const { assertPromptAllowed, GEMINI_SYNTHETIC_ANALYSIS_PROMPT, GEMINI_SYNTHETIC_PROMPT, RealIssueDataBlockedError } =
      await import("../lib/ai/geminiPolicy");
    const closed = { enabled: true, configured: true, model: "m", allowRealIssueData: false };

    assert.doesNotThrow(() => assertPromptAllowed(GEMINI_SYNTHETIC_ANALYSIS_PROMPT, closed));
    assert.doesNotThrow(() => assertPromptAllowed(GEMINI_SYNTHETIC_PROMPT, closed));

    // A real prompt built from a real Issue — refused.
    const realPrompt = buildAnalysisPrompt(ISSUE);
    assert.throws(() => assertPromptAllowed(realPrompt, closed), RealIssueDataBlockedError);

    // And the smuggling attempt: synthetic prefix, real content appended.
    assert.throws(
      () => assertPromptAllowed(`${GEMINI_SYNTHETIC_ANALYSIS_PROMPT}\n${realPrompt}`, closed),
      RealIssueDataBlockedError
    );
  });
});

describe("Stage 4 structure", () => {
  const action = codeOnly("app/dashboard/issues/ai-actions.ts");

  it("the Server Action is a server module", () => {
    assert.ok(read("app/dashboard/issues/ai-actions.ts").startsWith('"use server"'));
  });

  it("resolves identity from the session, never from the form", () => {
    assert.ok(action.includes("getCurrentUser()"));
    assert.ok(action.includes("getIssueAccessScope(user)"));
    for (const field of ["assigneeId", "userId", "role", "active"]) {
      assert.equal(
        new RegExp(`formData\\.get\\(["']${field}["']\\)`).test(action),
        false,
        `action reads ${field} from the form`
      );
    }
  });

  it("reads only issueId from the request", () => {
    const reads = action.match(/formData\.get\((["'][^"']+["'])\)/g) ?? [];
    assert.deepEqual(reads, ['formData.get("issueId")']);
  });

  it("checks the Assignee-only permission", () => {
    assert.ok(action.includes('"issue:analyse_own_assigned"'));
  });

  it("passes the scope into the Issue lookup", () => {
    assert.ok(action.includes("getIssueById(issueId, scope)"));
  });

  it("sanitizes before anything leaves", () => {
    assert.ok(action.includes("sanitizeIssueForAi(issue)"));
  });

  it("performs no database write and no revalidation", () => {
    const upper = action.toUpperCase();
    for (const statement of ["INSERT INTO", "UPDATE ", "DELETE FROM", "REVALIDATEPATH"]) {
      assert.equal(upper.includes(statement), false, `action contains ${statement}`);
    }
  });

  it("never imports a status or work-progress writer", () => {
    assert.equal(action.includes("issueStatus"), false);
    assert.equal(action.includes("recordIssueProgress"), false);
    assert.equal(action.includes("updateIssueStatus"), false);
  });

  it("the AI panel is rendered only behind the server-resolved flag", () => {
    const page = codeOnly("app/dashboard/issues/[issueId]/page.tsx");
    assert.ok(page.includes("view.showAiAssistant && ("));
    assert.ok(page.includes("<IssueAiAssistant"));
  });

  it("past context is retrieved server-side and capped at two", () => {
    const action = codeOnly("app/dashboard/issues/ai-actions.ts");
    assert.ok(action.includes("findSimilarPastIssues("));
    assert.ok(action.includes("limit: MAX_SIMILAR_FOR_ANALYSIS"));
  });

  it("no Similar Past Issues section exists in the UI", () => {
    const panel = codeOnly("components/issues/IssueAiAssistant.tsx");
    assert.equal(panel.includes("Similar Past Issues"), false);
    assert.equal(panel.includes("similarIssues"), false);
    assert.equal(panel.includes("referenceLabel"), false);
  });

  it("the admin path requires no assignment ownership, the assignee path does", () => {
    const action = codeOnly("app/dashboard/issues/ai-actions.ts");
    assert.ok(action.includes('"issue:analyse_any"'));
    assert.ok(action.includes('"issue:analyse_own_assigned"'));
    assert.ok(action.includes('scope.kind !== "all"'));
    assert.ok(action.includes('scope.kind !== "assignee"'));
    // Ownership still comes from the scope, never from the request.
    assert.ok(action.includes("getIssueById(issueId, scope)"));
  });

  it("the flow module stays pure and testable", () => {
    assert.equal(codeOnly("lib/ai/analysisFlow.ts").includes('import "server-only"'), false);
  });
});
