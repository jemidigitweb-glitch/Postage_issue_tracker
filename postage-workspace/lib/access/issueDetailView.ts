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
  /** The AI Investigation Assistant panel.
   *
   *  Now true for BOTH portals, but for different reasons and under different
   *  permissions: the Assignee holds issue:analyse_own_assigned and may only
   *  analyse an Issue currently assigned to them, while the Super Admin holds
   *  issue:analyse_any and needs no assignment. It stays false for everyone
   *  else. Rendering the panel is presentation; the Server Action checks the
   *  matching permission independently. */
  showAiAssistant: boolean;
  /**
   * The readable Warehouse Mobile Evidence section, instead of leaving
   * extra_data.mobileTimeline to the generic "Additional details" JSON dump.
   *
   * ── WHY THIS ONE IS TRUE FOR "other" ──────────────────────────────────────
   * Every other flag on this interface ADDS information to a page, so the safe
   * default is off. This one does the opposite: the timeline is ALREADY on the
   * page for anyone who can open the Issue — stringified, complete with
   * internal item ids and Cloudinary public_ids. Turning this on REPLACES that
   * dump with a version that has all of it stripped out. Leaving it off for a
   * role does not withhold anything from them; it shows them more.
   *
   * That is what makes it correct for `raised_by`, who resolves to "other"
   * here: TU-001 is their own Issue, raised from their own phone, and it was
   * showing them raw JSON. It is the same reason it is on for the Super Admin.
   *
   * FALSE for the Assignee, and only for them — that portal's markup is frozen
   * by the no-regression requirement and this change does not touch it.
   */
  showMobileEvidence: boolean;
}

/** Every flag off. The shape "other" resolves to, and the safe default. */
const NOTHING_EXTRA: Omit<IssueDetailView, "kind"> = {
  showWorkProgress: false,
  showAssigneeStatusControl: false,
  showAssignedTo: false,
  showFixAndActionRequired: false,
  showAiAssistant: false,
  showMobileEvidence: false,
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
    // The Super Admin's page is otherwise unchanged — every Stage 6 flag stays
    // off. The AI panel is the one deliberate addition.
    return { kind: "admin", ...NOTHING_EXTRA, showAiAssistant: true, showMobileEvidence: true };
  }

  if (input.canChangeStatusOwnAssigned) {
    return {
      kind: "assignee",
      showWorkProgress: true,
      showAssigneeStatusControl: true,
      showAssignedTo: true,
      showFixAndActionRequired: true,
      showAiAssistant: true,
      // The one flag the Assignee does NOT get. See the field's doc comment:
      // this portal is deliberately left exactly as it is.
      showMobileEvidence: false,
    };
  }

  // Raised-by-Staff lands here. They get the readable evidence and nothing
  // else — see the showMobileEvidence doc for why that is a narrowing.
  return { kind: "other", ...NOTHING_EXTRA, showMobileEvidence: true };
}
