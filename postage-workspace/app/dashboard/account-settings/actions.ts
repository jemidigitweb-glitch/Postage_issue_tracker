"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { validatePasswordChange, validateProfileUpdate } from "@/lib/access/accountSettings";
import {
  DuplicateEmailError,
  DuplicateUsernameError,
} from "@/lib/queries/assigneeAccounts";
import {
  findOwnPasswordHash,
  updateOwnPassword,
  updateOwnProfile,
} from "@/lib/queries/accountSettings";

// ASSIGNEE PORTAL — self-service account actions.
//
// ── OWNERSHIP ───────────────────────────────────────────────────────────────
// The account being edited is ALWAYS the session's own account. Neither
// action reads a user id, an assignee id, or any identity field from the
// form: `authorizeOwnAccount()` resolves it from the signed session cookie
// via getCurrentUser(), and that value is the only id that reaches the query
// layer. A crafted request containing userId/assigneeId/role/active fields
// therefore changes nothing — those names are never read, and the query layer
// has no statement that could apply them.
//
// ── WHO MAY CALL ────────────────────────────────────────────────────────────
// Assignees only. A holder of issue:view_all (the Super Admin) is refused
// here, not merely un-linked in the sidebar, so this stage adds no Super
// Admin capability even to someone who posts the action directly.
//
// ── PASSWORDS ───────────────────────────────────────────────────────────────
// Plaintext exists only as a local variable inside these functions. It is
// never logged, never returned, never revalidated into a cache, and never
// written anywhere — only its bcrypt hash reaches the database. The verified
// current hash is likewise local and is never included in a return value.

export interface AccountSettingsState {
  error?: string;
  message?: string;
}

/** Same cost factor as the login action, add-staff, and
 *  scripts/create-first-admin.ts. */
const BCRYPT_COST = 12;

/** Deliberately identical for "no session", "wrong role" and "row missing":
 *  none of them should tell the caller anything about another account. */
const NOT_YOUR_ACCOUNT = "You do not have permission to change these settings.";

interface OwnAccount {
  userId: number;
}

/**
 * The single authorization gate shared by both actions.
 *
 * Mirrors authorizeStatusWrite() in app/dashboard/issues/status-actions.ts:
 * one place resolves identity, so neither action can proceed on a partially
 * resolved caller.
 */
async function authorizeOwnAccount(): Promise<OwnAccount | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to change your account settings." };
  }

  // Assignee portal only. The Super Admin's portal is untouched by this
  // stage and gets no self-service account page — so the permission that
  // defines "sees everything" is exactly the one refused here.
  if (await hasPermission(user, "issue:view_all")) {
    return { error: NOT_YOUR_ACCOUNT };
  }
  if (!(await hasPermission(user, "issue:view_own_assigned"))) {
    return { error: NOT_YOUR_ACCOUNT };
  }

  return { userId: user.userId };
}

/**
 * Updates the caller's own username and email — nothing else.
 *
 * Full Name, role, assignee_id, user_id, account status, permissions,
 * assigned Issues and Raised By identity are all unreachable from here: the
 * validator has no field for them and the UPDATE statement has no column for
 * them.
 */
export async function updateProfileAction(
  _prevState: AccountSettingsState,
  formData: FormData
): Promise<AccountSettingsState> {
  const auth = await authorizeOwnAccount();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const validation = validateProfileUpdate({
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!validation.ok) {
    return { error: validation.error };
  }

  try {
    const updated = await updateOwnProfile({
      userId: auth.userId,
      username: validation.value.username,
      email: validation.value.email,
    });
    if (!updated) {
      return { error: NOT_YOUR_ACCOUNT };
    }
  } catch (error) {
    if (error instanceof DuplicateUsernameError) {
      return { error: "Username is already in use." };
    }
    if (error instanceof DuplicateEmailError) {
      return { error: "Email address is already in use." };
    }
    // Never surface the raw error: it can carry connection details and the
    // failing statement's parameters.
    console.error("[dashboard/account-settings] profile update failed:", error);
    return { error: "Could not save your changes. Please try again." };
  }

  revalidatePath("/dashboard/account-settings");
  return { message: "Account settings updated successfully." };
}

/**
 * Changes the caller's own password.
 *
 * The current password is required and is verified with bcrypt.compare
 * against the stored hash before anything is written. A wrong current
 * password writes nothing.
 */
export async function changePasswordAction(
  _prevState: AccountSettingsState,
  formData: FormData
): Promise<AccountSettingsState> {
  const auth = await authorizeOwnAccount();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const validation = validatePasswordChange({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!validation.ok) {
    return { error: validation.error };
  }

  try {
    const currentHash = await findOwnPasswordHash(auth.userId);
    if (!currentHash) {
      return { error: NOT_YOUR_ACCOUNT };
    }

    const currentMatches = await bcrypt.compare(validation.value.currentPassword, currentHash);
    if (!currentMatches) {
      // Says which check failed because the caller is already authenticated
      // as this account — there is no account-enumeration risk in telling
      // someone their own current password was wrong, and a generic message
      // here would be actively unhelpful.
      return { error: "Your current password is incorrect." };
    }

    const newPasswordHash = await bcrypt.hash(validation.value.newPassword, BCRYPT_COST);

    const updated = await updateOwnPassword({
      userId: auth.userId,
      expectedCurrentHash: currentHash,
      newPasswordHash,
    });
    if (!updated) {
      // The row changed underneath us (see updateOwnPasswordTx) or is not a
      // 'staff' row. Never overwrite a credential we did not verify.
      return { error: "Your password could not be changed. Please try again." };
    }
  } catch (error) {
    // The caught value is logged, never the passwords — neither the
    // submitted plaintext nor either hash appears in this call.
    console.error("[dashboard/account-settings] password change failed:", error);
    return { error: "Could not change your password. Please try again." };
  }

  // No revalidatePath: nothing displayed on the page derives from the
  // password, and the session cookie is unaffected (it carries only a user
  // id, never a credential), so the caller stays signed in on this device.
  return { message: "Password changed successfully." };
}
