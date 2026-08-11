"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { addStaffAction, type AddStaffState } from "./actions";

const initialState: AddStaffState = {};

// Two destinations, never both:
//   staff    -> issue_tracking.issue_staff       (people who raise issues)
//   assignee -> issue_tracking.assignment_users  (the "Assign to" pool)
// The server action re-validates this against its own fixed list; the
// selector here only decides which fields to show.
type PersonType = "staff" | "assignee";

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";

export default function AddStaffForm() {
  const [state, formAction, pending] = useActionState(addStaffAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [personType, setPersonType] = useState<PersonType>("staff");

  const isAssignee = personType === "assignee";

  // Reset the form after a successful create (fields are uncontrolled, so
  // this is the standard way to clear them — matches the "reset form" and
  // "ready to add another" requirement without needing controlled state).
  // The Type selector is controlled, so it is reset explicitly.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setPersonType("staff");
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
          <option value="staff">Raised By Staff</option>
          <option value="assignee">Assignee</option>
        </select>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {isAssignee
            ? "Saved to the Assign To pool. Appears in the issue table's assign dropdown."
            : "Saved as an issue raiser. Appears in the Raised By filter and New Issue form."}
        </p>
      </div>

      {/* Staff code only applies to issue raisers — assignment_users has no
          such column. Unmounted (not just hidden) for assignees so it is
          neither submitted nor blocking `required` validation. */}
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
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            1-10 letters/numbers. Automatically uppercased. Must be unique.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="staffName" className={labelClassName}>
          {isAssignee ? "Assignee Name" : "Staff Name"}
        </label>
        <input id="staffName" name="staffName" type="text" required maxLength={100} className={inputClassName} />
        {isAssignee && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Must be unique among assignees.
          </p>
        )}
      </div>

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
          {pending ? "Adding…" : isAssignee ? "Add Assignee" : "Add Staff"}
        </button>
      </div>
    </form>
  );
}
