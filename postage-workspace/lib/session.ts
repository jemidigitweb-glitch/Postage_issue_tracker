import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import type { SessionPayload } from "./auth";

// jose-based, HMAC-signed (HS256) httpOnly session cookie.
// Approved design: documentation/issue_tracker_auth_implementation_plan.md §1.
//
// This is signing, not encryption: the cookie is tamper-evident, not
// confidential (anyone holding it can base64-decode and read it). That is
// why SessionPayload (see lib/auth.ts) is deliberately limited to
// non-sensitive fields — userId and timestamps only. Never add a password,
// role, or any PII to this payload.
//
// Never stores passwords. Never stores database credentials. Never
// imported by a Client Component — `server-only` above makes that a build
// error, not just a lint warning.

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "session";
const SESSION_DURATION_SECONDS = process.env.SESSION_MAX_AGE_SECONDS
  ? Number(process.env.SESSION_MAX_AGE_SECONDS)
  : 60 * 60 * 24 * 7; // 7 days, matching the Next.js docs' own example default

// Deliberately NOT checked at module load time (unlike lib/db.ts's
// DATABASE_URL check). This module is imported by proxy.ts, which Next.js
// loads on every request path resolution regardless of whether a session
// function is actually called — a module-level throw here would be able to
// break routes that never touch authentication. The secret is validated
// lazily, only when a session function actually runs.
function getEncodedSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing AUTH_SECRET environment variable. Set it in .env.local (never commit it)."
    );
  }
  return new TextEncoder().encode(secret);
}

async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(payload.issuedAt)
    .setExpirationTime(payload.expiresAt)
    .sign(getEncodedSecret());
}

async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    // algorithms allow-list is required, not optional — prevents
    // algorithm-confusion attacks (a real, known JWT vulnerability class).
    const { payload } = await jwtVerify(token, getEncodedSecret(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.userId !== "number") {
      return null;
    }

    return {
      userId: payload.userId,
      issuedAt: payload.iat ?? 0,
      expiresAt: payload.exp ?? 0,
    };
  } catch {
    // Invalid signature, malformed token, or expired (jwtVerify checks exp
    // itself) — all treated identically as "no session." Never distinguish
    // the failure reason to the caller; that information isn't needed and
    // isn't safe to expose.
    return null;
  }
}

/**
 * Creates a new session for the given user and sets it as a signed,
 * httpOnly cookie. Takes only a userId — never a password, never any
 * sensitive field. Must be called from a Server Action or Route Handler
 * (cookie writes require a request context).
 */
export async function createSession(userId: number): Promise<void> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_DURATION_SECONDS;
  const token = await encrypt({ userId, issuedAt, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAt * 1000),
    path: "/",
  });
}

/**
 * Reads and verifies the session cookie's signature and expiry only — no
 * database call. This is the cheap "optimistic check" safe to use in
 * proxy.ts, which runs on every request including prefetches. Returns null
 * for any invalid, missing, tampered, or expired session — never throws
 * for those cases, since "no session" is an expected, ordinary outcome.
 */
export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return decrypt(token);
}

/**
 * Deletes the session cookie (logout).
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
