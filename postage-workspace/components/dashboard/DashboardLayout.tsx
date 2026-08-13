import type { ReactNode } from "react";

import AppHeader from "@/components/shared/AppHeader";
import AppSidebar from "@/components/shared/AppSidebar";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { findAssigneeForUser } from "@/lib/queries/assigneeLink";

// Async Server Component: resolves the signed-in user once per render and
// hands the navigation only the booleans it needs. The sidebar is a Client
// Component, so it must never resolve the role itself — a client-side role
// check would be advisory at best. Everything the navigation hides is
// independently enforced server-side (page guards + Server Action
// permission checks); this is presentation.

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  const [canViewAllIssues, canViewDiscussions, canViewTracker] = user
    ? await Promise.all([
        hasPermission(user, "issue:view_all"),
        hasPermission(user, "discussion:view"),
        // tracker:view — role 'admin' only. An Assignee resolves to false and
        // never sees the link; /dashboard/tracker re-checks the same
        // permission server-side, so this is presentation, not the guard.
        hasPermission(user, "tracker:view"),
      ])
    : [false, false, false];

  // Header name, by role:
  //   Super Admin (issue:view_all) -> nothing. No name, no role badge, date only.
  //   Assignee                     -> their assignment_users.assignee_name,
  //                                   resolved through the login link
  //                                   (management_users.user_id ->
  //                                   assignment_users.user_id). Never
  //                                   management_users.display_name, and
  //                                   never issue_staff / "Raised By".
  //
  // A staff login with no valid assignee link resolves to null and simply
  // shows no name — nothing is invented or substituted.
  const headerName =
    user && !canViewAllIssues ? ((await findAssigneeForUser(user.userId))?.assigneeName ?? null) : null;

  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <AppHeader displayName={headerName} />

      <div className="flex flex-1 min-h-0">
        {/* Super Admin's label is unchanged ("Issues"). The Assignee's was
            renamed from "My Issues" to "Assigned Issues" so the sidebar, the
            page heading, and the table all use one name for one thing. */}
        <AppSidebar
          showDiscussions={canViewDiscussions}
          showTracker={canViewTracker}
          // ASSIGNEE ONLY: signed in, and NOT a holder of issue:view_all.
          // False for the Super Admin, so their sidebar is unchanged.
          showAccountSettings={user !== null && !canViewAllIssues}
          issuesLabel={canViewAllIssues ? "Issues" : "Assigned Issues"}
        />

        <main className="flex-1 overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-950">
          {children}
        </main>
      </div>
    </div>
  );
}
