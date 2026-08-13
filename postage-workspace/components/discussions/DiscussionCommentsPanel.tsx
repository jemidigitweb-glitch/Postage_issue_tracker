"use client";

import { useActionState } from "react";

import { formatZonedTimestamp } from "@/lib/datetime";
import type { DiscussionComment } from "@/lib/queries/discussionComments";
import {
  addDiscussionCommentAction,
  type CommentActionState,
} from "@/app/dashboard/discussions/[discussionId]/comment-actions";

const initialState: CommentActionState = {};

// Genuine timestamp — converted to Asia/Colombo for display, same as every
// other converted timestamp in the application.
function formatIsoTimestamp(isoTimestamp: string): string {
  return formatZonedTimestamp(isoTimestamp);
}

export default function DiscussionCommentsPanel({
  discussionId,
  comments,
  canComment,
}: {
  discussionId: string;
  comments: DiscussionComment[];
  canComment: boolean;
}) {
  const [state, formAction, pending] = useActionState(addDiscussionCommentAction, initialState);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Comments
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-600 mb-4">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 mb-4">
          {comments.map((c) => (
            <li key={c.commentId} className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{c.authorName}</span>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  {formatIsoTimestamp(c.createdAt)}
                </span>
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="discussionId" value={discussionId} />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Add a comment…"
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
          />
          <div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              {pending ? "Posting…" : "Post Comment"}
            </button>
          </div>
          {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
