"use client";

import type { FormEvent } from "react";
import { useActionState, useState } from "react";
import Link from "next/link";

import type { IssueListItem } from "@/lib/queries/issues";
import { displayIssueTitle } from "@/lib/access/mobileEvidence";
import type { AssignmentUser } from "@/lib/queries/assignmentUsers";
import { softDeleteIssuesAction, type DeleteState } from "@/app/dashboard/issues/delete-actions";
import { assignIssuesAction, type AssignBulkState } from "@/app/dashboard/issues/assign-actions";
// Shared inline-SVG icon set — the project has no icon library dependency,
// so these live in one place and are reused rather than duplicated. Same
// EyeIcon the Discussions table uses in its Actions column.
import { EyeIcon, PencilIcon } from "@/components/discussions/icons";
import SortableHeader, { type SortOrder } from "@/components/common/SortableHeader";
import IssuePriorityBadge from "./IssuePriorityBadge";
import IssueStatusBadge from "./IssueStatusBadge";

// Styling mirrors components/dashboard/OpenIssuesSummary.tsx's table exactly
// (same border/rounded/divide classes) so the real list slots into the
// existing dashboard look without introducing a new visual pattern.
//
// Two independent <form>s (delete, assign) sit side by side in the toolbar
// — forms can't nest, so the table (with its checkboxes) is rendered
// outside both, and each form re-renders its own hidden `issueIds` inputs
// from the same shared `selected` state whenever it's submitted.

const initialDeleteState: DeleteState = {};
const initialAssignState: AssignBulkState = {};

function formatCreatedDate(isoDate: string): string {
  // isoDate is already a plain YYYY-MM-DD string from the query layer — no
  // Date object involved, so there is no local-timezone shift to guard
  // against here.
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export default function IssueTable({
  issues,
  assignmentUsers,
  canAssign,
  canDelete,
  canEdit,
  sort = "",
  order = "asc",
  baseParams = "",
}: {
  issues: IssueListItem[];
  assignmentUsers: AssignmentUser[];
  /** From the current user's permission check (issue:assign) — admin and
   *  management only. The Assign control is hidden, not just disabled, for
   *  everyone else; the Server Action enforces this independently either way. */
  canAssign: boolean;
  /** From issue:delete — Super Admin and Raised-by-Staff. Same rule: the
   *  Server Action (delete-actions.ts) is the guard; hiding the button is
   *  defense in depth. */
  canDelete: boolean;
  /** From issue:edit — Super Admin and Raised-by-Staff. Same rule:
   *  updateIssueDetailsAction (edit-actions.ts) is the guard; hiding the
   *  Edit link is defense in depth. */
  canEdit: boolean;
  /** Current sort key/direction from the URL, for header indicators. */
  sort?: string;
  order?: SortOrder;
  /** Serialized search/filter params to carry into each header link. */
  baseParams?: string;
}) {
  const headerParams = new URLSearchParams(baseParams);
  // Row checkboxes exist only to feed the bulk assign/delete forms. With
  // neither permission there is nothing to select for, so the whole
  // selection column and toolbar are dropped.
  const showBulkControls = canAssign || canDelete;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    softDeleteIssuesAction,
    initialDeleteState
  );
  const [assignState, assignFormAction, assignPending] = useActionState(
    assignIssuesAction,
    initialAssignState
  );

  // Selection shouldn't survive a filter/page change or a successful
  // delete/assign — all three replace `issues` with a different array
  // reference. Resetting during render (not an effect) per React's
  // "adjusting state when a prop changes" pattern — avoids an extra render.
  const [prevIssues, setPrevIssues] = useState(issues);
  if (issues !== prevIssues) {
    setPrevIssues(issues);
    setSelected(new Set());
  }

  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No issues match the current search and filters.
        </p>
      </div>
    );
  }

  const allSelected = issues.length > 0 && issues.every((issue) => selected.has(issue.issueId));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(issues.map((issue) => issue.issueId)));
  }

  function toggleOne(issueId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    const count = selected.size;
    const message = count === 1 ? `Delete 1 selected issue?` : `Delete ${count} selected issues?`;
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  const hiddenSelectedInputs = Array.from(selected).map((issueId) => (
    <input key={issueId} type="hidden" name="issueIds" value={issueId} />
  ));

  return (
    <div>
      {showBulkControls && (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {selected.size > 0 ? `${selected.size} selected` : "Select issues to assign or delete"}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {canAssign && (
            <form action={assignFormAction} className="flex items-center gap-2">
              {hiddenSelectedInputs}
              <select
                name="assigneeId"
                required
                defaultValue=""
                disabled={selected.size === 0 || assignPending}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 disabled:opacity-40"
              >
                <option value="" disabled>
                  Assign to…
                </option>
                {assignmentUsers.map((user) => (
                  <option key={user.assigneeId} value={user.assigneeId}>
                    {user.assigneeName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={selected.size === 0 || assignPending}
                className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {assignPending ? "Assigning…" : "Assign"}
              </button>
            </form>
          )}

          {canDelete && (
            <form action={deleteFormAction} onSubmit={handleDeleteSubmit}>
              {hiddenSelectedInputs}
              <button
                type="submit"
                disabled={selected.size === 0 || deletePending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deletePending ? "Deleting…" : "Delete Selected"}
              </button>
            </form>
          )}
        </div>
      </div>
      )}

      {assignState.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">
          {assignState.error}
        </p>
      )}
      {assignState.message && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400 mb-3">
          {assignState.message}
        </p>
      )}
      {deleteState.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">
          {deleteState.error}
        </p>
      )}
      {deleteState.message && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400 mb-3">
          {deleteState.message}
        </p>
      )}

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                {showBulkControls && (
                  <th className="px-5 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all issues"
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                    />
                  </th>
                )}
                {/* Every data column is sortable; Actions deliberately is not. */}
                <SortableHeader label="Issue ID" sortKey="issueId" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-32" />
                <SortableHeader label="Title" sortKey="title" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} />
                <SortableHeader label="Staff" sortKey="staff" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-40" />
                <SortableHeader label="Domain" sortKey="domain" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-32" />
                <SortableHeader label="Assigned To" sortKey="assigned" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-40" />
                <SortableHeader label="Status" sortKey="status" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-32" />
                <SortableHeader label="Priority" sortKey="priority" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-24" />
                <SortableHeader label="Created" sortKey="created" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-28" />
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-28">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {issues.map((issue) => (
                <tr
                  key={issue.issueId}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  {showBulkControls && (
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(issue.issueId)}
                        onChange={() => toggleOne(issue.issueId)}
                        aria-label={`Select ${issue.issueId}`}
                        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                      />
                    </td>
                  )}
                  <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    <Link
                      href={`/dashboard/issues/${issue.issueId}`}
                      className="hover:underline hover:text-neutral-800 dark:hover:text-neutral-200"
                    >
                      {issue.issueId}
                    </Link>
                  </td>
                  {/* One line, truncated visually rather than wrapping — and
                      genuinely EMPTY when a Mobile report carried no typed
                      text. No "Untitled" placeholder is ever substituted. */}
                  <td className="px-5 py-3.5 text-neutral-800 dark:text-neutral-200 max-w-xs truncate">
                    <span title={displayIssueTitle(issue.title, issue.description) || undefined}>
                      {displayIssueTitle(issue.title, issue.description)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                    {issue.staffName}
                  </td>
                  <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap capitalize">
                    {issue.category}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {issue.assignedStaffName ?? (
                      <span className="text-neutral-400 dark:text-neutral-600">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <IssueStatusBadge status={issue.status} />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <IssuePriorityBadge priority={issue.priority} />
                  </td>
                  <td className="px-5 py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    {formatCreatedDate(issue.createdDate)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {/* Plain navigation link, deliberately not a <button> —
                          it sits outside both toolbar forms and can never
                          submit the delete/assign actions. */}
                      <Link
                        href={`/dashboard/issues/${issue.issueId}`}
                        title="View issue"
                        aria-label="View issue"
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                      >
                        <EyeIcon />
                      </Link>
                      {/* Plain navigation link, same rationale as View above —
                          sits outside both toolbar forms, can never submit
                          delete/assign. updateIssueDetailsAction re-checks
                          issue:edit independently; this is presentation only. */}
                      {canEdit && (
                        <Link
                          href={`/dashboard/issues/${issue.issueId}/edit`}
                          title="Edit issue"
                          aria-label="Edit issue"
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                        >
                          <PencilIcon />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
