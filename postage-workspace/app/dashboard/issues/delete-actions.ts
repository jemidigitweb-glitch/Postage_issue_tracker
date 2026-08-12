"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { softDeleteIssues } from "@/lib/queries/issues";

export interface DeleteState {
  error?: string;
  message?: string;
}

/**
 * Bulk soft-delete from the issue list (checkbox selection + Delete button).
 *
 * SECURITY (Stage 3): before this fix, this action checked only that a
 * session existed — any authenticated user could soft-delete any Issue by
 * POSTing arbitrary issue_ids straight at the action, with no permission
 * check of any kind. Deletion now requires "issue:delete", which only the
 * Super Admin (role 'admin') holds. Hiding the button is not the guard —
 * this check is.
 */
export async function softDeleteIssuesAction(
  _prevState: DeleteState,
  formData: FormData
): Promise<DeleteState> {
  // Authorize BEFORE looking at any client-supplied field, so an
  // unauthorized caller can never learn anything from input validation
  // ordering.
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to delete issues." };
  }
  if (!(await hasPermission(user, "issue:delete"))) {
    return { error: "You do not have permission to delete issues." };
  }

  const issueIds = formData.getAll("issueIds").map(String).filter(Boolean);

  if (issueIds.length === 0) {
    return { error: "Select at least one issue to delete." };
  }

  let updatedIds: string[];
  try {
    updatedIds = await softDeleteIssues(issueIds, user.userId);
  } catch (error) {
    console.error("[dashboard/issues] failed to soft-delete issues:", error);
    return { error: "Could not delete the selected issues. Please try again." };
  }

  revalidatePath("/dashboard/issues");
  return {
    message: updatedIds.length === 1 ? `Deleted ${updatedIds[0]}.` : `Deleted ${updatedIds.length} issues.`,
  };
}
