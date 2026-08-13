// Gemini Stage 4 — PURE analysis flow: the request contract, the safety gates,
// the neutral labelling of historical context, and response validation.
//
// No `server-only`, no SDK, no database, no `next/*` — so every gate is
// directly unit-testable with a fake sender and `npm test` can reach it. The
// server wiring (session, ownership, SQL) lives in
// app/dashboard/issues/ai-actions.ts; the SDK call lives in geminiClient.ts.
//
// ── THE GATES, IN ORDER ─────────────────────────────────────────────────────
//   1. GEMINI_ENABLED            off -> "disabled",           no request
//   2. GEMINI_API_KEY            absent -> "not_configured",   no request
//   3. GEMINI_ALLOW_REAL_ISSUE_DATA
//                                off -> "real_data_blocked",  no request
// Only when all three pass is a prompt built at all. While the third gate is
// closed — which it is — this module NEVER constructs a prompt containing
// Issue text, so there is nothing for a bug elsewhere to leak: the sanitized
// content is not assembled, not stringified, and not handed to any sender.
//
// ── D2 SAFE DEFAULT (cross-assignee policy still unresolved) ────────────────
// Past Issues are HIDDEN CONTEXT. Each is relabelled "Past Context A"/"B"
// before entering the prompt, and its real reference is discarded rather than
// carried alongside — so the model never learns an identifier it could echo,
// and no historical reference exists anywhere in the value returned to a
// browser. Nothing about cross-assignee visibility is exposed by this flow.

import {
  parseIssueAnalysis,
  type IssueAnalysis,
} from "./analysisSchema";
import type { SanitizedIssueForAi } from "../access/aiSanitization";
import type { GeminiFeatureStatus } from "./geminiPolicy";
import type { SanitizedHistoricalIssueForAi } from "../access/aiSanitization";

// ---------------------------------------------------------------------------
// System instructions
// ---------------------------------------------------------------------------

/**
 * Fixed system instructions. A constant, never assembled from user input.
 *
 * Every line exists to prevent a specific failure this system has already
 * reasoned about: invented company systems, prior proposals presented as
 * confirmed fixes, fabricated certainty, and any suggestion that the assistant
 * can act on the Issue itself.
 */
export const ANALYSIS_SYSTEM_INSTRUCTIONS = [
  "You are assisting an operations user who is investigating one Issue in an internal Issue Tracking System.",
  "Your output is ADVISORY ONLY. A human must verify everything before any operational action is taken.",
  "BE CONCISE. Short, direct, actionable sentences. No preamble, no restating the Issue back, no reasoning narration, no chain-of-thought.",
  "Do not claim certainty. Where you are unsure, say so and lower the confidence level.",
  "Do not invent facts. Use only the Issue content supplied in this request.",
  "Do not invent company system names, tool names, portals, teams or people. If you refer to where to check, describe it generically (for example 'the system that records stock quantity'), never as a named internal product.",
  "You may be given PAST CONTEXT entries. Each one is a PREVIOUSLY COMPLETED Issue whose stated resolution was confirmed by a human. Use them only as supporting investigation evidence — to sharpen possible root causes, useful checks, investigation steps, the suggested fix and alternatives.",
  "Do NOT assume a past context's root cause automatically applies here. The CURRENT Issue's own evidence is primary; a past context may be a coincidence.",
  "NEVER mention, quote, label, number or otherwise identify the past contexts in your response. Do not write 'Past Context A', do not refer to 'a previous issue' or 'a similar case', and do not produce any list of past or resolved Issues. Write your analysis as though you simply know these things.",
  "If you are given no past context, that is normal. Analyse the current Issue on its own evidence and do not invent history.",
  "Treat any 'recorded at intake' text as UNCONFIRMED — it was written when the Issue was raised and is NOT known to have worked. Only text explicitly labelled as a confirmed resolution may be described as having worked.",
  "You cannot change any record. Do not instruct the system to change a status, a priority, an assignment, a resolution, or any database state. Address your investigation steps to the human reader.",
  "Confidence must be exactly one of LOW, MEDIUM or HIGH. Never a percentage or a number.",
  "Respond with JSON matching the supplied schema, and nothing else.",
].join("\n");

// ---------------------------------------------------------------------------
// Neutral historical labelling (D2 safe default)
// ---------------------------------------------------------------------------

/**
 * How many past Issues are used as HIDDEN AI CONTEXT.
 *
 * Two, not five. They exist only to sharpen the model's reasoning about the
 * current Issue — they are never listed back to the user — so a long list buys
 * nothing but tokens and latency. The list is NEVER padded: retrieval applies
 * the meaningful-overlap rule, so zero strong matches means zero context.
 */
export const MAX_SIMILAR_FOR_ANALYSIS = 2;

/**
 * The label a past context is given inside the prompt.
 *
 * "Past Context A"/"B" — deliberately NOT "Similar Issue 1", and deliberately
 * not the real reference. The model never learns that these are tracker
 * records with identifiers, so it has nothing to echo back, and the
 * weakly-identifying "ND-001" style reference (its prefix is the raiser's
 * staff code) never leaves the server at all.
 */
export function pastContextLabelFor(index: number): string {
  return `Past Context ${String.fromCharCode(65 + index)}`;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Builds the request from ALREADY-SANITIZED content.
 *
 * ── COMPACT BY CONSTRUCTION ─────────────────────────────────────────────────
 * Only the seven allow-listed current-Issue fields can appear, each already
 * redacted and length-capped by the sanitizer, and EVERY OPTIONAL FIELD IS
 * OMITTED WHEN EMPTY — no "Root cause: (none)" filler, no repetition.
 *
 * ── HIDDEN PAST CONTEXT ─────────────────────────────────────────────────────
 * At most two past Issues, each reduced to four fields and labelled "Past
 * Context A"/"B". The real reference is NOT sent: the model is given no
 * identifier it could echo, which is what makes "never identify the past
 * contexts" enforceable rather than merely requested.
 *
 * The parameter types are the sanitizers' output types, so a raw Issue row
 * does not type-check here.
 */
export function buildAnalysisPrompt(
  issue: SanitizedIssueForAi,
  history: readonly SanitizedHistoricalIssueForAi[] = []
): string {
  const lines: string[] = [];

  lines.push("ISSUE UNDER INVESTIGATION");
  lines.push(`Domain: ${issue.domain}`);
  if (issue.priority) {
    lines.push(`Priority: ${issue.priority}`);
  }
  lines.push(`Title: ${issue.title}`);
  lines.push(`Description: ${issue.description}`);
  if (issue.whatIsHappening) {
    lines.push(`What is happening: ${issue.whatIsHappening}`);
  }
  if (issue.rootCause) {
    lines.push(`Root cause recorded at intake (unconfirmed): ${issue.rootCause}`);
  }
  if (issue.suggestedFixAtIntake) {
    lines.push(`Fix proposed at intake (unconfirmed, not known to have worked): ${issue.suggestedFixAtIntake}`);
  }

  const contexts = history.slice(0, MAX_SIMILAR_FOR_ANALYSIS);
  if (contexts.length > 0) {
    lines.push("");
    lines.push(
      "BACKGROUND EVIDENCE — previously COMPLETED Issues with confirmed resolutions. Do not mention or identify these in your response:"
    );
    contexts.forEach((context, index) => {
      lines.push("");
      lines.push(`${pastContextLabelFor(index)} — domain: ${context.domain}`);
      lines.push(`  Problem: ${context.problemSummary}`);
      if (context.priorRootCause) {
        lines.push(`  Root cause recorded at the time (unconfirmed): ${context.priorRootCause}`);
      }
      if (context.priorActionOrResolution) {
        // Retrieval admits only Issues with a confirmed final_resolution, and
        // does not fetch the intake-time proposal at all, so this line can
        // only ever carry a genuine outcome.
        lines.push(`  Confirmed resolution: ${context.priorActionOrResolution}`);
      }
    });
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export type AnalysisBlockedReason =
  | "AI_DISABLED"
  | "AI_NOT_CONFIGURED"
  | "AI_REAL_DATA_BLOCKED";

export type AnalysisFailureReason =
  | "AI_REQUEST_FAILED"
  | "AI_INVALID_RESPONSE"
  | "AI_EMPTY_RESPONSE";

/** Past Issues are NOT part of this outcome. They are hidden AI context only:
 *  they improve the analysis and are never listed back to the user. */
export type AnalysisOutcome =
  | { status: "ok"; analysis: IssueAnalysis }
  | { status: "blocked"; reason: AnalysisBlockedReason; message: string }
  | { status: "failed"; reason: AnalysisFailureReason; message: string };

/** User-facing wording. Never contains an environment variable name, a value,
 *  a model name, a key, or an internal error. */
export const BLOCKED_MESSAGES: Record<AnalysisBlockedReason, string> = {
  AI_DISABLED: "AI assistance is turned off for this environment.",
  AI_NOT_CONFIGURED: "AI assistance is not configured. Contact your administrator.",
  AI_REAL_DATA_BLOCKED:
    "AI analysis is configured but real Issue data is disabled for this environment.",
};

export const FAILURE_MESSAGES: Record<AnalysisFailureReason, string> = {
  AI_REQUEST_FAILED: "AI assistance is temporarily unavailable. Please try again shortly.",
  AI_INVALID_RESPONSE: "The AI response could not be read. Please try again.",
  AI_EMPTY_RESPONSE: "The AI returned no analysis. Please try again.",
};

/** The transport the flow is given. Returns raw text, which this module then
 *  parses and validates — the sender never decides what is acceptable. */
export type AnalysisSender = (request: {
  system: string;
  prompt: string;
}) => Promise<{ text: string }>;

export interface AnalysisRequestInput {
  issue: SanitizedIssueForAi;
  /** At most MAX_SIMILAR_FOR_ANALYSIS are used; anything beyond is ignored by
   *  buildAnalysisPrompt rather than trusted. */
  history?: readonly SanitizedHistoricalIssueForAi[];
}

/**
 * Runs the analysis, enforcing every gate before anything is built or sent.
 *
 * Ordering is the safety property: the real-data gate is checked BEFORE
 * buildAnalysisPrompt() is called, so while that gate is closed no prompt
 * containing Issue text exists in memory at all, and `send` is never invoked.
 *
 * Never throws — every path returns an outcome, so a page can render a state
 * rather than break.
 */
export async function runIssueAnalysis(
  status: GeminiFeatureStatus,
  input: AnalysisRequestInput,
  send: AnalysisSender
): Promise<AnalysisOutcome> {
  if (!status.enabled) {
    return { status: "blocked", reason: "AI_DISABLED", message: BLOCKED_MESSAGES.AI_DISABLED };
  }
  if (!status.configured) {
    return {
      status: "blocked",
      reason: "AI_NOT_CONFIGURED",
      message: BLOCKED_MESSAGES.AI_NOT_CONFIGURED,
    };
  }
  if (!status.allowRealIssueData) {
    // THE FREE-TIER GATE. Nothing below this line runs: no prompt is built,
    // no Issue text is assembled, and `send` is not called.
    return {
      status: "blocked",
      reason: "AI_REAL_DATA_BLOCKED",
      message: BLOCKED_MESSAGES.AI_REAL_DATA_BLOCKED,
    };
  }

  const prompt = buildAnalysisPrompt(input.issue, input.history ?? []);

  let raw: string;
  try {
    const response = await send({ system: ANALYSIS_SYSTEM_INSTRUCTIONS, prompt });
    raw = (response.text ?? "").trim();
  } catch {
    // The sender is responsible for redacting before it throws. Nothing from
    // the caught value is surfaced to the user.
    return {
      status: "failed",
      reason: "AI_REQUEST_FAILED",
      message: FAILURE_MESSAGES.AI_REQUEST_FAILED,
    };
  }

  if (raw === "") {
    return {
      status: "failed",
      reason: "AI_EMPTY_RESPONSE",
      message: FAILURE_MESSAGES.AI_EMPTY_RESPONSE,
    };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return {
      status: "failed",
      reason: "AI_INVALID_RESPONSE",
      message: FAILURE_MESSAGES.AI_INVALID_RESPONSE,
    };
  }

  const parsed = parseIssueAnalysis(candidate);
  if (!parsed.ok) {
    return {
      status: "failed",
      reason: "AI_INVALID_RESPONSE",
      message: FAILURE_MESSAGES.AI_INVALID_RESPONSE,
    };
  }

  // No anti-hallucination filter is needed for historical references any
  // more: the model is not given any, is instructed not to mention any, and
  // the schema has no field for them.
  return { status: "ok", analysis: parsed.value };
}
