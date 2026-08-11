"use client";

import { useActionState, useState } from "react";

import type { DiscussionParticipant } from "@/lib/queries/discussionParticipants";
import {
  addParticipantAction,
  type ParticipantActionState,
} from "@/app/dashboard/discussions/[discussionId]/participant-actions";

const initialState: ParticipantActionState = {};

export default function DiscussionParticipantsPanel({
  discussionId,
  participants,
  canEdit,
}: {
  discussionId: string;
  participants: DiscussionParticipant[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(addParticipantAction, initialState);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Participants
      </h2>

      {participants.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-600 mb-3">No participants recorded.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 mb-3">
          {participants.map((p) => (
            <li key={p.participantId} className="text-sm text-neutral-800 dark:text-neutral-200">
              <span className="font-medium">{p.name}</span>
              {p.isCoordinator && (
                <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                  Coordinator
                </span>
              )}
              {p.roleTitle && <span className="text-neutral-500 dark:text-neutral-400"> — {p.roleTitle}</span>}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:underline"
            >
              + Add participant
            </button>
          ) : (
            <form action={formAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="discussionId" value={discussionId} />
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
                  Name
                </label>
                <input
                  name="name"
                  required
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs w-40"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
                  Role / Team
                </label>
                <input
                  name="roleTitle"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs w-48"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 pb-1.5">
                <input type="checkbox" name="isCoordinator" className="h-3.5 w-3.5" />
                Coordinator
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
              >
                {pending ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
              >
                Cancel
              </button>
            </form>
          )}
          {state.error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{state.error}</p>}
        </>
      )}
    </div>
  );
}
