"use client";

import { useActionState, useState } from "react";

import {
  updateDiscussionDomainAction,
  type DomainState,
} from "@/app/dashboard/discussions/[discussionId]/domain-actions";

const initialState: DomainState = {};

// Same Edit-toggle pattern, input styling and save/cancel layout as
// components/discussions/DiscussionOperationalFields.tsx, so the two inline
// editors on this page look and behave identically.
const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-100";

const DOMAIN_MAX_LENGTH = 50; // matches discussions.domain VARCHAR(50)

/**
 * The Discussion's own "Main Domain" (issue_tracking.discussions.domain),
 * displayed in place with an inline Edit control for users holding
 * discussion:edit. Existing domains are offered as datalist suggestions so
 * the list page's Domain filter stays coherent, while still allowing a new
 * value to be typed — the column is free text, not an enum.
 */
export default function DiscussionDomainField({
  discussionId,
  domain,
  domains,
  canEdit,
}: {
  discussionId: string;
  domain: string | null;
  /** Distinct existing domains, for suggestions only — not a restriction. */
  domains: string[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateDiscussionDomainAction, initialState);
  const [editing, setEditing] = useState(false);

  // Close the editor after a successful save — the page has revalidated by
  // then, so the read-only view already shows the new value. Adjusted during
  // render (not an effect), matching DiscussionOperationalFields.
  const [prevMessage, setPrevMessage] = useState(state.message);
  if (state.message !== prevMessage) {
    setPrevMessage(state.message);
    if (state.message) {
      setEditing(false);
    }
  }

  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
        Main Domain
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-medium normal-case tracking-normal text-neutral-500 dark:text-neutral-400 hover:underline"
          >
            Edit
          </button>
        )}
      </dt>
      <dd className="text-sm text-neutral-800 dark:text-neutral-200">
        {!editing ? (
          <>
            <span className="capitalize">{domain ?? "Not set"}</span>
            {state.message && (
              <p role="status" className="text-xs text-green-600 dark:text-green-400 mt-1">
                {state.message}
              </p>
            )}
          </>
        ) : (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="discussionId" value={discussionId} />
            <input
              name="domain"
              defaultValue={domain ?? ""}
              maxLength={DOMAIN_MAX_LENGTH}
              list={`domain-options-${discussionId}`}
              placeholder="e.g. listing, postage"
              className={inputClassName}
            />
            <datalist id={`domain-options-${discussionId}`}>
              {domains.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
              Leave blank to clear. Max {DOMAIN_MAX_LENGTH} characters.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
              >
                Cancel
              </button>
            </div>

            {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
          </form>
        )}
      </dd>
    </div>
  );
}
