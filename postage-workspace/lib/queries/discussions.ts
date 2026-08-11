import "server-only";

import { getVerifiedClient, query } from "../db";
import { createIssue, type CreateIssueInput } from "./issues";

// Queries against issue_tracking.discussions — the Discussions module header
// table (migration/007_discussions.sql). Fully independent of
// issue_tracking.issues: no shared columns, no shared ID space, no shared
// status-transition logic (see lib/queries/discussionStatus.ts, which is a
// separate file from lib/queries/issueStatus.ts and is never imported by it
// or vice versa).

export type DiscussionStatus = "RED" | "AMBER" | "GREEN";
export type IssueLinkType = "discussion_only" | "linked_existing" | "new_issue_required";

/**
 * Structured transcription of the ORIGINAL meeting-minute wording for one
 * Discussion (migration/009_discussion_source_content.sql) — distinct from
 * the operational workflow fields (objective/action_plan/implementation_progress/
 * final_outcome), which track ongoing status rather than source material.
 * Every key is optional; the UI renders a section only when it has content
 * (never a blank heading). `action` entries support a nested labeled
 * sub-list (e.g. "Maintain updated knowledge of: <items>") via the object
 * variant, or a plain bullet via a string.
 */
export interface DiscussionSourceContent {
  discussion?: string;
  /** Preserves which exact heading the source used — "Channels" vs
   *  "Channels Covered" — rather than normalizing to one or the other. */
  channelsLabel?: string;
  channels?: string[];
  requirement?: string;
  action?: (string | { label: string; items: string[] })[];
  examples?: string[];
}

const VALID_STATUSES: readonly DiscussionStatus[] = ["RED", "AMBER", "GREEN"];

// discussion_id is always "DISC-<digits>" — allocated exclusively by
// issue_tracking.next_discussion_id() (migration/007_discussions.sql).
const DISCUSSION_ID_PATTERN = /^DISC-[0-9]+$/;

export function isValidDiscussionId(discussionId: string): boolean {
  return discussionId.length <= 20 && DISCUSSION_ID_PATTERN.test(discussionId);
}

export interface DiscussionListItem {
  discussionId: string;
  title: string;
  domain: string | null;
  /** The Discussion's own meeting_date_start/end columns — NOT
   *  discussion_groups' dates and NOT updated_at. Used for the list
   *  table's "Meeting Date" column. */
  meetingDateStart: string | null;
  meetingDateEnd: string | null;
  coordinatorName: string | null;
  participantNames: string[];
  status: DiscussionStatus;
  processStarted: boolean | null;
  estimatedFinishDate: string | null;
  /** The Discussion's own direct linked Issue (discussions.linked_issue_id),
   *  or null when not linked. Does not include points-based links — a
   *  Discussion's own direct link is what the main-panel "Linked Issue"
   *  section manages. */
  linkedIssueId: string | null;
}

// ---------------------------------------------------------------------------
// Sorting whitelist — same rules as lib/queries/issues.ts.
//
// SECURITY: ?sort= is only ever a lookup key into this frozen map. Its value
// is never interpolated into SQL; an unknown key falls back to the default
// ORDER BY. Direction is narrowed to the literals "ASC"/"DESC". ORDER BY
// cannot be parameterised in PostgreSQL, so a whitelist is the safe approach.
// ---------------------------------------------------------------------------
const DISCUSSION_SORT_COLUMNS = Object.freeze({
  discussionId: "d.discussion_id",
  title: "d.title",
  domain: "d.domain",
  coordinator: "d.coordinator_name",
  // Workflow order (RED -> AMBER -> GREEN), not alphabetical.
  status: "CASE d.status WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END",
  started: "d.process_started",
  estimatedFinish: "d.estimated_finish_date",
  meetingDate: "d.meeting_date_start",
  linkedIssue: "d.linked_issue_id",
} as const);

export type DiscussionSortKey = keyof typeof DISCUSSION_SORT_COLUMNS;

/** Unchanged from the pre-sorting behaviour. */
const DISCUSSION_DEFAULT_ORDER_BY = "d.updated_at DESC, d.discussion_id DESC";

function buildDiscussionOrderBy(sort: string | undefined, order: string | undefined): string {
  const column = sort && Object.prototype.hasOwnProperty.call(DISCUSSION_SORT_COLUMNS, sort)
    ? DISCUSSION_SORT_COLUMNS[sort as DiscussionSortKey]
    : null;
  if (!column) {
    return DISCUSSION_DEFAULT_ORDER_BY;
  }
  const direction = order === "desc" ? "DESC" : "ASC";
  return `${column} ${direction} NULLS LAST, d.discussion_id ASC`;
}

export interface ListDiscussionsParams {
  page?: number;
  pageSize?: number;
  /** Sort key resolved against DISCUSSION_SORT_COLUMNS; unknown = default. */
  sort?: string;
  /** "asc" | "desc" — anything else is treated as "asc". */
  order?: string;
  /** Matches against discussion_id or title (case-insensitive, substring). */
  search?: string;
  status?: string;
  /** Exact match against discussions.domain ONLY — deliberately never
   *  discussion_points.domain. Dropdown-driven (see listDiscussionDomains()),
   *  not a substring search. */
  domain?: string;
  /** Exact match against discussions.coordinator_name OR any
   *  discussion_participants.participant_name for that discussion —
   *  dropdown-driven (see listDiscussionMemberNames()), not a substring
   *  search. */
  member?: string;
  showDeleted?: boolean;
}

export interface ListDiscussionsResult {
  discussions: DiscussionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  showDeleted: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

interface DiscussionListRow {
  discussion_id: string;
  title: string;
  domain: string | null;
  meeting_date_start: string | null;
  meeting_date_end: string | null;
  coordinator_name: string | null;
  participant_names: string[] | null;
  status: DiscussionStatus;
  process_started: boolean | null;
  estimated_finish_date: string | null;
  linked_issue_id: string | null;
  total_count: string;
}

export async function listDiscussions(params: ListDiscussionsParams = {}): Promise<ListDiscussionsResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  const trimmedSearch = params.search?.trim();
  const search = trimmedSearch ? escapeLikePattern(trimmedSearch) : null;
  const status = normalizeEnum(params.status, VALID_STATUSES);
  // Exact-match, dropdown-driven — not ILIKE/substring — see
  // ListDiscussionsParams' domain/member doc comments.
  const domain = params.domain?.trim() || null;
  const member = params.member?.trim() || null;
  const showDeleted = params.showDeleted ?? false;
  // Resolved from the frozen whitelist above — never from raw input.
  const orderBy = buildDiscussionOrderBy(params.sort, params.order);

  const result = await query<DiscussionListRow>(
    `SELECT
       d.discussion_id,
       d.title,
       d.domain,
       to_char(d.meeting_date_start, 'YYYY-MM-DD') AS meeting_date_start,
       to_char(d.meeting_date_end, 'YYYY-MM-DD') AS meeting_date_end,
       d.coordinator_name,
       (SELECT array_agg(p.participant_name ORDER BY p.is_coordinator DESC, p.participant_name)
          FROM issue_tracking.discussion_participants p
          WHERE p.discussion_id = d.discussion_id) AS participant_names,
       d.status,
       d.process_started,
       to_char(d.estimated_finish_date, 'YYYY-MM-DD') AS estimated_finish_date,
       d.linked_issue_id,
       COUNT(*) OVER() AS total_count
     FROM issue_tracking.discussions d
     WHERE
       ($1::text IS NULL OR d.discussion_id ILIKE '%' || $1 || '%' ESCAPE '\\' OR d.title ILIKE '%' || $1 || '%' ESCAPE '\\')
       AND ($2::text IS NULL OR d.status = $2)
       -- Domain: matches ONLY the Discussion's own main domain
       -- (discussions.domain) — deliberately NOT discussion_points.domain.
       -- Per-point domains are a separate, per-point concept and must never
       -- cause a Discussion to appear under a domain its own header doesn't
       -- carry.
       AND ($3::text IS NULL OR d.domain = $3)
       -- Coordinator/member: exact match (dropdown-driven — see
       -- listDiscussionMemberNames()) against the coordinator field OR any
       -- participant row for that discussion.
       AND ($4::text IS NULL OR d.coordinator_name = $4
            OR EXISTS (SELECT 1 FROM issue_tracking.discussion_participants p
                       WHERE p.discussion_id = d.discussion_id AND p.participant_name = $4))
       AND (($7::boolean AND d.deleted_at IS NOT NULL) OR (NOT $7::boolean AND d.deleted_at IS NULL))
     ORDER BY ${orderBy}
     LIMIT $5 OFFSET $6`,
    [search, status, domain, member, pageSize, offset, showDeleted]
  );

  const totalCount = result.rows[0] ? Number(result.rows[0].total_count) : 0;

  return {
    discussions: result.rows.map((row) => ({
      discussionId: row.discussion_id,
      title: row.title,
      domain: row.domain,
      meetingDateStart: row.meeting_date_start,
      meetingDateEnd: row.meeting_date_end,
      coordinatorName: row.coordinator_name,
      participantNames: row.participant_names ?? [],
      status: row.status,
      processStarted: row.process_started,
      estimatedFinishDate: row.estimated_finish_date,
      linkedIssueId: row.linked_issue_id,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    showDeleted,
  };
}

/**
 * Distinct, non-empty domain values for the filter dropdown — pulled ONLY
 * from issue_tracking.discussions.domain (the header "main domain" field).
 * Deliberately does NOT read issue_tracking.discussion_points.domain —
 * per-point domains are a separate, per-point concept and must never
 * populate this dropdown or affect this filter. Read-only; never rewrites
 * any stored value.
 */
export async function listDiscussionDomains(): Promise<string[]> {
  const result = await query<{ domain: string }>(
    `SELECT DISTINCT domain
     FROM issue_tracking.discussions
     WHERE deleted_at IS NULL AND domain IS NOT NULL AND domain <> ''
     ORDER BY domain`
  );
  return result.rows.map((row) => row.domain);
}

/**
 * Distinct, non-empty coordinator/participant names for the "Coordinator /
 * Member" filter dropdown — pulled from BOTH discussions.coordinator_name
 * AND discussion_participants.participant_name, unioned and deduplicated.
 * Never hardcoded; reflects whatever names actually exist in the database
 * right now. Sorted case-insensitively for a stable alphabetical dropdown.
 */
export async function listDiscussionMemberNames(): Promise<string[]> {
  const result = await query<{ name: string }>(
    `SELECT name FROM (
       SELECT coordinator_name AS name FROM issue_tracking.discussions
       WHERE deleted_at IS NULL AND coordinator_name IS NOT NULL AND coordinator_name <> ''
       UNION
       SELECT p.participant_name AS name FROM issue_tracking.discussion_participants p
       JOIN issue_tracking.discussions d ON d.discussion_id = p.discussion_id
       WHERE d.deleted_at IS NULL
     ) AS names
     ORDER BY name`
  );
  return result.rows.map((row) => row.name);
}

export interface DiscussionDetail {
  discussionId: string;
  title: string;
  meetingDateStart: string | null;
  meetingDateEnd: string | null;
  coordinatorName: string | null;
  domain: string | null;
  objective: string | null;
  /** issue_tracking.discussion_groups.group_id, or null for a standalone
   *  Discussion — see lib/queries/discussionGroups.ts for full group detail. */
  groupId: number | null;
  status: DiscussionStatus;
  actionPlan: string | null;
  implementationProgress: string | null;
  duration: string | null;
  processStarted: boolean | null;
  processStartDate: string | null;
  estimatedFinishDate: string | null;
  actualFinishDate: string | null;
  finalOutcome: string | null;
  /** Optional linked-Issue tri-state (migration/008_discussion_groups.sql) —
   *  same design as discussion_points.issue_link_type. */
  issueLinkType: IssueLinkType;
  linkedIssueId: string | null;
  /** Original meeting-minute wording, structured — see
   *  migration/009_discussion_source_content.sql. Null when not (yet)
   *  transcribed for this Discussion. */
  sourceContent: DiscussionSourceContent | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface DiscussionDetailRow {
  discussion_id: string;
  title: string;
  meeting_date_start: string | null;
  meeting_date_end: string | null;
  coordinator_name: string | null;
  domain: string | null;
  objective: string | null;
  group_id: number | null;
  status: DiscussionStatus;
  action_plan: string | null;
  implementation_progress: string | null;
  duration: string | null;
  process_started: boolean | null;
  process_start_date: string | null;
  estimated_finish_date: string | null;
  actual_finish_date: string | null;
  final_outcome: string | null;
  issue_link_type: IssueLinkType;
  linked_issue_id: string | null;
  source_content: DiscussionSourceContent | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function getDiscussionById(
  discussionId: string,
  options: { includeDeleted?: boolean } = {}
): Promise<DiscussionDetail | null> {
  const includeDeleted = options.includeDeleted ?? false;

  const result = await query<DiscussionDetailRow>(
    `SELECT
       d.discussion_id,
       d.title,
       to_char(d.meeting_date_start, 'YYYY-MM-DD') AS meeting_date_start,
       to_char(d.meeting_date_end, 'YYYY-MM-DD') AS meeting_date_end,
       d.coordinator_name,
       d.domain,
       d.objective,
       d.group_id,
       d.status,
       d.action_plan,
       d.implementation_progress,
       d.duration,
       d.process_started,
       to_char(d.process_start_date, 'YYYY-MM-DD') AS process_start_date,
       to_char(d.estimated_finish_date, 'YYYY-MM-DD') AS estimated_finish_date,
       to_char(d.actual_finish_date, 'YYYY-MM-DD') AS actual_finish_date,
       d.final_outcome,
       d.issue_link_type,
       d.linked_issue_id,
       d.source_content,
       mu.display_name AS created_by_name,
       to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
       to_char(d.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deleted_at
     FROM issue_tracking.discussions d
     JOIN issue_tracking.management_users mu ON mu.user_id = d.created_by
     WHERE d.discussion_id = $1
       AND ($2::boolean OR d.deleted_at IS NULL)
     LIMIT 1`,
    [discussionId, includeDeleted]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    discussionId: row.discussion_id,
    title: row.title,
    meetingDateStart: row.meeting_date_start,
    meetingDateEnd: row.meeting_date_end,
    coordinatorName: row.coordinator_name,
    domain: row.domain,
    objective: row.objective,
    groupId: row.group_id !== null ? Number(row.group_id) : null,
    status: row.status,
    actionPlan: row.action_plan,
    implementationProgress: row.implementation_progress,
    duration: row.duration,
    processStarted: row.process_started,
    processStartDate: row.process_start_date,
    estimatedFinishDate: row.estimated_finish_date,
    actualFinishDate: row.actual_finish_date,
    finalOutcome: row.final_outcome,
    issueLinkType: row.issue_link_type,
    linkedIssueId: row.linked_issue_id,
    sourceContent: row.source_content,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface AdjacentDiscussionIds {
  previousId: string | null;
  nextId: string | null;
}

export async function getAdjacentDiscussionIds(discussionId: string): Promise<AdjacentDiscussionIds> {
  const [previousResult, nextResult] = await Promise.all([
    query<{ discussion_id: string }>(
      `SELECT discussion_id FROM issue_tracking.discussions
       WHERE discussion_id < $1 AND deleted_at IS NULL
       ORDER BY discussion_id DESC LIMIT 1`,
      [discussionId]
    ),
    query<{ discussion_id: string }>(
      `SELECT discussion_id FROM issue_tracking.discussions
       WHERE discussion_id > $1 AND deleted_at IS NULL
       ORDER BY discussion_id ASC LIMIT 1`,
      [discussionId]
    ),
  ]);

  return {
    previousId: previousResult.rows[0]?.discussion_id ?? null,
    nextId: nextResult.rows[0]?.discussion_id ?? null,
  };
}

export interface CreateDiscussionParticipantInput {
  name: string;
  roleTitle: string | null;
  managementUserId: number | null;
  isCoordinator: boolean;
}

export interface CreateDiscussionInput {
  title: string;
  meetingDateStart: string | null;
  meetingDateEnd: string | null;
  coordinatorName: string | null;
  domain: string | null;
  objective: string | null;
  actionPlan: string | null;
  implementationProgress: string | null;
  duration: string | null;
  processStarted: boolean | null;
  processStartDate: string | null;
  estimatedFinishDate: string | null;
  participants: CreateDiscussionParticipantInput[];
  /** Optional issue_tracking.discussion_groups.group_id to attach this
   *  Discussion to (migration/008_discussion_groups.sql). Omitted/null for
   *  a standalone Discussion — the default for every Discussion created
   *  before this option existed. */
  groupId?: number | null;
}

/**
 * Creates exactly one new Discussion (+ its participant rows) in one
 * transaction. discussion_id is allocated server-side via
 * issue_tracking.next_discussion_id() — atomic, concurrency-safe, and
 * completely independent of issue_tracking.next_issue_id() (see
 * migration/007_discussions.sql). New Discussions always start at status
 * 'RED' — not a caller-supplied value, mirroring lib/queries/issues.ts's
 * createIssue().
 */
export async function createDiscussion(
  input: CreateDiscussionInput,
  createdByUserId: number
): Promise<string> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const idResult = await client.query<{ next_discussion_id: string }>(
      "SELECT issue_tracking.next_discussion_id() AS next_discussion_id"
    );
    const discussionId = idResult.rows[0]?.next_discussion_id;
    if (!discussionId) {
      throw new Error("Could not allocate a discussion ID.");
    }

    await client.query(
      `INSERT INTO issue_tracking.discussions
         (discussion_id, title, meeting_date_start, meeting_date_end, coordinator_name, domain,
          objective, status, action_plan, implementation_progress, duration, process_started,
          process_start_date, estimated_finish_date, created_by, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RED', $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        discussionId,
        input.title,
        input.meetingDateStart,
        input.meetingDateEnd,
        input.coordinatorName,
        input.domain,
        input.objective,
        input.actionPlan,
        input.implementationProgress,
        input.duration,
        input.processStarted,
        input.processStartDate,
        input.estimatedFinishDate,
        createdByUserId,
        input.groupId ?? null,
      ]
    );

    for (const participant of input.participants) {
      await client.query(
        `INSERT INTO issue_tracking.discussion_participants
           (discussion_id, participant_name, role_title, management_user_id, is_coordinator)
         VALUES ($1, $2, $3, $4, $5)`,
        [discussionId, participant.name, participant.roleTitle, participant.managementUserId, participant.isCoordinator]
      );
    }

    await client.query("COMMIT");
    return discussionId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Soft-deletes a Discussion (deleted_at/deleted_by) — no row is ever
 *  physically removed, mirroring lib/queries/issues.ts's softDeleteIssues(). */
export async function softDeleteDiscussion(discussionId: string, deletedByUserId: number): Promise<boolean> {
  const result = await query<{ discussion_id: string }>(
    `UPDATE issue_tracking.discussions
     SET deleted_at = now(), deleted_by = $2
     WHERE discussion_id = $1 AND deleted_at IS NULL
     RETURNING discussion_id`,
    [discussionId, deletedByUserId]
  );
  return result.rows.length > 0;
}

// ── Discussion-level Issue linking ──────────────────────────────────────────
// Mirrors lib/queries/discussionPoints.ts's identically-named functions
// exactly (same three-state design: discussion_only / linked_existing /
// new_issue_required), just targeting issue_tracking.discussions instead of
// issue_tracking.discussion_points — added by migration/008_discussion_groups.sql
// so that a top-level Discussion (not only a point under one) can carry an
// optional linked Issue, per the corrected "every topic is its own
// Discussion" model. No second Issue-creation mechanism: createIssueForDiscussion()
// below calls the existing lib/queries/issues.ts createIssue(), same as
// discussionPoints.ts's createIssueForPoint() does.

export class InvalidIssueError extends Error {}
export class DiscussionNotFoundError extends Error {}

/** Links a Discussion to an existing, real Issue — validates the Issue
 *  exists first (never trusts a client-supplied ID blindly). */
export async function linkExistingIssueToDiscussion(discussionId: string, issueId: string): Promise<void> {
  const issueCheck = await query<{ issue_id: string }>(
    `SELECT issue_id FROM issue_tracking.issues WHERE issue_id = $1 AND deleted_at IS NULL`,
    [issueId]
  );
  if (issueCheck.rows.length === 0) {
    throw new InvalidIssueError(`Issue "${issueId}" not found.`);
  }

  const result = await query<{ discussion_id: string }>(
    `UPDATE issue_tracking.discussions
     SET issue_link_type = 'linked_existing', linked_issue_id = $2, updated_at = now()
     WHERE discussion_id = $1 AND deleted_at IS NULL
     RETURNING discussion_id`,
    [discussionId, issueId]
  );
  if (result.rows.length === 0) {
    throw new DiscussionNotFoundError(`Discussion "${discussionId}" not found.`);
  }
}

/** Flags a Discussion as needing a new Issue, without creating one yet. */
export async function markDiscussionNewIssueRequired(discussionId: string): Promise<void> {
  const result = await query<{ discussion_id: string }>(
    `UPDATE issue_tracking.discussions
     SET issue_link_type = 'new_issue_required', linked_issue_id = NULL, updated_at = now()
     WHERE discussion_id = $1 AND deleted_at IS NULL
     RETURNING discussion_id`,
    [discussionId]
  );
  if (result.rows.length === 0) {
    throw new DiscussionNotFoundError(`Discussion "${discussionId}" not found.`);
  }
}

/** Reverts a Discussion to plain "discussion only" — clears any link/flag. */
export async function markDiscussionDiscussionOnly(discussionId: string): Promise<void> {
  const result = await query<{ discussion_id: string }>(
    `UPDATE issue_tracking.discussions
     SET issue_link_type = 'discussion_only', linked_issue_id = NULL, updated_at = now()
     WHERE discussion_id = $1 AND deleted_at IS NULL
     RETURNING discussion_id`,
    [discussionId]
  );
  if (result.rows.length === 0) {
    throw new DiscussionNotFoundError(`Discussion "${discussionId}" not found.`);
  }
}

/**
 * Creates a brand-new Issue from a Discussion flagged 'new_issue_required',
 * by calling the EXISTING, unmodified createIssue() from
 * lib/queries/issues.ts. The Discussion is then updated to
 * 'linked_existing' with the new issue_id. If the Discussion-update step
 * fails after the Issue was created, the Issue itself is unaffected — never
 * rolled back or deleted.
 */
export async function createIssueForDiscussion(
  discussionId: string,
  issueInput: CreateIssueInput
): Promise<string> {
  const issueId = await createIssue(issueInput);

  const result = await query<{ discussion_id: string }>(
    `UPDATE issue_tracking.discussions
     SET issue_link_type = 'linked_existing', linked_issue_id = $2, updated_at = now()
     WHERE discussion_id = $1 AND deleted_at IS NULL
     RETURNING discussion_id`,
    [discussionId, issueId]
  );
  if (result.rows.length === 0) {
    throw new DiscussionNotFoundError(
      `Issue ${issueId} was created, but discussion ${discussionId} was not found to link it to.`
    );
  }
  return issueId;
}

/**
 * Updates the mutable, working Action text (issue_tracking.discussions.action_plan)
 * — the ONLY thing this ever writes to. Never touches source_content, which
 * remains the original, unedited meeting-minute transcription (see
 * migration/009_discussion_source_content.sql and
 * DiscussionDetail.tsx/DiscussionActionSection.tsx's "action_plan first, else
 * fall back to source_content.action" display rule). Passing null clears it,
 * reverting the displayed Action back to the source_content fallback.
 */
export async function updateDiscussionActionPlan(discussionId: string, actionPlan: string | null): Promise<void> {
  const result = await query<{ discussion_id: string }>(
    `UPDATE issue_tracking.discussions
     SET action_plan = $2, updated_at = now()
     WHERE discussion_id = $1 AND deleted_at IS NULL
     RETURNING discussion_id`,
    [discussionId, actionPlan]
  );
  if (result.rows.length === 0) {
    throw new DiscussionNotFoundError(`Discussion "${discussionId}" not found.`);
  }
}

// ── Operational fields (Duration / Process Started / Process Start Date /
// Estimated Finish / Actual Finish) ─────────────────────────────────────────
// All five columns already existed on issue_tracking.discussions since
// migration/007_discussions.sql — no schema change needed to make them
// editable. Deliberately a separate function from updateDiscussionStatus()
// (lib/queries/discussionStatus.ts): these are plain scheduling/tracking
// fields, not a RED/AMBER/GREEN transition, and editing them never changes
// status on its own (e.g. setting Actual Finish does NOT auto-mark GREEN —
// the existing status workflow remains the sole authority for that).

export class DiscussionValidationError extends Error {}

export interface UpdateDiscussionOperationalFieldsInput {
  discussionId: string;
  /** null clears Duration. */
  duration: string | null;
  /** null = "Not set". */
  processStarted: boolean | null;
  /**
   * Raw value from the date input. An EMPTY/omitted value here means "no
   * change requested" — the existing stored process_start_date (if any) is
   * preserved, never silently cleared. Only a non-empty value actually
   * changes it. There is deliberately no way to clear an already-set
   * Process Start Date through this function — matches the explicit
   * "do not silently destroy... preserve it safely" requirement.
   */
  processStartDateInput: string | null;
  /** null explicitly clears Estimated Finish (ordinary editable date field). */
  estimatedFinishDate: string | null;
  /** null explicitly clears Actual Finish (ordinary editable date field). */
  actualFinishDate: string | null;
}

/**
 * Updates the five operational/scheduling fields in one transaction.
 * Validates server-side (never trusts client-side validation alone):
 *   - Process Started = Yes requires a Process Start Date to exist (either
 *     already stored, or supplied in this same call).
 *   - Estimated Finish / Actual Finish may not be before the effective
 *     Process Start Date, when both are known.
 * Any violation raises DiscussionValidationError and rolls back — no
 * partial write.
 */
export async function updateDiscussionOperationalFields(
  input: UpdateDiscussionOperationalFieldsInput
): Promise<void> {
  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const current = await client.query<{ process_start_date: string | null }>(
      `SELECT to_char(process_start_date, 'YYYY-MM-DD') AS process_start_date
       FROM issue_tracking.discussions
       WHERE discussion_id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [input.discussionId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new DiscussionNotFoundError(`Discussion "${input.discussionId}" not found.`);
    }

    const effectiveProcessStartDate = input.processStartDateInput || row.process_start_date;

    if (input.processStarted === true && !effectiveProcessStartDate) {
      throw new DiscussionValidationError("Process Start Date is required when Process Started is Yes.");
    }
    if (
      effectiveProcessStartDate &&
      input.estimatedFinishDate &&
      input.estimatedFinishDate < effectiveProcessStartDate
    ) {
      throw new DiscussionValidationError("Estimated Finish cannot be before Process Start Date.");
    }
    if (effectiveProcessStartDate && input.actualFinishDate && input.actualFinishDate < effectiveProcessStartDate) {
      throw new DiscussionValidationError("Actual Finish cannot be before Process Start Date.");
    }

    await client.query(
      `UPDATE issue_tracking.discussions
       SET duration = $2,
           process_started = $3,
           process_start_date = $4,
           estimated_finish_date = $5,
           actual_finish_date = $6,
           updated_at = now()
       WHERE discussion_id = $1`,
      [
        input.discussionId,
        input.duration,
        input.processStarted,
        effectiveProcessStartDate,
        input.estimatedFinishDate,
        input.actualFinishDate,
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** discussions.domain is VARCHAR(50) — see migration/007_discussions.sql. */
export const DISCUSSION_DOMAIN_MAX_LENGTH = 50;

export interface UpdateDiscussionDomainInput {
  discussionId: string;
  /** null clears the Discussion's own main domain. */
  domain: string | null;
}

/**
 * Updates ONLY issue_tracking.discussions.domain — the Discussion's own
 * "Main Domain". Deliberately never touches discussion_points.domain, which
 * is a separate per-point column with its own meaning (the same distinction
 * listDiscussions() documents for the Domain filter).
 *
 * Separate from updateDiscussionOperationalFields() so the two edit forms
 * stay independent: saving one can never blank a field owned by the other.
 * Locks the row FOR UPDATE and rejects a soft-deleted or missing Discussion
 * rather than silently updating zero rows.
 */
export async function updateDiscussionDomain(input: UpdateDiscussionDomainInput): Promise<void> {
  const domain = input.domain?.trim() || null;
  if (domain && domain.length > DISCUSSION_DOMAIN_MAX_LENGTH) {
    throw new DiscussionValidationError(
      `Main Domain must be ${DISCUSSION_DOMAIN_MAX_LENGTH} characters or fewer.`
    );
  }

  const client = await getVerifiedClient();
  try {
    await client.query("BEGIN");

    const current = await client.query<{ discussion_id: string }>(
      `SELECT discussion_id FROM issue_tracking.discussions
       WHERE discussion_id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [input.discussionId]
    );
    if (!current.rows[0]) {
      throw new DiscussionNotFoundError(`Discussion "${input.discussionId}" not found.`);
    }

    await client.query(
      `UPDATE issue_tracking.discussions
       SET domain = $2, updated_at = now()
       WHERE discussion_id = $1`,
      [input.discussionId, domain]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
