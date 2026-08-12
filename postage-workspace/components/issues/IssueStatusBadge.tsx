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

export default function IssueStatusBadge({
  status,
  /**
   * Optional display text. Defaults to the raw database value, so every
   * existing call site — the Super Admin's Issues table, the Assigned Issues
   * cards, the Assignee's Assigned Issues table — renders exactly the markup
   * it always has.
   *
   * The Assignee's Issue-detail status block passes the workflow wording
   * ("Not Solved" / "Partially Solved" / "Completely Solved") so it can reuse
   * this badge's colours, radius, and typography instead of hand-rolling a
   * second, drifting pill. Only the text differs; the styling is identical.
   */
  label,
}: {
  status: IssueStatus;
  label?: string;
}) {
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded-md text-xs font-medium",
        STATUS_STYLES[status],
      ].join(" ")}
    >
      {label ?? status}
    </span>
  );
}
