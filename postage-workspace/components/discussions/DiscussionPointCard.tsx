"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import type { DiscussionPoint } from "@/lib/queries/discussionPoints";
import type { StaffRecord } from "@/lib/queries/staff";
import {
  createIssueForPointAction,
  markPointDiscussionOnlyAction,
  markPointNewIssueRequiredAction,
  updatePointAction,
  updatePointStatusAction,
  type PointActionState,
} from "@/app/dashboard/discussions/[discussionId]/points-actions";
import DiscussionStatusBadge from "./DiscussionStatusBadge";
import IssueSearchLink from "./IssueSearchLink";

const initialState: PointActionState = {};
const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-0.5";

function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) return "Not set";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function IssueLinkSection({
  discussionId,
  point,
  canLinkIssue,
  staff,
}: {
  discussionId: string;
  point: DiscussionPoint;
  canLinkIssue: boolean;
  staff: StaffRecord[];
}) {
  const [flagState, flagAction, flagPending] = useActionState(markPointNewIssueRequiredAction, initialState);
  const [, revertAction, revertPending] = useActionState(markPointDiscussionOnlyAction, initialState);
  const [createState, createAction, createPending] = useActionState(createIssueForPointAction, initialState);
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (point.issueLinkType === "linked_existing" && point.linkedIssueId) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">Linked Issue:</span>
        <Link
          href={`/dashboard/issues/${point.linkedIssueId}`}
          className="font-mono text-neutral-700 dark:text-neutral-300 hover:underline"
        >
          {point.linkedIssueId}
        </Link>
        {canLinkIssue && (
          <form action={revertAction}>
            <input type="hidden" name="discussionId" value={discussionId} />
            <input type="hidden" name="pointId" value={point.pointId} />
            <button type="submit" disabled={revertPending} className="text-neutral-400 hover:underline">
              Unlink
            </button>
          </form>
        )}
      </div>
    );
  }

  if (!canLinkIssue) {
    return (
      <p className="text-xs text-neutral-400 dark:text-neutral-600">
        {point.issueLinkType === "new_issue_required" ? "Flagged: new Issue required" : "Discussion only"}
      </p>
    );
  }

  if (point.issueLinkType === "new_issue_required") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Flagged: new Issue required
          </span>
          <form action={revertAction}>
            <input type="hidden" name="discussionId" value={discussionId} />
            <input type="hidden" name="pointId" value={point.pointId} />
            <button type="submit" disabled={revertPending} className="text-xs text-neutral-400 hover:underline">
              Revert to discussion-only
            </button>
          </form>
        </div>

        <IssueSearchLink discussionId={discussionId} pointId={point.pointId} />

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
          <form action={createAction} className="flex flex-col gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <input type="hidden" name="discussionId" value={discussionId} />
            <input type="hidden" name="pointId" value={point.pointId} />
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
                <input name="issueCategory" required defaultValue={point.domain ?? ""} className={inputClassName} />
              </div>
            </div>
            <div>
              <label className={labelClassName}>Title</label>
              <input name="issueTitle" required defaultValue={point.title} className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName}>Description</label>
              <textarea
                name="issueDescription"
                required
                rows={3}
                defaultValue={point.details ?? point.actionRequired ?? ""}
                className={inputClassName}
              />
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
    );
  }

  // discussion_only
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-400 dark:text-neutral-600">Discussion only</span>
        <form action={flagAction}>
          <input type="hidden" name="discussionId" value={discussionId} />
          <input type="hidden" name="pointId" value={point.pointId} />
          <button type="submit" disabled={flagPending} className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline">
            This is a real problem — flag as needing an Issue
          </button>
        </form>
      </div>
      {flagState.error && <p className="text-xs text-red-600 dark:text-red-400">{flagState.error}</p>}
    </div>
  );
}

export default function DiscussionPointCard({
  discussionId,
  point,
  canManagePoints,
  canLinkIssue,
  staff,
}: {
  discussionId: string;
  point: DiscussionPoint;
  canManagePoints: boolean;
  canLinkIssue: boolean;
  staff: StaffRecord[];
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction, editPending] = useActionState(updatePointAction, initialState);
  const [statusState, statusAction, statusPending] = useActionState(updatePointStatusAction, initialState);
  const [pendingGreen, setPendingGreen] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <span className="font-mono text-xs text-neutral-400 dark:text-neutral-600 mr-2">
            Point {point.pointNumber}
          </span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{point.title}</span>
        </div>
        <DiscussionStatusBadge status={point.status} />
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400 mb-3">
          {point.details && (
            <div className="sm:col-span-2">
              <span className="text-neutral-400 dark:text-neutral-600">Details: </span>
              {point.details}
            </div>
          )}
          {point.actionRequired && (
            <div className="sm:col-span-2">
              <span className="text-neutral-400 dark:text-neutral-600">Action Required: </span>
              {point.actionRequired}
            </div>
          )}
          <div>
            <span className="text-neutral-400 dark:text-neutral-600">Domain: </span>
            {point.domain ?? "Not set"}
          </div>
          <div>
            <span className="text-neutral-400 dark:text-neutral-600">Responsible: </span>
            {point.responsiblePerson ?? "Not set"}
          </div>
          {point.actionPlan && (
            <div className="sm:col-span-2">
              <span className="text-neutral-400 dark:text-neutral-600">Action Plan: </span>
              {point.actionPlan}
            </div>
          )}
          {point.implementationProgress && (
            <div className="sm:col-span-2">
              <span className="text-neutral-400 dark:text-neutral-600">Implementation/Progress: </span>
              {point.implementationProgress}
            </div>
          )}
          <div>
            <span className="text-neutral-400 dark:text-neutral-600">Process Started: </span>
            {point.processStarted === null ? "Not set" : point.processStarted ? "Yes" : "No"}
          </div>
          <div>
            <span className="text-neutral-400 dark:text-neutral-600">Est. Finish: </span>
            {formatIsoDate(point.estimatedFinishDate)}
          </div>
          <div>
            <span className="text-neutral-400 dark:text-neutral-600">Completed: </span>
            {formatIsoDate(point.completedDate)}
          </div>
          {point.finalOutcome && (
            <div className="sm:col-span-2">
              <span className="text-neutral-400 dark:text-neutral-600">Final Outcome: </span>
              {point.finalOutcome}
            </div>
          )}
        </div>
      ) : (
        <form action={editAction} className="flex flex-col gap-2 mb-3">
          <input type="hidden" name="discussionId" value={discussionId} />
          <input type="hidden" name="pointId" value={point.pointId} />
          <div>
            <label className={labelClassName}>Title</label>
            <input name="title" required defaultValue={point.title} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName}>Details</label>
            <textarea name="details" rows={2} defaultValue={point.details ?? ""} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName}>Action Required</label>
            <textarea
              name="actionRequired"
              rows={2}
              defaultValue={point.actionRequired ?? ""}
              className={inputClassName}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClassName}>Domain</label>
              <input name="domain" defaultValue={point.domain ?? ""} className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName}>Responsible Person/Team</label>
              <input name="responsiblePerson" defaultValue={point.responsiblePerson ?? ""} className={inputClassName} />
            </div>
          </div>
          <div>
            <label className={labelClassName}>Action Plan</label>
            <textarea name="actionPlan" rows={2} defaultValue={point.actionPlan ?? ""} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName}>Implementation / Progress</label>
            <textarea
              name="implementationProgress"
              rows={2}
              defaultValue={point.implementationProgress ?? ""}
              className={inputClassName}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelClassName}>Process Started</label>
              <select
                name="processStarted"
                defaultValue={point.processStarted === null ? "" : point.processStarted ? "yes" : "no"}
                className={inputClassName}
              >
                <option value="">Not set</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className={labelClassName}>Est. Finish</label>
              <input
                type="date"
                name="estimatedFinishDate"
                defaultValue={point.estimatedFinishDate ?? ""}
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>Completed Date</label>
              <input type="date" name="completedDate" defaultValue={point.completedDate ?? ""} className={inputClassName} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={editPending}
              className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              {editPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
            >
              Cancel
            </button>
          </div>
          {editState.error && <p className="text-xs text-red-600 dark:text-red-400">{editState.error}</p>}
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 pt-3">
        <div className="flex items-center gap-2">
          {canManagePoints && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
            >
              Edit
            </button>
          )}

          {canManagePoints && (
            <form
              action={statusAction}
              onSubmit={(e) => {
                const select = (e.currentTarget.elements.namedItem("status") as HTMLSelectElement | null);
                if (select?.value === "GREEN" && point.status !== "GREEN" && !point.finalOutcome) {
                  setPendingGreen(true);
                }
              }}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="discussionId" value={discussionId} />
              <input type="hidden" name="pointId" value={point.pointId} />
              <select
                name="status"
                defaultValue={point.status}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200"
              >
                <option value="RED">RED</option>
                <option value="AMBER">AMBER</option>
                <option value="GREEN">GREEN</option>
              </select>
              {pendingGreen && (
                <input
                  type="text"
                  name="finalOutcome"
                  placeholder="Final outcome (required for GREEN)"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1 text-xs w-52"
                />
              )}
              <button
                type="submit"
                disabled={statusPending}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
              >
                Update status
              </button>
            </form>
          )}
        </div>

        <IssueLinkSection discussionId={discussionId} point={point} canLinkIssue={canLinkIssue} staff={staff} />
      </div>

      {statusState.error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{statusState.error}</p>}
      {statusState.message && <p className="text-xs text-green-600 dark:text-green-400 mt-2">{statusState.message}</p>}
    </div>
  );
}
