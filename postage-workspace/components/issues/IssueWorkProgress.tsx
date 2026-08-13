import type { ReactNode } from "react";

import { WORK_DETAIL_LABELS } from "@/lib/access/issueWorkDetails";
import { formatZonedTimestamp } from "@/lib/datetime";
import { cardClassName, sectionHeadingClassName } from "@/components/common/formStyles";
import type { IssueStatus, IssueWorkDetails } from "@/lib/queries/issues";
import type { IssueProgressEntry } from "@/lib/queries/issueWorkProgress";
import IssueProgressUpdateForm from "./IssueProgressUpdateForm";

// ASSIGNEE PORTAL ONLY — the "WORK PROGRESS" block on the Issue detail page.
//
// Stage 6 rendered this for every viewer, which put Assignee-portal
// functionality on the Super Admin's detail page. It is now gated by
// resolveIssueDetailView().showWorkProgress, so only an Assignee sees it and
// the Super Admin's page is back to its pre-Stage-6 presentation. Nothing
// about the DATA changed: the columns, issue_status_history and the
// investigation-note log are all still written and still preserved.
//
// A Server Component: it renders data that has ALREADY been scoped by the
// page (getIssueById takes the request's IssueAccessScope). It performs no
// fetching and no authorization of its own, so it cannot widen access by
// being rendered in the wrong place.
//
// ── NO WORK LOG ─────────────────────────────────────────────────────────────
// This block shows the CURRENT state of the work only: the two timestamps and
// the three text fields. The per-entry timeline that used to sit at the
// bottom has been removed from the page at the owner's request.
//
// That is a DISPLAY change and nothing more. Every write still records its
// evidence exactly as before — issue_tracking.issue_status_history gets a row
// (with the work detail in `reason`) for every transition, and every AMBER
// progress update still appends an 'investigation_note' to
// issue_tracking.issue_comments. Both tables remain append-only and nothing
// deletes from them; lib/queries/issueWorkProgress.ts still exposes
// listIssueWorkLog() to read the history back. The record is intact, it is
// simply no longer painted on this page.
//
// Everything else on the detail page — Description, Images/Attachments,
// Additional details, assignment panel — is untouched by this component.

// Genuine timestamp — converted to Asia/Colombo for display.
// e.g. "2026-08-12T09:46:00Z" -> "12/08/2026 15:16 Asia/Colombo (UTC+05:30)"
function formatIsoTimestamp(isoTimestamp: string): string {
  return formatZonedTimestamp(isoTimestamp);
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
        {title}
      </h3>
      <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
        {children}
      </div>
    </div>
  );
}

/** A stamp that is deliberately shown even when empty — "Not started" /
 *  "Not completed" is meaningful information about where the work stands,
 *  unlike an empty text field, which is just noise. */
function Stamp({ title, value, emptyLabel }: { title: string; value: string | null; emptyLabel: string }) {
  return (
    <Block title={title}>
      {value ? (
        formatIsoTimestamp(value)
      ) : (
        <span className="text-neutral-400 dark:text-neutral-500">{emptyLabel}</span>
      )}
    </Block>
  );
}

export default function IssueWorkProgress({
  issueId,
  status,
  work,
  /** EVERY progress entry ever recorded for this Issue, oldest first — from
   *  listIssueProgressEntries(), which merges the append-only
   *  issue_comments notes with the progress captured on RED -> AMBER
   *  transitions. Not derived from work.implementationProgress, which is only
   *  the latest snapshot. */
  progressEntries,
  /** Whether to render the AMBER progress-update form. An affordance only —
   *  the Server Action and the query layer both re-check the caller's
   *  identity, ownership, and the Issue's real status. */
  canRecordProgress,
}: {
  issueId: string;
  status: IssueStatus;
  work: IssueWorkDetails;
  progressEntries: IssueProgressEntry[];
  canRecordProgress: boolean;
}) {
  const hasDone = Boolean(work.implementationDone?.trim());
  const hasFinalResolution = Boolean(work.finalResolution?.trim());

  return (
    <div className={`${cardClassName} flex flex-col gap-6`}>
      <h2 className={sectionHeadingClassName}>Work Progress</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
        <Stamp title="Process Started" value={work.processStartedAt} emptyLabel="Not started" />
        <Stamp title="Completed" value={work.completedAt} emptyLabel="Not completed" />
      </div>

      {/* ── IMPLEMENTATION PROGRESS — every entry, oldest first ───────────
          Previously this printed only issues.implementation_progress, i.e.
          the LATEST line, which made each new submission look as though it
          had replaced the last one. It never had: both storage paths were
          already append-only. This renders the whole history instead. */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
          {WORK_DETAIL_LABELS.implementationProgress}
        </h3>

        {progressEntries.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            {status === "RED"
              ? "Work has not started on this Issue yet."
              : "No progress has been recorded yet."}
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {progressEntries.map((entry) => (
              <li
                key={entry.key}
                className="border-l-2 border-neutral-200 dark:border-neutral-800 pl-4"
              >
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 tabular-nums">
                  {formatIsoTimestamp(entry.at)}
                  {/* The author comes from issue_comments.author_id /
                      issue_status_history.changed_by via management_users.
                      When it cannot be resolved the entry says so rather than
                      naming someone. */}
                  {entry.authorName ? ` — ${entry.authorName}` : " — No recorded user"}
                </p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                  {entry.text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Completion fields stay hidden until they have values — an empty
          "Final Resolution" heading on an unfinished Issue is noise. */}
      {hasDone && <Block title={WORK_DETAIL_LABELS.implementationDone}>{work.implementationDone}</Block>}
      {hasFinalResolution && (
        <Block title={WORK_DETAIL_LABELS.finalResolution}>{work.finalResolution}</Block>
      )}

      {canRecordProgress && status === "AMBER" && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-5">
          <IssueProgressUpdateForm issueId={issueId} entryCount={progressEntries.length} />
        </div>
      )}

    </div>
  );
}
