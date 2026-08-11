"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import type { IssueLinkType } from "@/lib/queries/discussions";
import type { StaffRecord } from "@/lib/queries/staff";
import {
  createIssueForDiscussionAction,
  markDiscussionDiscussionOnlyAction,
  markDiscussionNewIssueRequiredAction,
  type DiscussionIssueLinkState,
} from "@/app/dashboard/discussions/[discussionId]/issue-link-actions";
import DiscussionIssueSearchLink from "./DiscussionIssueSearchLink";

const initialState: DiscussionIssueLinkState = {};
const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-0.5";

// Discussion-level counterpart of the Issue-linking section inside
// components/discussions/DiscussionPointCard.tsx — same three-state design
// (discussion_only / new_issue_required / linked_existing), now for the
// Discussion itself rather than one of its points (migration/008_discussion_groups.sql).
export default function DiscussionIssueLinkPanel({
  discussionId,
  discussionTitle,
  domain,
  issueLinkType,
  linkedIssueId,
  canLinkIssue,
  staff,
}: {
  discussionId: string;
  discussionTitle: string;
  domain: string | null;
  issueLinkType: IssueLinkType;
  linkedIssueId: string | null;
  canLinkIssue: boolean;
  staff: StaffRecord[];
}) {
  const [flagState, flagAction, flagPending] = useActionState(markDiscussionNewIssueRequiredAction, initialState);
  const [, revertAction, revertPending] = useActionState(markDiscussionDiscussionOnlyAction, initialState);
  const [createState, createAction, createPending] = useActionState(createIssueForDiscussionAction, initialState);
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Linked Issue
      </h2>

      {issueLinkType === "linked_existing" && linkedIssueId ? (
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/dashboard/issues/${linkedIssueId}`}
            className="font-mono text-neutral-800 dark:text-neutral-200 hover:underline"
          >
            {linkedIssueId}
          </Link>
          {canLinkIssue && (
            <form action={revertAction}>
              <input type="hidden" name="discussionId" value={discussionId} />
              <button type="submit" disabled={revertPending} className="text-xs text-neutral-400 hover:underline">
                Unlink
              </button>
            </form>
          )}
        </div>
      ) : !canLinkIssue ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-600">
          {issueLinkType === "new_issue_required" ? "Flagged: new Issue required" : "Discussion only — no Issue linked."}
        </p>
      ) : issueLinkType === "new_issue_required" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Flagged: new Issue required
            </span>
            <form action={revertAction}>
              <input type="hidden" name="discussionId" value={discussionId} />
              <button type="submit" disabled={revertPending} className="text-xs text-neutral-400 hover:underline">
                Revert to discussion-only
              </button>
            </form>
          </div>

          <DiscussionIssueSearchLink discussionId={discussionId} />

          {!showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:underline w-fit"
            >
              No existing match — create a new Issue
            </button>
          )}

          {showCreateForm && (
            <form
              action={createAction}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
            >
              <input type="hidden" name="discussionId" value={discussionId} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClassName}>Staff</label>
                  <select name="staffCode" required defaultValue="" className={inputClassName}>
                    <option value="" disabled>
                      Select…
                    </option>
                    {staff.map((s) => (
                      <option key={s.staffCode} value={s.staffCode}>
                        {s.staffName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClassName}>Category</label>
                  <input name="issueCategory" required defaultValue={domain ?? ""} className={inputClassName} />
                </div>
              </div>
              <div>
                <label className={labelClassName}>Title</label>
                <input name="issueTitle" required defaultValue={discussionTitle} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName}>Description</label>
                <textarea name="issueDescription" required rows={3} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName}>Priority</label>
                <select name="issuePriority" defaultValue="" className={inputClassName}>
                  <option value="">None</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={createPending}
                  className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
                >
                  {createPending ? "Creating…" : "Create & Link Issue"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {createState.error && <p className="text-xs text-red-600 dark:text-red-400">{createState.error}</p>}
          {createState.message && <p className="text-xs text-green-600 dark:text-green-400">{createState.message}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-400 dark:text-neutral-600">Discussion only — no Issue linked.</p>
          <form action={flagAction}>
            <input type="hidden" name="discussionId" value={discussionId} />
            <button
              type="submit"
              disabled={flagPending}
              className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline w-fit"
            >
              This reveals a real problem — flag as needing an Issue
            </button>
          </form>
          {flagState.error && <p className="text-xs text-red-600 dark:text-red-400">{flagState.error}</p>}
        </div>
      )}
    </div>
  );
}
