"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { isValidIssueId, updateIssueDetails, type IssuePriority } from "@/lib/queries/issues";

export interface EditIssueState {
  error?: string;
}

const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

/** Same limits app/dashboard/issues/new/actions.ts uses for the same fields —
 *  the columns are TEXT, so these are guards against a runaway paste, not
 *  schema requirements. */
const MAX_TEXT = 20_000;
const MAX_SHORT_TEXT = 200;

function readText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Updates one Issue's normal fields: Title, Description, Domain, Priority,
 * and Fix & Action Required.
 *
 * ── AUTHORIZATION ───────────────────────────────────────────────────────────
 * Requires an authenticated session plus `issue:edit` — Super Admin only.
 * Checked before any client-supplied field is read, and re-checked here
 * independently of whatever the Edit page/button chose to render — hiding
 * the button is defense in depth, not the guard.
 *
 * ── WHAT CANNOT BE EDITED ────────────────────────────────────────────────────
 * issue_id, created_date/created_at, status, assignment, and every history/
 * audit table are untouched — this action never reads a form key for any of
 * them, and updateIssueDetails() only ever writes the five columns above.
 */
export async function updateIssueDetailsAction(
  _prevState: EditIssueState,
  formData: FormData
): Promise<EditIssueState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to edit issues." };
  }
  if (!(await hasPermission(user, "issue:edit"))) {
    return { error: "You do not have permission to edit issues." };
  }

  const issueId = readText(formData, "issueId");
  if (!issueId || !isValidIssueId(issueId)) {
    return { error: "Invalid issue ID." };
  }

  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const category = readText(formData, "category");
  const priorityRaw = readText(formData, "priority");
  const resolution = readText(formData, "resolution");

  if (!title || !description || !category) {
    return { error: "Title, Domain, and Description are all required." };
  }
  if (title.length > MAX_SHORT_TEXT) {
    return { error: `Title must be ${MAX_SHORT_TEXT} characters or fewer.` };
  }
  if (category.length > 50) {
    return { error: "Domain must be 50 characters or fewer." };
  }
  if (description.length > MAX_TEXT || resolution.length > MAX_TEXT) {
    return { error: "Description and Fix & Action Required must be 20,000 characters or fewer." };
  }

  const priority = VALID_PRIORITIES.includes(priorityRaw as IssuePriority)
    ? (priorityRaw as IssuePriority)
    : null;

  let updated: boolean;
  try {
    updated = await updateIssueDetails(issueId, {
      title,
      description,
      category,
      priority,
      resolution: resolution || null,
    });
  } catch (error) {
    console.error(`[dashboard/issues/${issueId}/edit] failed to update issue:`, error);
    return { error: "Could not save your changes. Please try again." };
  }

  if (!updated) {
    return { error: "This issue no longer exists or has been deleted, so it cannot be edited." };
  }

  revalidatePath(`/dashboard/issues/${issueId}`);
  revalidatePath("/dashboard/issues");
  redirect(`/dashboard/issues/${issueId}`);
}
