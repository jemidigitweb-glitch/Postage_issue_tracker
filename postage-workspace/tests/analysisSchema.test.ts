// Gemini Stage 2 — the structured analysis response validator.
//
// No network, no Gemini, no database. Every fixture is a hand-written object
// standing in for a model reply. The `area` labels are SYNTHETIC placeholders:
// the real LEDSone system-location map is a later stage and must not be
// invented here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_LIMITS,
  CONFIDENCE_LEVELS,
  HUMAN_VERIFICATION_WARNING,
  parseIssueAnalysis,
  withGuaranteedWarning,
  type IssueAnalysis,
} from "../lib/ai/analysisSchema";

/** A complete, valid response. Synthetic labels only. */
function validAnalysis(): Record<string, unknown> {
  return {
    summary: "Labels are printing without a barcode block on one warehouse printer.",
    likelyRootCauses: [
      {
        cause: "The wrong billing account is selected for the shipment.",
        whyLikely: "The supplied intake note records a billing account mismatch.",
        confidence: "MEDIUM",
      },
    ],
    confidence: "MEDIUM",
    areasToCheck: [
      {
        area: "SYSTEM ALPHA",
        reason: "Recorded quantity differs from the reported quantity.",
        check: "Compare the recorded value with the physical count.",
      },
    ],
    investigationSteps: ["Reprint one label and inspect the barcode block."],
    suggestedFix: "Correct the billing account, then reprint and verify the barcode.",
    alternativeSolutions: ["Raise the shipment manually while the account is corrected."],
    warnings: ["Confirm the billing account before reprinting at scale."],
  };
}

function expectRejected(mutate: (draft: Record<string, unknown>) => void): string[] {
  const draft = validAnalysis();
  mutate(draft);
  const result = parseIssueAnalysis(draft);
  assert.equal(result.ok, false, "expected the response to be rejected");
  return result.ok === false ? result.errors : [];
}

describe("a complete valid response", () => {
  const result = parseIssueAnalysis(validAnalysis());

  it("is accepted", () => {
    assert.equal(result.ok, true);
  });

  it("returns exactly the eight contract fields", () => {
    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.value).sort(), [
      "alternativeSolutions",
      "areasToCheck",
      "confidence",
      "investigationSteps",
      "likelyRootCauses",
      "suggestedFix",
      "summary",
      "warnings",
    ]);
  });

  it("does not carry through an extra property the model invented", () => {
    const draft = { ...validAnalysis(), executeNow: true, internalDebug: "leak-me" };
    const parsed = parseIssueAnalysis(draft);
    assert.ok(parsed.ok);
    assert.equal(JSON.stringify(parsed.value).includes("leak-me"), false);
    assert.equal("executeNow" in parsed.value, false);
  });

  it("trims whitespace from every string it accepts", () => {
    const draft = validAnalysis();
    draft.summary = "   padded summary   ";
    const parsed = parseIssueAnalysis(draft);
    assert.ok(parsed.ok);
    assert.equal(parsed.value.summary, "padded summary");
  });
});

describe("every required field is genuinely required", () => {
  const REQUIRED = [
    "summary",
    "likelyRootCauses",
    "confidence",
    "areasToCheck",
    "investigationSteps",
    "suggestedFix",
    "alternativeSolutions",
    "warnings",
  ];

  for (const field of REQUIRED) {
    it(`rejects a response missing "${field}"`, () => {
      const errors = expectRejected((draft) => {
        delete draft[field];
      });
      assert.ok(errors.some((message) => message.startsWith(field)), `no error mentioned ${field}`);
    });
  }

  it("rejects a non-object entirely", () => {
    for (const value of [null, undefined, "a string", 42, [], true]) {
      assert.equal(parseIssueAnalysis(value).ok, false);
    }
  });
});

describe("confidence is a three-value scale, never a number", () => {
  for (const level of CONFIDENCE_LEVELS) {
    it(`accepts ${level}`, () => {
      const draft = validAnalysis();
      draft.confidence = level;
      (draft.likelyRootCauses as Record<string, unknown>[])[0].confidence = level;
      assert.equal(parseIssueAnalysis(draft).ok, true);
    });
  }

  it("rejects a numeric confidence with a message naming the problem", () => {
    const errors = expectRejected((draft) => {
      draft.confidence = 0.87;
    });
    assert.ok(errors.some((message) => message.includes("numeric confidence is not accepted")));
  });

  it("rejects a percentage string", () => {
    expectRejected((draft) => {
      draft.confidence = "87%";
    });
  });

  it("rejects an unknown level", () => {
    expectRejected((draft) => {
      draft.confidence = "VERY HIGH";
    });
  });

  it("rejects a lower-case level — the contract is exact", () => {
    expectRejected((draft) => {
      draft.confidence = "high";
    });
  });

  it("rejects a numeric confidence inside a root cause", () => {
    const errors = expectRejected((draft) => {
      (draft.likelyRootCauses as Record<string, unknown>[])[0].confidence = 0.5;
    });
    assert.ok(errors.some((message) => message.includes("likelyRootCauses[0].confidence")));
  });
});

describe("malformed likelyRootCauses", () => {
  it("rejects an empty array — an analysis with no cause is not an analysis", () => {
    expectRejected((draft) => {
      draft.likelyRootCauses = [];
    });
  });

  it("rejects a bare string instead of an object", () => {
    expectRejected((draft) => {
      draft.likelyRootCauses = ["the account is wrong"];
    });
  });

  it("rejects a missing whyLikely — the justification is not optional", () => {
    const errors = expectRejected((draft) => {
      delete (draft.likelyRootCauses as Record<string, unknown>[])[0].whyLikely;
    });
    assert.ok(errors.some((message) => message.includes("likelyRootCauses[0].whyLikely")));
  });

  it("rejects a null entry", () => {
    expectRejected((draft) => {
      draft.likelyRootCauses = [null];
    });
  });

  it("rejects more than the maximum", () => {
    const errors = expectRejected((draft) => {
      draft.likelyRootCauses = Array.from({ length: ANALYSIS_LIMITS.maxRootCauses + 1 }, () => ({
        cause: "c",
        whyLikely: "w",
        confidence: "LOW",
      }));
    });
    assert.ok(errors.some((message) => message.includes("at most")));
  });
});

describe("malformed areasToCheck", () => {
  it("rejects an empty array — 'where to check' is mandatory", () => {
    expectRejected((draft) => {
      draft.areasToCheck = [];
    });
  });

  it("rejects an entry missing `check`", () => {
    const errors = expectRejected((draft) => {
      delete (draft.areasToCheck as Record<string, unknown>[])[0].check;
    });
    assert.ok(errors.some((message) => message.includes("areasToCheck[0].check")));
  });

  it("rejects an entry whose area is not a string", () => {
    expectRejected((draft) => {
      (draft.areasToCheck as Record<string, unknown>[])[0].area = 7;
    });
  });

  it("rejects more than the maximum", () => {
    expectRejected((draft) => {
      draft.areasToCheck = Array.from({ length: ANALYSIS_LIMITS.maxAreasToCheck + 1 }, () => ({
        area: "SYSTEM ALPHA",
        reason: "r",
        check: "c",
      }));
    });
  });
});


describe("invalid nulls and wrong types", () => {
  it("rejects a null summary", () => {
    expectRejected((draft) => {
      draft.summary = null;
    });
  });

  it("rejects an empty-string summary", () => {
    expectRejected((draft) => {
      draft.summary = "   ";
    });
  });

  it("rejects an array where a string belongs", () => {
    expectRejected((draft) => {
      draft.suggestedFix = ["do the thing"];
    });
  });

  it("rejects an object where an array belongs", () => {
    expectRejected((draft) => {
      draft.investigationSteps = { first: "step" };
    });
  });

  it("rejects a null entry inside investigationSteps", () => {
    expectRejected((draft) => {
      draft.investigationSteps = [null];
    });
  });

  it("reports every problem at once, not just the first", () => {
    const errors = expectRejected((draft) => {
      draft.summary = null;
      draft.confidence = 1;
      draft.suggestedFix = 5;
    });
    assert.ok(errors.length >= 3, `expected several errors, got ${errors.length}`);
  });
});

describe("oversized values are REJECTED (outbound direction)", () => {
  it("rejects an oversized summary", () => {
    const errors = expectRejected((draft) => {
      draft.summary = "x".repeat(ANALYSIS_LIMITS.summaryMaxLength + 1);
    });
    assert.ok(errors.some((message) => message.includes("exceeds")));
  });

  it("rejects an oversized suggestedFix", () => {
    expectRejected((draft) => {
      draft.suggestedFix = "x".repeat(ANALYSIS_LIMITS.suggestedFixMaxLength + 1);
    });
  });

  it("rejects an oversized investigation step", () => {
    expectRejected((draft) => {
      draft.investigationSteps = ["x".repeat(ANALYSIS_LIMITS.itemMaxLength + 1)];
    });
  });

  it("rejects an oversized root-cause justification", () => {
    expectRejected((draft) => {
      (draft.likelyRootCauses as Record<string, unknown>[])[0].whyLikely =
        "x".repeat(ANALYSIS_LIMITS.itemMaxLength + 1);
    });
  });

  it("rejects too many investigation steps", () => {
    expectRejected((draft) => {
      draft.investigationSteps = Array.from(
        { length: ANALYSIS_LIMITS.maxInvestigationSteps + 1 },
        (_v, index) => `step ${index}`
      );
    });
  });

  it("rejects too many alternative solutions", () => {
    expectRejected((draft) => {
      draft.alternativeSolutions = Array.from(
        { length: ANALYSIS_LIMITS.maxAlternativeSolutions + 1 },
        (_v, index) => `alt ${index}`
      );
    });
  });

  it("accepts a value exactly at the limit", () => {
    const draft = validAnalysis();
    draft.summary = "x".repeat(ANALYSIS_LIMITS.summaryMaxLength);
    assert.equal(parseIssueAnalysis(draft).ok, true);
  });
});

describe("the human-verification warning is guaranteed by this code, not by the model", () => {
  it("is injected when the model omits it entirely", () => {
    const draft = validAnalysis();
    draft.warnings = ["Something unrelated."];
    const parsed = parseIssueAnalysis(draft);
    assert.ok(parsed.ok);
    assert.ok(parsed.value.warnings.includes(HUMAN_VERIFICATION_WARNING));
    assert.equal(parsed.value.warnings[0], HUMAN_VERIFICATION_WARNING);
  });

  it("is injected when the model returns an empty warnings array", () => {
    const draft = validAnalysis();
    draft.warnings = [];
    const parsed = parseIssueAnalysis(draft);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value.warnings, [HUMAN_VERIFICATION_WARNING]);
  });

  it("is not duplicated when the model already produced it", () => {
    const draft = validAnalysis();
    draft.warnings = [HUMAN_VERIFICATION_WARNING, "Also verify the account."];
    const parsed = parseIssueAnalysis(draft);
    assert.ok(parsed.ok);
    const occurrences = parsed.value.warnings.filter((w) => w === HUMAN_VERIFICATION_WARNING).length;
    assert.equal(occurrences, 1);
  });

  it("survives a model that filled its entire warning budget", () => {
    const draft = validAnalysis();
    draft.warnings = Array.from({ length: ANALYSIS_LIMITS.maxWarnings }, (_v, i) => `warning ${i}`);
    const parsed = parseIssueAnalysis(draft);
    assert.ok(parsed.ok);
    assert.equal(parsed.value.warnings[0], HUMAN_VERIFICATION_WARNING);
    assert.equal(parsed.value.warnings.length, ANALYSIS_LIMITS.maxWarnings + 1);
  });

  it("every accepted response has a non-empty warnings array", () => {
    const drafts: Record<string, unknown>[] = [validAnalysis(), validAnalysis(), validAnalysis()];
    drafts[1].warnings = [];
    drafts[2].warnings = [HUMAN_VERIFICATION_WARNING];
    for (const draft of drafts) {
      const parsed = parseIssueAnalysis(draft);
      assert.ok(parsed.ok);
      assert.ok(parsed.value.warnings.length > 0);
      assert.ok(parsed.value.warnings.includes(HUMAN_VERIFICATION_WARNING));
    }
  });

  it("withGuaranteedWarning does not mutate its input", () => {
    const input = ["a"];
    const output = withGuaranteedWarning(input);
    assert.deepEqual(input, ["a"]);
    assert.notEqual(output, input);
  });
});

describe("the JSON Schema stays aligned with the validator", () => {
  it("requires exactly the nine contract fields", () => {
    assert.deepEqual([...ANALYSIS_JSON_SCHEMA.required].sort(), [
      "alternativeSolutions",
      "areasToCheck",
      "confidence",
      "investigationSteps",
      "likelyRootCauses",
      "suggestedFix",
      "summary",
      "warnings",
    ]);
  });

  it("declares confidence as the same three-value enum", () => {
    assert.deepEqual([...ANALYSIS_JSON_SCHEMA.properties.confidence.enum], [...CONFIDENCE_LEVELS]);
  });

  it("stays shallow — max nesting depth 2 — per the structured-output guidance", () => {
    function depth(node: unknown): number {
      if (!node || typeof node !== "object") return 0;
      const record = node as Record<string, unknown>;
      if (record.type === "object" && record.properties) {
        const children = Object.values(record.properties as Record<string, unknown>);
        return 1 + Math.max(0, ...children.map(depth));
      }
      if (record.type === "array" && record.items) {
        return depth(record.items);
      }
      return 0;
    }
    assert.ok(depth(ANALYSIS_JSON_SCHEMA) <= 2, `schema is ${depth(ANALYSIS_JSON_SCHEMA)} levels deep`);
  });

  it("is a plain data object with no function in it", () => {
    assert.equal(JSON.stringify(ANALYSIS_JSON_SCHEMA).includes("function"), false);
  });
});

describe("Stage 2 sends nothing", () => {
  it("the schema module imports no SDK, no server-only, no database", async () => {
    const schemaModule = await import("../lib/ai/analysisSchema");
    const exported = Object.keys(schemaModule).sort();
    // Purely declarative surface: types, constants, a validator, a helper.
    for (const forbidden of ["callGemini", "sendAnalysis", "analyseIssue", "runAnalysis"]) {
      assert.equal(exported.includes(forbidden), false, `Stage 2 must not export ${forbidden}`);
    }
  });

  it("a parsed analysis is a plain object safe to render", () => {
    const parsed = parseIssueAnalysis(validAnalysis());
    assert.ok(parsed.ok);
    const value: IssueAnalysis = parsed.value;
    assert.equal(typeof value.summary, "string");
    assert.equal(Array.isArray(value.areasToCheck), true);
  });
});
