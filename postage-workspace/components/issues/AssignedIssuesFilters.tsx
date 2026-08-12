"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";

import type { AssignmentUser } from "@/lib/queries/assignmentUsers";

const STATUS_OPTIONS = ["RED", "AMBER", "GREEN"] as const;

const selectClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200";

function submitOnChange(event: ChangeEvent<HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

export default function AssignedIssuesFilters({
  assignmentUsers,
  assigneeId,
  status,
  hasActiveFilters,
  showAssigneeFilter = true,
}: {
  assignmentUsers: AssignmentUser[];
  assigneeId: string;
  status: string;
  hasActiveFilters: boolean;
  /** False for an assignee: they may only ever see their own Issues, so an
   *  "Assigned To" picker would be meaningless. Hiding it is cosmetic — the
   *  server discards any `assignee` value such a user submits regardless
   *  (see app/dashboard/issues/page.tsx and lib/queries/issueAssignments.ts). */
  showAssigneeFilter?: boolean;
}) {
  // Keyed off the current filter values so the form remounts (and its
  // uncontrolled <select> defaultValues re-sync) whenever the URL's filters
  // change via client-side navigation — see IssueFilters.tsx for why this
  // is needed.
  const filterKey = [assigneeId, status].join("|");

  return (
    <form
      key={filterKey}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4"
    >
      {/* Same route as the Issues tab (/dashboard/issues) — this hidden
          field is what keeps the submission on the Assigned Issues tab
          instead of falling back to the default tab. */}
      <input type="hidden" name="tab" value="assigned" />

      {showAssigneeFilter && (
        <div className="flex flex-col gap-1">
          <label htmlFor="assignee" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Assigned To
          </label>
          <select
            id="assignee"
            name="assignee"
            defaultValue={assigneeId}
            onChange={submitOnChange}
            className={selectClassName}
          >
            <option value="">Everyone</option>
            {assignmentUsers.map((user) => (
              <option key={user.assigneeId} value={user.assigneeId}>
                {user.assigneeName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status}
          onChange={submitOnChange}
          className={selectClassName}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <Link
          href="/dashboard/issues?tab=assigned"
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
