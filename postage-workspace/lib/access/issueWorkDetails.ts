// Pure rules for the work/implementation details that must accompany an
// Issue status change (Stage 6).
//
// DELIBERATELY has no `server-only` import, no `next/*` import, and no
// database import — same discipline as lib/access/permissions.ts and
// lib/access/issueWorkflow.ts, so every rule here is directly unit-testable
// (tests/issueWorkDetails.test.ts) without a request context or Postgres.
//
// This module decides WHAT must be supplied and whether it is acceptable. It
// never decides WHO may do it (lib/access/permissions.ts) and never decides
// whether the transition itself is legal (lib/access/issueWorkflow.ts). The
// RED -> AMBER -> GREEN workflow is UNCHANGED by this file: nothing here
// makes a previously-legal transition illegal for the Super Admin, and
// nothing here permits a transition classifyTransition() rejects.
//
// The workflow meanings this stage attaches to each status:
//   RED   — work not started
//   AMBER — work started / implementation in progress
//   GREEN — issue completely solved

import type { IssueStatusValue } from "./issueWorkflow";

/**
 * Upper bound on any single work-detail field.
 *
 * The underlying columns are TEXT (unbounded), so this is not a schema
 * requirement — it is a guard against a client posting a multi-megabyte body
 * into a field that is rendered back onto a page. Generous enough that no
 * genuine write-up is ever truncated; the value is REJECTED rather than
 * silently cut, so an assignee never loses text they typed without being told.
 */
export const MAX_WORK_DETAIL_LENGTH = 5000;

/** Field labels, used in both the error messages and the UI headings so the
 *  two can never drift apart. */
export const WORK_DETAIL_LABELS = {
  implementationProgress: "Implementation In Progress",
  implementationDone: "Implementation Done",
  finalResolution: "Final Resolution",
} as const;

/** Raw, client-supplied text. Every field is optional at this layer; which
 *  ones are actually REQUIRED depends on the transition. */
export interface WorkDetailsInput {
  implementationProgress?: string | null;
  implementationDone?: string | null;
  finalResolution?: string | null;
}

/** Validated and normalized. A field is null when it was not required and
 *  not supplied — the query layer treats null as "leave the existing column
 *  alone", never as "blank it out". */
export interface NormalizedWorkDetails {
  implementationProgress: string | null;
  implementationDone: string | null;
  finalResolution: string | null;
}

export type WorkDetailsResult =
  | { ok: true; value: NormalizedWorkDetails }
  | { ok: false; error: string };

/** Trim, and treat a whitespace-only value exactly as an empty one — so a
 *  textarea containing only spaces or newlines can never satisfy a
 *  "required" rule. */
function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function checkLength(label: string, value: string): string | null {
  if (value.length > MAX_WORK_DETAIL_LENGTH) {
    return `${label} must be ${MAX_WORK_DETAIL_LENGTH} characters or fewer.`;
  }
  return null;
}

/**
 * Which work-detail fields a transition into `toStatus` requires.
 *
 * Driven by the TARGET status, not by the source, so it is identical whether
 * the mover is an assignee or the Super Admin — "a status change captures
 * meaningful work details" is a property of the record, not of the role.
 * (Role still decides WHETHER the change is allowed at all; see
 * lib/access/permissions.ts.)
 */
export function requiredWorkDetailFields(
  toStatus: IssueStatusValue
): readonly (keyof NormalizedWorkDetails)[] {
  switch (toStatus) {
    case "AMBER":
      return ["implementationProgress"];
    case "GREEN":
      return ["implementationDone", "finalResolution"];
    case "RED":
      // Nothing transitions INTO RED — the workflow is forward-only and RED
      // is only ever the starting state. Listed explicitly so this switch is
      // exhaustive rather than relying on a default.
      return [];
  }
}

/**
 * Validates the work details supplied with a status transition.
 *
 * Returns ok:false with a user-safe message when a required field is missing
 * or a supplied field is over-length. Never echoes the submitted text back
 * in the message (which would reflect whatever the client sent onto the
 * page), and never reveals anything about the Issue itself.
 *
 * Fields that are not required by this transition are still validated for
 * length if supplied, and are still returned when non-empty — so a caller
 * may, for example, refresh the progress note in the same action that moves
 * an Issue to GREEN.
 */
export function validateTransitionWorkDetails(
  toStatus: IssueStatusValue,
  input: WorkDetailsInput
): WorkDetailsResult {
  const values: NormalizedWorkDetails = {
    implementationProgress: null,
    implementationDone: null,
    finalResolution: null,
  };

  const cleaned = {
    implementationProgress: clean(input.implementationProgress),
    implementationDone: clean(input.implementationDone),
    finalResolution: clean(input.finalResolution),
  } as const;

  for (const field of ["implementationProgress", "implementationDone", "finalResolution"] as const) {
    const lengthError = checkLength(WORK_DETAIL_LABELS[field], cleaned[field]);
    if (lengthError) {
      return { ok: false, error: lengthError };
    }
  }

  for (const field of requiredWorkDetailFields(toStatus)) {
    if (!cleaned[field]) {
      return { ok: false, error: `${WORK_DETAIL_LABELS[field]} is required.` };
    }
  }

  for (const field of ["implementationProgress", "implementationDone", "finalResolution"] as const) {
    values[field] = cleaned[field] || null;
  }

  return { ok: true, value: values };
}

/**
 * Validates a standalone progress update — an assignee adding to the record
 * while the Issue STAYS AMBER, with no status change at all.
 *
 * Kept separate from validateTransitionWorkDetails() because the caller's
 * intent is different: there is no target status to derive requirements
 * from, and the text is unconditionally required (an empty "update" would
 * append a blank entry to the work log).
 */
export function validateProgressUpdate(
  implementationProgress: string | null | undefined
): { ok: true; value: string } | { ok: false; error: string } {
  const value = clean(implementationProgress);
  if (!value) {
    return { ok: false, error: `${WORK_DETAIL_LABELS.implementationProgress} is required.` };
  }
  const lengthError = checkLength(WORK_DETAIL_LABELS.implementationProgress, value);
  if (lengthError) {
    return { ok: false, error: lengthError };
  }
  return { ok: true, value };
}

/**
 * Renders the work details captured at a transition into the single TEXT
 * value stored in the EXISTING issue_tracking.issue_status_history.reason
 * column — the append-only status audit trail created by
 * migration/002_issue_management_system.sql.
 *
 * Reusing `reason` (NULL on every row until now) is what keeps this stage
 * from inventing a parallel history table. The format is labelled so a
 * reader of the raw table can tell the fields apart, and so the merged
 * timeline on the Issue detail page can render it verbatim.
 *
 * Returns null when the transition carried no details at all, preserving the
 * previous behaviour of writing reason = NULL.
 */
/**
 * The inverse of formatStatusHistoryReason() for the progress field only:
 * pulls the "Implementation In Progress" text back out of a stored
 * issue_status_history.reason.
 *
 * ── WHY THIS IS NEEDED ──────────────────────────────────────────────────────
 * A RED -> AMBER transition records its progress text in `reason` and in the
 * issues.implementation_progress snapshot — it does NOT append an
 * issue_comments note. So the progress an assignee typed when STARTING work
 * lives in a different table from the progress they add later. To show one
 * continuous history, the reader merges both sources, and this function is
 * what recovers the text from the transition side.
 *
 * Returns null when the reason carries no progress section (an AMBER -> RED
 * stop, or a pre-Stage-6 row where reason is NULL), so those rows contribute
 * nothing rather than an empty entry.
 *
 * Deliberately tolerant of the multi-section format
 * ("<label>: <text>\n\n<label>: <text>") because a GREEN transition writes
 * several sections — only the progress one is extracted.
 */
export function extractImplementationProgress(reason: string | null): string | null {
  if (!reason) {
    return null;
  }
  const marker = `${WORK_DETAIL_LABELS.implementationProgress}: `;
  const start = reason.indexOf(marker);
  if (start === -1) {
    return null;
  }
  const afterMarker = reason.slice(start + marker.length);
  // Sections are separated by a blank line; stop at the next one.
  const end = afterMarker.indexOf("\n\n");
  const value = (end === -1 ? afterMarker : afterMarker.slice(0, end)).trim();
  return value || null;
}

export function formatStatusHistoryReason(details: NormalizedWorkDetails): string | null {
  const parts: string[] = [];
  if (details.implementationProgress) {
    parts.push(`${WORK_DETAIL_LABELS.implementationProgress}: ${details.implementationProgress}`);
  }
  if (details.implementationDone) {
    parts.push(`${WORK_DETAIL_LABELS.implementationDone}: ${details.implementationDone}`);
  }
  if (details.finalResolution) {
    parts.push(`${WORK_DETAIL_LABELS.finalResolution}: ${details.finalResolution}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}
