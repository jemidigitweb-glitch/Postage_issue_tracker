"use client";

import type { FormEvent } from "react";
import { useActionState } from "react";

import { softDeleteDiscussionAction, type DeleteDiscussionState } from "@/app/dashboard/discussions/delete-actions";
import { TrashIcon } from "./icons";

const initialState: DeleteDiscussionState = {};

// Confirmation is required before submit (window.confirm names the exact
// Discussion ID + title being removed), and the Server Action re-checks
// "discussion:delete" server-side regardless of what the client sent — this
// button being hidden for unauthorized users is defense in depth, not the
// actual guard. Mirrors components/issues/IssueTable.tsx's delete-with-
// confirm pattern.
export default function DeleteDiscussionButton({
  discussionId,
  title,
}: {
  discussionId: string;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(softDeleteDiscussionAction, initialState);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      `Delete ${discussionId} - ${title}?\n\nThis will remove it from the active Discussions list.`
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="inline">
      <input type="hidden" name="discussionId" value={discussionId} />
      <button
        type="submit"
        disabled={pending}
        title={pending ? "Deleting…" : `Delete ${discussionId}`}
        aria-label={pending ? "Deleting…" : `Delete ${discussionId} - ${title}`}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
      >
        <TrashIcon />
      </button>
      {state.error && <span className="ml-2 text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
