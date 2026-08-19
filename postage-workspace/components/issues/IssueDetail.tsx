import type { ReactNode } from "react";

import { formatZonedTimestamp } from "@/lib/datetime";
import type { IssueDetail as IssueDetailData } from "@/lib/queries/issues";
import {
  MOBILE_TIMELINE_KEY,
  hasRenderableEvidence,
  readMobileEvidence,
} from "@/lib/access/mobileEvidence";
import IssueAudioAttachments from "./IssueAudioAttachments";
import MobileEvidence from "./MobileEvidence";
import IssuePriorityBadge from "./IssuePriorityBadge";
import IssueStatusBadge from "./IssueStatusBadge";

// Styling mirrors the rest of components/issues/*.tsx (rounded-xl border,
// neutral palette) so the detail page matches the list page and the rest
// of the dashboard. Read-only: no edit controls anywhere in this file.
//
// All fields rendered here come from the existing getIssueById() result
// (issue.* plus issue.extraData) — no new data is fetched. `member` and
// `dataLink` are pulled out of extraData for dedicated treatment (Member
// sits with the other meta fields; dataLink becomes the small "View Data"
// capsule instead of a raw entry); everything else in extraData still
// renders in "Additional details", unchanged in substance.

// Genuine DATE column (issues.created_date) — no time-of-day, so no
// timezone conversion. Formatting only.
function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// Genuine timestamp — converted to Asia/Colombo for display.
// e.g. "2026-08-12T09:46:00Z" -> "12/08/2026 15:16 Asia/Colombo (UTC+05:30)"
function formatIsoTimestamp(isoTimestamp: string): string {
  return formatZonedTimestamp(isoTimestamp);
}

// Title-cases each word so keys like "whatIsHappening" / "root_cause" read
// as "What Is Happening" / "Root Cause" instead of sentence case.
function humanizeKey(key: string): string {
  const withSpaces = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return withSpaces
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatExtraValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// extra_data.images — written by the image-linking step, shape:
//   [{ url, public_id, original_name }, ...]
// extraData is Record<string, unknown>, so every field is validated here
// rather than trusted; anything malformed is skipped instead of crashing
// the page. Read-only: extra_data is never written back from this file.
interface IssueImage {
  url: string;
  originalName?: string;
}

function toIssueImages(value: unknown): IssueImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url || !isHttpUrl(url)) return [];
    const originalName =
      typeof record.original_name === "string" && record.original_name.trim() !== ""
        ? record.original_name.trim()
        : undefined;
    return [{ url, originalName }];
  });
}

// Cloudinary delivery URLs accept inline transformations after /image/upload/.
// Requesting a fitted, auto-format thumbnail avoids pulling the full-size
// original (700KB+) just to paint a grid cell. c_fit (not c_fill) so evidence
// images are never cropped. This uses ONLY the already-public delivery URL —
// no cloud credentials, API key or secret is involved. Any non-Cloudinary URL
// falls through unchanged.
const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

function thumbnailUrl(url: string): string {
  const at = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (at === -1) return url;
  const cut = at + CLOUDINARY_UPLOAD_MARKER.length;
  return `${url.slice(0, cut)}c_fit,w_400,h_400,q_auto,f_auto/${url.slice(cut)}`;
}

// Matches key.toLowerCase() after stripping spaces/underscores, so "Source
// Id", "sourceId", and "source_id" are all treated the same regardless of
// which casing convention a given row's extra_data happens to use.
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

// Intake/tracking metadata from the daily-issue ingestion pipeline — not
// useful on the operational issue detail page, so filtered from display
// only. The underlying extra_data values are untouched.
//
// `mobilesubmissionid` joins them: extra_data.mobileSubmissionId is the UUID
// that makes a Mobile Lite registration idempotent (one REGISTER press = one
// Issue). It is still WRITTEN, still read by the duplicate lookup in
// lib/queries/issues.ts, and still exactly as stored — it simply means nothing
// to a person reading the Issue, so it is no longer printed. Mobile Source
// stays: "this came from Warehouse Mobile Lite" is a fact worth showing.
const HIDDEN_META_KEYS = new Set([
  "sourceid",
  "sourcefile",
  "evidencefiles",
  "originalowner",
  "classification",
  "mobilesubmissionid",
]);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
        {label}
      </dt>
      <dd className="text-sm text-neutral-800 dark:text-neutral-200">{children}</dd>
    </div>
  );
}

const capsuleClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors";

function DataLinkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M6.5 9.5 9.5 6.5M7 4.5H4.5A2 2 0 0 0 2.5 6.5v5A2 2 0 0 0 4.5 13.5h5a2 2 0 0 0 2-2V9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 2.5h4v4M13.5 2.5 9 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Small capsule instead of a raw link/text blob. When the value looks like
// a URL it opens directly; otherwise it reveals the value inline via
// <details> (no JS needed, keeps this a server component) — either way the
// existing data is never removed, just no longer dumped as a large text
// link in the middle of the page.
function DataLinkCapsule({ value }: { value: string }) {
  if (isHttpUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className={capsuleClassName}>
        <DataLinkIcon />
        View Data
      </a>
    );
  }

  return (
    <details className="inline-block">
      <summary className={`${capsuleClassName} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <DataLinkIcon />
        View Data
      </summary>
      <div className="mt-2 max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
        {value}
      </div>
    </details>
  );
}

// "images" joins these because it gets its own gallery section below —
// without this it would ALSO be dumped as raw JSON under "Additional
// details". The stored value itself is unchanged.
// "attachments" joins these for the same reason "images" did: it has its own
// section (IssueAudioAttachments) and would otherwise ALSO be dumped as raw
// JSON under "Additional details". The stored value itself is unchanged.
const PULLED_OUT_KEYS = new Set(["member", "datalink", "images", "attachments"]);

export default function IssueDetail({
  issue,
  // ── ASSIGNEE PORTAL additions ──────────────────────────────────────────
  // Both are OPTIONAL and default to undefined, so a caller that does not
  // pass them gets byte-for-byte the markup this component produced before.
  // The Super Admin's detail page passes neither: it already shows the
  // assignment in its own AssignmentPanel, and its layout is frozen by the
  // no-regression requirement.
  /** assignment_users.assignee_name for the current assignment. Read-only
   *  text — never a picker; assignment remains a Super Admin operation. */
  assignedToName,
  /** issues.resolution — the historical intake-time "Fix & Action Required"
   *  text. NOT the Stage 6 outcome (that is Final Resolution, rendered by
   *  components/issues/IssueWorkProgress.tsx from issues.final_resolution).
   *  These two are never merged and never written to each other. */
  fixAndActionRequired,
  /** True only for the Super Admin, who sees the imported historical audio
   *  evidence. Defaults to false so the Assignee portal's audio section keeps
   *  showing exactly what it showed before this stage. */
  includeHistoricalAudio = false,
  /** Renders the Warehouse Mobile evidence as a readable section instead of
   *  leaving extra_data.mobileTimeline to the generic JSON dump.
   *
   *  Decided by resolveIssueDetailView().showMobileEvidence — true for the
   *  Super Admin AND for Raised-by-Staff, false for the Assignee portal.
   *  Defaults to false, so a caller that passes nothing keeps byte-for-byte the
   *  markup it has today. */
  showMobileEvidence = false,
}: {
  issue: IssueDetailData;
  assignedToName?: string | null;
  fixAndActionRequired?: string | null;
  includeHistoricalAudio?: boolean;
  showMobileEvidence?: boolean;
}) {
  const entries = Object.entries(issue.extraData).filter(([, value]) => value !== null && value !== "");

  // ── WAREHOUSE MOBILE EVIDENCE ─────────────────────────────────────────────
  // Null unless extra_data says the Issue came from Warehouse Mobile Lite AND
  // it carries a timeline — so a desktop Issue, a historical row and a Stage 1
  // Mobile Lite Issue all keep exactly the page they had. Detection is by
  // metadata only; nothing here looks at the Raised By code or the Issue ID.
  const mobileEvidence = showMobileEvidence ? readMobileEvidence(issue.extraData) : null;
  const showsMobileEvidence = hasRenderableEvidence(mobileEvidence);

  const imagesEntry = entries.find(([key]) => key.toLowerCase() === "images");
  const images = imagesEntry ? toIssueImages(imagesEntry[1]) : [];

  const memberEntry = entries.find(([key]) => key.toLowerCase() === "member");
  const memberValue = memberEntry ? formatExtraValue(memberEntry[1]) : null;

  const dataLinkEntry = entries.find(([key]) => key.toLowerCase() === "datalink");
  const dataLinkValue =
    dataLinkEntry && typeof dataLinkEntry[1] === "string" && dataLinkEntry[1].trim() !== ""
      ? (dataLinkEntry[1] as string)
      : null;

  const extraEntries = entries.filter(
    ([key]) =>
      !PULLED_OUT_KEYS.has(key.toLowerCase()) &&
      !HIDDEN_META_KEYS.has(normalizeKey(key)) &&
      // The timeline has its own readable section below; without this it would
      // ALSO be stringified into "Additional details" as raw JSON — which is
      // exactly the clutter this change removes. The stored value is unchanged,
      // and when the section does not render (Assignee portal, or an Issue with
      // no timeline) this filter does not apply, so nothing is silently hidden.
      !(showsMobileEvidence && key.toLowerCase() === MOBILE_TIMELINE_KEY.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400 mb-1">{issue.issueId}</p>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {issue.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <IssueStatusBadge status={issue.status} />
            <IssuePriorityBadge priority={issue.priority} />
            {dataLinkValue && <DataLinkCapsule value={dataLinkValue} />}
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-6 pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
          <Field label="Raised By">{issue.staffName}</Field>
          <Field label="Date Raised">{formatIsoDate(issue.createdDate)}</Field>
          <Field label="Domain">
            <span className="capitalize">{issue.category}</span>
          </Field>
          {memberValue && <Field label="Member">{memberValue}</Field>}
          {/* Rendered only when the caller supplies it — see the prop docs. */}
          {assignedToName != null && <Field label="Assigned To">{assignedToName}</Field>}
          <Field label="Updated">
            {issue.updatedAt ? formatIsoTimestamp(issue.updatedAt) : "—"}
          </Field>
        </dl>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
            Description
          </h2>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {issue.description}
          </p>
        </div>

        {/* Same rule: absent unless the caller asks for it. */}
        {fixAndActionRequired != null && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
              Fix &amp; Action Required
            </h2>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
              {fixAndActionRequired.trim() || "Not Available in the Evidence"}
            </p>
          </div>
        )}
      </div>

      {/* WAREHOUSE MOBILE EVIDENCE. Rendered for the Super Admin and for
          Raised-by-Staff — not the Assignee portal — and only when the Issue
          actually carries a readable timeline. It replaces both
          the generic gallery and the audio block for these Issues (see below),
          because it shows the SAME media in the order the worker added it, with
          each caption beside its own photo — showing both would print every
          photo twice. */}
      {showsMobileEvidence && mobileEvidence && <MobileEvidence items={mobileEvidence} />}

      {/* Hidden entirely when the issue has no usable images — no empty card,
          no heading. Scales to any number of images without further changes.
          Suppressed for a Mobile Evidence Issue, which already shows them. */}
      {!showsMobileEvidence && images.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">
            Images / Attachments
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image, index) => (
              <li key={`${image.url}-${index}`}>
                <a
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={image.originalName ?? "Open full image"}
                  className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500"
                >
                  <div className="aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60">
                    {/* Plain <img>, not next/image: these are arbitrary remote
                        URLs stored per-issue, and next/image would require
                        whitelisting hosts in next.config.ts. Cloudinary already
                        serves an optimised, correctly-sized asset. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailUrl(image.url)}
                      alt={image.originalName ?? `Attachment ${index + 1} for ${issue.issueId}`}
                      loading="lazy"
                      className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  {image.originalName && (
                    <p
                      className="mt-1.5 truncate text-xs text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200 transition-colors"
                      title={image.originalName}
                    >
                      {image.originalName}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Audio evidence. Renders nothing at all unless the Issue has
          extra_data.attachments entries of type "audio" — which no historical
          Issue does — so this is inert for every pre-existing Issue and for
          any Issue created without audio. Display only: no control, so it
          changes nothing about either portal's workflow. */}
      {/* Suppressed for a Mobile Evidence Issue for the same reason as the
          gallery: the recording is already there, in its place in the order. */}
      {!showsMobileEvidence && (
        <IssueAudioAttachments
          extraData={issue.extraData}
          includeHistorical={includeHistoricalAudio}
        />
      )}

      {extraEntries.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">
            Additional details
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
            {extraEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
                  {humanizeKey(key)}
                </dt>
                <dd className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                  {formatExtraValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
