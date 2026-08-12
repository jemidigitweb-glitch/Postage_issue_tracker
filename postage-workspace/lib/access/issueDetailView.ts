// Which Issue-detail sections a request may see — the pure decision behind
// app/dashboard/issues/[issueId]/page.tsx.
//
// DELIBERATELY has no `server-only` import, no `next/*` import, and no
// database import — same discipline as lib/access/permissions.ts and
// lib/access/issueWorkflow.ts, so the composition rule is directly
// unit-testable (tests/issueDetailView.test.ts) without a request context.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Stage 6 put the WORK PROGRESS block on the Issue detail page for EVERYONE.
// That was the wrong scope: it is Assignee-portal functionality, and the
// Super Admin's detail page is meant to stay exactly as it was before Stage 6.
// Rather than scatter `canChangeAny ? … : …` checks through the page, the
// whole decision is made once, here, and returned as a set of named booleans.
// A reviewer can then read one small pure function to know what each role
// sees, and a test can assert it exhaustively.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//   SUPER ADMIN (issue:change_status_any)
//     Pre-Stage-6 page, unchanged: identity/meta fields, Description,
//     Images/Attachments, Additional details, and the Assignment panel.
//     NO Work Progress, NO Process Started / Completed, NO Implementation In
//     Progress, NO Implementation Done, NO Final Resolution, NO Save Progress,
//     NO Work Log, and no status control (it never had one).
//
//   ASSIGNEE (issue:change_status_own_assigned, WITHOUT change_status_any)
//     Everything the Super Admin sees that they are permitted to see, PLUS the
//     Stage 6 Work Progress block, the work log, and the assignee status
//     control — all still scoped to Issues currently assigned to them.
//
//   ANYONE ELSE
//     Nothing extra. Fail closed.
//
// Role comes from the server-side session (lib/auth.ts). Nothing here reads a
// form field, a query parameter, or any other client-supplied value — the
// caller passes resolved permission booleans, not a claimed role.

/** Server-resolved permissions. Both come from hasPermission() against the
 *  session user; neither is ever sent by the browser. */
export interface IssueDetailViewerInput {
  /** issue:change_status_any — the Super Admin / management path. */
  canChangeStatusAny: boolean;
  /** issue:change_status_own_assigned — the Assignee (role 'staff') path. */
  canChangeStatusOwnAssigned: boolean;
}

export type IssueDetailViewerKind = "admin" | "assignee" | "other";

export interface IssueDetailView {
  /** Which portal this request is being rendered for. */
  kind: IssueDetailViewerKind;
  /** The Stage 6 WORK PROGRESS card: Process Started, Implementation In
   *  Progress, Implementation Done, Final Resolution, Completed, and the
   *  Save Progress form. All of it, or none of it.
   *
   *  The per-entry Work Log timeline that this card used to end with has been
   *  removed from the page entirely — for every role — so there is no flag
   *  for it. The underlying history is still recorded and still readable via
   *  listIssueWorkLog(); it is simply not rendered anywhere. */
  showWorkProgress: boolean;
  /** The assignee status control (Change status to…). The Super Admin has
   *  never had a status control on this page and still does not. */
  showAssigneeStatusControl: boolean;
  /** "Assigned To" in the meta grid. The Super Admin already sees the
   *  assignment through its own AssignmentPanel, so adding it here would
   *  change their page. */
  showAssignedTo: boolean;
  /** The historical "Fix & Action Required" (issues.resolution) block. Not
   *  part of the Super Admin's pre-Stage-6 detail page, so it stays off
   *  there — restoring that page means not adding sections to it either. */
  showFixAndActionRequired: boolean;
}

/** Every flag off. The shape "other" resolves to, and the safe default. */
const NOTHING_EXTRA: Omit<IssueDetailView, "kind"> = {
  showWorkProgress: false,
  showAssigneeStatusControl: false,
  showAssignedTo: false,
  showFixAndActionRequired: false,
};

/**
 * Decides what the Issue detail page renders for this viewer.
 *
 * The Super Admin check comes FIRST and is absolute: a holder of
 * issue:change_status_any always resolves to "admin" with every Stage 6 flag
 * off, even if they somehow also held issue:change_status_own_assigned. That
 * ordering is what makes "the Super Admin's page is unchanged" a property of
 * this function rather than of how the page happens to be written.
 */
export function resolveIssueDetailView(input: IssueDetailViewerInput): IssueDetailView {
  if (input.canChangeStatusAny) {
    return { kind: "admin", ...NOTHING_EXTRA };
  }

  if (input.canChangeStatusOwnAssigned) {
    return {
      kind: "assignee",
      showWorkProgress: true,
      showAssigneeStatusControl: true,
      showAssignedTo: true,
      showFixAndActionRequired: true,
    };
  }

  return { kind: "other", ...NOTHING_EXTRA };
}
