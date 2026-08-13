"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { addStaffAction, type AddStaffState } from "./actions";

const initialState: AddStaffState = {};

// Two destinations, never both:
//   staff    -> RAISED BY. issue_tracking.issue_staff only. No login.
//   assignee -> ASSIGNEE.  issue_tracking.assignment_users + a role='staff'
//               login in issue_tracking.management_users, one transaction.
// The server action re-validates the type against its own fixed list; the
// selector here only decides which fields to show.
type PersonType = "staff" | "assignee";

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";
const hintClassName = "mt-1 text-xs text-neutral-500 dark:text-neutral-400";

export default function AddStaffForm() {
  const [state, formAction, pending] = useActionState(addStaffAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [personType, setPersonType] = useState<PersonType>("staff");

  const isAssignee = personType === "assignee";

  // After a successful create, return the Type selector to the default.
  // Done as a render-time adjustment (React's "adjusting state when a prop
  // changes" pattern) rather than inside the effect below — setState in an
  // effect body causes a cascading render and is flagged by
  // react-hooks/set-state-in-effect.
  const [lastSuccess, setLastSuccess] = useState<string | undefined>(state.success);
  if (state.success !== lastSuccess) {
    setLastSuccess(state.success);
    if (state.success) {
      setPersonType("staff");
    }
  }

  // Clearing the uncontrolled fields IS an external-system sync (the DOM
  // form element), which is what an effect is for. It also means a typed
  // password does not linger in the DOM after submission.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4 max-w-md">
      <div>
        <label htmlFor="personType" className={labelClassName}>
          Type
        </label>
        <select
          id="personType"
          name="personType"
          value={personType}
          onChange={(event) => setPersonType(event.target.value as PersonType)}
          className={inputClassName}
        >
          <option value="staff">Raised By</option>
          <option value="assignee">Assignee</option>
        </select>
        {isAssignee && (
          <p className={hintClassName}>
            Creates an assignee and their individual login. They can sign in and work only the Issues
            assigned to them.
          </p>
        )}
      </div>

      {/* ── RAISED BY fields ─────────────────────────────────────────────── */}
      {/* Unmounted (not hidden) for assignees so they are neither submitted
          nor blocking `required` validation. */}
      {!isAssignee && (
        <div>
          <label htmlFor="staffCode" className={labelClassName}>
            Staff Code
          </label>
          <input
            id="staffCode"
            name="staffCode"
            type="text"
            required
            maxLength={10}
            placeholder="e.g. ND, SA, ST"
            className={`${inputClassName} uppercase`}
          />
          <p className={hintClassName}>1-10 letters/numbers. Automatically uppercased.</p>
        </div>
      )}

      <div>
        <label htmlFor="staffName" className={labelClassName}>
          Name
        </label>
        <input id="staffName" name="staffName" type="text" required maxLength={100} className={inputClassName} />
        {!isAssignee && (
          <p className={hintClassName}>Shown in the Raised By filter and the New Issue form.</p>
        )}
      </div>

      {/* ── ASSIGNEE login fields ────────────────────────────────────────── */}
      {isAssignee && (
        <>
          <div>
            <label htmlFor="email" className={labelClassName}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={255}
              autoComplete="off"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="username" className={labelClassName}>
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={50}
              autoComplete="off"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="password" className={labelClassName}>
              Password
            </label>
            {/* minLength mirrors PASSWORD_MIN_LENGTH in
                lib/access/assigneeValidation.ts. Client-side it is only a
                convenience; the server re-validates every submission. */}
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className={labelClassName}>
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClassName}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <input
          id="active"
          name="active"
          type="checkbox"
          defaultChecked
          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
        />
        <label htmlFor="active" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Active
        </label>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          {state.success}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
        >
          {pending ? "Adding…" : isAssignee ? "Add Assignee" : "Add Raised By"}
        </button>
      </div>
    </form>
  );
}
