// Gemini Stage 2 — the sanitization layer.
//
// DELIBERATELY has no `server-only`, no `next/*`, no `@google/genai`, no
// lib/db and no lib/queries import — same discipline as
// lib/access/permissions.ts, so every rule is directly unit-testable
// (tests/aiSanitization.test.ts) and `npm test`, which runs without the
// react-server condition, can reach it.
//
// ── THE CENTRAL RULE: ALLOW-LIST BY CONSTRUCTION ────────────────────────────
// Both functions below BUILD A NEW OBJECT LITERAL, field by field. Neither
// spreads its input, neither forwards `extraData`, and neither copies a key it
// was not written to copy. A field added to the Issue shape in future is
// therefore excluded by default — the safe direction — and a reviewer can see
// the entire outbound surface by reading two object literals.
//
// Redaction (below) is DEFENCE IN DEPTH for the free-text fields that ARE
// allowed through, where a person may have pasted something they should not
// have. It is not the primary mechanism and is not claimed to be complete —
// see REDACTION LIMITATIONS.
//
// ── WHAT THIS MODULE DOES NOT DO ────────────────────────────────────────────
// It does not authorize sending anything anywhere. It has no network access,
// no Gemini import, and no knowledge that Gemini exists. Producing a sanitized
// object is not permission to transmit it: that remains gated by
// GEMINI_ALLOW_REAL_ISSUE_DATA in lib/ai/geminiPolicy.ts, which is false.

// ---------------------------------------------------------------------------
// Limits — INBOUND text is TRUNCATED, never rejected
// ---------------------------------------------------------------------------

/**
 * Inbound direction (our own database -> AI context): oversized text is
 * TRUNCATED with a visible marker.
 *
 * Rejecting would be wrong here: the data is ours, it is already stored, and a
 * long root-cause note is a legitimate Issue, not an attack. Truncation is
 * lossy but never blocks an assignee from getting help.
 *
 * (The OUTBOUND direction — a model response — is the opposite: see
 * lib/ai/analysisSchema.ts, which REJECTS anything oversized rather than
 * silently trimming a response we did not write.)
 */
export const SANITIZED_FIELD_LIMITS = {
  title: 200,
  description: 1500,
  rootCause: 1500,
  /** Historical context is deliberately tighter than current-Issue context.
   *  Retained for sanitizeHistoricalIssueForAi(), which is no longer part of
   *  the AI path — see the note on that function. */
  historicalSummary: 300,
  historicalRootCause: 600,
  historicalResolution: 600,
} as const;

const TRUNCATION_MARKER = "…[truncated]";

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export const REDACTED_CREDENTIAL = "[redacted]";
export const REDACTED_LINK = "[link removed]";
export const REDACTED_EMAIL = "[email removed]";
export const REDACTED_NUMBER = "[number removed]";

/**
 * Credential-shaped text. Ordered FIRST, before the URL rule, so a connection
 * string is redacted as a credential rather than merely stripped as a link.
 *
 * Every replacement is a fixed placeholder — nothing is echoed back, not even
 * a prefix or a length.
 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  // Connection strings of any common flavour, including DATABASE_URL and
  // MIGRATION_DB_URL values pasted into a note.
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|mssql)\s*:\/\/\S+/gi,
  // Google API keys.
  /\bAIza[0-9A-Za-z_-]{10,}/g,
  // OpenAI-style and generic "sk-" secrets.
  /\bsk-[A-Za-z0-9_-]{10,}/g,
  // Authorization headers.
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  // NAME=value assignments for anything credential-flavoured.
  /\b(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|auth[_-]?secret|database[_-]?url|migration[_-]?db[_-]?url|cloudinary[_-]?\w*|gemini[_-]?api[_-]?key)\b\s*[:=]\s*\S+/gi,
  // bcrypt hashes.
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/g,
];

/**
 * High-entropy runs — session ids, signatures, JWTs, opaque tokens.
 *
 * Handled separately from the list above because a length-only rule is too
 * blunt: `/[A-Za-z0-9+/]{40,}/` also matches 2,000 repeated "x" characters, or
 * any long unbroken word, and redacting those would destroy ordinary text
 * while adding no safety. Each candidate is therefore length-matched first and
 * then CHECKED FOR CHARACTER-CLASS MIXING, which every real token has and a
 * repeated character does not.
 */
const LONG_HEX_PATTERN = /\b[A-Fa-f0-9]{32,}\b/g;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9+/]{40,}={0,2}\b/g;

function hasCharacterClasses(value: string, classes: readonly RegExp[]): boolean {
  return classes.every((pattern) => pattern.test(value));
}

/** A 32+ character hex run that actually mixes digits and letters. */
export function looksLikeHexSecret(value: string): boolean {
  return hasCharacterClasses(value, [/\d/, /[A-Fa-f]/]);
}

/** A 40+ character run that mixes lower case, upper case and digits — the
 *  shape of a JWT or an opaque API token, not of a long word. */
export function looksLikeOpaqueToken(value: string): boolean {
  return hasCharacterClasses(value, [/[a-z]/, /[A-Z]/, /\d/]);
}

/** Any URL. Removes Cloudinary asset URLs, dashboard links and internal
 *  hostnames that a person pasted into free text. */
const URL_PATTERNS: readonly RegExp[] = [/\bhttps?:\/\/\S+/gi, /\bwww\.[^\s]+/gi];

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Number rules, deliberately narrow to avoid destroying diagnostic detail.
 *
 *  1. NINE OR MORE CONSECUTIVE digits — phone numbers typed without spacing,
 *     account numbers, and the 18-digit DHL Sendungsnummer.
 *  2. A run beginning with an explicit "+" country code, or a "(area)" group,
 *     that contains at least nine digits in total.
 *
 * A date such as "2026-08-13 10:19" is NOT matched by either rule, which is
 * the point: dates are diagnostically useful and are not personal data.
 */
const CONSECUTIVE_DIGITS_PATTERN = /\d{9,}/g;
const FORMATTED_PHONE_PATTERNS: readonly RegExp[] = [
  /\+\d[\d\s().-]{7,}\d/g,
  /\(\d{2,5}\)[\s.-]?[\d\s().-]{5,}\d/g,
];

function countDigits(value: string): number {
  let digits = 0;
  for (const character of value) {
    if (character >= "0" && character <= "9") {
      digits += 1;
    }
  }
  return digits;
}

/** Strips ASCII control characters, which have no place in stored prose and
 *  can be used to disguise text. */
function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 0x0a || code === 0x09 || (code >= 0x20 && code !== 0x7f);
    })
    .join("");
}

/**
 * Deterministic redaction of one free-text field. No AI, no heuristics beyond
 * the fixed patterns above, no network — the same input always produces the
 * same output.
 *
 * ── REDACTION LIMITATIONS (documented deliberately) ─────────────────────────
 * This is a safety net, NOT a guarantee. It reliably removes the shapes listed
 * above. It does NOT and cannot detect:
 *   - a person's name typed into a description ("call Laksika about this");
 *   - a locally-formatted phone number with no "+" and no parentheses,
 *     e.g. "077 1234 5678";
 *   - a postal address;
 *   - a password or token that looks like an ordinary word;
 *   - a customer or supplier identity implied by context.
 * Structured personal fields (staff name, member, assignee) are handled by
 * OMISSION — they are simply not in the allow-list — which is the mechanism
 * that is actually reliable. Free-text redaction is the residual risk, and it
 * is a real one.
 */
export function redactFreeText(value: string): string {
  let text = stripControlCharacters(value);

  for (const pattern of CREDENTIAL_PATTERNS) {
    text = text.replace(pattern, REDACTED_CREDENTIAL);
  }
  text = text.replace(LONG_HEX_PATTERN, (match) =>
    looksLikeHexSecret(match) ? REDACTED_CREDENTIAL : match
  );
  text = text.replace(LONG_TOKEN_PATTERN, (match) =>
    looksLikeOpaqueToken(match) ? REDACTED_CREDENTIAL : match
  );
  for (const pattern of URL_PATTERNS) {
    text = text.replace(pattern, REDACTED_LINK);
  }
  text = text.replace(EMAIL_PATTERN, REDACTED_EMAIL);
  text = text.replace(CONSECUTIVE_DIGITS_PATTERN, REDACTED_NUMBER);
  for (const pattern of FORMATTED_PHONE_PATTERNS) {
    text = text.replace(pattern, (match) => (countDigits(match) >= 9 ? REDACTED_NUMBER : match));
  }

  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Redact, then truncate to `limit`. Returns null for anything that is empty
 *  once cleaned, so an absent field and a whitespace-only field look the
 *  same to the caller. */
function cleanOptionalText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const redacted = redactFreeText(value);
  if (redacted === "") {
    return null;
  }
  return redacted.length <= limit ? redacted : `${redacted.slice(0, limit)}${TRUNCATION_MARKER}`;
}

/** Same, for a field that must always be present. */
function cleanRequiredText(value: unknown, limit: number): string {
  return cleanOptionalText(value, limit) ?? "";
}

// ---------------------------------------------------------------------------
// Current Issue
// ---------------------------------------------------------------------------

/**
 * The INPUT shape. Structurally a subset of the `IssueDetail` returned by
 * lib/queries/issues.ts getIssueById(), so a caller can pass that object
 * directly — but declared locally on purpose: importing the query module would
 * pull `server-only` into a module that must stay testable, and would couple
 * the sanitizer to the database layer it exists to protect the system from.
 *
 * A caller may pass a WIDER object (the full IssueDetail, extra fields and
 * all). That is safe: nothing here iterates the input, so an unknown field
 * cannot be copied to the output by accident.
 */
export interface IssueForAiInput {
  title: string;
  description: string;
  /** issues.category — the "Domain". */
  category: string;
  /** The raw JSONB blob. Exactly ONE key is ever read out of it. */
  extraData: Record<string, unknown>;
}

/**
 * The OUTPUT shape — the complete, exhaustive list of what may ever leave this
 * system for the current Issue. FOUR fields.
 *
 * Reduced from seven by owner decision: the model analyses the problem
 * statement (title, description, domain) and the human's suspected cause, and
 * nothing else. Priority, "What Is Happening" and the intake-time
 * "Fix & Action Required" were removed from the AI path — they remain in the
 * database and in the normal UI, untouched; they are simply not analysis
 * input.
 *
 * Note what is NOT here, and cannot be added by any input: issueId, status,
 * priority, whatIsHappening, resolution, final_resolution, implementation
 * fields, comments, history, staffCode, staffName, member, assignee, sku,
 * dataLink, images, attachments, sourceFile, sourceId, originalOwner,
 * provenance, timestamps, deletion state, user/assignment ids, or anything
 * else from extra_data.
 */
export interface SanitizedIssueForAi {
  title: string;
  description: string;
  domain: string;
  /** extra_data.rootCause — human-entered and UNVERIFIED. Presented to the
   *  model as a REPORTED / SUSPECTED cause to weigh, never as fact. */
  rootCause: string | null;
}

/**
 * Builds the AI context for the Issue currently being investigated.
 *
 * PURE: the input object is never mutated, and the returned object shares no
 * reference with it.
 */
export function sanitizeIssueForAi(issue: IssueForAiInput): SanitizedIssueForAi {
  // ONE allow-listed extra_data key. Every other key — including keys nobody
  // has seen yet — is unreachable from here, because nothing iterates the blob.
  const extra = issue.extraData ?? {};

  return {
    title: cleanRequiredText(issue.title, SANITIZED_FIELD_LIMITS.title),
    description: cleanRequiredText(issue.description, SANITIZED_FIELD_LIMITS.description),
    domain: cleanRequiredText(issue.category, 100),
    rootCause: cleanOptionalText(extra.rootCause, SANITIZED_FIELD_LIMITS.rootCause),
  };
}

// ---------------------------------------------------------------------------
// Historical Issue
// ---------------------------------------------------------------------------

/** Input for a past Issue offered as context. Structurally a subset of the
 *  same query shape; declared locally for the same reasons as above. */
export interface HistoricalIssueForAiInput {
  issueId: string;
  title: string;
  category: string;
  resolution: string | null;
  /** issues.final_resolution — the CONFIRMED outcome, when one exists. */
  finalResolution?: string | null;
  extraData: Record<string, unknown>;
}

/**
 * The OUTPUT shape for historical context — deliberately NARROWER than the
 * current Issue's. Five fields, no description, no whatIsHappening.
 *
 * Why narrower: a past Issue may belong to a different assignee, so every
 * field carried across widens what one person can learn about another's work.
 * The title plus the prior diagnosis is enough to judge relevance; the full
 * description is not needed for that and is not sent.
 */
export interface SanitizedHistoricalIssueForAi {
  /** The Issue's public reference (e.g. "ND-001") — the same label the UI
   *  shows, so an assignee can ask a Super Admin about it.
   *
   *  A DELIBERATE conversion of an identifier into an approved display label,
   *  shape-validated below so nothing else can ride along in this field.
   *
   *  KNOWN PROPERTY: the prefix is the Raised By staff code (initials). It is
   *  therefore weakly identifying. It is included because a reference the
   *  assignee cannot look up is useless, and because the same label is already
   *  visible throughout the application. Owner decision D2 in
   *  docs/gemini-ai-integration-audit.md governs whether cross-assignee
   *  references may be shown at all; if that is refused, this field becomes an
   *  opaque label ("PAST-1") in one line. */
  referenceLabel: string;
  domain: string;
  problemSummary: string;
  priorRootCause: string | null;
  /** The confirmed final resolution when the Issue really was completed,
   *  otherwise the intake-time suggested fix. Never both, and never labelled
   *  as confirmed when it is not. */
  priorActionOrResolution: string | null;
}

/** Matches the issue_id convention enforced by isValidIssueId() in
 *  lib/queries/issues.ts. Anything else becomes a neutral placeholder rather
 *  than being passed through. */
const ISSUE_REFERENCE_PATTERN = /^[A-Za-z0-9]{1,10}-[0-9]+$/;

export function toSafeIssueReference(issueId: unknown): string {
  if (typeof issueId !== "string") {
    return "past Issue";
  }
  const trimmed = issueId.trim();
  return ISSUE_REFERENCE_PATTERN.test(trimmed) ? trimmed : "past Issue";
}

/**
 * Builds the AI context for one past Issue.
 *
 * PURE: never mutates its input. Emits exactly five fields — no URL, no staff
 * or customer name, no attachment, no provenance, no raw row, no extra_data.
 */
export function sanitizeHistoricalIssueForAi(
  issue: HistoricalIssueForAiInput
): SanitizedHistoricalIssueForAi {
  const extra = issue.extraData ?? {};
  const confirmed = cleanOptionalText(
    issue.finalResolution,
    SANITIZED_FIELD_LIMITS.historicalResolution
  );

  return {
    referenceLabel: toSafeIssueReference(issue.issueId),
    domain: cleanRequiredText(issue.category, 100),
    problemSummary: cleanRequiredText(issue.title, SANITIZED_FIELD_LIMITS.historicalSummary),
    priorRootCause: cleanOptionalText(extra.rootCause, SANITIZED_FIELD_LIMITS.historicalRootCause),
    priorActionOrResolution:
      confirmed ?? cleanOptionalText(issue.resolution, SANITIZED_FIELD_LIMITS.historicalResolution),
  };
}

// ---------------------------------------------------------------------------
// Final guard
// ---------------------------------------------------------------------------

/**
 * Scans an already-sanitized payload for anything still credential-shaped, as
 * a last check before a future stage transmits it. Returns the names of the
 * patterns that matched — never the matched text itself.
 *
 * Mirrors the "manifest contains no credential-like strings" check that
 * scripts/verify-historical-audio.ts already performs on stored data.
 */
export function findCredentialLikeStrings(payload: unknown): string[] {
  const serialized = JSON.stringify(payload) ?? "";
  const hits: string[] = [];

  const named: readonly [string, RegExp][] = [
    ["connection-string", /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp|mssql)\s*:\/\//i],
    ["google-api-key", /\bAIza[0-9A-Za-z_-]{10,}/],
    ["sk-secret", /\bsk-[A-Za-z0-9_-]{10,}/],
    ["bearer-token", /\bBearer\s+[A-Za-z0-9._-]{10,}/i],
    ["bcrypt-hash", /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/],
    ["credential-assignment", /\b(?:api[_-]?key|secret|token|password|database[_-]?url)\b\s*[:=]\s*\S/i],
  ];

  for (const [name, pattern] of named) {
    if (pattern.test(serialized)) {
      hits.push(name);
    }
  }

  // The two high-entropy rules use the same character-class guard as
  // redactFreeText(), so the guard and the redactor cannot disagree about what
  // counts as a secret.
  if (matchesGuarded(serialized, LONG_HEX_PATTERN, looksLikeHexSecret)) {
    hits.push("long-hex");
  }
  if (matchesGuarded(serialized, LONG_TOKEN_PATTERN, looksLikeOpaqueToken)) {
    hits.push("long-token");
  }

  return hits;
}

/** Runs a global pattern and reports whether any match passes `guard`. The
 *  pattern's lastIndex is reset first, since these are module-level globals. */
function matchesGuarded(text: string, pattern: RegExp, guard: (value: string) => boolean): boolean {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (guard(match[0])) {
      return true;
    }
  }
  return false;
}
