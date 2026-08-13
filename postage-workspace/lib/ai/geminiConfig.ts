import "server-only";

import {
  resolveGeminiSettings,
  type GeminiFeatureStatus,
} from "./geminiPolicy";

// Gemini Stage 1 — the server-only bridge between process.env and the pure
// policy in ./geminiPolicy.ts.
//
// `server-only` makes this module a build error if it is ever imported into a
// Client Component, directly or transitively — the same structural guarantee
// lib/db.ts relies on. The browser can never reach this file, and therefore
// can never reach the API key.
//
// ── ENVIRONMENT VARIABLES (names and defaults only — never values) ──────────
//
//   GEMINI_ENABLED=false
//       Master switch. ONLY the exact string "true" enables the feature.
//       Missing, empty, or any other value means DISABLED.
//
//   GEMINI_MODEL=gemini-3.6-flash
//       Optional. Falls back to GEMINI_DEFAULT_MODEL in ./geminiPolicy.ts.
//
//   GEMINI_API_KEY=
//       Server-side only. Set it in postage-workspace/.env.local (which is
//       gitignored) and, for a deployed environment, as a Sensitive Vercel
//       environment variable. It is never committed, never logged, never
//       stored in PostgreSQL, never returned to the browser, and never
//       included in an error message.
//
//   GEMINI_ALLOW_REAL_ISSUE_DATA=false
//       The free-tier safety gate. While false — the default — the only text
//       that may be transmitted is the frozen synthetic connectivity prompt.
//       No Issue title, description, root cause, resolution, SKU, staff or
//       member name, customer or supplier detail, historical Issue, image,
//       audio, attachment, internal link, extra_data value or any other
//       database value may be sent. Stage 1 implements no code path that
//       could send any of them.
//
// There is deliberately NO NEXT_PUBLIC_ variant of any of these. Next.js
// inlines NEXT_PUBLIC_* into client bundles, which would both leak the key and
// hand control of the switches to the browser.
//
// The repository has no .env.example mechanism (postage-workspace/.gitignore
// ignores `.env*`), so this header is the documentation of record.

/**
 * The safe, secret-free status of the feature. Contains a boolean saying
 * whether a key exists — never the key itself, and never anything derived
 * from it (no prefix, no length, no fingerprint).
 *
 * Safe to log, safe to return from a server action, safe to render.
 */
export function getGeminiFeatureStatus(): GeminiFeatureStatus {
  return resolveGeminiSettings(process.env);
}

/**
 * The API key, for the ONE module allowed to use it (./geminiClient.ts).
 *
 * INTERNAL. Do not import this anywhere else, do not return its value from a
 * Server Action, do not log it, do not put it in an error. Returns undefined
 * rather than throwing when unset, so a missing key is a reported status and
 * never a crash — `next build` must not depend on this variable existing, the
 * same lazy-read discipline lib/db.ts and lib/session.ts already follow.
 */
export function readGeminiApiKeyForClient(): string | undefined {
  const key = process.env.GEMINI_API_KEY;
  return typeof key === "string" && key.trim() !== "" ? key.trim() : undefined;
}
