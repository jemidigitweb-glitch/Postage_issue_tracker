"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { formatZonedDate } from "@/lib/datetime";
import type { AssignedIssueCardData } from "@/lib/queries/issueAssignments";
import type { IssueStatus } from "@/lib/queries/issues";
import { WORK_DETAIL_LABELS } from "@/lib/access/issueWorkDetails";
import { updateIssueStatusAction, type StatusActionState } from "@/app/dashboard/issues/status-actions";
import WorkDetailTextarea from "./WorkDetailTextarea";

const initialState: StatusActionState = {};

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: "RED", label: "Not Solved" },
  { value: "AMBER", label: "Partially Solved" },
  { value: "GREEN", label: "Completely Solved" },
];

// RED -> AMBER -> GREEN, forward-only: once AMBER/GREEN, RED must never be
// offered again, and once GREEN nothing but GREEN is offered. The server
// action enforces this independently too — this just keeps the dropdown
// from presenting a choice that would only bounce back as an error.
const STATUS_RANK: Record<IssueStatus, number> = { RED: 0, AMBER: 1, GREEN: 2 };

// Capsule background/text color reflects the currently-selected status —
// same color families as components/issues/IssueStatusBadge.tsx, just
// applied to the <select> itself instead of a separate badge.
const STATUS_SELECT_STYLES: Record<IssueStatus, string> = {
  RED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50",
  AMBER:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50",
  GREEN:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50",
};

function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// A genuine timestamp shown as a bare date — converted to Asia/Colombo so a
// late-evening UTC stamp shows the Sri Lankan calendar day, not the one before.
function formatIsoTimestampAsDate(isoTimestamp: string): string {
  return formatZonedDate(isoTimestamp);
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
        {title}
      </h4>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{children}</p>
    </div>
  );
}

export default function AssignedIssueCard({
  issue,
  /** True only for a holder of issue:change_status_any (Super Admin), whose
   *  pre-Stage-6 ability to move an Issue straight from RED to GREEN is
   *  preserved. For an assignee the dropdown offers only the next step,
   *  matching the server-side requireAmberBeforeGreen precondition. */
  canSkipToGreen = false,
}: {
  issue: AssignedIssueCardData;
  canSkipToGreen?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateIssueStatusAction, initialState);

  // Reset local selection whenever the server gives us a fresh `issue`
  // (after a successful save) — same "adjust state during render" pattern
  // used elsewhere in this app, not an effect. revalidatePath() in the
  // Server Action is what produces that fresh prop, so the new status and
  // the new text appear without any manual refresh and without ever calling
  // window.location.reload().
  const [prevStatus, setPrevStatus] = useState(issue.status);
  const [prevProgress, setPrevProgress] = useState(issue.work.implementationProgress);
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus>(issue.status);
  if (issue.status !== prevStatus || issue.work.implementationProgress !== prevProgress) {
    setPrevStatus(issue.status);
    setPrevProgress(issue.work.implementationProgress);
    setSelectedStatus(issue.status);
  }

  const rootCause = issue.extraData.rootCause;
  const whatIsHappening = issue.extraData.whatIsHappening;

  // A transition is pending confirmation whenever the dropdown has been moved
  // off the Issue's real status. Nothing is submitted on change any more —
  // the work details must be filled in first, which is the whole point of
  // this stage.
  const isTransitioning = selectedStatus !== issue.status;

  // The dropdown never offers a backwards move. For an assignee it also never
  // offers a skip straight to GREEN, because work must be started (AMBER)
  // before an Issue can be completely solved.
  const options = STATUS_OPTIONS.filter((option) => {
    if (STATUS_RANK[option.value] < STATUS_RANK[issue.status]) return false;
    if (option.value === "GREEN" && issue.status === "RED" && !canSkipToGreen) return false;
    return true;
  });

  return (
    <div className="w-full max-w-none rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 flex flex-col gap-4">
      <div>
        <Link
          href={`/dashboard/issues/${issue.issueId}`}
          className="font-mono text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
        >
          {issue.issueId}
        </Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          <span>👤 {issue.staffName}</span>
          <span>📅 {formatIsoDate(issue.createdDate)}</span>
          <span>⇄ {issue.category}</span>
        </div>
        <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mt-2">
          {issue.title}
        </h3>
      </div>

      <Section title="Description">{issue.description}</Section>
      {typeof rootCause === "string" && rootCause && <Section title="Root Cause">{rootCause}</Section>}
      {typeof whatIsHappening === "string" && whatIsHappening && (
        <Section title="What Is Happening">{whatIsHappening}</Section>
      )}
      <Section title="Fix & Action Required">
        {issue.resolution?.trim() || "Not Available in the Evidence"}
      </Section>

      {/* Current work, shown on the card so an assignee can see what they
          last recorded without opening the Issue. Full history and the
          timestamps live on the Issue detail page. */}
      {issue.work.implementationProgress && (
        <Section title={WORK_DETAIL_LABELS.implementationProgress}>
          {issue.work.implementationProgress}
        </Section>
      )}
      {issue.work.implementationDone && (
        <Section title={WORK_DETAIL_LABELS.implementationDone}>{issue.work.implementationDone}</Section>
      )}
      {issue.work.finalResolution && (
        <Section title={WORK_DETAIL_LABELS.finalResolution}>{issue.work.finalResolution}</Section>
      )}

      <form action={formAction} className="border-t border-neutral-100 dark:border-neutral-800 pt-4 flex flex-col gap-3">
        <input type="hidden" name="issueId" value={issue.issueId} />
        {/* The submitted status is this hidden field, not the <select> —
            the select is intentionally left unnamed so a browser cannot post
            a status without the work details rendered beside it. Either way
            the server re-checks the value against a fixed list and against
            the Issue's real, row-locked current status. */}
        <input type="hidden" name="status" value={selectedStatus} />

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
            Assign To
          </h4>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-neutral-800 dark:text-neutral-200">👤 {issue.assigneeName}</span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              📅 {formatIsoTimestampAsDate(issue.assignedAt)}
            </span>
            <select
              aria-label="Solved Status"
              value={selectedStatus}
              disabled={pending || issue.status === "GREEN"}
              onChange={(event) => setSelectedStatus(event.target.value as IssueStatus)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${STATUS_SELECT_STYLES[selectedStatus]}`}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Work details are collected BEFORE the save, never after. Which
            fields appear is driven by the status being moved TO, matching
            requiredWorkDetailFields() in lib/access/issueWorkDetails.ts. */}
        {isTransitioning && (
          <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 p-4">
            {selectedStatus === "AMBER" && (
              <WorkDetailTextarea
                name="implementationProgress"
                label={WORK_DETAIL_LABELS.implementationProgress}
                hint="What work has started, what is being investigated, and what action is currently being taken."
                defaultValue={issue.work.implementationProgress ?? ""}
                disabled={pending}
                autoFocus
              />
            )}

            {selectedStatus === "GREEN" && (
              <>
                <WorkDetailTextarea
                  name="implementationDone"
                  label={WORK_DETAIL_LABELS.implementationDone}
                  hint="Exactly what action or fix was implemented."
                  disabled={pending}
                  autoFocus
                />
                <WorkDetailTextarea
                  name="finalResolution"
                  label={WORK_DETAIL_LABELS.finalResolution}
                  hint="The final outcome, and why this Issue is considered completely solved."
                  disabled={pending}
                />
              </>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {pending ? "Saving…" : "Save status & work details"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setSelectedStatus(issue.status)}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state.error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-xs text-green-600 dark:text-green-400">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
