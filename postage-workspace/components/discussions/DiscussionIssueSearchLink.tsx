"use client";

import { useActionState, useState, useTransition } from "react";

import type { IssueListItem } from "@/lib/queries/issues";
import {
  linkIssueToDiscussionAction,
  searchIssuesForDiscussionLinkingAction,
  type DiscussionIssueLinkState,
} from "@/app/dashboard/discussions/[discussionId]/issue-link-actions";

const initialState: DiscussionIssueLinkState = {};

// Discussion-level counterpart of components/discussions/IssueSearchLink.tsx
// (which is point-scoped) — same search-before-link UI, so an existing
// Issue is always searched for first to avoid creating a duplicate.
export default function DiscussionIssueSearchLink({ discussionId }: { discussionId: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<IssueListItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [state, formAction, linkPending] = useActionState(linkIssueToDiscussionAction, initialState);

  function runSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const found = await searchIssuesForDiscussionLinkingAction(value);
      setResults(found);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={term}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search existing Issues by ID or title…"
        className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 w-full max-w-sm"
      />
      {isPending && <p className="text-xs text-neutral-400 dark:text-neutral-600">Searching…</p>}
      {!isPending && term.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-neutral-400 dark:text-neutral-600">No matching Issues found.</p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1 max-w-sm">
          {results.map((issue) => (
            <li
              key={issue.issueId}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-xs"
            >
              <span className="truncate">
                <span className="font-mono text-neutral-500 dark:text-neutral-400">{issue.issueId}</span>{" "}
                <span className="text-neutral-700 dark:text-neutral-300">{issue.title}</span>
              </span>
              <form action={formAction}>
                <input type="hidden" name="discussionId" value={discussionId} />
                <input type="hidden" name="issueId" value={issue.issueId} />
                <button
                  type="submit"
                  disabled={linkPending}
                  className="shrink-0 rounded-md bg-neutral-900 dark:bg-neutral-100 px-2 py-1 text-[11px] font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
                >
                  Link
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.message && <p className="text-xs text-green-600 dark:text-green-400">{state.message}</p>}
    </div>
  );
}
