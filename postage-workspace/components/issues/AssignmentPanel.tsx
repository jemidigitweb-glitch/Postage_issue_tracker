"use client";

import { useActionState, useState } from "react";

import { formatZonedDate } from "@/lib/datetime";
import type { AssignmentUser } from "@/lib/queries/assignmentUsers";
import {
  assignIssuesAction,
  unassignIssueAction,
  type AssignBulkState,
} from "@/app/dashboard/issues/assign-actions";

const initialState: AssignBulkState = {};

/** The two things a Super Admin can do to an assignment that already exists.
 *  "" is the resting state — the panel shows the current assignee and nothing
 *  else until an action is chosen. */
type AssignmentAction = "" | "reassign" | "unassign";

const controlClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200";
const primaryButtonClassName =
  "rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity";
const subtleButtonClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";

// A genuine timestamp shown as a bare date — converted to Asia/Colombo so a
// late-evening UTC stamp shows the Sri Lankan calendar day, not the one before.
function formatIsoTimestampAsDate(isoTimestamp: string): string {
  return formatZonedDate(isoTimestamp);
}

// Assignment can be changed after the fact. An unassigned Issue shows the
// original Assign form; an assigned one shows the current assignee plus a
// small action dropdown (Reassign / Unassign).
//
// Both actions post to Server Actions that re-check issue:assign on their own
// — this component decides what is DRAWN, never what is ALLOWED.
export default function AssignmentPanel({
  issueId,
  issueStatus,
  assignmentUsers,
  currentAssigneeId,
  currentAssigneeName,
  currentAssignedAt,
}: {
  issueId: string;
  /** Assignment may only be changed while the Issue is still RED. Both Server
   *  Actions re-check this against the locked row, so hiding the controls here
   *  is presentation, not the guard. */
  issueStatus: string;
  assignmentUsers: AssignmentUser[];
  currentAssigneeId: number | null;
  currentAssigneeName: string | null;
  currentAssignedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(assignIssuesAction, initialState);
  const [unassignState, unassignFormAction, unassignPending] = useActionState(
    unassignIssueAction,
    initialState
  );
  const [action, setAction] = useState<AssignmentAction>("");
  const isAssigned = currentAssigneeId !== null;

  // Only a not-started Issue may have its assignment changed. Once work has
  // begun (AMBER) or finished (GREEN) every control below is withheld.
  const canChangeAssignment = issueStatus === "RED";

  // A finished action collapses its own form — no effect needed, and an error
  // deliberately leaves the form open so it can be retried or cancelled.
  const showReassign = canChangeAssignment && isAssigned && action === "reassign" && !state.message;
  const showUnassign = canChangeAssignment && isAssigned && action === "unassign" && !unassignState.message;

  // Reassignment targets exclude whoever already holds the Issue: choosing
  // them would be a no-op the server already handles, and offering it invites
  // a pointless round trip.
  const reassignTargets = assignmentUsers.filter((user) => user.assigneeId !== currentAssigneeId);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Assignment
      </h2>

      {/* Current assignment on the left, the small action control on the
          right. Same line on a wide screen, wrapping cleanly on a narrow one. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
        <p className="text-sm text-neutral-800 dark:text-neutral-200">
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

        {isAssigned && canChangeAssignment && (
          <select
            aria-label="Change assignment"
            value={action}
            onChange={(event) => setAction(event.target.value as AssignmentAction)}
            className={`${controlClassName} py-1.5 text-xs`}
          >
            <option value="">Change…</option>
            <option value="reassign">Reassign</option>
            <option value="unassign">Unassign</option>
          </select>
        )}
      </div>

      {showReassign && (
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="issueIds" value={issueId} />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reassignAssigneeId"
              className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              Reassign to
            </label>
            <select
              id="reassignAssigneeId"
              name="assigneeId"
              defaultValue=""
              required
              className={controlClassName}
            >
              <option value="" disabled>
                Select…
              </option>
              {reassignTargets.map((user) => (
                <option key={user.assigneeId} value={user.assigneeId}>
                  {user.assigneeName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pending} className={primaryButtonClassName}>
            {pending ? "Saving…" : "Reassign"}
          </button>
          <button type="button" onClick={() => setAction("")} className={subtleButtonClassName}>
            Cancel
          </button>
        </form>
      )}

      {showUnassign && (
        <form action={unassignFormAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="issueId" value={issueId} />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Remove <span className="font-semibold">{currentAssigneeName}</span> from this Issue? It
            stays here, unassigned.
          </p>
          <button type="submit" disabled={unassignPending} className={primaryButtonClassName}>
            {unassignPending ? "Removing…" : "Unassign"}
          </button>
          <button type="button" onClick={() => setAction("")} className={subtleButtonClassName}>
            Cancel
          </button>
        </form>
      )}

      {/* One calm sentence in place of every control, once work has started. */}
      {!canChangeAssignment && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Work has started on this Issue, so its assignment can no longer be changed.
        </p>
      )}

      {isAssigned || !canChangeAssignment ? null : (
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

      {(state.error ?? unassignState.error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3">
          {state.error ?? unassignState.error}
        </p>
      )}
      {(state.message ?? unassignState.message) && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400 mt-3">
          {state.message ?? unassignState.message}
        </p>
      )}
    </div>
  );
}
