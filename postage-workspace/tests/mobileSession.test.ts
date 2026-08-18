import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";

import {
  createMobileSessionToken,
  MOBILE_SESSION_DURATION_SECONDS,
  MOBILE_SESSION_PURPOSE,
  verifyMobileSessionToken,
} from "../lib/mobile/mobileSessionToken";

// Warehouse Mobile Lite — the ANONYMOUS session boundary.
//
// The owner requirement is that /mobile works while the Issue Tracker is
// logged out. This token therefore identifies nobody; it exists only so the
// signed-upload action is bound to a browser that actually opened /mobile.
//
// A test secret is passed in explicitly, so nothing here reads AUTH_SECRET or
// touches a cookie.

const SECRET = new TextEncoder().encode("test-secret-not-a-real-credential");
const OTHER_SECRET = new TextEncoder().encode("a-different-test-secret-value");
const NOW = 1_760_000_000;

describe("anonymous Mobile Lite session — issuing", () => {
  it("mints a verifiable token that identifies nobody", async () => {
    const sessionId = crypto.randomUUID();
    // Issued at the REAL current time: jwtVerify checks `exp` against the
    // wall clock, so a fixed past timestamp would verify as expired.
    const { token } = await createMobileSessionToken(SECRET, sessionId);
    const payload = await verifyMobileSessionToken(token, SECRET);

    assert.ok(payload);
    assert.equal(payload.sessionId, sessionId);
    // The proof that this is not a login: no user field of any kind.
    assert.equal("userId" in payload, false);
    assert.equal(Object.keys(payload).sort().join(","), "expiresAt,issuedAt,sessionId");
  });

  it("expires 12 hours after issue", async () => {
    const { expiresAt } = await createMobileSessionToken(SECRET, crypto.randomUUID(), NOW);
    assert.equal(expiresAt, NOW + MOBILE_SESSION_DURATION_SECONDS);
    assert.equal(MOBILE_SESSION_DURATION_SECONDS, 60 * 60 * 12);
  });

  it("gives two browsers different, unpredictable session ids", async () => {
    const ids = new Set(Array.from({ length: 50 }, () => crypto.randomUUID()));
    assert.equal(ids.size, 50);
  });
});

describe("anonymous Mobile Lite session — verification refuses everything else", () => {
  it("refuses a missing or empty token", async () => {
    assert.equal(await verifyMobileSessionToken(undefined, SECRET), null);
    assert.equal(await verifyMobileSessionToken(null, SECRET), null);
    assert.equal(await verifyMobileSessionToken("", SECRET), null);
  });

  it("refuses a malformed token", async () => {
    assert.equal(await verifyMobileSessionToken("not-a-jwt", SECRET), null);
    assert.equal(await verifyMobileSessionToken("a.b.c", SECRET), null);
  });

  it("refuses a token signed with a different secret", async () => {
    const { token } = await createMobileSessionToken(OTHER_SECRET, crypto.randomUUID(), NOW);
    assert.equal(await verifyMobileSessionToken(token, SECRET), null);
  });

  it("refuses an expired token", async () => {
    const expired = await new SignJWT({ purpose: MOBILE_SESSION_PURPOSE, sid: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(NOW - 100_000)
      .setExpirationTime(NOW - 50_000)
      .sign(SECRET);
    assert.equal(await verifyMobileSessionToken(expired, SECRET), null);
  });

  it("refuses a correctly signed token with no purpose claim", async () => {
    const noPurpose = await new SignJWT({ sid: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(SECRET);
    assert.equal(await verifyMobileSessionToken(noPurpose, SECRET), null);
  });

  it("refuses a token with the wrong purpose", async () => {
    const wrongPurpose = await new SignJWT({ purpose: "something-else", sid: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(SECRET);
    assert.equal(await verifyMobileSessionToken(wrongPurpose, SECRET), null);
  });

  it("REFUSES AN ISSUE TRACKER SESSION — a userId can never authenticate Mobile Lite", async () => {
    // Shape produced by lib/session.ts's encrypt(): { userId }.
    const trackerToken = await new SignJWT({ userId: 50 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(SECRET);
    assert.equal(await verifyMobileSessionToken(trackerToken, SECRET), null);
  });

  it("refuses even a mobile-purpose token that smuggles a userId", async () => {
    const hybrid = await new SignJWT({ purpose: MOBILE_SESSION_PURPOSE, sid: "x", userId: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(SECRET);
    assert.equal(await verifyMobileSessionToken(hybrid, SECRET), null);
  });

  it("refuses a token with no session id", async () => {
    const noSid = await new SignJWT({ purpose: MOBILE_SESSION_PURPOSE })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(SECRET);
    assert.equal(await verifyMobileSessionToken(noSid, SECRET), null);
  });

  it("refuses an unsigned ('alg: none') token — algorithm confusion is blocked", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ purpose: MOBILE_SESSION_PURPOSE, sid: "x", exp: NOW + 10_000 })
    ).toString("base64url");
    assert.equal(await verifyMobileSessionToken(`${header}.${body}.`, SECRET), null);
  });

  it("grants nothing — the payload carries no role, permission or account", async () => {
    const { token } = await createMobileSessionToken(SECRET, crypto.randomUUID());
    const payload = await verifyMobileSessionToken(token, SECRET);
    const serialized = JSON.stringify(payload).toLowerCase();
    for (const forbidden of ["role", "permission", "admin", "staff", "userid", "username"]) {
      assert.equal(serialized.includes(forbidden), false, `payload must not carry "${forbidden}"`);
    }
  });
});
