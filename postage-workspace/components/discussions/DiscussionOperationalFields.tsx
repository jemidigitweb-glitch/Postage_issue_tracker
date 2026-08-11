"use client";

import { useActionState, useState } from "react";

import {
  updateDiscussionOperationalFieldsAction,
  type OperationalFieldsState,
} from "@/app/dashboard/discussions/[discussionId]/operational-fields-actions";

const initialState: OperationalFieldsState = {};
const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1";

function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) return "Not set";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function tristate(value: boolean | null): string {
  return value === null ? "Not set" : value ? "Yes" : "No";
}

function ReadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
        {label}
      </dt>
      <dd className="text-sm text-neutral-800 dark:text-neutral-200">{children}</dd>
    </div>
  );
}

/**
 * Duration / Process Started / Process Start Date / Estimated Finish /
 * Actual Finish — displayed read-only with an Edit toggle, per the "keep
 * editing compact inside the main information panel" requirement. Saving
 * calls the existing five discussions columns (migration/007) — no schema
 * change, no duplicate columns.
 *
 * Process Start Date: leaving the date input blank on save NEVER clears an
 * already-stored value (see updateDiscussionOperationalFields()'s doc
 * comment) — only typing a different date changes it. The hint text below
 * that field makes this explicit so it doesn't read as a bug.
 */
export default function DiscussionOperationalFields({
  discussionId,
  duration,
  processStarted,
  processStartDate,
  estimatedFinishDate,
  actualFinishDate,
  canEdit,
}: {
  discussionId: string;
  duration: string | null;
  processStarted: boolean | null;
  processStartDate: string | null;
  estimatedFinishDate: string | null;
  actualFinishDate: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateDiscussionOperationalFieldsAction, initialState);
  const [editing, setEditing] = useState(false);

  // Closes the form back to read-only view after a successful save — the
  // page has already revalidated by then, so the read-only view immediately
  // reflects the freshly saved values (clear success feedback without
  // requiring a manual "close" click). Adjusted during render (not an
  // effect) per React's "adjusting state when a prop changes" pattern —
  // mirrors components/issues/IssueTable.tsx's prevIssues reset.
  const [prevMessage, setPrevMessage] = useState(state.message);
  if (state.message !== prevMessage) {
    setPrevMessage(state.message);
    if (state.message) {
      setEditing(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Operational Details
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-5 gap-y-4">
          <ReadField label="Duration">{duration ?? "Not set"}</ReadField>
          <ReadField label="Process Started">{tristate(processStarted)}</ReadField>
          <ReadField label="Process Start Date">{formatIsoDate(processStartDate)}</ReadField>
          <ReadField label="Estimated Finish">{formatIsoDate(estimatedFinishDate)}</ReadField>
          <ReadField label="Actual Finish">{formatIsoDate(actualFinishDate)}</ReadField>
        </dl>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="discussionId" value={discussionId} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className={labelClassName}>Duration</label>
              <input
                name="duration"
                defaultValue={duration ?? ""}
                maxLength={100}
                placeholder="e.g. 1 week, Ongoing"
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>Process Started</label>
              <select
                name="processStarted"
                defaultValue={processStarted === null ? "" : processStarted ? "yes" : "no"}
                className={inputClassName}
              >
                <option value="">Not set</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className={labelClassName}>Process Start Date</label>
              <input type="date" name="processStartDate" defaultValue={processStartDate ?? ""} className={inputClassName} />
              {processStartDate && (
                <p className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-1">
                  Leave blank to keep {formatIsoDate(processStartDate)}.
                </p>
              )}
            </div>
            <div>
              <label className={labelClassName}>Estimated Finish</label>
              <input
                type="date"
                name="estimatedFinishDate"
                defaultValue={estimatedFinishDate ?? ""}
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>Actual Finish</label>
              <input type="date" name="actualFinishDate" defaultValue={actualFinishDate ?? ""} className={inputClassName} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:underline"
            >
              Cancel
            </button>
          </div>

          {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        </form>
      )}

      {!editing && state.message && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400 mt-3">
          {state.message}
        </p>
      )}
    </div>
  );
}
