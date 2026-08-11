"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import type { DiscussionStatus } from "@/lib/queries/discussions";
import {
  addDiscussionPoint,
  createIssueForPoint,
  InvalidDiscussionError,
  InvalidIssueError,
  linkExistingIssueToPoint,
  markPointDiscussionOnly,
  markPointNewIssueRequired,
  PointStatusTransitionError,
  updateDiscussionPoint,
  updateDiscussionPointStatus,
} from "@/lib/queries/discussionPoints";
import { InvalidStaffError, listIssues, type IssueListItem, type IssuePriority } from "@/lib/queries/issues";

export interface PointActionState {
  error?: string;
  message?: string;
}

function nullableTrim(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str === "" ? null : str;
}

function parseTriBoolean(value: FormDataEntryValue | null): boolean | null {
  const str = String(value ?? "").trim();
  if (str === "yes") return true;
  if (str === "no") return false;
  return null;
}

async function requireManagePoints() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in." } as const;
  }
  if (!(await hasPermission(user, "discussion:manage_points"))) {
    return { error: "You do not have permission to manage discussion points." } as const;
  }
  return { user } as const;
}

async function requireLinkIssue() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in." } as const;
  }
  if (!(await hasPermission(user, "discussion:link_issue"))) {
    return { error: "You do not have permission to link or create Issues from a discussion point." } as const;
  }
  return { user } as const;
}

export async function addPointAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireManagePoints();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!discussionId || !title) {
    return { error: "Discussion and point title are required." };
  }

  try {
    await addDiscussionPoint({
      discussionId,
      title,
      details: nullableTrim(formData.get("details")),
      actionRequired: nullableTrim(formData.get("actionRequired")),
      responsiblePerson: nullableTrim(formData.get("responsiblePerson")),
      domain: nullableTrim(formData.get("domain")),
      actionPlan: nullableTrim(formData.get("actionPlan")),
      implementationProgress: nullableTrim(formData.get("implementationProgress")),
      processStarted: parseTriBoolean(formData.get("processStarted")),
      estimatedFinishDate: nullableTrim(formData.get("estimatedFinishDate")),
    });
  } catch (error) {
    if (error instanceof InvalidDiscussionError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to add point:`, error);
    return { error: "Could not save this discussion point. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Discussion point added." };
}

export async function updatePointAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireManagePoints();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const pointId = Number.parseInt(String(formData.get("pointId") ?? ""), 10);
  const title = String(formData.get("title") ?? "").trim();
  if (!discussionId || !Number.isFinite(pointId) || !title) {
    return { error: "Invalid point update request." };
  }

  try {
    const updated = await updateDiscussionPoint({
      pointId,
      title,
      details: nullableTrim(formData.get("details")),
      actionRequired: nullableTrim(formData.get("actionRequired")),
      responsiblePerson: nullableTrim(formData.get("responsiblePerson")),
      domain: nullableTrim(formData.get("domain")),
      actionPlan: nullableTrim(formData.get("actionPlan")),
      implementationProgress: nullableTrim(formData.get("implementationProgress")),
      processStarted: parseTriBoolean(formData.get("processStarted")),
      estimatedFinishDate: nullableTrim(formData.get("estimatedFinishDate")),
      completedDate: nullableTrim(formData.get("completedDate")),
    });
    if (!updated) {
      return { error: "Discussion point not found." };
    }
  } catch (error) {
    console.error(`[dashboard/discussions/${discussionId}] failed to update point ${pointId}:`, error);
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Discussion point updated." };
}

const VALID_STATUSES: readonly DiscussionStatus[] = ["RED", "AMBER", "GREEN"];

export async function updatePointStatusAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireManagePoints();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const pointId = Number.parseInt(String(formData.get("pointId") ?? ""), 10);
  const newStatusRaw = String(formData.get("status") ?? "").trim();
  const finalOutcome = nullableTrim(formData.get("finalOutcome"));

  if (!discussionId || !Number.isFinite(pointId) || !(VALID_STATUSES as readonly string[]).includes(newStatusRaw)) {
    return { error: "Invalid status selection." };
  }

  try {
    await updateDiscussionPointStatus({
      pointId,
      newStatus: newStatusRaw as DiscussionStatus,
      finalOutcome,
    });
  } catch (error) {
    if (error instanceof PointStatusTransitionError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to update point ${pointId} status:`, error);
    return { error: "Could not update point status. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Point status updated." };
}

export async function searchIssuesForLinkingAction(searchTerm: string): Promise<IssueListItem[]> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return [];

  const trimmed = searchTerm.trim();
  if (!trimmed) return [];

  const result = await listIssues({ search: trimmed, pageSize: 10 });
  return result.issues;
}

export async function linkIssueToPointAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const pointId = Number.parseInt(String(formData.get("pointId") ?? ""), 10);
  const issueId = String(formData.get("issueId") ?? "").trim();

  if (!discussionId || !Number.isFinite(pointId) || !issueId) {
    return { error: "Select an existing Issue to link." };
  }

  try {
    await linkExistingIssueToPoint(pointId, issueId);
  } catch (error) {
    if (error instanceof InvalidIssueError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to link issue to point ${pointId}:`, error);
    return { error: "Could not link this Issue. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: `Linked to ${issueId}.` };
}

export async function markPointNewIssueRequiredAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const pointId = Number.parseInt(String(formData.get("pointId") ?? ""), 10);
  if (!discussionId || !Number.isFinite(pointId)) {
    return { error: "Invalid request." };
  }

  try {
    await markPointNewIssueRequired(pointId);
  } catch (error) {
    console.error(`[dashboard/discussions/${discussionId}] failed to flag point ${pointId}:`, error);
    return { error: "Could not update this point. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Point flagged as needing a new Issue." };
}

export async function markPointDiscussionOnlyAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const pointId = Number.parseInt(String(formData.get("pointId") ?? ""), 10);
  if (!discussionId || !Number.isFinite(pointId)) {
    return { error: "Invalid request." };
  }

  try {
    await markPointDiscussionOnly(pointId);
  } catch (error) {
    console.error(`[dashboard/discussions/${discussionId}] failed to update point ${pointId}:`, error);
    return { error: "Could not update this point. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Point set back to discussion-only." };
}

const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

/**
 * Creates a brand-new Issue from a point flagged 'new_issue_required', by
 * calling the EXISTING lib/queries/issues.ts createIssue() (via
 * lib/queries/discussionPoints.ts's createIssueForPoint()) — no second
 * Issue-creation mechanism. Only reachable when a human has explicitly
 * chosen "New Issue Required" for this point; never automatic.
 */
export async function createIssueForPointAction(
  _prevState: PointActionState,
  formData: FormData
): Promise<PointActionState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const pointId = Number.parseInt(String(formData.get("pointId") ?? ""), 10);
  const staffCode = String(formData.get("staffCode") ?? "").trim();
  const title = String(formData.get("issueTitle") ?? "").trim();
  const description = String(formData.get("issueDescription") ?? "").trim();
  const category = String(formData.get("issueCategory") ?? "").trim();
  const priorityRaw = String(formData.get("issuePriority") ?? "").trim();

  if (!discussionId || !Number.isFinite(pointId) || !staffCode || !title || !description || !category) {
    return { error: "Staff, title, description, and category are all required to create an Issue." };
  }

  const priority = VALID_PRIORITIES.includes(priorityRaw as IssuePriority) ? (priorityRaw as IssuePriority) : null;

  let issueId: string;
  try {
    const result = await createIssueForPoint(pointId, { staffCode, title, description, category, priority });
    issueId = result.issueId;
  } catch (error) {
    if (error instanceof InvalidStaffError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to create issue for point ${pointId}:`, error);
    return { error: "Could not create this Issue. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  revalidatePath("/dashboard/issues");
  return { message: `Created and linked ${issueId}.` };
}
