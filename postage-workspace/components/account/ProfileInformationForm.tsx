"use client";

import { useActionState } from "react";

import { primaryButtonClassName } from "@/components/common/formStyles";
import {
  updateProfileAction,
  type AccountSettingsState,
} from "@/app/dashboard/account-settings/actions";

// ASSIGNEE PORTAL — the PROFILE INFORMATION card.
//
// Full Name and Account Status are rendered as READ-ONLY text, not as
// disabled inputs. A disabled input still looks like a field someone tried to
// let you edit, and a `readOnly` one can be re-enabled from devtools and
// submitted. Plain text cannot be submitted at all — and the Server Action
// would ignore those names regardless, since neither is ever read from the
// form.
//
// Feedback is the application's existing inline pattern (role="alert" /
// role="status" paragraphs under the button), exactly as
// components/issues/IssueProgressUpdateForm.tsx does it. No browser alert,
// no toast library — the app has neither.

const initialState: AccountSettingsState = {};

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 disabled:opacity-60";
const labelClassName =
  "block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5";
const hintClassName = "mt-1 text-xs text-neutral-400 dark:text-neutral-500";
const readOnlyValueClassName = "text-sm text-neutral-800 dark:text-neutral-200";

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <span className={labelClassName}>{label}</span>
      <p className={readOnlyValueClassName}>{value}</p>
      <p className={hintClassName}>{hint}</p>
    </div>
  );
}

export default function ProfileInformationForm({
  fullName,
  username,
  email,
  active,
}: {
  /** assignment_users.assignee_name, or null when the login is not linked. */
  fullName: string | null;
  username: string;
  email: string;
  /** management_users.active. */
  active: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ReadOnlyField
        label="Full Name"
        value={fullName ?? "—"}
        hint="Shown in assignment and admin screens. Ask a Super Admin to change it."
      />

      <ReadOnlyField
        label="Account Status"
        value={active ? "Active" : "Inactive"}
        hint="Set by a Super Admin."
      />

      <div>
        <label htmlFor="username" className={labelClassName}>
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          maxLength={50}
          defaultValue={username}
          autoComplete="username"
          disabled={pending}
          className={inputClassName}
        />
        <p className={hintClassName}>Used to sign in. Letters, numbers, dots, underscores, hyphens.</p>
      </div>

      <div>
        <label htmlFor="email" className={labelClassName}>
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={255}
          defaultValue={email}
          autoComplete="email"
          disabled={pending}
          className={inputClassName}
        />
        <p className={hintClassName}>Can also be used to sign in.</p>
      </div>

      <div>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? "Saving…" : "Save Changes"}
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
