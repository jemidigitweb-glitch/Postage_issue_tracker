"use client";

import { useActionState } from "react";
import Link from "next/link";

import type { IssueDetail } from "@/lib/queries/issues";
import { updateIssueDetailsAction, type EditIssueState } from "../edit-actions";

// Field set and styling mirror app/dashboard/issues/new/NewIssueForm.tsx's
// main (always-visible) section exactly — same five columns this project
// treats as "normal Issue information": Title, Domain, Priority,
// Description, Fix & Action Required. Issue ID, Raised By, status,
// created/updated timestamps, assignment, and every audit/history table are
// deliberately absent: there is no input for any of them, and the Server
// Action (edit-actions.ts) never reads a form key for any of them either.

const initialState: EditIssueState = {};

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";
const hintClassName = "mt-1 text-xs text-neutral-500 dark:text-neutral-400";
const sectionClassName =
  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex flex-col gap-4";

function Required() {
  return <span className="text-red-600 dark:text-red-400"> *</span>;
}

export default function EditIssueForm({
  issue,
  categories,
  hideResolution = false,
}: {
  issue: IssueDetail;
  /** Existing issues.category values, offered as suggestions on the free-text
   *  Domain input — same convention as the New Issue form. */
  categories: string[];
  /** True for a self-raiser (role raised_by) — same restriction
   *  NewIssueForm.tsx already applies at creation: deciding the fix is
   *  management work, reporting the problem is not. Presentation only —
   *  updateIssueDetailsAction never reads this field's value for that role
   *  regardless of whether the input is rendered. */
  hideResolution?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateIssueDetailsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-3xl">
      <input type="hidden" name="issueId" value={issue.issueId} />

      <section className={sectionClassName}>
        <div>
          <label htmlFor="title" className={labelClassName}>
            Title
            <Required />
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            defaultValue={issue.title}
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor="category" className={labelClassName}>
            Domain
            <Required />
          </label>
          <input
            id="category"
            name="category"
            type="text"
            required
            maxLength={50}
            list="issue-categories"
            defaultValue={issue.category}
            className={inputClassName}
          />
          <datalist id="issue-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="priority" className={labelClassName}>
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={issue.priority ?? ""}
            className={inputClassName}
          >
            <option value="">Not set</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div>
          <label htmlFor="description" className={labelClassName}>
            Description
            <Required />
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={6}
            defaultValue={issue.description}
            className={inputClassName}
          />
        </div>

        {!hideResolution && (
          <div>
            <label htmlFor="resolution" className={labelClassName}>
              Fix &amp; Action Required
            </label>
            <textarea
              id="resolution"
              name="resolution"
              rows={4}
              defaultValue={issue.resolution ?? ""}
              className={inputClassName}
            />
            <p className={hintClassName}>Optional.</p>
          </div>
        )}
      </section>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {pending ? "Saving…" : "Save Changes"}
        </button>
        <Link
          href={`/dashboard/issues/${issue.issueId}`}
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
