"use client";

import { useActionState, useState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/access/accountSettings";
import { primaryButtonClassName } from "@/components/common/formStyles";
import {
  changePasswordAction,
  type AccountSettingsState,
} from "@/app/dashboard/account-settings/actions";

// ASSIGNEE PORTAL — the SECURITY card.
//
// The three inputs are type="password" with no defaultValue, so no password
// is ever placed in the rendered HTML. The submitted values go straight to
// the Server Action and are never held in component state, never echoed back
// in an error, and never written to the URL (the form posts, it does not
// navigate).
//
// The fields are cleared after a confirmed success by remounting them with a
// changed key — "adjust state during render" from a server-supplied signal,
// the same technique components/issues/IssueProgressUpdateForm.tsx uses to
// clear its textarea. No effect, and no reference to the values themselves.

const initialState: AccountSettingsState = {};

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 disabled:opacity-60";
const labelClassName =
  "block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5";
const hintClassName = "mt-1 text-xs text-neutral-400 dark:text-neutral-500";

export default function SecurityForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  // Remount (and therefore clear) the password inputs once the server
  // confirms a change landed.
  const [lastMessage, setLastMessage] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  if (state.message && state.message !== lastMessage) {
    setLastMessage(state.message);
    setFormKey((key) => key + 1);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="currentPassword" className={labelClassName}>
          Current Password
        </label>
        <input
          key={`current-${formKey}`}
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          disabled={pending}
          className={inputClassName}
        />
        <p className={hintClassName}>Required before your password can be changed.</p>
      </div>

      <div>
        <label htmlFor="newPassword" className={labelClassName}>
          New Password
        </label>
        <input
          key={`new-${formKey}`}
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          disabled={pending}
          className={inputClassName}
        />
        <p className={hintClassName}>At least {PASSWORD_MIN_LENGTH} characters.</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelClassName}>
          Confirm New Password
        </label>
        <input
          key={`confirm-${formKey}`}
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          disabled={pending}
          className={inputClassName}
        />
      </div>

      <div>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? "Changing…" : "Change Password"}
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-xs text-green-600 dark:text-green-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
