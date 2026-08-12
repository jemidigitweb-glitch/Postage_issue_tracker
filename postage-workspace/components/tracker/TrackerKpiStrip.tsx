import type { TrackerOverview } from "@/lib/queries/tracker";

// SUPER ADMIN TRACKER — the compact KPI strip.
//
// Replaces the previous per-Assignee card grid, which put one large block on
// screen per person and pushed the actual operational table below the fold.
// This is five small figures in a single bordered row: the headline numbers a
// manager reads first, and nothing else.
//
// Restrained on purpose — no icons, no coloured tiles, no shadows, no
// oversized type. Only the three status figures carry colour, in the same
// families the rest of the app already uses for RED / AMBER / GREEN, and even
// those are applied to the numeral alone rather than to a filled block.
//
// Server Component. Renders a value already computed by
// lib/queries/tracker.ts's getTrackerOverview(); it fetches nothing.

const TONES = {
  neutral: "text-neutral-900 dark:text-neutral-100",
  red: "text-red-700 dark:text-red-400",
  amber: "text-amber-700 dark:text-amber-400",
  green: "text-green-700 dark:text-green-400",
} as const;

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex-1 min-w-[7.5rem] px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
        {label}
      </dt>
      <dd className={`text-2xl font-semibold tabular-nums leading-none ${TONES[tone]}`}>{value}</dd>
    </div>
  );
}

export default function TrackerKpiStrip({ overview }: { overview: TrackerOverview }) {
  return (
    <dl className="flex flex-wrap divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <Kpi label="Total Assigned" value={String(overview.totalAssigned)} />
      <Kpi label="Not Solved" value={String(overview.notSolved)} tone="red" />
      <Kpi label="Partially Solved" value={String(overview.partiallySolved)} tone="amber" />
      <Kpi label="Completely Solved" value={String(overview.completelySolved)} tone="green" />
      <Kpi label="Completion" value={`${overview.completionPercent}%`} />
    </dl>
  );
}
