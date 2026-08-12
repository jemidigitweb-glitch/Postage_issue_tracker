import type { ReactNode } from "react";

import type { TrackerIssueDetail as TrackerIssueDetailData } from "@/lib/queries/tracker";
import { cardClassName, sectionHeadingClassName } from "@/components/common/formStyles";
import IssuePriorityBadge from "@/components/issues/IssuePriorityBadge";
import IssueStatusBadge from "@/components/issues/IssueStatusBadge";

// SUPER ADMIN TRACKER — the read-only Issue record on /dashboard/tracker/[id].
//
// READ ONLY by construction: there is no <form>, no <button>, no Server Action
// import, and no client directive anywhere in this file. It is a Server
// Component that prints values already fetched by
// lib/queries/tracker.ts's getTrackerIssueDetail().
//
// It is a SEPARATE component from components/issues/IssueDetail.tsx, which
// belongs to the Super Admin Issues page and is frozen. Nothing here imports
// or modifies it, so that page cannot regress. The small amount of duplicated
// presentation (the image-gallery validation below) is a deliberate copy for
// exactly that reason.

function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function formatIsoTimestamp(isoTimestamp: string): string {
  // e.g. "2026-06-25T18:30:00Z" -> "25/06/2026 18:30 UTC"
  const [datePart, timePart] = isoTimestamp.split("T");
  const [year, month, day] = datePart.split("-");
  const time = (timePart ?? "").replace("Z", "").slice(0, 5);
  return `${day}/${month}/${year} ${time} UTC`;
}

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

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
        {title}
      </h3>
      <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
        {children}
      </div>
    </div>
  );
}

// ── Images / Attachments ────────────────────────────────────────────────────
// extra_data.images shape: [{ url, public_id, original_name }, ...]. extraData
// is Record<string, unknown>, so every field is validated rather than trusted;
// anything malformed is skipped instead of crashing the page. Read-only:
// extra_data is never written from here.
interface TrackerImage {
  url: string;
  originalName?: string;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function toTrackerImages(value: unknown): TrackerImage[] {
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
// original just to paint a grid cell. c_fit (not c_fill) so evidence images
// are never cropped. Uses ONLY the already-public delivery URL — no cloud
// credential is involved. Any non-Cloudinary URL falls through unchanged.
const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

function thumbnailUrl(url: string): string {
  const at = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (at === -1) return url;
  const cut = at + CLOUDINARY_UPLOAD_MARKER.length;
  return `${url.slice(0, cut)}c_fit,w_400,h_400,q_auto,f_auto/${url.slice(cut)}`;
}

export default function TrackerIssueDetail({ issue }: { issue: TrackerIssueDetailData }) {
  const images = toTrackerImages(issue.extraData.images);

  const hasProcessStarted = Boolean(issue.processStartedAt);
  const hasProgress = Boolean(issue.implementationProgress?.trim());
  const hasDone = Boolean(issue.implementationDone?.trim());
  const hasFinalResolution = Boolean(issue.finalResolution?.trim());
  const hasCompleted = Boolean(issue.completedAt || issue.completedDate);
  // The whole Workflow block is skipped when nothing in it has been recorded,
  // rather than printing five "—" rows on an Issue nobody has started.
  const hasWorkflow =
    hasProcessStarted || hasProgress || hasDone || hasFinalResolution || hasCompleted;

  const durationLabel = hasCompleted ? "Completed In" : "Days Open";
  const durationValue = `${issue.daysOpen} day${issue.daysOpen === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <div className={cardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400 mb-1">
              {issue.issueId}
            </p>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {issue.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <IssueStatusBadge status={issue.status} />
            <IssuePriorityBadge priority={issue.priority} />
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-6 pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
          <Field label="Domain">
            <span className="capitalize">{issue.category}</span>
          </Field>
          {/* issue_staff.staff_name — display only, never ownership. */}
          <Field label="Raised By">{issue.staffName}</Field>
          {/* assignment_users.assignee_name — the actual Assignee. */}
          <Field label="Assignee">{issue.assigneeName}</Field>
          <Field label="Date Raised">{formatIsoDate(issue.createdDate)}</Field>
          <Field label="Assigned Date">{formatIsoTimestamp(issue.assignedAt)}</Field>
          <Field label="Last Activity">
            {issue.lastActivityAt ? formatIsoTimestamp(issue.lastActivityAt) : "—"}
          </Field>
          <Field label={durationLabel}>{durationValue}</Field>
          {hasCompleted && (
            <Field label="Completed">
              {issue.completedAt
                ? formatIsoTimestamp(issue.completedAt)
                : formatIsoDate(issue.completedDate!)}
            </Field>
          )}
        </dl>

        <div className="flex flex-col gap-6">
          <Block title="Description">{issue.description}</Block>
          {issue.resolution?.trim() && (
            // The historical intake-time text. NOT the Stage 6 outcome — that
            // is Final Resolution, in the Workflow block below.
            <Block title="Fix &amp; Action Required">{issue.resolution}</Block>
          )}
        </div>
      </div>

      {/* ── Images / Attachments ────────────────────────────────────────── */}
      {images.length > 0 && (
        <div className={cardClassName}>
          <h2 className={`${sectionHeadingClassName} mb-5`}>Images / Attachments</h2>
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
                        whitelisting hosts in next.config.ts. */}
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
                      className="mt-1.5 truncate text-xs text-neutral-500 dark:text-neutral-400"
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

      {/* ── Workflow / process details ──────────────────────────────────── */}
      {hasWorkflow && (
        <div className={`${cardClassName} flex flex-col gap-6`}>
          <h2 className={sectionHeadingClassName}>Workflow / Process Details</h2>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
            {hasProcessStarted && (
              <Field label="Process Started">{formatIsoTimestamp(issue.processStartedAt!)}</Field>
            )}
            {hasCompleted && (
              <Field label="Completed">
                {issue.completedAt
                  ? formatIsoTimestamp(issue.completedAt)
                  : formatIsoDate(issue.completedDate!)}
              </Field>
            )}
          </dl>

          {/* Each text block appears only when it holds something. */}
          {hasProgress && (
            <Block title="Implementation In Progress">{issue.implementationProgress}</Block>
          )}
          {hasDone && <Block title="Implementation Done">{issue.implementationDone}</Block>}
          {hasFinalResolution && <Block title="Final Resolution">{issue.finalResolution}</Block>}
        </div>
      )}
    </div>
  );
}
