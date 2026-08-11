import Link from "next/link";

// Shared sortable table heading, used by both components/issues/IssueTable.tsx
// and components/discussions/DiscussionTable.tsx so the two tables cannot
// drift apart visually or behaviourally.
//
// Deliberately a <Link>, not an onClick handler: sort state lives entirely in
// the URL (?sort=&order=), which means it survives a refresh, is shareable and
// bookmarkable, and keeps both tables working without client-side JS. The
// server does the actual ordering — see the SORT_COLUMNS whitelists in
// lib/queries/issues.ts and lib/queries/discussions.ts.
//
// `page` is intentionally dropped from the generated href, so changing the
// sort always returns to page 1 (staying on page 7 of a newly-reordered list
// would show an arbitrary slice). Every other param — search, filters, tab —
// is carried through untouched.

export type SortOrder = "asc" | "desc";

const thClassName =
  "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500";

function SortIcon({ state }: { state: "none" | SortOrder }) {
  // Same 16x16 / stroke="currentColor" convention as the other inline icons
  // in this project (components/discussions/icons.tsx). Inactive columns keep
  // a faint neutral glyph so the column still reads as sortable; the active
  // one goes full-opacity in a single direction.
  if (state === "none") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true">
        <path
          d="M8 3.5v9M8 3.5 5.5 6M8 3.5 10.5 6M8 12.5 5.5 10M8 12.5 10.5 10"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0" aria-hidden="true">
      <path
        d={state === "asc" ? "M8 12.5v-9M8 3.5 4.5 7M8 3.5 11.5 7" : "M8 3.5v9M8 12.5 4.5 9M8 12.5 11.5 9"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SortableHeader({
  label,
  sortKey,
  activeSort,
  activeOrder,
  basePath,
  baseParams,
  widthClassName = "",
}: {
  label: string;
  /** Must exist in the corresponding query-layer whitelist, or the server
   *  silently falls back to the table's default order. */
  sortKey: string;
  activeSort: string;
  activeOrder: SortOrder;
  basePath: string;
  /** Current search/filter/tab params, already stripped of sort/order/page. */
  baseParams: URLSearchParams;
  widthClassName?: string;
}) {
  const isActive = activeSort === sortKey;
  // First click on a new column starts ascending; clicking the active column
  // flips it. Matches the convention users expect from every other table.
  const nextOrder: SortOrder = isActive && activeOrder === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(baseParams);
  params.set("sort", sortKey);
  params.set("order", nextOrder);
  const href = `${basePath}?${params.toString()}`;

  return (
    <th className={`${thClassName} ${widthClassName}`} aria-sort={isActive ? (activeOrder === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={href}
        scroll={false}
        title={`Sort by ${label} (${nextOrder === "asc" ? "ascending" : "descending"})`}
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-neutral-700 dark:hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 ${
          isActive ? "text-neutral-700 dark:text-neutral-300" : ""
        }`}
      >
        {label}
        <SortIcon state={isActive ? activeOrder : "none"} />
      </Link>
    </th>
  );
}
