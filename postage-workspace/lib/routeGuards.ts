import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, hasPermission } from "./auth";
import { RAISED_BY_HOME, isDashboardPathAllowedForRole } from "./access/raisedByAccess";

// Server-side route guards for dashboard pages that are NOT part of the
// Assignee's workspace.
//
// Why not proxy.ts: the proxy runs on every request including prefetches and
// deliberately performs no database lookup, so it cannot know a user's role.
// Role-based routing therefore has to happen in the page itself. These
// helpers exist so that decision is written once and reused, rather than
// re-implemented (and eventually mis-implemented) per page.

/** The only route an Assignee is allowed into. */
export const ASSIGNEE_HOME = "/dashboard/issues";

/**
 * Redirects an authenticated Assignee (role 'staff') away from a page meant
 * for the Super Admin, sending them to their own Issue list.
 *
 * Behaviour by caller:
 *  - Super Admin / management (issue:view_all) — returns, page renders as before.
 *  - Assignee ('staff')                        — redirect() to /dashboard/issues.
 *  - Not signed in                             — returns, unchanged.
 *
 * That last case is deliberate and is NOT a hole being opened here: pages
 * under /dashboard/issues and /dashboard/discussions are already gated by
 * proxy.ts, and the remaining dashboard pages (booking, couriers, reports,
 * the dashboard index) were public before this stage and are intentionally
 * left exactly as they were — widening authentication to cover them is a
 * separate decision that has not been made. This guard only ADDS the
 * role-based restriction it is named for; it never removes an existing one.
 *
 * Note redirect() throws internally (NEXT_REDIRECT), so it must be called
 * outside a try/catch that would swallow it.
 */
export async function redirectAssigneeToOwnIssues(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    return;
  }
  if (await hasPermission(user, "issue:view_all")) {
    return;
  }
  redirect(ASSIGNEE_HOME);
}

/**
 * Redirects a RAISED-BY-STAFF session away from any dashboard page that is not
 * the Issue list or an Issue detail page.
 *
 * Why this exists as well as the guard above: `raised_by` holds
 * `issue:view_all`, so redirectAssigneeToOwnIssues() correctly lets it through
 * — that check asks "is this an Assignee", which it is not. This one asks the
 * different question "is this role confined to Issues", and only `raised_by`
 * answers yes.
 *
 * Behaviour by caller:
 *  - Super Admin / management / Assignee — returns, page renders as before.
 *  - Raised by Staff                     — redirect() to /dashboard/issues.
 *  - Not signed in                       — returns, unchanged.
 *
 * The pages that already carry a permission guard (tracker, discussions,
 * account-settings, New Issue, Add Staff) refuse `raised_by` on their own,
 * because it holds none of the permissions they require. This helper is for
 * the dashboard pages that carry NO guard — the index, booking, couriers and
 * reports — which were public before this stage and stay exactly as public as
 * they were for everyone else. It only ADDS the role restriction it is named
 * for; it never removes an existing one, and it never widens access.
 *
 * `path` is passed by the caller rather than read from headers so the rule
 * stays a pure function of its input and is testable without a request.
 *
 * Note redirect() throws internally (NEXT_REDIRECT), so it must be called
 * outside a try/catch that would swallow it.
 */
export async function redirectRaisedByToIssues(path: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    return;
  }
  if (isDashboardPathAllowedForRole(user.role, path)) {
    return;
  }
  redirect(RAISED_BY_HOME);
}
