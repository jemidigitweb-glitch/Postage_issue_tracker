import "server-only";

import { GoogleGenAI } from "@google/genai";

import { ANALYSIS_JSON_SCHEMA } from "./analysisSchema";
import { getGeminiFeatureStatus, readGeminiApiKeyForClient } from "./geminiConfig";
import {
  assertPromptAllowed,
  performSyntheticCheck,
  redactSecret,
  type GeminiSendResult,
  type GeminiSyntheticOutcome,
} from "./geminiPolicy";

// Gemini Stage 1 — the ONLY module that talks to the Gemini API.
//
// `server-only`: a build error if this is ever pulled into a Client Component,
// so the SDK, the key, and every outbound request stay on the server.
//
// ── WHAT THIS MODULE CAN DO ─────────────────────────────────────────────────
// Exactly one thing: send the frozen synthetic connectivity prompt and report
// whether a reply came back. That is the whole Stage 1 surface.
//
// ── WHAT IT CANNOT DO ───────────────────────────────────────────────────────
// There is no exported function that accepts an Issue, an issue id, a
// description, a resolution, an attachment, or any other argument at all —
// runGeminiSyntheticCheck() takes NO parameters. It imports nothing from
// lib/queries/*, and it does not import lib/db. There is therefore no code
// path, reachable or otherwise, that could read PostgreSQL and forward it.
// The GEMINI_ALLOW_REAL_ISSUE_DATA gate in ./geminiPolicy.ts sits behind that
// as a second line of defence for whenever a later stage adds a real path.
//
// ── API SHAPE ───────────────────────────────────────────────────────────────
// Verified 2026-08-13 against https://ai.google.dev/gemini-api/docs/quickstart
// and against the installed types (node_modules/@google/genai v2.17.0,
// dist/genai.d.ts):
//   new GoogleGenAI({ apiKey })
//   ai.interactions.create({ model, input })  -> GoogleGenAIInteraction
//   interaction.output_text?: string          ("added by the SDK")
// `input` accepts a plain string (InteractionsInput = string | ...).

/** Hard ceiling on the connectivity probe. A stuck socket must not hold a
 *  script — or, later, a request — open indefinitely.
 *
 *  Implemented as a race rather than through an SDK option: the abort
 *  behaviour of this SDK version has not been verified here, and a wrong
 *  assumption about it would be a silent hang. The race is unconditional. */
const SYNTHETIC_TIMEOUT_MS = 30_000;

class GeminiTimeoutError extends Error {
  constructor(ms: number) {
    super(`Gemini did not respond within ${ms}ms.`);
    this.name = "GeminiTimeoutError";
  }
}

/**
 * Wraps a promise in a timeout. The timer is always cleared, so a resolved
 * request never leaves a pending handle keeping the process alive.
 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new GeminiTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Runs the synthetic connectivity check.
 *
 * Takes NO arguments — there is nothing a caller could pass that would change
 * what is transmitted. Never throws: every failure, including a closed gate,
 * comes back as a result object, so a caller can report it without a
 * try/catch and a page can never be broken by Gemini being unavailable.
 */
export async function runGeminiSyntheticCheck(): Promise<GeminiSyntheticOutcome> {
  const status = getGeminiFeatureStatus();

  // Resolved once, here. If the feature is disabled or unconfigured,
  // performSyntheticCheck returns before ever invoking the sender below, so no
  // client is constructed and no network call is made.
  const apiKey = readGeminiApiKeyForClient();

  return performSyntheticCheck(status, async ({ model, input }): Promise<GeminiSendResult> => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const interaction = await withTimeout(
        ai.interactions.create({ model, input }),
        SYNTHETIC_TIMEOUT_MS
      );
      return { output_text: interaction.output_text };
    } catch (error) {
      // The key is redacted before the message travels anywhere. An SDK error
      // is not expected to contain it, but "not expected to" is not a
      // guarantee, and this is the last point at which we still know the value
      // and can strip it.
      const raw = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : "Error";
      throw new Error(`${name}: ${redactSecret(raw, apiKey)}`);
    }
  });
}

/** Hard ceiling on an analysis request. Longer than the connectivity probe:
 *  a Flash model reasoning over ~3k tokens with thinking enabled is expected
 *  to take seconds, not milliseconds. */
const ANALYSIS_TIMEOUT_MS = 45_000;

/**
 * The structured-analysis transport for app/dashboard/issues/ai-actions.ts.
 *
 * ── THIS IS NOT A GATE ──────────────────────────────────────────────────────
 * Every safety decision has already been made before this runs:
 * lib/ai/analysisFlow.ts checks enabled / configured / allowRealIssueData and
 * returns without calling a sender when any of them is closed. This function
 * therefore assumes it may transmit — and it is reached only on that basis.
 *
 * assertPromptAllowed() is called anyway as a LAST line of defence: while
 * GEMINI_ALLOW_REAL_ISSUE_DATA is false it throws for anything that is not the
 * frozen synthetic prompt, so even a future miswiring cannot push Issue text
 * out through this path.
 *
 * Structured output: the model is given ANALYSIS_JSON_SCHEMA and asked for
 * JSON, per the current structured-output documentation. The response is still
 * parsed and validated by the caller — a schema request is not a guarantee.
 */
export async function sendAnalysisRequest(request: {
  system: string;
  prompt: string;
}): Promise<{ text: string }> {
  const status = getGeminiFeatureStatus();
  const apiKey = readGeminiApiKeyForClient();

  // Throws RealIssueDataBlockedError unless the real-data gate is open.
  assertPromptAllowed(request.prompt, status);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await withTimeout(
      ai.interactions.create({
        model: status.model,
        input: `${request.system}\n\n${request.prompt}`,
        // Structured output, per the current documentation. `response_format`
        // is in the installed SDK's own types (genai.d.ts), so no cast is
        // needed. The reply is still parsed and validated by the caller — a
        // schema request is not a guarantee.
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: ANALYSIS_JSON_SCHEMA,
        },
      }),
      ANALYSIS_TIMEOUT_MS
    );
    return { text: interaction.output_text ?? "" };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";
    // Redacted before it travels anywhere, exactly as above.
    throw new Error(`${name}: ${redactSecret(raw, apiKey)}`);
  }
}
