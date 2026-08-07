import type { IssuePriority } from "@/lib/queries/issues";

const PRIORITY_STYLES: Record<IssuePriority, string> = {
  critical: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-semibold",
  high: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  medium: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  low: "bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-500",
};

export default function IssuePriorityBadge({ priority }: { priority: IssuePriority | null }) {
  if (!priority) {
    return <span className="text-xs text-neutral-400 dark:text-neutral-600">—</span>;
  }

  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded-md text-xs capitalize",
        PRIORITY_STYLES[priority],
      ].join(" ")}
    >
      {priority}
    </span>
  );
}
