"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import Link from "next/link";

// Mirrors components/issues/IssueFilters.tsx exactly (auto-submitting GET
// form, key-forced remount on filter change).

const STATUS_OPTIONS = ["RED", "AMBER", "GREEN"] as const;

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

export default function DiscussionFilters({
  domains,
  members,
  search,
  status,
  domain,
  member,
  hasActiveFilters,
}: {
  domains: string[];
  /** Distinct coordinator + participant names, from
   *  listDiscussionMemberNames() — dynamic, never hardcoded. */
  members: string[];
  search: string;
  status: string;
  domain: string;
  member: string;
  hasActiveFilters: boolean;
}) {
  const filterKey = [search, status, domain, member].join("|");

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
          placeholder="Discussion ID or title… (Enter to search)"
          onKeyDown={submitOnEnter}
          className={`${selectClassName} w-64`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="member" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Coordinator / Member
        </label>
        <select id="member" name="member" defaultValue={member} onChange={submitOnChange} className={selectClassName}>
          <option value="">All coordinators / members</option>
          {members.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="domain" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Domain
        </label>
        <select id="domain" name="domain" defaultValue={domain} onChange={submitOnChange} className={selectClassName}>
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d} className="capitalize">
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Status
        </label>
        <select id="status" name="status" defaultValue={status} onChange={submitOnChange} className={selectClassName}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <Link
          href="/dashboard/discussions"
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
