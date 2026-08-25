import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { permissionsForRole, roleHasPermission, type Permission } from "../lib/access/permissions";
import { isDashboardPathAllowedForRole, safeReturnTarget } from "../lib/access/raisedByAccess";

// RAISED-BY-STAFF — web Issue creation, and the Mobile Lite logout control.
//
// The permission rules are executed directly. The wiring is read as source,
// because Server Components and "use server" actions cannot be imported under
// `tsx --test` outside the Next.js runtime.

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/** Source with comment lines removed — these files document what they must not
 *  do, so "must not appear" assertions have to look at code. */
function codeOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const ROLE = "raised_by" as const;

// ---------------------------------------------------------------------------
// The permission set
// ---------------------------------------------------------------------------

describe("raised_by gains issue:create and nothing else", () => {
  it("holds exactly five permissions", () => {
    // Grew from three since this file was first written: issue:edit (correct
    // its own submission) and issue:delete (remove one it should not have
    // raised) were both added later — see tests/raisedByAccess.test.ts.
    assert.deepEqual([...permissionsForRole(ROLE)].sort(), [
      "issue:create",
      "issue:delete",
      "issue:edit",
      "issue:view_all",
      "mobile:submit",
    ]);
  });

  it("may read every Issue, create Issues, and submit from a phone", () => {
    for (const permission of ["issue:view_all", "issue:create", "mobile:submit"] as Permission[]) {
      assert.equal(roleHasPermission(ROLE, permission), true);
    }
  });

  it("still cannot assign, change status, investigate, resolve or reopen", () => {
    for (const permission of [
      "issue:assign",
      "issue:change_status_any",
      "issue:change_status_own_assigned",
      "issue:analyse_any",
      "issue:analyse_own_assigned",
      "issue:approve_reopen",
      "issue:comment",
    ] as Permission[]) {
      assert.equal(roleHasPermission(ROLE, permission), false, `must not hold ${permission}`);
    }
  });

  it("still cannot reach any administrative surface", () => {
    for (const permission of [
      "user:manage",
      "tracker:view",
      "discussion:view",
      "discussion:create",
      "discussion:delete",
    ] as Permission[]) {
      assert.equal(roleHasPermission(ROLE, permission), false, `must not hold ${permission}`);
    }
  });

  it("gained issue:create WITHOUT inheriting anything else from admin", () => {
    const admin = permissionsForRole("admin");
    const mine = permissionsForRole(ROLE);
    const held: Permission[] = ["issue:view_all", "issue:create", "issue:edit", "issue:delete", "mobile:submit"];
    for (const permission of admin) {
      if (held.includes(permission)) {
        continue;
      }
      assert.equal(mine.has(permission), false, `must not inherit ${permission}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

describe("the New Issue route is reachable, and nothing else is", () => {
  it("allows the Issue list, an Issue detail, and New Issue", () => {
    for (const path of ["/dashboard/issues", "/dashboard/issues/new", "/dashboard/issues/TU-001"]) {
      assert.equal(isDashboardPathAllowedForRole(ROLE, path), true, `${path} must be allowed`);
    }
  });

  it("still blocks every other dashboard route", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/booking",
      "/dashboard/couriers",
      "/dashboard/reports",
      "/dashboard/discussions",
      "/dashboard/tracker",
      "/dashboard/account-settings",
    ]) {
      assert.equal(isDashboardPathAllowedForRole(ROLE, path), false, `${path} must be blocked`);
    }
  });

  it("still blocks lookalike paths", () => {
    for (const path of ["/dashboard/issues-secret", "/dashboard/issuesadmin", "/dashboard/issues-export/all"]) {
      assert.equal(isDashboardPathAllowedForRole(ROLE, path), false, `${path} must be blocked`);
    }
  });

  it("Add Staff is under the allowed prefix but refuses on its own permission", () => {
    // Route reachability and authorization are separate layers; this one is
    // stopped by the second, which is why it needs no route exception.
    assert.equal(isDashboardPathAllowedForRole(ROLE, "/dashboard/issues/add-staff"), true);
    assert.ok(source("app/dashboard/issues/add-staff/page.tsx").includes('"user:manage"'));
    assert.equal(roleHasPermission(ROLE, "user:manage"), false);
  });
});

// ---------------------------------------------------------------------------
// The New Issue button
// ---------------------------------------------------------------------------

describe("the New Issue button follows issue:create", () => {
  const listPage = source("app/dashboard/issues/page.tsx");

  it("is rendered from the permission, not from a role check", () => {
    assert.ok(listPage.includes('hasPermission(currentUser, "issue:create")'));
    assert.ok(listPage.includes("{canCreate && ("));
    // No role name is hardcoded in the list page — the button appears for
    // raised_by purely because the permission is now held.
    assert.equal(codeOnly(listPage).includes('"raised_by"'), false);
  });

  it("Add Staff remains behind a permission raised_by lacks; Delete is now available to it", () => {
    assert.ok(listPage.includes('hasPermission(currentUser, "user:manage")'));
    assert.ok(listPage.includes('hasPermission(currentUser, "issue:delete")'));
    assert.equal(roleHasPermission(ROLE, "user:manage"), false);
    // SUPERSEDED: issue:delete was later granted to this role for the same
    // reason issue:edit was — it already sees and can correct every Issue.
    assert.equal(roleHasPermission(ROLE, "issue:delete"), true);
  });
});

// ---------------------------------------------------------------------------
// The raiser is server-derived
// ---------------------------------------------------------------------------

describe("a self-raiser cannot choose who raised the Issue", () => {
  const action = source("app/dashboard/issues/new/actions.ts");
  const actionCode = codeOnly(action);
  const page = source("app/dashboard/issues/new/page.tsx");
  const form = source("app/dashboard/issues/new/NewIssueForm.tsx");

  it("resolves the raiser from the session for this role", () => {
    assert.ok(actionCode.includes("const selfRaiser = isIssuesOnlyRole(user.role)"));
    assert.ok(actionCode.includes("findRaiserForUser(user.userId)"));
    assert.ok(actionCode.includes("staffCode = raiser.staffCode"));
  });

  it("reads the staffCode form key ONLY on the on-behalf branch", () => {
    // The single read must sit inside the else branch. If it were hoisted above
    // the branch, a self-raiser's submitted value would be parsed even if it
    // were later overwritten — and one refactor away from being used.
    const reads = [...actionCode.matchAll(/readText\(formData, "staffCode"\)/g)];
    assert.equal(reads.length, 1, "staffCode must be read from the form exactly once");
    const branch = actionCode.indexOf("} else {");
    assert.ok(branch > 0 && reads[0].index! > branch, "the read must be in the else branch");
    assert.ok(
      actionCode.indexOf("staffCode = raiser.staffCode") < reads[0].index!,
      "the session-derived assignment must come first"
    );
  });

  it("refuses an unlinked or deactivated raiser instead of substituting one", () => {
    assert.ok(actionCode.includes("if (!raiser)"));
    assert.ok(action.includes("not set up to raise Issues yet"));
    for (const code of ['"WH"', '"ND"', '"SA"', '"ST"', '"NV"', '"AT"', '"TU"']) {
      assert.equal(actionCode.includes(code), false, `must not fall back to ${code}`);
    }
  });

  it("does not read investigation or resolution content from a self-raiser", () => {
    assert.ok(actionCode.includes('const resolution = selfRaiser ? "" : readText(formData, "resolution")'));
    assert.ok(actionCode.includes('if (selfRaiser && field.formKey === "rootCause") continue'));
  });

  it("the form renders no raiser control at all for a self-raiser", () => {
    // Not a disabled select and not a hidden field: there must be nothing named
    // staffCode to submit.
    assert.ok(form.includes("selfRaiserName"));
    assert.ok(form.includes("{selfRaiserName ? ("));
    assert.ok(form.includes("Issues you create are raised in your own name."));
    // The picker still exists for the on-behalf branch.
    assert.ok(form.includes('<select id="staffCode" name="staffCode" required'));
  });

  it("the page resolves the display name server-side and skips the staff list", () => {
    assert.ok(page.includes("isIssuesOnlyRole(currentUser?.role ?? null)"));
    assert.ok(page.includes("findRaiserForUser(currentUser.userId)"));
    assert.ok(page.includes("selfRaiser ? Promise.resolve([]) : listActiveStaff()"));
    assert.ok(page.includes("selfRaiserName={linkedRaiser?.staffName ?? null}"));
  });

  it("still requires issue:create before anything else", () => {
    assert.ok(actionCode.includes('hasPermission(user, "issue:create")'));
    assert.ok(
      actionCode.indexOf('hasPermission(user, "issue:create")') <
        actionCode.indexOf("isIssuesOnlyRole(user.role)")
    );
  });
});

// ---------------------------------------------------------------------------
// Creation rules that must not change
// ---------------------------------------------------------------------------

describe("Issue creation rules are untouched", () => {
  const issues = source("lib/queries/issues.ts");
  const action = codeOnly(source("app/dashboard/issues/new/actions.ts"));

  it("the Issue ID still comes from next_issue_id(staff_code)", () => {
    assert.ok(issues.includes("SELECT issue_tracking.next_issue_id($1) AS next_issue_id"));
    // The action RECEIVES an id from createIssue(); it must never build one.
    assert.ok(action.includes("await createIssue("));
    for (const forbidden of ["padStart", "lpad", "next_issue_id", 'staffCode + "-"']) {
      assert.equal(action.includes(forbidden), false, `the action must not compose an ID (${forbidden})`);
    }
  });

  it("new Issues are still hard-coded RED, never client-chosen", () => {
    assert.ok(issues.includes("VALUES ($1, $2, $3, $4, $5, 'RED', $6, $7, CURRENT_DATE, $8::jsonb)"));
    for (const forbidden of ['readText(formData, "status")', 'formData.get("status")']) {
      assert.equal(action.includes(forbidden), false, `the action must not read ${forbidden}`);
    }
  });

  it("the action reads no assignment field", () => {
    for (const forbidden of ["assignee", "assignment", "issue:assign"]) {
      assert.equal(action.includes(forbidden), false, `the action must not reference ${forbidden}`);
    }
  });

  it("the raiser is still validated against issue_staff before an ID is taken", () => {
    assert.ok(issues.includes("SELECT active FROM issue_tracking.issue_staff WHERE staff_code = $1"));
    assert.ok(issues.includes("InvalidStaffError"));
  });
});

// ---------------------------------------------------------------------------
// Mobile Lite logout
// ---------------------------------------------------------------------------

describe("Warehouse Mobile Lite — the logout control", () => {
  const page = source("app/mobile/page.tsx");
  const logoutAction = source("app/logout/actions.ts");
  const sidebar = source("components/shared/AppSidebar.tsx");

  it("sits on the same header row as Add Issue, on the right", () => {
    const header = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
    assert.ok(header.includes("items-center justify-between"), "the row must be a justified flex row");
    assert.ok(header.includes("Add Issue"));
    assert.ok(header.includes("Logout"));
    assert.ok(
      header.indexOf("Add Issue") < header.indexOf("Logout"),
      "Add Issue on the left, Logout on the right"
    );
  });

  it("is a compact, tappable, visually secondary control", () => {
    const header = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
    assert.ok(header.includes("min-h-[44px]"), "must meet the minimum tap target");
    assert.ok(header.includes("text-sm"), "must be smaller than the heading");
    // Not a filled/primary button, and not a card.
    for (const loud of ["bg-blue", "bg-red", "rounded-xl border", "shadow"]) {
      assert.equal(header.includes(loud), false, `Logout must not be styled as ${loud}`);
    }
  });

  it("posts to the SHARED logout action — no Mobile-only implementation", () => {
    assert.ok(page.includes('import { logout } from "@/app/logout/actions"'));
    assert.ok(page.includes("<form action={logout}>"));
    // No second session mechanism anywhere in the mobile route.
    for (const forbidden of ["deleteSession", "cookies()", "signOut", "clearSession"]) {
      assert.equal(codeOnly(page).includes(forbidden), false, `the page must not call ${forbidden}`);
    }
  });

  it("the sidebar keeps using the same action, unchanged", () => {
    assert.ok(sidebar.includes('import { logout } from "@/app/logout/actions"'));
    assert.ok(sidebar.includes("<form action={logout}"));
  });

  it("returns the worker to /mobile after signing in again", () => {
    assert.ok(page.includes('<input type="hidden" name="next" value={MOBILE_HOME} />'));
    assert.ok(logoutAction.includes("safeReturnTarget(formData?.get(\"next\"))"));
    assert.ok(logoutAction.includes("redirect(next ? `/login?next=${encodeURIComponent(next)}` : \"/login\")"));
    // And the value is allow-listed, so a tampered field cannot redirect out.
    assert.equal(safeReturnTarget("https://evil.example"), null);
    assert.equal(safeReturnTarget("/mobile"), "/mobile");
    assert.equal(safeReturnTarget("/dashboard/tracker"), null);
  });

  it("still clears the one real session and the router cache", () => {
    assert.ok(logoutAction.includes("await deleteSession()"));
    assert.ok(logoutAction.includes('revalidatePath("/", "layout")'));
  });

  it("writes no Issue data and registers no draft", () => {
    const code = codeOnly(logoutAction);
    for (const forbidden of ["createIssue", "registerMobileIssue", "issue_tracking", "lib/queries", "INSERT"]) {
      assert.equal(code.includes(forbidden), false, `logout must not reference ${forbidden}`);
    }
    // The draft lives in client state only — the header form carries no draft
    // field, so submitting it cannot ship one anywhere. Checked against the
    // header's MARKUP, not the comment that explains the behaviour.
    // {/* ... */} blocks span lines whose continuations start with ordinary
    // words, so they are stripped wholesale rather than line by line.
    const headerMarkup = codeOnly(
      page.slice(page.indexOf("<header"), page.indexOf("</header>")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    );
    // Checked by FORM FIELD NAME rather than by loose substring — "items"
    // would otherwise match the flex class `items-center`.
    const fieldNames = [...headerMarkup.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(fieldNames, ["next"], "the only submitted field is the return target");
    for (const forbidden of ["draft", "items", "submissionId", "photos", "voice"]) {
      assert.equal(
        fieldNames.includes(forbidden),
        false,
        `the logout form must not carry ${forbidden}`
      );
    }
    assert.equal((headerMarkup.match(/<input/g) ?? []).length, 1);
  });

  it("after logout /mobile requires a session again", () => {
    // The proxy has no exception for a just-logged-out request: the cookie is
    // gone, so the next GET takes the same protected path as any anonymous one.
    const proxy = source("proxy.ts");
    assert.ok(proxy.includes('"/mobile"'));
    assert.ok(proxy.includes("if (!session)"));
    assert.ok(proxy.includes('loginUrl.searchParams.set("next", MOBILE_PATH_PREFIX)'));
  });
});

// ---------------------------------------------------------------------------
// Other roles
// ---------------------------------------------------------------------------

describe("Super Admin and Assignee are unchanged", () => {
  it("Super Admin keeps the raiser picker and every permission", () => {
    const admin = permissionsForRole("admin");
    for (const permission of [
      "issue:create",
      "issue:assign",
      "issue:delete",
      "issue:change_status_any",
      "user:manage",
      "tracker:view",
    ] as Permission[]) {
      assert.equal(admin.has(permission), true, `admin must keep ${permission}`);
    }
    assert.equal(admin.size, 21);
    // isIssuesOnlyRole is false for admin, so they take the on-behalf branch.
    assert.equal(isDashboardPathAllowedForRole("admin", "/dashboard/tracker"), true);
  });

  it("Assignee keeps exactly its three scoped permissions", () => {
    assert.deepEqual([...permissionsForRole("staff")].sort(), [
      "issue:analyse_own_assigned",
      "issue:change_status_own_assigned",
      "issue:view_own_assigned",
    ]);
    assert.equal(roleHasPermission("staff", "issue:create"), false);
    assert.equal(roleHasPermission("staff", "mobile:submit"), false);
  });

  it("management is unchanged and gained nothing", () => {
    assert.equal(roleHasPermission("management", "issue:create"), true);
    assert.equal(roleHasPermission("management", "mobile:submit"), false);
    assert.equal(permissionsForRole("management").size, 15);
  });
});
