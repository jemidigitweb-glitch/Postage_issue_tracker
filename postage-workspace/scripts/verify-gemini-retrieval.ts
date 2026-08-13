// scripts/verify-gemini-retrieval.ts
//
// Stage 3 verification: the Similar Past Issue retrieval foundation, against
// the REAL database, READ ONLY.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:gemini-retrieval
//
// ── READ ONLY ───────────────────────────────────────────────────────────────
// Every statement in this file and in lib/ai/similarIssueRetrieval.ts is a
// SELECT. There is no INSERT/UPDATE/DELETE, no BEGIN/COMMIT, and no migration.
// Row counts are re-read at the end and compared with the counts taken at the
// start, so "nothing changed" is demonstrated rather than asserted.
//
// ── NO GEMINI ───────────────────────────────────────────────────────────────
// This script does not import the Gemini client, the config, or the SDK. It
// makes no external request of any kind. Retrieval is not connected to Gemini.
//
// ── WHAT IT PRINTS ──────────────────────────────────────────────────────────
// Safe metadata only: Issue IDs, counts, reference labels, deterministic
// scores, and PASS/FAIL. It deliberately does NOT dump Issue titles,
// descriptions, root causes or resolutions to the terminal — the point of the
// sanitizer is to bound where that content goes, and a verification log is not
// one of the approved destinations.

import { query } from "../lib/db";
import { findCredentialLikeStrings } from "../lib/access/aiSanitization";
import {
  countHistoricalCorpus,
  findSimilarPastIssues,
} from "../lib/ai/similarIssueRetrieval";
import {
  EXPECTED_HISTORICAL_CORPUS_SIZE,
  HISTORICAL_CORPUS_WINDOW,
  MAX_SIMILAR_ISSUES,
  type RetrievalSubject,
} from "../lib/ai/similarityRanking";

const APPROVED_SANITIZED_FIELDS = [
  "domain",
  "priorActionOrResolution",
  "priorRootCause",
  "problemSummary",
  "referenceLabel",
] as const;

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

/** Counts used to prove nothing was written. */
async function snapshot(): Promise<Record<string, string>> {
  const result = await query<{
    issues: string;
    comments: string;
    history: string;
    assignments: string;
  }>(
    `SELECT (SELECT count(*)::text FROM issue_tracking.issues)                AS issues,
            (SELECT count(*)::text FROM issue_tracking.issue_comments)        AS comments,
            (SELECT count(*)::text FROM issue_tracking.issue_status_history)  AS history,
            (SELECT count(*)::text FROM issue_tracking.issue_assignments)     AS assignments`
  );
  return result.rows[0] as unknown as Record<string, string>;
}

/**
 * Loads a subject Issue read-only.
 *
 * Deliberately implemented HERE and not exported from the retrieval module: a
 * general "load any Issue by id" helper would be an unscoped read of the Issue
 * table and an obvious way for a later stage to bypass IssueAccessScope. A
 * verification script may do it; the application may not.
 */
async function loadSubject(issueId: string): Promise<RetrievalSubject | null> {
  const result = await query<{
    issue_id: string;
    issue_title: string;
    issue_description: string;
    category: string;
    priority: string | null;
    what_is_happening: string | null;
    root_cause: string | null;
  }>(
    `SELECT i.issue_id,
            i.issue_title,
            i.issue_description,
            i.category,
            i.priority,
            i.extra_data->>'whatIsHappening' AS what_is_happening,
            i.extra_data->>'rootCause'       AS root_cause
     FROM issue_tracking.issues i
     WHERE i.issue_id = $1
       AND i.deleted_at IS NULL
     LIMIT 1`,
    [issueId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    issueId: row.issue_id,
    title: row.issue_title,
    description: row.issue_description,
    category: row.category,
    priority: row.priority,
    whatIsHappening: row.what_is_happening,
    rootCause: row.root_cause,
  };
}

/** Picks sample subjects that actually exist, checking existence first. */
async function pickSampleIssueIds(): Promise<string[]> {
  const preferred = ["SA-007"];
  const found: string[] = [];

  for (const id of preferred) {
    const exists = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM issue_tracking.issues WHERE issue_id = $1`,
      [id]
    );
    if (Number(exists.rows[0]?.n ?? 0) > 0) {
      found.push(id);
    } else {
      info("sample Issue not present", `${id} does not exist — skipped`);
    }
  }

  // Two more from inside the corpus, chosen deterministically so the run is
  // repeatable: the lowest and highest issue_id in the window.
  const extra = await query<{ issue_id: string }>(
    `(SELECT i.issue_id FROM issue_tracking.issues i
       WHERE i.deleted_at IS NULL
         AND i.created_at >= $1::timestamptz AND i.created_at < $2::timestamptz
       ORDER BY i.issue_id ASC LIMIT 1)
     UNION ALL
     (SELECT i.issue_id FROM issue_tracking.issues i
       WHERE i.deleted_at IS NULL
         AND i.created_at >= $1::timestamptz AND i.created_at < $2::timestamptz
       ORDER BY i.issue_id DESC LIMIT 1)`,
    [HISTORICAL_CORPUS_WINDOW.startInclusive, HISTORICAL_CORPUS_WINDOW.endExclusive]
  );
  for (const row of extra.rows) {
    if (!found.includes(row.issue_id)) {
      found.push(row.issue_id);
    }
  }

  return found;
}

async function main(): Promise<void> {
  // ── 1. Identity ─────────────────────────────────────────────────────────
  const identity = await query<{ current_database: string; current_user: string }>(
    "SELECT current_database(), current_user"
  );
  const { current_database: db, current_user: user } = identity.rows[0];
  console.log(`current_database: ${db} | current_user: ${user}\n`);
  if (db !== "varmen_db" || user !== "varmen_user") {
    console.error(`  FAIL  connected to the wrong database/user — ${db} / ${user}`);
    process.exit(1);
  }
  console.log("1. Identity");
  check("connected to the expected database and user", true, `${db} / ${user}`);

  const before = await snapshot();

  // ── 2. The frozen historical corpus ─────────────────────────────────────
  console.log("\n2. Historical corpus");
  info(
    "window",
    `created_at >= ${HISTORICAL_CORPUS_WINDOW.startInclusive} AND < ${HISTORICAL_CORPUS_WINDOW.endExclusive}`
  );

  const corpusSize = await countHistoricalCorpus();
  check(
    `historical corpus is ${EXPECTED_HISTORICAL_CORPUS_SIZE}`,
    corpusSize === EXPECTED_HISTORICAL_CORPUS_SIZE,
    String(corpusSize)
  );

  const totals = await query<{ total: string; ts_in_window: string; with_sourcefile: string }>(
    `SELECT (SELECT count(*)::text FROM issue_tracking.issues) AS total,
            (SELECT count(*)::text FROM issue_tracking.issues i
              WHERE i.issue_id IN ($3, $4)
                AND i.created_at >= $1::timestamptz AND i.created_at < $2::timestamptz) AS ts_in_window,
            (SELECT count(*)::text FROM issue_tracking.issues i
              WHERE i.extra_data ? 'sourceFile') AS with_sourcefile`,
    [
      HISTORICAL_CORPUS_WINDOW.startInclusive,
      HISTORICAL_CORPUS_WINDOW.endExclusive,
      "TS-001",
      "TS-002",
    ]
  );
  check("total Issues is still 146", totals.rows[0].total === "146", totals.rows[0].total);
  check(
    "TS-001 and TS-002 fall OUTSIDE the corpus window",
    totals.rows[0].ts_in_window === "0",
    `${totals.rows[0].ts_in_window} test Issue(s) inside the window`
  );
  info(
    "sourceFile provenance subset",
    `${totals.rows[0].with_sourcefile} of ${corpusSize} — NOT used as the corpus definition`
  );

  // ── 3. Sample retrievals ────────────────────────────────────────────────
  console.log("\n3. Sample retrievals (read-only)");
  const sampleIds = await pickSampleIssueIds();
  check("at least one sample Issue was found", sampleIds.length > 0, sampleIds.join(", ") || "(none)");

  for (const issueId of sampleIds) {
    const subject = await loadSubject(issueId);
    if (!subject) {
      check(`sample ${issueId} loads`, false, "not found");
      continue;
    }

    const results = await findSimilarPastIssues(subject);
    const labels = results.map((entry) => entry.issue.referenceLabel);
    const scores = results.map((entry) => entry.score);

    console.log(`\n  Subject ${issueId}`);
    info("candidates returned", String(results.length));
    info("reference labels", labels.join(", ") || "(none)");
    info("scores", scores.join(", ") || "(none)");

    check(
      `${issueId}: at most ${MAX_SIMILAR_ISSUES} candidates`,
      results.length <= MAX_SIMILAR_ISSUES,
      String(results.length)
    );
    check(
      `${issueId}: the subject is not returned to itself`,
      labels.includes(issueId) === false,
      labels.includes(issueId) ? "SUBJECT RETURNED" : "absent"
    );
    check(
      `${issueId}: no test Issue is offered`,
      labels.every((label) => label !== "TS-001" && label !== "TS-002"),
      "TS rows absent"
    );
    check(
      `${issueId}: scores are in non-increasing order`,
      scores.every((score, index) => index === 0 || scores[index - 1] >= score),
      scores.join(" >= ") || "(none)"
    );

    // Every returned payload must carry exactly the approved fields.
    let shapeOk = true;
    let secretsFound: string[] = [];
    for (const entry of results) {
      const keys = Object.keys(entry.issue).sort();
      if (JSON.stringify(keys) !== JSON.stringify([...APPROVED_SANITIZED_FIELDS])) {
        shapeOk = false;
      }
      secretsFound = secretsFound.concat(findCredentialLikeStrings(entry.issue));
    }
    check(
      `${issueId}: every candidate exposes only the five approved fields`,
      shapeOk,
      APPROVED_SANITIZED_FIELDS.join(", ")
    );
    check(
      `${issueId}: no credential-shaped string in any candidate`,
      secretsFound.length === 0,
      secretsFound.length === 0 ? "clean" : secretsFound.join(", ")
    );

    // Determinism: the same subject must produce the same ranking twice.
    const repeat = await findSimilarPastIssues(subject);
    check(
      `${issueId}: retrieval is deterministic across runs`,
      JSON.stringify(repeat) === JSON.stringify(results),
      "identical result"
    );
  }

  // ── 4. Read-only proof ──────────────────────────────────────────────────
  console.log("\n4. Read-only");
  const after = await snapshot();
  check(
    "no row counts changed",
    JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify(after)
  );

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All checks passed. Nothing was written, and no Gemini request was made.");
}

main()
  .catch((error) => {
    console.error("Verification aborted:", error instanceof Error ? error.message : "Unknown error.");
    process.exit(1);
  })
  .finally(async () => {
    const { getPool } = await import("../lib/db");
    await getPool().end();
  });
