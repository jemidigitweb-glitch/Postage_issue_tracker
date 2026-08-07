"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { StatusTransitionError, updateIssueStatus } from "@/lib/queries/issueStatus";
import type { IssueStatus } from "@/lib/queries/issues";

export interface StatusActionState {
  error?: string;
  message?: string;
}

const VALID_STATUSES: readonly IssueStatus[] = ["RED", "AMBER", "GREEN"];

/**
 * Status change from an Assigned Issues card. Permission model: this app's
 * roles (staff/management/admin, in issue_tracking.management_users) have
 * no login identity linking them to assignment_users (Rajive/Mayurika/Arun/
 * Suman aren't accounts — see migration/005_assignment_users.sql), so "only
 * the assigned staff member" can't be checked as a literal identity match.
 * What IS enforced, from the existing permission table: the caller must
 * hold issue:change_status_own_assigned (staff) or issue:change_status_any
 * (management/admin). There is no reopen path for any role — see
 * lib/queries/issueStatus.ts.
 */
export async function updateIssueStatusAction(
  _prevState: StatusActionState,
  formData: FormData
): Promise<StatusActionState> {
  const issueId = String(formData.get("issueId") ?? "").trim();
  const newStatusRaw = String(formData.get("status") ?? "").trim();

  if (!issueId || !(VALID_STATUSES as readonly string[]).includes(newStatusRaw)) {
    return { error: "Invalid status selection." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to change issue status." };
  }

  const [canChangeAny, canChangeOwn] = await Promise.all([
    hasPermission(user, "issue:change_status_any"),
    hasPermission(user, "issue:change_status_own_assigned"),
  ]);
  if (!canChangeAny && !canChangeOwn) {
    return { error: "You do not have permission to change issue status." };
  }

  try {
    await updateIssueStatus({
      issueId,
      newStatus: newStatusRaw as IssueStatus,
      changedByUserId: user.userId,
    });
  } catch (error) {
    if (error instanceof StatusTransitionError) {
      return { error: error.message };
    }
    console.error(`[dashboard/issues] failed to update status for ${issueId}:`, error);
    return { error: "Could not update status. Please try again." };
  }

  revalidatePath("/dashboard/issues");
  return { message: `Status updated for ${issueId}.` };
}
