import "server-only";

import { query } from "../db";

// Queries against issue_tracking.discussion_groups (migration/008_discussion_groups.sql)
// — shared "meeting" metadata (title, date range, coordinator, objective)
// for a set of independent Discussions that came from the same meeting.
// This table is never a workflow entity itself: no status, no RED/AMBER/
// GREEN, no comments. Each Discussion under a group still carries its own
// full, independent workflow (issue_tracking.discussions + friends).

export interface DiscussionGroup {
  groupId: number;
  title: string;
  meetingDateStart: string | null;
  meetingDateEnd: string | null;
  coordinatorName: string | null;
  objective: string | null;
  createdAt: string;
}

interface DiscussionGroupRow {
  group_id: number;
  title: string;
  meeting_date_start: string | null;
  meeting_date_end: string | null;
  coordinator_name: string | null;
  objective: string | null;
  created_at: string;
}

function mapRow(row: DiscussionGroupRow): DiscussionGroup {
  return {
    groupId: Number(row.group_id),
    title: row.title,
    meetingDateStart: row.meeting_date_start,
    meetingDateEnd: row.meeting_date_end,
    coordinatorName: row.coordinator_name,
    objective: row.objective,
    createdAt: row.created_at,
  };
}

const GROUP_COLUMNS = `
  group_id, title,
  to_char(meeting_date_start, 'YYYY-MM-DD') AS meeting_date_start,
  to_char(meeting_date_end, 'YYYY-MM-DD') AS meeting_date_end,
  coordinator_name, objective,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
`;

export async function getDiscussionGroupById(groupId: number): Promise<DiscussionGroup | null> {
  const result = await query<DiscussionGroupRow>(
    `SELECT ${GROUP_COLUMNS} FROM issue_tracking.discussion_groups WHERE group_id = $1`,
    [groupId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Exact-title lookup — used both by idempotent data migrations/seeds and
 *  by findOrCreateDiscussionGroup() below (the New Discussion form's
 *  "Meeting / Group Name" field), which explicitly wants "same name = same
 *  group" as a deliberate reuse feature, not an accidental merge. */
export async function findDiscussionGroupByTitle(title: string): Promise<DiscussionGroup | null> {
  const result = await query<DiscussionGroupRow>(
    `SELECT ${GROUP_COLUMNS} FROM issue_tracking.discussion_groups WHERE title = $1 LIMIT 1`,
    [title]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export interface FindOrCreateDiscussionGroupInput {
  title: string;
  meetingDateStart: string | null;
  meetingDateEnd: string | null;
  coordinatorName: string | null;
}

/**
 * Reuses an existing discussion_groups row when one with this exact title
 * already exists (the New Discussion form's "if an existing group with the
 * same name exists, reuse it" requirement); otherwise creates a new one.
 * Never creates a duplicate group for the same title. Uses the existing
 * discussion_groups table/columns only — no schema change.
 */
export async function findOrCreateDiscussionGroup(
  input: FindOrCreateDiscussionGroupInput,
  createdByUserId: number
): Promise<number> {
  const existing = await findDiscussionGroupByTitle(input.title);
  if (existing) {
    return existing.groupId;
  }

  const result = await query<{ group_id: number }>(
    `INSERT INTO issue_tracking.discussion_groups
       (title, meeting_date_start, meeting_date_end, coordinator_name, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING group_id`,
    [input.title, input.meetingDateStart, input.meetingDateEnd, input.coordinatorName, createdByUserId]
  );
  return result.rows[0].group_id;
}

/** Every Discussion currently under a group, for the group's own detail
 *  display (list of sibling Discussions from the same meeting). */
export interface GroupDiscussionSummary {
  discussionId: string;
  title: string;
  status: "RED" | "AMBER" | "GREEN";
}

export async function listDiscussionsInGroup(groupId: number): Promise<GroupDiscussionSummary[]> {
  const result = await query<{ discussion_id: string; title: string; status: "RED" | "AMBER" | "GREEN" }>(
    `SELECT discussion_id, title, status
     FROM issue_tracking.discussions
     WHERE group_id = $1 AND deleted_at IS NULL
     ORDER BY discussion_id`,
    [groupId]
  );
  return result.rows.map((row) => ({
    discussionId: row.discussion_id,
    title: row.title,
    status: row.status,
  }));
}
