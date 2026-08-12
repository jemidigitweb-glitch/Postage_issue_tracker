// Shared Tailwind class strings for form controls, so a new screen matches
// the application's existing look instead of falling back to raw browser
// defaults or inventing a near-miss variant.
//
// These values are TRANSCRIBED from the controls the app already ships —
// components/issues/IssueFilters.tsx, components/issues/AssignedIssuesFilters.tsx
// and the buttons on components/issues/IssueTable.tsx — they are not a new
// design.
//
// ── WHY THOSE FILES STILL HOLD THEIR OWN COPIES ─────────────────────────────
// They are Super Admin surfaces, and this stage is forbidden from altering
// Super Admin markup. Refactoring them to import from here would be a pure
// no-op in the rendered output, but "pure no-op" is exactly the kind of claim
// that is easy to get wrong, so they are deliberately left untouched. This
// module is consumed only by Assignee-portal components. If the two ever need
// to converge, that is its own change with its own regression check.

/** Select / dropdown. Matches the filter bars' `selectClassName`. */
export const selectClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 disabled:opacity-60";

/** Primary action button (dark fill). Matches Assign / New Issue / Save. */
export const primaryButtonClassName =
  "rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity";

/** Secondary action button (outlined). Matches Clear / Previous / Next. */
export const secondaryButtonClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";

/** The card wrapper used by every panel on the Issue detail page. */
export const cardClassName =
  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6";

/** Section heading inside a card — the small uppercase label used for
 *  "Description", "Images / Attachments", "Additional details". */
export const sectionHeadingClassName =
  "text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500";

/** Field label above a control. Slightly darker than a section heading, the
 *  same weight the filter bars use for "Search" / "Status". */
export const fieldLabelClassName =
  "text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";
