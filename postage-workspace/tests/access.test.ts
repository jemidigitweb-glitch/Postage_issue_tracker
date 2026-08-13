// Authorization tests — Stage 3 security hardening.
//
// Runs on Node's built-in test runner via tsx (`npm test`). No new
// dependency, no test framework, no database, and NO live staff account: the
// assignee role is exercised entirely through the pure decision layer in
// lib/access/permissions.ts and lib/access/issueWorkflow.ts, which is exactly
// the code every page and Server Action delegates to.
//
// What this file proves and what it does not:
//  - PROVES the authorization DECISIONS (who may do what, which scope a
//    request resolves to, how a scope becomes SQL bind values, and that the
//    Issue workflow rules are unchanged).
//  - Does NOT execute the Server Actions themselves — they require a Next.js
//    request context (cookies()) and a live Postgres connection. Their guards
//    are single calls into the functions tested here; the guard call sites
//    are listed in the assertions below so a reviewer can check them by eye.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  effectiveAssigneeFilter,
  issueScopeQueryArgs,
  permissionsForRole,
  resolveIssueAccessScope,
  roleHasPermission,
  SCOPE_ALL,
  SCOPE_NONE,
  type Permission,
} from "../lib/access/permissions";
import { classifyTransition, STATUS_RANK } from "../lib/access/issueWorkflow";

// The role a future assignee account will hold. No such account exists yet.
const ASSIGNEE_ROLE = "staff" as const;
const SUPER_ADMIN_ROLE = "admin" as const;

describe("permission matrix — Super Admin (role 'admin')", () => {
  const expected: Permission[] = [
    "issue:view_all",
    "issue:create",
    "issue:comment",
    "issue:change_status_any",
    "issue:assign",
    "issue:delete",
    "issue:approve_reopen",
    "issue:analyse_any",
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

  for (const permission of expected) {
    it(`holds ${permission}`, () => {
      assert.equal(roleHasPermission(SUPER_ADMIN_ROLE, permission), true);
    });
  }

  it("holds exactly that set and nothing more", () => {
    assert.deepEqual([...permissionsForRole(SUPER_ADMIN_ROLE)].sort(), [...expected].sort());
  });

  it("holds issue:analyse_any — the Super Admin needs no assignment ownership", () => {
    assert.equal(roleHasPermission(SUPER_ADMIN_ROLE, "issue:analyse_any"), true);
  });

  it("does NOT hold the Assignee's AI key — the two are separate permissions", () => {
    assert.equal(roleHasPermission(SUPER_ADMIN_ROLE, "issue:analyse_own_assigned"), false);
    assert.equal(roleHasPermission(null, "issue:analyse_own_assigned"), false);
  });

  it("'management' gains NEITHER AI permission automatically", () => {
    assert.equal(roleHasPermission("management", "issue:analyse_any"), false);
    assert.equal(roleHasPermission("management", "issue:analyse_own_assigned"), false);
    assert.equal(roleHasPermission(null, "issue:analyse_any"), false);
  });

  it("does not hold issue:view_own_assigned — it sees everything, not a filtered slice", () => {
    assert.equal(roleHasPermission(SUPER_ADMIN_ROLE, "issue:view_own_assigned"), false);
  });
});

describe("permission matrix — Assignee (role 'staff')", () => {
  it("holds exactly three permissions", () => {
    assert.deepEqual([...permissionsForRole(ASSIGNEE_ROLE)].sort(), [
      "issue:analyse_own_assigned",
      "issue:change_status_own_assigned",
      "issue:view_own_assigned",
    ]);
  });

  it("holds issue:analyse_own_assigned — AI assistance is Assignee-only", () => {
    assert.equal(roleHasPermission(ASSIGNEE_ROLE, "issue:analyse_own_assigned"), true);
  });

  // Each of these maps to a real guard. The Server Action that enforces it is
  // named so the mapping stays reviewable.
  const denied: Array<[Permission, string]> = [
    ["issue:view_all", "app/dashboard/issues/page.tsx — list scope"],
    ["issue:create", "app/dashboard/issues/new/actions.ts — createIssueAction"],
    ["issue:delete", "app/dashboard/issues/delete-actions.ts — softDeleteIssuesAction"],
    ["issue:assign", "app/dashboard/issues/assign-actions.ts — assignIssuesAction"],
    ["issue:change_status_any", "app/dashboard/issues/status-actions.ts"],
    ["issue:approve_reopen", "no reopen path exists for any role"],
    ["user:manage", "app/dashboard/issues/add-staff/actions.ts — addStaffAction"],
    ["tracker:view", "future /dashboard/tracker"],
    ["discussion:view", "app/dashboard/discussions/page.tsx"],
    ["discussion:create", "app/dashboard/discussions/new/actions.ts"],
    ["discussion:edit", "discussions [discussionId] actions"],
    ["discussion:comment", "app/dashboard/discussions/[discussionId]/comment-actions.ts"],
    ["discussion:change_status", "discussions status-actions.ts"],
    ["discussion:manage_points", "discussions points-actions.ts"],
    ["discussion:link_issue", "discussions issue-link-actions.ts"],
    ["discussion:reopen", "discussions status-actions.ts"],
    ["discussion:delete", "app/dashboard/discussions/delete-actions.ts"],
    ["issue:comment", "no Issue comment surface exists"],
  ];

  for (const [permission, guard] of denied) {
    it(`is DENIED ${permission} (guard: ${guard})`, () => {
      assert.equal(roleHasPermission(ASSIGNEE_ROLE, permission), false);
    });
  }
});

describe("unauthenticated requests", () => {
  it("hold no permission at all", () => {
    const everyPermission: Permission[] = [
      ...permissionsForRole("admin"),
      ...permissionsForRole("staff"),
      ...permissionsForRole("management"),
    ];
    for (const permission of everyPermission) {
      assert.equal(roleHasPermission(null, permission), false, `null role must not hold ${permission}`);
    }
  });

  it("specifically cannot create or delete Issues", () => {
    assert.equal(roleHasPermission(null, "issue:create"), false);
    assert.equal(roleHasPermission(null, "issue:delete"), false);
  });

  it("resolve to scope 'none'", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: null, assigneeId: 3 }), SCOPE_NONE);
  });
});

describe("issue access scope resolution", () => {
  it("Super Admin gets the unrestricted scope", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: SUPER_ADMIN_ROLE, assigneeId: null }), SCOPE_ALL);
  });

  it("management keeps its pre-existing unrestricted access (no regression)", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: "management", assigneeId: null }), SCOPE_ALL);
  });

  it("a linked assignee is scoped to their own assignee_id", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: ASSIGNEE_ROLE, assigneeId: 7 }), {
      kind: "assignee",
      assigneeId: 7,
    });
  });

  it("FAILS CLOSED for an assignee with no link — the state of every assignee until migration 011 is applied", () => {
    assert.deepEqual(resolveIssueAccessScope({ role: ASSIGNEE_ROLE, assigneeId: null }), SCOPE_NONE);
  });
});

describe("scope -> SQL bind values", () => {
  it("'all' short-circuits the predicate to true", () => {
    assert.deepEqual(issueScopeQueryArgs(SCOPE_ALL), { unrestricted: true, assigneeId: null });
  });

  it("'assignee' binds the assignee id and does not short-circuit", () => {
    assert.deepEqual(issueScopeQueryArgs({ kind: "assignee", assigneeId: 4 }), {
      unrestricted: false,
      assigneeId: 4,
    });
  });

  it("'none' binds NULL, so `assignee_id = NULL` matches no row", () => {
    assert.deepEqual(issueScopeQueryArgs(SCOPE_NONE), { unrestricted: false, assigneeId: null });
  });
});

describe("URL tampering — ?assignee=<id>", () => {
  it("an assignee's own id always wins over the requested one", () => {
    const scope = { kind: "assignee", assigneeId: 2 } as const;
    // "let me see assignee 9's Issues"
    assert.equal(effectiveAssigneeFilter(scope, 9), 2);
    assert.equal(effectiveAssigneeFilter(scope, 1), 2);
    // omitted, absurd, and self-referential values all collapse to the same id
    assert.equal(effectiveAssigneeFilter(scope, null), 2);
    assert.equal(effectiveAssigneeFilter(scope, 999999), 2);
    assert.equal(effectiveAssigneeFilter(scope, 2), 2);
  });

  it("Super Admin may still filter by any assignee (no regression)", () => {
    assert.equal(effectiveAssigneeFilter(SCOPE_ALL, 9), 9);
    assert.equal(effectiveAssigneeFilter(SCOPE_ALL, null), null);
  });

  it("a 'none' scope can never be widened by a requested id", () => {
    assert.equal(effectiveAssigneeFilter(SCOPE_NONE, 9), null);
  });
});

describe("cross-assignee Issue access", () => {
  // Issue ownership is a current row in issue_assignments. This models the
  // predicate the query layer builds from the scope, so the decision is
  // testable without a database.
  const assignments: Record<string, number> = {
    "ND-001": 2, // belongs to assignee 2
    "ND-002": 9, // belongs to assignee 9
    "SA-010": 2,
  };

  function visible(scope: ReturnType<typeof resolveIssueAccessScope>, issueId: string): boolean {
    const { unrestricted, assigneeId } = issueScopeQueryArgs(scope);
    if (unrestricted) return true;
    if (assigneeId === null) return false; // `= NULL` is never true
    return assignments[issueId] === assigneeId;
  }

  const assignee2 = resolveIssueAccessScope({ role: ASSIGNEE_ROLE, assigneeId: 2 });
  const unlinked = resolveIssueAccessScope({ role: ASSIGNEE_ROLE, assigneeId: null });

  it("an assignee can open their own Issue", () => {
    assert.equal(visible(assignee2, "ND-001"), true);
    assert.equal(visible(assignee2, "SA-010"), true);
  });

  it("an assignee CANNOT open another assignee's Issue by typing its ID", () => {
    assert.equal(visible(assignee2, "ND-002"), false);
  });

  it("an unknown ID and another assignee's ID are indistinguishable — both simply invisible", () => {
    assert.equal(visible(assignee2, "ND-002"), visible(assignee2, "ZZ-999"));
  });

  it("an unlinked assignee sees nothing at all", () => {
    for (const issueId of Object.keys(assignments)) {
      assert.equal(visible(unlinked, issueId), false);
    }
  });

  it("Super Admin can open every Issue (no regression)", () => {
    for (const issueId of Object.keys(assignments)) {
      assert.equal(visible(SCOPE_ALL, issueId), true);
    }
  });

  it("Prev/Next navigation uses the same predicate, so it cannot leak another assignee's ID", () => {
    const reachable = Object.keys(assignments).filter((id) => visible(assignee2, id));
    assert.deepEqual(reachable.sort(), ["ND-001", "SA-010"]);
    assert.equal(reachable.includes("ND-002"), false);
  });
});

describe("status change ownership", () => {
  // Mirrors app/dashboard/issues/status-actions.ts: change_status_any needs no
  // ownership precondition; change_status_own_assigned resolves one from the
  // session, and a scope that is not "assignee" must fail closed.
  function requiredAssigneeId(
    role: "admin" | "staff" | "management",
    assigneeId: number | null
  ): { allowed: boolean; requireAssigneeId: number | null } {
    if (roleHasPermission(role, "issue:change_status_any")) {
      return { allowed: true, requireAssigneeId: null };
    }
    if (!roleHasPermission(role, "issue:change_status_own_assigned")) {
      return { allowed: false, requireAssigneeId: null };
    }
    const scope = resolveIssueAccessScope({ role, assigneeId });
    if (scope.kind !== "assignee") {
      return { allowed: false, requireAssigneeId: null };
    }
    return { allowed: true, requireAssigneeId: scope.assigneeId };
  }

  it("Super Admin changes status with no ownership precondition (unchanged behaviour)", () => {
    assert.deepEqual(requiredAssigneeId("admin", null), { allowed: true, requireAssigneeId: null });
  });

  it("a linked assignee is constrained to their own assignee_id", () => {
    assert.deepEqual(requiredAssigneeId("staff", 5), { allowed: true, requireAssigneeId: 5 });
  });

  it("an unlinked assignee is rejected outright — never falls through unrestricted", () => {
    assert.deepEqual(requiredAssigneeId("staff", null), { allowed: false, requireAssigneeId: null });
  });

  it("an assignee cannot obtain a null (unrestricted) precondition", () => {
    const result = requiredAssigneeId("staff", 5);
    assert.notEqual(result.requireAssigneeId, null);
  });
});

describe("Issue workflow rules are unchanged", () => {
  it("keeps the RED < AMBER < GREEN ranking", () => {
    assert.deepEqual(STATUS_RANK, { RED: 0, AMBER: 1, GREEN: 2 });
  });

  it("allows forward transitions", () => {
    assert.equal(classifyTransition("RED", "AMBER"), "forward");
    assert.equal(classifyTransition("AMBER", "GREEN"), "forward");
    assert.equal(classifyTransition("RED", "GREEN"), "forward");
  });

  it("treats same-status as a no-op, not an error", () => {
    assert.equal(classifyTransition("RED", "RED"), "noop");
    assert.equal(classifyTransition("AMBER", "AMBER"), "noop");
    assert.equal(classifyTransition("GREEN", "GREEN"), "noop");
  });

  it("rejects every backwards transition — there is still no reopen path", () => {
    assert.equal(classifyTransition("AMBER", "RED"), "backward");
    assert.equal(classifyTransition("GREEN", "AMBER"), "backward");
    assert.equal(classifyTransition("GREEN", "RED"), "backward");
  });

  it("grants no role a way out of GREEN", () => {
    for (const role of ["admin", "management", "staff"] as const) {
      // approve_reopen exists as a key but no code path performs a reopen;
      // the transition classifier rejects it regardless of role.
      assert.equal(classifyTransition("GREEN", "RED"), "backward");
      assert.equal(classifyTransition("GREEN", "AMBER"), "backward");
      assert.ok(role);
    }
  });
});
