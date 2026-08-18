import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AssignmentPanel from "@/components/issues/AssignmentPanel";
import IssueDetail from "@/components/issues/IssueDetail";
import IssueWorkProgress from "@/components/issues/IssueWorkProgress";
import AssigneeStatusControl from "@/components/issues/AssigneeStatusControl";
import IssueAiAssistant from "@/components/issues/IssueAiAssistant";
import { getCurrentUserWithScope, hasPermission } from "@/lib/auth";
import { resolveIssueDetailView } from "@/lib/access/issueDetailView";
import { listAssignmentUsers } from "@/lib/queries/assignmentUsers";
import { getCurrentIssueAssignment } from "@/lib/queries/issueAssignments";
import { getAdjacentIssueIds, getIssueById, isValidIssueId } from "@/lib/queries/issues";
import { listIssueProgressEntries } from "@/lib/queries/issueWorkProgress";
import {
  ADMIN_AI_ASSISTANT_PREFERENCE_KEY,
  AI_ASSISTANT_PREFERENCE_KEY,
} from "@/lib/access/aiAssistantPreference";

// Real, database-backed issue detail page.
//
// `params` is a Promise in this Next.js version — confirmed against
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
//
// ── ACCESS (Stage 3) ────────────────────────────────────────────────────────
// proxy.ts only proves that SOME valid session cookie exists — it performs no
// database lookup and knows nothing about roles, so it cannot decide whether
// this particular user may see this particular Issue. Before Stage 3 this
// page made no user check at all, which meant any authenticated user could
// open any Issue by typing its ID into the URL.
//
// Now the page resolves the user and their IssueAccessScope, and threads that
// scope into every query. An Issue outside the caller's scope comes back as
// null from getIssueById() and renders the SAME "Issue not found" panel a
// genuinely nonexistent ID produces — deliberately identical, so a scoped
// user cannot use this page to confirm that another assignee's Issue exists.

const backLinkClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";
const backLinkDisabledClassName =
  "rounded-lg border border-neutral-100 dark:border-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300 dark:text-neutral-700";

function NavBar({
  previousId,
  nextId,
}: {
  previousId: string | null;
  nextId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/dashboard/issues" className={backLinkClassName}>
        ← Back to Issue List
      </Link>
      <div className="flex items-center gap-2">
        {previousId ? (
          <Link href={`/dashboard/issues/${previousId}`} className={backLinkClassName}>
            ← Previous Issue
          </Link>
        ) : (
          <span className={backLinkDisabledClassName}>← Previous Issue</span>
        )}
        {nextId ? (
          <Link href={`/dashboard/issues/${nextId}`} className={backLinkClassName}>
            Next Issue →
          </Link>
        ) : (
          <span className={backLinkDisabledClassName}>Next Issue →</span>
        )}
      </div>
    </div>
  );
}

function MessagePanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/issues" className={backLinkClassName}>
        ← Back to Issue List
      </Link>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">{title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
      </div>
    </div>
  );
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId: rawIssueId } = await params;
  const issueId = decodeURIComponent(rawIssueId);

  if (!isValidIssueId(issueId)) {
    return (
      <DashboardLayout>
        <MessagePanel
          title="Invalid Issue ID"
          message={`"${issueId}" is not a valid issue ID format (expected something like "ND-001").`}
        />
      </DashboardLayout>
    );
  }

  // Resolved from the session only — never from params or search params.
  const { user: currentUser, scope } = await getCurrentUserWithScope();
  const [canAssign, canChangeAny, canChangeOwn] = currentUser
    ? await Promise.all([
        hasPermission(currentUser, "issue:assign"),
        hasPermission(currentUser, "issue:change_status_any"),
        hasPermission(currentUser, "issue:change_status_own_assigned"),
      ])
    : [false, false, false];
  // ── WHAT THIS VIEWER SEES ─────────────────────────────────────────────────
  // One pure decision (lib/access/issueDetailView.ts) instead of ad-hoc role
  // checks scattered through the JSX below. For a Super Admin every Stage 6
  // flag is false, which is what restores their page to its pre-Stage-6
  // presentation; for an Assignee they are all true.
  const view = resolveIssueDetailView({
    canChangeStatusAny: canChangeAny,
    canChangeStatusOwnAssigned: canChangeOwn,
  });

  let issue: Awaited<ReturnType<typeof getIssueById>> = null;
  let adjacent: Awaited<ReturnType<typeof getAdjacentIssueIds>> = { previousId: null, nextId: null };
  let assignmentUsers: Awaited<ReturnType<typeof listAssignmentUsers>> = [];
  let assignment: Awaited<ReturnType<typeof getCurrentIssueAssignment>> = null;
  let progressEntries: Awaited<ReturnType<typeof listIssueProgressEntries>> = [];
  let errorMessage: string | null = null;

  try {
    // No work-log read: the Work Log timeline was removed from this page, so
    // nothing renders it. The history itself is untouched and still written
    // on every transition and progress update — lib/queries/issueWorkProgress.ts
    // still exposes listIssueWorkLog() to read it back.
    //
    // listIssueProgressEntries IS read here: it returns every Implementation
    // Progress entry ever recorded, which the Work Progress block renders in
    // full. Scoped like every other read on this page, and skipped entirely
    // for a viewer who does not see that block.
    // listAssignmentUsers() feeds ONLY the AssignmentPanel, which renders only
    // for a holder of issue:assign. Skipping it for everyone else removes one
    // database round trip per Assignee page view. It changes nothing visible:
    // when the panel is not rendered, the list has no reader, and the variable
    // keeps its existing [] default — the same value the panel would have been
    // given. Same conditional shape already used for listIssueProgressEntries.
    [issue, adjacent, assignmentUsers, assignment, progressEntries] = await Promise.all([
      getIssueById(issueId, scope),
      getAdjacentIssueIds(issueId, scope),
      canAssign ? listAssignmentUsers() : Promise.resolve([]),
      getCurrentIssueAssignment(issueId),
      view.showWorkProgress ? listIssueProgressEntries(issueId, scope) : Promise.resolve([]),
    ]);
  } catch (error) {
    // Never surface the raw error (could include connection details) to
    // the browser — log server-side only, show a generic message.
    console.error(`[dashboard/issues/${issueId}] failed to load issue:`, error);
    errorMessage = "Unable to load this issue right now. Please try again shortly.";
  }

  if (errorMessage) {
    return (
      <DashboardLayout>
        <MessagePanel title="Something went wrong" message={errorMessage} />
      </DashboardLayout>
    );
  }

  if (!issue) {
    return (
      <DashboardLayout>
        <MessagePanel
          title="Issue not found"
          message={`No issue with ID "${issueId}" exists.`}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <NavBar previousId={adjacent.previousId} nextId={adjacent.nextId} />
        {/* Both extra props are undefined for a Super Admin, so IssueDetail
            renders exactly the markup it did before Stage 6. */}
        <IssueDetail
          issue={issue}
          assignedToName={view.showAssignedTo ? (assignment?.assigneeName ?? null) : undefined}
          fixAndActionRequired={
            view.showFixAndActionRequired ? (issue.resolution ?? "") : undefined
          }
          // Historical audio evidence is a SUPER ADMIN view. The Assignee
          // portal keeps exactly the audio behaviour it already had (uploads
          // and voice recordings from Add New Issue), so this stage adds no
          // new Assignee-portal display. Filtered server-side.
          includeHistoricalAudio={view.kind === "admin"}
          // Warehouse Mobile Stage 2 evidence, rendered readably instead of as
          // a raw JSON dump. SUPER ADMIN ONLY, exactly like the historical
          // audio above — the Assignee portal's markup is unchanged.
          showMobileEvidence={view.kind === "admin"}
        />
        {/* ASSIGNEE ONLY. The Super Admin has never had a status control on
            this page and still does not — their status workflow is unchanged. */}
        {view.showAssigneeStatusControl && (
          <AssigneeStatusControl
            issueId={issue.issueId}
            status={issue.status}
            currentProgress={issue.work.implementationProgress}
          />
        )}
        {/* ASSIGNEE ONLY. Stage 6 shipped this to every viewer, which put
            Assignee-portal functionality on the Super Admin's page; it is now
            scoped to the portal it belongs to. The DATA is untouched — the
            columns, the status history and the investigation notes all remain
            exactly as they are, this only stops rendering them for a role
            whose page is meant to look as it did before Stage 6. */}
        {view.showWorkProgress && (
          <IssueWorkProgress
            issueId={issue.issueId}
            status={issue.status}
            work={issue.work}
            progressEntries={progressEntries}
            canRecordProgress
          />
        )}
        {/* ASSIGNEE ONLY. Advisory AI guidance, below the assignee's own work
            fields so it reads as a consultation rather than an instruction.
            The flag is false for a Super Admin (resolveIssueDetailView returns
            NOTHING_EXTRA on that branch first and absolutely), and
            analyseIssueAction re-checks the permission independently — hiding
            the panel is defense in depth, not the guard. */}
        {view.showAiAssistant && (
          <IssueAiAssistant
            issueId={issue.issueId}
            // Separate localStorage keys per portal, chosen server-side.
            preferenceKey={
              view.kind === "admin"
                ? ADMIN_AI_ASSISTANT_PREFERENCE_KEY
                : AI_ASSISTANT_PREFERENCE_KEY
            }
          />
        )}
        {/* Assignment is a Super Admin operation. The panel is not rendered
            at all for anyone without issue:assign — and assignIssuesAction
            enforces the same permission independently, so hiding it here is
            defense in depth, not the guard. */}
        {canAssign && (
          <AssignmentPanel
            issueId={issueId}
            // Assignment closes once work starts — the panel withholds its
            // controls for anything that is not RED, and both Server Actions
            // re-check the same rule against the locked row.
            issueStatus={issue.status}
            assignmentUsers={assignmentUsers}
            currentAssigneeId={assignment?.assigneeId ?? null}
            currentAssigneeName={assignment?.assigneeName ?? null}
            currentAssignedAt={assignment?.assignedAt ?? null}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
