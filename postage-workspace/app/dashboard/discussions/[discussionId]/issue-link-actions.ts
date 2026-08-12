"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getIssueAccessScope, hasPermission } from "@/lib/auth";
import {
  createIssueForDiscussion,
  DiscussionNotFoundError,
  InvalidIssueError,
  linkExistingIssueToDiscussion,
  markDiscussionDiscussionOnly,
  markDiscussionNewIssueRequired,
} from "@/lib/queries/discussions";
import { InvalidStaffError, listIssues, type IssueListItem, type IssuePriority } from "@/lib/queries/issues";

// Discussion-level Issue linking Server Actions — mirrors
// app/dashboard/discussions/[discussionId]/points-actions.ts's
// issue-linking actions exactly, just operating on the Discussion itself
// (migration/008_discussion_groups.sql's discussions.issue_link_type/
// linked_issue_id) rather than one of its points. Same permission
// (discussion:link_issue), same "search existing Issues first" flow, same
// reuse of the existing createIssue() — no second Issue-creation mechanism.

export interface DiscussionIssueLinkState {
  error?: string;
  message?: string;
}

async function requireLinkIssue() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in." } as const;
  }
  if (!(await hasPermission(user, "discussion:link_issue"))) {
    return { error: "You do not have permission to link or create Issues from a discussion." } as const;
  }
  return { user } as const;
}

export async function searchIssuesForDiscussionLinkingAction(searchTerm: string): Promise<IssueListItem[]> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return [];

  const trimmed = searchTerm.trim();
  if (!trimmed) return [];

  // Scoped to the caller, like every other Issue read. In practice only
  // admin/management reach this line (discussion:link_issue), and both hold
  // issue:view_all, so the scope resolves to "all" and the search behaves
  // exactly as before. Passing the real scope rather than hardcoding "all"
  // means this search can never become a way to read Issues that the caller
  // is not otherwise allowed to see.
  const scope = await getIssueAccessScope(auth.user);
  const result = await listIssues(scope, { search: trimmed, pageSize: 10 });
  return result.issues;
}

export async function linkIssueToDiscussionAction(
  _prevState: DiscussionIssueLinkState,
  formData: FormData
): Promise<DiscussionIssueLinkState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const issueId = String(formData.get("issueId") ?? "").trim();
  if (!discussionId || !issueId) {
    return { error: "Select an existing Issue to link." };
  }

  try {
    await linkExistingIssueToDiscussion(discussionId, issueId);
  } catch (error) {
    if (error instanceof InvalidIssueError || error instanceof DiscussionNotFoundError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to link issue:`, error);
    return { error: "Could not link this Issue. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: `Linked to ${issueId}.` };
}

export async function markDiscussionNewIssueRequiredAction(
  _prevState: DiscussionIssueLinkState,
  formData: FormData
): Promise<DiscussionIssueLinkState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  if (!discussionId) return { error: "Invalid request." };

  try {
    await markDiscussionNewIssueRequired(discussionId);
  } catch (error) {
    console.error(`[dashboard/discussions/${discussionId}] failed to flag discussion:`, error);
    return { error: "Could not update this discussion. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Flagged as needing a new Issue." };
}

export async function markDiscussionDiscussionOnlyAction(
  _prevState: DiscussionIssueLinkState,
  formData: FormData
): Promise<DiscussionIssueLinkState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  if (!discussionId) return { error: "Invalid request." };

  try {
    await markDiscussionDiscussionOnly(discussionId);
  } catch (error) {
    console.error(`[dashboard/discussions/${discussionId}] failed to update discussion:`, error);
    return { error: "Could not update this discussion. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  return { message: "Set back to discussion-only." };
}

const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

export async function createIssueForDiscussionAction(
  _prevState: DiscussionIssueLinkState,
  formData: FormData
): Promise<DiscussionIssueLinkState> {
  const auth = await requireLinkIssue();
  if ("error" in auth) return { error: auth.error };

  const discussionId = String(formData.get("discussionId") ?? "").trim();
  const staffCode = String(formData.get("staffCode") ?? "").trim();
  const title = String(formData.get("issueTitle") ?? "").trim();
  const description = String(formData.get("issueDescription") ?? "").trim();
  const category = String(formData.get("issueCategory") ?? "").trim();
  const priorityRaw = String(formData.get("issuePriority") ?? "").trim();

  if (!discussionId || !staffCode || !title || !description || !category) {
    return { error: "Staff, title, description, and category are all required to create an Issue." };
  }

  const priority = VALID_PRIORITIES.includes(priorityRaw as IssuePriority) ? (priorityRaw as IssuePriority) : null;

  let issueId: string;
  try {
    issueId = await createIssueForDiscussion(discussionId, { staffCode, title, description, category, priority });
  } catch (error) {
    if (error instanceof InvalidStaffError) {
      return { error: error.message };
    }
    console.error(`[dashboard/discussions/${discussionId}] failed to create issue:`, error);
    return { error: "Could not create this Issue. Please try again." };
  }

  revalidatePath(`/dashboard/discussions/${discussionId}`);
  revalidatePath("/dashboard/issues");
  return { message: `Created and linked ${issueId}.` };
}
