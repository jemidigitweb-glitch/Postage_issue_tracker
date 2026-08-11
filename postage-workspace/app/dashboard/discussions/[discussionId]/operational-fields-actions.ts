"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import {
  DiscussionNotFoundError,
  DiscussionValidationError,
  updateDiscussionOperationalFields,
} from "@/lib/queries/discussions";

export interface OperationalFieldsState {
  error?: string;
  message?: string;
}

const MAX_DURATION_LENGTH = 100; // matches discussions.duration VARCHAR(100)

/**
 * Saves Duration / Process Started / Process Start Date / Estimated Finish /
 * Actual Finish from the main Discussion panel's inline edit form. Requires
 * discussion:edit — same permission already used for editing participants.
 * All parsing/shape validation happens here; date-ordering and
 * Process-Started-requires-a-date business rules are enforced in
 * lib/queries/discussions.ts's updateDiscussionOperationalFields(), which
 * is the actual write boundary.
 */
export async function updateDiscussionOperationalFieldsAction(
  _prevState: OperationalFieldsState,
  formData: FormData
): Promise<OperationalFieldsState> {
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

  const durationRaw = String(formData.get("duration") ?? "").trim();
  if (durationRaw.length > MAX_DURATION_LENGTH) {
    return { error: `Duration must be ${MAX_DURATION_LENGTH} characters or fewer.` };
  }

  const processStartedRaw = String(formData.get("processStarted") ?? "").trim();
  const processStarted = processStartedRaw === "yes" ? true : processStartedRaw === "no" ? false : null;

  const processStartDateInput = String(formData.get("processStartDate") ?? "").trim();
  const estimatedFinishDateRaw = String(formData.get("estimatedFinishDate") ?? "").trim();
  const actualFinishDateRaw = String(formData.get("actualFinishDate") ?? "").trim();

  try {
    await updateDiscussionOperationalFields({
      discussionId,
      duration: durationRaw || null,
      processStarted,
      processStartDateInput: processStartDateInput || null,
      estimatedFinishDate: estimatedFinishDateRaw || null,
      actualFinishDate: actualFinishDateRaw || null,
    });
  } catch (error) {
    if (error instanceof DiscussionValidationError || error instanceof DiscussionNotFoundError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to update operational fields:`, error);
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Saved." };
}
