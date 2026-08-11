"use server";

import { refresh, revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import type { DiscussionStatus } from "@/lib/queries/discussions";
import { DiscussionStatusTransitionError, updateDiscussionStatus } from "@/lib/queries/discussionStatus";

export interface DiscussionStatusActionState {
  error?: string;
  message?: string;
  /**
   * The status actually written, returned so the client panel can show the
   * new value, its colour, and the next allowed transitions immediately —
   * without waiting for the re-rendered server tree to arrive.
   */
  status?: DiscussionStatus;
}

const VALID_STATUSES: readonly DiscussionStatus[] = ["RED", "AMBER", "GREEN"];

/**
 * RED -> AMBER; AMBER -> RED; AMBER -> GREEN only. GREEN is final — no
 * reopen workflow exists for Discussions anymore. Requires
 * discussion:change_status — management and admin only (see lib/auth.ts's
 * ROLE_PERMISSIONS). Every rule (including the transition map itself) is
 * enforced in lib/queries/discussionStatus.ts, not just here — this action
 * cannot be tricked into an invalid transition by omitting a client-side
 * check.
 */
export async function updateDiscussionStatusAction(
  _prevState: DiscussionStatusActionState,
  formData: FormData
): Promise<DiscussionStatusActionState> {
  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const newStatusRaw = String(formData.get("status") ?? "").trim();

  if (!discussionId || !(VALID_STATUSES as readonly string[]).includes(newStatusRaw)) {
    return { error: "Invalid status selection." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to change discussion status." };
  }
  if (!(await hasPermission(user, "discussion:change_status"))) {
    return { error: "You do not have permission to change discussion status." };
  }

  try {
    await updateDiscussionStatus({
      discussionId,
      newStatus: newStatusRaw as DiscussionStatus,
      changedByUserId: user.userId,
    });
  } catch (error) {
    if (error instanceof DiscussionStatusTransitionError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to update status:`, error);
    return { error: "Could not update status. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  revalidatePath("/dashboard/discussions");
  // This page is fully dynamic (auth cookies), so revalidatePath alone only
  // invalidates cached data — it does not hand the already-open client router
  // a re-rendered tree. refresh() does, so the status badge and every other
  // server-rendered field update without a manual browser refresh.
  refresh();
  return { message: `Status updated for ${discussionId}.`, status: newStatusRaw as DiscussionStatus };
}
