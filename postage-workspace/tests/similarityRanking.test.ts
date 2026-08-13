// Gemini Stage 3 — deterministic ranking for Similar Past Issues.
//
// Every fixture below is SYNTHETIC. No test in this file opens a database
// connection, constructs the Gemini SDK, or makes any network request.
//
// The suite proves two separate things:
//   1. the scoring model behaves as documented (weights, caps, normalisation);
//   2. nothing but the five sanitized fields can escape the retrieval shape.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  sanitizeHistoricalIssueForAi,
  findCredentialLikeStrings,
} from "../lib/access/aiSanitization";
import {
  countSharedTokens,
  EXPECTED_HISTORICAL_CORPUS_SIZE,
  HISTORICAL_CORPUS_WINDOW,
  MAX_SIMILAR_ISSUES,
  MIN_SIMILARITY_SCORE,
  rankHistoricalCandidates,
  scoreBreakdown,
  scoreCandidate,
  SIMILARITY_WEIGHTS,
  tokenize,
  type HistoricalCandidate,
  type RetrievalSubject,
} from "../lib/ai/similarityRanking";

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

const SUBJECT: RetrievalSubject = {
  issueId: "AA-100",
  title: "Barcode missing from printed shipping label",
  description: "The printed label shows a blank barcode block on the warehouse printer.",
  category: "postage",
  priority: "high",
  whatIsHappening: "Labels print but the barcode block is empty.",
  rootCause: "Billing account appears to be wrong.",
};

function candidate(overrides: Partial<HistoricalCandidate> = {}): HistoricalCandidate {
  return {
    issueId: "AA-001",
    title: "Unrelated pricing spreadsheet formatting",
    description: "A column is formatted incorrectly in a spreadsheet.",
    category: "pricing",
    priority: "low",
    whatIsHappening: null,
    rootCause: null,
    resolution: null,
    finalResolution: null,
    ...overrides,
  };
}

/** Shares the domain and strong title wording with SUBJECT. */
const STRONG_MATCH = candidate({
  issueId: "AA-010",
  title: "Printed shipping label missing its barcode",
  description: "Blank barcode block appeared on the printed label.",
  category: "postage",
  priority: "low",
  whatIsHappening: "Labels print but the barcode block is empty.",
  rootCause: "Billing account was wrong.",
});

/** Shares nothing meaningful. */
const WEAK_MATCH = candidate({ issueId: "AA-020" });

describe("tokenize", () => {
  it("is case-insensitive", () => {
    assert.deepEqual([...tokenize("Barcode LABEL")], [...tokenize("barcode label")]);
  });

  it("treats punctuation as a separator, not a difference", () => {
    assert.deepEqual([...tokenize("label.")], ["label"]);
    assert.deepEqual([...tokenize("SKU/label")].sort(), ["label", "sku"]);
    assert.deepEqual([...tokenize("barcode, label!")].sort(), ["barcode", "label"]);
  });

  it("drops stopwords", () => {
    assert.deepEqual([...tokenize("the and for with this that")], []);
  });

  it("drops the corpus-wide noise word 'issue'", () => {
    assert.deepEqual([...tokenize("issue issues")], []);
  });

  it("drops tokens shorter than three characters", () => {
    assert.deepEqual([...tokenize("a an of to id")], []);
  });

  it("de-duplicates repeated words", () => {
    assert.deepEqual([...tokenize("label label label")], ["label"]);
  });

  it("is safe on null, undefined and empty input", () => {
    assert.equal(tokenize(null).size, 0);
    assert.equal(tokenize(undefined).size, 0);
    assert.equal(tokenize("").size, 0);
    assert.equal(tokenize("   ").size, 0);
  });
});

describe("countSharedTokens", () => {
  it("counts distinct shared tokens only", () => {
    assert.equal(countSharedTokens("barcode label barcode", "barcode"), 1);
  });

  it("returns 0 when either side is empty or null", () => {
    assert.equal(countSharedTokens(null, "barcode"), 0);
    assert.equal(countSharedTokens("barcode", null), 0);
    assert.equal(countSharedTokens("", "barcode"), 0);
  });

  it("does not count stopwords as shared signal", () => {
    assert.equal(countSharedTokens("the and for with that", "the and for with that"), 0);
  });
});

describe("scoring", () => {
  it("scores a same-domain candidate above an unrelated one", () => {
    assert.ok(scoreCandidate(SUBJECT, STRONG_MATCH) > scoreCandidate(SUBJECT, WEAK_MATCH));
  });

  it("awards the domain weight for an exact domain match", () => {
    const sameDomainOnly = candidate({ issueId: "AA-030", category: "postage" });
    assert.equal(scoreBreakdown(SUBJECT, sameDomainOnly).domain, SIMILARITY_WEIGHTS.sameDomain);
  });

  it("matches the domain case-insensitively and ignoring surrounding space", () => {
    const shouty = candidate({ issueId: "AA-031", category: "  POSTAGE  " });
    assert.equal(scoreBreakdown(SUBJECT, shouty).domain, SIMILARITY_WEIGHTS.sameDomain);
  });

  it("awards nothing for domain when the subject's domain is blank", () => {
    const blank: RetrievalSubject = { ...SUBJECT, category: "  " };
    assert.equal(scoreBreakdown(blank, candidate({ category: "  " })).domain, 0);
  });

  it("title overlap raises the score", () => {
    const withTitleOverlap = candidate({ issueId: "AA-040", title: "Barcode missing from label" });
    const without = candidate({ issueId: "AA-041", title: "Completely different subject matter" });
    assert.ok(
      scoreBreakdown(SUBJECT, withTitleOverlap).title > scoreBreakdown(SUBJECT, without).title
    );
  });

  it("description overlap raises the score", () => {
    const withOverlap = candidate({
      issueId: "AA-050",
      description: "The printed label shows a blank barcode block.",
    });
    assert.ok(scoreBreakdown(SUBJECT, withOverlap).description > 0);
    assert.equal(scoreBreakdown(SUBJECT, candidate()).description, 0);
  });

  it("whatIsHappening overlap raises the score", () => {
    const withOverlap = candidate({
      issueId: "AA-060",
      whatIsHappening: "Labels print but the barcode block is empty.",
    });
    assert.ok(scoreBreakdown(SUBJECT, withOverlap).whatIsHappening > 0);
    assert.equal(scoreBreakdown(SUBJECT, candidate()).whatIsHappening, 0);
  });

  it("rootCause overlap raises the score", () => {
    const withOverlap = candidate({ issueId: "AA-070", rootCause: "Billing account was wrong." });
    assert.ok(scoreBreakdown(SUBJECT, withOverlap).rootCause > 0);
    assert.equal(scoreBreakdown(SUBJECT, candidate()).rootCause, 0);
  });

  it("caps each keyword field so one long field cannot swamp the rest", () => {
    const manyWords = Array.from({ length: 40 }, (_v, index) => `token${index}`).join(" ");
    const flooded = candidate({ issueId: "AA-080", title: manyWords, description: manyWords });
    const floodedSubject: RetrievalSubject = { ...SUBJECT, title: manyWords, description: manyWords };
    const parts = scoreBreakdown(floodedSubject, flooded);
    assert.equal(parts.title, SIMILARITY_WEIGHTS.titleTokenCap * SIMILARITY_WEIGHTS.titlePerToken);
    assert.equal(
      parts.description,
      SIMILARITY_WEIGHTS.descriptionTokenCap * SIMILARITY_WEIGHTS.descriptionPerToken
    );
  });

  it("priority alone cannot outrank a substantively better match", () => {
    const priorityTwin = candidate({ issueId: "AA-090", priority: "high" });
    const betterButDifferentPriority = { ...STRONG_MATCH, priority: "low" };
    assert.ok(
      scoreCandidate(SUBJECT, betterButDifferentPriority) > scoreCandidate(SUBJECT, priorityTwin)
    );
  });

  it("priority contributes only a single point", () => {
    assert.equal(scoreBreakdown(SUBJECT, candidate({ priority: "high" })).priority, 1);
    assert.equal(SIMILARITY_WEIGHTS.samePriority, 1);
  });

  it("gives a bonus to a genuinely confirmed outcome", () => {
    const confirmed = candidate({ issueId: "AA-091", finalResolution: "Account corrected." });
    assert.equal(
      scoreBreakdown(SUBJECT, confirmed).confirmedResolution,
      SIMILARITY_WEIGHTS.confirmedResolutionBonus
    );
  });

  it("gives no confirmed-outcome bonus for an intake-time suggestion alone", () => {
    const intakeOnly = candidate({ issueId: "AA-092", resolution: "Try reprinting." });
    assert.equal(scoreBreakdown(SUBJECT, intakeOnly).confirmedResolution, 0);
  });

  it("gives no confirmed-outcome bonus for a blank final resolution", () => {
    assert.equal(scoreBreakdown(SUBJECT, candidate({ finalResolution: "   " })).confirmedResolution, 0);
  });

  it("is safe when every optional field is null", () => {
    const bare: RetrievalSubject = {
      issueId: "AA-999",
      title: "",
      description: "",
      category: "",
      priority: null,
      whatIsHappening: null,
      rootCause: null,
    };
    assert.doesNotThrow(() => scoreCandidate(bare, candidate()));
    assert.equal(scoreCandidate(bare, candidate()), 0);
  });

  it("is deterministic — identical inputs always score identically", () => {
    assert.equal(scoreCandidate(SUBJECT, STRONG_MATCH), scoreCandidate(SUBJECT, STRONG_MATCH));
  });
});

describe("rankHistoricalCandidates", () => {
  it("never returns the subject itself", () => {
    const selfRow = candidate({ ...SUBJECT, issueId: SUBJECT.issueId, resolution: null, finalResolution: null });
    const ranked = rankHistoricalCandidates(SUBJECT, [selfRow, STRONG_MATCH]);
    assert.equal(ranked.some((entry) => entry.candidate.issueId === SUBJECT.issueId), false);
  });

  it("excludes the subject even when its id has stray whitespace", () => {
    const selfRow = candidate({ ...SUBJECT, issueId: "  AA-100  " });
    const ranked = rankHistoricalCandidates(SUBJECT, [selfRow]);
    assert.equal(ranked.length, 0);
  });

  it("orders by score, highest first", () => {
    const ranked = rankHistoricalCandidates(SUBJECT, [WEAK_MATCH, STRONG_MATCH]);
    assert.equal(ranked[0].candidate.issueId, STRONG_MATCH.issueId);
  });

  it("drops anything below the similarity floor", () => {
    const ranked = rankHistoricalCandidates(SUBJECT, [WEAK_MATCH]);
    assert.equal(ranked.length, 0);
  });

  it("never lets a shared priority alone surface an unrelated Issue", () => {
    const priorityTwinOnly = candidate({ issueId: "AA-093", priority: "high" });
    assert.ok(scoreCandidate(SUBJECT, priorityTwinOnly) < MIN_SIMILARITY_SCORE);
    assert.equal(rankHistoricalCandidates(SUBJECT, [priorityTwinOnly]).length, 0);
  });

  it("breaks ties deterministically by issue_id ascending", () => {
    const twinB = candidate({ ...STRONG_MATCH, issueId: "BB-001" });
    const twinA = candidate({ ...STRONG_MATCH, issueId: "AA-001" });
    const twinC = candidate({ ...STRONG_MATCH, issueId: "CC-001" });
    const ranked = rankHistoricalCandidates(SUBJECT, [twinC, twinA, twinB]);
    assert.deepEqual(
      ranked.map((entry) => entry.candidate.issueId),
      ["AA-001", "BB-001", "CC-001"]
    );
  });

  it("produces the same order regardless of input order", () => {
    const pool = [STRONG_MATCH, candidate({ ...STRONG_MATCH, issueId: "ZZ-001" }), WEAK_MATCH];
    const forward = rankHistoricalCandidates(SUBJECT, pool).map((e) => e.candidate.issueId);
    const reversed = rankHistoricalCandidates(SUBJECT, [...pool].reverse()).map((e) => e.candidate.issueId);
    assert.deepEqual(forward, reversed);
  });

  it("returns at most five results", () => {
    const many = Array.from({ length: 25 }, (_v, index) =>
      candidate({ ...STRONG_MATCH, issueId: `AA-${String(index).padStart(3, "0")}` })
    );
    assert.equal(rankHistoricalCandidates(SUBJECT, many).length, MAX_SIMILAR_ISSUES);
  });

  it("cannot be asked for more than five", () => {
    const many = Array.from({ length: 25 }, (_v, index) =>
      candidate({ ...STRONG_MATCH, issueId: `AA-${String(index).padStart(3, "0")}` })
    );
    assert.equal(rankHistoricalCandidates(SUBJECT, many, 100).length, MAX_SIMILAR_ISSUES);
  });

  it("handles an empty corpus", () => {
    assert.deepEqual(rankHistoricalCandidates(SUBJECT, []), []);
  });

  it("does not mutate the input array or its members", () => {
    const pool = [STRONG_MATCH, WEAK_MATCH];
    const before = JSON.stringify(pool);
    rankHistoricalCandidates(SUBJECT, pool);
    assert.equal(JSON.stringify(pool), before);
    assert.equal(pool[0].issueId, STRONG_MATCH.issueId);
  });
});

// ---------------------------------------------------------------------------
// Nothing but the sanitized shape may escape
// ---------------------------------------------------------------------------

describe("the retrieval boundary", () => {
  /** A candidate row carrying values that must never reach a caller. Mirrors
   *  what the retrieval module maps a database row into. */
  const HOSTILE = candidate({
    issueId: "AA-500",
    title: "Barcode missing from printed shipping label",
    description: "SECRET-DESCRIPTION-SHOULD-NOT-ESCAPE https://res.cloudinary.com/x/y.jpg",
    category: "postage",
    rootCause: "Billing account was wrong. Contact person@example.com",
    resolution: "Reprint the label.",
    finalResolution: null,
  });

  /** Exactly what lib/ai/similarIssueRetrieval.ts does at its boundary. */
  function sanitizeAsRetrievalWould(row: HistoricalCandidate) {
    return sanitizeHistoricalIssueForAi({
      issueId: row.issueId,
      title: row.title,
      category: row.category,
      resolution: row.resolution,
      finalResolution: row.finalResolution,
      extraData: { rootCause: row.rootCause },
    });
  }

  it("emits only the five approved fields", () => {
    assert.deepEqual(Object.keys(sanitizeAsRetrievalWould(HOSTILE)).sort(), [
      "domain",
      "priorActionOrResolution",
      "priorRootCause",
      "problemSummary",
      "referenceLabel",
    ]);
  });

  it("does not carry the raw description across", () => {
    const serialized = JSON.stringify(sanitizeAsRetrievalWould(HOSTILE));
    assert.equal(serialized.includes("SECRET-DESCRIPTION-SHOULD-NOT-ESCAPE"), false);
  });

  it("carries no URL, attachment or Cloudinary metadata", () => {
    const serialized = JSON.stringify(sanitizeAsRetrievalWould(HOSTILE));
    assert.equal(/https?:\/\//.test(serialized), false);
    assert.equal(serialized.includes("cloudinary"), false);
  });

  it("redacts an email that survived into an allowed field", () => {
    const serialized = JSON.stringify(sanitizeAsRetrievalWould(HOSTILE));
    assert.equal(serialized.includes("person@example.com"), false);
  });

  it("passes the credential-shape guard", () => {
    assert.deepEqual(findCredentialLikeStrings(sanitizeAsRetrievalWould(HOSTILE)), []);
  });

  it("treats an intake-time fix as a PRIOR PROPOSED action, not a confirmed one", () => {
    const output = sanitizeAsRetrievalWould(HOSTILE);
    assert.equal(output.priorActionOrResolution, "Reprint the label.");
    // The field name itself is the guarantee: nothing in the shape says
    // "resolved", and the sanitizer prefers final_resolution when it exists.
    assert.equal("resolvedBy" in output, false);
    assert.equal("resolution" in output, false);
  });

  it("prefers a genuinely confirmed outcome when one exists", () => {
    const confirmed = sanitizeAsRetrievalWould({
      ...HOSTILE,
      finalResolution: "Billing account corrected and label reprinted.",
    });
    assert.equal(confirmed.priorActionOrResolution, "Billing account corrected and label reprinted.");
  });
});

// ---------------------------------------------------------------------------
// Structural guarantees
// ---------------------------------------------------------------------------

const AI_DIR = join(import.meta.dirname, "..", "lib", "ai");
const readSource = (file: string) => readFileSync(join(AI_DIR, file), "utf8");

/**
 * The source with comments removed.
 *
 * These assertions are about what the module DOES, not about what its
 * documentation mentions. Scanning raw text made them fail on their own
 * explanation — the file says "does not import geminiClient" and "there is no
 * `issue_id <> 'TS-001'` anywhere", and a naive substring search cannot tell a
 * promise from a violation. Stripping comments first is what makes the test
 * test the code.
 */
function codeOnly(file: string): string {
  return readSource(file)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

describe("Stage 3 structure", () => {
  it("keeps the retrieval module server-only", () => {
    assert.ok(readSource("similarIssueRetrieval.ts").includes('import "server-only"'));
  });

  it("keeps the ranking module free of server-only, so it stays testable", () => {
    assert.equal(codeOnly("similarityRanking.ts").includes('import "server-only"'), false);
  });

  it("never imports the Gemini client or the SDK into retrieval", () => {
    const source = codeOnly("similarIssueRetrieval.ts");
    assert.equal(source.includes("geminiClient"), false);
    assert.equal(source.includes("@google/genai"), false);
    assert.equal(source.includes("geminiConfig"), false);
  });

  it("has no write statement anywhere in the retrieval module", () => {
    const source = codeOnly("similarIssueRetrieval.ts").toUpperCase();
    for (const statement of ["INSERT INTO", "UPDATE ", "DELETE FROM", "BEGIN", "COMMIT", "TRUNCATE"]) {
      assert.equal(source.includes(statement), false, `retrieval contains ${statement}`);
    }
  });

  it("fully qualifies every table it reads", () => {
    const source = codeOnly("similarIssueRetrieval.ts");
    const fromClauses = source.match(/FROM\s+(\S+)/g) ?? [];
    assert.ok(fromClauses.length > 0);
    for (const clause of fromClauses) {
      assert.ok(clause.includes("issue_tracking."), `unqualified table in: ${clause}`);
    }
  });

  it("parameterises the corpus window and the excluded id", () => {
    const source = codeOnly("similarIssueRetrieval.ts");
    assert.ok(source.includes("$1::timestamptz"));
    assert.ok(source.includes("$2::timestamptz"));
    assert.ok(source.includes("i.issue_id <> $3"));
  });

  it("excludes the test Issues BY DEFINITION, not by a hard-coded id filter", () => {
    const source = codeOnly("similarIssueRetrieval.ts");
    assert.equal(/issue_id\s*(<>|!=)\s*['"]TS-/.test(source), false);
    assert.equal(/NOT\s+IN\s*\(\s*['"]TS-/.test(source), false);
    assert.equal(source.includes("TS-001"), false, "retrieval hard-codes a test Issue id");
  });

  it("never selects a forbidden column", () => {
    const selectList = codeOnly("similarIssueRetrieval.ts");
    for (const column of ["staff_code", "staff_name", "i.extra_data,", "deleted_by", "assignee_id"]) {
      assert.equal(selectList.includes(column), false, `retrieval selects ${column}`);
    }
  });
});

describe("the frozen historical corpus definition", () => {
  it("is a half-open migration window on created_at", () => {
    assert.equal(HISTORICAL_CORPUS_WINDOW.startInclusive, "2026-08-06T00:00:00Z");
    assert.equal(HISTORICAL_CORPUS_WINDOW.endExclusive, "2026-08-08T00:00:00Z");
  });

  it("records the proven corpus size", () => {
    assert.equal(EXPECTED_HISTORICAL_CORPUS_SIZE, 144);
  });

  it("closes before the test Issues were created on 2026-08-12", () => {
    assert.ok(
      Date.parse(HISTORICAL_CORPUS_WINDOW.endExclusive) < Date.parse("2026-08-12T00:00:00Z"),
      "the window must exclude TS-001/TS-002 by date"
    );
  });
});
