"use client";

import { useActionState, useState } from "react";

import {
  updateDiscussionActionAction,
  type DiscussionActionState,
} from "@/app/dashboard/discussions/[discussionId]/action-plan-actions";

type SourceActionEntry = string | { label: string; items: string[] };

const initialState: DiscussionActionState = {};

/** Plain-text rendering of the structured source_content.action, used only
 *  to prefill the edit textarea when there is no action_plan yet — never
 *  written back to source_content itself. */
function flattenSourceAction(action: SourceActionEntry[]): string {
  return action
    .map((entry) =>
      typeof entry === "string" ? entry : `${entry.label}\n${entry.items.map((item) => `- ${item}`).join("\n")}`
    )
    .join("\n\n");
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-1">
      {items.map((item) => (
        <li key={item} className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Read-only rendering of the structured source_content.action — identical
 *  markup to the version this replaced in DiscussionDetail.tsx's
 *  SourceContentSection, just relocated here since this is now the only
 *  place Action is rendered. */
function StructuredSourceAction({ entries }: { entries: SourceActionEntry[] }) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) =>
        typeof entry === "string" ? (
          <ul key={index} className="list-disc pl-5">
            <li className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{entry}</li>
          </ul>
        ) : (
          <div key={index}>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{entry.label}</p>
            <BulletList items={entry.items} />
          </div>
        )
      )}
    </div>
  );
}

/**
 * The Discussion detail page's ACTION block — editable, unlike the rest of
 * the source-content sections around it (Discussion/Channels/Requirement/
 * Examples stay pure read-only transcriptions of source_content). Display
 * rule: action_plan (the mutable, working field) wins whenever it has a
 * non-empty value; otherwise falls back to the original seeded
 * source_content.action. Saving always writes action_plan only —
 * source_content is never modified by this component.
 */
export default function DiscussionActionSection({
  discussionId,
  actionPlan,
  sourceAction,
  canEdit,
}: {
  discussionId: string;
  actionPlan: string | null;
  sourceAction: SourceActionEntry[] | undefined;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateDiscussionActionAction, initialState);
  const [editing, setEditing] = useState(false);

  const hasSourceAction = Boolean(sourceAction && sourceAction.length > 0);
  const trimmedActionPlan = actionPlan?.trim() || null;
  const usingActionPlan = Boolean(trimmedActionPlan);
  const editPrefill = trimmedActionPlan ?? (hasSourceAction ? flattenSourceAction(sourceAction!) : "");

  // Closes the form back to read-only view after a successful save —
  // adjusted during render (not an effect), same pattern as
  // DiscussionOperationalFields.tsx's prevMessage reset.
  const [prevMessage, setPrevMessage] = useState(state.message);
  if (state.message !== prevMessage) {
    setPrevMessage(state.message);
    if (state.message) {
      setEditing(false);
    }
  }

  if (!hasSourceAction && !trimmedActionPlan && !canEdit) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Action
        </h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        usingActionPlan ? (
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {trimmedActionPlan}
          </p>
        ) : hasSourceAction ? (
          <StructuredSourceAction entries={sourceAction!} />
        ) : (
          <p className="text-sm text-neutral-400 dark:text-neutral-600">Not set.</p>
        )
      ) : (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="discussionId" value={discussionId} />
          <textarea
            name="actionPlan"
            rows={5}
            defaultValue={editPrefill}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-100"
          />
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

      {!editing && state.message && (
        <p role="status" className="text-xs text-green-600 dark:text-green-400 mt-2">
          {state.message}
        </p>
      )}
    </div>
  );
}
