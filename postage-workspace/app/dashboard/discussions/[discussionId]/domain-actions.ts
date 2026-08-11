"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import {
  DISCUSSION_DOMAIN_MAX_LENGTH,
  DiscussionNotFoundError,
  DiscussionValidationError,
  updateDiscussionDomain,
} from "@/lib/queries/discussions";

export interface DomainState {
  error?: string;
  message?: string;
}

/**
 * Saves the Discussion's own "Main Domain" (issue_tracking.discussions.domain)
 * from the inline edit control on the individual Discussion page. Requires
 * discussion:edit — the same permission already used for participants and
 * the operational fields form, checked here on the server regardless of
 * whether the client rendered the Edit control.
 *
 * Kept separate from updateDiscussionOperationalFieldsAction so the two
 * forms cannot overwrite each other's fields.
 */
export async function updateDiscussionDomainAction(
  _prevState: DomainState,
  formData: FormData
): Promise<DomainState> {
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

  const domainRaw = String(formData.get("domain") ?? "").trim();
  if (domainRaw.length > DISCUSSION_DOMAIN_MAX_LENGTH) {
    return { error: `Main Domain must be ${DISCUSSION_DOMAIN_MAX_LENGTH} characters or fewer.` };
  }

  try {
    // Empty input clears the domain — unlike Process Start Date, there is no
    // "blank keeps the old value" rule here, so clearing is possible and
    // explicit.
    await updateDiscussionDomain({ discussionId, domain: domainRaw || null });
  } catch (error) {
    if (error instanceof DiscussionValidationError || error instanceof DiscussionNotFoundError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to update domain:`, error);
    return { error: "Could not save the Main Domain. Please try again." };
  }

  // This page shows the new value; the list page's Domain column, Domain
  // filter dropdown (listDiscussionDomains()) and domain sorting all read
  // the same column, so revalidate both.
  revalidatePath(`/dashboard/discussions/${discussionId}`);
  revalidatePath("/dashboard/discussions");

  return { message: "Main Domain saved." };
}
