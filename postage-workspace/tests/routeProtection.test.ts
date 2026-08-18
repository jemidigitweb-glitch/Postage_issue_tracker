import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Route protection — a REGRESSION PIN on postage-workspace/proxy.ts and the
// Mobile Lite entry point.
//
// ── WHY THE FILES ARE READ AS TEXT ──────────────────────────────────────────
// proxy.ts imports next/server and app/mobile/* are React Server Components,
// neither of which can be loaded by `tsx --test` outside the Next.js runtime.
// Reading the source and asserting on it is therefore the only way to cover
// these files at all — and it covers exactly what matters here: WHICH paths
// require a Tracker session, and whether the Mobile Lite shell writes anything.
//
// Behavioural verification (real redirects, real cookies) is a UAT item.

const proxySource = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
const pageSource = readFileSync(join(process.cwd(), "app/mobile/page.tsx"), "utf8");
const uploadActionSource = readFileSync(join(process.cwd(), "app/mobile/upload-actions.ts"), "utf8");
const captureSource = readFileSync(join(process.cwd(), "app/mobile/MobileCapture.tsx"), "utf8");

/**
 * Source with comment lines removed.
 *
 * The superseded login/allowlist design is DOCUMENTED in these files on
 * purpose — the audit requires it to be marked superseded rather than silently
 * deleted. A "this name must not appear" assertion therefore has to look at
 * CODE, not at prose, or it would forbid the very explanation the reviewer
 * asked for.
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

const pageCode = codeOnly(pageSource);
const uploadActionCode = codeOnly(uploadActionSource);

/** The four prefixes that require an Issue Tracker session. None may change,
 *  disappear, or lose its matcher entry. */
const PROTECTED_PREFIXES = [
  "/dashboard/issues",
  "/dashboard/discussions",
  "/dashboard/tracker",
  "/dashboard/account-settings",
];

describe("proxy.ts — existing dashboard protection is unchanged", () => {
  for (const prefix of PROTECTED_PREFIXES) {
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

  it("still redirects an unauthenticated dashboard request to /login", () => {
    assert.ok(proxySource.includes('new URL("/login", request.url)'));
    assert.ok(proxySource.includes("NextResponse.redirect"));
  });

  it("still verifies the Tracker session rather than trusting the request", () => {
    assert.ok(proxySource.includes("verifySession()"));
  });

  it("protects exactly the four dashboard prefixes and nothing else", () => {
    const prefixBlock = proxySource.slice(
      proxySource.indexOf("const PROTECTED_PATH_PREFIXES"),
      proxySource.indexOf("const MOBILE_PATH_PREFIX")
    );
    const listed = [...prefixBlock.matchAll(/"(\/[a-z/-]+)"/g)].map((match) => match[1]);
    assert.deepEqual(listed.sort(), [...PROTECTED_PREFIXES].sort());
  });
});

describe("proxy.ts — /mobile does NOT require an Issue Tracker login", () => {
  it("is not in the Tracker-protected prefix list", () => {
    const prefixBlock = proxySource.slice(
      proxySource.indexOf("const PROTECTED_PATH_PREFIXES"),
      proxySource.indexOf("const MOBILE_PATH_PREFIX")
    );
    assert.equal(
      prefixBlock.includes('"/mobile"'),
      false,
      "/mobile must NOT be protected by the Tracker session check"
    );
  });

  it("is handled before the protected-route check, so it can never redirect to /login", () => {
    const mobileBranch = proxySource.indexOf("path.startsWith(MOBILE_PATH_PREFIX)");
    const protectedCheck = proxySource.indexOf("const isProtectedRoute");
    assert.ok(mobileBranch > 0, "proxy must branch on the mobile prefix");
    assert.ok(
      mobileBranch < protectedCheck,
      "the /mobile branch must run BEFORE the Tracker-protection check"
    );
  });

  it("issues an anonymous Mobile Lite session instead of demanding a login", () => {
    assert.ok(proxySource.includes("verifyMobileSessionValue(existing)"));
    assert.ok(proxySource.includes("issueMobileSession()"));
    assert.ok(proxySource.includes("response.cookies.set(MOBILE_SESSION_COOKIE"));
  });

  it("still runs the proxy on /mobile so the cookie can be minted", () => {
    assert.ok(proxySource.includes('"/mobile/:path*"'));
  });
});

describe("app/mobile — the shell requires no account and creates nothing", () => {
  it("does not read a Tracker session or redirect to /login", () => {
    assert.equal(pageCode.includes("getCurrentUser"), false);
    assert.equal(pageCode.includes('redirect("/login")'), false);
    assert.equal(pageCode.includes("verifySession"), false);
  });

  it("does not require any permission or allowlist", () => {
    for (const forbidden of ["hasPermission", "issue:create_mobile", "canAccessMobileLite", "ALLOWED_USERNAMES"]) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not reference ${forbidden}`);
    }
  });

  it("never shows the superseded 'not available for this account' refusal", () => {
    assert.equal(pageCode.includes("not available for this account"), false);
  });

  it("renders the capture component, which carries the four approved controls", () => {
    assert.ok(pageSource.includes("<MobileCapture />"));
    for (const label of ["Record Voice", "Evidence Photo", "REGISTER"]) {
      assert.ok(captureSource.includes(label), `the capture UI must offer "${label}"`);
    }
  });

  it("offers no Issue field a worker could fill in", () => {
    for (const forbidden of ['name="title"', 'name="description"', 'name="category"', 'name="priority"', 'name="status"']) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not contain ${forbidden}`);
    }
  });

  it("performs NO issue or database creation in this stage", () => {
    for (const forbidden of ["createIssue", "next_issue_id", "issue_tracking", "lib/queries"]) {
      assert.equal(
        pageCode.includes(forbidden),
        false,
        `the Stage 3 shell must not reference ${forbidden}`
      );
    }
  });

  it("does not import any dashboard/portal component", () => {
    for (const forbidden of ["DashboardLayout", "AppSidebar", "IssueTable", "IssueDetail", "AssignmentPanel"]) {
      assert.equal(pageCode.includes(forbidden), false, `the shell must not import ${forbidden}`);
    }
  });
});

describe("app/mobile/upload-actions.ts — guarded by the anonymous session only", () => {
  it("requires a valid Mobile Lite session before anything else", () => {
    assert.ok(uploadActionSource.includes("readMobileSession()"));
    assert.ok(uploadActionSource.includes("if (!session)"));
  });

  it("does not require a Tracker login, a permission or an allowlist", () => {
    for (const forbidden of ["getCurrentUser", "hasPermission", "canAccessMobileLite", "issue:create_mobile"]) {
      assert.equal(
        uploadActionCode.includes(forbidden),
        false,
        `the upload action must not reference ${forbidden}`
      );
    }
  });

  it("still validates the submission id and the slot server-side", () => {
    assert.ok(uploadActionSource.includes("isValidSubmissionId(input.submissionId)"));
    assert.ok(uploadActionSource.includes("isMobileUploadSlot(input.slot)"));
  });

  it("still composes the public_id on the server", () => {
    assert.ok(
      uploadActionSource.includes("buildMobilePublicId(input.submissionId, input.slot, input.attemptId)")
    );
  });

  it("writes nothing to the database", () => {
    for (const forbidden of ["createIssue", "next_issue_id", "lib/queries", "lib/db"]) {
      assert.equal(
        uploadActionCode.includes(forbidden),
        false,
        `the upload action must not reference ${forbidden}`
      );
    }
  });
});
