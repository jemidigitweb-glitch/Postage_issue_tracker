"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { createStaff, DuplicateStaffCodeError } from "@/lib/queries/staff";

export interface AddStaffState {
  error?: string;
  success?: string;
}

// Matches the staff_code convention already used across the app (the
// alphanumeric prefix of an issue_id like "ND-001" — see
// lib/queries/issues.ts's ISSUE_ID_PATTERN) and the column's own
// VARCHAR(10) limit.
const STAFF_CODE_PATTERN = /^[A-Z0-9]{1,10}$/;
const STAFF_NAME_MAX_LENGTH = 100;

export async function addStaffAction(
  _prevState: AddStaffState,
  formData: FormData
): Promise<AddStaffState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to add staff." };
  }
  // Permission matrix (lib/auth.ts's ROLE_PERMISSIONS): only "admin" holds
  // "user:manage" today, so management and staff are both denied here —
  // this is the mutation-level check; the button is also hidden for
  // non-admins on the Issues page, but that's defense in depth, not the
  // actual guard.
  if (!(await hasPermission(user, "user:manage"))) {
    return { error: "You do not have permission to add staff." };
  }

  const staffCode = String(formData.get("staffCode") ?? "").trim().toUpperCase();
  const staffName = String(formData.get("staffName") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!staffCode || !STAFF_CODE_PATTERN.test(staffCode)) {
    return { error: "Staff code is required and must be 1-10 letters/numbers (e.g. ND, SA)." };
  }
  if (!staffName) {
    return { error: "Staff name is required." };
  }
  if (staffName.length > STAFF_NAME_MAX_LENGTH) {
    return { error: `Staff name must be ${STAFF_NAME_MAX_LENGTH} characters or fewer.` };
  }

  try {
    await createStaff({ staffCode, staffName, active });
  } catch (error) {
    if (error instanceof DuplicateStaffCodeError) {
      return { error: `Staff code ${staffCode} already exists.` };
    }
    // Never surface the raw error (could include connection details) to
    // the browser — log server-side only, show a generic message.
    console.error("[dashboard/issues/add-staff] failed to create staff:", error);
    return { error: "Could not save this staff member. Please try again." };
  }

  // /dashboard/issues/new's staff dropdown and /dashboard/issues's "Raised
  // By" filter both read listStaff() — revalidate both so the new staff
  // member shows up without a redeploy.
  revalidatePath("/dashboard/issues");
  revalidatePath("/dashboard/issues/new");

  return { success: `Staff member "${staffName}" (${staffCode}) added successfully.` };
}
