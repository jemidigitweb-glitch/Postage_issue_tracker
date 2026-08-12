"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/app/logout/actions";

// Navigation is built from props resolved server-side in DashboardLayout —
// never from a role read on the client. Hiding a link is presentation only;
// each destination enforces its own access server-side (lib/routeGuards.ts
// for admin pages, the Issue access scope for /dashboard/issues).
//
//   Super Admin -> Issues, Discussions, Tracker, Logout
//   Assignee    -> Assigned Issues, Logout
//
// Tracker sits directly after Discussions and is Super Admin only. Its flag
// is a SEPARATE prop from showDiscussions rather than being derived from it,
// because they come from different permissions (discussion:view vs
// tracker:view) and only 'admin' holds the latter — 'management' holds
// discussion:view but must not get Tracker.
export default function AppSidebar({
  showDiscussions,
  showTracker,
  issuesLabel,
}: {
  /** discussion:view — false for an Assignee. */
  showDiscussions: boolean;
  /** tracker:view — true for role 'admin' only. False for an Assignee, so
   *  the link is absent from their sidebar entirely. Hiding it is
   *  presentation; /dashboard/tracker enforces the same permission
   *  server-side and redirects anyone else. */
  showTracker: boolean;
  /** "Issues" for the Super Admin (unchanged), "Assigned Issues" for an
   *  Assignee. Resolved server-side in DashboardLayout — this component
   *  never reads a role. */
  issuesLabel: string;
}) {
  const pathname = usePathname();

  const navItems = [
    { label: issuesLabel, href: "/dashboard/issues" },
    ...(showDiscussions ? [{ label: "Discussions", href: "/dashboard/discussions" }] : []),
    ...(showTracker ? [{ label: "Tracker", href: "/dashboard/tracker" }] : []),
  ];

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-y-auto">
      <nav className="flex flex-col gap-0.5 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50"
                  : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-800 dark:hover:text-neutral-200",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Pinned to the bottom of the sidebar (mt-auto against the aside's
          existing flex-col). Posts to the logout Server Action in
          app/logout/actions.ts, which clears the existing session cookie —
          a plain <form action={...}> so it still works without JS. */}
      <form action={logout} className="mt-auto p-3">
        <button
          type="submit"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          {/* Inline SVG — the project has no icon library dependency. */}
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </form>
    </aside>
  );
}
