// The Assignee's personal ON/OFF preference for the AI Investigation
// Assistant panel.
//
// PURE: no `server-only`, no `next/*`, no database, and no direct reference to
// `window` or `localStorage` — the storage object is passed IN, so every rule
// is unit-testable with a fake (tests/aiAssistantPreference.test.ts) and
// `npm test` can reach it without a DOM.
//
// ── THIS IS A UI PREFERENCE, NOT A SECURITY CONTROL ─────────────────────────
// It decides only whether one panel is shown to one person on one browser. It
// is stored in localStorage, which the user fully controls, so it can be
// edited or deleted at will — and that is fine, because it authorizes nothing.
//
// Every real gate stays exactly where it was, on the server, and none of them
// can be reached from here:
//   GEMINI_ENABLED · GEMINI_API_KEY · GEMINI_ALLOW_REAL_ISSUE_DATA ·
//   authenticated session · current-assignment ownership ·
//   issue:analyse_own_assigned
// Turning this toggle ON grants nothing. It cannot change an environment
// variable, and there is no endpoint anywhere in this application that can.
//
// ── WHAT IS STORED ──────────────────────────────────────────────────────────
// Exactly one key, holding exactly the string "true" or "false". No Issue id,
// no Issue content, no user id, no token, no analysis result — nothing that
// could leak if the browser profile were copied.

/** The Assignee portal's key. */
export const AI_ASSISTANT_PREFERENCE_KEY = "issue-tracker-ai-assistant-enabled";

/** The Super Admin portal's key. DELIBERATELY SEPARATE: the two portals are
 *  different workspaces, often different people, and one turning the panel off
 *  must not turn it off for the other. */
export const ADMIN_AI_ASSISTANT_PREFERENCE_KEY = "issue-tracker-admin-ai-assistant-enabled";

/** ON unless the Assignee has previously chosen otherwise. */
export const AI_ASSISTANT_DEFAULT_ENABLED = true;

/** The slice of the Storage API used here. Declared structurally so a test can
 *  pass a plain object and so this module never touches a global. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads the saved preference.
 *
 * Fails SAFE to the default in every degenerate case: no storage available
 * (server render, private mode, storage disabled), nothing saved yet, a value
 * that is not exactly "true"/"false", or a throwing storage implementation.
 * A corrupted value is never interpreted — it is ignored.
 */
export function readAiAssistantPreference(
  storage: PreferenceStorage | null | undefined,
  key: string = AI_ASSISTANT_PREFERENCE_KEY
): boolean {
  if (!storage) {
    return AI_ASSISTANT_DEFAULT_ENABLED;
  }
  try {
    const raw = storage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return AI_ASSISTANT_DEFAULT_ENABLED;
  } catch {
    // Storage can throw (Safari private mode, quota, blocked cookies).
    return AI_ASSISTANT_DEFAULT_ENABLED;
  }
}

/**
 * Saves the preference. Writes only "true" or "false" — there is no code path
 * that can put anything else, or anything Issue-related, under this key.
 *
 * Never throws: a browser that refuses to store simply keeps the in-memory
 * state for the session, which is a better outcome than a crashed panel.
 */
export function writeAiAssistantPreference(
  storage: PreferenceStorage | null | undefined,
  enabled: boolean,
  key: string = AI_ASSISTANT_PREFERENCE_KEY
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, enabled ? "true" : "false");
  } catch {
    // Deliberately ignored — see above.
  }
}

/** The browser's localStorage when it exists, otherwise null. The one place
 *  that touches a global, kept tiny and guarded so the rest of the module
 *  stays pure and testable. */
export function browserPreferenceStorage(): PreferenceStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}
