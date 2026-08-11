import type { ReactNode } from "react";

import type { DiscussionDetail as DiscussionDetailData } from "@/lib/queries/discussions";
import type { StaffRecord } from "@/lib/queries/staff";
import DiscussionActionSection from "./DiscussionActionSection";
import DiscussionIssueLinkPanel from "./DiscussionIssueLinkPanel";
import DiscussionOperationalFields from "./DiscussionOperationalFields";
import DiscussionStatusBadge from "./DiscussionStatusBadge";
import DiscussionStatusPanel from "./DiscussionStatusPanel";

// Deliberately does NOT render the shared Meeting/Group banner (title,
// dates, objective, coordinator responsibilities) — that data still lives
// in issue_tracking.discussion_groups and is shown once, on the
// Discussions list ("Meeting / Group" column), never repeated on every
// individual Discussion's own page. See app/dashboard/discussions/[discussionId]/page.tsx,
// which no longer fetches the group for this component.
//
// Status and Linked Issue are handled ONLY here (DiscussionStatusPanel /
// DiscussionIssueLinkPanel rendered inline, no outer card of their own) —
// they are deliberately not rendered anywhere else on the page anymore, so
// there is exactly one Status control and one Linked Issue control per
// Discussion, not two.

function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) return "Not set";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function formatMeetingDates(start: string | null, end: string | null): string {
  if (!start && !end) return "Not set";
  if (start && end && start !== end) return `${formatIsoDate(start)} – ${formatIsoDate(end)}`;
  return formatIsoDate(start ?? end);
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

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
        {label}
      </h2>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function SourceSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
      {children}
    </h3>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-1">
      {items.map((item) => (
        <li key={item} className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * The original meeting-minute wording/structure for this Discussion,
 * transcribed as distinct optional sections (migration/009_discussion_source_content.sql).
 * Each section renders ONLY when this specific Discussion actually has
 * content for it — never a blank heading. Supports a nested labeled
 * sub-list inside Action (e.g. "Maintain updated knowledge of: <items>").
 */
function SourceContentSection({ discussion, canEdit }: { discussion: DiscussionDetailData; canEdit: boolean }) {
  const source = discussion.sourceContent;

  // Fallback: if no structured source_content.discussion narrative was
  // transcribed, but the legacy `objective` column still holds real text
  // (e.g. from the original migration, before source_content existed),
  // show that instead of silently dropping it — every stored word must
  // remain visible somewhere on the page. Never used when source_content
  // already provides its own "discussion" text (avoids showing the same
  // wording twice for entries where both happen to be set).
  const discussionText = source?.discussion?.trim() || discussion.objective?.trim() || null;

  const hasSourceAction = Boolean(source?.action && source.action.length > 0);
  const hasActionPlan = Boolean(discussion.actionPlan?.trim());

  // Action always renders (DiscussionActionSection handles the empty case
  // itself) whenever there's content OR the viewer can add some — so the
  // outer box must render too in that case, even with no other source
  // content at all.
  const hasAnySection =
    discussionText ||
    (source?.channels && source.channels.length > 0) ||
    source?.requirement?.trim() ||
    hasSourceAction ||
    hasActionPlan ||
    (source?.examples && source.examples.length > 0) ||
    canEdit;

  if (!hasAnySection) return null;

  return (
    <div className="flex flex-col gap-5 pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
      {discussionText && (
        <div>
          <SourceSectionHeading>Discussion</SourceSectionHeading>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {discussionText}
          </p>
        </div>
      )}

      {source?.channels && source.channels.length > 0 && (
        <div>
          <SourceSectionHeading>{source.channelsLabel || "Channels"}</SourceSectionHeading>
          <BulletList items={source.channels} />
        </div>
      )}

      {source?.requirement?.trim() && (
        <div>
          <SourceSectionHeading>Requirement</SourceSectionHeading>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {source?.requirement}
          </p>
        </div>
      )}

      <DiscussionActionSection
        discussionId={discussion.discussionId}
        actionPlan={discussion.actionPlan}
        sourceAction={source?.action}
        canEdit={canEdit}
      />

      {source?.examples && source.examples.length > 0 && (
        <div>
          <SourceSectionHeading>Examples</SourceSectionHeading>
          <BulletList items={source.examples} />
        </div>
      )}
    </div>
  );
}

export default function DiscussionDetail({
  discussion,
  groupTitle,
  staff,
  canEdit,
  canChangeStatus,
  canLinkIssue,
}: {
  discussion: DiscussionDetailData;
  /** Name only of the Discussion Group this Discussion belongs to (if any)
   *  — the full banner (dates/objective/coordinator responsibilities) is
   *  deliberately not repeated here, only shown once on the Discussions
   *  list. Null for a standalone Discussion. */
  groupTitle: string | null;
  /** Needed by the Linked Issue section's "create a new Issue" flow. */
  staff: StaffRecord[];
  /** discussion:edit — gates the operational-fields Edit button. */
  canEdit: boolean;
  canChangeStatus: boolean;
  canLinkIssue: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400 mb-1">{discussion.discussionId}</p>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {discussion.title}
            </h1>
          </div>
          <DiscussionStatusBadge status={discussion.status} />
        </div>

        <SourceContentSection discussion={discussion} canEdit={canEdit} />

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-6 pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
          <Field label="Meeting / Group">{groupTitle ?? "Not set"}</Field>
          <Field label="Meeting Date">
            {formatMeetingDates(discussion.meetingDateStart, discussion.meetingDateEnd)}
          </Field>
          <Field label="Coordinator">{discussion.coordinatorName ?? "Not set"}</Field>
          <Field label="Main Domain">
            <span className="capitalize">{discussion.domain ?? "Not set"}</span>
          </Field>
        </dl>

        <div className="pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
          <DiscussionOperationalFields
            discussionId={discussion.discussionId}
            duration={discussion.duration}
            processStarted={discussion.processStarted}
            processStartDate={discussion.processStartDate}
            estimatedFinishDate={discussion.estimatedFinishDate}
            actualFinishDate={discussion.actualFinishDate}
            canEdit={canEdit}
          />
        </div>

        <div className="pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
          <DiscussionStatusPanel
            discussionId={discussion.discussionId}
            status={discussion.status}
            hasFinalOutcome={Boolean(discussion.finalOutcome?.trim())}
            canChangeStatus={canChangeStatus}
          />
        </div>

        <div className="pb-6 mb-6 border-b border-neutral-100 dark:border-neutral-800">
          <DiscussionIssueLinkPanel
            discussionId={discussion.discussionId}
            discussionTitle={discussion.title}
            domain={discussion.domain}
            issueLinkType={discussion.issueLinkType}
            linkedIssueId={discussion.linkedIssueId}
            canLinkIssue={canLinkIssue}
            staff={staff}
          />
        </div>

        <div className="flex flex-col gap-5">
          <TextBlock label="Implementation / Progress" value={discussion.implementationProgress} />
          <TextBlock label="Final Outcome / Resolution" value={discussion.finalOutcome} />
        </div>
      </div>
    </div>
  );
}
