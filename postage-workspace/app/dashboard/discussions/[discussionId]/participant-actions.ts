"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { addDiscussionParticipant, InvalidDiscussionError } from "@/lib/queries/discussionParticipants";

export interface ParticipantActionState {
  error?: string;
  message?: string;
}

export async function addParticipantAction(
  _prevState: ParticipantActionState,
  formData: FormData
): Promise<ParticipantActionState> {
  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const roleTitle = String(formData.get("roleTitle") ?? "").trim() || null;
  const isCoordinator = formData.get("isCoordinator") === "on";

  if (!discussionId || !name) {
    return { error: "Participant name is required." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to add a participant." };
  }
  if (!(await hasPermission(user, "discussion:edit"))) {
    return { error: "You do not have permission to edit this discussion's participants." };
  }

  try {
    await addDiscussionParticipant({ discussionId, name, roleTitle, isCoordinator });
  } catch (error) {
    if (error instanceof InvalidDiscussionError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to add participant:`, error);
    return { error: "Could not save this participant. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: `Added ${name}.` };
}
