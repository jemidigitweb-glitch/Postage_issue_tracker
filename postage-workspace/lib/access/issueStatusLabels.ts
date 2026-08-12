// The exact wording the Assignee portal shows for Issue statuses.
//
// DELIBERATELY has no `server-only` import, no `next/*` import and no
// database import — same discipline as the rest of lib/access/*, so the
// wording is unit-testable (tests/issueStatusLabels.test.ts) without
// rendering a Client Component that pulls in a Server Action.
//
// ── WHY THE WORDING LIVES HERE ──────────────────────────────────────────────
// It was previously inline in the status control, alongside a second map of
// explanatory sentences that got appended to every option ("Not Solved —
// Work not started"). The approved wording is the status NAME and nothing
// else, so the suffix map is gone entirely rather than merely unused: there
// is no longer anything to accidentally re-append.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
// ASSIGNEE PORTAL ONLY. The Super Admin's surfaces render the raw database
// values (RED / AMBER / GREEN) through components/issues/IssueStatusBadge and
// their own <select> options; none of them import this module, so their
// wording is untouched.

import type { IssueStatusValue } from "./issueWorkflow";
import { assigneeStatusOptions } from "./issueWorkflow";

/** The only text shown for a status in the Assignee portal. */
export const ASSIGNEE_STATUS_LABELS: Readonly<Record<IssueStatusValue, string>> = {
  RED: "Not Solved",
  AMBER: "Partially Solved",
  GREEN: "Completely Solved",
};

/** Heading above the status-change control. Rendered through an
 *  uppercase-tracking class, so it displays as "CHANGE STATUS". */
export const CHANGE_STATUS_LABEL = "Change status";

/** Heading above the current-status badge. Displays as "STATUS". */
export const CURRENT_STATUS_LABEL = "Status";

/** Shown by the dropdown until the user picks something. */
export const STATUS_PLACEHOLDER = "Select status";

export interface AssigneeStatusOption {
  value: IssueStatusValue;
  label: string;
}

/**
 * The options the Assignee's status dropdown offers from `fromStatus`, as
 * {value, label} pairs ready to render.
 *
 * The SET comes from assigneeStatusOptions() — the same pure matrix
 * classifyAssigneeTransition() enforces inside the status transaction — so
 * the dropdown can never offer a transition the server would refuse:
 *
 *   RED   -> Partially Solved
 *   AMBER -> Not Solved, Completely Solved
 *   GREEN -> (none; GREEN is final, and the control is not rendered at all)
 *
 * Each label is exactly ASSIGNEE_STATUS_LABELS[value]. Nothing is appended.
 */
export function assigneeStatusOptionList(
  fromStatus: IssueStatusValue
): readonly AssigneeStatusOption[] {
  return assigneeStatusOptions(fromStatus).map((value) => ({
    value,
    label: ASSIGNEE_STATUS_LABELS[value],
  }));
}
