"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import Link from "next/link";

import type { StaffRecord } from "@/lib/queries/staff";

// Auto-submitting GET <form>: selects submit immediately on change, search
// submits on Enter — no separate "Filter" button. Still a plain GET
// navigation under the hood (form.requestSubmit()), so /dashboard/issues
// re-renders server-side via `searchParams` exactly as before. Page number
// is deliberately not preserved across new searches/filters (a fresh
// search should start at page 1).
//
// The <form> is keyed off the current filter values. App Router client-side
// navigation re-renders this component with new props instead of remounting
// it, but `defaultValue`/uncontrolled inputs only read their initial value
// at mount — so without a key change (e.g. after the Clear link navigates
// to no query params) the <select>/<input> DOM nodes silently keep
// displaying their old selection even though the results updated. Changing
// `key` forces React to remount the form whenever any filter value changes,
// keeping the visible controls in sync with the URL/results.

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

export default function IssueFilters({
  staff,
  categories,
  search,
  staffCode,
  status,
  priority,
  category,
  hasActiveFilters,
}: {
  staff: StaffRecord[];
  categories: string[];
  search: string;
  staffCode: string;
  status: string;
  priority: string;
  category: string;
  hasActiveFilters: boolean;
}) {
  const filterKey = [search, staffCode, status, priority, category].join("|");

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
        <label htmlFor="staff" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Raised By
        </label>
        <select
          id="staff"
          name="staff"
          defaultValue={staffCode}
          onChange={submitOnChange}
          className={selectClassName}
        >
          <option value="">All staff</option>
          {staff.map((s) => (
            <option key={s.staffCode} value={s.staffCode}>
              {s.staffName}
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
