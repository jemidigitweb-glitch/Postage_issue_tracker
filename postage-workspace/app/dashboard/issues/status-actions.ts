"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getIssueAccessScope, hasPermission } from "@/lib/auth";
import {
  validateProgressUpdate,
  validateTransitionWorkDetails,
} from "@/lib/access/issueWorkDetails";
import {
  IssueOwnershipError,
  StatusTransitionError,
  updateIssueStatus,
} from "@/lib/queries/issueStatus";
import { recordIssueProgress } from "@/lib/queries/issueWorkProgress";
import { isValidIssueId, type IssueStatus } from "@/lib/queries/issues";

export interface StatusActionState {
  error?: string;
  message?: string;
}

const VALID_STATUSES: readonly IssueStatus[] = ["RED", "AMBER", "GREEN"];

/** Resolved once per action: who is calling, and under what Issue-ownership
 *  restriction their write must run. */
interface WriteAuthorization {
  userId: number;
  /** Null for a holder of issue:change_status_any (Super Admin) — no
   *  ownership precondition. Otherwise the session-derived assignee id,
   *  which the query layer re-verifies inside its transaction. */
  requireAssigneeId: number | null;
}

/**
 * The single authorization gate shared by both actions in this file.
 *
 * Returns a user-safe error string on failure so neither action can
 * accidentally proceed with a partially-resolved identity. The assignee id
 * is ALWAYS resolved from the session — no form field, query parameter, or
 * client value contributes to it.
 */
async function authorizeStatusWrite(): Promise<WriteAuthorization | { error: string }> {
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

  if (canChangeAny) {
    return { userId: user.userId, requireAssigneeId: null };
  }

  const scope = await getIssueAccessScope(user);
  if (scope.kind !== "assignee") {
    // Holds change_status_own_assigned but has no assignee identity — e.g.
    // an unlinked account. Fail closed; never fall through to an
    // unrestricted write.
    return { error: "Issue not found or not assigned to you." };
  }
  return { userId: user.userId, requireAssigneeId: scope.assigneeId };
}

/** Both actions surface the same wording for the same failure classes, and
 *  never leak an internal error to the browser. */
function toActionError(error: unknown, issueId: string, context: string): StatusActionState {
  if (error instanceof IssueOwnershipError) {
    // Same wording whether the Issue belongs to someone else or does not
    // exist — never confirm the existence of another assignee's Issue.
    return { error: "Issue not found or not assigned to you." };
  }
  if (error instanceof StatusTransitionError) {
    return { error: error.message };
  }
  console.error(`[dashboard/issues] ${context} failed for ${issueId}:`, error);
  return { error: "Could not save your changes. Please try again." };
}

/** Revalidates every route that renders this Issue's status or work details,
 *  so the change is visible immediately after the action resolves — no
 *  manual refresh, and no window.location.reload() anywhere in this app. */
function revalidateIssueViews(issueId: string): void {
  revalidatePath("/dashboard/issues");
  revalidatePath(`/dashboard/issues/${issueId}`);
}

/**
 * Status change from an Assigned Issues card or the Issue detail page.
 *
 * Permission model (Stage 3, UNCHANGED by Stage 6):
 *  - issue:change_status_any (Super Admin) — may change any Issue's status.
 *  - issue:change_status_own_assigned (assignee / 'staff') — may change the
 *    status ONLY of an Issue currently assigned to them. Ownership is
 *    resolved from the session (never from the form) and re-verified inside
 *    the update transaction, after the issues row is locked, so it cannot
 *    race a concurrent reassignment.
 *
 * ── WORK DETAILS (Stage 6) ──────────────────────────────────────────────────
 * The transition carries the work behind it:
 *   -> AMBER  requires "Implementation In Progress"
 *   -> GREEN  requires "Implementation Done" AND "Final Resolution"
 *   -> RED    requires nothing (assignee "stop work" — see below)
 * Both are validated here (so the caller gets a precise message) AND again
 * inside the transaction (so a future call site cannot bypass them).
 *
 * ── TWO TRANSITION RULE SETS (Assignee Portal stage) ────────────────────────
 * The Super Admin path is UNCHANGED: forward-only, GREEN terminal, RED ->
 * GREEN still permitted in one step. The assignee path uses the approved
 * matrix instead — RED->AMBER, AMBER->RED, AMBER->GREEN allowed; RED->GREEN
 * and anything out of GREEN blocked. Which one applies is derived from the
 * caller's permissions below and enforced inside the transaction, so hiding
 * a choice in the UI is never the guard.
 *
 * Client-supplied values are never trusted: `status` is checked against the
 * fixed list below, `issueId` is shape-checked and then only ever used as a
 * bind parameter for an ownership-filtered exact-match lookup, and the three
 * text fields are trimmed, length-capped, and never echoed back in an error.
 */
export async function updateIssueStatusAction(
  _prevState: StatusActionState,
  formData: FormData
): Promise<StatusActionState> {
  const auth = await authorizeStatusWrite();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const issueId = String(formData.get("issueId") ?? "").trim();
  const newStatusRaw = String(formData.get("status") ?? "").trim();

  if (!isValidIssueId(issueId) || !(VALID_STATUSES as readonly string[]).includes(newStatusRaw)) {
    return { error: "Invalid status selection." };
  }
  const newStatus = newStatusRaw as IssueStatus;

  const details = validateTransitionWorkDetails(newStatus, {
    implementationProgress: formData.get("implementationProgress")?.toString(),
    implementationDone: formData.get("implementationDone")?.toString(),
    finalResolution: formData.get("finalResolution")?.toString(),
  });
  if (!details.ok) {
    return { error: details.error };
  }

  try {
    await updateIssueStatus({
      issueId,
      newStatus,
      changedByUserId: auth.userId,
      requireAssigneeId: auth.requireAssigneeId,
      work: details.value,
      // Which rule set applies is decided here from the caller's
      // PERMISSIONS, never from the form. requireAssigneeId is non-null
      // exactly when the caller lacks issue:change_status_any, so the two
      // always agree: an assignee gets the assignee matrix, a Super Admin
      // keeps the unrestricted (unchanged) one.
      workflow: auth.requireAssigneeId !== null ? "assignee" : "unrestricted",
    });
  } catch (error) {
    return toActionError(error, issueId, "status update");
  }

  revalidateIssueViews(issueId);
  return { message: `Status updated for ${issueId}.` };
}

/**
 * Adds a progress update to an Issue that is already AMBER, WITHOUT changing
 * its status.
 *
 * Same authorization gate and same ownership guarantees as the status
 * change above — this is not a looser path into the same data. The query
 * layer additionally refuses unless the locked row is AMBER, so this can
 * never be used to record work on an Issue that has not started or on one
 * that is already GREEN.
 *
 * Earlier progress text is not lost: each update is appended to the
 * existing issue_comments log as an 'investigation_note' in the same
 * transaction that refreshes the current value.
 */
export async function recordIssueProgressAction(
  _prevState: StatusActionState,
  formData: FormData
): Promise<StatusActionState> {
  const auth = await authorizeStatusWrite();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const issueId = String(formData.get("issueId") ?? "").trim();
  if (!isValidIssueId(issueId)) {
    return { error: "Invalid issue." };
  }

  const progress = validateProgressUpdate(formData.get("implementationProgress")?.toString());
  if (!progress.ok) {
    return { error: progress.error };
  }

  try {
    await recordIssueProgress({
      issueId,
      implementationProgress: progress.value,
      authorUserId: auth.userId,
      requireAssigneeId: auth.requireAssigneeId,
    });
  } catch (error) {
    return toActionError(error, issueId, "progress update");
  }

  revalidateIssueViews(issueId);
  return { message: "Progress updated." };
}
