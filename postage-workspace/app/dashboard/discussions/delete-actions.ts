"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { softDeleteDiscussion } from "@/lib/queries/discussions";

export interface DeleteDiscussionState {
  error?: string;
  message?: string;
}

/**
 * Soft-deletes one Discussion (sets deleted_at/deleted_by — see
 * lib/queries/discussions.ts's softDeleteDiscussion()). No row is ever
 * physically removed: discussion_points, discussion_participants,
 * discussion_comments, and discussion_status_history all keep referencing
 * the same discussion_id and are left completely untouched, so nothing
 * becomes orphaned. Never touches issue_tracking.issues — a linked Issue on
 * one of this Discussion's points is unaffected.
 *
 * Server-side authorization is the actual guard here (not just a hidden
 * button): requires "discussion:delete", which only management and admin
 * hold — see lib/auth.ts's ROLE_PERMISSIONS. A staff-role caller hitting
 * this action directly (bypassing the UI) is rejected identically.
 */
export async function softDeleteDiscussionAction(
  _prevState: DeleteDiscussionState,
  formData: FormData
): Promise<DeleteDiscussionState> {
  const discussionId = String(formData.get("discussionId") ?? "").trim();
  if (!discussionId) {
    return { error: "Invalid discussion." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to delete a discussion." };
  }
  if (!(await hasPermission(user, "discussion:delete"))) {
    return { error: "You do not have permission to delete discussions." };
  }

  let deleted: boolean;
  try {
    deleted = await softDeleteDiscussion(discussionId, user.userId);
  } catch (error) {
    console.error(`[dashboard/discussions] failed to delete ${discussionId}:`, error);
    return { error: "Could not delete this discussion. Please try again." };
  }

  if (!deleted) {
    return { error: "That discussion was not found, or has already been deleted." };
  }

  revalidatePath("/dashboard/discussions");
  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: `Deleted ${discussionId}.` };
}
