"use client";

// One labelled work-detail textarea, shared by every place Stage 6 collects
// implementation text (the Assigned Issues card and the Issue detail page's
// progress form) so the label, the hint, the character cap and the required
// marker cannot drift between them.
//
// Imports its labels and cap from lib/access/issueWorkDetails.ts — the SAME
// pure module the Server Action and the query layer validate against, so the
// message a user sees for "too long" always matches the rule that produced
// it. That module has no `server-only`/`next`/database import, which is what
// makes it safe to pull into a Client Component.

import { MAX_WORK_DETAIL_LENGTH } from "@/lib/access/issueWorkDetails";

export default function WorkDetailTextarea({
  name,
  label,
  hint,
  defaultValue,
  disabled,
  rows = 4,
  autoFocus,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue?: string;
  disabled?: boolean;
  rows?: number;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={`${name}-${label}`}
        className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
      >
        {label} <span className="text-red-600 dark:text-red-400">*</span>
      </label>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      <textarea
        id={`${name}-${label}`}
        name={name}
        rows={rows}
        // `required` is a convenience only. The authoritative check is
        // server-side (validateTransitionWorkDetails / validateProgressUpdate,
        // re-checked again inside the transaction) — a whitespace-only value
        // satisfies the browser but is rejected there.
        required
        maxLength={MAX_WORK_DETAIL_LENGTH}
        defaultValue={defaultValue}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 disabled:opacity-60"
      />
    </div>
  );
}
