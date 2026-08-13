// scripts/verify-gemini-setup.ts
//
// Stage 1 verification for the Gemini foundation.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:gemini-setup
//
// ── WHAT THIS SCRIPT WILL NEVER DO ──────────────────────────────────────────
// It does not import lib/db, any lib/queries/* module, or anything that could
// reach PostgreSQL — there is no database connection in this process at all.
// The only text it can transmit is the frozen synthetic prompt in
// lib/ai/geminiPolicy.ts. No Issue content of any kind is read or sent.
//
// It prints the API key's PRESENCE and nothing else about it: never the value,
// never a prefix, never a length, never a fingerprint.
//
// ── HOW MANY REQUESTS ───────────────────────────────────────────────────────
// At most ONE, and only when the feature is both enabled and configured.
// Disabled, or enabled-but-unconfigured, both exit without touching the
// network — which is the point of the check.

import { runGeminiSyntheticCheck } from "../lib/ai/geminiClient";
import { getGeminiFeatureStatus } from "../lib/ai/geminiConfig";
import { GEMINI_SYNTHETIC_PROMPT } from "../lib/ai/geminiPolicy";

let failures = 0;

function pass(label: string, detail: string): void {
  console.log(`  PASS  ${label} — ${detail}`);
}

function info(label: string, detail: string): void {
  console.log(`  INFO  ${label} — ${detail}`);
}

function fail(label: string, detail: string): void {
  failures += 1;
  console.error(`  FAIL  ${label} — ${detail}`);
}

async function main(): Promise<void> {
  const status = getGeminiFeatureStatus();

  console.log("Gemini Stage 1 setup verification.\n");
  console.log("1. Configuration");
  info("enabled", String(status.enabled));
  info("configured", status.configured ? "YES" : "NO");
  info("model", status.model);
  info("allowRealIssueData", String(status.allowRealIssueData));

  // A secret-free status object is a Stage 1 requirement, so assert it rather
  // than assuming it.
  const serialized = JSON.stringify(status);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim() !== "" && serialized.includes(apiKey.trim())) {
    fail("status object contains no secret", "the API key appeared in the status object");
  } else {
    pass("status object contains no secret", "enabled/configured/model/allowRealIssueData only");
  }

  console.log("\n2. Safety gate");
  if (status.allowRealIssueData) {
    // Not a failure — it is an explicit owner decision — but it must be loud.
    info(
      "REAL ISSUE DATA IS PERMITTED",
      "GEMINI_ALLOW_REAL_ISSUE_DATA is \"true\". Stage 1 still implements no real-data path."
    );
  } else {
    pass("real Issue data is blocked", "GEMINI_ALLOW_REAL_ISSUE_DATA is not \"true\"");
  }
  info("only transmittable text", JSON.stringify(GEMINI_SYNTHETIC_PROMPT));

  console.log("\n3. Connectivity");
  if (!status.enabled) {
    pass("Gemini feature disabled", "no request attempted");
    console.log("\nAll checks passed. Gemini is disabled; nothing was sent.");
    return;
  }

  if (!status.configured) {
    info("Gemini enabled but not configured", "set GEMINI_API_KEY to run the synthetic check");
    console.log("\nAll checks passed. No request was attempted.");
    return;
  }

  info("synthetic request", "sending the frozen test prompt (one request)");
  const outcome = await runGeminiSyntheticCheck();

  if (outcome.ok) {
    pass("synthetic request succeeded", `${outcome.latencyMs}ms · model ${outcome.model}`);
    // The reply is model output about a dummy prompt — safe to show, and
    // useful for confirming the round trip really happened.
    info("response", JSON.stringify(outcome.output.slice(0, 200)));
  } else {
    fail("synthetic request failed", `${outcome.reason}: ${outcome.message}`);
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((error) => {
  // Never print a raw error object: it can carry request configuration.
  console.error("Verification aborted:", error instanceof Error ? error.message : "Unknown error.");
  process.exit(1);
});
