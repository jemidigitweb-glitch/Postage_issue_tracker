import "server-only";

import { verifySession } from "./session";
import { findUserById } from "./queries/users";

// Authentication helpers — Stage 14 (session) + Stage 14b (database-backed
// identity) implementation.
//
// Session verification (via lib/session.ts, jose-based) and database-backed
// user identity resolution (via lib/queries/users.ts) are both real as of
// this stage. getCurrentUser() re-fetches role/active on every call — never
// trusts a role embedded in the cookie (there isn't one to trust; see
// SessionPayload).
//
// Approved decisions this file follows:
// - Custom signed httpOnly session cookie — issue_tracker_auth_architecture_decision.md §1
// - issue_tracking.management_users is the identity source — §2
// - Roles are exactly "staff" | "management" | "admin" — §2/§3
// - No automatic role-hierarchy inheritance — Stage 12A DECISION-001
// - Finalized permission matrix (including the previously-open
//   Management/Admin create-issue and add-comment questions, resolved in
//   documentation/issue_tracker_auth_implementation_plan.md §3)

/** The three roles approved for issue_tracking.management_users.role. */
export type Role = "staff" | "management" | "admin";

/**
 * The minimal, non-sensitive payload signed into the session cookie.
 * Never contains passwords, role, or other PII — see lib/session.ts.
 */
export interface SessionPayload {
  userId: number; // issue_tracking.management_users.user_id
  issuedAt: number; // unix seconds
  expiresAt: number; // unix seconds
}

/**
 * The current user's identity as resolved from issue_tracking.management_users
 * (re-fetched from the database, not trusted from the cookie alone — the
 * "role freshness" decision in issue_tracker_auth_architecture_decision.md §2).
 */
export interface CurrentUser {
  userId: number;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
}

/** Every permission this application currently recognizes. */
export type Permission =
  | "issue:view_all"
  | "issue:create"
  | "issue:comment"
  | "issue:change_status_own_assigned"
  | "issue:change_status_any"
  | "issue:assign"
  | "issue:approve_reopen"
  | "user:manage"
  // Discussions module (additive — approved permission model, see
  // documentation for the Discussions feature). Distinct key namespace
  // ("discussion:*") so nothing here can be confused with or accidentally
  // widen an "issue:*" check.
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
 * Explicit, per-role permission table — the finalized matrix from
 * documentation/issue_tracker_auth_implementation_plan.md §3. Deliberately
 * a literal list per role, not derived from any rank/hierarchy comparison,
 * per DECISION-001 ("no automatic permission inheritance"). Admin's
 * "full permissions" is this table containing every permission for the
 * "admin" key explicitly — not a fallthrough from being "above" the other
 * roles.
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  staff: new Set<Permission>([
    "issue:view_all",
    "issue:create",
    "issue:comment",
    "issue:change_status_own_assigned",
    // Discussions: staff can view and comment only — not create, edit,
    // change status, manage points, link Issues, or reopen.
    "discussion:view",
    "discussion:comment",
  ]),
  management: new Set<Permission>([
    "issue:view_all",
    "issue:create",
    "issue:comment",
    "issue:change_status_any",
    "issue:assign",
    "issue:approve_reopen",
    // Discussions: full working access.
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
  admin: new Set<Permission>([
    "issue:view_all",
    "issue:create",
    "issue:comment",
    "issue:change_status_any",
    "issue:assign",
    "issue:approve_reopen",
    "user:manage",
    // Discussions: all Discussion permissions.
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

/** Thrown by requireUser() when there is no valid, active session. */
export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated user.");
    this.name = "UnauthenticatedError";
  }
}

/** Thrown by requireRole() when the current user does not hold the required role. */
export class ForbiddenError extends Error {
  constructor(required: Role, actual: Role) {
    super(`Requires role "${required}", current user has role "${actual}".`);
    this.name = "ForbiddenError";
  }
}

/**
 * Verifies only the session cookie's signature and expiry — no database
 * lookup. Thin wrapper over lib/session.ts's verifySession(), kept under
 * this name for continuity with the design documented across
 * issue_tracker_auth_architecture_decision.md and
 * issue_tracker_application_structure.md. This is the only kind of check
 * that belongs in proxy.ts (see postage-workspace/proxy.ts).
 */
export async function validateSession(): Promise<SessionPayload | null> {
  return verifySession();
}

/**
 * Reads and verifies the session, then re-fetches the user's current
 * role/active status from issue_tracking.management_users — never trusts a
 * role embedded in the cookie (there isn't one; see SessionPayload).
 * Resolves to null for: no valid session, user_id no longer exists, or the
 * account is deactivated (`active = false`) — all three are treated
 * identically as "not authenticated." Callers must never assume any role
 * when this resolves to null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await validateSession();
  if (!session) {
    return null;
  }

  const user = await findUserById(session.userId);
  if (!user || !user.active) {
    return null;
  }

  return user;
}

/**
 * Resolves the current user or throws UnauthenticatedError. Deliberately
 * throws rather than redirecting (unlike the Next.js docs' single-context
 * example): this helper is meant to be callable from Server Components,
 * Server Actions, and Route Handlers alike, and only a Server Component
 * can safely call redirect() as navigation — a Route Handler needs to
 * return a 401 Response instead. Callers decide how to handle the error
 * for their own context.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

/**
 * Requires the current user to hold exactly the given role. Deliberately
 * NOT a hierarchy/rank comparison (per DECISION-001) — use only where an
 * action is restricted to exactly one named role (e.g. "only admin may
 * manage user accounts"). For anything resembling "this role or higher,"
 * use hasPermission() against the explicit per-role table instead.
 */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw new ForbiddenError(role, user.role);
  }
  return user;
}

/**
 * Explicit, single-permission authorization check against the finalized
 * per-role permission table above — the enforcement point for
 * DECISION-001's "no automatic role inheritance" rule. Every Server Action
 * / Route Handler that mutates or reads sensitive data must call this (or
 * requireRole()) rather than writing an inline role comparison.
 */
export async function hasPermission(
  user: CurrentUser,
  permission: Permission
): Promise<boolean> {
  return ROLE_PERMISSIONS[user.role].has(permission);
}

/**
 * Narrow role-equality check — deliberately NOT a hierarchy/rank
 * comparison (there is no ranking between "staff" | "management" | "admin"
 * in this codebase). Prefer requireRole() at call sites that should throw;
 * this is for call sites that need a boolean instead (e.g. conditional UI).
 */
export function isRole(user: CurrentUser, role: Role): boolean {
  return user.role === role;
}
