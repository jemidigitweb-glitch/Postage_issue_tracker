import "server-only";

import { query } from "../db";

// Queries against issue_tracking.discussion_participants — Discussion-specific
// participant storage (migration/007_discussions.sql). Deliberately NOT
// issue_tracking.assignment_users (the Rajive/Mayurika/Arun/Suman "Assign To"
// pool — too limited for real meeting attendees like MD, warehouse owners,
// or external-facing roles) and NOT issue_tracking.issue_staff or any HR/
// company staff-master table. A participant is always at least a free-text
// name; management_user_id is optional and only set when the person also
// happens to hold a login account.

export interface DiscussionParticipant {
  participantId: number;
  discussionId: string;
  name: string;
  roleTitle: string | null;
  managementUserId: number | null;
  isCoordinator: boolean;
}

interface DiscussionParticipantRow {
  participant_id: number;
  discussion_id: string;
  participant_name: string;
  role_title: string | null;
  management_user_id: number | null;
  is_coordinator: boolean;
}

export async function listDiscussionParticipants(discussionId: string): Promise<DiscussionParticipant[]> {
  const result = await query<DiscussionParticipantRow>(
    `SELECT participant_id, discussion_id, participant_name, role_title, management_user_id, is_coordinator
     FROM issue_tracking.discussion_participants
     WHERE discussion_id = $1
     ORDER BY is_coordinator DESC, participant_name`,
    [discussionId]
  );

  return result.rows.map((row) => ({
    participantId: Number(row.participant_id),
    discussionId: row.discussion_id,
    name: row.participant_name,
    roleTitle: row.role_title,
    managementUserId: row.management_user_id,
    isCoordinator: row.is_coordinator,
  }));
}

export interface AddDiscussionParticipantInput {
  discussionId: string;
  name: string;
  roleTitle: string | null;
  isCoordinator: boolean;
}

/** Thrown when the parent discussion_id does not exist. */
export class InvalidDiscussionError extends Error {}

export async function addDiscussionParticipant(
  input: AddDiscussionParticipantInput
): Promise<DiscussionParticipant> {
  const existing = await query<{ discussion_id: string }>(
    `SELECT discussion_id FROM issue_tracking.discussions WHERE discussion_id = $1 AND deleted_at IS NULL`,
    [input.discussionId]
  );
  if (existing.rows.length === 0) {
    throw new InvalidDiscussionError(`Discussion "${input.discussionId}" not found.`);
  }

  const result = await query<DiscussionParticipantRow>(
    `INSERT INTO issue_tracking.discussion_participants
       (discussion_id, participant_name, role_title, is_coordinator)
     VALUES ($1, $2, $3, $4)
     RETURNING participant_id, discussion_id, participant_name, role_title, management_user_id, is_coordinator`,
    [input.discussionId, input.name, input.roleTitle, input.isCoordinator]
  );

  const row = result.rows[0];
  return {
    participantId: Number(row.participant_id),
    discussionId: row.discussion_id,
    name: row.participant_name,
    roleTitle: row.role_title,
    managementUserId: row.management_user_id,
    isCoordinator: row.is_coordinator,
  };
}
