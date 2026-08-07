"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { assignIssues } from "@/lib/queries/issueAssignments";

export interface AssignBulkState {
  error?: string;
  message?: string;
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
  // Permission matrix (documentation/issue_tracker_auth_implementation_plan.md §3):
  // admin and management hold "issue:assign"; staff does not.
  if (!(await hasPermission(user, "issue:assign"))) {
    return { error: "You do not have permission to assign issues." };
  }

  let assignedIds: string[];
  let alreadyAssignedIds: string[];
  try {
    ({ assignedIds, alreadyAssignedIds } = await assignIssues(issueIds, assigneeId, user.userId));
  } catch (error) {
    console.error("[dashboard/issues] failed to assign issues:", error);
    return { error: "Could not save this assignment. Please try again." };
  }

  revalidatePath("/dashboard/issues");
  revalidatePath("/dashboard/issues/assigned");

  // An issue can only be assigned once — reassignment from the UI is not
  // allowed, so any issue that was already assigned is left untouched
  // (its original assignee/date is preserved) and surfaced as a friendly
  // validation message rather than a silent overwrite.
  if (assignedIds.length === 0) {
    return {
      error:
        issueIds.length === 1
          ? "This issue has already been assigned."
          : "These issues have already been assigned.",
    };
  }

  if (alreadyAssignedIds.length > 0) {
    return {
      message: `Assigned ${assignedIds.length} issue${assignedIds.length === 1 ? "" : "s"}. ${
        alreadyAssignedIds.length
      } issue${alreadyAssignedIds.length === 1 ? "" : "s"} already assigned and left unchanged.`,
    };
  }

  return {
    message:
      assignedIds.length === 1
        ? `Assigned ${assignedIds[0]}.`
        : `Assigned ${assignedIds.length} issues.`,
  };
}
