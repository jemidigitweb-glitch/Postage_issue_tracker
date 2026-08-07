"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { softDeleteIssues } from "@/lib/queries/issues";

export interface DeleteState {
  error?: string;
  message?: string;
}

/** Bulk soft-delete from the issue list (checkbox selection + Delete button). */
export async function softDeleteIssuesAction(
  _prevState: DeleteState,
  formData: FormData
): Promise<DeleteState> {
  const issueIds = formData.getAll("issueIds").map(String).filter(Boolean);

  if (issueIds.length === 0) {
    return { error: "Select at least one issue to delete." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to delete issues." };
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
