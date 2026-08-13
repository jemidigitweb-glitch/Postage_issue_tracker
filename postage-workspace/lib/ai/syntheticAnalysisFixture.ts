// A wholly FICTIONAL Issue, used to exercise the real structured-analysis path
// without transmitting one byte of company data.
//
// PURE: no `server-only`, no SDK, no database. Every value below was invented
// for this file. There is no "Demo Systems" domain, no demo printer queue, and
// no such Issue in issue_tracking.issues — the strings are deliberately
// self-describing so that anyone reading a Gemini request log can see at a
// glance that it carries test data.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The structured path (schema, prompt shape, response parsing) cannot be
// proven end-to-end by unit tests with a fake sender: those prove our logic,
// not that Gemini accepts this schema and returns something parseable. This
// fixture lets the REAL sender run — same model, same response_format, same
// timeout, same redaction — against content that is safe to send.
//
// The rendered prompt is frozen as GEMINI_SYNTHETIC_ANALYSIS_PROMPT in
// geminiPolicy.ts, and tests/analysisFlow.test.ts asserts the two are
// identical. If this fixture is ever edited without updating that constant,
// the test fails and the gate refuses the request — which is the intended
// direction of failure.

import { buildAnalysisPrompt } from "./analysisFlow";
import { sanitizeIssueForAi, type SanitizedIssueForAi } from "../access/aiSanitization";

/** Fictional Issue, passed through the real sanitizer so the shape and the
 *  redaction behaviour are exactly what a genuine Issue would produce. */
export const SYNTHETIC_ANALYSIS_ISSUE: SanitizedIssueForAi = sanitizeIssueForAi({
  title: "Demo printer queue stops after synthetic test job",
  description: "This is fictional test data created only to verify structured Gemini output.",
  category: "Demo Systems",
  extraData: { rootCause: "Unknown synthetic cause." },
});

/** Renders the fixture through the REAL prompt builder, so what is sent is the
 *  genuine request shape and not a hand-written approximation. */
export function buildSyntheticAnalysisPrompt(): string {
  return buildAnalysisPrompt(SYNTHETIC_ANALYSIS_ISSUE);
}
