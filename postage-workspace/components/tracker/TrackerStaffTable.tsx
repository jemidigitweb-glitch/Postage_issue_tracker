import Link from "next/link";

import { formatZonedTimestamp } from "@/lib/datetime";
import type { TrackerAssigneeSummary } from "@/lib/queries/tracker";

// SUPER ADMIN TRACKER — Staff Tracking.
//
// One compact row per ACTIVE Assignee. Replaces the per-person card grid (and
// the workload chart that briefly followed it): a table says the same things
// in a fraction of the vertical space, sorts by eye, and matches the rest of
// the application.
//
// Assignee identity is assignment_users.assignee_name throughout.
// issue_tracking.issue_staff is a different concept and never appears here.
//
// Zero-assignment staff are INCLUDED, showing 0 / 0 / 0 / 0 and 0% — the query
// LEFT JOINs and this component has no "hide empty" branch, so "who is free"
// is answerable from the same table as "who is loaded".
//
// Server Component, read-only. The only interactive elements are navigation
// links that set a filter on this same page.

function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// Genuine timestamp — converted to Asia/Colombo for display.
// e.g. "2026-08-12T09:46:00Z" -> "12/08/2026 15:16 Asia/Colombo (UTC+05:30)"
function formatIsoTimestamp(isoTimestamp: string): string {
  return formatZonedTimestamp(isoTimestamp);
}

// ── Compact + sticky header ─────────────────────────────────────────────────
// The header sticks to the top of the SCROLL CONTAINER (the max-height div
// below), so it stays visible while the staff list scrolls under it.
//
// `sticky` is applied to each <th>, not to <thead>: with the collapsed
// border-model Tailwind's preflight sets on tables, a sticky <thead> is
// unreliable across browsers while sticky cells are not. For the same reason
// the header's bottom rule is an inset box-shadow rather than a border —
// a collapsed border on a sticky cell can fail to paint once it detaches.
// The hex values are neutral-100 / neutral-800, matching the divider colour
// used everywhere else in this table.
//
// Padding is py-2 (down from py-3) for a ~34px row, inside the requested
// 32–40px band.
const stickyHeadClassName =
  "sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-950 shadow-[inset_0_-1px_0_#f5f5f5] dark:shadow-[inset_0_-1px_0_#262626]";
const thClassName =
  `${stickyHeadClassName} px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500`;
const numericThClassName = `${thClassName} text-right`;
const numericTdClassName = "px-4 py-2 text-right tabular-nums whitespace-nowrap";

export default function TrackerStaffTable({
  summaries,
  /** The assignee currently filtering the Issue table, so the matching row can
   *  be marked active and its link can toggle the filter off. Raw string from
   *  the URL — compared as a string, never used in a query. */
  activeAssigneeId = "",
}: {
  summaries: TrackerAssigneeSummary[];
  activeAssigneeId?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Staff Tracking
      </h2>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {/* ONE scroll container for BOTH axes: `overflow-auto` keeps the
            horizontal scrolling that narrow screens need, and `max-h`
            introduces the vertical scroll. Sticky header cells position
            against this element. 300px ≈ 8 rows plus the header — enough to
            read most of the team at a glance without the section growing a
            screen-length for every assignee. Nothing is dropped: every active
            assignee is still rendered and reachable by scrolling. */}
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thClassName}>Staff</th>
                <th className={numericThClassName}>Total</th>
                <th className={numericThClassName}>Not Solved</th>
                <th className={numericThClassName}>Partially Solved</th>
                <th className={numericThClassName}>Completely Solved</th>
                <th className={numericThClassName}>Completion</th>
                <th className={`${thClassName} w-32`}>Oldest Open</th>
                <th className={`${thClassName} w-40`}>Last Activity</th>
                <th className={`${thClassName} w-28`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No active assignees.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => {
                  const isActive = activeAssigneeId === String(summary.assigneeId);
                  // Clicking the active row's link clears the filter, so the
                  // same control both applies and removes it. `page` is never
                  // carried, so the Issue table always returns to page 1.
                  const href = isActive
                    ? "/dashboard/tracker"
                    : `/dashboard/tracker?assignee=${summary.assigneeId}`;

                  return (
                    <tr
                      key={summary.assigneeId}
                      className={
                        isActive
                          ? "bg-neutral-50 dark:bg-neutral-800/40"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                      }
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link
                          href={href}
                          className="font-medium text-neutral-800 dark:text-neutral-200 hover:underline"
                        >
                          {summary.assigneeName}
                        </Link>
                      </td>
                      <td className={`${numericTdClassName} font-medium text-neutral-800 dark:text-neutral-200`}>
                        {summary.totalAssigned}
                      </td>
                      <td className={`${numericTdClassName} text-red-700 dark:text-red-400`}>
                        {summary.notSolved}
                      </td>
                      <td className={`${numericTdClassName} text-amber-700 dark:text-amber-400`}>
                        {summary.partiallySolved}
                      </td>
                      <td className={`${numericTdClassName} text-green-700 dark:text-green-400`}>
                        {summary.completelySolved}
                      </td>
                      <td className={`${numericTdClassName} text-neutral-700 dark:text-neutral-300`}>
                        {summary.completionPercent}%
                      </td>
                      <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                        {summary.oldestOpenDate ? (
                          <>
                            {formatIsoDate(summary.oldestOpenDate)}
                            {summary.oldestOpenDays !== null && (
                              <span className="text-neutral-400 dark:text-neutral-600">
                                {" "}
                                · {summary.oldestOpenDays}d
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-600">None open</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                        {summary.lastActivityAt ? (
                          formatIsoTimestamp(summary.lastActivityAt)
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link
                          href={href}
                          className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
                        >
                          {isActive ? "Clear filter" : "View Issues"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
