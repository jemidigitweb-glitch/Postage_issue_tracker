"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [{ label: "Open Issues", href: "/dashboard/issues" }];

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
    </aside>
  );
}
