"use client";

import { useState, useTransition } from "react";

import type { DiscussionStatus } from "@/lib/queries/discussions";
import { updateDiscussionStatusAction } from "@/app/dashboard/discussions/[discussionId]/status-actions";

// Final business rule: RED = not started, AMBER = in progress,
// GREEN = completed/finished (final — no way out of GREEN, no reopen).
// Mirrors lib/queries/discussionStatus.ts's ALLOWED_TRANSITIONS exactly —
// this is a UI convenience only; the server enforces the same map
// independently and rejects anything else regardless of what this dropdown
// offers.
const ALLOWED_TRANSITIONS: Readonly<Record<DiscussionStatus, readonly DiscussionStatus[]>> = {
  RED: ["AMBER"],
  AMBER: ["RED", "GREEN"],
  GREEN: [],
};

const ALL_STATUSES: readonly DiscussionStatus[] = ["RED", "AMBER", "GREEN"];

// Same pill-select visual pattern and color families as
// components/issues/AssignedIssueCard.tsx's "Solved Status" control — UI
// pattern copied only. lib/queries/issueStatus.ts is never imported here.
const STATUS_SELECT_STYLES: Record<DiscussionStatus, string> = {
  RED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50",
  AMBER:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50",
  GREEN:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50",
};

export default function DiscussionStatusPanel({
  discussionId,
  status,
  hasFinalOutcome,
  canChangeStatus,
}: {
  discussionId: string;
  status: DiscussionStatus;
  hasFinalOutcome: boolean;
  canChangeStatus: boolean;
}) {
  // The single source of truth for everything this panel paints: the label,
  // the RED/AMBER/GREEN colour, and which options the dropdown allows next.
  // It is client state, so it changes the moment the user picks a status —
  // it never waits on revalidatePath/refresh to repaint.
  const [currentStatus, setCurrentStatus] = useState<DiscussionStatus>(status);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error?: string; message?: string }>({});

  // Adopt the server-rendered prop ONLY when it actually changes to a new
  // value — i.e. a navigation, or the refresh() after a save catching up.
  // Deliberately not `if (status !== currentStatus)`: that would let a
  // not-yet-refreshed prop stomp a freshly saved status back to the old one,
  // which is the bug this panel had.
  const [serverStatus, setServerStatus] = useState<DiscussionStatus>(status);
  if (status !== serverStatus) {
    setServerStatus(status);
    setCurrentStatus(status);
  }

  function changeStatus(nextStatus: DiscussionStatus) {
    const previousStatus = currentStatus;
    // (4) Immediate, before any await: text, colour and allowed options all
    // read from currentStatus, so all three update on this line.
    setCurrentStatus(nextStatus);
    setFeedback({});

    startTransition(async () => {
      const formData = new FormData();
      formData.append("discussionId", discussionId);
      formData.append("status", nextStatus);

      const result = await updateDiscussionStatusAction({}, formData);

      if (result.error || !result.status) {
        // Rejected by the server (permission or transition rule) — put the
        // panel back to the status that is actually stored.
        setCurrentStatus(previousStatus);
        setFeedback({ error: result.error ?? "Could not update status. Please try again." });
        return;
      }

      // (3)/(7) Commit the status the server confirms it wrote.
      setCurrentStatus(result.status);
      setFeedback({ message: result.message });
    });
  }

  // All three statuses are always listed in the dropdown (visible), but
  // options that aren't a valid transition from the current status are
  // rendered disabled rather than omitted — e.g. GREEN stays visible while
  // RED but greyed out/unselectable, since RED -> GREEN isn't allowed. The
  // server enforces the same ALLOWED_TRANSITIONS map independently either
  // way, so this is a display choice only, never the actual guard.
  const selectableOptions = [currentStatus, ...ALLOWED_TRANSITIONS[currentStatus]];

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Status
      </h2>

      {currentStatus === "GREEN" ? (
        // GREEN is final — no dropdown, no reopen control of any kind.
        <div className="flex items-center gap-3 mb-2">
          <span
            className={`inline-block rounded-full border px-3 py-1.5 text-sm font-medium ${STATUS_SELECT_STYLES.GREEN}`}
          >
            GREEN
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Completed — final status.</span>
        </div>
      ) : canChangeStatus ? (
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <select
            name="status"
            aria-label="Discussion Status"
            value={currentStatus}
            onChange={(event) => changeStatus(event.target.value as DiscussionStatus)}
            // Deliberately NOT the native `disabled` attribute while pending —
            // several browsers freeze a <select>'s displayed option text
            // (though not its CSS-driven border/background color, which is a
            // separate paint) the instant a select is disabled in the same
            // render as its value changes, producing a color-updates-but-text-
            // doesn't-update bug. pointer-events-none blocks interaction
            // without ever putting the element in the native disabled state.
            className={`rounded-full border px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors ${STATUS_SELECT_STYLES[currentStatus]} ${isPending ? "opacity-60 pointer-events-none" : ""}`}
          >
            {ALL_STATUSES.map((option) => (
              <option key={option} value={option} disabled={!selectableOptions.includes(option)}>
                {option}
              </option>
            ))}
          </select>
          {/* This branch only renders when currentStatus is RED or AMBER (the
              GREEN case returns above), so the hint is about the transition
              *into* GREEN, not about already being GREEN. Show it exactly when
              GREEN is the next allowed step — i.e. AMBER — and the server-side
              final-outcome guard in lib/queries/discussionStatus.ts would
              reject the change. */}
          {ALLOWED_TRANSITIONS[currentStatus].includes("GREEN") && !hasFinalOutcome && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Final outcome required before GREEN.
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-2">
          <span
            className={`inline-block rounded-full border px-3 py-1.5 text-sm font-medium ${STATUS_SELECT_STYLES[currentStatus]}`}
          >
            {currentStatus}
          </span>
        </div>
      )}

      {feedback.error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{feedback.error}</p>}
      {feedback.message && <p className="text-sm text-green-600 dark:text-green-400 mb-2">{feedback.message}</p>}
    </div>
  );
}
