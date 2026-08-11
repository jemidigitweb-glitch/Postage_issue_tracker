"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { addDiscussionComment, InvalidDiscussionError } from "@/lib/queries/discussionComments";

export interface CommentActionState {
  error?: string;
  message?: string;
}

export async function addDiscussionCommentAction(
  _prevState: CommentActionState,
  formData: FormData
): Promise<CommentActionState> {
  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!discussionId || !body) {
    return { error: "Comment cannot be empty." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to comment." };
  }
  // Permission matrix: staff, management, and admin all hold
  // "discussion:comment" — everyone who can view a Discussion can comment.
  if (!(await hasPermission(user, "discussion:comment"))) {
    return { error: "You do not have permission to comment on discussions." };
  }

  try {
    await addDiscussionComment(discussionId, user.userId, body);
  } catch (error) {
    if (error instanceof InvalidDiscussionError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to add comment:`, error);
    return { error: "Could not save this comment. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Comment added." };
}
