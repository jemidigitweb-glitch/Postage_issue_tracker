import type { IssueStatus } from "@/lib/queries/issues";

// Renders the real database values (RED/AMBER/GREEN) directly rather than
// inventing descriptive labels — per the open mapping question recorded in
// documentation/issue_tracker_application_structure.md, "display the real
// values directly" was the option that requires no unapproved decision.

const STATUS_STYLES: Record<IssueStatus, string> = {
  RED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  AMBER: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  GREEN: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded-md text-xs font-medium",
        STATUS_STYLES[status],
      ].join(" ")}
    >
      {status}
    </span>
  );
}
