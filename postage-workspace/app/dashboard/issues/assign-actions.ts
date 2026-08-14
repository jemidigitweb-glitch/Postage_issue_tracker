"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { assignIssues, unassignIssue } from "@/lib/queries/issueAssignments";

export interface AssignBulkState {
  error?: string;
  message?: string;
}

/** Every surface whose contents depend on who currently holds an Issue: the
 *  Super Admin list, the Assignee's own list (same route, scoped read), and
 *  the Issue Detail page both portals share. Called immediately after every
 *  assignment change, so a reassigned or unassigned Issue leaves the previous
 *  assignee's portal on their next render rather than on a cache expiry. */
function revalidateAssignmentViews(issueId?: string): void {
  revalidatePath("/dashboard/issues");
  revalidatePath("/dashboard/issues/assigned");
  if (issueId) {
    revalidatePath(`/dashboard/issues/${issueId}`);
  }
}

/** Bulk assign/reassign from the issue list (checkbox selection + Assign To dropdown). */
export async function assignIssuesAction(
  _prevState: AssignBulkState,
  formData: FormData
): Promise<AssignBulkState> {
  const issueIds = formData.getAll("issueIds").map(String).filter(Boolean);
  const assigneeIdRaw = String(formData.get("assigneeId") ?? "").trim();
  const assigneeId = Number.parseInt(assigneeIdRaw, 10);

  if (issueIds.length === 0) {
    return { error: "Select at least one issue to assign." };
  }
  if (!assigneeIdRaw || !Number.isFinite(assigneeId) || assigneeId <= 0) {
    return { error: "Select someone to assign these issues to." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to assign issues." };
  }
  // Permission matrix (lib/access/permissions.ts): admin and management hold
  // "issue:assign"; the assignee role ('staff') does not, and so cannot
  // assign, bulk-assign, or reassign — including by POSTing directly at this
  // action with the UI controls hidden. Verified by tests/access.test.ts
  // ("assignee cannot assign"). This is the guard; hiding the dropdown in
  // IssueTable/AssignmentPanel is only defense in depth.
  if (!(await hasPermission(user, "issue:assign"))) {
    return { error: "You do not have permission to assign issues." };
  }

  let assignedIds: string[];
  let reassignedIds: string[];
  let unchangedIds: string[];
  let blockedIds: string[];
  try {
    ({ assignedIds, reassignedIds, unchangedIds, blockedIds } = await assignIssues(
      issueIds,
      assigneeId,
      user.userId
    ));
  } catch (error) {
    console.error("[dashboard/issues] failed to assign issues:", error);
    return { error: "Could not save this assignment. Please try again." };
  }

  revalidateAssignmentViews(issueIds.length === 1 ? issueIds[0] : undefined);

  // An already-assigned Issue is no longer refused: it is reassigned, its
  // previous assignment closed as history. The only remaining no-op is
  // choosing the person who already holds it.
  // Assignment is only open while an Issue is still RED (not started). A
  // blocked Issue is left exactly as it was.
  const blockedNote =
    blockedIds.length > 0
      ? ` ${blockedIds.length} issue${blockedIds.length === 1 ? " was" : "s were"} left unchanged because work has already started.`
      : "";

  const changed = assignedIds.length + reassignedIds.length;
  if (changed === 0) {
    if (blockedIds.length > 0 && unchangedIds.length === 0) {
      return {
        error:
          blockedIds.length === 1
            ? "This issue can no longer be reassigned — work on it has already started."
            : "These issues can no longer be reassigned — work on them has already started.",
      };
    }
    return { message: `Already assigned to this person — nothing changed.${blockedNote}` };
  }

  const parts: string[] = [];
  if (assignedIds.length > 0) {
    parts.push(`Assigned ${assignedIds.length} issue${assignedIds.length === 1 ? "" : "s"}`);
  }
  if (reassignedIds.length > 0) {
    parts.push(`reassigned ${reassignedIds.length} issue${reassignedIds.length === 1 ? "" : "s"}`);
  }
  return { message: `${parts.join(", ")}.${blockedNote}` };
}

/**
 * ISSUE DETAIL — remove the current assignment without replacing it.
 *
 * Authorization is the SAME single permission the assign path uses
 * (issue:assign, held by admin and management, never by the 'staff' assignee
 * role — see lib/access/permissions.ts). No new permission is introduced and
 * no existing one is widened, so an Assignee POSTing directly at this action
 * is refused exactly as they are for assignment.
 *
 * Assignment only: this action does not import or call any status, priority,
 * progress or resolution helper, so nothing about the Issue's workflow or
 * content can change through it.
 */
export async function unassignIssueAction(
  _prevState: AssignBulkState,
  formData: FormData
): Promise<AssignBulkState> {
  const issueId = String(formData.get("issueId") ?? "").trim();
  if (!issueId) {
    return { error: "Select an issue to unassign." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to change assignments." };
  }
  if (!(await hasPermission(user, "issue:assign"))) {
    return { error: "You do not have permission to change assignments." };
  }

  let cleared: boolean;
  let blockedByStatus: boolean;
  try {
    ({ cleared, blockedByStatus } = await unassignIssue(issueId));
  } catch (error) {
    console.error("[dashboard/issues] failed to unassign issue:", error);
    return { error: "Could not remove this assignment. Please try again." };
  }

  if (blockedByStatus) {
    // Nothing was written — the Issue is past RED.
    return { error: "This issue can no longer be unassigned — work on it has already started." };
  }

  revalidateAssignmentViews(issueId);

  return {
    message: cleared ? `${issueId} is now unassigned.` : "This issue was already unassigned.",
  };
}
