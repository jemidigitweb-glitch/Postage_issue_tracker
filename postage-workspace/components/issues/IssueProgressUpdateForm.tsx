"use client";

import { useActionState, useState } from "react";

import { WORK_DETAIL_LABELS } from "@/lib/access/issueWorkDetails";
import { primaryButtonClassName } from "@/components/common/formStyles";
import { recordIssueProgressAction, type StatusActionState } from "@/app/dashboard/issues/status-actions";
import WorkDetailTextarea from "./WorkDetailTextarea";

const initialState: StatusActionState = {};

/**
 * ADDS a progress entry to an Issue while it stays AMBER.
 *
 * ── ADD, NOT EDIT ───────────────────────────────────────────────────────────
 * Every submission APPENDS a new, permanent row to
 * issue_tracking.issue_comments (comment_type = 'investigation_note'). No
 * earlier entry is ever rewritten or removed. The wording, the empty box, and
 * the button label all say "add" for that reason — an earlier version
 * pre-filled this box with the latest text and called the button "Save
 * progress", which read as though the previous note were being edited. It
 * never was; the storage has always been append-only.
 *
 * The box therefore starts EMPTY: pre-filling it with the last entry would
 * invite the user to lightly edit it and resubmit, producing a near-duplicate
 * entry that reads like a correction of something that in fact still exists
 * unchanged above.
 *
 * Rendered only for an Issue that is currently AMBER and only for a caller
 * holding a status-change permission. That is an affordance, not the guard:
 * recordIssueProgressAction re-derives the caller from the session, and
 * recordIssueProgress() re-verifies ownership and re-reads the status from the
 * row it has locked, inside one transaction.
 *
 * Immediacy: the Server Action calls revalidatePath() for this Issue, so the
 * new entry is rendered by the server on the same round trip — it appears at
 * the bottom of the history above. No window.location.reload(), no manual
 * refresh.
 */
export default function IssueProgressUpdateForm({
  issueId,
  /** Count of entries already recorded. Used only to clear the textarea once
   *  the server confirms a new one landed. */
  entryCount,
}: {
  issueId: string;
  entryCount: number;
}) {
  const [state, formAction, pending] = useActionState(recordIssueProgressAction, initialState);

  // Remount the textarea (clearing it) once the server reports one more entry
  // than we last saw. Keyed off server-supplied data — "adjust state during
  // render", the pattern used elsewhere in this app, not an effect.
  const [seenCount, setSeenCount] = useState(entryCount);
  const [formKey, setFormKey] = useState(0);
  if (entryCount !== seenCount) {
    setSeenCount(entryCount);
    setFormKey((key) => key + 1);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="issueId" value={issueId} />

      <WorkDetailTextarea
        key={formKey}
        name="implementationProgress"
        label={`Add ${WORK_DETAIL_LABELS.implementationProgress}`}
        hint="Describe what has happened since the last entry. This is added as a new entry — everything above is kept."
        disabled={pending}
        rows={3}
      />

      <div>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? "Adding…" : "Add Progress"}
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-xs text-green-600 dark:text-green-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
