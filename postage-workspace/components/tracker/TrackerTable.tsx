import Link from "next/link";

import { formatZonedDate, formatZonedTimestamp } from "@/lib/datetime";
import type { TrackerIssueRow } from "@/lib/queries/tracker";
import type { TrackingState } from "@/lib/access/tracker";
import { EyeIcon } from "@/components/discussions/icons";
import SortableHeader, { type SortOrder } from "@/components/common/SortableHeader";
import IssuePriorityBadge from "@/components/issues/IssuePriorityBadge";
import IssueStatusBadge from "@/components/issues/IssueStatusBadge";

// SUPER ADMIN TRACKER — the Issue table.
//
// Visually consistent with components/issues/IssueTable.tsx (same wrapper,
// header, row, badge and spacing classes) and it reuses the same shared
// SortableHeader / IssueStatusBadge / IssuePriorityBadge / EyeIcon pieces —
// but it is a SEPARATE component and neither the Issues table nor the
// Discussions table is touched, so nothing existing can change because of it.
//
// A Server Component: no selection state, no bulk actions, no mutations. The
// Tracker only observes. The one action is View, a plain <Link> to the
// Tracker's own read-only detail page at /dashboard/tracker/[issueId] — the
// Issue ID cell links to the same place. That page shows the full lifecycle
// and workflow history; it is not an editor, and it does not replace
// /dashboard/issues/[issueId], which is still where an Issue is actually
// worked on and is reachable from a link on the Tracker detail page itself.

function formatIsoDate(isoDate: string): string {
  // Already a plain YYYY-MM-DD string from the query layer — no Date object,
  // so there is no local-timezone shift to guard against.
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// A genuine timestamp shown as a bare date — converted to Asia/Colombo so a
// late-evening UTC stamp shows the Sri Lankan calendar day, not the one before.
function formatIsoTimestampAsDate(isoTimestamp: string): string {
  return formatZonedDate(isoTimestamp);
}

// Genuine timestamp — converted to Asia/Colombo for display.
// e.g. "2026-08-12T09:46:00Z" -> "12/08/2026 15:16 Asia/Colombo (UTC+05:30)"
function formatIsoTimestamp(isoTimestamp: string): string {
  return formatZonedTimestamp(isoTimestamp);
}

// Tracking State is a MANAGEMENT signal and is shown ALONGSIDE the real
// Status column, never instead of it. Styling is deliberately quieter than a
// status badge — plain text, one muted tone for the two "needs attention"
// states — so the actual Status stays the louder signal.
const TRACKING_STATE_STYLES: Record<TrackingState, string> = {
  "Not Started": "text-neutral-500 dark:text-neutral-400",
  "In Progress": "text-neutral-800 dark:text-neutral-200",
  Completed: "text-green-700 dark:text-green-400",
  "Returned to Not Solved": "text-amber-700 dark:text-amber-400",
  "No Recent Update": "text-amber-700 dark:text-amber-400",
};

function TrackingStateCell({ state }: { state: TrackingState | null }) {
  if (!state) {
    // The evidence did not classify this Issue. Shown as a dash rather than
    // a guessed state.
    return <span className="text-neutral-400 dark:text-neutral-600">—</span>;
  }
  return <span className={`text-xs font-medium ${TRACKING_STATE_STYLES[state]}`}>{state}</span>;
}

export default function TrackerTable({
  issues,
  sort = "",
  order = "asc",
  baseParams = "",
}: {
  issues: TrackerIssueRow[];
  /** Current sort key/direction from the URL, for the header indicators. */
  sort?: string;
  order?: SortOrder;
  /** Serialized search/filter params carried into each header link. Sort
   *  links drop `page`, so re-sorting returns to page 1. */
  baseParams?: string;
}) {
  const headerParams = new URLSearchParams(baseParams);

  if (issues.length === 0) {
    // Clean empty state — never a fabricated row.
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
              {/* Every sortKey must exist in TRACKER_SORT_COLUMNS
                  (lib/access/tracker.ts) or the server silently falls back to
                  the default order. Actions is deliberately not sortable. */}
              <SortableHeader label="Issue ID" sortKey="issueId" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-32" />
              <SortableHeader label="Title" sortKey="title" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} />
              <SortableHeader label="Assignee" sortKey="assignee" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-36" />
              <SortableHeader label="Status" sortKey="status" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-28" />
              {/* Tracking State is derived, not stored, so it has no sort
                  whitelist entry — filtering it is the supported operation. */}
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-36">
                Tracking State
              </th>
              <SortableHeader label="Priority" sortKey="priority" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-24" />
              <SortableHeader label="Domain" sortKey="domain" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-32" />
              {/* Raised By is deliberately NOT sortable: it is not in the
                  approved sortable list, and there is no whitelist entry for
                  it, so offering a header link would silently fall back to
                  the default order and look broken. */}
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-32">
                Raised By
              </th>
              <SortableHeader label="Date Raised" sortKey="created" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-28" />
              <SortableHeader label="Assigned" sortKey="assigned" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-28" />
              <SortableHeader label="Days Open" sortKey="daysOpen" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-24" />
              <SortableHeader label="Last Activity" sortKey="lastActivity" activeSort={sort} activeOrder={order} basePath="/dashboard/tracker" baseParams={headerParams} widthClassName="w-40" />
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-20">
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
                  <Link
                    href={`/dashboard/tracker/${issue.issueId}`}
                    className="hover:underline hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    {issue.issueId}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-neutral-800 dark:text-neutral-200">{issue.title}</td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {/* assignment_users.assignee_name — the Assignee. */}
                  {issue.assigneeName}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <IssueStatusBadge status={issue.status} />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <TrackingStateCell state={issue.trackingState} />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <IssuePriorityBadge priority={issue.priority} />
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap capitalize">
                  {issue.category}
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {/* issue_staff.staff_name — DISPLAY ONLY. Never ownership. */}
                  {issue.staffName}
                </td>
                <td className="px-5 py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {formatIsoDate(issue.createdDate)}
                </td>
                <td className="px-5 py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {formatIsoTimestampAsDate(issue.assignedAt)}
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap tabular-nums">
                  {issue.daysOpen}
                </td>
                <td className="px-5 py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {issue.lastActivityAt ? formatIsoTimestamp(issue.lastActivityAt) : "—"}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {/* Opens the Tracker's read-only detail page. */}
                    <Link
                      href={`/dashboard/tracker/${issue.issueId}`}
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
