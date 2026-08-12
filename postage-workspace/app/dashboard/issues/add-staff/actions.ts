"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { validateAssigneeLogin } from "@/lib/access/assigneeValidation";
import {
  AssigneeAlreadyLinkedError,
  createAssigneeWithLogin,
  DuplicateAssigneeNameError,
  DuplicateEmailError,
  DuplicateUsernameError,
} from "@/lib/queries/assigneeAccounts";
import { createStaff, DuplicateStaffCodeError } from "@/lib/queries/staff";

export interface AddStaffState {
  error?: string;
  success?: string;
}

/** The two kinds of person this form can create.
 *
 *  "staff"    -> RAISED BY. Writes ONLY to issue_tracking.issue_staff. No
 *                login, no email, no username, no password — and never an
 *                ownership source for an Issue. Behaviour unchanged.
 *  "assignee" -> ASSIGNEE. Writes issue_tracking.assignment_users AND a
 *                role='staff' login in issue_tracking.management_users, in
 *                one transaction.
 *
 *  Never both. The branch is chosen from a fixed list, so a tampered form
 *  cannot pick a write path by accident. */
const PERSON_TYPES = ["staff", "assignee"] as const;
type PersonType = (typeof PERSON_TYPES)[number];

/** Same cost factor as scripts/create-first-admin.ts and the login action. */
const BCRYPT_COST = 12;

// Matches the staff_code convention already used across the app (the
// alphanumeric prefix of an issue_id like "ND-001") and the column's own
// VARCHAR(10) limit.
const STAFF_CODE_PATTERN = /^[A-Z0-9]{1,10}$/;
const STAFF_NAME_MAX_LENGTH = 100;

export async function addStaffAction(
  _prevState: AddStaffState,
  formData: FormData
): Promise<AddStaffState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to add people." };
  }
  // Only "admin" (the Super Admin) holds user:manage. This is the guard;
  // hiding the page/button is defense in depth.
  if (!(await hasPermission(user, "user:manage"))) {
    return { error: "You do not have permission to add people." };
  }

  const active = formData.get("active") === "on";

  const rawType = String(formData.get("personType") ?? "staff").trim();
  if (!(PERSON_TYPES as readonly string[]).includes(rawType)) {
    return { error: "Select a valid person type." };
  }
  const personType = rawType as PersonType;

  if (personType === "assignee") {
    return addAssigneeWithLogin(formData, active);
  }

  return addRaisedByStaff(formData, active);
}

/**
 * RAISED BY — unchanged from before Stage 5. Writes exactly one row to
 * issue_tracking.issue_staff. Creates no login, stores no email, no
 * username, and no password.
 */
async function addRaisedByStaff(formData: FormData, active: boolean): Promise<AddStaffState> {
  const staffCode = String(formData.get("staffCode") ?? "").trim().toUpperCase();
  const staffName = String(formData.get("staffName") ?? "").trim();

  if (!staffCode || !STAFF_CODE_PATTERN.test(staffCode)) {
    return { error: "Staff code is required and must be 1-10 letters/numbers (e.g. ND, SA)." };
  }
  if (!staffName) {
    return { error: "Name is required." };
  }
  if (staffName.length > STAFF_NAME_MAX_LENGTH) {
    return { error: `Name must be ${STAFF_NAME_MAX_LENGTH} characters or fewer.` };
  }

  try {
    await createStaff({ staffCode, staffName, active });
  } catch (error) {
    if (error instanceof DuplicateStaffCodeError) {
      return { error: `Staff code ${staffCode} already exists.` };
    }
    console.error("[dashboard/issues/add-staff] failed to create raised-by staff:", error);
    return { error: "Could not save this person. Please try again." };
  }

  revalidatePath("/dashboard/issues");
  revalidatePath("/dashboard/issues/new");
  return { success: `Raised By "${staffName}" (${staffCode}) added successfully.` };
}

/**
 * ASSIGNEE — creates the assignee record and their individual login in ONE
 * transaction (see lib/queries/assigneeAccounts.ts). Either both exist and
 * are linked, or neither does.
 *
 * The password is hashed here, server-side, and only the hash is passed
 * onward. The plaintext is never logged, never returned, never stored, and
 * never written to assignment_users.
 */
async function addAssigneeWithLogin(formData: FormData, active: boolean): Promise<AddStaffState> {
  const validation = validateAssigneeLogin({
    assigneeName: String(formData.get("staffName") ?? ""),
    email: String(formData.get("email") ?? ""),
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!validation.ok) {
    return { error: validation.error };
  }

  const { assigneeName, email, username, password } = validation.value;
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await createAssigneeWithLogin({ assigneeName, email, username, passwordHash, active });
  } catch (error) {
    if (
      error instanceof DuplicateAssigneeNameError ||
      error instanceof DuplicateUsernameError ||
      error instanceof DuplicateEmailError ||
      error instanceof AssigneeAlreadyLinkedError
    ) {
      return { error: error.message };
    }
    // Never surface the raw error — it can carry connection details, and a
    // failed INSERT's parameter list would carry the password hash.
    console.error("[dashboard/issues/add-staff] failed to create assignee account:", error);
    return { error: "Could not create this assignee. Please try again." };
  }

  // Every surface that reads the assignee pool or the account list.
  revalidatePath("/dashboard/issues");
  revalidatePath("/dashboard/issues/[issueId]", "page");
  revalidatePath("/dashboard/issues/add-staff");

  return { success: `Assignee "${assigneeName}" and their login were created successfully.` };
}
