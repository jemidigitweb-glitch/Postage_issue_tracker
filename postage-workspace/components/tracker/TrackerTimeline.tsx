import type { IssueStatus } from "@/lib/queries/issues";
import type { TrackerTimelineEvent } from "@/lib/queries/tracker";
import { actorLabel, eventLabel, UNKNOWN_ACTOR } from "@/lib/access/trackerTimeline";
import { formatZonedDate, formatZonedTimeWithSeconds } from "@/lib/datetime";
import { cardClassName, sectionHeadingClassName } from "@/components/common/formStyles";

// SUPER ADMIN TRACKER — the chronological workflow history.
//
// One entry per STORED ROW, oldest first. Every timestamp, actor and piece of
// detail printed here comes from the database; nothing is inferred or filled
// in. Where the schema records no actor — issues has no created_by column, and
// issue_assignments.assigned_by is nullable — the row shows "—" rather than
// substituting a plausible name.
//
// Read-only. There is no control of any kind in this component.

const STATUS_LABELS: Record<IssueStatus, string> = {
  RED: "Not Solved",
  AMBER: "Partially Solved",
  GREEN: "Completely Solved",
};

/** Same families as components/issues/IssueStatusBadge, applied to the small
 *  transition chip so the timeline reads as part of the same design. */
const STATUS_PILL_STYLES: Record<IssueStatus, string> = {
  RED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  AMBER: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  GREEN: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

/** Small neutral marker per event kind — a dot, not an icon set. */
const KIND_DOT: Record<TrackerTimelineEvent["kind"], string> = {
  created: "bg-neutral-400 dark:bg-neutral-500",
  assigned: "bg-neutral-400 dark:bg-neutral-500",
  status_change: "bg-neutral-500 dark:bg-neutral-400",
  note: "bg-neutral-300 dark:bg-neutral-600",
};

// Both halves come from the same Asia/Colombo conversion, so the date and the
// time on an entry always belong to the same converted instant.
function formatDate(isoTimestamp: string): string {
  return formatZonedDate(isoTimestamp);
}

function formatTime(isoTimestamp: string): string {
  return formatZonedTimeWithSeconds(isoTimestamp);
}

/** How the `detail` column should be introduced, per kind — so a bare name
 *  is never mistaken for free text the user typed. */
function detailPrefix(event: TrackerTimelineEvent): string | null {
  if (event.kind === "created") return "Raised by";
  if (event.kind === "assigned") return "Assigned to";
  return null;
}

export default function TrackerTimeline({ events }: { events: TrackerTimelineEvent[] }) {
  return (
    <div className={`${cardClassName} flex flex-col gap-5`}>
      <h2 className={sectionHeadingClassName}>Workflow History</h2>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No workflow events have been recorded for this Issue.
        </p>
      ) : (
        <ol className="flex flex-col">
          {events.map((event, index) => {
            const isLast = index === events.length - 1;
            const label = eventLabel(event.kind, event.fromStatus, event.toStatus, event.commentType);
            const prefix = detailPrefix(event);
            const actor = actorLabel(event.actorName);

            return (
              <li key={event.key} className="relative flex gap-4 pb-5 last:pb-0">
                {/* Rail + dot. Purely decorative; every fact is in the text. */}
                <div className="flex flex-col items-center" aria-hidden="true">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[event.kind]}`} />
                  {!isLast && (
                    <span className="mt-1 w-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {label}
                    </span>

                    {/* Previous -> new status, shown only when the row
                        actually carries both. */}
                    {event.kind === "status_change" && event.toStatus && (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_PILL_STYLES[event.toStatus]}`}
                      >
                        {event.fromStatus ? `${STATUS_LABELS[event.fromStatus]} → ` : ""}
                        {STATUS_LABELS[event.toStatus]}
                      </span>
                    )}

                    <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatDate(event.at)} · {formatTime(event.at)}
                    </span>

                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {actor === UNKNOWN_ACTOR ? "No recorded user" : `by ${actor}`}
                    </span>
                  </div>

                  {event.detail?.trim() && (
                    <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
                      {prefix ? <span className="text-neutral-500 dark:text-neutral-400">{prefix} </span> : null}
                      {event.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
