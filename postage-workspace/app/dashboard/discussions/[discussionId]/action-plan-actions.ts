"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { DiscussionNotFoundError, updateDiscussionActionPlan } from "@/lib/queries/discussions";

// Discussion-level Action editing — same permission (discussion:edit) and
// same shape as operational-fields-actions.ts's action, just writing the
// single action_plan column instead. Never touches source_content.

export interface DiscussionActionState {
  error?: string;
  message?: string;
}

export async function updateDiscussionActionAction(
  _prevState: DiscussionActionState,
  formData: FormData
): Promise<DiscussionActionState> {
  const discussionId = String(formData.get("discussionId") ?? "").trim();
  if (!discussionId) {
    return { error: "Invalid request." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to edit this discussion." };
  }
  if (!(await hasPermission(user, "discussion:edit"))) {
    return { error: "You do not have permission to edit this discussion." };
  }

  const actionPlanRaw = String(formData.get("actionPlan") ?? "").trim();

  try {
    await updateDiscussionActionPlan(discussionId, actionPlanRaw || null);
  } catch (error) {
    if (error instanceof DiscussionNotFoundError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to update action:`, error);
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Saved." };
}
