import type { DiscussionStatus } from "@/lib/queries/discussions";

// Same real-values-directly convention as components/issues/IssueStatusBadge.tsx.

const STATUS_STYLES: Record<DiscussionStatus, string> = {
  RED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  AMBER: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  GREEN: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function DiscussionStatusBadge({ status }: { status: DiscussionStatus }) {
  return (
    <span
      className={["inline-block px-2 py-0.5 rounded-md text-xs font-medium", STATUS_STYLES[status]].join(" ")}
    >
      {status}
    </span>
  );
}
