// Pure labelling for the Tracker's workflow timeline.
//
// DELIBERATELY has no `server-only` import, no `next/*` import and no database
// import — same discipline as the rest of lib/access/*, so the event naming is
// unit-testable (tests/trackerTimeline.test.ts). `npm test` runs plain tsx and
// cannot load anything under lib/queries/*.
//
// ── WHAT IS AND IS NOT AN EVENT ─────────────────────────────────────────────
// Every timeline entry corresponds to exactly one STORED ROW:
//
//   "created"        issue_tracking.issues                (created_at)
//   "assigned"       issue_tracking.issue_assignments     (assigned_at)
//   "status_change"  issue_tracking.issue_status_history  (changed_at)
//   "note"           issue_tracking.issue_comments        (created_at)
//
// Nothing is synthesised. In particular there is NO separate "Process
// Started", "Work restarted" or "Completed" event: those moments are already
// the status-history rows RED->AMBER, RED->AMBER (again) and ->GREEN, and
// issues.process_started_at / completed_at are written by the very same
// transaction. Emitting them again would double-count one real happening as
// two. Instead the status change is LABELLED with what it means — see
// statusChangeLabel() — and the stamped timestamps are shown in the detail
// page's Workflow / Process Details block.
//
// The same reasoning applies to "Implementation progress updated", "Moved back
// to Not Solved", "Marked Completely Solved" and "Final Resolution recorded":
// each is a real row already, labelled honestly, not a fabricated extra entry.

import type { IssueStatusValue } from "./issueWorkflow";

export type TrackerEventKind = "created" | "assigned" | "status_change" | "note";

/**
 * The human label for a status transition, derived from the stored
 * from_status/to_status pair.
 *
 * `fromStatus` is null only for a history row written before a from-status was
 * recorded; the column is nullable in the schema so it is handled rather than
 * assumed away.
 */
export function statusChangeLabel(
  fromStatus: IssueStatusValue | null,
  toStatus: IssueStatusValue
): string {
  if (toStatus === "GREEN") {
    return "Marked Completely Solved";
  }
  if (toStatus === "AMBER") {
    return fromStatus === "GREEN" ? "Reopened to Partially Solved" : "Work started";
  }
  // toStatus === "RED"
  if (fromStatus === "AMBER" || fromStatus === "GREEN") {
    return "Moved back to Not Solved";
  }
  return "Status set to Not Solved";
}

/** Heading for a timeline entry, by kind. Status changes get the specific
 *  label above; everything else is fixed wording. */
export function eventLabel(
  kind: TrackerEventKind,
  fromStatus: IssueStatusValue | null,
  toStatus: IssueStatusValue | null,
  commentType: string | null
): string {
  switch (kind) {
    case "created":
      return "Issue raised";
    case "assigned":
      return "Assigned";
    case "status_change":
      return toStatus ? statusChangeLabel(fromStatus, toStatus) : "Status changed";
    case "note":
      return commentType === "investigation_note" ? "Progress note added" : "Comment added";
  }
}

/**
 * How the "Performed by" column is filled, and where it legitimately cannot be.
 *
 * issue_tracking.issues has NO created_by column (confirmed against
 * information_schema), so the raising of an Issue has no recorded actor in
 * this schema. The timeline says so rather than substituting the Raised By
 * staff member, who is a different concept: issue_staff records WHO THE ISSUE
 * IS ABOUT / who reported it operationally, not which login wrote the row.
 * Presenting them as the actor would be inventing an audit trail.
 *
 * issue_assignments.assigned_by IS nullable (assignments made before the
 * column was populated), so "assigned" can also legitimately have no actor.
 */
export const UNKNOWN_ACTOR = "—";

export function actorLabel(displayName: string | null): string {
  return displayName?.trim() || UNKNOWN_ACTOR;
}
