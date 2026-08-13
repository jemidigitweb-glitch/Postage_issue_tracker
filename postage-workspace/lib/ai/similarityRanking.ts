// Gemini Stage 3 — PURE deterministic ranking for "Similar Past Issues".
//
// DELIBERATELY has no `server-only`, no database import, no `@google/genai`
// and no `next/*` — same discipline as lib/ai/geminiPolicy.ts and
// lib/access/aiSanitization.ts, so the whole scoring model is directly
// unit-testable and `npm test` (which runs without the react-server condition)
// can reach it. The SQL lives next door in lib/ai/similarIssueRetrieval.ts.
//
// ── THIS IS NOT SEMANTIC SIMILARITY ─────────────────────────────────────────
// It is DETERMINISTIC HEURISTIC RETRIEVAL: exact domain matching plus
// case-folded, punctuation-normalised, stopword-filtered keyword overlap, with
// fixed integer weights. No embeddings, no pgvector, no external API, and no
// model of any kind takes part in ranking. The same inputs always produce the
// same ordering, and every score can be explained field by field
// (scoreBreakdown below). It does not "understand" an Issue and must never be
// described as though it does.
//
// ── WHY IT IS GOOD ENOUGH FOR PHASE A ───────────────────────────────────────
// The corpus is 144 Issues. At that size an exhaustive scan scores every
// candidate exactly, so recall is total and only the ORDERING is heuristic.
// Revisit when the corpus is large enough that a scan is no longer free —
// roughly 2,000 rows — which is also the point at which the audit's Phase B
// (embeddings) becomes worth reconsidering.

// ---------------------------------------------------------------------------
// The historical corpus — a FROZEN, migration-window definition
// ---------------------------------------------------------------------------

/**
 * The initial historical corpus is defined by the MIGRATION INGESTION WINDOW
 * on issue_tracking.issues.created_at (timestamp with time zone).
 *
 * Half-open: created_at >= startInclusive AND created_at < endExclusive.
 *
 * ── WHY NOT `staff_code <> 'TS'` ────────────────────────────────────────────
 * It happens to select the same 144 rows today, but it is a rule about WHO
 * RAISED an Issue, not about where the Issue came from. The moment a real
 * Issue is raised through Add New Issue by a genuine staff member, that rule
 * would silently reclassify it as "historical" and feed brand-new operational
 * content into a corpus that is meant to be the frozen migrated set.
 *
 * ── WHY NOT `extra_data.sourceFile IS NOT NULL` ─────────────────────────────
 * It covers only 52 of the 144 migrated Issues (the ingestion evidently ran in
 * more than one pass, with different metadata each time). Using it would
 * silently discard 92 legitimate historical Issues — a 64% under-count.
 *
 * ── VERIFIED ────────────────────────────────────────────────────────────────
 * Against the live database on 2026-08-13, this window selects exactly 144
 * rows, contains zero TS rows, and agrees with `staff_code <> 'TS'` with zero
 * disagreements in either direction. TS-001 and TS-002 were created
 * 2026-08-12, five days after the window closes, so they are excluded BY THE
 * DEFINITION rather than by a hard-coded id filter.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * It identifies the FROZEN INITIAL CORPUS ONLY. Issues created from now on
 * fall outside it and are never treated as historical context. If the corpus
 * should ever grow, that needs a deliberate decision and most likely a real
 * provenance marker written at ingestion — not a wider date range.
 */
export const HISTORICAL_CORPUS_WINDOW = {
  startInclusive: "2026-08-06T00:00:00Z",
  endExclusive: "2026-08-08T00:00:00Z",
} as const;

/** Proven live count for the window above. Asserted by
 *  scripts/verify-gemini-retrieval.ts, so a corpus that silently changes size
 *  fails a check instead of quietly changing what the AI is shown. */
export const EXPECTED_HISTORICAL_CORPUS_SIZE = 144;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** The fields compared during ranking. Note what is absent and cannot be
 *  compared, scored, or returned: staff code, staff name, member, assignee,
 *  attachments, links, provenance, timestamps, and every internal id. */
export interface ComparableIssue {
  issueId: string;
  title: string;
  description: string;
  /** issues.category — the "Domain". */
  category: string;
  priority: string | null;
  /** extra_data.whatIsHappening, read out individually — never the blob. */
  whatIsHappening: string | null;
  /** extra_data.rootCause, read out individually — never the blob. */
  rootCause: string | null;
}

/** The Issue currently being investigated. */
export type RetrievalSubject = ComparableIssue;

/** A past Issue, plus the two outcome fields the sanitizer needs. */
export interface HistoricalCandidate extends ComparableIssue {
  /** issues.resolution — the intake-time proposed action. NOT a confirmed
   *  outcome, and never scored or presented as one. */
  resolution: string | null;
  /** issues.final_resolution — a genuinely confirmed outcome, present on
   *  exactly one Issue in the corpus today. */
  finalResolution: string | null;
}

export interface ScoreBreakdown {
  domain: number;
  priority: number;
  title: number;
  description: number;
  whatIsHappening: number;
  rootCause: number;
  confirmedResolution: number;
}

export interface RankedCandidate {
  candidate: HistoricalCandidate;
  score: number;
  /** Field-by-field contributions. Exists so a score can be explained rather
   *  than trusted, and so a weighting change is visible in tests. */
  breakdown: ScoreBreakdown;
}

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Words carrying no discriminating signal in this corpus.
 *
 * "issue"/"issues" are included deliberately: every row is an Issue, so the
 * word is pure noise here and would otherwise link unrelated records. The list
 * is intentionally short — over-filtering removes real signal, and the
 * minimum-length rule below already removes most function words.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "has", "had",
  "been", "was", "were", "are", "not", "but", "all", "any", "can", "will",
  "would", "should", "could", "when", "what", "which", "why", "how", "its",
  "they", "them", "their", "there", "then", "here", "into", "out", "our",
  "your", "his", "her", "one", "two", "get", "got", "set", "use", "used",
  "using", "need", "needs", "needed", "also", "only", "just", "very", "more",
  "most", "some", "such", "than", "too", "upon", "over", "under", "after",
  "before", "again", "still", "issue", "issues", "please", "does", "did",
  "doing", "being", "about", "because", "while", "each", "other", "same",
]);

/** Tokens shorter than this are dropped: they are almost always function
 *  words or noise, and dropping them is cheaper than listing them all. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Case-folds, strips punctuation, and returns the distinct significant words.
 *
 * Punctuation is turned into a separator rather than deleted, so "SKU/label"
 * yields two tokens and "label." and "label" are the same token — punctuation
 * can never create a fake difference. Null, undefined and empty input all
 * yield an empty set rather than throwing.
 */
export function tokenize(value: string | null | undefined): Set<string> {
  if (typeof value !== "string" || value === "") {
    return new Set();
  }
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ");

  const tokens = new Set<string>();
  for (const word of words) {
    if (word.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

/** Count of tokens present in both sets. Order-independent, so the result does
 *  not depend on how either string was written. */
export function countSharedTokens(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const a = tokenize(left);
  if (a.size === 0) {
    return 0;
  }
  const b = tokenize(right);
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/**
 * Fixed integer weights, with a CAP on every keyword contribution.
 *
 * The caps are what stop one long field from swamping everything else: a
 * rambling description sharing twenty ordinary words cannot outrank a genuine
 * title match. Integers keep scores exactly comparable — no floating-point
 * ordering surprises.
 *
 * `samePriority` is deliberately tiny (1). Priority is a management judgement,
 * not evidence about the fault, so it may break a near-tie and nothing more —
 * it can never carry a candidate past a substantively better match.
 */
export const SIMILARITY_WEIGHTS = {
  sameDomain: 6,
  samePriority: 1,
  titlePerToken: 3,
  titleTokenCap: 5,
  descriptionPerToken: 1,
  descriptionTokenCap: 6,
  whatIsHappeningPerToken: 2,
  whatIsHappeningTokenCap: 4,
  rootCausePerToken: 2,
  rootCauseTokenCap: 4,
  /** A past Issue that was genuinely completed carries a confirmed outcome,
   *  which is materially more useful than a proposed one. Small enough that it
   *  cannot manufacture relevance on its own. */
  confirmedResolutionBonus: 4,
} as const;

/**
 * The numeric floor a candidate must clear.
 *
 * Set above `samePriority` (1) so that sharing a priority — and nothing else —
 * can never surface an unrelated Issue. It is NOT the main filter: see
 * hasMeaningfulOverlap() below, which is.
 */
export const MIN_SIMILARITY_SCORE = 3;

/**
 * THE MEANINGFUL-MATCH RULE.
 *
 * A candidate must show at least one LEXICAL overlap signal — shared
 * significant words in the title, description, whatIsHappening or rootCause —
 * before it may be offered at all.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * Domain membership alone is not evidence of similarity. Stage 3's live run
 * proved it: subject AT-024 returned five candidates all scoring exactly 6,
 * every one of them a bare "also filed under this domain" match with no shared
 * wording whatsoever, ordered only by the id tie-break. Forty Issues share the
 * "listing" domain; being one of them says nothing about whether an Issue is
 * related.
 *
 * A domain-only result is worse than no result: it looks like evidence, and a
 * later AI stage would treat it as context and reason from it.
 *
 * This is deliberately a RULE, not a higher arbitrary threshold. Raising
 * MIN_SIMILARITY_SCORE above 6 would exclude domain-only matches by accident
 * and would also exclude a genuinely strong lexical match that happens to sit
 * in a different domain. Domain and priority still contribute WEIGHT to
 * ranking — they just cannot, alone, admit a candidate.
 */
export function hasMeaningfulOverlap(breakdown: ScoreBreakdown): boolean {
  return (
    breakdown.title > 0 ||
    breakdown.description > 0 ||
    breakdown.whatIsHappening > 0 ||
    breakdown.rootCause > 0
  );
}

/** Hard cap on what retrieval may return, per the audit. */
export const MAX_SIMILAR_ISSUES = 5;

function cappedTokenScore(
  left: string | null | undefined,
  right: string | null | undefined,
  perToken: number,
  cap: number
): number {
  return Math.min(countSharedTokens(left, right), cap) * perToken;
}

function normalizeForExactMatch(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Field-by-field score. Every comparison is like-for-like (title against
 *  title, root cause against root cause), which is what makes a score
 *  explainable to a human looking at two Issues side by side. */
export function scoreBreakdown(
  subject: RetrievalSubject,
  candidate: HistoricalCandidate
): ScoreBreakdown {
  const subjectDomain = normalizeForExactMatch(subject.category);
  const candidateDomain = normalizeForExactMatch(candidate.category);
  const subjectPriority = normalizeForExactMatch(subject.priority);
  const candidatePriority = normalizeForExactMatch(candidate.priority);

  const hasConfirmedOutcome =
    typeof candidate.finalResolution === "string" && candidate.finalResolution.trim() !== "";

  return {
    domain:
      subjectDomain !== "" && subjectDomain === candidateDomain ? SIMILARITY_WEIGHTS.sameDomain : 0,
    priority:
      subjectPriority !== "" && subjectPriority === candidatePriority
        ? SIMILARITY_WEIGHTS.samePriority
        : 0,
    title: cappedTokenScore(
      subject.title,
      candidate.title,
      SIMILARITY_WEIGHTS.titlePerToken,
      SIMILARITY_WEIGHTS.titleTokenCap
    ),
    description: cappedTokenScore(
      subject.description,
      candidate.description,
      SIMILARITY_WEIGHTS.descriptionPerToken,
      SIMILARITY_WEIGHTS.descriptionTokenCap
    ),
    whatIsHappening: cappedTokenScore(
      subject.whatIsHappening,
      candidate.whatIsHappening,
      SIMILARITY_WEIGHTS.whatIsHappeningPerToken,
      SIMILARITY_WEIGHTS.whatIsHappeningTokenCap
    ),
    rootCause: cappedTokenScore(
      subject.rootCause,
      candidate.rootCause,
      SIMILARITY_WEIGHTS.rootCausePerToken,
      SIMILARITY_WEIGHTS.rootCauseTokenCap
    ),
    confirmedResolution: hasConfirmedOutcome ? SIMILARITY_WEIGHTS.confirmedResolutionBonus : 0,
  };
}

export function scoreCandidate(
  subject: RetrievalSubject,
  candidate: HistoricalCandidate
): number {
  const parts = scoreBreakdown(subject, candidate);
  return (
    parts.domain +
    parts.priority +
    parts.title +
    parts.description +
    parts.whatIsHappening +
    parts.rootCause +
    parts.confirmedResolution
  );
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** Byte-order comparison — deliberately NOT localeCompare(), whose result
 *  depends on the runtime's locale data and would make ordering
 *  environment-dependent. */
function compareIssueIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Ranks candidates against the subject.
 *
 * Guarantees:
 *  - the subject can never match itself (excluded by issue_id, trimmed);
 *  - a candidate whose ONLY evidence is the shared domain (or priority) is
 *    dropped entirely — see hasMeaningfulOverlap();
 *  - candidates below MIN_SIMILARITY_SCORE are dropped entirely;
 *  - ordering is score DESC, then issue_id ASC — fully deterministic, with no
 *    dependence on input order, clock, or locale;
 *  - at most `limit` results, defaulting to MAX_SIMILAR_ISSUES.
 *
 * Pure: no input object is mutated, and the input array is copied before
 * sorting.
 */
export function rankHistoricalCandidates(
  subject: RetrievalSubject,
  candidates: readonly HistoricalCandidate[],
  limit: number = MAX_SIMILAR_ISSUES
): RankedCandidate[] {
  const subjectId = subject.issueId.trim();
  const effectiveLimit = Math.max(0, Math.min(limit, MAX_SIMILAR_ISSUES));

  const scored: RankedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.issueId.trim() === subjectId) {
      continue;
    }
    const breakdown = scoreBreakdown(subject, candidate);
    const score =
      breakdown.domain +
      breakdown.priority +
      breakdown.title +
      breakdown.description +
      breakdown.whatIsHappening +
      breakdown.rootCause +
      breakdown.confirmedResolution;

    // Both conditions, in this order: a candidate needs real lexical evidence
    // AND a score above the floor. Domain and priority contribute weight to
    // the ordering but can never, by themselves, admit a candidate.
    if (hasMeaningfulOverlap(breakdown) && score >= MIN_SIMILARITY_SCORE) {
      scored.push({ candidate, score, breakdown });
    }
  }

  scored.sort((left, right) =>
    right.score !== left.score
      ? right.score - left.score
      : compareIssueIds(left.candidate.issueId, right.candidate.issueId)
  );

  return scored.slice(0, effectiveLimit);
}
