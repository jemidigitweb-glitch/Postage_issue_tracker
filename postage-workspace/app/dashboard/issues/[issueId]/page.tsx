import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AssignmentPanel from "@/components/issues/AssignmentPanel";
import IssueDetail from "@/components/issues/IssueDetail";
import { listAssignmentUsers } from "@/lib/queries/assignmentUsers";
import { getCurrentIssueAssignment } from "@/lib/queries/issueAssignments";
import { getAdjacentIssueIds, getIssueById, isValidIssueId } from "@/lib/queries/issues";

// Real, database-backed issue detail page — replaces the earlier
// placeholder stub. Read-only: no editing, assignment, comments, or
// workflow/history here (out of scope for this iteration).
//
// `params` is a Promise in this Next.js version — confirmed against
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
// (same convention this file already used as a placeholder).
//
// Unauthorized access is handled upstream: proxy.ts's matcher covers
// /dashboard/issues/:path*, so an unauthenticated request never reaches
// this component at all — nothing further to add here for that case, per
// documentation/issue_tracker_application_structure.md's auth integration
// point.

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

  let issue: Awaited<ReturnType<typeof getIssueById>> = null;
  let adjacent: Awaited<ReturnType<typeof getAdjacentIssueIds>> = { previousId: null, nextId: null };
  let assignmentUsers: Awaited<ReturnType<typeof listAssignmentUsers>> = [];
  let assignment: Awaited<ReturnType<typeof getCurrentIssueAssignment>> = null;
  let errorMessage: string | null = null;

  try {
    [issue, adjacent, assignmentUsers, assignment] = await Promise.all([
      getIssueById(issueId),
      getAdjacentIssueIds(issueId),
      listAssignmentUsers(),
      getCurrentIssueAssignment(issueId),
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
        <IssueDetail issue={issue} />
        <AssignmentPanel
          issueId={issueId}
          assignmentUsers={assignmentUsers}
          currentAssigneeId={assignment?.assigneeId ?? null}
          currentAssigneeName={assignment?.assigneeName ?? null}
          currentAssignedAt={assignment?.assignedAt ?? null}
        />
      </div>
    </DashboardLayout>
  );
}
