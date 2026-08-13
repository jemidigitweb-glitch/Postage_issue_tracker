// PURE analysis flow: the request contract, the safety gates, and response
// validation.
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
// ── ONE ISSUE, FOUR FIELDS ──────────────────────────────────────────────────
// The model sees the CURRENT Issue only, and only its title, description,
// domain and reported root cause. No other Issue is read, ranked or
// transmitted — there is no historical, resolved or similar-Issue path in this
// module at all, so cross-assignee visibility (audit decision D2) is no longer
// reachable from the AI feature.

import {
  parseIssueAnalysis,
  type IssueAnalysis,
} from "./analysisSchema";
import type { SanitizedIssueForAi } from "../access/aiSanitization";
import type { GeminiFeatureStatus } from "./geminiPolicy";

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
  "Quickly analyse one Issue from an internal Issue Tracking System, using ONLY the title, description, domain and reported root cause supplied below.",
  "Be brief and actionable. No preamble, no restating the Issue, no reasoning narration, no chain-of-thought.",
  "The reported root cause is a HYPOTHESIS entered by a person, not proven fact. Say whether it fits the title and description, and propose other causes if the evidence points elsewhere.",
  "You are given no other Issue, no history and no past cases. Do not refer to, imply or invent any.",
  "Use only what is supplied. Never invent facts, or company system, tool, team or people names — describe where to check generically.",
  "Do not claim certainty; lower the confidence level when unsure. Confidence must be exactly LOW, MEDIUM or HIGH — never a number.",
  "ADVISORY ONLY: a human must verify everything. You cannot change any record — address your steps to the human reader.",
  "Respond with JSON matching the supplied schema, and nothing else.",
].join("\n");

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Builds the request from ALREADY-SANITIZED content — the CURRENT Issue only.
 *
 * ── FOUR FIELDS, AND THE TYPE SYSTEM ENFORCES IT ────────────────────────────
 * The parameter is the sanitizer's output type, which now HAS only four
 * properties. There is no `priority`, `whatIsHappening` or
 * `suggestedFixAtIntake` to read, and a raw Issue row does not type-check
 * here — so the restriction is structural rather than a rule to remember.
 *
 * Root cause is emitted as REPORTED / SUSPECTED: it is human-entered and
 * unverified, and the system instructions ask the model to weigh it against
 * the title and description rather than accept it.
 *
 * There is NO history parameter. No other Issue is read, ranked or sent.
 *
 * Empty optional values are omitted — no "Root cause: (none)" filler.
 */
export function buildAnalysisPrompt(issue: SanitizedIssueForAi): string {
  const lines: string[] = [];

  lines.push("ISSUE UNDER INVESTIGATION");
  lines.push(`Domain: ${issue.domain}`);
  lines.push(`Title: ${issue.title}`);
  lines.push(`Description: ${issue.description}`);
  if (issue.rootCause) {
    lines.push(`Reported / suspected root cause (entered by a person, UNVERIFIED): ${issue.rootCause}`);
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

/** No historical field of any kind: the model is given no other Issue, so
 *  there is nothing to return about one. */
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

  const prompt = buildAnalysisPrompt(input.issue);

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

  // No historical-reference filter is needed: no other Issue is supplied, the
  // instructions forbid inventing one, and the schema has no field for it.
  return { status: "ok", analysis: parsed.value };
}
