"use client";

import { useActionState } from "react";

import { formatZonedDate } from "@/lib/datetime";
import type { AssignmentUser } from "@/lib/queries/assignmentUsers";
import { assignIssuesAction, type AssignBulkState } from "@/app/dashboard/issues/assign-actions";

const initialState: AssignBulkState = {};

// A genuine timestamp shown as a bare date — converted to Asia/Colombo so a
// late-evening UTC stamp shows the Sri Lankan calendar day, not the one before.
function formatIsoTimestampAsDate(isoTimestamp: string): string {
  return formatZonedDate(isoTimestamp);
}

// An issue can only be assigned once — there is no reassignment from the
// UI. Once currentAssigneeId is set, the Assign form is not rendered at
// all (not just disabled), and the original assignee/date is shown
// instead. The server action (assign-actions.ts) enforces this
// independently either way.
export default function AssignmentPanel({
  issueId,
  assignmentUsers,
  currentAssigneeId,
  currentAssigneeName,
  currentAssignedAt,
}: {
  issueId: string;
  assignmentUsers: AssignmentUser[];
  currentAssigneeId: number | null;
  currentAssigneeName: string | null;
  currentAssignedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(assignIssuesAction, initialState);
  const isAssigned = currentAssigneeId !== null;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Assignment
      </h2>

      <p className="text-sm text-neutral-800 dark:text-neutral-200 mb-4">
        {isAssigned ? (
          <>
            👤 Assigned to <span className="font-semibold">{currentAssigneeName}</span>
            {currentAssignedAt && (
              <span className="text-neutral-500 dark:text-neutral-400">
                {" "}
                on 📅 {formatIsoTimestampAsDate(currentAssignedAt)}
              </span>
            )}
          </>
        ) : (
          "Not yet assigned."
        )}
      </p>

      {isAssigned ? null : (
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="issueIds" value={issueId} />
          <div className="flex flex-col gap-1">
            <label htmlFor="assigneeId" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Assign to
            </label>
            <select
              id="assigneeId"
              name="assigneeId"
              defaultValue=""
              required
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200"
            >
              <option value="" disabled>
                Select…
              </option>
              {assignmentUsers.map((user) => (
                <option key={user.assigneeId} value={user.assigneeId}>
                  {user.assigneeName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            {pending ? "Saving…" : "Assign"}
          </button>
        </form>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400 mt-3">
          {state.message}
        </p>
      )}
    </div>
  );
}
