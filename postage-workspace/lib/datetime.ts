// Display-only timezone handling for Issue-system timestamps.
//
// The database is untouched by anything in this file: every timestamp is
// still STORED as UTC (`timestamptz`, read back through
// `to_char(... AT TIME ZONE 'UTC', ...)` in lib/queries/*.ts), and no
// PostgreSQL session/database timezone is changed anywhere. The conversion
// below happens at render time only, on the UTC ISO string the query layer
// already returns.
//
// The conversion is timezone-aware — Intl with the IANA zone `Asia/Colombo`
// — not an arithmetic "+5h30m" offset. If Sri Lanka's offset ever changes,
// the runtime's tz database handles it; nothing here needs editing.
//
// IMPORTANT: this is for genuine TIMESTAMPS only. Genuine DATE-only columns
// (issues.created_date, issues.completed_date, discussion date fields) carry
// no time-of-day and must NOT be shifted — they keep their own plain
// YYYY-MM-DD → DD/MM/YYYY formatting in the components.

/** The IANA timezone every converted timestamp is rendered in. */
export const DISPLAY_TIME_ZONE = "Asia/Colombo";

/** The visible label shown after a converted time. */
export const DISPLAY_TIME_ZONE_LABEL = "Asia/Colombo (UTC+05:30)";

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type ZonedParts = {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  second: string;
};

/** Splits a UTC ISO timestamp into its Asia/Colombo calendar parts, or null
 *  if the input is not a timestamp this can safely convert. */
function zonedParts(isoTimestamp: string): ZonedParts | null {
  if (!isoTimestamp) return null;

  // The query layer always emits "...THH:MM:SSZ". Be explicit anyway: a
  // timestamp with no zone designator is UTC, never local.
  const normalized =
    isoTimestamp.includes("T") && !/(Z|[+-]\d{2}:?\d{2})$/.test(isoTimestamp)
      ? `${isoTimestamp}Z`
      : isoTimestamp;

  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;

  const parts = PARTS_FORMATTER.formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    day: part("day"),
    month: part("month"),
    year: part("year"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

/** "2026-08-12T09:46:00Z" -> "12/08/2026 15:16 Asia/Colombo (UTC+05:30)" */
export function formatZonedTimestamp(isoTimestamp: string): string {
  const p = zonedParts(isoTimestamp);
  if (!p) return isoTimestamp;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} ${DISPLAY_TIME_ZONE_LABEL}`;
}

/** The date half of a timestamp, in Asia/Colombo — for the places that show
 *  a timestamp as a bare date. Converted, so a late-evening UTC stamp shows
 *  the Sri Lankan calendar day, not the previous one. */
export function formatZonedDate(isoTimestamp: string): string {
  const p = zonedParts(isoTimestamp);
  if (!p) return isoTimestamp;
  return `${p.day}/${p.month}/${p.year}`;
}

/** The time half, to the second, with the zone label —
 *  "15:16:30 Asia/Colombo (UTC+05:30)". Used where the date is rendered
 *  separately (the tracker timeline). */
export function formatZonedTimeWithSeconds(isoTimestamp: string): string {
  const p = zonedParts(isoTimestamp);
  if (!p) return isoTimestamp;
  return `${p.hour}:${p.minute}:${p.second} ${DISPLAY_TIME_ZONE_LABEL}`;
}
