import { SignJWT, jwtVerify } from "jose";

// Warehouse Mobile Lite — the ANONYMOUS session token.
//
// DELIBERATELY has no `server-only`, no `next/*` and no cookie import: the
// secret and the request context are supplied by the caller, so every rule
// here is directly unit-testable (tests/mobileSession.test.ts) without a
// request, a browser, or an environment variable. The wiring — reading
// AUTH_SECRET and touching cookies — lives in ./mobileSession.ts, which is
// `server-only`.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
// The owner requirement is that a warehouse worker can open /mobile WITHOUT an
// Issue Tracker login. This token therefore identifies NOBODY. It carries no
// user id, no username, no role and no permission. It exists only to bind a
// sequence of Mobile Lite requests to one browser that actually visited
// /mobile, so the signed-upload action is not an open endpoint.
//
// ── WHY IT CANNOT BE CONFUSED WITH A TRACKER SESSION ────────────────────────
// Three independent separations, any one of which is sufficient:
//   1. a different cookie name (see ./mobileSession.ts), so the two are never
//      read from the same place;
//   2. a mandatory `purpose` claim that the Tracker's own decrypt() does not
//      set and would not produce;
//   3. verification here REJECTS any token carrying a `userId`, so a stolen or
//      replayed Tracker cookie can never authenticate a Mobile Lite request —
//      and this token, lacking `userId`, is rejected by the Tracker's own
//      decrypt() for the same reason, in the other direction.
//
// It grants nothing. No dashboard route, no Server Action other than the
// Mobile Lite ones, and no database access consults it.

/** The only accepted value of the `purpose` claim. A token without exactly
 *  this value is not a Mobile Lite session, whatever else it contains. */
export const MOBILE_SESSION_PURPOSE = "warehouse-mobile-lite";

/** How long an anonymous Mobile Lite session lasts. Long enough for a shift's
 *  worth of reports, far shorter than the Tracker's 7-day session — it is a
 *  request-binding token, not a login. */
export const MOBILE_SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hours

export interface MobileSessionPayload {
  /** Opaque, cryptographically random per-browser id. Not a user, not stored
   *  anywhere, and never used for authorization — it exists so two browsers
   *  are distinguishable in a log line if that is ever needed. */
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Mints a signed anonymous Mobile Lite token.
 *
 * `sessionId` must be supplied by the caller (crypto.randomUUID() in practice)
 * so this function stays deterministic and testable. `now` is injectable for
 * the same reason.
 */
export async function createMobileSessionToken(
  secret: Uint8Array,
  sessionId: string,
  now: number = Math.floor(Date.now() / 1000)
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + MOBILE_SESSION_DURATION_SECONDS;
  const token = await new SignJWT({ purpose: MOBILE_SESSION_PURPOSE, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(secret);
  return { token, expiresAt };
}

/**
 * Verifies a Mobile Lite token: signature, expiry, purpose, and the absence of
 * any user identity.
 *
 * Returns null for anything invalid — a bad signature, an expired token, a
 * Tracker session cookie, a token with no purpose claim, or one that carries a
 * userId. "No mobile session" is an ordinary outcome, never an exception, and
 * the reason is deliberately not reported.
 */
export async function verifyMobileSessionToken(
  token: string | undefined | null,
  secret: Uint8Array
): Promise<MobileSessionPayload | null> {
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  try {
    // The algorithms allow-list is required, not optional — it prevents
    // algorithm-confusion attacks, exactly as lib/session.ts documents.
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

    if (payload.purpose !== MOBILE_SESSION_PURPOSE) {
      return null;
    }
    // A Tracker session must never authenticate a Mobile Lite request, even if
    // it were somehow presented under this cookie name.
    if ("userId" in payload) {
      return null;
    }
    if (typeof payload.sid !== "string" || payload.sid.length === 0) {
      return null;
    }

    return {
      sessionId: payload.sid,
      issuedAt: payload.iat ?? 0,
      expiresAt: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}
