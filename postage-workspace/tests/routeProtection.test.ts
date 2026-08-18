import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Route protection — a REGRESSION PIN on postage-workspace/proxy.ts and the
// Mobile Lite entry point.
//
// ── WHAT CHANGED, AND WHY THIS FILE WAS REWRITTEN ───────────────────────────
// This file previously asserted the OPPOSITE of what it asserts now: that
// /mobile must NOT require a login, and that the upload action must not
// reference getCurrentUser or hasPermission. That was a faithful pin on the
// anonymous `wh_mobile` design, which the owner has since replaced with the
// shared "Raised by Staff" Tracker account. Those assertions are not softened
// or commented out — they are inverted, because leaving a passing test that
// pins a superseded rule is worse than having no test at all.
//
// ── WHY THE FILES ARE READ AS TEXT ──────────────────────────────────────────
// proxy.ts imports next/server and app/mobile/* are React Server Components,
// neither of which can be loaded by `tsx --test` outside the Next.js runtime.
// Reading the source and asserting on it is therefore the only way to cover
// these files at all — and it covers exactly what matters here: WHICH paths
// require a Tracker session, and what the entry points check before acting.
//
// The pure rules those files delegate to ARE executed directly, in
// tests/raisedByAccess.test.ts. Behavioural verification (real redirects, real
// cookies, a real login) is a UAT item.

const proxySource = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
const pageSource = readFileSync(join(process.cwd(), "app/mobile/page.tsx"), "utf8");
const uploadActionSource = readFileSync(join(process.cwd(), "app/mobile/upload-actions.ts"), "utf8");
const registerActionSource = readFileSync(join(process.cwd(), "app/mobile/register-actions.ts"), "utf8");
const captureSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");

/**
 * Source with comment lines removed.
 *
 * Superseded designs are DOCUMENTED in these files on purpose — the audit
 * requires them to be marked superseded rather than silently deleted. A "this
 * name must not appear" assertion therefore has to look at CODE, not at prose,
 * or it would forbid the very explanation the reviewer asked for.
 */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const proxyCode = codeOnly(proxySource);
const pageCode = codeOnly(pageSource);
const uploadActionCode = codeOnly(uploadActionSource);
const registerActionCode = codeOnly(registerActionSource);

/** The four dashboard prefixes that already required an Issue Tracker session.
 *  None may change, disappear, or lose its matcher entry. */
const EXISTING_PROTECTED_PREFIXES = [
  "/dashboard/issues",
  "/dashboard/discussions",
  "/dashboard/tracker",
  "/dashboard/account-settings",
];

/** Everything protected today — the four above, plus /mobile. */
const ALL_PROTECTED_PREFIXES = [...EXISTING_PROTECTED_PREFIXES, "/mobile"];

describe("proxy.ts — existing dashboard protection is unchanged", () => {
  for (const prefix of EXISTING_PROTECTED_PREFIXES) {
    it(`still lists ${prefix} as a protected prefix`, () => {
      assert.ok(
        proxySource.includes(`"${prefix}"`),
        `${prefix} must remain in PROTECTED_PATH_PREFIXES`
      );
    });

    it(`still matches ${prefix}/:path*`, () => {
      assert.ok(
        proxySource.includes(`"${prefix}/:path*"`),
        `${prefix}/:path* must remain in config.matcher`
      );
    });
  }

  it("still redirects an unauthenticated request to /login", () => {
    assert.ok(proxySource.includes('new URL("/login", request.url)'));
    assert.ok(proxySource.includes("NextResponse.redirect"));
  });

  it("still verifies the Tracker session rather than trusting the request", () => {
    assert.ok(proxySource.includes("verifySession()"));
  });

  it("still performs no database lookup — the proxy cannot know a role", () => {
    for (const forbidden of ["getCurrentUser", "hasPermission", "lib/db", "lib/queries"]) {
      assert.equal(
        proxyCode.includes(forbidden),
        false,
        `the proxy must not reference ${forbidden}`
      );
    }
  });

  it("leaves booking, couriers and reports outside proxy protection", () => {
    // Those pages guard themselves (redirectRaisedByToIssues). Widening the
    // proxy to all of /dashboard remains a separate, unmade decision.
    for (const untouched of ["/dashboard/booking", "/dashboard/couriers", "/dashboard/reports"]) {
      assert.equal(
        proxyCode.includes(`"${untouched}"`),
        false,
        `${untouched} must stay outside PROTECTED_PATH_PREFIXES`
      );
    }
  });
});

describe("proxy.ts — /mobile now REQUIRES an Issue Tracker login", () => {
  it("is listed as a protected prefix", () => {
    assert.ok(
      proxyCode.includes('"/mobile"'),
      "/mobile must be protected by the Tracker session check"
    );
  });

  it("still runs the proxy on /mobile", () => {
    assert.ok(proxySource.includes('"/mobile/:path*"'));
  });

  it("protects exactly the five prefixes and nothing else", () => {
    const prefixBlock = proxySource.slice(
      proxySource.indexOf("const PROTECTED_PATH_PREFIXES"),
      proxySource.indexOf("const MOBILE_PATH_PREFIX")
    );
    const listed = [...prefixBlock.matchAll(/"(\/[a-z/-]+)"/g)].map((match) => match[1]);
    assert.deepEqual(listed.sort(), [...ALL_PROTECTED_PREFIXES].sort());
  });

  it("has no early branch that lets /mobile bypass the session check", () => {
    const protectedCheck = proxySource.indexOf("const isProtectedRoute");
    const sessionCheck = proxySource.indexOf("await verifySession()");
    assert.ok(protectedCheck > 0 && sessionCheck > protectedCheck);
    // The ONLY use of the mobile prefix in code is choosing the return target,
    // and it sits AFTER the session has already been found missing.
    const returnTarget = proxyCode.indexOf("path.startsWith(MOBILE_PATH_PREFIX)");
    assert.ok(returnTarget > 0, "the proxy must set a return target for /mobile");
    assert.ok(
      returnTarget > proxyCode.indexOf("if (!session)"),
      "the /mobile branch must run only after the session check has failed"
    );
  });

  it("sends /mobile as the ?next= return target", () => {
    assert.ok(proxySource.includes('loginUrl.searchParams.set("next", MOBILE_PATH_PREFIX)'));
    assert.ok(proxySource.includes('const MOBILE_PATH_PREFIX = "/mobile"'));
  });

  it("no longer mints the anonymous Mobile Lite cookie", () => {
    for (const forbidden of [
      "issueMobileSession",
      "verifyMobileSessionValue",
      "MOBILE_SESSION_COOKIE",
      "mobileSession",
      "wh_mobile",
    ]) {
      assert.equal(
        proxyCode.includes(forbidden),
        false,
        `the proxy must not reference ${forbidden} — the anonymous session is deleted`
      );
    }
  });
});

describe("app/mobile — the shell requires a signed-in submitter", () => {
  it("resolves the real user and requires mobile:submit", () => {
    assert.ok(pageCode.includes("await getCurrentUser()"));
    assert.ok(pageCode.includes('hasPermission(user, "mobile:submit")'));
  });

  it("sends an unauthenticated visitor to /login with a return target", () => {
    assert.ok(pageCode.includes("/login?next="));
    assert.ok(pageCode.includes("encodeURIComponent(MOBILE_HOME)"));
  });

  it("sends a signed-in user without the permission to the Issue list", () => {
    // Not an error page: an Assignee who signs in lands somewhere useful, and
    // is told nothing about what they were refused.
    assert.ok(pageCode.includes("redirect(RAISED_BY_HOME)"));
  });

  it("does not reintroduce a username allowlist", () => {
    for (const forbidden of ["canAccessMobileLite", "ALLOWED_USERNAMES", "issue:create_mobile"]) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not reference ${forbidden}`);
    }
  });

  it("renders the Stage 2 composer, which carries the approved controls", () => {
    assert.ok(pageSource.includes("<MobileComposer />"));
    for (const label of [
      "Write issue details...",
      "Send Issue",
      "Yes, Send Issue",
      "Ready to send?",
      "Add a caption...",
    ]) {
      assert.ok(captureSource.includes(label), `the composer must offer "${label}"`);
    }
    // This version stages media immediately: there is no separate add step and
    // no per-item action. Checked against the code, not the prose that explains
    // why those controls were removed.
    const composerCode = codeOnly(captureSource);
    for (const removed of ["Add Photo", "Record Again", "Retake", "Reselect", "Register Issue"]) {
      assert.equal(composerCode.includes(removed), false, `"${removed}" must not be a control`);
    }
  });

  it("offers no Issue field a worker could fill in", () => {
    for (const forbidden of ['name="title"', 'name="description"', 'name="category"', 'name="priority"', 'name="status"']) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not contain ${forbidden}`);
    }
  });

  it("performs NO database work in the shell itself", () => {
    for (const forbidden of ["createIssue", "next_issue_id", "issue_tracking", "lib/queries"]) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not reference ${forbidden}`);
    }
  });

  it("does not import any dashboard/portal component", () => {
    for (const forbidden of ["DashboardLayout", "AppSidebar", "IssueTable", "IssueDetail", "AssignmentPanel"]) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not import ${forbidden}`);
    }
  });
});

describe("app/mobile Server Actions — each re-checks the permission itself", () => {
  const actions: Array<[string, string]> = [
    ["upload-actions.ts", uploadActionCode],
    ["register-actions.ts", registerActionCode],
  ];

  for (const [name, code] of actions) {
    it(`${name} requires a signed-in user holding mobile:submit`, () => {
      assert.ok(code.includes("await getCurrentUser()"), `${name} must resolve the user`);
      assert.ok(
        code.includes('hasPermission(user, "mobile:submit")'),
        `${name} must check mobile:submit`
      );
      assert.ok(code.includes("if (!user ||"), `${name} must refuse when there is no user`);
    });

    it(`${name} no longer accepts the deleted anonymous session`, () => {
      for (const forbidden of ["readMobileSession", "mobileSession", "wh_mobile"]) {
        assert.equal(code.includes(forbidden), false, `${name} must not reference ${forbidden}`);
      }
    });

    it(`${name} checks authorization before doing any work`, () => {
      const gate = code.indexOf("await getCurrentUser()");
      const firstUse = code.indexOf("input.submissionId");
      assert.ok(gate > 0 && firstUse > gate, `${name} must gate before it reads the input`);
    });
  }

  it("upload-actions still validates the submission id and slot server-side", () => {
    assert.ok(uploadActionSource.includes("isValidSubmissionId(input.submissionId)"));
    assert.ok(uploadActionSource.includes("isMobileUploadSlot(input.slot)"));
  });

  it("upload-actions still composes the storage path on the server", () => {
    assert.ok(
      uploadActionSource.includes("buildMobilePublicId(input.submissionId, input.slot, input.attemptId)")
    );
  });

  it("upload-actions writes nothing to the database", () => {
    for (const forbidden of ["createIssue", "next_issue_id", "lib/queries", "lib/db"]) {
      assert.equal(
        uploadActionCode.includes(forbidden),
        false,
        `the upload action must not reference ${forbidden}`
      );
    }
  });
});
