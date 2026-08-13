// scripts/verify-gemini-analysis.ts
//
// Proves the REAL structured-analysis path end to end, using WHOLLY FICTIONAL
// data, with the real-data gate still closed.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:gemini-analysis
//
// ── WHAT IS TRANSMITTED ─────────────────────────────────────────────────────
// One request, carrying GEMINI_SYNTHETIC_ANALYSIS_PROMPT — a frozen constant
// describing a fictional "Demo Systems" printer queue. No Issue title,
// description, root cause, resolution, historical content, staff name, SKU,
// link or attachment from this company is read or sent. This script does not
// import lib/db or any lib/queries module: there is no database connection in
// the process at all.
//
// ── WHY THE GATE STILL ALLOWS IT ────────────────────────────────────────────
// GEMINI_ALLOW_REAL_ISSUE_DATA remains false. The gate permits exactly two
// frozen strings, matched with `===`: the connectivity prompt and this
// analysis prompt. Anything else — including a real Issue — is refused by
// assertPromptAllowed() inside the same sender this script calls.
//
// ── WHAT IS PRINTED ─────────────────────────────────────────────────────────
// Safe metadata only: model, duration, validation result, confidence, and
// counts. The AI's prose is NOT printed unless a failure needs diagnosing.

import { sendAnalysisRequest } from "../lib/ai/geminiClient";
import { getGeminiFeatureStatus } from "../lib/ai/geminiConfig";
import { ANALYSIS_SYSTEM_INSTRUCTIONS } from "../lib/ai/analysisFlow";
import { HUMAN_VERIFICATION_WARNING, parseIssueAnalysis } from "../lib/ai/analysisSchema";
import { GEMINI_SYNTHETIC_ANALYSIS_PROMPT } from "../lib/ai/geminiPolicy";
import { buildSyntheticAnalysisPrompt } from "../lib/ai/syntheticAnalysisFixture";

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
}

function info(label: string, detail: string): void {
  console.log(`  INFO  ${label} — ${detail}`);
}

async function main(): Promise<void> {
  const status = getGeminiFeatureStatus();

  console.log("Gemini structured-analysis verification (synthetic data only).\n");
  console.log("1. Configuration and gate");
  info("enabled", String(status.enabled));
  info("configured", status.configured ? "YES" : "NO");
  info("model", status.model);
  info("allowRealIssueData", String(status.allowRealIssueData));
  check(
    "the real-data gate is STILL CLOSED",
    status.allowRealIssueData === false,
    "GEMINI_ALLOW_REAL_ISSUE_DATA is not \"true\""
  );

  // The frozen constant must still be exactly what the real builder renders.
  check(
    "the frozen synthetic prompt matches the real prompt builder",
    buildSyntheticAnalysisPrompt() === GEMINI_SYNTHETIC_ANALYSIS_PROMPT,
    "byte-identical"
  );
  check(
    "the synthetic prompt contains no company data",
    ["issue_tracking", "http", "@", "Laksika", "Nanthi", "Rajive", "WCSN"].every(
      (needle) => !GEMINI_SYNTHETIC_ANALYSIS_PROMPT.includes(needle)
    ),
    "fictional content only"
  );

  if (!status.enabled || !status.configured) {
    console.log("\nGemini is disabled or not configured — no request attempted.");
    console.log("\nAll checks passed.");
    return;
  }

  console.log("\n2. Live structured request (ONE, synthetic)");
  const startedAt = Date.now();
  let raw: string;
  try {
    const response = await sendAnalysisRequest({
      system: ANALYSIS_SYSTEM_INSTRUCTIONS,
      prompt: GEMINI_SYNTHETIC_ANALYSIS_PROMPT,
    });
    raw = response.text;
  } catch (error) {
    check(
      "structured request succeeded",
      false,
      error instanceof Error ? error.message : "Unknown error."
    );
    console.error("\n1 check(s) FAILED.");
    process.exit(1);
  }

  const durationMs = Date.now() - startedAt;
  info("model", status.model);
  info("request duration", `${durationMs}ms`);
  check("a non-empty response was returned", raw.trim() !== "", `${raw.length} characters`);

  console.log("\n3. Schema validation");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
    check("the response is valid JSON", true, "parsed");
  } catch {
    check("the response is valid JSON", false, "JSON.parse failed");
    // Diagnostic only, and only on failure. Truncated.
    console.error(`  raw (first 300 chars): ${raw.slice(0, 300)}`);
    console.error("\nverification FAILED.");
    process.exit(1);
  }

  const result = parseIssueAnalysis(parsedJson);
  check("schema validation", result.ok, result.ok ? "PASS" : `FAIL: ${result.errors.join(" | ")}`);

  if (!result.ok) {
    console.error("\nverification FAILED.");
    process.exit(1);
  }

  const analysis = result.value;
  console.log("\n4. Structured content");
  info("confidence", analysis.confidence);
  info("root causes", String(analysis.likelyRootCauses.length));
  info("areas to check", String(analysis.areasToCheck.length));
  info("investigation steps", String(analysis.investigationSteps.length));
  info("alternative solutions", String(analysis.alternativeSolutions.length));
  info("warnings", String(analysis.warnings.length));
  // Similar Past Issues are NOT part of the model's response any more: they
  // come from deterministic server-side retrieval and are rendered by the UI.

  check(
    "confidence is LOW, MEDIUM or HIGH",
    ["LOW", "MEDIUM", "HIGH"].includes(analysis.confidence),
    analysis.confidence
  );
  check(
    "every root cause carries its own valid confidence",
    analysis.likelyRootCauses.every((cause) => ["LOW", "MEDIUM", "HIGH"].includes(cause.confidence)),
    analysis.likelyRootCauses.map((cause) => cause.confidence).join(", ")
  );
  check("summary is present", analysis.summary.length > 0, `${analysis.summary.length} characters`);
  check("suggestedFix is present", analysis.suggestedFix.length > 0, `${analysis.suggestedFix.length} characters`);
  check("at least one root cause", analysis.likelyRootCauses.length > 0, String(analysis.likelyRootCauses.length));
  check("at least one area to check", analysis.areasToCheck.length > 0, String(analysis.areasToCheck.length));
  check(
    "at least one investigation step",
    analysis.investigationSteps.length > 0,
    String(analysis.investigationSteps.length)
  );
  check(
    "the mandatory human-verification warning is present",
    analysis.warnings.includes(HUMAN_VERIFICATION_WARNING),
    "YES"
  );
  check(
    "the response carries no historical-Issue field at all",
    !("relatedHistoricalIssues" in (analysis as unknown as Record<string, unknown>)),
    "removed from the model contract"
  );
  check(
    "past context is present but carries no Issue identifier",
    GEMINI_SYNTHETIC_ANALYSIS_PROMPT.includes("Past Context A") &&
      !/\b[A-Z]{2}-\d{3}\b/.test(GEMINI_SYNTHETIC_ANALYSIS_PROMPT),
    "labelled A/B, no reference"
  );
  check(
    "at most two past contexts are sent",
    !GEMINI_SYNTHETIC_ANALYSIS_PROMPT.includes("Past Context C"),
    "maximum 2"
  );
  check(
    "the analysis mentions no past context back to the user",
    !/Past Context|Similar Issue|similar past issue/i.test(JSON.stringify(analysis)),
    "hidden context stayed hidden"
  );

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All checks passed. One synthetic request; no company data was transmitted.");
}

main().catch((error) => {
  console.error("Verification aborted:", error instanceof Error ? error.message : "Unknown error.");
  process.exit(1);
});
