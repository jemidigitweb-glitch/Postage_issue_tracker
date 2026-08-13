// Gemini Stage 2 — the structured analysis response: types, limits, the JSON
// Schema a future stage will hand to the model, and the runtime validator that
// decides whether a reply may be shown to anyone.
//
// PURE: no `server-only`, no `@google/genai`, no `next/*`, no lib/db, no
// lib/queries. Directly unit-testable, and reachable from `npm test`.
//
// ── NO NEW DEPENDENCY ───────────────────────────────────────────────────────
// The validator is hand-written. This project has no schema library (no zod,
// no yup, no ajv) and the shape below is small, flat and fixed — adding a
// validation framework to check nine fields would be a larger change than the
// thing it validates, and every dependency here is one more thing between an
// untrusted model response and the user.
//
// ── DIRECTION MATTERS: THIS VALIDATOR REJECTS ───────────────────────────────
// lib/access/aiSanitization.ts handles the INBOUND direction (our own data ->
// the model) and TRUNCATES oversized text, because our data is legitimate and
// must not be blocked.
//
// This module handles the OUTBOUND direction (an untrusted model response ->
// a human being) and REJECTS anything that breaks the contract — oversized
// text, oversized arrays, wrong types, unknown confidence values. A response
// that does not obey the schema is a response we do not understand, and
// silently trimming it would hide that. Rejection is visible; a future stage
// answers it with one repair retry and then a clean error.
//
// The one exception is the human-verification warning, which is INJECTED after
// validation rather than demanded from the model — see below.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Present on every analysis that leaves this module, without exception. */
export const HUMAN_VERIFICATION_WARNING =
  "AI-generated guidance must be verified by a human before any operational action is taken.";

/** Confidence is a THREE-VALUE SCALE, never a number.
 *
 *  A language model's self-reported probability is not calibrated, and
 *  printing "87%" to an operations user would manufacture precision that does
 *  not exist. The validator rejects numeric confidence outright — see
 *  tests/analysisSchema.test.ts. */
export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Output limits. Oversized values are REJECTED (see the direction note above).
 *
 * `maxWarnings` applies to what the MODEL returns. The guaranteed
 * human-verification warning is added afterwards and is not counted against
 * it, so a model that fills its warning budget can never squeeze the
 * guaranteed one out.
 */
export const ANALYSIS_LIMITS = {
  /** Two or three short sentences. Tightened from 600 — a summary that runs
   *  longer than the Issue it summarises is not a summary. */
  summaryMaxLength: 400,
  /** ONE concise, actionable recommendation. */
  suggestedFixMaxLength: 400,
  /** Applies to every other individual string in the response. */
  itemMaxLength: 300,
  minRootCauses: 1,
  maxRootCauses: 3,
  minAreasToCheck: 1,
  maxAreasToCheck: 4,
  minInvestigationSteps: 1,
  maxInvestigationSteps: 5,
  maxAlternativeSolutions: 2,
  maxWarnings: 3,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisRootCause {
  cause: string;
  /** The evidence for it, drawn from the supplied context. Splitting the claim
   *  from its justification is what lets a human check an unsupported guess
   *  instead of it hiding inside prose. */
  whyLikely: string;
  confidence: ConfidenceLevel;
}

export interface AnalysisAreaToCheck {
  /** WHERE to look. Stage 2 accepts any non-empty label: the real LEDSone
   *  system-location map is a later stage, and inventing internal system names
   *  now is exactly the failure this design exists to prevent. Tests use
   *  synthetic labels only. */
  area: string;
  reason: string;
  check: string;
}

/**
 * NOTE — `relatedHistoricalIssues` was DELIBERATELY REMOVED from this contract.
 *
 * Similar Past Issues are produced by deterministic server-side retrieval
 * (lib/ai/similarIssueRetrieval.ts), which is exact, explainable and free.
 * Asking the model to restate them meant paying for tokens to reconstruct work
 * already done, and created a class of failure — invented references — that
 * had to be filtered out afterwards.
 *
 * The model now analyses the CURRENT Issue only. The UI joins the two.
 */
export interface IssueAnalysis {
  summary: string;
  likelyRootCauses: AnalysisRootCause[];
  confidence: ConfidenceLevel;
  areasToCheck: AnalysisAreaToCheck[];
  investigationSteps: string[];
  suggestedFix: string;
  alternativeSolutions: string[];
  /** Always non-empty, and always contains HUMAN_VERIFICATION_WARNING. */
  warnings: string[];
}

export type AnalysisParseResult =
  | { ok: true; value: IssueAnalysis }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// JSON Schema — for a future stage's structured-output request
// ---------------------------------------------------------------------------

/**
 * Uses only constructs the Gemini structured-output documentation lists as
 * supported (type, properties, required, description, enum, items, minItems,
 * maxItems). Max nesting depth 2: the docs warn that "very large or deeply
 * nested schemas may be rejected".
 *
 * Declared here, next to the types and the validator, so the three cannot
 * drift apart. NOT sent anywhere in Stage 2.
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "likelyRootCauses",
    "confidence",
    "areasToCheck",
    "investigationSteps",
    "suggestedFix",
    "alternativeSolutions",
    "warnings",
  ],
  properties: {
    summary: { type: "string", description: "Two or three SHORT sentences. Be concise." },
    likelyRootCauses: {
      type: "array",
      minItems: ANALYSIS_LIMITS.minRootCauses,
      maxItems: ANALYSIS_LIMITS.maxRootCauses,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cause", "whyLikely", "confidence"],
        properties: {
          cause: { type: "string" },
          whyLikely: { type: "string", description: "Evidence from the supplied context only." },
          confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
        },
      },
    },
    confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
    areasToCheck: {
      type: "array",
      minItems: ANALYSIS_LIMITS.minAreasToCheck,
      maxItems: ANALYSIS_LIMITS.maxAreasToCheck,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "reason", "check"],
        properties: {
          area: { type: "string" },
          reason: { type: "string" },
          check: { type: "string" },
        },
      },
    },
    investigationSteps: {
      type: "array",
      minItems: ANALYSIS_LIMITS.minInvestigationSteps,
      maxItems: ANALYSIS_LIMITS.maxInvestigationSteps,
      items: { type: "string" },
    },
    suggestedFix: { type: "string" },
    alternativeSolutions: {
      type: "array",
      maxItems: ANALYSIS_LIMITS.maxAlternativeSolutions,
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      maxItems: ANALYSIS_LIMITS.maxWarnings,
      items: { type: "string" },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string that is present, is really a string, is non-empty once trimmed,
 *  and is within its cap. Every failure is reported with its path. */
function readString(
  container: Record<string, unknown>,
  key: string,
  path: string,
  maxLength: number,
  errors: string[]
): string | null {
  const value = container[key];
  if (typeof value !== "string") {
    errors.push(`${path} must be a string (received ${describeType(value)}).`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    errors.push(`${path} must not be empty.`);
    return null;
  }
  if (trimmed.length > maxLength) {
    errors.push(`${path} exceeds ${maxLength} characters (${trimmed.length}).`);
    return null;
  }
  return trimmed;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function readConfidence(
  container: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): ConfidenceLevel | null {
  const value = container[key];
  // Explicitly reject a number BEFORE the enum check, so "confidence: 0.87"
  // produces a message about numeric confidence rather than a generic one.
  if (typeof value === "number") {
    errors.push(`${path} must be one of LOW, MEDIUM, HIGH — a numeric confidence is not accepted.`);
    return null;
  }
  if (typeof value !== "string" || !(CONFIDENCE_LEVELS as readonly string[]).includes(value)) {
    errors.push(`${path} must be exactly one of LOW, MEDIUM, HIGH.`);
    return null;
  }
  return value as ConfidenceLevel;
}

function readArray(
  container: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  errors: string[]
): unknown[] | null {
  const value = container[key];
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array (received ${describeType(value)}).`);
    return null;
  }
  if (value.length < min) {
    errors.push(`${path} must contain at least ${min} item(s).`);
    return null;
  }
  if (value.length > max) {
    errors.push(`${path} must contain at most ${max} item(s) (received ${value.length}).`);
    return null;
  }
  return value;
}

function readStringArray(
  container: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  errors: string[]
): string[] | null {
  const raw = readArray(container, key, path, min, max, errors);
  if (!raw) {
    return null;
  }
  const items: string[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry !== "string") {
      errors.push(`${path}[${index}] must be a string (received ${describeType(entry)}).`);
      return;
    }
    const trimmed = entry.trim();
    if (trimmed === "") {
      errors.push(`${path}[${index}] must not be empty.`);
      return;
    }
    if (trimmed.length > ANALYSIS_LIMITS.itemMaxLength) {
      errors.push(`${path}[${index}] exceeds ${ANALYSIS_LIMITS.itemMaxLength} characters.`);
      return;
    }
    items.push(trimmed);
  });
  return items;
}

/** Reads an array of fixed-shape objects. `fields` is the exact key list —
 *  anything else in the object is ignored, never copied. */
function readObjectArray<T extends Record<string, string>>(
  container: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  fields: readonly (keyof T & string)[],
  confidenceField: (keyof T & string) | null,
  errors: string[]
): T[] | null {
  const raw = readArray(container, key, path, min, max, errors);
  if (!raw) {
    return null;
  }

  const items: T[] = [];
  raw.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${entryPath} must be an object (received ${describeType(entry)}).`);
      return;
    }

    const built: Record<string, string> = {};
    let valid = true;

    for (const field of fields) {
      const value = readString(entry, field, `${entryPath}.${field}`, ANALYSIS_LIMITS.itemMaxLength, errors);
      if (value === null) {
        valid = false;
      } else {
        built[field] = value;
      }
    }

    if (confidenceField) {
      const level = readConfidence(entry, confidenceField, `${entryPath}.${confidenceField}`, errors);
      if (level === null) {
        valid = false;
      } else {
        built[confidenceField] = level;
      }
    }

    if (valid) {
      items.push(built as T);
    }
  });

  return items;
}

/**
 * Validates an untrusted value — a parsed model response — against the
 * contract above.
 *
 * On success the returned object is BUILT FIELD BY FIELD from validated
 * values: no property of the input is spread or carried through, so an extra
 * key the model invented cannot reach a caller, and the result is safe to
 * render.
 *
 * Every failure is collected (not thrown), so one call reports everything
 * wrong with a response rather than only the first problem.
 */
export function parseIssueAnalysis(value: unknown): AnalysisParseResult {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: [`Response must be a JSON object (received ${describeType(value)}).`] };
  }

  const summary = readString(value, "summary", "summary", ANALYSIS_LIMITS.summaryMaxLength, errors);
  const confidence = readConfidence(value, "confidence", "confidence", errors);
  const suggestedFix = readString(
    value,
    "suggestedFix",
    "suggestedFix",
    ANALYSIS_LIMITS.suggestedFixMaxLength,
    errors
  );

  const likelyRootCauses = readObjectArray<AnalysisRootCause & Record<string, string>>(
    value,
    "likelyRootCauses",
    "likelyRootCauses",
    ANALYSIS_LIMITS.minRootCauses,
    ANALYSIS_LIMITS.maxRootCauses,
    ["cause", "whyLikely"],
    "confidence",
    errors
  );

  const areasToCheck = readObjectArray<AnalysisAreaToCheck & Record<string, string>>(
    value,
    "areasToCheck",
    "areasToCheck",
    ANALYSIS_LIMITS.minAreasToCheck,
    ANALYSIS_LIMITS.maxAreasToCheck,
    ["area", "reason", "check"],
    null,
    errors
  );

  const investigationSteps = readStringArray(
    value,
    "investigationSteps",
    "investigationSteps",
    ANALYSIS_LIMITS.minInvestigationSteps,
    ANALYSIS_LIMITS.maxInvestigationSteps,
    errors
  );

  const alternativeSolutions = readStringArray(
    value,
    "alternativeSolutions",
    "alternativeSolutions",
    0,
    ANALYSIS_LIMITS.maxAlternativeSolutions,
    errors
  );

  const warnings = readStringArray(value, "warnings", "warnings", 0, ANALYSIS_LIMITS.maxWarnings, errors);

  if (
    errors.length > 0 ||
    summary === null ||
    confidence === null ||
    suggestedFix === null ||
    likelyRootCauses === null ||
    areasToCheck === null ||
    investigationSteps === null ||
    alternativeSolutions === null ||
    warnings === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      summary,
      likelyRootCauses,
      confidence,
      areasToCheck,
      investigationSteps,
      suggestedFix,
      alternativeSolutions,
      warnings: withGuaranteedWarning(warnings),
    },
  };
}

/**
 * Guarantees the human-verification warning at APPLICATION level.
 *
 * The model is asked for it in the prompt, but nothing here depends on the
 * model complying: if the exact warning is absent it is prepended. That makes
 * "every analysis a user sees carries the warning" a property of this code
 * rather than a hope about a language model.
 *
 * Exported so a caller can assert it independently.
 */
export function withGuaranteedWarning(warnings: readonly string[]): string[] {
  const alreadyPresent = warnings.some((warning) => warning.trim() === HUMAN_VERIFICATION_WARNING);
  return alreadyPresent ? [...warnings] : [HUMAN_VERIFICATION_WARNING, ...warnings];
}
