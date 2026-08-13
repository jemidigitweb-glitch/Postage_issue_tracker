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
import {
  sanitizeHistoricalIssueForAi,
  sanitizeIssueForAi,
  type SanitizedHistoricalIssueForAi,
  type SanitizedIssueForAi,
} from "../access/aiSanitization";

/** Fictional Issue, passed through the real sanitizer so the shape and the
 *  redaction behaviour are exactly what a genuine Issue would produce. */
export const SYNTHETIC_ANALYSIS_ISSUE: SanitizedIssueForAi = sanitizeIssueForAi({
  title: "Demo printer queue stops after synthetic test job",
  description: "This is fictional test data created only to verify structured Gemini output.",
  category: "Demo Systems",
  priority: "medium",
  resolution: "Restart fictional demo queue service.",
  extraData: {
    whatIsHappening: "Synthetic print jobs remain queued.",
    rootCause: "Unknown synthetic cause.",
  },
});

/** Two fictional past contexts, passed through the REAL historical sanitizer
 *  so the shape matches production exactly. Both carry a CONFIRMED
 *  final_resolution and no intake-time proposal, matching what the
 *  resolved-only retrieval predicate can actually produce. Their references
 *  are discarded by the prompt builder — only "Past Context A/B" is sent. */
export const SYNTHETIC_ANALYSIS_HISTORY: readonly SanitizedHistoricalIssueForAi[] = [
  sanitizeHistoricalIssueForAi({
    issueId: "ZZ-901",
    title: "Fictional demo queue paused during an earlier synthetic test",
    category: "Demo Systems",
    resolution: null,
    finalResolution: "Fictional demo service was restarted and the queue cleared.",
    extraData: { rootCause: "Synthetic placeholder cause." },
  }),
  sanitizeHistoricalIssueForAi({
    issueId: "ZZ-902",
    title: "Fictional demo job stayed queued in an unrelated synthetic scenario",
    category: "Demo Systems",
    resolution: null,
    finalResolution: "Synthetic placeholder outcome recorded.",
    extraData: { rootCause: null },
  }),
];

/** Renders the fixture through the REAL prompt builder, so what is sent is the
 *  genuine request shape and not a hand-written approximation. */
export function buildSyntheticAnalysisPrompt(): string {
  return buildAnalysisPrompt(SYNTHETIC_ANALYSIS_ISSUE, SYNTHETIC_ANALYSIS_HISTORY);
}
