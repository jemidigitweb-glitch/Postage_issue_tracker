"use client";

import { useActionState, useState } from "react";

import { addPointAction, type PointActionState } from "@/app/dashboard/discussions/[discussionId]/points-actions";

const initialState: PointActionState = {};
const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-0.5";

export default function AddDiscussionPointForm({ discussionId }: { discussionId: string }) {
  const [state, formAction, pending] = useActionState(addPointAction, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors w-full text-left"
      >
        + Add Discussion Point
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4"
    >
      <input type="hidden" name="discussionId" value={discussionId} />
      <div>
        <label className={labelClassName}>Title</label>
        <input name="title" required className={inputClassName} />
      </div>
      <div>
        <label className={labelClassName}>Details</label>
        <textarea name="details" rows={2} className={inputClassName} />
      </div>
      <div>
        <label className={labelClassName}>Action Required</label>
        <textarea name="actionRequired" rows={2} className={inputClassName} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClassName}>Domain</label>
          <input name="domain" className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName}>Responsible Person/Team</label>
          <input name="responsiblePerson" className={inputClassName} />
        </div>
      </div>
      <div>
        <label className={labelClassName}>Action Plan</label>
        <textarea name="actionPlan" rows={2} className={inputClassName} />
      </div>
      <div>
        <label className={labelClassName}>Implementation / Progress</label>
        <textarea name="implementationProgress" rows={2} className={inputClassName} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClassName}>Process Started</label>
          <select name="processStarted" defaultValue="" className={inputClassName}>
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className={labelClassName}>Estimated Finish</label>
          <input type="date" name="estimatedFinishDate" className={inputClassName} />
        </div>
      </div>

      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}

      <div className="flex items-center gap-2 mt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
        >
          {pending ? "Adding…" : "Add Point"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
