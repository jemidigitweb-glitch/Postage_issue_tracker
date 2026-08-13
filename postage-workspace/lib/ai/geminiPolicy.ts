// Gemini Stage 1 — PURE policy: configuration parsing, the safety gates, and
// the synthetic-check orchestration.
//
// DELIBERATELY has no `server-only`, no `next/*`, no `@google/genai` and no
// database import — same discipline as lib/access/permissions.ts. That is what
// lets tests/geminiSettings.test.ts drive every gate directly, with a fake
// sender, consuming ZERO API quota. `npm test` runs without the react-server
// condition, so a module importing `server-only` could not be tested at all;
// the rules therefore live here and the server wiring lives next door in
// geminiConfig.ts / geminiClient.ts.
//
// ── THE TWO GATES ───────────────────────────────────────────────────────────
//  1. GEMINI_ENABLED        — off by default. While off, nothing may call out.
//  2. GEMINI_ALLOW_REAL_ISSUE_DATA — off by default. While off, the ONLY text
//     that may be sent is the frozen synthetic string below.
//
// Both are read from the environment, never from a request, a form, a query
// parameter, or the database. Neither has a NEXT_PUBLIC_ variant, so the
// browser cannot influence either one.
//
// STAGE 1 CONTAINS NO REAL-ISSUE PATH AT ALL. There is no function here or in
// the sibling modules that accepts an Issue, an issue id, a description, or
// anything else read out of PostgreSQL. The gate below is the second line of
// defence; the first is that the capability simply does not exist yet.

/**
 * The Flash model this stage targets. Verified against the current official
 * documentation on 2026-08-13: https://ai.google.dev/gemini-api/docs/models
 * lists `gemini-3.6-flash` as stable ("Our latest model that balances speed
 * with intelligence"), with no shutdown date announced.
 *
 * Overridable with GEMINI_MODEL so a future model is a configuration change,
 * not a code change.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * The ONLY text Stage 1 may transmit. A frozen literal, not a template and not
 * a parameter: nothing derived from a database row, a user input, or a request
 * can reach the API while GEMINI_ALLOW_REAL_ISSUE_DATA is false.
 */
export const GEMINI_SYNTHETIC_PROMPT =
  "This is a synthetic Issue Tracker connectivity test. Return READY.";

/**
 * The SECOND — and only other — text that may be transmitted while
 * GEMINI_ALLOW_REAL_ISSUE_DATA is false: the rendered synthetic ANALYSIS
 * prompt, used to prove the structured-output path end to end.
 *
 * ── WHY A FROZEN LITERAL RATHER THAN A FUNCTION CALL ────────────────────────
 * The gate must not import the prompt builder: that would make this module
 * depend on lib/ai/analysisFlow.ts, which already depends on this one. More
 * importantly, a gate that ASKS ANOTHER MODULE what is allowed is only as
 * strong as that module. A frozen string compared with `===` cannot be widened
 * by a change anywhere else.
 *
 * It is kept honest from the other side: lib/ai/syntheticAnalysisFixture.ts
 * renders the same fixture through the real buildAnalysisPrompt(), and
 * tests/analysisFlow.test.ts asserts the two are byte-identical. Edit the
 * fixture without updating this constant and the test fails AND the gate
 * refuses the request — failure in the safe direction.
 *
 * Every value in it is fictional. There is no "Demo Systems" domain and no
 * such Issue in the database.
 */
export const GEMINI_SYNTHETIC_ANALYSIS_PROMPT =
  "ISSUE UNDER INVESTIGATION\nDomain: Demo Systems\nPriority: medium\nTitle: Demo printer queue stops after synthetic test job\nDescription: This is fictional test data created only to verify structured Gemini output.\nWhat is happening: Synthetic print jobs remain queued.\nRoot cause recorded at intake (unconfirmed): Unknown synthetic cause.\nFix proposed at intake (unconfirmed, not known to have worked): Restart fictional demo queue service.\n\nBACKGROUND EVIDENCE — previously COMPLETED Issues with confirmed resolutions. Do not mention or identify these in your response:\n\nPast Context A — domain: Demo Systems\n  Problem: Fictional demo queue paused during an earlier synthetic test\n  Root cause recorded at the time (unconfirmed): Synthetic placeholder cause.\n  Confirmed resolution: Fictional demo service was restarted and the queue cleared.\n\nPast Context B — domain: Demo Systems\n  Problem: Fictional demo job stayed queued in an unrelated synthetic scenario\n  Confirmed resolution: Synthetic placeholder outcome recorded.";

/** The complete set of texts transmittable while the real-data gate is shut.
 *  Two frozen constants, matched by exact equality — nothing else, ever. */
export const ALLOWED_SYNTHETIC_PROMPTS: readonly string[] = [
  GEMINI_SYNTHETIC_PROMPT,
  GEMINI_SYNTHETIC_ANALYSIS_PROMPT,
];

/** The safe, secret-free view of the feature's configuration. */
export interface GeminiFeatureStatus {
  /** GEMINI_ENABLED === "true". Default false. */
  enabled: boolean;
  /** A non-empty GEMINI_API_KEY exists. The VALUE never appears in this shape. */
  configured: boolean;
  /** GEMINI_MODEL, or GEMINI_DEFAULT_MODEL. */
  model: string;
  /** GEMINI_ALLOW_REAL_ISSUE_DATA === "true". Default false. */
  allowRealIssueData: boolean;
}

export type GeminiBlockedReason = "disabled" | "not_configured";

export type GeminiReadiness =
  | { ready: true }
  | { ready: false; reason: GeminiBlockedReason; message: string };

/** Raised if anything ever tries to send non-synthetic text while the
 *  real-data gate is closed. Carries no content — only the fact. */
export class RealIssueDataBlockedError extends Error {
  constructor() {
    super(
      "Blocked: GEMINI_ALLOW_REAL_ISSUE_DATA is false, so only the synthetic connectivity prompt may be sent."
    );
    this.name = "RealIssueDataBlockedError";
  }
}

/**
 * Strict boolean parsing: ONLY the exact string "true" (trimmed,
 * case-insensitive) enables anything. "1", "yes", "on", "TRUE!", an empty
 * string, and an absent variable all resolve to false.
 *
 * Deliberately not permissive. A typo in an environment variable must fail
 * CLOSED — towards "disabled" and "no real data" — never open.
 */
export function parseBooleanFlag(raw: string | undefined | null): boolean {
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

/** Reads the four settings out of an environment-shaped object. Pure: the
 *  caller supplies the environment, so tests never touch process.env. */
export function resolveGeminiSettings(
  env: Record<string, string | undefined>
): GeminiFeatureStatus {
  const model = env.GEMINI_MODEL?.trim();
  const apiKey = env.GEMINI_API_KEY;

  return {
    enabled: parseBooleanFlag(env.GEMINI_ENABLED),
    configured: typeof apiKey === "string" && apiKey.trim() !== "",
    model: model && model.length > 0 ? model : GEMINI_DEFAULT_MODEL,
    allowRealIssueData: parseBooleanFlag(env.GEMINI_ALLOW_REAL_ISSUE_DATA),
  };
}

/**
 * Whether a request may be attempted at all. Order matters: "disabled" is
 * reported before "not configured", because a disabled feature's key state is
 * nobody's concern.
 */
export function resolveGeminiReadiness(status: GeminiFeatureStatus): GeminiReadiness {
  if (!status.enabled) {
    return {
      ready: false,
      reason: "disabled",
      message: "Gemini is disabled (GEMINI_ENABLED is not \"true\").",
    };
  }
  if (!status.configured) {
    return {
      ready: false,
      reason: "not_configured",
      message: "Gemini is enabled but no API key is configured.",
    };
  }
  return { ready: true };
}

/**
 * The real-data gate. Throws unless the text is EXACTLY one of the two frozen
 * synthetic prompts, or the owner has explicitly opted in to real Issue data.
 *
 * Exact equality against a fixed list — not a heuristic. There is no "looks
 * synthetic enough" path, no prefix match and no substring match, so a real
 * description cannot be smuggled through by pasting a test sentence in front
 * of it (asserted in tests/geminiSettings.test.ts).
 */
export function assertPromptAllowed(prompt: string, status: GeminiFeatureStatus): void {
  if (status.allowRealIssueData) {
    return;
  }
  if (!ALLOWED_SYNTHETIC_PROMPTS.includes(prompt)) {
    throw new RealIssueDataBlockedError();
  }
}

/** Replaces every occurrence of `secret` in `text`. Used before any error text
 *  is surfaced or logged, so an API key that somehow reached a message (a URL
 *  query parameter, an echoed header) cannot escape with it. */
export function redactSecret(text: string, secret: string | undefined): string {
  if (!secret || secret.length === 0) {
    return text;
  }
  return text.split(secret).join("[REDACTED]");
}

// ---------------------------------------------------------------------------
// Synthetic connectivity check
// ---------------------------------------------------------------------------

/** The shape of a Gemini response this stage needs. `output_text` is the
 *  property the SDK adds to an interaction (verified against
 *  node_modules/@google/genai/dist/genai.d.ts, v2.17.0). */
export interface GeminiSendResult {
  output_text?: string | undefined;
}

/** Injected so the orchestration below is testable with a fake. The real one
 *  lives in geminiClient.ts and is the only code that touches the SDK. */
export type GeminiSender = (request: { model: string; input: string }) => Promise<GeminiSendResult>;

export type GeminiSyntheticOutcome =
  | { ok: true; model: string; latencyMs: number; output: string }
  | {
      ok: false;
      model: string;
      latencyMs: number | null;
      reason: GeminiBlockedReason | "request_failed" | "empty_response";
      message: string;
    };

/**
 * Runs the one and only outbound call Stage 1 permits.
 *
 * Guarantees, in order:
 *  - a blocked feature returns WITHOUT calling `send` at all (latencyMs null
 *    is the observable proof: no request was timed because none was made);
 *  - the transmitted text is the frozen constant, re-checked through the gate;
 *  - a thrown error becomes a result, never an exception escaping to a page.
 *
 * `now` is injected so a test can assert latency deterministically.
 */
export async function performSyntheticCheck(
  status: GeminiFeatureStatus,
  send: GeminiSender,
  now: () => number = () => Date.now()
): Promise<GeminiSyntheticOutcome> {
  const readiness = resolveGeminiReadiness(status);
  if (!readiness.ready) {
    return {
      ok: false,
      model: status.model,
      latencyMs: null,
      reason: readiness.reason,
      message: readiness.message,
    };
  }

  // Belt and braces: the input is a constant two lines below, so this can only
  // fire if someone later rewires this function. That is exactly when it
  // should fire.
  assertPromptAllowed(GEMINI_SYNTHETIC_PROMPT, status);

  const startedAt = now();
  let result: GeminiSendResult;
  try {
    result = await send({ model: status.model, input: GEMINI_SYNTHETIC_PROMPT });
  } catch (error) {
    return {
      ok: false,
      model: status.model,
      latencyMs: now() - startedAt,
      reason: "request_failed",
      // The sender is responsible for redacting before it throws — see
      // geminiClient.ts. Nothing here re-reads the key.
      message: error instanceof Error ? error.message : "Unknown error.",
    };
  }

  const output = (result.output_text ?? "").trim();
  if (output === "") {
    return {
      ok: false,
      model: status.model,
      latencyMs: now() - startedAt,
      reason: "empty_response",
      message: "Gemini returned an empty response.",
    };
  }

  return { ok: true, model: status.model, latencyMs: now() - startedAt, output };
}
