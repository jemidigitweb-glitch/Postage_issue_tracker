// Pure authorization vocabulary and decision logic.
//
// DELIBERATELY has no `server-only` import, no `next/*` import, and no
// database import. Every function here is a pure function of its arguments,
// so the authorization rules can be unit-tested directly (see
// tests/access.test.ts) without mocking Next.js internals or touching
// Postgres. lib/auth.ts is the server-side wrapper that resolves the real
// user/session and then calls into this module.
//
// Approved model (documentation/issue_tracker_assignee_auth_design.md):
//  - Super Admin  = existing DB role 'admin'. No `super_admin` DB role.
//  - Assignee     = DB role 'staff', scoped to Issues currently assigned to
//                   them via management_users.user_id -> assignment_users.user_id
//                   -> issue_assignments.assignee_id.
//  - 'management' is unchanged from the pre-existing matrix; it is not part
//    of the Super Admin / Assignee model and no user holds it today.
//  - No role hierarchy or inheritance (DECISION-001): each role's set is an
//    explicit literal list.

/**
 * The roles permitted by issue_tracking.management_users.role's CHECK
 * constraint.
 *
 * `raised_by` is NEW and requires migration/013_raised_by_staff_auth.sql to be
 * applied before any account can hold it — the database constraint currently
 * accepts only the first three. The application understands the role first so
 * the migration can be reviewed against working, tested code.
 *
 * It is ONE SHARED account, not one login per Raised-By person: it is not
 * linked to issue_tracking.issue_staff, and there is deliberately no
 * management_users.staff_code. Authentication identity and the technical
 * "Raised By" identity on an Issue stay separate — a Warehouse Mobile Issue is
 * still raised by WH / Warehouse Mobile whoever is signed in.
 */
export type Role = "staff" | "management" | "admin" | "raised_by";

/** Every permission this application recognizes. */
export type Permission =
  | "issue:view_all"
  | "issue:view_own_assigned"
  | "issue:create"
  | "issue:comment"
  | "issue:change_status_own_assigned"
  | "issue:change_status_any"
  // AI investigation assistance, as TWO separate keys rather than one shared
  // one. The distinction is the point:
  //
  //   issue:analyse_own_assigned — the ASSIGNEE. Necessary but not
  //     sufficient: the specific Issue must ALSO be currently assigned to
  //     them, which the scope predicate enforces in SQL.
  //   issue:analyse_any — the SUPER ADMIN. No assignment ownership required,
  //     because an admin already has authority over every Issue.
  //
  // Keeping them apart means widening admin access can never widen assignee
  // access, and 'management' — which holds neither — cannot acquire either by
  // accident. There is no role hierarchy here (DECISION-001).
  | "issue:analyse_own_assigned"
  | "issue:analyse_any"
  | "issue:assign"
  | "issue:delete"
  | "issue:approve_reopen"
  | "user:manage"
  | "tracker:view"
  // Warehouse Mobile Lite. Its own key namespace, so it can never be widened
  // by an "issue:*" change: holding it means "may open /mobile and register a
  // Warehouse Mobile Issue", and nothing else. The Assignee does NOT hold it.
  | "mobile:submit"
  // Discussions module — distinct key namespace so nothing here can be
  // confused with or accidentally widen an "issue:*" check.
  | "discussion:view"
  | "discussion:create"
  | "discussion:edit"
  | "discussion:comment"
  | "discussion:change_status"
  | "discussion:manage_points"
  | "discussion:link_issue"
  | "discussion:reopen"
  | "discussion:delete";

/**
 * Explicit, per-role permission table. Not derived from any rank comparison
 * — admin's "full access" is this table listing every permission under the
 * "admin" key, never a fallthrough from being "above" another role.
 *
 * Stage 3 changes vs. the previous matrix:
 *  - staff is now the ASSIGNEE role: it holds exactly two permissions,
 *    both of which are additionally gated per-Issue by the ownership scope
 *    below. It lost issue:view_all, issue:create, issue:comment,
 *    discussion:view and discussion:comment.
 *  - issue:delete and tracker:view are new keys, admin-only. Before Stage 3
 *    no permission key guarded deletion at all.
 *  - issue:view_own_assigned is a new key so "may see a filtered list" is
 *    distinguishable from "may see everything".
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  // ASSIGNEE. Both permissions are necessary-but-not-sufficient: every call
  // site must ALSO check that the specific Issue is currently assigned to
  // this user (see IssueAccessScope).
  staff: new Set<Permission>([
    "issue:view_own_assigned",
    "issue:change_status_own_assigned",
    "issue:analyse_own_assigned",
  ]),

  // RAISED BY STAFF. A shared warehouse login: reads every Issue, and raises
  // Issues as itself from both the web and Warehouse Mobile Lite.
  //
  // Exactly three permissions, and deliberately no fourth. `issue:create` is
  // the ONLY mutation, and it is narrower than it looks: the raiser recorded on
  // the Issue is not the client's to choose. For this role the server resolves
  // it from management_users.staff_code -> issue_staff and never reads a form
  // key for it, so "create" means "create AS MYSELF" and cannot be used to file
  // an Issue in somebody else's name.
  //
  // Everything else remains absent — comment, assign, status, investigate,
  // resolve, reopen, delete, and every administrative surface (users, staff,
  // discussions, tracker) — so each existing server-side guard already refuses
  // this role without a single new check being written for it.
  raised_by: new Set<Permission>(["issue:view_all", "issue:create", "mobile:submit"]),

  // Unchanged from the pre-Stage-3 matrix. No account holds this role.
  management: new Set<Permission>([
    "issue:view_all",
    "issue:create",
    "issue:comment",
    "issue:change_status_any",
    "issue:assign",
    "issue:approve_reopen",
    "discussion:view",
    "discussion:create",
    "discussion:edit",
    "discussion:comment",
    "discussion:change_status",
    "discussion:manage_points",
    "discussion:link_issue",
    "discussion:reopen",
    "discussion:delete",
  ]),

  // SUPER ADMIN.
  admin: new Set<Permission>([
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
    // The Super Admin can already do everything an Issue permits; withholding
    // this one would only stop them testing the mobile screen they own.
    "mobile:submit",
    "discussion:view",
    "discussion:create",
    "discussion:edit",
    "discussion:comment",
    "discussion:change_status",
    "discussion:manage_points",
    "discussion:link_issue",
    "discussion:reopen",
    "discussion:delete",
  ]),
};

/** Pure permission lookup. `null` role (unauthenticated) never holds anything. */
export function roleHasPermission(role: Role | null, permission: Permission): boolean {
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Read-only view of the matrix, for tests and for rendering a permissions screen. */
export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

// ---------------------------------------------------------------------------
// Issue access scope
// ---------------------------------------------------------------------------

/**
 * How much of issue_tracking.issues the current request may reach.
 *
 *  - "all"      : no row filter (Super Admin / management).
 *  - "assignee" : only Issues with a CURRENT assignment to this assignee_id.
 *  - "none"     : nothing. The fail-closed default.
 *
 * Every Issue read path takes one of these, and "none" must always produce
 * an empty result rather than an error — an assignee with no linked
 * assignee row sees an empty list, never someone else's data.
 */
export type IssueAccessScope =
  | { readonly kind: "all" }
  | { readonly kind: "assignee"; readonly assigneeId: number }
  | { readonly kind: "none" };

export const SCOPE_ALL: IssueAccessScope = { kind: "all" };
export const SCOPE_NONE: IssueAccessScope = { kind: "none" };

/**
 * Decides the scope for a request. Pure — the caller resolves `role` from
 * the session and `assigneeId` from the login link, then hands both here.
 *
 * FAIL-CLOSED by construction, which is what makes it safe to ship this
 * before migration 011 exists: while assignment_users.user_id is absent,
 * `assigneeId` is always null, so a staff user resolves to "none" and sees
 * zero Issues. Nothing needs to change in this function when 011 is applied
 * — the link simply starts resolving to a real id.
 *
 * Ownership is NEVER derived from issue_staff / "Raised By". The only
 * accepted source is the assignment link.
 */
export function resolveIssueAccessScope(input: {
  role: Role | null;
  /** From management_users.user_id -> assignment_users.user_id. Null when
   *  unauthenticated, unlinked, or migration 011 is not yet applied. */
  assigneeId: number | null;
}): IssueAccessScope {
  const { role, assigneeId } = input;

  if (!role) {
    return SCOPE_NONE;
  }
  if (roleHasPermission(role, "issue:view_all")) {
    return SCOPE_ALL;
  }
  if (roleHasPermission(role, "issue:view_own_assigned") && assigneeId !== null) {
    return { kind: "assignee", assigneeId };
  }
  return SCOPE_NONE;
}

/**
 * Flattens a scope into the two bind values every scoped Issue query uses:
 *
 *   AND ($u::boolean OR EXISTS (SELECT 1 FROM issue_tracking.issue_assignments ia
 *          WHERE ia.issue_id = <issue> AND ia.is_current = true AND ia.assignee_id = $a::int))
 *
 * "all"      -> unrestricted = true                 -> predicate short-circuits true
 * "assignee" -> unrestricted = false, assigneeId = N -> only that assignee's current Issues
 * "none"     -> unrestricted = false, assigneeId = NULL -> `= NULL` is never true, so no rows
 *
 * The "none" case is why no caller needs a special branch: SQL's NULL
 * comparison semantics make it match nothing, so the fail-closed path is the
 * same code path as the normal one.
 */
export function issueScopeQueryArgs(scope: IssueAccessScope): {
  unrestricted: boolean;
  assigneeId: number | null;
} {
  switch (scope.kind) {
    case "all":
      return { unrestricted: true, assigneeId: null };
    case "assignee":
      return { unrestricted: false, assigneeId: scope.assigneeId };
    case "none":
      return { unrestricted: false, assigneeId: null };
  }
}

/**
 * The assignee filter a list query should actually apply, given the request
 * scope and whatever assignee the client asked for (e.g. `?assignee=3`).
 *
 * A client-supplied assignee id is honoured ONLY for an "all" scope. For an
 * "assignee" scope it is discarded outright and replaced with the
 * session-derived id — this is the anti-URL-tampering rule, enforced here
 * rather than at each page so it cannot be forgotten at a call site.
 */
export function effectiveAssigneeFilter(
  scope: IssueAccessScope,
  requestedAssigneeId: number | null
): number | null {
  switch (scope.kind) {
    case "all":
      return requestedAssigneeId;
    case "assignee":
      return scope.assigneeId;
    case "none":
      return null;
  }
}
