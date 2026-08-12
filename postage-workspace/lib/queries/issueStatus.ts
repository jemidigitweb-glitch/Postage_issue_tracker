import "server-only";

import type { PoolClient } from "pg";

import { getVerifiedClient } from "../db";
import { classifyAssigneeTransition, classifyTransition } from "../access/issueWorkflow";
import {
  formatStatusHistoryReason,
  requiredWorkDetailFields,
  WORK_DETAIL_LABELS,
  type NormalizedWorkDetails,
} from "../access/issueWorkDetails";
import type { IssueStatus } from "./issues";

// Status-change workflow, recorded into issue_tracking.issue_status_history
// (see migration/002_issue_management_system.sql). Reuses that table rather
// than creating a new one. Rules (CLAUDE.md "Solved Status Workflow"):
//   RED -> AMBER -> GREEN, forward-only (same-status re-selection is a
//   no-op). Once AMBER or GREEN, the status can never move back to RED;
//   once GREEN, it can never move back to any earlier status. There is no
//   reopen path — leaving GREEN is not permitted from any caller.
//
// UNCHANGED by Stage 3. The rules themselves live in
// lib/access/issueWorkflow.ts as a pure function so they can be unit-tested
// without a database; the mapping applied here (noop -> rollback and report
// success, backward -> reject, forward -> apply) is byte-for-byte the same
// behaviour as before.
//
// Stage 3 ADDS an optional ownership precondition — it does not alter any
// transition rule. See requireAssigneeId on UpdateStatusInput.
//
// ── STAGE 6: WORK / IMPLEMENTATION DETAILS ──────────────────────────────────
// A status change now carries the work behind it, written in the SAME
// transaction as the status itself:
//
//   RED -> AMBER   requires "Implementation In Progress"; stamps
//                  process_started_at (server clock, first time only).
//   -> GREEN       requires "Implementation Done" AND "Final Resolution";
//                  stamps completed_at + the pre-existing completed_date.
//
// ── TWO TRANSITION RULE SETS ────────────────────────────────────────────────
// `workflow` selects which one applies, and the two are fully separate:
//
//   "unrestricted" (default, Super Admin / issue:change_status_any)
//       classifyTransition() — forward-only, GREEN terminal. UNCHANGED.
//       Omitting `workflow` reproduces the original behaviour exactly, so no
//       existing caller is affected by the assignee rules existing.
//
//   "assignee" (role 'staff')
//       classifyAssigneeTransition() — RED->AMBER, AMBER->RED, AMBER->GREEN
//       allowed; RED->GREEN, GREEN->AMBER, GREEN->RED blocked.
//
// AMBER -> RED (assignee) requires no work details and ERASES NOTHING:
// implementation_progress, process_started_at, the investigation-note log and
// every status-history row are all left exactly as they were, because the
// UPDATE below only ever COALESCEs supplied values over existing ones and
// only ever stamps timestamps on the way INTO AMBER/GREEN.
//
// Storage reuses what already existed wherever possible (see
// migration/012_issue_work_details.sql for the full audit):
//   - issue_status_history.reason — the work detail captured AT the
//     transition. Previously always NULL.
//   - issues.completed_date       — previously unused; now the date half of
//     the completion stamp.
// The five new columns exist only because nothing in the schema could hold
// progress/done/final-resolution text or a start timestamp.
//
// ── TRANSACTION SHAPE ───────────────────────────────────────────────────────
// Same convention as lib/queries/assigneeAccounts.ts: a …Tx function holds
// the statements and NEVER issues BEGIN/COMMIT/ROLLBACK, plus a thin public
// wrapper that owns the transaction. That is what lets
// scripts/verify-issue-work-progress.ts drive the real logic against the real
// schema inside a transaction it always rolls back, leaving zero rows behind.

export class StatusTransitionError extends Error {}

/** Thrown when the caller is scoped to their own assigned Issues and this
 *  Issue is not currently assigned to them. Deliberately carries a message
 *  that does not confirm the Issue exists. */
export class IssueOwnershipError extends Error {}

/**
 * Signals a same-status "change".
 *
 * A no-op must roll the transaction back and report success — but a …Tx
 * function must never ROLLBACK itself, so it signals the outcome and lets
 * whoever owns the transaction decide. The public wrapper converts this into
 * the exact behaviour that existed before Stage 6: ROLLBACK, then return the
 * unchanged status. Not exported: no caller outside this file should ever
 * have to think about it.
 */
class NoopTransition extends Error {
  constructor(readonly status: IssueStatus) {
    super("No status change requested.");
  }
}

export interface UpdateStatusInput {
  issueId: string;
  newStatus: IssueStatus;
  changedByUserId: number;
  /**
   * When set, the update is permitted ONLY if this assignee currently holds
   * the Issue (a row in issue_tracking.issue_assignments with
   * is_current = true). Null/undefined means "no ownership precondition" and
   * is reserved for callers holding issue:change_status_any (Super Admin).
   *
   * The check runs INSIDE the same transaction, after the issues row is
   * locked with FOR UPDATE, so it cannot race a concurrent reassignment.
   */
  requireAssigneeId?: number | null;
  /**
   * Work/implementation details to record with this transition, ALREADY
   * validated by lib/access/issueWorkDetails.ts. Re-checked here against
   * requiredWorkDetailFields() before anything is written — the caller's
   * validation is never the only gate, so a future call site that forgets to
   * validate cannot produce a GREEN Issue with no resolution.
   */
  work?: NormalizedWorkDetails;
  /**
   * Which transition rule set applies.
   *
   *   "unrestricted" (DEFAULT) — the Super Admin / issue:change_status_any
   *     path. Uses classifyTransition(): forward-only, GREEN terminal.
   *     UNCHANGED from before the Assignee Portal stage; omitting this field
   *     reproduces the original behaviour exactly.
   *
   *   "assignee" — the role 'staff' path. Uses classifyAssigneeTransition()
   *     and the approved matrix: RED->AMBER, AMBER->RED, AMBER->GREEN
   *     allowed; RED->GREEN, GREEN->AMBER, GREEN->RED blocked.
   *
   * Chosen by the Server Action from the caller's permissions, never from
   * the form.
   */
  workflow?: "unrestricted" | "assignee";
}

export interface UpdateStatusResult {
  status: IssueStatus;
}

interface IssueStatusRow {
  status: IssueStatus;
}

const NO_WORK_DETAILS: NormalizedWorkDetails = {
  implementationProgress: null,
  implementationDone: null,
  finalResolution: null,
};

/** A user-safe explanation for a transition the assignee matrix refuses.
 *  Says only what the workflow permits — never anything about who else can
 *  do it or about the Issue's contents. */
function assigneeBlockedMessage(fromStatus: IssueStatus, toStatus: IssueStatus): string {
  if (fromStatus === "GREEN") {
    return "This Issue is completely solved. Its status is final and cannot be changed.";
  }
  if (fromStatus === "RED" && toStatus === "GREEN") {
    return "Start work on this Issue first — it must be in progress before it can be marked completely solved.";
  }
  return "That status change is not allowed.";
}

/**
 * Validates and applies one status transition, recording it in
 * issue_status_history. Statement-level body ONLY — never BEGIN/COMMIT/
 * ROLLBACK. `FOR UPDATE` on the issues row prevents two concurrent status
 * changes on the same Issue from racing.
 *
 * Stage 6 atomicity contract — status, work details, the timestamps and the
 * history row are written inside the SAME transaction as the ownership and
 * precondition checks:
 *
 *   BEGIN
 *     SELECT ... FOR UPDATE          (lock the Issue)
 *     verify ownership               (current assignment only)
 *     verify transition is legal
 *     verify required fields present
 *     UPDATE issues                  (status + work details + timestamps)
 *     INSERT issue_status_history    (evidence, with reason)
 *   COMMIT
 *
 * Any failure at any point throws, and the wrapper's catch rolls the whole
 * thing back — so the database can never hold GREEN without a resolution,
 * nor a resolution whose status change failed.
 */
export async function updateIssueStatusTx(
  client: PoolClient,
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  const current = await client.query<IssueStatusRow>(
    `SELECT status FROM issue_tracking.issues WHERE issue_id = $1 FOR UPDATE`,
    [input.issueId]
  );
  const row = current.rows[0];
  if (!row) {
    // For an ownership-scoped caller, "no such Issue" and "not your Issue"
    // must be indistinguishable, so both raise IssueOwnershipError with the
    // same message. An unscoped caller (Super Admin) still gets the precise
    // error it always did.
    if (input.requireAssigneeId !== undefined && input.requireAssigneeId !== null) {
      throw new IssueOwnershipError("Issue not found or not assigned to you.");
    }
    throw new StatusTransitionError(`Issue "${input.issueId}" not found.`);
  }

  // ── Ownership precondition (Stage 3) ──────────────────────────────────────
  // Runs after FOR UPDATE has locked the issues row and before anything is
  // written, so a concurrent assignment change cannot slip between the check
  // and the update. Ownership comes only from issue_assignments — never from
  // issues.staff_code / issue_staff ("Raised By").
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

  // fromStatus comes from the row this transaction has LOCKED — never from
  // the client, so a form claiming the Issue is already AMBER cannot get past
  // the rules below.
  const fromStatus = row.status;
  const toStatus = input.newStatus;

  if (input.workflow === "assignee") {
    // ── ASSIGNEE matrix ─────────────────────────────────────────────────────
    // Entirely separate from the branch below; nothing here can affect a
    // caller running the unrestricted workflow.
    const transition = classifyAssigneeTransition(fromStatus, toStatus);
    if (transition === "noop") {
      throw new NoopTransition(fromStatus);
    }
    if (transition === "blocked") {
      throw new StatusTransitionError(assigneeBlockedMessage(fromStatus, toStatus));
    }
  } else {
    // ── UNRESTRICTED (Super Admin) — UNCHANGED ──────────────────────────────
    const transition = classifyTransition(fromStatus, toStatus);
    if (transition === "noop") {
      throw new NoopTransition(fromStatus);
    }
    if (transition === "backward") {
      throw new StatusTransitionError("Status cannot move backwards.");
    }
  }

  // ── Required work details, re-checked server-side ─────────────────────────
  const work = input.work ?? NO_WORK_DETAILS;
  for (const field of requiredWorkDetailFields(toStatus)) {
    if (!work[field]) {
      throw new StatusTransitionError(`${WORK_DETAIL_LABELS[field]} is required.`);
    }
  }

  // One UPDATE for status, work details and timestamps, so they can never
  // land separately.
  //
  // COALESCE($n, column) on each text field means "write it if supplied,
  // otherwise leave what is already there" — a transition never blanks a
  // field it did not collect.
  //
  // process_started_at uses COALESCE(process_started_at, now()) so the moment
  // work began is stamped once and never moved by a later transition or
  // progress update.
  //
  // completed_at / completed_date are set only on the way into GREEN, and
  // likewise only if not already set. completed_date is the pre-existing
  // (previously unused) DATE column; writing both keeps one concept at two
  // precisions rather than adding a second "date completed".
  await client.query(
    `UPDATE issue_tracking.issues
     SET status = $2::VARCHAR(20),
         implementation_progress = COALESCE($3::text, implementation_progress),
         implementation_done     = COALESCE($4::text, implementation_done),
         final_resolution        = COALESCE($5::text, final_resolution),
         process_started_at = CASE WHEN $2 = 'AMBER'
                                   THEN COALESCE(process_started_at, now())
                                   ELSE process_started_at END,
         completed_at       = CASE WHEN $2 = 'GREEN'
                                   THEN COALESCE(completed_at, now())
                                   ELSE completed_at END,
         completed_date     = CASE WHEN $2 = 'GREEN'
                                   THEN COALESCE(completed_date, CURRENT_DATE)
                                   ELSE completed_date END,
         updated_at = now()
     WHERE issue_id = $1`,
    [
      input.issueId,
      toStatus,
      work.implementationProgress,
      work.implementationDone,
      work.finalResolution,
    ]
  );

  // Existing append-only audit table, existing columns. `reason` was NULL on
  // every row until Stage 6; it now carries the work detail captured at this
  // transition, so the evidence lives with the status change that produced it
  // rather than in a parallel structure.
  await client.query(
    `INSERT INTO issue_tracking.issue_status_history
       (issue_id, from_status, to_status, changed_by, is_reopen, reason)
     VALUES ($1, $2, $3, $4, false, $5)`,
    [input.issueId, fromStatus, toStatus, input.changedByUserId, formatStatusHistoryReason(work)]
  );

  return { status: toStatus };
}

/**
 * Public entry point: owns BEGIN/COMMIT/ROLLBACK around updateIssueStatusTx.
 *
 * Same-status "changes" are a no-op — rolled back and reported as success,
 * exactly as before Stage 6. Any rejected transition, failed ownership check,
 * or missing required field throws, and the rollback guarantees the Issue,
 * its work details, and its history are all left exactly as they were.
 */
export async function updateIssueStatus(input: UpdateStatusInput): Promise<UpdateStatusResult> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");
    const result = await updateIssueStatusTx(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof NoopTransition) {
      return { status: error.status };
    }
    throw error;
  } finally {
    client.release();
  }
}
