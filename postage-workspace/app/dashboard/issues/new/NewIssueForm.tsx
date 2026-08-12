"use client";

import { useActionState } from "react";

import type { StaffRecord } from "@/lib/queries/staff";
import {
  AUDIO_ACCEPT,
  IMAGE_ACCEPT,
  MAX_AUDIO_FILES,
  MAX_IMAGE_FILES,
} from "@/lib/access/attachments";
import VoiceRecorder from "@/components/issues/VoiceRecorder";
import { createIssueAction, type NewIssueState } from "./actions";

// SUPER ADMIN — Add New Issue.
//
// ── FIELD SET COMES FROM THE LIVE DATA, NOT FROM IMAGINATION ────────────────
// Every field below maps to a real column, or to an extra_data key that
// recurs across the 145 existing Issues AND is already rendered somewhere in
// the application. Nothing was added because it "might be useful". The keys
// that exist in extra_data but are ingestion-pipeline provenance
// (sourceFile/sourceId/originalOwner, evidenceStatus/knownLimits/
// sourceFidelity/sourceType, classification/evidenceFiles, domainConfidence,
// documentGap, originalPriority) are deliberately absent — see the mapping
// comment in ./actions.ts.
//
// ── WHAT THE USER CANNOT SET ────────────────────────────────────────────────
// There is no input for Issue ID, status, created/updated timestamps, or any
// internal id. The ID still comes from issue_tracking.next_issue_id() inside
// the creating transaction, and the status is still hard-coded RED there.
// Adding a field named after one of those would change nothing: the Server
// Action never reads such a key.

const initialState: NewIssueState = {};

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";
const hintClassName = "mt-1 text-xs text-neutral-500 dark:text-neutral-400";
const sectionClassName =
  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex flex-col gap-4";
const sectionHeadingClassName =
  "text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500";

function Required() {
  return <span className="text-red-600 dark:text-red-400"> *</span>;
}

export default function NewIssueForm({
  staff,
  categories,
}: {
  /** issue_tracking.issue_staff — the REPORTER. Deliberately not
   *  assignment_users: "Raised By" and "Assignee" are different people and
   *  different tables, and conflating them is the mistake this prop name
   *  exists to prevent. Assignment happens separately, after creation. */
  staff: StaffRecord[];
  /** Existing issues.category values, offered as suggestions on a free-text
   *  input so a new Issue lands in an established Domain without the field
   *  becoming a closed list (the column is free text and has 10 values in
   *  use, including "not specified"). */
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(createIssueAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-3xl">
      {/* ── ISSUE DETAILS ──────────────────────────────────────────────── */}
      <section className={sectionClassName}>
        <h2 className={sectionHeadingClassName}>Issue Details</h2>

        <div>
          <label htmlFor="staffCode" className={labelClassName}>
            Raised By
            <Required />
          </label>
          <select id="staffCode" name="staffCode" required defaultValue="" className={inputClassName}>
            <option value="" disabled>
              Select who raised this…
            </option>
            {staff.map((s) => (
              <option key={s.staffCode} value={s.staffCode}>
                {s.staffName}
              </option>
            ))}
          </select>
          <p className={hintClassName}>
            The person reporting the Issue. Who will solve it is set separately by assigning the
            Issue.
          </p>
        </div>

        <div>
          <label htmlFor="title" className={labelClassName}>
            Title
            <Required />
          </label>
          <input id="title" name="title" type="text" required maxLength={200} className={inputClassName} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              placeholder="e.g. postage, listing, purchase"
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
            <select id="priority" name="priority" defaultValue="" className={inputClassName}>
              <option value="">Not set</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <p className={hintClassName}>Optional — most existing Issues leave this unset.</p>
          </div>
        </div>
      </section>

      {/* ── SOURCE / CONTEXT ───────────────────────────────────────────── */}
      <section className={sectionClassName}>
        <h2 className={sectionHeadingClassName}>Source / Context</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="member" className={labelClassName}>
              Member
            </label>
            <input id="member" name="member" type="text" maxLength={200} className={inputClassName} />
            <p className={hintClassName}>Team member this Issue relates to.</p>
          </div>

          <div>
            <label htmlFor="sku" className={labelClassName}>
              SKU
            </label>
            <input
              id="sku"
              name="sku"
              type="text"
              maxLength={200}
              placeholder="e.g. WCSN2BM"
              className={inputClassName}
            />
            <p className={hintClassName}>Product code, if the Issue is about a specific item.</p>
          </div>
        </div>

        <div>
          <label htmlFor="dataLink" className={labelClassName}>
            Data Link
          </label>
          <input
            id="dataLink"
            name="dataLink"
            type="url"
            maxLength={200}
            placeholder="https://…"
            className={inputClassName}
          />
          <p className={hintClassName}>
            Link to supporting data elsewhere. Shown on the Issue as a &ldquo;View Data&rdquo; button.
          </p>
        </div>
      </section>

      {/* ── DESCRIPTION ────────────────────────────────────────────────── */}
      <section className={sectionClassName}>
        <h2 className={sectionHeadingClassName}>Description</h2>

        <div>
          <label htmlFor="description" className={labelClassName}>
            Description
            <Required />
          </label>
          <textarea id="description" name="description" required rows={6} className={inputClassName} />
        </div>

        <div>
          <label htmlFor="whatIsHappening" className={labelClassName}>
            What Is Happening
          </label>
          <textarea id="whatIsHappening" name="whatIsHappening" rows={4} className={inputClassName} />
          <p className={hintClassName}>The observed behaviour, in operational terms.</p>
        </div>

        <div>
          <label htmlFor="rootCause" className={labelClassName}>
            Root Cause
          </label>
          <textarea id="rootCause" name="rootCause" rows={4} className={inputClassName} />
          <p className={hintClassName}>Why it is happening, if known.</p>
        </div>
      </section>

      {/* ── FIX / ACTION REQUIRED ──────────────────────────────────────── */}
      <section className={sectionClassName}>
        <h2 className={sectionHeadingClassName}>Fix / Action Required</h2>

        <div>
          <label htmlFor="resolution" className={labelClassName}>
            Fix &amp; Action Required
          </label>
          <textarea id="resolution" name="resolution" rows={4} className={inputClassName} />
          <p className={hintClassName}>
            The recommended fix at intake. This is separate from the Final Resolution the assignee
            records when the Issue is completed.
          </p>
        </div>
      </section>

      {/* ── EVIDENCE / ATTACHMENTS ─────────────────────────────────────── */}
      <section className={sectionClassName}>
        <h2 className={sectionHeadingClassName}>Evidence / Attachments</h2>

        <div>
          <label htmlFor="imageFiles" className={labelClassName}>
            Images (JPG / JPEG)
          </label>
          <input
            id="imageFiles"
            name="imageFiles"
            type="file"
            multiple
            accept={IMAGE_ACCEPT}
            className={`${inputClassName} file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 dark:file:bg-neutral-800 file:px-3 file:py-1 file:text-sm file:text-neutral-700 dark:file:text-neutral-300`}
          />
          <p className={hintClassName}>
            Up to {MAX_IMAGE_FILES} JPEG images, 10 MB each. Every file is re-checked on the server
            against its actual contents.
          </p>
        </div>

        <div>
          <label htmlFor="audioFiles" className={labelClassName}>
            Audio files
          </label>
          <input
            id="audioFiles"
            name="audioFiles"
            type="file"
            multiple
            accept={AUDIO_ACCEPT}
            className={`${inputClassName} file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 dark:file:bg-neutral-800 file:px-3 file:py-1 file:text-sm file:text-neutral-700 dark:file:text-neutral-300`}
          />
          <p className={hintClassName}>
            Up to {MAX_AUDIO_FILES} audio files, 25 MB each. MP3, M4A, WAV, OGG or WebM.
          </p>
        </div>

        <VoiceRecorder inputName="voiceRecording" />
      </section>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        New Issues are always created with status <span className="font-semibold">RED</span> and a
        server-generated Issue ID.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
        >
          {pending ? "Creating…" : "Create Issue"}
        </button>
      </div>
    </form>
  );
}
