"use client";

import { useActionState, useState } from "react";
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

// Sentinel <option> value that opens the "type a new Domain" input. Never
// itself a valid Domain — commitNewDomain() below is the only path that ever
// sets the real hidden-input value the form submits.
const ADD_NEW_DOMAIN = "__add_new_domain__";

// ── ADDITIONAL DETAILS ───────────────────────────────────────────────────────
// issue.extraData is the free-form JSONB captured by the historical intake
// (member, rootCause, whatIsHappening, documentGap, dataLink, and more —
// shape varies per row). A field gets an editable input here ONLY when its
// existing value is a plain string/number/boolean; images, attachments and
// any other non-primitive value (objects/arrays) stay read-only display, same
// as components/issues/IssueDetail.tsx shows them elsewhere. Submitted values
// are named `extra__<key>` and read back by edit-actions.ts's
// mergeEditableExtraData(), which is the actual write guard — this form only
// decides what to render, same as every other field here.
//
// Same humanize/format/filter rules as IssueDetail.tsx's "Additional
// details" block, duplicated rather than imported: this file has no other
// reason to depend on that component, and the two are free to diverge if
// either page's display needs change later.
function humanizeKey(key: string): string {
  const withSpaces = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return withSpaces
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatExtraValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

// Same two exclusion sets IssueDetail.tsx uses: keys with their own display
// treatment there (images/attachments galleries, which do not translate to
// this form) and intake/tracking metadata that is not useful to an editor.
const EXTRA_DETAIL_EXCLUDED_KEYS = new Set([
  "images",
  "attachments",
  "sourceid",
  "sourcefile",
  "evidencefiles",
  "originalowner",
  "classification",
]);

function additionalDetailEntries(extraData: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(extraData).filter(
    ([key, value]) => value !== null && value !== "" && !EXTRA_DETAIL_EXCLUDED_KEYS.has(normalizeKey(key))
  );
}

export default function EditIssueForm({
  issue,
  categories,
  hideResolution = false,
}: {
  issue: IssueDetail;
  /** Existing issues.category values, offered as choices in the Domain
   *  dropdown. "+ Add new Domain…" reveals a text input to add one not
   *  already in this list — client-side only; the server has no fixed
   *  Domain vocabulary and accepts whatever value the hidden field submits. */
  categories: string[];
  /** True for a self-raiser (role raised_by) — same restriction
   *  NewIssueForm.tsx already applies at creation: deciding the fix is
   *  management work, reporting the problem is not. Presentation only —
   *  updateIssueDetailsAction never reads this field's value for that role
   *  regardless of whether the input is rendered. */
  hideResolution?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateIssueDetailsAction, initialState);

  const extraEntries = additionalDetailEntries(issue.extraData);

  // The Issue's current Domain must always be selectable even if, somehow, it
  // is not among the other existing values passed in.
  const [domainOptions, setDomainOptions] = useState(() =>
    Array.from(new Set([issue.category, ...categories])).sort((a, b) => a.localeCompare(b))
  );
  const [domain, setDomain] = useState(issue.category);
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");

  function commitNewDomain() {
    const trimmed = domainDraft.trim();
    if (!trimmed) {
      setAddingDomain(false);
      return;
    }
    setDomainOptions((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed].sort((a, b) => a.localeCompare(b))
    );
    setDomain(trimmed);
    setDomainDraft("");
    setAddingDomain(false);
  }

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

          {/* The only field the form actually submits for Domain — driven by
              whichever of the two controls below is currently in play. */}
          <input type="hidden" name="category" value={domain} required />

          {addingDomain ? (
            <div className="flex gap-2">
              <input
                id="category"
                type="text"
                autoFocus
                maxLength={50}
                placeholder="Type a new Domain name"
                value={domainDraft}
                onChange={(event) => setDomainDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitNewDomain();
                  } else if (event.key === "Escape") {
                    setAddingDomain(false);
                    setDomainDraft("");
                  }
                }}
                className={inputClassName}
              />
              <button
                type="button"
                onClick={commitNewDomain}
                className="shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingDomain(false);
                  setDomainDraft("");
                }}
                className="shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <select
              id="category"
              value={domain}
              onChange={(event) => {
                if (event.target.value === ADD_NEW_DOMAIN) {
                  setAddingDomain(true);
                } else {
                  setDomain(event.target.value);
                }
              }}
              className={inputClassName}
            >
              {domainOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value={ADD_NEW_DOMAIN}>+ Add new Domain…</option>
            </select>
          )}
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

      {/* Hidden entirely when the Issue carries no such data, so a plain-text
          Issue's Edit screen looks exactly as it did before this section
          existed. A text/number/boolean value gets an editable input; images,
          attachments and anything else non-primitive stay read-only display —
          the caption below only applies to those. */}
      {extraEntries.length > 0 && (
        <section className={sectionClassName}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Additional details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            {extraEntries.map(([key, value]) => {
              const editable =
                typeof value === "string" || typeof value === "number" || typeof value === "boolean";
              return (
                <div key={key}>
                  <label className={labelClassName}>{humanizeKey(key)}</label>
                  {editable ? (
                    <textarea
                      name={`extra__${key}`}
                      rows={2}
                      defaultValue={String(value)}
                      className={inputClassName}
                    />
                  ) : (
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                      {formatExtraValue(value)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className={hintClassName}>
            Captured at intake. Images, attachments and other non-text values are not editable here.
          </p>
        </section>
      )}

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
