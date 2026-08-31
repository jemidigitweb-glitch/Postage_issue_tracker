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
  exportMode = null,
}: {
  staff: StaffRecord[];
  categories: string[];
  search: string;
  staffCode: string;
  status: string;
  priority: string;
  category: string;
  hasActiveFilters: boolean;
  /** Who the "Download Issues" button exports, or null to hide it entirely.
   *
   *   "select" — Super Admin: the subject is whoever is chosen in Raised By,
   *              so the button stays disabled until one staff member is
   *              selected ("All staff" is not an export).
   *   "self"   — Raised By Staff: the subject is always themselves, resolved
   *              server-side from the session, so no selection is needed and
   *              the button is always enabled.
   *
   * Presentation only. /dashboard/issues/export re-derives the role and the
   * staff identity itself and is the actual gate. */
  exportMode?: "select" | "self" | null;
}) {
  const filterKey = [search, staffCode, status, priority, category].join("|");

  // Built from the APPLIED filters (the props, which come from the URL), not
  // from whatever is half-typed in the form — so the file always matches the
  // rows currently on screen. `page` is deliberately absent: the export covers
  // the whole filtered set, never one page of it.
  const exportParams = new URLSearchParams();
  // `staff` is sent ONLY in "select" mode. In "self" mode the server resolves
  // the staff identity from the session and refuses a ?staff= naming anyone
  // else, so sending the dropdown's value here — which a Raised By user is
  // free to point at a colleague — would turn a legitimate list filter into a
  // rejected export.
  if (exportMode === "select" && staffCode) exportParams.set("staff", staffCode);
  if (search) exportParams.set("q", search);
  if (category) exportParams.set("category", category);
  if (status) exportParams.set("status", status);
  if (priority) exportParams.set("priority", priority);

  const exportHref = `/dashboard/issues/export?${exportParams.toString()}`;
  const exportEnabled = exportMode === "self" || (exportMode === "select" && Boolean(staffCode));

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

      {/* Download Issues. Super Admin ("select") needs one Raised By staff
          member chosen first — "All staff" is not an export, and the route
          rejects it too. Raised By Staff ("self") always exports their own
          Issues, so there is nothing to select.

          A plain <a>, not next/link: client-side navigation would try to
          render the response as a page. A normal browser request lets the
          attachment Content-Disposition download the file and leave the
          current page exactly where it is. */}
      {exportMode &&
        (exportEnabled ? (
          <a
            href={exportHref}
            title={
              exportMode === "self"
                ? "Downloads every Issue you raised that matches the filters above."
                : "Downloads every Issue raised by the selected staff member that matches the filters above."
            }
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Download Issues
          </a>
        ) : (
          <span
            aria-disabled="true"
            title="Select a staff member in Raised By to download their issues."
            className="cursor-not-allowed rounded-lg border border-neutral-100 dark:border-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300 dark:text-neutral-700"
          >
            Download Issues
          </span>
        ))}
    </form>
  );
}
