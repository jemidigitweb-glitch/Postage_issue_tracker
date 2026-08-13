import "server-only";

import { query } from "../db";
import {
  sanitizeHistoricalIssueForAi,
  type SanitizedHistoricalIssueForAi,
} from "../access/aiSanitization";
import {
  HISTORICAL_CORPUS_WINDOW,
  MAX_SIMILAR_ISSUES,
  rankHistoricalCandidates,
  type HistoricalCandidate,
  type RetrievalSubject,
} from "./similarityRanking";

// Gemini Stage 3 — READ-ONLY retrieval of Similar Past Issues.
//
// `server-only`: a build error if this is ever pulled into a Client Component,
// so no browser can reach the corpus, the SQL, or the ranking.
//
// ── THE PIPELINE, AND ITS ONE-WAY BOUNDARY ──────────────────────────────────
//   issue_tracking.issues  (read-only SELECT, parameterised, fully qualified)
//     -> internal rows, never returned to a caller
//     -> deterministic ranking            (lib/ai/similarityRanking.ts)
//     -> sanitizeHistoricalIssueForAi     (lib/access/aiSanitization.ts)
//     -> RankedSimilarIssue[]             the ONLY exported shape
//
// A database row never crosses the boundary. The exported result carries the
// Stage 2 sanitizer's five fields and a numeric score — nothing else exists to
// leak, because nothing else is ever constructed.
//
// ── WHAT THIS MODULE MUST NEVER DO ──────────────────────────────────────────
//  - WRITE. Every statement here is a SELECT. There is no INSERT, UPDATE,
//    DELETE or transaction anywhere in this file.
//  - CALL GEMINI. It does not import geminiClient.ts, geminiConfig.ts or the
//    SDK, and it never will: retrieval hands back sanitized data and stops.
//    Wiring it to Gemini is a later stage and a separate decision.
//  - SELECT anything outside the allow-list below. staff_code, staff_name,
//    the raw extra_data blob, images, attachments, dataLink, assignment rows
//    and every internal id are absent from the SELECT list, so they cannot be
//    forwarded even by accident.
//
// ── CROSS-ASSIGNEE POLICY (audit decision D2 — STILL OPEN) ──────────────────
// This module evaluates the WHOLE 144-Issue historical corpus, with no
// assignee scoping. That is deliberate for a server-side development and
// verification stage, and it is why nothing may reach a user yet:
//
//   NO Server Action, NO Route Handler and NO page calls this module.
//   Nothing it returns is currently reachable from any browser response.
//
// Until D2 is approved, that must stay true. When it is decided, the answer
// determines whether this stays corpus-wide or gains an IssueAccessScope
// parameter — see docs/gemini-ai-integration-audit.md §12.

/** One ranked result. The sanitized payload is kept in its own property so a
 *  future prompt builder can pass `result.issue` verbatim and cannot
 *  accidentally include the score. */
export interface RankedSimilarIssue {
  /** EXACTLY the Stage 2 historical sanitizer shape: referenceLabel, domain,
   *  problemSummary, priorRootCause, priorActionOrResolution. */
  issue: SanitizedHistoricalIssueForAi;
  /** Deterministic heuristic score — server-side ranking and diagnostics only.
   *  It is NOT part of the sanitized payload and must NOT be sent to Gemini
   *  unless that is explicitly approved. */
  score: number;
}

/**
 * THE RESOLVED PREDICATE.
 *
 * An Issue counts as genuinely resolved only when ALL THREE agree:
 *   status = 'GREEN'          — the workflow says it is completely solved
 *   final_resolution present  — a human wrote what actually fixed it
 *   completed_at present      — the completion transition really happened
 *
 * All three are written together by updateIssueStatus() on the -> GREEN
 * transition, so requiring all three costs nothing on a legitimately completed
 * Issue while rejecting a hand-edited or half-migrated row that has only one
 * of them.
 *
 * What is deliberately NOT evidence of resolution:
 *   - RED or AMBER status, in any combination with anything else;
 *   - issues.resolution ("Fix & Action Required") — an intake-time PROPOSAL,
 *     recorded when the Issue was raised and never confirmed to have worked.
 *     125 of 146 Issues carry one; treating it as a resolution would mean
 *     feeding the model 125 unverified guesses as though they were fixes;
 *   - extra_data.rootCause — a hypothesis, likewise recorded at intake;
 *   - completed_date alone — a date column with no outcome text behind it.
 */
const RESOLVED_PREDICATE = `i.status = 'GREEN'
       AND i.final_resolution IS NOT NULL
       AND btrim(i.final_resolution) <> ''
       AND i.completed_at IS NOT NULL`;

/** The row shape this module reads. Every column is individually named; the
 *  two extra_data values are extracted with ->> so the raw JSONB blob never
 *  enters the process at all.
 *
 *  `resolution` is NOT selected: these rows are, by the predicate above,
 *  genuinely completed Issues, so the intake-time proposal must never stand in
 *  for the confirmed outcome. Not fetching it makes that structural rather
 *  than a rule someone has to remember. */
interface HistoricalRow {
  issue_id: string;
  issue_title: string;
  issue_description: string;
  category: string;
  priority: string | null;
  final_resolution: string | null;
  what_is_happening: string | null;
  root_cause: string | null;
}

/**
 * Loads the frozen historical corpus, excluding the subject Issue.
 *
 * The exclusion of TS-001 / TS-002 is a CONSEQUENCE OF THE CORPUS DEFINITION,
 * not a hard-coded id filter: both were created on 2026-08-12, outside the
 * migration window, so the WHERE clause never sees them. There is no
 * `issue_id <> 'TS-001'` anywhere in this file.
 */
async function loadHistoricalCorpus(excludeIssueId: string): Promise<HistoricalCandidate[]> {
  const result = await query<HistoricalRow>(
    `SELECT i.issue_id,
            i.issue_title,
            i.issue_description,
            i.category,
            i.priority,
            i.final_resolution,
            i.extra_data->>'whatIsHappening' AS what_is_happening,
            i.extra_data->>'rootCause'       AS root_cause
     FROM issue_tracking.issues i
     WHERE i.deleted_at IS NULL
       AND i.created_at >= $1::timestamptz
       AND i.created_at <  $2::timestamptz
       AND i.issue_id <> $3
       AND ${RESOLVED_PREDICATE}`,
    [HISTORICAL_CORPUS_WINDOW.startInclusive, HISTORICAL_CORPUS_WINDOW.endExclusive, excludeIssueId]
  );

  return result.rows.map((row) => ({
    issueId: row.issue_id,
    title: row.issue_title,
    description: row.issue_description,
    category: row.category,
    priority: row.priority,
    whatIsHappening: row.what_is_happening,
    rootCause: row.root_cause,
    // Never available to the sanitizer as a fallback — see HistoricalRow.
    resolution: null,
    finalResolution: row.final_resolution,
  }));
}

/**
 * Finds up to five Similar Past Issues for the Issue under investigation.
 *
 * The subject is supplied by the caller — this module deliberately provides no
 * "load any Issue by id" helper, because such a helper would be an unscoped
 * read of the Issue table and an obvious way to bypass IssueAccessScope. The
 * caller has already loaded (and, in a later stage, already authorized) the
 * Issue it passes in.
 *
 * ── RESOLVED ISSUES ONLY ────────────────────────────────────────────────────
 * Candidates are filtered to genuinely completed Issues BEFORE ranking (see
 * RESOLVED_PREDICATE). An unresolved Issue cannot be offered no matter how
 * similar it is — exclusion happens first, so relevance can never promote a
 * guess into the context. The slots are never backfilled: 0 qualifying matches
 * means 0 context, which is a normal and correct state.
 *
 * Read-only. Returns [] rather than throwing.
 */
export async function findSimilarPastIssues(
  subject: RetrievalSubject,
  options: { limit?: number } = {}
): Promise<RankedSimilarIssue[]> {
  const limit = Math.max(0, Math.min(options.limit ?? MAX_SIMILAR_ISSUES, MAX_SIMILAR_ISSUES));
  if (limit === 0) {
    return [];
  }

  const corpus = await loadHistoricalCorpus(subject.issueId);
  const ranked = rankHistoricalCandidates(subject, corpus, limit);

  // The sanitizer is the LAST thing that touches this data before it leaves
  // the module. Everything above operates on internal rows that never escape.
  return ranked.map((entry) => ({
    issue: sanitizeHistoricalIssueForAi({
      issueId: entry.candidate.issueId,
      title: entry.candidate.title,
      category: entry.candidate.category,
      resolution: entry.candidate.resolution,
      finalResolution: entry.candidate.finalResolution,
      // A minimal object built from the one extracted value — never the raw
      // extra_data blob, which was never selected in the first place.
      extraData: { rootCause: entry.candidate.rootCause },
    }),
    score: entry.score,
  }));
}

/**
 * The size of the frozen historical corpus right now. Read-only; used by
 * scripts/verify-gemini-retrieval.ts to prove the window still selects the
 * expected 144 rows, so a corpus that silently changes size fails a check
 * rather than quietly changing what a future AI stage is shown.
 */
export async function countHistoricalCorpus(): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM issue_tracking.issues i
     WHERE i.deleted_at IS NULL
       AND i.created_at >= $1::timestamptz
       AND i.created_at <  $2::timestamptz`,
    [HISTORICAL_CORPUS_WINDOW.startInclusive, HISTORICAL_CORPUS_WINDOW.endExclusive]
  );
  return Number(result.rows[0]?.n ?? 0);
}
