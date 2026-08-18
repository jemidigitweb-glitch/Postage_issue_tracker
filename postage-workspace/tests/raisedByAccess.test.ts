import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  permissionsForRole,
  roleHasPermission,
  resolveIssueAccessScope,
  effectiveAssigneeFilter,
  type Permission,
  type Role,
} from "../lib/access/permissions";
import {
  MOBILE_HOME,
  RAISED_BY_ALLOWED_PREFIXES,
  RAISED_BY_HOME,
  isDashboardPathAllowedForRaisedBy,
  isDashboardPathAllowedForRole,
  isIssuesOnlyRole,
  loginDestination,
  safeReturnTarget,
} from "../lib/access/raisedByAccess";

// RAISED BY STAFF — the shared, read-only warehouse login.
//
// The rules are pure functions, so this file EXECUTES them rather than reading
// their source. Only the wiring section at the bottom reads source, and only
// for files that cannot be imported outside the Next.js runtime (Server
// Components, "use server" actions, next/navigation).
//
// What the role is, in one sentence: it may read every Issue, raise Issues AS
// ITSELF, and submit from /mobile. Everything else — every other mutation,
// every administrative screen, every other dashboard page — is refused, and
// most of those refusals are made by guards that already existed, without a
// single new check written for them. That is the property most of this file is
// protecting.
//
// `issue:create` is narrower than the key name suggests: the raiser recorded on
// the Issue is server-derived from the account's linked issue_staff row, so
// "create" cannot be used to file an Issue in someone else's name. That rule is
// covered in tests/raisedByWebCreate.test.ts.

const ROLE: Role = "raised_by";

/** Every permission the role is allowed to hold. Exactly three. */
const GRANTED: Permission[] = ["issue:view_all", "issue:create", "mobile:submit"];

/** Every permission it must NOT hold. Any new key added to the matrix without
 *  a deliberate decision will fail the "exactly three" test above this list. */
const REFUSED: Permission[] = [
  "issue:view_own_assigned",
  "issue:comment",
  "issue:change_status_own_assigned",
  "issue:change_status_any",
  "issue:analyse_own_assigned",
  "issue:analyse_any",
  "issue:assign",
  "issue:delete",
  "issue:approve_reopen",
  "user:manage",
  "tracker:view",
  "discussion:view",
  "discussion:create",
  "discussion:edit",
  "discussion:comment",
  "discussion:change_status",
  "discussion:manage_points",
  "discussion:link_issue",
  "discussion:reopen",
  "discussion:delete",
];

describe("raised_by — the permission set", () => {
  it("is recognized as a role and holds exactly three permissions", () => {
    assert.deepEqual([...permissionsForRole(ROLE)].sort(), [...GRANTED].sort());
  });

  for (const permission of GRANTED) {
    it(`holds ${permission}`, () => {
      assert.equal(roleHasPermission(ROLE, permission), true);
    });
  }

  for (const permission of REFUSED) {
    it(`does NOT hold ${permission}`, () => {
      assert.equal(roleHasPermission(ROLE, permission), false);
    });
  }

  it("inherits nothing — it is not a weaker admin and not a stronger staff", () => {
    // DECISION-001: no hierarchy. Every role's set is an explicit literal, so
    // holding issue:view_all (which admin also holds) must confer nothing else
    // admin holds, and holding a mobile key must confer nothing staff holds.
    const admin = permissionsForRole("admin");
    const staff = permissionsForRole("staff");
    const mine = permissionsForRole(ROLE);

    for (const permission of admin) {
      if (GRANTED.includes(permission)) continue;
      assert.equal(mine.has(permission), false, `must not inherit ${permission} from admin`);
    }
    for (const permission of staff) {
      assert.equal(mine.has(permission), false, `must not inherit ${permission} from staff`);
    }
  });

  it("holds no mutation beyond creating its own Issue", () => {
    const otherWriteKeys = [...permissionsForRole("admin")].filter(
      (permission) => !GRANTED.includes(permission)
    );
    assert.ok(otherWriteKeys.length > 0, "the admin set must still contain privileged keys");
    for (const permission of otherWriteKeys) {
      assert.equal(roleHasPermission(ROLE, permission), false);
    }
  });
});

describe("raised_by — Issue visibility", () => {
  it("sees ALL Issues, not a filtered subset", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: ROLE, assigneeId: null }), { kind: "all" });
  });

  it("is unaffected by an assignee link, because it never has one", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: ROLE, assigneeId: 7 }), { kind: "all" });
  });

  it("may still use the assignee filter on the list, like any all-scope role", () => {
    const scope = resolveIssueAccessScope({ role: ROLE, assigneeId: null });
    assert.equal(effectiveAssigneeFilter(scope, 3), 3);
  });
});

describe("other roles are UNCHANGED by the new role", () => {
  it("Super Admin keeps full access", () => {
    for (const permission of ["issue:view_all", "issue:create", "issue:delete", "user:manage", "tracker:view"] as Permission[]) {
      assert.equal(roleHasPermission("admin", permission), true);
    }
    assert.deepEqual(resolveIssueAccessScope({ role: "admin", assigneeId: null }), { kind: "all" });
  });

  it("Assignee keeps exactly its three scoped permissions and its scoping", () => {
    assert.deepEqual([...permissionsForRole("staff")].sort(), [
      "issue:analyse_own_assigned",
      "issue:change_status_own_assigned",
      "issue:view_own_assigned",
    ]);
    assert.deepEqual(resolveIssueAccessScope({ role: "staff", assigneeId: 4 }), {
      kind: "assignee",
      assigneeId: 4,
    });
    // Fail-closed with no link, exactly as before.
    assert.deepEqual(resolveIssueAccessScope({ role: "staff", assigneeId: null }), { kind: "none" });
  });

  it("the Assignee does NOT gain mobile access", () => {
    assert.equal(roleHasPermission("staff", "mobile:submit"), false);
  });

  it("an unauthenticated request still holds nothing and sees nothing", () => {
    assert.equal(roleHasPermission(null, "issue:view_all"), false);
    assert.equal(roleHasPermission(null, "mobile:submit"), false);
    assert.deepEqual(resolveIssueAccessScope({ role: null, assigneeId: 1 }), { kind: "none" });
  });
});

describe("raised_by — which web routes it may open", () => {
  it("is the only Issues-only role", () => {
    assert.equal(isIssuesOnlyRole(ROLE), true);
    for (const other of [null, "admin", "staff", "management"] as Array<Role | null>) {
      assert.equal(isIssuesOnlyRole(other), false);
    }
  });

  it("allows the Issue list and Issue detail pages", () => {
    for (const path of [
      "/dashboard/issues",
      "/dashboard/issues/WH-001",
      "/dashboard/issues/PO-014",
      "/dashboard/issues?status=RED",
      "/dashboard/issues/WH-001#comments",
    ]) {
      assert.equal(isDashboardPathAllowedForRaisedBy(path), true, `${path} must be allowed`);
    }
  });

  it("refuses every other dashboard page", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/booking",
      "/dashboard/couriers",
      "/dashboard/reports",
      "/dashboard/discussions",
      "/dashboard/tracker",
      "/dashboard/account-settings",
    ]) {
      assert.equal(isDashboardPathAllowedForRaisedBy(path), false, `${path} must be refused`);
    }
  });

  it("matches on a path boundary, so a lookalike route is not reachable", () => {
    for (const path of [
      "/dashboard/issues-secret",
      "/dashboard/issuesadmin",
      "/dashboard/issues-export/all",
    ]) {
      assert.equal(isDashboardPathAllowedForRaisedBy(path), false, `${path} must be refused`);
    }
  });

  it("refuses anything that is not a rooted path", () => {
    for (const value of ["", "dashboard/issues", "https://example.com/dashboard/issues", " /dashboard/issues"]) {
      assert.equal(isDashboardPathAllowedForRaisedBy(value), false, `${value} must be refused`);
    }
  });

  it("leaves every other role's routing exactly as it was", () => {
    for (const role of ["admin", "staff", "management", null] as Array<Role | null>) {
      for (const path of ["/dashboard", "/dashboard/booking", "/dashboard/tracker", "/dashboard/issues"]) {
        assert.equal(
          isDashboardPathAllowedForRole(role, path),
          true,
          `${String(role)} must keep access to ${path} (its own page guard decides)`
        );
      }
    }
  });

  it("restricts raised_by through the same shared entry point", () => {
    assert.equal(isDashboardPathAllowedForRole(ROLE, "/dashboard/issues/WH-001"), true);
    assert.equal(isDashboardPathAllowedForRole(ROLE, "/dashboard/booking"), false);
  });

  it("names /dashboard/issues as the only allowed prefix", () => {
    assert.deepEqual([...RAISED_BY_ALLOWED_PREFIXES], ["/dashboard/issues"]);
    assert.equal(RAISED_BY_HOME, "/dashboard/issues");
    assert.equal(MOBILE_HOME, "/mobile");
  });
});

describe("login return target — an allow-list, not a pattern", () => {
  it("accepts the two approved internal destinations", () => {
    assert.equal(safeReturnTarget("/mobile"), "/mobile");
    assert.equal(safeReturnTarget("/dashboard/issues"), "/dashboard/issues");
    assert.equal(safeReturnTarget("/dashboard/issues/WH-001"), "/dashboard/issues/WH-001");
    assert.equal(safeReturnTarget("/mobile?draft=1"), "/mobile?draft=1");
  });

  it("rejects an absolute URL", () => {
    for (const value of [
      "https://evil.example/steal",
      "http://evil.example",
      "HTTPS://EVIL.EXAMPLE",
      "javascript:alert(1)",
      "data:text/html,<script>",
    ]) {
      assert.equal(safeReturnTarget(value), null, `${value} must be rejected`);
    }
  });

  it("rejects a protocol-relative target in every spelling", () => {
    for (const value of ["//evil.example", "//evil.example/mobile", "/\\evil.example", "/\\/evil.example"]) {
      assert.equal(safeReturnTarget(value), null, `${value} must be rejected`);
    }
  });

  it("rejects credentials, backslashes and control characters", () => {
    for (const value of [
      "/mobile@evil.example",
      "/mobile\\..\\dashboard",
      "/mobile\n/dashboard",
      "/mobile\r\nSet-Cookie: x=1",
      "/mobile ",
    ]) {
      assert.equal(safeReturnTarget(value), null, `${JSON.stringify(value)} must be rejected`);
    }
  });

  it("rejects an internal path that is simply not on the list", () => {
    for (const value of ["/dashboard", "/dashboard/tracker", "/login", "/dashboard/issues-secret", "/mobilex"]) {
      assert.equal(safeReturnTarget(value), null, `${value} must be rejected`);
    }
  });

  it("rejects anything that is not a string, and anything absurdly long", () => {
    for (const value of [null, undefined, 42, {}, [], `/mobile?x=${"a".repeat(600)}`]) {
      assert.equal(safeReturnTarget(value), null);
    }
  });

  it("falls back to the Issue list rather than to the untrusted value", () => {
    assert.equal(loginDestination("https://evil.example"), RAISED_BY_HOME);
    assert.equal(loginDestination(undefined), RAISED_BY_HOME);
    assert.equal(loginDestination(""), RAISED_BY_HOME);
    assert.equal(loginDestination("/mobile"), "/mobile");
  });
});

// ---------------------------------------------------------------------------
// Wiring — source evidence for files that cannot be imported under `tsx --test`
// ---------------------------------------------------------------------------

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("wiring — the unguarded dashboard pages now call the guard", () => {
  const pages: Array<[string, string]> = [
    ["app/dashboard/page.tsx", "/dashboard"],
    ["app/dashboard/booking/page.tsx", "/dashboard/booking"],
    ["app/dashboard/couriers/page.tsx", "/dashboard/couriers"],
    ["app/dashboard/reports/page.tsx", "/dashboard/reports"],
  ];

  for (const [file, path] of pages) {
    it(`${file} guards with its own path`, () => {
      const code = source(file);
      assert.ok(
        code.includes(`redirectRaisedByToIssues("${path}")`),
        `${file} must call redirectRaisedByToIssues("${path}")`
      );
    });

    it(`${file} keeps the pre-existing Assignee guard`, () => {
      assert.ok(
        source(file).includes("redirectAssigneeToOwnIssues()"),
        `${file} must not lose its existing guard`
      );
    });
  }

  it("the guard itself refuses only raised_by, and only off-list paths", () => {
    const code = source("lib/routeGuards.ts");
    assert.ok(code.includes("export async function redirectRaisedByToIssues(path: string)"));
    assert.ok(code.includes("isDashboardPathAllowedForRole(user.role, path)"));
    assert.ok(code.includes("redirect(RAISED_BY_HOME)"));
    // Unauthenticated requests are unchanged: those pages were public before
    // this stage and this guard must not silently start requiring a login.
    assert.ok(code.includes("if (!user) {"));
  });
});

describe("wiring — login carries a validated return target", () => {
  it("the login action redirects through the allow-list, never the raw value", () => {
    const code = source("app/login/actions.ts");
    assert.ok(code.includes('redirect(loginDestination(formData.get("next")))'));
    assert.equal(
      code.includes('redirect(String(formData.get("next")'),
      false,
      "the raw next value must never reach redirect()"
    );
  });

  it("the login page passes only a validated value to the form", () => {
    const code = source("app/login/page.tsx");
    assert.ok(code.includes("safeReturnTarget(next)"));
    assert.ok(code.includes("loginDestination(next)"));
  });

  it("the form submits it as a hidden field", () => {
    const code = source("app/login/LoginForm.tsx");
    assert.ok(code.includes('name="next"'));
    assert.ok(code.includes('type="hidden"'));
  });

  it("logout is untouched — one session system, one way out", () => {
    const code = source("app/logout/actions.ts");
    assert.equal(code.includes("raised_by"), false, "logout must not special-case the role");
    assert.ok(code.includes("export async function logout"));
  });
});

describe("wiring — privileged surfaces still refuse the role on their own", () => {
  // These files were NOT modified for this feature. The point of the test is
  // that they did not need to be: each already demands a permission that
  // raised_by does not hold, so the refusal is enforced by code that predates
  // the role. If one of them ever drops its check, this fails.
  // New Issue is deliberately ABSENT from this list: the role now holds
  // issue:create, so that page admits it on purpose. What replaces the refusal
  // there is a different guarantee — the raiser is server-derived, so creating
  // does not mean creating as somebody else. See tests/raisedByWebCreate.test.ts.
  const guarded: Array<[string, Permission]> = [
    ["app/dashboard/issues/add-staff/page.tsx", "user:manage"],
    ["app/dashboard/issues/delete-actions.ts", "issue:delete"],
    ["app/dashboard/tracker/page.tsx", "tracker:view"],
  ];

  for (const [file, permission] of guarded) {
    it(`${file} requires ${permission}, which raised_by lacks`, () => {
      assert.ok(
        source(file).includes(`"${permission}"`),
        `${file} must still check ${permission}`
      );
      assert.equal(roleHasPermission(ROLE, permission), false);
    });
  }

  it("status and assignment actions require permissions the role lacks", () => {
    const statusCode = source("app/dashboard/issues/status-actions.ts");
    assert.ok(statusCode.includes('hasPermission(user, "issue:change_status_any")'));
    assert.ok(statusCode.includes('hasPermission(user, "issue:change_status_own_assigned")'));
    assert.equal(roleHasPermission(ROLE, "issue:change_status_any"), false);
    assert.equal(roleHasPermission(ROLE, "issue:change_status_own_assigned"), false);

    const assignCode = source("app/dashboard/issues/assign-actions.ts");
    assert.ok(assignCode.includes('"issue:assign"'));
    assert.equal(roleHasPermission(ROLE, "issue:assign"), false);
  });

  it("the AI assistant refuses it too", () => {
    const code = source("app/dashboard/issues/ai-actions.ts");
    assert.ok(code.includes('hasPermission(user, "issue:analyse_any")'));
    assert.ok(code.includes('hasPermission(user, "issue:analyse_own_assigned")'));
    assert.equal(roleHasPermission(ROLE, "issue:analyse_any"), false);
    assert.equal(roleHasPermission(ROLE, "issue:analyse_own_assigned"), false);
  });

  it("the sidebar needs no change — its three flags are already false", () => {
    // DashboardLayout resolves them from permissions the role does not hold,
    // so a raised_by session sees only Issues and Logout without a new branch.
    const code = source("components/dashboard/DashboardLayout.tsx");
    assert.ok(code.includes('hasPermission(user, "discussion:view")'));
    assert.ok(code.includes('hasPermission(user, "tracker:view")'));
    assert.ok(code.includes("showAccountSettings={user !== null && !canViewAllIssues}"));
    assert.equal(roleHasPermission(ROLE, "discussion:view"), false);
    assert.equal(roleHasPermission(ROLE, "tracker:view"), false);
    // showAccountSettings is false because the role DOES hold issue:view_all.
    assert.equal(roleHasPermission(ROLE, "issue:view_all"), true);
  });
});

describe("wiring — the Issue raiser is the signed-in person, resolved server-side", () => {
  // SUPERSEDED: this block previously asserted the OPPOSITE — that every Mobile
  // Lite Issue is attributed to the generic WH row and that the signed-in user
  // is never recorded. That was a faithful pin on the model in force before
  // migrations 014/015 linked a login to an issue_staff row. It is inverted
  // here rather than deleted, because the change is the point.

  it("resolves the raiser from the session, not from a constant", () => {
    const code = source("app/mobile/register-actions.ts");
    assert.ok(code.includes("findRaiserForUser(user.userId)"));
    assert.ok(code.includes("staffCode: raiser.staffCode"));
    assert.equal(
      code.includes("MOBILE_STAFF_CODE"),
      false,
      "the generic WH raiser must no longer be used for new Issues"
    );
  });

  it("still records no username or display name on the Issue", () => {
    // The user id is used ONLY as the lookup key for the link. The Issue itself
    // carries the raiser's staff_code, exactly like every desktop Issue — no
    // login identity is copied into it.
    const code = source("app/mobile/register-actions.ts");
    for (const forbidden of ["user.username", "user.displayName"]) {
      assert.equal(
        code.includes(forbidden),
        false,
        `login identity must not be recorded on the Issue (${forbidden})`
      );
    }
    assert.ok(code.includes("user.userId"), "the user id is the link lookup key");
  });

  it("the permission matrix still confers no raiser identity by itself", () => {
    const code = source("lib/access/permissions.ts");
    assert.equal(code.includes("staff_code"), true, "the reasoning must be documented");
    assert.equal(code.includes('"raised_by"'), true);
    // Holding the role is not the same as being linked: an unlinked account is
    // refused at registration rather than borrowing an identity.
    assert.ok(
      source("app/mobile/register-actions.ts").includes("if (!raiser)"),
      "an unlinked account must be refused"
    );
  });
});
