import "server-only";

import { query } from "../db";

// Queries against issue_tracking.discussion_comments (migration/007_discussions.sql).
// Independent of issue_tracking.issue_comments — no shared rows, no shared IDs.

export interface DiscussionComment {
  commentId: number;
  discussionId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface DiscussionCommentRow {
  comment_id: number;
  discussion_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export async function listDiscussionComments(discussionId: string): Promise<DiscussionComment[]> {
  const result = await query<DiscussionCommentRow>(
    `SELECT c.comment_id, c.discussion_id, mu.display_name AS author_name, c.body,
            to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM issue_tracking.discussion_comments c
     JOIN issue_tracking.management_users mu ON mu.user_id = c.author_id
     WHERE c.discussion_id = $1
     ORDER BY c.created_at ASC`,
    [discussionId]
  );

  return result.rows.map((row) => ({
    commentId: Number(row.comment_id),
    discussionId: row.discussion_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export class InvalidDiscussionError extends Error {}

export async function addDiscussionComment(
  discussionId: string,
  authorId: number,
  body: string
): Promise<DiscussionComment> {
  const discussion = await query<{ discussion_id: string }>(
    `SELECT discussion_id FROM issue_tracking.discussions WHERE discussion_id = $1 AND deleted_at IS NULL`,
    [discussionId]
  );
  if (discussion.rows.length === 0) {
    throw new InvalidDiscussionError(`Discussion "${discussionId}" not found.`);
  }

  const result = await query<DiscussionCommentRow>(
    `INSERT INTO issue_tracking.discussion_comments (discussion_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING comment_id, discussion_id, author_id, body,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`,
    [discussionId, authorId, body]
  );

  const row = result.rows[0];
  const authorResult = await query<{ display_name: string }>(
    `SELECT display_name FROM issue_tracking.management_users WHERE user_id = $1`,
    [authorId]
  );

  return {
    commentId: Number(row.comment_id),
    discussionId: row.discussion_id,
    authorName: authorResult.rows[0]?.display_name ?? "Unknown",
    body: row.body,
    createdAt: row.created_at,
  };
}
