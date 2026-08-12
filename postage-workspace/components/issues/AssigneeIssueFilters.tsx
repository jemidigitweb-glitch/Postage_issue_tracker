"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import Link from "next/link";

// ASSIGNEE PORTAL ONLY — filters for the Assigned Issues table.
//
// A SEPARATE component from components/issues/IssueFilters.tsx (Super Admin)
// and components/issues/AssignedIssuesFilters.tsx (Super Admin's assigned
// card tab). Neither of those is modified, so no admin filter bar can change
// because of anything here.
//
// Four filters only: Search, Status, Domain, Priority.
// There is deliberately NO "Assigned To" filter — an assignee only ever sees
// their own Issues, so the control would be meaningless. It is not merely
// hidden: listAssigneeIssues() has no assignee parameter at all, so there is
// nothing for a hand-edited URL to set.
//
// Same mechanics as the existing filter bars: an auto-submitting GET <form>
// (selects submit on change, search submits on Enter), so state lives in the
// URL and the page re-renders server-side from `searchParams`. `page` is not
// carried, so changing any filter returns to page 1.
//
// The <form> is keyed off the current filter values because App Router
// client-side navigation re-renders this component rather than remounting it,
// and uncontrolled inputs only read `defaultValue` at mount — without the key
// the visible controls would drift from the URL after a Clear.

const STATUS_OPTIONS = ["RED", "AMBER", "GREEN"] as const;
const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"] as const;

const selectClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200";

function submitOnChange(event: ChangeEvent<HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.currentTarget.form?.requestSubmit();
  }
}

export default function AssigneeIssueFilters({
  categories,
  search,
  status,
  category,
  priority,
  hasActiveFilters,
}: {
  /** Domains present in THIS assignee's own assignments only — see
   *  listAssigneeCategories(). Never the system-wide domain list. */
  categories: string[];
  search: string;
  status: string;
  category: string;
  priority: string;
  hasActiveFilters: boolean;
}) {
  const filterKey = [search, status, category, priority].join("|");

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
          className={`${selectClassName} w-64`}
        />
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
          className={selectClassName}
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
        <label htmlFor="category" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Domain
        </label>
        <select
          id="category"
          name="category"
          defaultValue={category}
          onChange={submitOnChange}
          className={selectClassName}
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
          className={selectClassName}
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
          href="/dashboard/issues"
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
