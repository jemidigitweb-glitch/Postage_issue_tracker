import Link from "next/link";

import type { AssigneeIssueRow } from "@/lib/queries/issueAssignments";
import { EyeIcon } from "@/components/discussions/icons";
import SortableHeader, { type SortOrder } from "@/components/common/SortableHeader";
import IssuePriorityBadge from "./IssuePriorityBadge";
import IssueStatusBadge from "./IssueStatusBadge";

// ASSIGNEE PORTAL ONLY — the Assigned Issues table that replaces the
// assignee's card list.
//
// Visually consistent with components/issues/IssueTable.tsx (same wrapper,
// header, row, badge and spacing classes) and it reuses the same shared
// SortableHeader / IssueStatusBadge / IssuePriorityBadge / EyeIcon pieces —
// but it is a SEPARATE component and IssueTable.tsx is not touched, so the
// Super Admin table cannot be altered by anything here.
//
// Deliberately a Server Component. Everything IssueTable needs client state
// for — row selection, bulk assign, bulk delete — does not exist on this
// table, so there is no `"use client"`, no useState, and no way for an admin
// control to appear by accident:
//
//   NO selection checkboxes   NO bulk actions   NO Assign / Reassign
//   NO Delete                 NO Add Issue      NO Add Person
//
// Assigned To is plain text (always this assignee's own name) — never a
// picker. Actions holds only View.

function formatCreatedDate(isoDate: string): string {
  // Already a plain YYYY-MM-DD string from the query layer — no Date object,
  // so there is no local-timezone shift to guard against.
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export default function AssigneeIssuesTable({
  issues,
  sort = "",
  order = "asc",
  baseParams = "",
}: {
  issues: AssigneeIssueRow[];
  /** Current sort key/direction from the URL, for the header indicators. */
  sort?: string;
  order?: SortOrder;
  /** Serialized search/filter params carried into each header link. Sort
   *  links drop `page`, so re-sorting returns to page 1. */
  baseParams?: string;
}) {
  const headerParams = new URLSearchParams(baseParams);

  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No assigned issues match the current search and filters.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
              {/* Sortable: Issue ID, Title, Raised By, Domain, Status,
                  Priority, Date Raised. Assigned To is not sortable (it is
                  the same value on every row) and Actions never is. Each
                  sortKey must exist in ASSIGNEE_SORT_COLUMNS in
                  lib/queries/issueAssignments.ts or the server silently falls
                  back to the default order. */}
              <SortableHeader label="Issue ID" sortKey="issueId" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-32" />
              <SortableHeader label="Title" sortKey="title" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} />
              <SortableHeader label="Raised By" sortKey="staff" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-40" />
              <SortableHeader label="Domain" sortKey="domain" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-32" />
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-40">
                Assigned To
              </th>
              <SortableHeader label="Status" sortKey="status" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-32" />
              <SortableHeader label="Priority" sortKey="priority" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-24" />
              <SortableHeader label="Date Raised" sortKey="created" activeSort={sort} activeOrder={order} basePath="/dashboard/issues" baseParams={headerParams} widthClassName="w-28" />
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
                <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {/* Same UX as the Super Admin table: the ID is a link to
                      the one existing full Issue detail page. */}
                  <Link
                    href={`/dashboard/issues/${issue.issueId}`}
                    className="hover:underline hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    {issue.issueId}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-neutral-800 dark:text-neutral-200">{issue.title}</td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {issue.staffName}
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap capitalize">
                  {issue.category}
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {/* Read-only. The query only ever returns this assignee's
                      own current assignments, so this is always their name. */}
                  {issue.assigneeName}
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
                    <Link
                      href={`/dashboard/issues/${issue.issueId}`}
                      title="View issue"
                      aria-label="View issue"
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                    >
                      <EyeIcon />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
