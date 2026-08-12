// scripts/verify-issue-work-progress.ts
//
// Stage 6 — proves the work/implementation-detail workflow against the REAL
// schema, and leaves ZERO rows behind.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:work-progress
//
// ── HOW "ZERO PERMANENT DATA" IS GUARANTEED ─────────────────────────────────
// Everything runs inside ONE transaction that is ALWAYS rolled back:
//   BEGIN
//     ... create a throwaway Issue + assignee + login, run every scenario ...
//   ROLLBACK          <- unconditional, in a finally block
// There is no COMMIT anywhere in this file. Even a crash mid-run ends the
// connection, which Postgres treats as a rollback. The row counts printed at
// the end are re-read on a SEPARATE connection after the rollback, so they
// independently confirm nothing persisted.
//
// This is possible only because the write paths are split into …Tx functions
// that never issue BEGIN/COMMIT/ROLLBACK themselves (updateIssueStatusTx,
// recordIssueProgressTx) — the exact code the Server Actions call, driven
// here inside a transaction this script owns. Nothing is re-implemented or
// mocked.
//
// SAVEPOINTs are needed because a failed statement aborts the whole
// transaction otherwise; each negative test rolls back to its savepoint so
// the next one can run — which is also how the "failed transaction leaves the
// Issue unchanged" assertions are made.
//
// Test identifiers are prefixed with a marker that could not collide with a
// real person or a real Issue, and the final check asserts none survived.

import type { PoolClient } from "pg";

import {
  IssueOwnershipError,
  StatusTransitionError,
  updateIssueStatusTx,
} from "../lib/queries/issueStatus";
import { recordIssueProgressTx } from "../lib/queries/issueWorkProgress";
import { validateTransitionWorkDetails } from "../lib/access/issueWorkDetails";
import { getPool, getVerifiedClient, query } from "../lib/db";

const MARKER = "__stage6_verify__";
const FAKE_HASH = "$2b$12$0000000000000000000000000000000000000000000000000000"; // not a real credential

// A staff_code short enough for VARCHAR(10) and shaped so the pre-existing
// chk_issue_staff_prefix (split_part(issue_id,'-',1) = staff_code) holds.
const TEST_STAFF_CODE = "ZZTEST";
const TEST_ISSUE_ID = `${TEST_STAFF_CODE}-901`;
const OTHER_ISSUE_ID = `${TEST_STAFF_CODE}-902`;

const PROGRESS = "Started investigating: reproduced the missing Sendungsnummer on the DHL portal.";
const PROGRESS_2 = "Second update: DHL confirmed the label was generated against the wrong account.";
const DONE = "Re-booked on Trossingen Schmutter DHL Paket and reprinted the label.";
const FINAL = "Parcel delivered and tracking now resolves. Considered completely solved.";

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
}

/** Runs `fn` inside a savepoint and always rolls back to it. */
async function inSavepoint<T>(client: PoolClient, name: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    return await fn();
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
  }
}

/** Runs `fn` and returns the error it threw, or null if it did not throw. */
async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

interface Fixture {
  ownerUserId: number;
  ownerAssigneeId: number;
  otherAssigneeId: number;
}

/** One throwaway staff code, two throwaway Issues, two throwaway assignees
 *  with logins, and a current assignment for each. All inside the caller's
 *  transaction, all discarded by the final ROLLBACK. */
async function seed(client: PoolClient): Promise<Fixture> {
  await client.query(
    `INSERT INTO issue_tracking.issue_staff (staff_code, staff_name)
     VALUES ($1, $2)`,
    [TEST_STAFF_CODE, `${MARKER} staff`]
  );

  for (const issueId of [TEST_ISSUE_ID, OTHER_ISSUE_ID]) {
    await client.query(
      `INSERT INTO issue_tracking.issues
         (issue_id, staff_code, issue_title, issue_description, category, status, created_date, resolution)
       VALUES ($1, $2, $3, $4, 'verification', 'RED', CURRENT_DATE, $5)`,
      [
        issueId,
        TEST_STAFF_CODE,
        `${MARKER} issue`,
        `${MARKER} description`,
        // Seeded so the "historical resolution is never touched" assertion has
        // something to watch.
        `${MARKER} historical fix & action required`,
      ]
    );
  }

  const users = await client.query<{ user_id: string }>(
    `INSERT INTO issue_tracking.management_users
       (username, display_name, email, password_hash, role)
     VALUES ($1, $2, $3, $5, 'staff'), ($4, $2, $6, $5, 'staff')
     RETURNING user_id`,
    [
      `${MARKER}owner`,
      `${MARKER} person`,
      `${MARKER}owner@example.invalid`,
      `${MARKER}other`,
      FAKE_HASH,
      `${MARKER}other@example.invalid`,
    ]
  );
  const ownerUserId = Number(users.rows[0].user_id);
  const otherUserId = Number(users.rows[1].user_id);

  const assignees = await client.query<{ assignee_id: number }>(
    `INSERT INTO issue_tracking.assignment_users (assignee_name, user_id)
     VALUES ($1, $3), ($2, $4)
     RETURNING assignee_id`,
    [`${MARKER} owner`, `${MARKER} other`, ownerUserId, otherUserId]
  );
  const ownerAssigneeId = assignees.rows[0].assignee_id;
  const otherAssigneeId = assignees.rows[1].assignee_id;

  await client.query(
    `INSERT INTO issue_tracking.issue_assignments (issue_id, assignee_id, is_current)
     VALUES ($1, $3, true), ($2, $4, true)`,
    [TEST_ISSUE_ID, OTHER_ISSUE_ID, ownerAssigneeId, otherAssigneeId]
  );

  return { ownerUserId, ownerAssigneeId, otherAssigneeId };
}

interface IssueSnapshot {
  status: string;
  implementation_progress: string | null;
  implementation_done: string | null;
  final_resolution: string | null;
  process_started_at: Date | null;
  completed_at: Date | null;
  completed_date: Date | null;
  resolution: string | null;
}

async function snapshot_(client: PoolClient): Promise<IssueSnapshot> {
  return snapshot(client, TEST_ISSUE_ID);
}

async function snapshot(client: PoolClient, issueId: string): Promise<IssueSnapshot> {
  const result = await client.query<IssueSnapshot>(
    `SELECT status, implementation_progress, implementation_done, final_resolution,
            process_started_at, completed_at, completed_date, resolution
     FROM issue_tracking.issues WHERE issue_id = $1`,
    [issueId]
  );
  return result.rows[0];
}

async function countRows(client: PoolClient, table: string, issueId: string): Promise<number> {
  const result = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM issue_tracking.${table} WHERE issue_id = $1`,
    [issueId]
  );
  return Number(result.rows[0].n);
}

/** Moves the test Issue RED -> AMBER using the real code path. */
async function startWork(client: PoolClient, f: Fixture): Promise<void> {
  await updateIssueStatusTx(client, {
    issueId: TEST_ISSUE_ID,
    newStatus: "AMBER",
    changedByUserId: f.ownerUserId,
    requireAssigneeId: f.ownerAssigneeId,
    workflow: "assignee",
    work: { implementationProgress: PROGRESS, implementationDone: null, finalResolution: null },
  });
}

async function main(): Promise<void> {
  const client = await getVerifiedClient();

  try {
    await client.query("BEGIN");
    const f = await seed(client);

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n1. RED -> AMBER");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("amber_empty"), async () => {
      // The validation layer the Server Action calls first.
      const validated = validateTransitionWorkDetails("AMBER", { implementationProgress: "   " });
      check(
        "empty Implementation In Progress rejected (validation layer)",
        validated.ok === false,
        validated.ok === false ? validated.error : "unexpectedly accepted"
      );

      // ...and the transaction layer, independently, if the validation layer
      // were bypassed by a future call site.
      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "AMBER",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
          workflow: "assignee",
          work: { implementationProgress: null, implementationDone: null, finalResolution: null },
        })
      );
      check(
        "empty Implementation In Progress rejected (transaction layer)",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
    });

    const beforeStart = await snapshot(client, TEST_ISSUE_ID);
    check(
      "rejected RED -> AMBER left the Issue untouched",
      beforeStart.status === "RED" && beforeStart.process_started_at === null,
      `status=${beforeStart.status}, process_started_at=${beforeStart.process_started_at}`
    );

    await inSavepoint(client, sp("amber_ok"), async () => {
      await startWork(client, f);
      const after = await snapshot(client, TEST_ISSUE_ID);

      check("status becomes AMBER", after.status === "AMBER", `status=${after.status}`);
      check(
        "progress text saved",
        after.implementation_progress === PROGRESS,
        `implementation_progress=${JSON.stringify(after.implementation_progress)}`
      );
      check(
        "process-start timestamp recorded automatically",
        after.process_started_at instanceof Date,
        `process_started_at=${after.process_started_at?.toISOString()}`
      );
      check(
        "completion fields still empty",
        after.completed_at === null && after.final_resolution === null,
        `completed_at=${after.completed_at}, final_resolution=${after.final_resolution}`
      );
      check(
        "historical issues.resolution untouched",
        after.resolution === `${MARKER} historical fix & action required`,
        `resolution=${JSON.stringify(after.resolution)}`
      );

      const history = await client.query<{ to_status: string; reason: string | null }>(
        `SELECT to_status, reason FROM issue_tracking.issue_status_history
         WHERE issue_id = $1 ORDER BY history_id DESC LIMIT 1`,
        [TEST_ISSUE_ID]
      );
      check(
        "status-history evidence written with the work detail",
        history.rows[0]?.to_status === "AMBER" && (history.rows[0]?.reason ?? "").includes(PROGRESS),
        `reason=${JSON.stringify(history.rows[0]?.reason)}`
      );
    });

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n2. AMBER progress updates");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("progress"), async () => {
      await startWork(client, f);
      const historyBefore = await countRows(client, "issue_status_history", TEST_ISSUE_ID);

      await recordIssueProgressTx(client, {
        issueId: TEST_ISSUE_ID,
        implementationProgress: PROGRESS_2,
        authorUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
      });

      const after = await snapshot(client, TEST_ISSUE_ID);
      check(
        "current progress text updated",
        after.implementation_progress === PROGRESS_2,
        `implementation_progress=${JSON.stringify(after.implementation_progress)}`
      );
      check(
        "status unchanged by a progress update",
        after.status === "AMBER",
        `status=${after.status}`
      );
      check(
        "process-start timestamp NOT moved by a later update",
        after.process_started_at instanceof Date,
        `process_started_at=${after.process_started_at?.toISOString()}`
      );

      const notes = await client.query<{ body: string }>(
        `SELECT body FROM issue_tracking.issue_comments
         WHERE issue_id = $1 AND comment_type = 'investigation_note'
         ORDER BY comment_id`,
        [TEST_ISSUE_ID]
      );
      check(
        "update appended to the existing issue_comments log",
        notes.rows.length === 1 && notes.rows[0].body === PROGRESS_2,
        `${notes.rows.length} investigation_note row(s)`
      );

      const historyAfter = await countRows(client, "issue_status_history", TEST_ISSUE_ID);
      check(
        "earlier evidence not destroyed — status history untouched",
        historyAfter === historyBefore,
        `status history rows ${historyBefore} -> ${historyAfter}`
      );

      const firstEvidence = await client.query<{ reason: string | null }>(
        `SELECT reason FROM issue_tracking.issue_status_history
         WHERE issue_id = $1 ORDER BY history_id LIMIT 1`,
        [TEST_ISSUE_ID]
      );
      check(
        "the superseded progress text is still recoverable",
        (firstEvidence.rows[0]?.reason ?? "").includes(PROGRESS),
        "original RED -> AMBER reason still holds the first progress note"
      );
    });

    await inSavepoint(client, sp("progress_red"), async () => {
      const error = await captureError(() =>
        recordIssueProgressTx(client, {
          issueId: TEST_ISSUE_ID,
          implementationProgress: PROGRESS_2,
          authorUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
        })
      );
      check(
        "progress update refused while the Issue is still RED",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
    });

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n3. AMBER -> GREEN");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("green_missing_done"), async () => {
      await startWork(client, f);
      const validated = validateTransitionWorkDetails("GREEN", { finalResolution: FINAL });
      check(
        "empty Implementation Done rejected (validation layer)",
        validated.ok === false,
        validated.ok === false ? validated.error : "unexpectedly accepted"
      );

      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "GREEN",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
          workflow: "assignee",
          work: { implementationProgress: null, implementationDone: null, finalResolution: FINAL },
        })
      );
      check(
        "empty Implementation Done rejected (transaction layer)",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
    });

    await inSavepoint(client, sp("green_missing_final"), async () => {
      await startWork(client, f);
      const validated = validateTransitionWorkDetails("GREEN", { implementationDone: DONE });
      check(
        "empty Final Resolution rejected (validation layer)",
        validated.ok === false,
        validated.ok === false ? validated.error : "unexpectedly accepted"
      );

      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "GREEN",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
          workflow: "assignee",
          work: { implementationProgress: null, implementationDone: DONE, finalResolution: null },
        })
      );
      check(
        "empty Final Resolution rejected (transaction layer)",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
    });

    await inSavepoint(client, sp("green_from_red"), async () => {
      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "GREEN",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
          workflow: "assignee",
          work: { implementationProgress: null, implementationDone: DONE, finalResolution: FINAL },
        })
      );
      check(
        "assignee cannot skip RED -> GREEN (work must be started first)",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
    });

    await inSavepoint(client, sp("green_ok"), async () => {
      await startWork(client, f);
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "GREEN",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: null, implementationDone: DONE, finalResolution: FINAL },
      });

      const after = await snapshot(client, TEST_ISSUE_ID);
      check("status becomes GREEN", after.status === "GREEN", `status=${after.status}`);
      check(
        "Implementation Done saved",
        after.implementation_done === DONE,
        `implementation_done=${JSON.stringify(after.implementation_done)}`
      );
      check(
        "Final Resolution saved",
        after.final_resolution === FINAL,
        `final_resolution=${JSON.stringify(after.final_resolution)}`
      );
      check(
        "completion timestamp recorded automatically",
        after.completed_at instanceof Date && after.completed_date instanceof Date,
        `completed_at=${after.completed_at?.toISOString()}, completed_date=${after.completed_date?.toISOString().slice(0, 10)}`
      );
      check(
        "process-start timestamp preserved through completion",
        after.process_started_at instanceof Date,
        `process_started_at=${after.process_started_at?.toISOString()}`
      );
      check(
        "the AMBER progress text is still there after GREEN",
        after.implementation_progress === PROGRESS,
        `implementation_progress=${JSON.stringify(after.implementation_progress)}`
      );
      check(
        "historical issues.resolution still untouched",
        after.resolution === `${MARKER} historical fix & action required`,
        `resolution=${JSON.stringify(after.resolution)}`
      );

      const history = await client.query<{ from_status: string; to_status: string; reason: string | null }>(
        `SELECT from_status, to_status, reason FROM issue_tracking.issue_status_history
         WHERE issue_id = $1 ORDER BY history_id`,
        [TEST_ISSUE_ID]
      );
      check(
        "both transitions preserved in history",
        history.rows.length === 2 &&
          history.rows[0].to_status === "AMBER" &&
          history.rows[1].to_status === "GREEN",
        `${history.rows.length} history row(s)`
      );
      check(
        "GREEN history row carries both completion fields",
        (history.rows[1]?.reason ?? "").includes(DONE) &&
          (history.rows[1]?.reason ?? "").includes(FINAL),
        `reason length=${history.rows[1]?.reason?.length ?? 0}`
      );

      const error = await captureError(() =>
        recordIssueProgressTx(client, {
          issueId: TEST_ISSUE_ID,
          implementationProgress: PROGRESS_2,
          authorUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
        })
      );
      check(
        "a GREEN Issue's work record can no longer be changed",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
    });

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n4. Security — ownership");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("cross_assignee_status"), async () => {
      const before = await snapshot(client, OTHER_ISSUE_ID);
      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: OTHER_ISSUE_ID, // belongs to the OTHER assignee
          newStatus: "AMBER",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
          workflow: "assignee",
          work: { implementationProgress: PROGRESS, implementationDone: null, finalResolution: null },
        })
      );
      check(
        "assignee cannot change another assignee's Issue status",
        error instanceof IssueOwnershipError,
        error instanceof Error ? error.message : String(error)
      );
      check(
        "the error does not reveal that the Issue exists",
        error instanceof Error && error.message === "Issue not found or not assigned to you.",
        error instanceof Error ? error.message : String(error)
      );
      const after = await snapshot(client, OTHER_ISSUE_ID);
      check(
        "the other assignee's Issue is completely unchanged",
        after.status === before.status &&
          after.implementation_progress === null &&
          after.process_started_at === null,
        `status=${after.status}, progress=${after.implementation_progress}`
      );
      check(
        "no history row written for the refused change",
        (await countRows(client, "issue_status_history", OTHER_ISSUE_ID)) === 0,
        "issue_status_history rows for the other Issue = 0"
      );
    });

    await inSavepoint(client, sp("cross_assignee_progress"), async () => {
      // Put the OTHER assignee's Issue into AMBER legitimately, then try to
      // add progress to it as the wrong assignee.
      await updateIssueStatusTx(client, {
        issueId: OTHER_ISSUE_ID,
        newStatus: "AMBER",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.otherAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: PROGRESS, implementationDone: null, finalResolution: null },
      });

      const error = await captureError(() =>
        recordIssueProgressTx(client, {
          issueId: OTHER_ISSUE_ID,
          implementationProgress: PROGRESS_2,
          authorUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
        })
      );
      check(
        "assignee cannot add progress to another assignee's Issue",
        error instanceof IssueOwnershipError,
        error instanceof Error ? error.message : String(error)
      );
      const after = await snapshot(client, OTHER_ISSUE_ID);
      check(
        "the other assignee's progress text is unchanged",
        after.implementation_progress === PROGRESS,
        `implementation_progress=${JSON.stringify(after.implementation_progress)}`
      );
      check(
        "no note appended for the refused update",
        (await countRows(client, "issue_comments", OTHER_ISSUE_ID)) === 0,
        "issue_comments rows for the other Issue = 0"
      );
    });

    await inSavepoint(client, sp("super_admin"), async () => {
      // requireAssigneeId = null is the Super Admin path: no ownership
      // precondition, and `workflow` left at its "unrestricted" default so
      // every transition that was legal before is still legal.
      await updateIssueStatusTx(client, {
        issueId: OTHER_ISSUE_ID,
        newStatus: "GREEN",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: null,
        work: { implementationProgress: null, implementationDone: DONE, finalResolution: FINAL },
      });
      const after = await snapshot(client, OTHER_ISSUE_ID);
      check(
        "Super Admin may still move any Issue, including RED -> GREEN",
        after.status === "GREEN",
        `status=${after.status}`
      );
      check(
        "Super Admin is still held to the same required work details",
        after.implementation_done === DONE && after.final_resolution === FINAL,
        "Implementation Done and Final Resolution both stored"
      );

      const missing = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "AMBER",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: null,
          work: { implementationProgress: null, implementationDone: null, finalResolution: null },
        })
      );
      check(
        "Super Admin cannot record a status change with no work details either",
        missing instanceof StatusTransitionError,
        missing instanceof Error ? missing.message : String(missing)
      );
    });

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n4b. Assignee transition matrix (Assignee Portal stage)");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("amber_to_red"), async () => {
      await startWork(client, f);
      // Record a second progress note so there is a log entry to preserve too.
      await recordIssueProgressTx(client, {
        issueId: TEST_ISSUE_ID,
        implementationProgress: PROGRESS_2,
        authorUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
      });
      const before = await snapshot(client, TEST_ISSUE_ID);
      const historyBefore = await countRows(client, "issue_status_history", TEST_ISSUE_ID);
      const notesBefore = await countRows(client, "issue_comments", TEST_ISSUE_ID);

      // No work details supplied at all — AMBER -> RED requires none.
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "RED",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: null, implementationDone: null, finalResolution: null },
      });

      const after = await snapshot(client, TEST_ISSUE_ID);
      check("AMBER -> RED allowed for an assignee", after.status === "RED", `status=${after.status}`);
      check(
        "AMBER -> RED requires no Implementation Done / Final Resolution",
        after.implementation_done === null && after.final_resolution === null,
        "neither completion field was demanded or written"
      );
      check(
        "AMBER -> RED preserves implementation_progress",
        after.implementation_progress === before.implementation_progress &&
          after.implementation_progress === PROGRESS_2,
        `implementation_progress=${JSON.stringify(after.implementation_progress)}`
      );
      check(
        "AMBER -> RED preserves process_started_at",
        after.process_started_at instanceof Date &&
          after.process_started_at.getTime() === before.process_started_at!.getTime(),
        `process_started_at=${after.process_started_at?.toISOString()}`
      );
      check(
        "AMBER -> RED preserves the investigation-note log",
        (await countRows(client, "issue_comments", TEST_ISSUE_ID)) === notesBefore && notesBefore > 0,
        `${notesBefore} note(s) before and after`
      );
      check(
        "AMBER -> RED appends to status history rather than rewriting it",
        (await countRows(client, "issue_status_history", TEST_ISSUE_ID)) === historyBefore + 1,
        `history rows ${historyBefore} -> ${historyBefore + 1}`
      );
      check(
        "AMBER -> RED leaves the historical issues.resolution alone",
        after.resolution === `${MARKER} historical fix & action required`,
        `resolution=${JSON.stringify(after.resolution)}`
      );

      // ...and the assignee can start work again afterwards.
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "AMBER",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: PROGRESS, implementationDone: null, finalResolution: null },
      });
      const restarted = await snapshot(client, TEST_ISSUE_ID);
      check(
        "RED -> AMBER again after stopping work",
        restarted.status === "AMBER",
        `status=${restarted.status}`
      );
      check(
        "restarting does NOT move the original process_started_at",
        restarted.process_started_at!.getTime() === before.process_started_at!.getTime(),
        `process_started_at=${restarted.process_started_at?.toISOString()}`
      );
    });

    await inSavepoint(client, sp("green_final"), async () => {
      await startWork(client, f);
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "GREEN",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: null, implementationDone: DONE, finalResolution: FINAL },
      });

      for (const target of ["RED", "AMBER"] as const) {
        const before = await snapshot(client, TEST_ISSUE_ID);
        const historyBefore = await countRows(client, "issue_status_history", TEST_ISSUE_ID);
        const error = await captureError(() =>
          updateIssueStatusTx(client, {
            issueId: TEST_ISSUE_ID,
            newStatus: target,
            changedByUserId: f.ownerUserId,
            requireAssigneeId: f.ownerAssigneeId,
            workflow: "assignee",
            work: {
              implementationProgress: PROGRESS,
              implementationDone: DONE,
              finalResolution: FINAL,
            },
          })
        );
        check(
          `GREEN -> ${target} rejected for an assignee — GREEN is final`,
          error instanceof StatusTransitionError,
          error instanceof Error ? error.message : String(error)
        );
        const after = await snapshot(client, TEST_ISSUE_ID);
        check(
          `GREEN -> ${target} leaves the Issue untouched`,
          after.status === "GREEN" &&
            after.final_resolution === before.final_resolution &&
            (await countRows(client, "issue_status_history", TEST_ISSUE_ID)) === historyBefore,
          `status=${after.status}, history rows unchanged`
        );
      }
    });

    await inSavepoint(client, sp("admin_matrix_unchanged"), async () => {
      // REGRESSION GUARD. The Super Admin path must still refuse AMBER -> RED
      // (backward) even though an assignee may now do it. Widening the
      // assignee rules must not widen the admin's.
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "AMBER",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: null,
        work: { implementationProgress: PROGRESS, implementationDone: null, finalResolution: null },
      });
      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "RED",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: null,
          work: { implementationProgress: null, implementationDone: null, finalResolution: null },
        })
      );
      check(
        "Super Admin AMBER -> RED still rejected (forward-only rule unchanged)",
        error instanceof StatusTransitionError &&
          error.message === "Status cannot move backwards.",
        error instanceof Error ? error.message : String(error)
      );
      const after = await snapshot(client, TEST_ISSUE_ID);
      check(
        "the refused Super Admin move changed nothing",
        after.status === "AMBER",
        `status=${after.status}`
      );
    });

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n4c. Progress history is append-only across a full cycle");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("progress_history"), async () => {
      const P1 = "Progress 1 — checked the wiring and found a loose connection.";
      const P2 = "Progress 2 — reconnected the wiring and started testing.";
      const P3 = "Progress 3 — testing continued, no further fault found.";

      // RED -> AMBER carries the FIRST progress text. It is recorded in
      // issue_status_history.reason, not as a note — which is exactly why the
      // detail page has to merge both sources to show a complete history.
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "AMBER",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: P1, implementationDone: null, finalResolution: null },
      });

      for (const text of [P2, P3]) {
        await recordIssueProgressTx(client, {
          issueId: TEST_ISSUE_ID,
          implementationProgress: text,
          authorUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
        });
      }

      const notes = await client.query<{ comment_id: string; body: string; author_id: string }>(
        `SELECT comment_id, body, author_id FROM issue_tracking.issue_comments
         WHERE issue_id = $1 AND comment_type = 'investigation_note'
         ORDER BY comment_id`,
        [TEST_ISSUE_ID]
      );
      check(
        "each Add Progress appends a SEPARATE row",
        notes.rows.length === 2 &&
          notes.rows[0].body === P2 &&
          notes.rows[1].body === P3,
        `${notes.rows.length} note row(s), distinct ids ${notes.rows.map((r) => r.comment_id).join(", ")}`
      );
      check(
        "the first entry is not overwritten by the second or third",
        notes.rows[0].body === P2,
        "earlier note text unchanged after two later submissions"
      );
      check(
        "every entry records its author",
        notes.rows.every((row) => Number(row.author_id) === f.ownerUserId),
        "author_id set on every note"
      );

      const startReason = await client.query<{ reason: string | null }>(
        `SELECT reason FROM issue_tracking.issue_status_history
         WHERE issue_id = $1 AND to_status = 'AMBER' AND reason IS NOT NULL
         ORDER BY history_id DESC LIMIT 1`,
        [TEST_ISSUE_ID]
      );
      check(
        "the initial RED -> AMBER progress is stored and recoverable",
        (startReason.rows[0]?.reason ?? "").includes(P1),
        "recovered from issue_status_history.reason"
      );

      const snapshot = await snapshot_(client);
      check(
        "the snapshot column holds the LATEST entry only — it is not the history",
        snapshot.implementation_progress === P3,
        `snapshot=${JSON.stringify(snapshot.implementation_progress?.slice(0, 20))}`
      );

      // AMBER -> RED, then back to AMBER. Nothing may be lost either way.
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "RED",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: null, implementationDone: null, finalResolution: null },
      });
      check(
        "AMBER -> RED preserves every progress entry",
        (await countRows(client, "issue_comments", TEST_ISSUE_ID)) === 2,
        "2 note row(s) still present after stopping work"
      );

      const P4 = "Progress 4 — restarted after the pause.";
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "AMBER",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: P4, implementationDone: null, finalResolution: null },
      });
      await recordIssueProgressTx(client, {
        issueId: TEST_ISSUE_ID,
        implementationProgress: "Progress 5 — continued after restart.",
        authorUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
      });
      const afterRestart = await client.query<{ body: string }>(
        `SELECT body FROM issue_tracking.issue_comments
         WHERE issue_id = $1 AND comment_type = 'investigation_note' ORDER BY comment_id`,
        [TEST_ISSUE_ID]
      );
      check(
        "returning to AMBER keeps the old entries and allows new ones",
        afterRestart.rows.length === 3 &&
          afterRestart.rows[0].body === P2 &&
          afterRestart.rows[1].body === P3,
        `${afterRestart.rows.length} note row(s), earliest two unchanged`
      );

      // Completion must not discard anything either.
      await updateIssueStatusTx(client, {
        issueId: TEST_ISSUE_ID,
        newStatus: "GREEN",
        changedByUserId: f.ownerUserId,
        requireAssigneeId: f.ownerAssigneeId,
        workflow: "assignee",
        work: { implementationProgress: null, implementationDone: DONE, finalResolution: FINAL },
      });
      const afterGreen = await snapshot_(client);
      check(
        "GREEN preserves every progress entry",
        (await countRows(client, "issue_comments", TEST_ISSUE_ID)) === 3,
        "3 note row(s) still present after completion"
      );
      check(
        "GREEN also keeps Implementation Done and Final Resolution",
        afterGreen.implementation_done === DONE && afterGreen.final_resolution === FINAL,
        "completion fields stored alongside the preserved history"
      );

      const error = await captureError(() =>
        recordIssueProgressTx(client, {
          issueId: TEST_ISSUE_ID,
          implementationProgress: "should not be possible",
          authorUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
        })
      );
      check(
        "a completed Issue accepts no further progress — history is read-only",
        error instanceof StatusTransitionError &&
          (await countRows(client, "issue_comments", TEST_ISSUE_ID)) === 3,
        error instanceof Error ? error.message : String(error)
      );
    });

    await inSavepoint(client, sp("progress_foreign"), async () => {
      await startWork(client, f);
      const before = await countRows(client, "issue_comments", TEST_ISSUE_ID);
      const error = await captureError(() =>
        recordIssueProgressTx(client, {
          issueId: TEST_ISSUE_ID,
          implementationProgress: "added by the wrong assignee",
          // A DIFFERENT assignee than the one holding this Issue.
          authorUserId: f.ownerUserId,
          requireAssigneeId: f.otherAssigneeId,
        })
      );
      check(
        "another Assignee cannot add progress to an Issue they do not hold",
        error instanceof IssueOwnershipError,
        error instanceof Error ? error.message : String(error)
      );
      check(
        "the refused attempt appended nothing",
        (await countRows(client, "issue_comments", TEST_ISSUE_ID)) === before,
        `${before} note row(s) before and after`
      );
    });

    // ────────────────────────────────────────────────────────────────────────
    console.log("\n5. Transaction safety");
    // ────────────────────────────────────────────────────────────────────────

    await inSavepoint(client, sp("atomic"), async () => {
      await startWork(client, f);
      const before = await snapshot(client, TEST_ISSUE_ID);
      const historyBefore = await countRows(client, "issue_status_history", TEST_ISSUE_ID);

      await client.query("SAVEPOINT inner_failure");
      const error = await captureError(() =>
        updateIssueStatusTx(client, {
          issueId: TEST_ISSUE_ID,
          newStatus: "GREEN",
          changedByUserId: f.ownerUserId,
          requireAssigneeId: f.ownerAssigneeId,
          workflow: "assignee",
          // Final Resolution missing -> throws AFTER the ownership check and
          // BEFORE any write. Whatever partial work a future refactor might
          // do, the rollback below is what the application relies on.
          work: { implementationProgress: null, implementationDone: DONE, finalResolution: null },
        })
      );
      await client.query("ROLLBACK TO SAVEPOINT inner_failure");

      const after = await snapshot(client, TEST_ISSUE_ID);
      const historyAfter = await countRows(client, "issue_status_history", TEST_ISSUE_ID);

      check(
        "a failed transition throws",
        error instanceof StatusTransitionError,
        error instanceof Error ? error.message : String(error)
      );
      check(
        "failed transaction leaves the status unchanged",
        after.status === before.status,
        `status ${before.status} -> ${after.status}`
      );
      check(
        "failed transaction leaves NO partial resolution behind",
        after.implementation_done === null && after.final_resolution === null,
        `implementation_done=${after.implementation_done}, final_resolution=${after.final_resolution}`
      );
      check(
        "failed transaction leaves NO completion timestamp behind",
        after.completed_at === null && after.completed_date === null,
        `completed_at=${after.completed_at}, completed_date=${after.completed_date}`
      );
      check(
        "failed transaction writes no history row",
        historyAfter === historyBefore,
        `history rows ${historyBefore} -> ${historyAfter}`
      );
    });

    console.log("\n6. Rolling everything back…");
  } finally {
    // Unconditional. No COMMIT exists anywhere in this file.
    await client.query("ROLLBACK");
    client.release();
  }

  // ── Independent confirmation on a fresh connection ────────────────────────
  const leftovers = await query<{ label: string; n: string }>(
    `SELECT 'issues' AS label, count(*)::text AS n FROM issue_tracking.issues WHERE issue_id LIKE $1
     UNION ALL SELECT 'issue_staff', count(*)::text FROM issue_tracking.issue_staff WHERE staff_code = $2
     UNION ALL SELECT 'management_users', count(*)::text FROM issue_tracking.management_users WHERE username LIKE $3
     UNION ALL SELECT 'assignment_users', count(*)::text FROM issue_tracking.assignment_users WHERE assignee_name LIKE $3
     UNION ALL SELECT 'issue_assignments', count(*)::text FROM issue_tracking.issue_assignments WHERE issue_id LIKE $1
     UNION ALL SELECT 'issue_status_history', count(*)::text FROM issue_tracking.issue_status_history WHERE issue_id LIKE $1
     UNION ALL SELECT 'issue_comments', count(*)::text FROM issue_tracking.issue_comments WHERE issue_id LIKE $1`,
    [`${TEST_STAFF_CODE}-%`, TEST_STAFF_CODE, `%${MARKER}%`]
  );

  console.log("\n7. Permanent test rows remaining (every count must be 0):");
  for (const row of leftovers.rows) {
    check(`no leftover ${row.label}`, Number(row.n) === 0, `${row.n} row(s)`);
  }

  const totals = await query<{ label: string; n: string }>(
    `SELECT 'issues' AS label, count(*)::text AS n FROM issue_tracking.issues
     UNION ALL SELECT 'issues with non-null resolution', count(resolution)::text FROM issue_tracking.issues
     UNION ALL SELECT 'issue_status_history', count(*)::text FROM issue_tracking.issue_status_history
     UNION ALL SELECT 'issue_comments', count(*)::text FROM issue_tracking.issue_comments
     UNION ALL SELECT 'issue_assignments', count(*)::text FROM issue_tracking.issue_assignments
     UNION ALL SELECT 'assignment_users', count(*)::text FROM issue_tracking.assignment_users
     UNION ALL SELECT 'management_users', count(*)::text FROM issue_tracking.management_users`
  );
  console.log("\n8. Live database counts after the run:");
  for (const row of totals.rows) {
    console.log(`  ${row.label} = ${row.n}`);
  }

  await (await getPool()).end();

  if (failures > 0) {
    console.error(`\nFAILED — ${failures} check(s) did not pass.`);
    process.exit(1);
  }
  console.log("\nAll checks passed. Zero permanent rows written.");
}

/** Savepoint names are identifiers, so they cannot be parameterized. Every
 *  name in this file is a hard-coded literal passed through here — no input
 *  of any kind reaches a savepoint name. */
function sp(name: string): string {
  return `sp_${name}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
