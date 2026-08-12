// Pure Issue status-workflow rules.
//
// Extracted verbatim from lib/queries/issueStatus.ts so the rules can be
// unit-tested without a database (see tests/access.test.ts). The semantics
// are UNCHANGED from the pre-Stage-3 implementation — this file only moves
// the decision out of the transaction body:
//
//   RED -> AMBER -> GREEN, forward-only. Same-status re-selection is a
//   no-op (rolled back, not an error). Once AMBER or GREEN, status can
//   never move back to RED; once GREEN it can never move to any earlier
//   status. There is no reopen path — leaving GREEN is not permitted from
//   any caller or any role.
//
// No `server-only` / `next` / database import: keep it that way.

export type IssueStatusValue = "RED" | "AMBER" | "GREEN";

/** Workflow order, not alphabetical. */
export const STATUS_RANK: Readonly<Record<IssueStatusValue, number>> = {
  RED: 0,
  AMBER: 1,
  GREEN: 2,
};

export type TransitionKind = "noop" | "forward" | "backward";

/**
 * Classifies a requested transition. The caller decides what to do with it:
 * "noop" -> roll back and report success, "forward" -> apply, "backward" ->
 * reject. That mapping is exactly what lib/queries/issueStatus.ts does.
 */
export function classifyTransition(
  fromStatus: IssueStatusValue,
  toStatus: IssueStatusValue
): TransitionKind {
  if (fromStatus === toStatus) {
    return "noop";
  }
  return STATUS_RANK[toStatus] < STATUS_RANK[fromStatus] ? "backward" : "forward";
}

// ---------------------------------------------------------------------------
// ASSIGNEE workflow (role 'staff')
//
// A SEPARATE, ADDITIVE rule set. Everything above is the Super Admin's
// workflow and is deliberately left byte-for-byte unchanged — no caller that
// used classifyTransition() behaves any differently because this section
// exists.
//
// The approved assignee matrix:
//
//        to:   RED     AMBER   GREEN
//   from RED   (noop)  ALLOW   BLOCK
//   from AMBER ALLOW   (noop)  ALLOW
//   from GREEN BLOCK   BLOCK   (noop)
//
// Two ways this differs from the Super Admin's forward-only rule:
//   - AMBER -> RED is ALLOWED for an assignee ("I have to stop work on this")
//     where the Super Admin's rule classifies it "backward" and rejects it.
//   - RED -> GREEN is BLOCKED for an assignee (work must be started before it
//     can be completely solved) where the Super Admin's rule allows it.
// GREEN remains final for both, by different routes: "backward" for the
// Super Admin, an empty allow-list here.
//
// Enforced server-side inside the status transaction (see
// lib/queries/issueStatus.ts) — the UI only hides choices that would be
// refused anyway.
// ---------------------------------------------------------------------------

/** The exact assignee matrix. GREEN's empty list is what makes GREEN final. */
export const ASSIGNEE_ALLOWED_TRANSITIONS: Readonly<
  Record<IssueStatusValue, readonly IssueStatusValue[]>
> = {
  RED: ["AMBER"],
  AMBER: ["RED", "GREEN"],
  GREEN: [],
};

export type AssigneeTransitionKind = "noop" | "allowed" | "blocked";

/**
 * Classifies a requested transition FOR AN ASSIGNEE against the matrix above.
 * The caller maps the three answers the same way it always has: "noop" ->
 * roll back and report success, "allowed" -> apply, "blocked" -> reject.
 *
 * Never consulted for a caller holding issue:change_status_any — that path
 * still goes through classifyTransition().
 */
export function classifyAssigneeTransition(
  fromStatus: IssueStatusValue,
  toStatus: IssueStatusValue
): AssigneeTransitionKind {
  if (fromStatus === toStatus) {
    return "noop";
  }
  return ASSIGNEE_ALLOWED_TRANSITIONS[fromStatus].includes(toStatus) ? "allowed" : "blocked";
}

/**
 * The statuses an assignee may move an Issue to from where it is now — the
 * single source the detail-page control renders from, so the dropdown and
 * the server can never disagree about what is on offer. An empty array means
 * "no status-change control at all" (GREEN).
 */
export function assigneeStatusOptions(
  fromStatus: IssueStatusValue
): readonly IssueStatusValue[] {
  return ASSIGNEE_ALLOWED_TRANSITIONS[fromStatus];
}
