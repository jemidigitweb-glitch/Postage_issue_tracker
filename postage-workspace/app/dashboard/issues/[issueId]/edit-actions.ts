"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUser, getIssueAccessScope, hasPermission } from "@/lib/auth";
import { isIssuesOnlyRole } from "@/lib/access/raisedByAccess";
import { getIssueById, isValidIssueId, updateIssueDetails, type IssuePriority } from "@/lib/queries/issues";

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

// ── EDITABLE extra_data FIELDS ──────────────────────────────────────────────
// extra_data is free-form JSONB from the historical intake (member, rootCause,
// whatIsHappening, documentGap, dataLink, and more — shape varies per row).
// EditIssueForm.tsx renders one of these as an editable field ONLY when its
// existing value is a plain string/number/boolean AND its key is not one of
// the exclusions below — images, attachments and intake/tracking metadata
// stay display-only (images/attachments have their own dedicated evidence
// treatment elsewhere; the metadata keys are not meaningful to an editor).
// Kept in exact sync with EditIssueForm.tsx's own EXTRA_DETAIL_EXCLUDED_KEYS.
const EXCLUDED_EXTRA_KEYS = new Set([
  "images",
  "attachments",
  "sourceid",
  "sourcefile",
  "evidencefiles",
  "originalowner",
  "classification",
]);

function normalizeExtraKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Applies any edited extra_data text fields on top of the Issue's EXISTING
 * extra_data, returning a full replacement object (never a partial patch —
 * the caller writes this straight back to the JSONB column).
 *
 * Only fields that were both (a) already primitive-valued and (b) not
 * excluded are ever touched; everything else — images, attachments, nested
 * objects/arrays, and any key this form never rendered an input for — is
 * carried over completely unchanged. A field's ORIGINAL type constrains what
 * the resubmitted value becomes (number/boolean parse back to that type;
 * failing to parse leaves the original value untouched rather than silently
 * corrupting it), so this can never turn a number into a string or invent a
 * new key that did not already exist on the row.
 */
function mergeEditableExtraData(
  existing: Record<string, unknown>,
  formData: FormData
): { extraData: Record<string, unknown>; error?: string } {
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(existing)) {
    if (value === null || value === "" || EXCLUDED_EXTRA_KEYS.has(normalizeExtraKey(key))) {
      continue;
    }
    const isPrimitive = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    if (!isPrimitive) {
      continue;
    }

    const raw = formData.get(`extra__${key}`);
    if (raw === null) {
      continue;
    }
    const submitted = String(raw).trim();
    if (submitted.length > MAX_TEXT) {
      return { extraData: existing, error: `"${key}" must be 20,000 characters or fewer.` };
    }

    if (typeof value === "number") {
      const parsed = Number(submitted);
      merged[key] = Number.isNaN(parsed) ? value : parsed;
    } else if (typeof value === "boolean") {
      const lower = submitted.toLowerCase();
      if (lower === "true") merged[key] = true;
      else if (lower === "false") merged[key] = false;
      // Anything else is left as the original boolean rather than guessed at.
    } else {
      merged[key] = submitted;
    }
  }

  return { extraData: merged };
}

/**
 * Updates one Issue's normal fields: Title, Description, Domain, Priority,
 * and (Super Admin / management only) Fix & Action Required.
 *
 * ── AUTHORIZATION ───────────────────────────────────────────────────────────
 * Requires an authenticated session plus `issue:edit` — held by the Super
 * Admin and by Raised-by-Staff (self-raisers correcting their own submission).
 * Checked before any client-supplied field is read, and re-checked here
 * independently of whatever the Edit page/button chose to render — hiding
 * the button is defense in depth, not the guard.
 *
 * ── SELF-RAISER RESTRICTION ──────────────────────────────────────────────────
 * Same rule createIssueAction has always enforced: Fix & Action Required is a
 * RESOLUTION field, and deciding the fix is management work a self-raiser
 * (role raised_by) holds no permission for. Their submission's `resolution`
 * form value is never read at all — the CURRENT stored value is fetched and
 * passed straight back through unchanged, so this action can never blank out
 * or overwrite a resolution management already wrote, no matter what the
 * form contains. Hiding the field in EditIssueForm is presentation; this is
 * the guard.
 *
 * ── extra_data (Additional details) ─────────────────────────────────────────
 * EditIssueForm.tsx also renders any extra_data field whose EXISTING value is
 * a plain string/number/boolean (Root Cause, What Is Happening, Document Gap,
 * Member, Data Link, etc.) as an editable input — images, attachments and
 * intake/tracking metadata stay display-only. mergeEditableExtraData() below
 * reads only those inputs and writes a full replacement extra_data object
 * that otherwise carries every other key over completely unchanged.
 *
 * ── WHAT CANNOT BE EDITED ────────────────────────────────────────────────────
 * issue_id, created_date/created_at, status, assignment, and every history/
 * audit table are untouched — this action never reads a form key for any of
 * them, and updateIssueDetails() only ever writes the six columns above.
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

  if (!title || !description || !category) {
    return { error: "Title, Domain, and Description are all required." };
  }
  if (title.length > MAX_SHORT_TEXT) {
    return { error: `Title must be ${MAX_SHORT_TEXT} characters or fewer.` };
  }
  if (category.length > 50) {
    return { error: "Domain must be 50 characters or fewer." };
  }
  if (description.length > MAX_TEXT) {
    return { error: "Description must be 20,000 characters or fewer." };
  }

  const priority = VALID_PRIORITIES.includes(priorityRaw as IssuePriority)
    ? (priorityRaw as IssuePriority)
    : null;

  // Fetched unconditionally now: the self-raiser resolution guard below needs
  // it, and so does the extra_data merge (mergeEditableExtraData needs the
  // EXISTING row to know each field's original type and to carry over every
  // key this form never rendered an input for).
  const scope = await getIssueAccessScope(user);
  const existing = await getIssueById(issueId, scope);
  if (!existing) {
    return { error: "This issue no longer exists or has been deleted, so it cannot be edited." };
  }

  const selfRaiser = isIssuesOnlyRole(user.role);
  let resolution: string | null;
  if (selfRaiser) {
    // Never read from the form for this role — resolved from the stored row
    // instead, so a self-raiser's edit can never change it either way.
    resolution = existing.resolution;
  } else {
    const resolutionText = readText(formData, "resolution");
    if (resolutionText.length > MAX_TEXT) {
      return { error: "Fix & Action Required must be 20,000 characters or fewer." };
    }
    resolution = resolutionText || null;
  }

  const { extraData, error: extraDataError } = mergeEditableExtraData(existing.extraData, formData);
  if (extraDataError) {
    return { error: extraDataError };
  }

  let updated: boolean;
  try {
    updated = await updateIssueDetails(issueId, {
      title,
      description,
      category,
      priority,
      resolution,
      extraData,
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
