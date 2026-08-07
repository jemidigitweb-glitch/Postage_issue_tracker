"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import type { AssignedIssueCardData } from "@/lib/queries/issueAssignments";
import type { IssueStatus } from "@/lib/queries/issues";
import { updateIssueStatusAction, type StatusActionState } from "@/app/dashboard/issues/status-actions";

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

function formatIsoTimestampAsDate(isoTimestamp: string): string {
  return formatIsoDate(isoTimestamp.split("T")[0]);
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

export default function AssignedIssueCard({ issue }: { issue: AssignedIssueCardData }) {
  const [state, formAction, pending] = useActionState(updateIssueStatusAction, initialState);

  // Reset local selection whenever the server gives us a fresh `issue`
  // (after a successful save) — same "adjust state during render" pattern
  // used elsewhere in this app, not an effect.
  const [prevStatus, setPrevStatus] = useState(issue.status);
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus>(issue.status);
  if (issue.status !== prevStatus) {
    setPrevStatus(issue.status);
    setSelectedStatus(issue.status);
  }

  const rootCause = issue.extraData.rootCause;
  const whatIsHappening = issue.extraData.whatIsHappening;

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

      <form action={formAction} className="border-t border-neutral-100 dark:border-neutral-800 pt-4 flex flex-col gap-2">
        <input type="hidden" name="issueId" value={issue.issueId} />

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
              name="status"
              aria-label="Solved Status"
              value={selectedStatus}
              disabled={pending || issue.status === "GREEN"}
              onChange={(event) => {
                const nextStatus = event.target.value as IssueStatus;
                setSelectedStatus(nextStatus);
                event.currentTarget.form?.requestSubmit();
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${STATUS_SELECT_STYLES[selectedStatus]}`}
            >
              {STATUS_OPTIONS.filter((option) => STATUS_RANK[option.value] >= STATUS_RANK[issue.status]).map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

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
