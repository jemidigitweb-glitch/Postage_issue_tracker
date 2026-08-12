import "server-only";

import type { PoolClient } from "pg";

import { getVerifiedClient, query } from "../db";
import { issueScopeQueryArgs, type IssueAccessScope } from "../access/permissions";
import { extractImplementationProgress } from "../access/issueWorkDetails";
import { scopePredicate, type IssueStatus } from "./issues";
import { IssueOwnershipError, StatusTransitionError } from "./issueStatus";

// Stage 6 — progress updates made WHILE an Issue is AMBER, and the read side
// of the work log.
//
// Deliberately separate from lib/queries/issueStatus.ts: nothing in this file
// changes an Issue's status, and nothing here can. updateIssueStatus() owns
// every transition; this file owns "same status, more detail".
//
// ── NO NEW TABLES ───────────────────────────────────────────────────────────
// Every write here reuses objects that already existed:
//   - issue_tracking.issues.implementation_progress   (the CURRENT text)
//   - issue_tracking.issue_comments, comment_type = 'investigation_note'
//     (the append-only log, from migration/002_issue_management_system.sql —
//     the 'investigation_note' discriminator has existed since that migration
//     and was previously unused)
// Refreshing issues.implementation_progress therefore never destroys the
// earlier text: the superseded value is already in the log, either as the
// issue_status_history.reason of the RED -> AMBER transition or as an
// earlier investigation_note.
//
// ── OWNERSHIP ───────────────────────────────────────────────────────────────
// Identical model to updateIssueStatus(): the assignee id comes from the
// session, never the form, and is re-verified INSIDE the transaction after
// the issues row is locked FOR UPDATE. issue_staff / "Raised By" is never an
// ownership source.

export interface RecordProgressInput {
  issueId: string;
  /** Already validated by validateProgressUpdate() in
   *  lib/access/issueWorkDetails.ts. Re-checked here for non-emptiness. */
  implementationProgress: string;
  authorUserId: number;
  /** See UpdateStatusInput.requireAssigneeId — same contract. Null means no
   *  ownership precondition (Super Admin). */
  requireAssigneeId?: number | null;
}

interface LockedIssueRow {
  status: IssueStatus;
}

/**
 * Appends one progress update to an Issue that is already AMBER.
 * Statement-level body ONLY — never BEGIN/COMMIT/ROLLBACK; the caller owns
 * the transaction (same convention as updateIssueStatusTx and
 * createAssigneeWithLoginTx).
 *
 * Refuses in every case that would leave a misleading record:
 *
 *   BEGIN
 *     SELECT status FROM issues ... FOR UPDATE
 *     verify ownership (current assignment only)
 *     verify status = AMBER            <- work must be in progress
 *     verify text is non-empty
 *     INSERT issue_comments (investigation_note)   <- append-only log
 *     UPDATE issues.implementation_progress        <- current value
 *   COMMIT
 *
 * The INSERT is ordered before the UPDATE so that if anything at all fails,
 * the rollback removes both — there is no window in which the current text
 * has moved on but the log entry is missing.
 *
 * Requiring AMBER is what keeps this from becoming a second, unguarded way
 * to record work: an Issue that is still RED has no progress to update (use
 * the RED -> AMBER transition), and a GREEN Issue is finished — GREEN is
 * terminal in this workflow and its record must not keep changing.
 */
export async function recordIssueProgressTx(
  client: PoolClient,
  input: RecordProgressInput
): Promise<void> {
  const text = input.implementationProgress.trim();
  if (!text) {
    throw new StatusTransitionError("Implementation In Progress is required.");
  }

  const current = await client.query<LockedIssueRow>(
    `SELECT status FROM issue_tracking.issues
     WHERE issue_id = $1 AND deleted_at IS NULL
     FOR UPDATE`,
    [input.issueId]
  );
  const row = current.rows[0];
  if (!row) {
    // Same indistinguishable-message rule as updateIssueStatus(): a scoped
    // caller must not be able to tell "does not exist" from "not yours".
    if (input.requireAssigneeId !== undefined && input.requireAssigneeId !== null) {
      throw new IssueOwnershipError("Issue not found or not assigned to you.");
    }
    throw new StatusTransitionError(`Issue "${input.issueId}" not found.`);
  }

  if (input.requireAssigneeId !== undefined && input.requireAssigneeId !== null) {
    const owned = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM issue_tracking.issue_assignments
         WHERE issue_id = $1 AND is_current = true AND assignee_id = $2
       ) AS ok`,
      [input.issueId, input.requireAssigneeId]
    );
    if (owned.rows[0]?.ok !== true) {
      throw new IssueOwnershipError("Issue not found or not assigned to you.");
    }
  }

  // Read from the locked row — never from the client.
  if (row.status !== "AMBER") {
    throw new StatusTransitionError(
      row.status === "GREEN"
        ? "This Issue is already completely solved — its work record cannot be changed."
        : "Start work on this Issue first — progress can only be added while it is in progress (AMBER)."
    );
  }

  await client.query(
    `INSERT INTO issue_tracking.issue_comments (issue_id, author_id, comment_type, body)
     VALUES ($1, $2, 'investigation_note', $3)`,
    [input.issueId, input.authorUserId, text]
  );

  await client.query(
    `UPDATE issue_tracking.issues
     SET implementation_progress = $2, updated_at = now()
     WHERE issue_id = $1`,
    [input.issueId, text]
  );
}

/** Public entry point: owns BEGIN/COMMIT/ROLLBACK around
 *  recordIssueProgressTx. Any failure rolls back both the log entry and the
 *  refreshed current value together. */
export async function recordIssueProgress(input: RecordProgressInput): Promise<void> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");
    await recordIssueProgressTx(client, input);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Read side — the merged work log
// ---------------------------------------------------------------------------

export type WorkLogKind = "status_change" | "progress_note";

export interface IssueWorkLogEntry {
  /** Unique within a single Issue's log: the source table's primary key,
   *  prefixed so a history_id and a comment_id can never collide. */
  key: string;
  kind: WorkLogKind;
  /** ISO timestamp (UTC). */
  at: string;
  /** display_name of the management_users row that wrote it. */
  authorName: string;
  /** Populated for kind === "status_change" only. */
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  /** The recorded text: issue_status_history.reason for a status change,
   *  issue_comments.body for a progress note. Null only for a pre-Stage-6
   *  status change, which recorded no reason. */
  body: string | null;
}

interface WorkLogRow {
  key: string;
  kind: WorkLogKind;
  at: string;
  author_name: string;
  from_status: IssueStatus | null;
  to_status: IssueStatus | null;
  body: string | null;
}

// ---------------------------------------------------------------------------
// Implementation Progress history
// ---------------------------------------------------------------------------

export type ProgressEntrySource = "note" | "status_change";

export interface IssueProgressEntry {
  /** Unique within one Issue: source-table prefix + primary key, so a
   *  comment_id and a history_id can never collide. */
  key: string;
  /** Where the entry is stored. Display does not distinguish them — both are
   *  progress the assignee typed — but it is carried for diagnosis. */
  source: ProgressEntrySource;
  /** ISO timestamp (UTC). */
  at: string;
  /** management_users.display_name, or null when the row's author cannot be
   *  resolved. Never invented. */
  authorName: string | null;
  text: string;
}

interface ProgressEntryRow {
  key: string;
  source: ProgressEntrySource;
  at: string;
  author_name: string | null;
  /** For a note this is the body; for a status change it is the whole
   *  `reason`, from which the progress section is extracted in TypeScript. */
  raw_text: string | null;
}

/**
 * EVERY Implementation Progress entry ever recorded for one Issue, oldest
 * first.
 *
 * ── WHY TWO SOURCES ─────────────────────────────────────────────────────────
 * Progress reaches the database by two different paths, and both are real:
 *
 *   1. issue_comments (comment_type = 'investigation_note')
 *      — every "Add Progress" submission while the Issue is AMBER.
 *   2. issue_status_history.reason
 *      — the progress typed when STARTING work (RED -> AMBER). That path
 *        records the text in `reason` and in the issues.implementation_progress
 *        snapshot; it does not append a note.
 *
 * Reading only (1) would hide the very first thing the assignee wrote, and
 * reading only the snapshot column would show just the latest line — which is
 * exactly the bug this function exists to fix. The snapshot remains as a
 * convenience for other callers; it is NOT the history.
 *
 * ── APPEND-ONLY, READ-ONLY ──────────────────────────────────────────────────
 * This is a SELECT. Nothing here writes, and the fix required no write-path
 * change at all: both tables were already append-only, so every entry an
 * assignee has ever submitted was already stored — it simply was not being
 * displayed. No migration, no new column, no new table.
 *
 * ── DE-DUPLICATION ──────────────────────────────────────────────────────────
 * Keyed on (exact text, exact second). Text alone would be wrong: the live
 * data already contains the same short text recorded at four different times,
 * and each of those is a genuinely separate event that must remain visible.
 * Two rows only collapse when they carry identical text at the identical
 * instant, which can only mean one event written to both tables.
 *
 * SCOPED with the same predicate as every other Issue read, so an assignee can
 * only ever retrieve the progress of an Issue currently assigned to them and
 * an out-of-scope Issue yields an empty array rather than an error.
 */
export async function listIssueProgressEntries(
  issueId: string,
  scope: IssueAccessScope
): Promise<IssueProgressEntry[]> {
  const { unrestricted, assigneeId } = issueScopeQueryArgs(scope);

  const result = await query<ProgressEntryRow>(
    `SELECT
       'c:' || c.comment_id::text AS key,
       'note'                     AS source,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
       u.display_name             AS author_name,
       c.body                     AS raw_text
     FROM issue_tracking.issue_comments c
     LEFT JOIN issue_tracking.management_users u ON u.user_id = c.author_id
     WHERE c.issue_id = $1
       AND c.comment_type = 'investigation_note'
       AND ${scopePredicate("c.issue_id", 2, 3)}

     UNION ALL

     SELECT
       'h:' || h.history_id::text,
       'status_change',
       to_char(h.changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       u.display_name,
       h.reason
     FROM issue_tracking.issue_status_history h
     LEFT JOIN issue_tracking.management_users u ON u.user_id = h.changed_by
     WHERE h.issue_id = $1
       AND h.to_status = 'AMBER'
       AND h.reason IS NOT NULL
       AND ${scopePredicate("h.issue_id", 2, 3)}

     ORDER BY at ASC, key ASC`,
    [issueId, unrestricted, assigneeId]
  );

  const entries: IssueProgressEntry[] = [];
  const seen = new Set<string>();

  for (const row of result.rows) {
    // A note's body IS the progress. A status-change reason may hold several
    // labelled sections; only the progress one is wanted, and a row with none
    // (an AMBER -> RED stop) contributes nothing.
    const text =
      row.source === "note"
        ? (row.raw_text ?? "").trim()
        : extractImplementationProgress(row.raw_text);

    if (!text) continue;

    const dedupeKey = `${row.at}::${text}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    entries.push({
      key: row.key,
      source: row.source,
      at: row.at,
      authorName: row.author_name,
      text,
    });
  }

  return entries;
}

/**
 * The full work log for one Issue, newest first: every status change (with
 * the work detail captured at that moment) merged with every AMBER progress
 * note.
 *
 * SCOPED. The same predicate every other Issue read uses — an assignee can
 * only ever retrieve the log of an Issue currently assigned to them, and an
 * out-of-scope (or nonexistent) Issue returns an empty array rather than an
 * error, so the caller cannot use this to probe for another assignee's work.
 *
 * Read-only: this function never writes and never deletes. Nothing in the
 * application removes rows from either source table, so the log is
 * append-only in practice as well as by intent.
 */
export async function listIssueWorkLog(
  issueId: string,
  scope: IssueAccessScope
): Promise<IssueWorkLogEntry[]> {
  const { unrestricted, assigneeId } = issueScopeQueryArgs(scope);

  const result = await query<WorkLogRow>(
    `SELECT
       'h:' || h.history_id::text AS key,
       'status_change'            AS kind,
       to_char(h.changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
       u.display_name             AS author_name,
       h.from_status,
       h.to_status,
       h.reason                   AS body
     FROM issue_tracking.issue_status_history h
     JOIN issue_tracking.management_users u ON u.user_id = h.changed_by
     WHERE h.issue_id = $1
       AND ${scopePredicate("h.issue_id", 2, 3)}

     UNION ALL

     SELECT
       'c:' || c.comment_id::text AS key,
       'progress_note'            AS kind,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
       u.display_name             AS author_name,
       NULL::varchar              AS from_status,
       NULL::varchar              AS to_status,
       c.body
     FROM issue_tracking.issue_comments c
     JOIN issue_tracking.management_users u ON u.user_id = c.author_id
     WHERE c.issue_id = $1
       AND c.comment_type = 'investigation_note'
       AND ${scopePredicate("c.issue_id", 2, 3)}

     ORDER BY at DESC, key DESC`,
    [issueId, unrestricted, assigneeId]
  );

  return result.rows.map((row) => ({
    key: row.key,
    kind: row.kind,
    at: row.at,
    authorName: row.author_name,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    body: row.body,
  }));
}
