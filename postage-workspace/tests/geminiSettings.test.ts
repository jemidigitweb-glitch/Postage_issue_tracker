// Gemini Stage 1 — configuration parsing, safety gates, and the synthetic
// check.
//
// EVERY test here uses a FAKE sender. No test in this file constructs the SDK,
// reads GEMINI_API_KEY, opens a socket, or consumes one token of API quota.
// The fake also records whether it was called at all, which is how the
// "disabled means no outbound call" claims are proven rather than asserted.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  assertPromptAllowed,
  GEMINI_DEFAULT_MODEL,
  GEMINI_SYNTHETIC_PROMPT,
  parseBooleanFlag,
  performSyntheticCheck,
  RealIssueDataBlockedError,
  redactSecret,
  resolveGeminiReadiness,
  resolveGeminiSettings,
  type GeminiFeatureStatus,
  type GeminiSender,
} from "../lib/ai/geminiPolicy";

/** A sender that records its calls and never touches the network. */
function fakeSender(reply: string): { send: GeminiSender; calls: { model: string; input: string }[] } {
  const calls: { model: string; input: string }[] = [];
  const send: GeminiSender = async (request) => {
    calls.push(request);
    return { output_text: reply };
  };
  return { send, calls };
}

function statusOf(overrides: Partial<GeminiFeatureStatus> = {}): GeminiFeatureStatus {
  return {
    enabled: true,
    configured: true,
    model: GEMINI_DEFAULT_MODEL,
    allowRealIssueData: false,
    ...overrides,
  };
}

describe("parseBooleanFlag — fails closed", () => {
  it('accepts exactly "true"', () => {
    assert.equal(parseBooleanFlag("true"), true);
  });

  it("accepts it case-insensitively and with surrounding whitespace", () => {
    assert.equal(parseBooleanFlag("TRUE"), true);
    assert.equal(parseBooleanFlag("  True  "), true);
  });

  const FALSY = ["false", "FALSE", "1", "0", "yes", "no", "on", "off", "", "   ", "truthy", "true!"];
  for (const value of FALSY) {
    it(`treats ${JSON.stringify(value)} as false`, () => {
      assert.equal(parseBooleanFlag(value), false);
    });
  }

  it("treats undefined and null as false", () => {
    assert.equal(parseBooleanFlag(undefined), false);
    assert.equal(parseBooleanFlag(null), false);
  });
});

describe("resolveGeminiSettings — defaults", () => {
  it("defaults GEMINI_ENABLED to false when absent", () => {
    assert.equal(resolveGeminiSettings({}).enabled, false);
  });

  it("defaults allowRealIssueData to false when absent", () => {
    assert.equal(resolveGeminiSettings({}).allowRealIssueData, false);
  });

  it("defaults the model to the verified current Flash model", () => {
    assert.equal(resolveGeminiSettings({}).model, "gemini-3.6-flash");
    assert.equal(GEMINI_DEFAULT_MODEL, "gemini-3.6-flash");
  });

  it("reports not configured when there is no API key", () => {
    assert.equal(resolveGeminiSettings({}).configured, false);
  });

  it("treats a blank API key as not configured", () => {
    assert.equal(resolveGeminiSettings({ GEMINI_API_KEY: "   " }).configured, false);
  });
});

describe("resolveGeminiSettings — explicit values", () => {
  it("honours an explicit false", () => {
    assert.equal(resolveGeminiSettings({ GEMINI_ENABLED: "false" }).enabled, false);
  });

  it("honours an explicit true", () => {
    assert.equal(resolveGeminiSettings({ GEMINI_ENABLED: "true" }).enabled, true);
  });

  it("falls back to disabled on an invalid value", () => {
    assert.equal(resolveGeminiSettings({ GEMINI_ENABLED: "maybe" }).enabled, false);
    assert.equal(resolveGeminiSettings({ GEMINI_ALLOW_REAL_ISSUE_DATA: "1" }).allowRealIssueData, false);
  });

  it("detects a configured key without exposing it", () => {
    const status = resolveGeminiSettings({ GEMINI_API_KEY: "SECRET-VALUE-DO-NOT-LEAK" });
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes("SECRET-VALUE-DO-NOT-LEAK"), false);
  });

  it("only ever exposes the four safe keys", () => {
    const status = resolveGeminiSettings({ GEMINI_API_KEY: "k", GEMINI_ENABLED: "true" });
    assert.deepEqual(Object.keys(status).sort(), [
      "allowRealIssueData",
      "configured",
      "enabled",
      "model",
    ]);
  });

  it("accepts a model override", () => {
    assert.equal(resolveGeminiSettings({ GEMINI_MODEL: "gemini-3.5-flash-lite" }).model, "gemini-3.5-flash-lite");
  });

  it("ignores a blank model override", () => {
    assert.equal(resolveGeminiSettings({ GEMINI_MODEL: "   " }).model, GEMINI_DEFAULT_MODEL);
  });
});

describe("resolveGeminiReadiness", () => {
  it("reports disabled first, whatever the key state", () => {
    const readiness = resolveGeminiReadiness(statusOf({ enabled: false, configured: true }));
    assert.equal(readiness.ready, false);
    assert.equal(readiness.ready === false && readiness.reason, "disabled");
  });

  it("reports not_configured when enabled without a key", () => {
    const readiness = resolveGeminiReadiness(statusOf({ configured: false }));
    assert.equal(readiness.ready, false);
    assert.equal(readiness.ready === false && readiness.reason, "not_configured");
  });

  it("is ready when enabled and configured", () => {
    assert.equal(resolveGeminiReadiness(statusOf()).ready, true);
  });
});

describe("the real-Issue-data gate", () => {
  it("allows the frozen synthetic prompt while the gate is closed", () => {
    assert.doesNotThrow(() => assertPromptAllowed(GEMINI_SYNTHETIC_PROMPT, statusOf()));
  });

  it("blocks anything else while the gate is closed", () => {
    assert.throws(
      () => assertPromptAllowed("Issue ND-001: DHL label printed without a barcode.", statusOf()),
      RealIssueDataBlockedError
    );
  });

  it("blocks text that merely CONTAINS the synthetic prompt", () => {
    assert.throws(
      () => assertPromptAllowed(`${GEMINI_SYNTHETIC_PROMPT} Also analyse: customer address…`, statusOf()),
      RealIssueDataBlockedError
    );
  });

  it("blocks an empty prompt", () => {
    assert.throws(() => assertPromptAllowed("", statusOf()), RealIssueDataBlockedError);
  });

  it("opens only when the owner explicitly opts in", () => {
    assert.doesNotThrow(() =>
      assertPromptAllowed("anything at all", statusOf({ allowRealIssueData: true }))
    );
  });

  it("carries no content in the error it raises", () => {
    const secret = "CONFIDENTIAL-ISSUE-TEXT";
    try {
      assertPromptAllowed(secret, statusOf());
      assert.fail("expected the gate to throw");
    } catch (error) {
      assert.ok(error instanceof RealIssueDataBlockedError);
      assert.equal(error.message.includes(secret), false);
    }
  });
});

describe("performSyntheticCheck — STATE A: disabled", () => {
  it("makes NO outbound call", async () => {
    const { send, calls } = fakeSender("READY");
    const outcome = await performSyntheticCheck(statusOf({ enabled: false }), send);
    assert.equal(calls.length, 0);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, "disabled");
    assert.equal(outcome.ok === false && outcome.latencyMs, null);
  });
});

describe("performSyntheticCheck — STATE B: enabled, no key", () => {
  it("makes NO outbound call and does not throw", async () => {
    const { send, calls } = fakeSender("READY");
    const outcome = await performSyntheticCheck(statusOf({ configured: false }), send);
    assert.equal(calls.length, 0);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, "not_configured");
  });
});

describe("performSyntheticCheck — STATE C: enabled and configured", () => {
  it("sends exactly the frozen synthetic prompt, once", async () => {
    const { send, calls } = fakeSender("READY");
    const outcome = await performSyntheticCheck(statusOf(), send);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, GEMINI_SYNTHETIC_PROMPT);
    assert.equal(calls[0].model, GEMINI_DEFAULT_MODEL);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok === true && outcome.output, "READY");
  });

  it("sends nothing resembling Issue data", async () => {
    const { send, calls } = fakeSender("READY");
    await performSyntheticCheck(statusOf(), send);
    const sent = JSON.stringify(calls);
    for (const forbidden of ["issue_tracking", "ND-", "SELECT", "extra_data", "staff_name", "sku"]) {
      assert.equal(sent.includes(forbidden), false, `synthetic payload leaked "${forbidden}"`);
    }
  });

  it("reports a measured latency", async () => {
    const { send } = fakeSender("READY");
    let clock = 1000;
    const outcome = await performSyntheticCheck(statusOf(), send, () => {
      const value = clock;
      clock += 250;
      return value;
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok === true && outcome.latencyMs, 250);
  });

  it("turns a thrown transport error into a result, never an exception", async () => {
    const send: GeminiSender = async () => {
      throw new Error("Error: 503 UNAVAILABLE");
    };
    const outcome = await performSyntheticCheck(statusOf(), send);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, "request_failed");
  });

  it("treats an empty reply as a failure rather than success", async () => {
    const send: GeminiSender = async () => ({ output_text: "   " });
    const outcome = await performSyntheticCheck(statusOf(), send);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, "empty_response");
  });
});

describe("performSyntheticCheck — STATE D: real Issue analysis is absent", () => {
  it("exposes no function that accepts Issue content", async () => {
    const policy = await import("../lib/ai/geminiPolicy");
    // performSyntheticCheck is the only exported orchestration, and its
    // transmitted text is a module constant, not a parameter.
    assert.equal(typeof policy.performSyntheticCheck, "function");
    const exported = Object.keys(policy).sort();
    for (const forbidden of ["analyseIssue", "analyzeIssue", "sendIssue", "buildIssuePrompt"]) {
      assert.equal(exported.includes(forbidden), false, `Stage 1 must not export ${forbidden}`);
    }
  });
});

describe("redactSecret", () => {
  it("removes every occurrence of the key", () => {
    assert.equal(redactSecret("url?key=ABC123&retry=ABC123", "ABC123"), "url?key=[REDACTED]&retry=[REDACTED]");
  });

  it("is a no-op when there is no key", () => {
    assert.equal(redactSecret("plain message", undefined), "plain message");
    assert.equal(redactSecret("plain message", ""), "plain message");
  });
});

// ---------------------------------------------------------------------------
// Structural guarantees — read the source, assert the shape of Stage 1
// ---------------------------------------------------------------------------

const AI_DIR = join(import.meta.dirname, "..", "lib", "ai");
const readSource = (file: string) => readFileSync(join(AI_DIR, file), "utf8");

describe("Stage 1 structure", () => {
  it("keeps the config module server-only", () => {
    assert.ok(readSource("geminiConfig.ts").includes('import "server-only"'));
  });

  it("keeps the client module server-only", () => {
    assert.ok(readSource("geminiClient.ts").includes('import "server-only"'));
  });

  it("keeps the policy module free of server-only, so it stays testable", () => {
    assert.equal(readSource("geminiPolicy.ts").includes('import "server-only"'), false);
  });

  it("never READS a NEXT_PUBLIC variable (the browser cannot own these switches)", () => {
    for (const file of ["geminiPolicy.ts", "geminiConfig.ts", "geminiClient.ts"]) {
      const source = readSource(file);
      assert.equal(
        /process\.env\.NEXT_PUBLIC/.test(source),
        false,
        `${file} reads a NEXT_PUBLIC variable`
      );
      assert.equal(
        /NEXT_PUBLIC_GEMINI[A-Z_]*\s*[=:]/.test(source),
        false,
        `${file} defines a NEXT_PUBLIC Gemini variable`
      );
    }
  });

  it("does not import the database or any query module", () => {
    for (const file of ["geminiPolicy.ts", "geminiConfig.ts", "geminiClient.ts"]) {
      const source = readSource(file);
      assert.equal(/from\s+["'][^"']*lib\/queries/.test(source), false, `${file} imports a query module`);
      assert.equal(/from\s+["'][^"']*\/db["']/.test(source), false, `${file} imports the database`);
      assert.equal(source.includes("issue_tracking."), false, `${file} references a database table`);
    }
  });

  it("the synthetic path transmits only the frozen constant", () => {
    const client = readSource("geminiClient.ts");
    // runGeminiSyntheticCheck passes through whatever performSyntheticCheck
    // hands it — a module constant — and builds no input of its own.
    assert.ok(client.includes("performSyntheticCheck"));
    assert.ok(client.includes("output_text: interaction.output_text"));
  });

  it("the Stage 4 analysis path is guarded by the real-data gate", () => {
    // Stage 4 added a SECOND send path (sendAnalysisRequest) that does build a
    // prompt — legitimately, and only for content the flow has already gated.
    // What matters is that assertPromptAllowed() runs before the SDK is
    // constructed, so while GEMINI_ALLOW_REAL_ISSUE_DATA is false it throws
    // for anything that is not the frozen synthetic prompt.
    const client = readSource("geminiClient.ts");
    const analysisPath = client.slice(client.indexOf("export async function sendAnalysisRequest"));
    assert.ok(analysisPath.includes("assertPromptAllowed(request.prompt, status)"));
    assert.ok(
      analysisPath.indexOf("assertPromptAllowed") < analysisPath.indexOf("new GoogleGenAI"),
      "the gate must be checked before the client is constructed"
    );
  });

  it("has exactly two outbound call sites, both in this module", () => {
    // Comments stripped: the file documents the call shape in prose, and a
    // raw substring count would score that as a third call site.
    const code = readSource("geminiClient.ts")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    const calls = code.match(/ai\.interactions\.create\(/g) ?? [];
    assert.equal(calls.length, 2, `unexpected number of Gemini call sites: ${calls.length}`);
  });

  it("exposes a synthetic check that takes no arguments", () => {
    const client = readSource("geminiClient.ts");
    assert.ok(
      client.includes("export async function runGeminiSyntheticCheck(): Promise<GeminiSyntheticOutcome>"),
      "runGeminiSyntheticCheck must accept no parameters"
    );
  });
});
