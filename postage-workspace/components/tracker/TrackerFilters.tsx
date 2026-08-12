"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import Link from "next/link";

import type { AssignmentUser } from "@/lib/queries/assignmentUsers";
import { TRACKING_STATES } from "@/lib/access/tracker";

// SUPER ADMIN TRACKER — filter card.
//
// A SEPARATE component from components/issues/IssueFilters.tsx and every
// other filter bar; none of those is modified, so no existing page's filters
// can change because of anything here.
//
// Six filters: Search · Assignee · Status · Tracking State · Domain · Priority.
// The four date-range inputs (Raised From/To, Assigned From/To) were removed
// by request — the Date Raised and Assigned Date COLUMNS are untouched and
// still shown in the table; only the filter controls are gone, and the page no
// longer reads their URL parameters at all.
//
// Same mechanics as the existing filter bars: an auto-submitting GET <form>
// (selects submit on change, search submits on Enter), so state lives in the
// URL and the page re-renders server-side from `searchParams`. `page` is
// deliberately not carried, so changing any filter returns to page 1.
//
// The <form> is keyed off the current filter values because App Router
// client-side navigation re-renders this component rather than remounting it,
// and uncontrolled inputs only read `defaultValue` at mount — without the key
// the visible controls would drift from the URL after a Clear.

const STATUS_OPTIONS = ["RED", "AMBER", "GREEN"] as const;
const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"] as const;

const controlClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200";

function submitOnChange(event: ChangeEvent<HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.currentTarget.form?.requestSubmit();
  }
}

export default function TrackerFilters({
  assignmentUsers,
  categories,
  search,
  assigneeId,
  status,
  trackingState,
  category,
  priority,
  hasActiveFilters,
}: {
  assignmentUsers: AssignmentUser[];
  categories: string[];
  search: string;
  assigneeId: string;
  status: string;
  trackingState: string;
  category: string;
  priority: string;
  hasActiveFilters: boolean;
}) {
  const filterKey = [search, assigneeId, status, trackingState, category, priority].join("|");

  return (
    <form
      key={filterKey}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Search
        </label>
        <input
          id="q"
          name="q"
          type="text"
          defaultValue={search}
          placeholder="Issue ID or title… (Enter to search)"
          onKeyDown={submitOnEnter}
          className={`${controlClassName} w-56`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assignee" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Assignee
        </label>
        <select
          id="assignee"
          name="assignee"
          defaultValue={assigneeId}
          onChange={submitOnChange}
          className={controlClassName}
        >
          <option value="">All assignees</option>
          {assignmentUsers.map((user) => (
            <option key={user.assigneeId} value={user.assigneeId}>
              {user.assigneeName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status}
          onChange={submitOnChange}
          className={controlClassName}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="tracking"
          className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
        >
          Tracking State
        </label>
        <select
          id="tracking"
          name="tracking"
          defaultValue={trackingState}
          onChange={submitOnChange}
          className={controlClassName}
        >
          <option value="">All tracking states</option>
          {TRACKING_STATES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Domain
        </label>
        <select
          id="category"
          name="category"
          defaultValue={category}
          onChange={submitOnChange}
          className={controlClassName}
        >
          <option value="">All domains</option>
          {categories.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="priority" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Priority
        </label>
        <select
          id="priority"
          name="priority"
          defaultValue={priority}
          onChange={submitOnChange}
          className={controlClassName}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option} className="capitalize">
              {option}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <Link
          href="/dashboard/tracker"
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
