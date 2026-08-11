"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/app/logout/actions";

const navItems = [
  { label: "Open Issues", href: "/dashboard/issues" },
  { label: "Discussions", href: "/dashboard/discussions" },
];

export default function AppSidebar() {
  const pathname = usePathname();

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
