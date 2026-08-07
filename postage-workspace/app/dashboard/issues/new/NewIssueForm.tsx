"use client";

import { useActionState } from "react";

import type { StaffRecord } from "@/lib/queries/staff";
import { createIssueAction, type NewIssueState } from "./actions";

const initialState: NewIssueState = {};

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";

export default function NewIssueForm({ staff }: { staff: StaffRecord[] }) {
  const [state, formAction, pending] = useActionState(createIssueAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
      <div>
        <label htmlFor="staffCode" className={labelClassName}>
          Staff
        </label>
        <select id="staffCode" name="staffCode" required defaultValue="" className={inputClassName}>
          <option value="" disabled>
            Select staff…
          </option>
          {staff.map((s) => (
            <option key={s.staffCode} value={s.staffCode}>
              {s.staffName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className={labelClassName}>
          Title
        </label>
        <input id="title" name="title" type="text" required maxLength={200} className={inputClassName} />
      </div>

      <div>
        <label htmlFor="category" className={labelClassName}>
          Category
        </label>
        <input
          id="category"
          name="category"
          type="text"
          required
          maxLength={50}
          placeholder="e.g. Booking, Warehouse, Courier"
          className={inputClassName}
        />
      </div>

      <div>
        <label htmlFor="priority" className={labelClassName}>
          Priority
        </label>
        <select id="priority" name="priority" defaultValue="" className={inputClassName}>
          <option value="">None</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div>
        <label htmlFor="description" className={labelClassName}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          className={inputClassName}
        />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        New issues are always created with status <span className="font-semibold">RED</span>.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
        >
          {pending ? "Creating…" : "Create Issue"}
        </button>
      </div>
    </form>
  );
}
