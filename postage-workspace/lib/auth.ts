import "server-only";

import { verifySession } from "./session";
import { findUserById } from "./queries/users";
import { findAssigneeIdForUser } from "./queries/assigneeLink";
import {
  resolveIssueAccessScope,
  roleHasPermission,
  SCOPE_NONE,
  type IssueAccessScope,
  type Permission,
  type Role,
} from "./access/permissions";

// Server-side authentication + authorization entry point.
//
// The permission vocabulary and every authorization DECISION now live in
// lib/access/permissions.ts — a pure module with no server-only/next/database
// import, so the rules are directly unit-testable (tests/access.test.ts).
// This file is the server wrapper: it resolves the real session and user,
// resolves the assignee link, and delegates the decision.
//
// Approved decisions this file follows:
// - Custom signed httpOnly session cookie — issue_tracker_auth_architecture_decision.md §1
// - issue_tracking.management_users is the identity source — §2
// - Roles are exactly "staff" | "management" | "admin" — §2/§3; no
//   `super_admin` DB role. Super Admin IS role 'admin'.
// - No automatic role-hierarchy inheritance — Stage 12A DECISION-001
// - Stage 3 model — documentation/issue_tracker_assignee_auth_design.md

// Re-exported so existing imports (`import type { Role } from "@/lib/auth"`)
// keep working unchanged.
export type { Permission, Role, IssueAccessScope };

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
 * lookup. This is the only kind of check that belongs in proxy.ts (see
 * postage-workspace/proxy.ts).
 */
export async function validateSession(): Promise<SessionPayload | null> {
  return verifySession();
}

/**
 * Reads and verifies the session, then re-fetches the user's current
 * role/active status from issue_tracking.management_users — never trusts a
 * role embedded in the cookie (there isn't one; see SessionPayload).
 * Resolves to null for: no valid session, user_id no longer exists, or the
 * account is deactivated — all three treated identically as "not
 * authenticated." Callers must never assume any role when this is null.
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
 * throws rather than redirecting: this helper is callable from Server
 * Components, Server Actions, and Route Handlers alike, and only a Server
 * Component can safely call redirect(). Callers decide how to handle it.
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
 * NOT a hierarchy/rank comparison (per DECISION-001). For anything
 * resembling "this role or higher," use hasPermission() instead.
 */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw new ForbiddenError(role, user.role);
  }
  return user;
}

/**
 * Explicit, single-permission authorization check against the per-role table
 * in lib/access/permissions.ts. Every Server Action / Route Handler that
 * mutates or reads sensitive data must call this (or requireRole()) rather
 * than writing an inline role comparison.
 *
 * Stays `async` purely for call-site compatibility — the underlying lookup
 * is synchronous and does no I/O.
 */
export async function hasPermission(
  user: CurrentUser,
  permission: Permission
): Promise<boolean> {
  return roleHasPermission(user.role, permission);
}

/**
 * Narrow role-equality check — deliberately NOT a hierarchy comparison.
 */
export function isRole(user: CurrentUser, role: Role): boolean {
  return user.role === role;
}

/** True for the Super Admin. Super Admin is the existing DB role 'admin';
 *  there is no `super_admin` role in the database. */
export function isSuperAdmin(user: CurrentUser): boolean {
  return user.role === "admin";
}

/**
 * Resolves how much of issue_tracking.issues this request may reach.
 *
 * MUST be called (and its result threaded into the query layer) by every
 * Issue read path. The three outcomes are:
 *   - "all"      : holder of issue:view_all (Super Admin / management)
 *   - "assignee" : holder of issue:view_own_assigned WITH a resolved
 *                  assignee link
 *   - "none"     : everyone else, including an assignee whose login is not
 *                  linked to an assignment_users row — and, today, EVERY
 *                  assignee, because migration 011 has not been applied.
 *                  "none" yields an empty result set, never an error and
 *                  never someone else's data.
 *
 * Ownership comes only from
 *   management_users.user_id -> assignment_users.user_id -> issue_assignments.assignee_id.
 * issue_staff / "Raised By" is never an ownership source.
 */
export async function getIssueAccessScope(
  user: CurrentUser | null
): Promise<IssueAccessScope> {
  if (!user) {
    return SCOPE_NONE;
  }

  // Only look up the link for a role that could actually use it — the Super
  // Admin short-circuits to "all" without a second query.
  if (roleHasPermission(user.role, "issue:view_all")) {
    return resolveIssueAccessScope({ role: user.role, assigneeId: null });
  }

  const assigneeId = await findAssigneeIdForUser(user.userId);
  return resolveIssueAccessScope({ role: user.role, assigneeId });
}

/** Convenience: current user + their Issue scope in one call. */
export async function getCurrentUserWithScope(): Promise<{
  user: CurrentUser | null;
  scope: IssueAccessScope;
}> {
  const user = await getCurrentUser();
  return { user, scope: await getIssueAccessScope(user) };
}
