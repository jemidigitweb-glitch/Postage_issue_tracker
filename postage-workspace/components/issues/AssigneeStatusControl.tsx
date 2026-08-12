"use client";

import { useActionState, useState } from "react";

import type { IssueStatus } from "@/lib/queries/issues";
import {
  ASSIGNEE_STATUS_LABELS,
  assigneeStatusOptionList,
  CHANGE_STATUS_LABEL,
  CURRENT_STATUS_LABEL,
  STATUS_PLACEHOLDER,
} from "@/lib/access/issueStatusLabels";
import { WORK_DETAIL_LABELS } from "@/lib/access/issueWorkDetails";
import Listbox from "@/components/common/Listbox";
import {
  cardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  sectionHeadingClassName,
} from "@/components/common/formStyles";
import { updateIssueStatusAction, type StatusActionState } from "@/app/dashboard/issues/status-actions";
import IssueStatusBadge from "./IssueStatusBadge";
import WorkDetailTextarea from "./WorkDetailTextarea";

// ASSIGNEE PORTAL ONLY — the status control on the Issue detail page.
//
// Rendered exclusively when resolveIssueDetailView() returns
// showAssigneeStatusControl, i.e. for a caller holding
// issue:change_status_own_assigned and NOT issue:change_status_any. The Super
// Admin's detail page never renders this component, so their detail UI and
// their status behaviour are untouched.
//
// ── NO NATIVE <select> ──────────────────────────────────────────────────────
// The visible dropdown is components/common/Listbox — the application's own
// menu, styled with the app's border/radius/typography — not a native select
// painting Chrome's grey OS option list. The value still reaches the Server
// Action through the hidden `status` input below, exactly as before, so the
// submission path is unchanged.
//
// ── WORDING ─────────────────────────────────────────────────────────────────
// Status names only. All of it lives in lib/access/issueStatusLabels.ts:
//   heading      "Status" / "Change status"  (uppercased by the CSS class)
//   placeholder  "Select status"
//   options      "Not Solved" | "Partially Solved" | "Completely Solved"
// The explanatory suffixes that used to be appended to each option, and the
// meaning sentence that used to sit beside the current badge, are gone.
//
// ── OPTIONS ─────────────────────────────────────────────────────────────────
// assigneeStatusOptionList() derives its set from assigneeStatusOptions() —
// the SAME pure matrix the transaction enforces with
// classifyAssigneeTransition() — so the dropdown and the server can never
// disagree:
//
//   RED    -> Partially Solved
//   AMBER  -> Not Solved, Completely Solved
//   GREEN  -> nothing; the control is not rendered at all
//
// Hiding a choice is presentation. updateIssueStatusAction re-derives the
// caller's identity from the session, re-verifies ownership inside the
// transaction against issue_assignments (is_current = true), and re-applies
// the matrix against the row it has locked — a hand-crafted POST asking for
// RED -> GREEN or GREEN -> AMBER is refused there, not here.

const initialState: StatusActionState = {};

export default function AssigneeStatusControl({
  issueId,
  status,
  currentProgress,
}: {
  issueId: string;
  status: IssueStatus;
  /** Pre-fills the progress box when moving RED -> AMBER again after an
   *  AMBER -> RED, so previously-recorded work is not retyped from scratch.
   *  Nothing is lost either way — see the AMBER -> RED note below. */
  currentProgress: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateIssueStatusAction, initialState);

  // Reset the pending selection whenever the server hands back a fresh
  // status (after a successful save). "Adjust state during render", the
  // pattern already used elsewhere in this app — not an effect. The action
  // calls revalidatePath(), so the new status arrives on the same round trip
  // with no manual refresh and no window.location.reload().
  const [prevStatus, setPrevStatus] = useState(status);
  const [selected, setSelected] = useState<IssueStatus | "">("");
  if (status !== prevStatus) {
    setPrevStatus(status);
    setSelected("");
  }

  const options = assigneeStatusOptionList(status);

  return (
    <div className={`${cardClassName} flex flex-col gap-6`}>
      {/* ── STATUS ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h2 className={sectionHeadingClassName}>{CURRENT_STATUS_LABEL}</h2>
        {/* Badge only. No meaning sentence beside it — the status name is
            the whole statement. */}
        <div>
          <IssueStatusBadge status={status} label={ASSIGNEE_STATUS_LABELS[status]} />
        </div>
      </div>

      {options.length === 0 ? (
        // GREEN. No dropdown at all — not a disabled one — because there is
        // no transition out of GREEN for an assignee to attempt.
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          This Issue is completely solved. Its status is final and can no longer be changed.
        </p>
      ) : (
        <form
          action={formAction}
          className="flex flex-col gap-5 border-t border-neutral-100 dark:border-neutral-800 pt-5"
        >
          <input type="hidden" name="issueId" value={issueId} />
          {/* What the form actually submits. The Listbox is a presentational
              control over this value; the server re-checks it against a fixed
              list and against the Issue's real, row-locked current status
              regardless of what arrives. */}
          <input type="hidden" name="status" value={selected} />

          {/* ── CHANGE STATUS ─────────────────────────────────────────── */}
          <Listbox
            label={CHANGE_STATUS_LABEL}
            options={options}
            value={selected}
            placeholder={STATUS_PLACEHOLDER}
            disabled={pending}
            onChange={(next) => setSelected(next)}
            className="max-w-md"
          />

          {/* Which fields appear is driven by the status being moved TO,
              matching requiredWorkDetailFields() in
              lib/access/issueWorkDetails.ts. Unchanged by this stage. */}
          {selected === "AMBER" && (
            <WorkDetailTextarea
              name="implementationProgress"
              label={WORK_DETAIL_LABELS.implementationProgress}
              hint="What work has started, what is being investigated, and what action is currently being taken."
              defaultValue={currentProgress ?? ""}
              disabled={pending}
              autoFocus
            />
          )}

          {selected === "GREEN" && (
            <>
              <WorkDetailTextarea
                name="implementationDone"
                label={WORK_DETAIL_LABELS.implementationDone}
                hint="Exactly what action or fix was implemented."
                disabled={pending}
                autoFocus
              />
              <WorkDetailTextarea
                name="finalResolution"
                label={WORK_DETAIL_LABELS.finalResolution}
                hint="The final outcome, and why this Issue is considered completely solved."
                disabled={pending}
              />
            </>
          )}

          {/* Moving back to Not Solved asks for nothing. It records that work
              has stopped; it does NOT erase anything. The progress text, the
              process-start timestamp, every investigation note and every
              status-history row all remain — see lib/queries/issueStatus.ts. */}
          {selected === "RED" && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              This records that work has stopped. Your existing progress notes, the process-start
              time, and the full work log are all kept.
            </p>
          )}

          {selected !== "" && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={pending} className={primaryButtonClassName}>
                {pending ? "Saving…" : "Save status"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setSelected("")}
                className={secondaryButtonClassName}
              >
                Cancel
              </button>
            </div>
          )}

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
      )}
    </div>
  );
}
