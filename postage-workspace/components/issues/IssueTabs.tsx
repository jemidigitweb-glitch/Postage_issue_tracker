import Link from "next/link";

// Plain <Link>-based tabs on the same route (/dashboard/issues?tab=assigned)
// — not a separate page. Server-rendered, no client JS needed.

export default function IssueTabs({ active }: { active: "issues" | "assigned" }) {
  const tabClass = (isActive: boolean) =>
    [
      "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
      isActive
        ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-50"
        : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200",
    ].join(" ");

  return (
    <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-800">
      <Link href="/dashboard/issues" className={tabClass(active === "issues")}>
        Issues
      </Link>
      <Link href="/dashboard/issues?tab=assigned" className={tabClass(active === "assigned")}>
        Assigned Issues
      </Link>
    </div>
  );
}
