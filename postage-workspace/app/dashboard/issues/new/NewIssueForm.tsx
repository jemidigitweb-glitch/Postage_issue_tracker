"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";

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

/**
 * One collapsed-by-default section. Used twice — Additional Details and
 * Evidence / Attachments — and each use owns its own independent state, so
 * opening one can never open or close the other. There is no shared context
 * and no sibling coordination: two instances, two `useState`s.
 *
 * ── WHY THE PANEL IS HIDDEN, NOT UNMOUNTED ──────────────────────────────────
 * The panel is hidden with the `hidden` attribute while everything inside it
 * stays mounted in the DOM at all times. Three consequences, all deliberate:
 *
 *  1. Typed values survive collapsing and re-opening — the elements holding
 *     them are never destroyed.
 *  2. A SELECTED FILE survives too. A file input's FileList lives on the DOM
 *     node and cannot be restored by React; unmounting one silently discards
 *     the user's choice. The same applies to the recorder's own React state,
 *     its in-memory blob, and its preview object URL — VoiceRecorder's unmount
 *     cleanup revokes that URL and stops the stream, so unmounting it would
 *     throw away a recording the user had already made.
 *  3. The FormData this form submits is byte-for-byte what it was before these
 *     controls existed — every field is present and named whether its section
 *     is open or closed. A CSS-hidden input is still submitted (unlike a
 *     disabled one), so the Server Action, its validation, the upload path and
 *     every mapping see exactly what they saw before.
 *
 * ── THE "Added" INDICATOR ───────────────────────────────────────────────────
 * Rather than controlling any field, the panel listens for events bubbling up
 * from its own subtree and then asks the DOM whether ANY control inside it now
 * holds a value. Every field stays UNCONTROLLED — no `value` prop anywhere —
 * so this state can never become the source of truth for what gets submitted;
 * it only decides whether a badge is painted.
 *
 * `onClick` is listened to as well as `onChange` because "Attach recording"
 * populates its file input programmatically (via DataTransfer), which fires no
 * change event. The click bubbles after the recorder's own handler has run, so
 * by then the input reflects the attachment.
 *
 * ── ACCESSIBILITY ───────────────────────────────────────────────────────────
 * A heading containing a real <button type="button"> — the standard accordion
 * pattern. It is focusable and operable with Enter and Space for free, and
 * `type="button"` means it can never submit the form. State is exposed with
 * aria-expanded, the panel is wired to it with aria-controls, and the panel is
 * a region labelled by the header text. The chevron is decorative and marked
 * aria-hidden.
 *
 * No new dependency: local state and one DOM query.
 */
function CollapsibleSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const panelId = `${id}-panel`;
  const labelId = `${id}-label`;

  // React's synthetic change event bubbles, so one handler on the panel sees
  // every input, textarea and select inside it — including on each keystroke.
  function recomputeHasContent() {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const fields = panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    );
    setHasContent(Array.from(fields).some((field) => field.value.trim() !== ""));
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className="w-full flex items-center justify-between gap-3 rounded-xl px-5 py-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
        >
          <span id={labelId} className={sectionHeadingClassName}>
            {title}
          </span>
          <span className="flex items-center gap-2">
            {hasContent && (
              <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Added
              </span>
            )}
            <span aria-hidden="true" className="text-xs text-neutral-400 dark:text-neutral-500">
              {open ? "▴" : "▾"}
            </span>
          </span>
        </button>
      </h2>

      {/* `hidden` (the attribute) rather than conditional rendering — see the
          note above. It also removes the panel from the accessibility tree
          while collapsed, which hiding with CSS alone would not. */}
      <div
        id={panelId}
        ref={panelRef}
        role="region"
        aria-labelledby={labelId}
        hidden={!open}
        onChange={recomputeHasContent}
        onClick={recomputeHasContent}
        className="px-5 pb-5 flex flex-col gap-4"
      >
        {children}
      </div>
    </section>
  );
}

export default function NewIssueForm({
  staff,
  categories,
  selfRaiserName = null,
}: {
  /** issue_tracking.issue_staff — the REPORTER. Deliberately not
   *  assignment_users: "Raised By" and "Assignee" are different people and
   *  different tables, and conflating them is the mistake this prop name
   *  exists to prevent. Assignment happens separately, after creation. */
  staff: StaffRecord[];
  /** Set for a SELF-RAISER (role raised_by): the display name of the raiser
   *  the server will use, shown read-only instead of the picker.
   *
   *  When this is set the form renders NO input named "staffCode" at all — not
   *  a disabled select, not a hidden field. There is deliberately nothing to
   *  submit, because the server resolves the raiser from the session and would
   *  ignore a submitted value anyway. Rendering a hidden field would only
   *  suggest the value matters.
   *
   *  Null for the Super Admin and management, whose form is unchanged. */
  selfRaiserName?: string | null;
  /** Existing issues.category values, offered as suggestions on a free-text
   *  input so a new Issue lands in an established Domain without the field
   *  becoming a closed list (the column is free text and has 10 values in
   *  use, including "not specified"). */
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(createIssueAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-3xl">
      {/* ── MAIN FIELDS — ALWAYS VISIBLE ───────────────────────────────────
          Deliberately carries NO section heading: these four fields are the
          form, and a label above them ("Required Information" or similar)
          would be a caption for the obvious. Required validation and every
          field name are exactly as they were. */}
      <section className={sectionClassName}>
        {selfRaiserName ? (
          <div>
            <span className={labelClassName}>Raised By</span>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {selfRaiserName}
            </p>
            <p className={hintClassName}>
              Issues you create are raised in your own name.
            </p>
          </div>
        ) : (
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
        )}

        <div>
          <label htmlFor="title" className={labelClassName}>
            Title
            <Required />
          </label>
          <input id="title" name="title" type="text" required maxLength={200} className={inputClassName} />
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
          <label htmlFor="description" className={labelClassName}>
            Description
            <Required />
          </label>
          <textarea id="description" name="description" required rows={6} className={inputClassName} />
        </div>
      </section>

      {/* ── ADDITIONAL DETAILS — COLLAPSED BY DEFAULT ──────────────────────
          Every OPTIONAL field, in one place, immediately after Description.
          None of them became required, none was renamed, and none changed
          where it is stored:
            priority        -> issues.priority
            member          -> extra_data.member
            sku             -> extra_data.sku
            dataLink        -> extra_data.dataLink
            whatIsHappening -> extra_data.whatIsHappening
            rootCause       -> extra_data.rootCause
            resolution      -> issues.resolution (NOT final_resolution) */}
      <CollapsibleSection id="additional-details" title="Additional Details">
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
          <p className={hintClassName}>Optional.</p>
        </div>

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
          <p className={hintClassName}>Link to supporting data elsewhere.</p>
        </div>

        <div>
          <label htmlFor="whatIsHappening" className={labelClassName}>
            What Is Happening
          </label>
          <textarea id="whatIsHappening" name="whatIsHappening" rows={4} className={inputClassName} />
        </div>

        {/* Root Cause is investigation and Fix & Action Required is
            resolution — both management work, and a self-raiser holds neither
            permission. Omitted for them entirely rather than shown disabled,
            so the form asks only for what they are actually reporting. The
            server skips both keys for this role regardless of what is
            submitted; hiding them here is presentation, not the guard. */}
        {!selfRaiserName && (
          <>
            <div>
              <label htmlFor="rootCause" className={labelClassName}>
                Root Cause
              </label>
              <textarea id="rootCause" name="rootCause" rows={4} className={inputClassName} />
              <p className={hintClassName}>Why it is happening, if known.</p>
            </div>

            <div>
              <label htmlFor="resolution" className={labelClassName}>
                Fix &amp; Action Required
              </label>
              <textarea id="resolution" name="resolution" rows={4} className={inputClassName} />
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* ── EVIDENCE / ATTACHMENTS — COLLAPSED BY DEFAULT ──────────────────
          A SEPARATE, independent section — deliberately NOT inside Additional
          Details. Its contents are unchanged: the same two file inputs with
          the same names, accept lists and limits, and the same VoiceRecorder
          with all of its record / stop / preview / attach / remove / re-record
          behaviour. Only the wrapper around them changed.

          Everything here stays MOUNTED while collapsed (see CollapsibleSection
          above) — a file input's FileList and the recorder's blob, preview URL
          and attached state cannot survive an unmount, so collapsing must
          never be allowed to destroy them. */}
      <CollapsibleSection id="evidence" title="Evidence / Attachments">
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
      </CollapsibleSection>

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
