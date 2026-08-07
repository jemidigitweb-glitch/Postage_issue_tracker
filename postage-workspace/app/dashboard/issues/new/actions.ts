"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createIssue, InvalidStaffError, type IssuePriority } from "@/lib/queries/issues";

export interface NewIssueState {
  error?: string;
}

const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

export async function createIssueAction(
  _prevState: NewIssueState,
  formData: FormData
): Promise<NewIssueState> {
  const staffCode = String(formData.get("staffCode") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "").trim();

  if (!staffCode || !title || !description || !category) {
    return { error: "Staff, title, description, and category are all required." };
  }

  const priority = VALID_PRIORITIES.includes(priorityRaw as IssuePriority)
    ? (priorityRaw as IssuePriority)
    : null;

  let issueId: string;
  try {
    issueId = await createIssue({ staffCode, title, description, category, priority });
  } catch (error) {
    if (error instanceof InvalidStaffError) {
      return { error: error.message };
    }
    console.error("[dashboard/issues/new] failed to create issue:", error);
    return { error: "Could not save this issue. Please try again." };
  }

  revalidatePath("/dashboard/issues");
  redirect(`/dashboard/issues/${issueId}`);
}
