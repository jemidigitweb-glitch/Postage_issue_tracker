import "server-only";

import { getVerifiedClient } from "../db";
import type { IssueStatus } from "./issues";

// Status-change workflow, recorded into issue_tracking.issue_status_history
// (see migration/002_issue_management_system.sql). Reuses that table rather
// than creating a new one. Rules (CLAUDE.md "Solved Status Workflow"):
//   RED -> AMBER -> GREEN, forward-only (same-status re-selection is a
//   no-op). Once AMBER or GREEN, the status can never move back to RED;
//   once GREEN, it can never move back to any earlier status. There is no
//   reopen path — leaving GREEN is not permitted from any caller.

const STATUS_RANK: Readonly<Record<IssueStatus, number>> = {
  RED: 0,
  AMBER: 1,
  GREEN: 2,
};

export class StatusTransitionError extends Error {}

export interface UpdateStatusInput {
  issueId: string;
  newStatus: IssueStatus;
  changedByUserId: number;
}

export interface UpdateStatusResult {
  status: IssueStatus;
}

interface IssueStatusRow {
  status: IssueStatus;
}

/**
 * Validates and applies one status transition, recording it in
 * issue_status_history. Same-status "changes" are a no-op (rolled back,
 * not an error). Any transition to a lower rank (AMBER/GREEN -> RED,
 * GREEN -> AMBER) is rejected without touching the database. One
 * transaction; `FOR UPDATE` on the issues row prevents two concurrent
 * status changes on the same issue from racing.
 */
export async function updateIssueStatus(input: UpdateStatusInput): Promise<UpdateStatusResult> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const current = await client.query<IssueStatusRow>(
      `SELECT status FROM issue_tracking.issues WHERE issue_id = $1 FOR UPDATE`,
      [input.issueId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new StatusTransitionError(`Issue "${input.issueId}" not found.`);
    }

    const fromStatus = row.status;
    const toStatus = input.newStatus;

    if (fromStatus === toStatus) {
      await client.query("ROLLBACK");
      return { status: fromStatus };
    }

    if (STATUS_RANK[toStatus] < STATUS_RANK[fromStatus]) {
      throw new StatusTransitionError("Status cannot move backwards.");
    }

    await client.query(
      `UPDATE issue_tracking.issues
       SET status = $2, updated_at = now()
       WHERE issue_id = $1`,
      [input.issueId, toStatus]
    );

    await client.query(
      `INSERT INTO issue_tracking.issue_status_history
         (issue_id, from_status, to_status, changed_by, is_reopen, reason)
       VALUES ($1, $2, $3, $4, false, NULL)`,
      [input.issueId, fromStatus, toStatus, input.changedByUserId]
    );

    await client.query("COMMIT");
    return { status: toStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
