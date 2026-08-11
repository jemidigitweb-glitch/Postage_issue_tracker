import Link from "next/link";

import type { DiscussionListItem } from "@/lib/queries/discussions";
import DeleteDiscussionButton from "./DeleteDiscussionButton";
import DiscussionStatusBadge from "./DiscussionStatusBadge";
import SortableHeader, { type SortOrder } from "@/components/common/SortableHeader";
import { EyeIcon } from "./icons";
import MemberOverflowCapsule from "./MemberOverflowCapsule";

// Mirrors components/issues/IssueTable.tsx's visual conventions (same
// border/rounded/divide classes, same table layout pattern).

function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// The Discussion's OWN meeting_date_start/end columns — deliberately not
// updated_at, and not discussion_groups' dates.
function formatMeetingDate(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  if (start && end && start !== end) return `${formatIsoDate(start)} – ${formatIsoDate(end)}`;
  return formatIsoDate(start ?? end);
}

function ProcessStartedBadge({ processStarted }: { processStarted: boolean | null }) {
  if (processStarted === null) {
    return <span className="text-xs text-neutral-400 dark:text-neutral-600">Not set</span>;
  }
  return (
    <span
      className={
        processStarted
          ? "text-xs font-medium text-green-700 dark:text-green-400"
          : "text-xs font-medium text-neutral-500 dark:text-neutral-400"
      }
    >
      {processStarted ? "Yes" : "No"}
    </span>
  );
}

export default function DiscussionTable({
  discussions,
  canDelete,
  sort = "",
  order = "asc",
  baseParams = "",
}: {
  discussions: DiscussionListItem[];
  /** From the current user's permission check (discussion:delete) —
   *  management and admin only. The Delete control is hidden, not just
   *  disabled, for everyone else; the Server Action enforces this
   *  independently either way. */
  canDelete: boolean;
  /** Current sort key/direction from the URL, for header indicators. */
  sort?: string;
  order?: SortOrder;
  /** Serialized search/filter params to carry into each header link. */
  baseParams?: string;
}) {
  const headerParams = new URLSearchParams(baseParams);

  if (discussions.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No discussions match the current search and filters.
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
              {/* Every data column is sortable; Actions deliberately is not. */}
              <SortableHeader label="Discussion ID" sortKey="discussionId" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-28" />
              <SortableHeader label="Title" sortKey="title" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} />
              <SortableHeader label="Domain" sortKey="domain" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-32" />
              <SortableHeader label="Coordinator / Members" sortKey="coordinator" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-48" />
              <SortableHeader label="Status" sortKey="status" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-24" />
              <SortableHeader label="Started" sortKey="started" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-28" />
              <SortableHeader label="Estimated Finish" sortKey="estimatedFinish" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-28" />
              <SortableHeader label="Linked Issues" sortKey="linkedIssue" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-28" />
              <SortableHeader label="Meeting Date" sortKey="meetingDate" activeSort={sort} activeOrder={order} basePath="/dashboard/discussions" baseParams={headerParams} widthClassName="w-40" />
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-28">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {discussions.map((discussion) => (
              <tr
                key={discussion.discussionId}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
              >
                <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  <Link
                    href={`/dashboard/discussions/${discussion.discussionId}`}
                    className="hover:underline hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    {discussion.discussionId}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-neutral-800 dark:text-neutral-200">{discussion.title}</td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap capitalize">
                  {discussion.domain ?? <span className="text-neutral-400 dark:text-neutral-600">Not set</span>}
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 align-top">
                  {discussion.coordinatorName ? (
                    <div className="font-medium text-neutral-800 dark:text-neutral-200">
                      {discussion.coordinatorName}
                    </div>
                  ) : (
                    <span className="text-neutral-400 dark:text-neutral-600">—</span>
                  )}
                  {discussion.participantNames.length > 0 && (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                      {discussion.participantNames.slice(0, 3).join(", ")}
                      {discussion.participantNames.length > 3 && (
                        <>
                          {" "}
                          <MemberOverflowCapsule names={discussion.participantNames.slice(3)} />
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <DiscussionStatusBadge status={discussion.status} />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <ProcessStartedBadge processStarted={discussion.processStarted} />
                </td>
                <td className="px-5 py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {formatIsoDate(discussion.estimatedFinishDate)}
                </td>
                <td className="px-5 py-3.5 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {discussion.linkedIssueId ? (
                    <Link
                      href={`/dashboard/issues/${discussion.linkedIssueId}`}
                      className="font-mono text-xs hover:underline hover:text-neutral-800 dark:hover:text-neutral-200"
                    >
                      {discussion.linkedIssueId}
                    </Link>
                  ) : (
                    <span className="text-neutral-400 dark:text-neutral-600">-</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {formatMeetingDate(discussion.meetingDateStart, discussion.meetingDateEnd)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/dashboard/discussions/${discussion.discussionId}`}
                      title={`View ${discussion.discussionId}`}
                      aria-label={`View ${discussion.discussionId} - ${discussion.title}`}
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                    >
                      <EyeIcon />
                    </Link>
                    {canDelete && (
                      <DeleteDiscussionButton discussionId={discussion.discussionId} title={discussion.title} />
                    )}
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
