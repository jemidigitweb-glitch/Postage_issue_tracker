// The Assignee's AI Assistant ON/OFF preference.
//
// No network, no Gemini, no database, no DOM. The storage is a fake object, so
// every rule is exercised directly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ADMIN_AI_ASSISTANT_PREFERENCE_KEY,
  AI_ASSISTANT_DEFAULT_ENABLED,
  AI_ASSISTANT_PREFERENCE_KEY,
  readAiAssistantPreference,
  writeAiAssistantPreference,
  type PreferenceStorage,
} from "../lib/access/aiAssistantPreference";

/** An in-memory stand-in for localStorage. */
function fakeStorage(initial: Record<string, string> = {}): PreferenceStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** A storage that refuses everything, like Safari private mode. */
const hostileStorage: PreferenceStorage = {
  getItem() {
    throw new Error("storage disabled");
  },
  setItem() {
    throw new Error("storage disabled");
  },
};

describe("default state", () => {
  it("is ON", () => {
    assert.equal(AI_ASSISTANT_DEFAULT_ENABLED, true);
  });

  it("is ON when nothing has been saved", () => {
    assert.equal(readAiAssistantPreference(fakeStorage()), true);
  });

  it("is ON when there is no storage at all (server render)", () => {
    assert.equal(readAiAssistantPreference(null), true);
    assert.equal(readAiAssistantPreference(undefined), true);
  });

  it("is ON when the storage throws", () => {
    assert.equal(readAiAssistantPreference(hostileStorage), true);
  });

  it("is ON when the stored value is corrupted", () => {
    for (const junk of ["", "  ", "TRUE", "0", "1", "yes", "{}", "null"]) {
      assert.equal(
        readAiAssistantPreference(fakeStorage({ [AI_ASSISTANT_PREFERENCE_KEY]: junk })),
        true,
        `"${junk}" should fall back to the default`
      );
    }
  });
});

describe("saved preferences round-trip", () => {
  it("restores a saved OFF preference", () => {
    assert.equal(
      readAiAssistantPreference(fakeStorage({ [AI_ASSISTANT_PREFERENCE_KEY]: "false" })),
      false
    );
  });

  it("restores a saved ON preference", () => {
    assert.equal(
      readAiAssistantPreference(fakeStorage({ [AI_ASSISTANT_PREFERENCE_KEY]: "true" })),
      true
    );
  });

  it("writes then reads back OFF — survives a refresh", () => {
    const storage = fakeStorage();
    writeAiAssistantPreference(storage, false);
    assert.equal(readAiAssistantPreference(storage), false);
  });

  it("writes then reads back ON", () => {
    const storage = fakeStorage({ [AI_ASSISTANT_PREFERENCE_KEY]: "false" });
    writeAiAssistantPreference(storage, true);
    assert.equal(readAiAssistantPreference(storage), true);
  });

  it("never throws when storage refuses a write", () => {
    assert.doesNotThrow(() => writeAiAssistantPreference(hostileStorage, false));
    assert.doesNotThrow(() => writeAiAssistantPreference(null, false));
  });
});

describe("the two portals keep independent preferences", () => {
  it("uses two different keys", () => {
    assert.equal(AI_ASSISTANT_PREFERENCE_KEY, "issue-tracker-ai-assistant-enabled");
    assert.equal(ADMIN_AI_ASSISTANT_PREFERENCE_KEY, "issue-tracker-admin-ai-assistant-enabled");
    assert.notEqual(AI_ASSISTANT_PREFERENCE_KEY, ADMIN_AI_ASSISTANT_PREFERENCE_KEY);
  });

  it("turning the Assignee panel off does not turn the Super Admin panel off", () => {
    const storage = fakeStorage();
    writeAiAssistantPreference(storage, false, AI_ASSISTANT_PREFERENCE_KEY);
    assert.equal(readAiAssistantPreference(storage, AI_ASSISTANT_PREFERENCE_KEY), false);
    assert.equal(readAiAssistantPreference(storage, ADMIN_AI_ASSISTANT_PREFERENCE_KEY), true);
  });

  it("and the reverse", () => {
    const storage = fakeStorage();
    writeAiAssistantPreference(storage, false, ADMIN_AI_ASSISTANT_PREFERENCE_KEY);
    assert.equal(readAiAssistantPreference(storage, ADMIN_AI_ASSISTANT_PREFERENCE_KEY), false);
    assert.equal(readAiAssistantPreference(storage, AI_ASSISTANT_PREFERENCE_KEY), true);
  });

  it("both default to ON", () => {
    const storage = fakeStorage();
    assert.equal(readAiAssistantPreference(storage, AI_ASSISTANT_PREFERENCE_KEY), true);
    assert.equal(readAiAssistantPreference(storage, ADMIN_AI_ASSISTANT_PREFERENCE_KEY), true);
  });
});

describe("what is stored", () => {
  it("uses exactly one key, and a clear one", () => {
    const storage = fakeStorage();
    writeAiAssistantPreference(storage, false);
    assert.deepEqual(Object.keys(storage.data), ["issue-tracker-ai-assistant-enabled"]);
    assert.equal(AI_ASSISTANT_PREFERENCE_KEY, "issue-tracker-ai-assistant-enabled");
  });

  it('stores only the literal "true" or "false"', () => {
    const storage = fakeStorage();
    writeAiAssistantPreference(storage, true);
    assert.equal(storage.data[AI_ASSISTANT_PREFERENCE_KEY], "true");
    writeAiAssistantPreference(storage, false);
    assert.equal(storage.data[AI_ASSISTANT_PREFERENCE_KEY], "false");
  });

  it("stores no Issue data, no identity and no secret", () => {
    const storage = fakeStorage();
    writeAiAssistantPreference(storage, true);
    writeAiAssistantPreference(storage, false);

    // The VALUES are what could carry data. (The key name itself is
    // "issue-tracker-ai-assistant-enabled" — an application prefix, not
    // content, which is why this asserts on values rather than the whole map.)
    const values = Object.values(storage.data);
    assert.deepEqual(values, ["false"]);
    for (const value of values) {
      for (const forbidden of ["ND-", "SA-", "token", "key", "user", "assignee", "@", "http"]) {
        assert.equal(
          value.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `stored value contains "${forbidden}"`
        );
      }
      assert.ok(value === "true" || value === "false");
    }
  });
});

// ---------------------------------------------------------------------------
// Structural: the toggle is presentation, never authorization
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
function codeOnly(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

describe("the toggle cannot touch server configuration", () => {
  const preference = codeOnly("lib/access/aiAssistantPreference.ts");
  const panel = codeOnly("components/issues/IssueAiAssistant.tsx");

  it("never references a Gemini environment variable", () => {
    for (const source of [preference, panel]) {
      for (const name of [
        "GEMINI_ENABLED",
        "GEMINI_ALLOW_REAL_ISSUE_DATA",
        "GEMINI_MODEL",
        "GEMINI_API_KEY",
        "process.env",
      ]) {
        assert.equal(source.includes(name), false, `client code references ${name}`);
      }
    }
  });

  it("the preference module reaches no server module", () => {
    assert.equal(preference.includes("server-only"), false);
    assert.equal(/from\s+["'][^"']*lib\/queries/.test(preference), false);
    assert.equal(/from\s+["'][^"']*\/db["']/.test(preference), false);
    assert.equal(preference.includes("geminiConfig"), false);
    assert.equal(preference.includes("geminiClient"), false);
  });

  it("the panel still posts to the same guarded Server Action", () => {
    assert.ok(panel.includes("analyseIssueAction"));
    assert.ok(panel.includes('name="issueId"'));
  });

  it("the toggle uses switch semantics and is keyboard operable", () => {
    assert.ok(panel.includes('role="switch"'));
    assert.ok(panel.includes("aria-checked={enabled}"));
    assert.ok(panel.includes('type="button"'), "the toggle must not submit the form");
    assert.ok(panel.includes('aria-labelledby="ai-assistant-heading"'));
  });

  it("shows the off-state message and hides the analysis action", () => {
    assert.ok(panel.includes("AI Assistant is turned off."));
    assert.ok(panel.includes("{enabled && ("), "the analyse form must be gated on the toggle");
  });

  it("the action is icon-only, but still named for assistive technology", () => {
    // The wording moved out of the button face into an aria-label and a
    // hover/focus tooltip — it must still exist, just not be printed inside
    // the control.
    assert.ok(panel.includes('aria-label="Analyse this Issue with AI"'));
    assert.ok(panel.includes('role="tooltip"'));
    assert.ok(panel.includes("Analyse with AI"), "the wording must survive as a tooltip");
    assert.equal(
      panel.includes('className={primaryButtonClassName}'),
      false,
      "the old text button should be gone"
    );
  });

  it("prevents a repeated submission while a request is in flight", () => {
    assert.ok(panel.includes("disabled={pending}"));
  });

  it("respects prefers-reduced-motion for every decorative animation", () => {
    assert.ok(panel.includes("prefers-reduced-motion: reduce"));
    for (const animation of ["ai-float", "ai-halo", "ai-think"]) {
      assert.ok(panel.includes(animation), `missing animation class ${animation}`);
    }
    // The reduced-motion block must switch them all off.
    const reducedBlock = panel.slice(panel.indexOf("prefers-reduced-motion"));
    for (const animation of ["ai-float", "ai-halo", "ai-think"]) {
      assert.ok(reducedBlock.includes(animation), `${animation} is not disabled for reduced motion`);
    }
  });

  it("keeps its animation out of the shared global stylesheet", () => {
    // globals.css is shared with the Super Admin pages and must stay untouched.
    const globals = read("app/globals.css");
    for (const animation of ["ai-float", "ai-halo", "ai-think"]) {
      assert.equal(globals.includes(animation), false, `${animation} leaked into globals.css`);
    }
  });

  it("reads the preference hydration-safely, with the default as the server snapshot", () => {
    assert.ok(panel.includes("useSyncExternalStore("));
    assert.ok(panel.includes("() => AI_ASSISTANT_DEFAULT_ENABLED"));
    // No setState-in-effect: that is a lint error in this project and an extra
    // render, and VoiceRecorder.tsx already documents the same choice.
    assert.equal(panel.includes("useEffect("), false);
  });

  it("the panel is rendered only behind the server-resolved flag", () => {
    const page = codeOnly("app/dashboard/issues/[issueId]/page.tsx");
    assert.ok(page.includes("view.showAiAssistant && ("));
    // Both portals now get the panel, under DIFFERENT permissions; everyone
    // else still gets nothing, because NOTHING_EXTRA leaves the flag off.
    const view = codeOnly("lib/access/issueDetailView.ts");
    assert.ok(view.includes("showAiAssistant: false"));
  });

  it("each portal uses its own localStorage key", () => {
    const page = codeOnly("app/dashboard/issues/[issueId]/page.tsx");
    assert.ok(page.includes("ADMIN_AI_ASSISTANT_PREFERENCE_KEY"));
    assert.ok(page.includes("AI_ASSISTANT_PREFERENCE_KEY"));
    assert.ok(page.includes('view.kind === "admin"'), "the key is chosen server-side");
  });
});
