import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE FRONT DOOR — a regression pin on the deployment's single entry point and
// on the one failure mode that was closing it.
//
// Two separate things are covered here because they are two halves of the same
// promise: that https://warehouse-mobile-lite.vercel.app/ always lands a person
// on a working sign-in page.
//
//   1. ROUTING  — the bare origin forwards to /login, and the installed mobile
//                 app starts at /login?next=%2Fmobile. One door, two entrances.
//   2. SURVIVAL — /login is database-backed (it re-reads the role rather than
//                 trusting the cookie), so it has to keep working when the
//                 database blinks. Two defects made it not:
//                   a. the `pg` Pool had no 'error' listener, so an idle client
//                      losing its socket — routine when a serverless instance is
//                      frozen between requests — became an uncaught exception
//                      that killed the whole function instance;
//                   b. the page did not contain the failure, so any throw from
//                      getCurrentUser() replaced the form with Next.js's
//                      "This page couldn't load. A server error occurred."
//
// ── WHY THE FILES ARE READ AS TEXT ──────────────────────────────────────────
// Same reason as tests/routeProtection.test.ts: app/page.tsx and
// app/login/page.tsx are React Server Components and lib/db.ts imports
// `server-only`, none of which `tsx --test` can load outside the Next.js
// runtime. Behavioural verification (a real cold start, a real dropped socket)
// is a UAT item; what is pinned here is that the code that prevents it is
// present and cannot be quietly removed.

const homeSource = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
const loginPageSource = readFileSync(join(process.cwd(), "app/login/page.tsx"), "utf8");
const dbSource = readFileSync(join(process.cwd(), "lib/db.ts"), "utf8");
const manifestSource = readFileSync(join(process.cwd(), "app/manifest.ts"), "utf8");

/** Source with comment lines removed — same helper, and same reason, as
 *  tests/routeProtection.test.ts: superseded designs are documented in prose on
 *  purpose, so a "must not appear" assertion has to read CODE, not commentary. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const homeCode = codeOnly(homeSource);
const loginPageCode = codeOnly(loginPageSource);
const dbCode = codeOnly(dbSource);

describe("app/page.tsx — the bare origin is the sign-in page", () => {
  it("redirects / to /login", () => {
    assert.ok(homeCode.includes('from "next/navigation"'));
    assert.ok(homeCode.includes('redirect("/login")'));
  });

  // A 308 is cached by browsers and intermediaries indefinitely. Using one here
  // would make the redirect effectively irreversible for everyone who has
  // already visited, so a future landing page could never be introduced.
  it("uses a temporary redirect, never permanentRedirect", () => {
    assert.equal(
      homeCode.includes("permanentRedirect"),
      false,
      "a 308 from the origin cannot be taken back"
    );
  });

  // SUPERSEDED: this route used to render a static "Foundation Setup Complete"
  // status card. It is gone, not hidden behind a flag.
  it("no longer renders a standing placeholder page", () => {
    for (const forbidden of ["Foundation Setup", "Project Status", "<footer", "<header"]) {
      assert.equal(
        homeCode.includes(forbidden),
        false,
        `the origin must forward, not render ${forbidden}`
      );
    }
  });
});

describe("app/manifest.ts — the mobile entrance is the same door", () => {
  it("starts the installed app at the login, carrying /mobile as the target", () => {
    assert.ok(manifestSource.includes('start_url: "/login?next=%2Fmobile"'));
  });

  // The return target is attacker-supplied the moment it is in a URL, so the
  // manifest gets no say in where a login actually lands — safeReturnTarget()
  // re-validates it against an allow-list on both the render and the submit.
  it("does not bypass the server-side allow-list on the return target", () => {
    assert.ok(loginPageCode.includes("safeReturnTarget(next)"));
    assert.ok(loginPageCode.includes("loginDestination(next)"));
  });
});

describe("app/login/page.tsx — a database fault degrades, never blanks", () => {
  it("contains a failure from getCurrentUser instead of propagating it", () => {
    assert.ok(loginPageCode.includes("try {"));
    assert.ok(loginPageCode.includes("await getCurrentUser()"));
    assert.ok(loginPageCode.includes("catch"));
  });

  // redirect() signals by throwing. Catching it would swallow the forward and
  // strand an already-signed-in visitor on the form — hence the ordering pin.
  it("calls redirect() outside the try block", () => {
    const tryStart = loginPageCode.indexOf("try {");
    const catchEnd = loginPageCode.indexOf("}", loginPageCode.indexOf("catch"));
    const redirectAt = loginPageCode.indexOf("redirect(destination)");
    assert.ok(tryStart >= 0 && catchEnd >= 0 && redirectAt >= 0);
    assert.ok(
      redirectAt > catchEnd,
      "redirect() must not sit inside the try/catch that guards getCurrentUser()"
    );
  });

  // Falling back to "signed out" lets nobody in: no session is minted on this
  // path, and the Server Action re-verifies the password independently.
  it("falls back to the signed-out state, never to an assumed user", () => {
    assert.ok(loginPageCode.includes("let user: CurrentUser | null = null"));
  });

  // A `pg` error object carries the connection string. Only the message is logged.
  it("logs the message, never the error object", () => {
    assert.ok(loginPageCode.includes("error instanceof Error ? error.message"));
    assert.equal(
      /console\.error\([^)]*\berror\s*\)/.test(loginPageCode),
      false,
      "logging the raw error would print the connection string"
    );
  });
});

describe("lib/db.ts — an idle client dropping must not kill the process", () => {
  // THE DEFECT THIS PINS: Node turns an 'error' event with no listener into an
  // uncaught exception. `pg` emits one on the Pool whenever an IDLE client loses
  // its connection, which is the normal outcome of a serverless instance being
  // frozen long enough for the server to hang up. Without this listener that
  // background socket drop tore down the function instance, and the next
  // visitor routed to it got a server-error screen on a page that was fine.
  it("attaches an error listener to the pool", () => {
    assert.ok(dbCode.includes('pool.on("error"'));
  });

  it("logs only the message, so the connection string cannot leak", () => {
    assert.ok(dbCode.includes("error.message"));
    assert.equal(
      /console\.error\([^)]*\berror\s*\)/.test(dbCode),
      false,
      "the pg error object carries the connection string"
    );
  });

  // Every function instance holds its own pool, so pg's default max of 10 lets
  // a handful of warm instances exhaust the server's connection slots — which
  // reaches the visitor as a failed page, not a slow one.
  it("sizes and bounds the pool for a serverless runtime", () => {
    for (const setting of [
      "max: 5",
      "idleTimeoutMillis",
      "connectionTimeoutMillis",
      "keepAlive: true",
    ]) {
      assert.ok(dbCode.includes(setting), `pool must set ${setting}`);
    }
  });

  // Unchanged guarantees from the original file — neither may be lost while
  // hardening it.
  it("keeps DATABASE_URL lazy and the identity assertion in place", () => {
    assert.ok(dbCode.includes("const DATABASE_URL = process.env.DATABASE_URL"));
    assert.ok(dbCode.includes("assertDatabaseIdentity"));
    assert.ok(dbCode.includes('"varmen_db"'));
    assert.equal(
      dbCode.includes("NEXT_PUBLIC_"),
      false,
      "the connection string must never come from a client-inlined variable"
    );
  });
});
