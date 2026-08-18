import "server-only";

import { cookies } from "next/headers";

import {
  createMobileSessionToken,
  verifyMobileSessionToken,
  type MobileSessionPayload,
} from "./mobileSessionToken";

// Warehouse Mobile Lite — the server-only wiring for the anonymous session:
// the secret, the cookie name, and the cookie options.
//
// `server-only` makes this a build error if it is ever imported into a Client
// Component — the same structural guarantee lib/session.ts relies on.
//
// ── SEPARATE FROM THE TRACKER SESSION, BY NAME AND BY CLAIM ─────────────────
// A DIFFERENT cookie name from lib/session.ts's, so the two are never read
// from the same place, and a `purpose` claim that only this module's tokens
// carry (see ./mobileSessionToken.ts). Nothing here can create, read, extend
// or delete a Tracker session, and this cookie grants no dashboard access:
// proxy.ts protects /dashboard/** on the Tracker cookie alone and never
// consults this one.
//
// ── NO DATABASE, NO ACCOUNT ────────────────────────────────────────────────
// Nothing is written anywhere. There is no row, no user, no schema change and
// no migration — the token is self-contained and verified by signature.

/** Deliberately not the Tracker's "session". Overridable for the same reason
 *  lib/session.ts allows it, but never shared with it. */
export const MOBILE_SESSION_COOKIE = process.env.MOBILE_SESSION_COOKIE_NAME || "wh_mobile";

/** Lazily read, never at module load — proxy.ts imports this module on every
 *  matched request, and a module-level throw could break routes that never
 *  touch a Mobile Lite session. Same discipline as lib/session.ts. */
export function getMobileSessionSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing AUTH_SECRET environment variable. Set it in .env.local (never commit it)."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Cookie attributes for the anonymous session.
 *
 * httpOnly  — script on the page can never read it.
 * secure    — HTTPS only in production (a phone on the warehouse network is
 *             exactly the case this protects).
 * sameSite  — "lax": the cookie is not sent on cross-site POSTs, so another
 *             origin cannot drive the Mobile Lite actions with it.
 * path      — "/mobile": the browser does not even send it to /dashboard.
 *
 * Deliberately NOT prefixed NEXT_PUBLIC_ and never returned to client code.
 */
export function mobileSessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: new Date(expiresAt * 1000),
    path: "/mobile",
  };
}

/** Mints a fresh anonymous session value. The caller sets the cookie, because
 *  only a middleware/Server Action/Route Handler context may write one. */
export async function issueMobileSession(): Promise<{
  token: string;
  expiresAt: number;
  sessionId: string;
}> {
  const sessionId = crypto.randomUUID();
  const { token, expiresAt } = await createMobileSessionToken(
    getMobileSessionSecret(),
    sessionId
  );
  return { token, expiresAt, sessionId };
}

/** Verifies a raw cookie value. Used by proxy.ts, which has the request in
 *  hand rather than the cookies() store. */
export async function verifyMobileSessionValue(
  value: string | undefined
): Promise<MobileSessionPayload | null> {
  return verifyMobileSessionToken(value, getMobileSessionSecret());
}

/**
 * THE gate for every Mobile Lite Server Action: reads the cookie and verifies
 * it. Returns null when absent, tampered, expired, or when a Tracker cookie is
 * presented instead.
 *
 * It authenticates a BROWSER, not a person, and confers no permission of any
 * kind — see ./mobileSessionToken.ts.
 */
export async function readMobileSession(): Promise<MobileSessionPayload | null> {
  const cookieStore = await cookies();
  return verifyMobileSessionValue(cookieStore.get(MOBILE_SESSION_COOKIE)?.value);
}
