import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getCurrentUserWithScope, hasPermission } from "@/lib/auth";
import { isIssuesOnlyRole } from "@/lib/access/raisedByAccess";
import { getIssueById, isValidIssueId, listCategories } from "@/lib/queries/issues";
import EditIssueForm from "./EditIssueForm";

const backLinkClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";

function MessagePanel({
  issueId,
  title,
  message,
}: {
  issueId: string;
  title: string;
  message: string;
}) {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <Link href={`/dashboard/issues/${issueId}`} className={`${backLinkClassName} w-fit`}>
          ← Back to Issue
        </Link>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-10 text-center">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">{title}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

/**
 * Edit Issue — Super Admin and Raised-by-Staff (self-raisers, correcting
 * their own submission).
 *
 * Page-level gate matching app/dashboard/issues/new/page.tsx's pattern: the
 * real guard is updateIssueDetailsAction's own `issue:edit` check in
 * edit-actions.ts, re-verified independently of whatever this page renders.
 * This only avoids showing a form to someone whose submission would be
 * rejected anyway.
 *
 * A soft-deleted Issue cannot be opened here — editing a record that has
 * already been removed from the active list is not a supported operation
 * (updateIssueDetails() would refuse it too, via its own `deleted_at IS NULL`
 * guard; this page just explains why up front instead of letting the form
 * fail after the fact).
 */
export default async function EditIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId: rawIssueId } = await params;
  const issueId = decodeURIComponent(rawIssueId);

  if (!isValidIssueId(issueId)) {
    return (
      <MessagePanel
        issueId={issueId}
        title="Invalid Issue ID"
        message={`"${issueId}" is not a valid issue ID format (expected something like "ND-001").`}
      />
    );
  }

  const { user: currentUser, scope } = await getCurrentUserWithScope();
  const canEdit = currentUser ? await hasPermission(currentUser, "issue:edit") : false;

  if (!canEdit) {
    return (
      <MessagePanel
        issueId={issueId}
        title="Not authorized"
        message="You don't have permission to edit issues."
      />
    );
  }

  let issue: Awaited<ReturnType<typeof getIssueById>> = null;
  let categories: string[] = [];
  try {
    [issue, categories] = await Promise.all([getIssueById(issueId, scope), listCategories()]);
  } catch (error) {
    console.error(`[dashboard/issues/${issueId}/edit] failed to load issue:`, error);
    return (
      <MessagePanel
        issueId={issueId}
        title="Something went wrong"
        message="Unable to load this issue right now. Please try again shortly."
      />
    );
  }

  if (!issue) {
    return (
      <MessagePanel
        issueId={issueId}
        title="Issue not found"
        message={`No issue with ID "${issueId}" exists.`}
      />
    );
  }

  if (issue.deletedAt) {
    return (
      <MessagePanel
        issueId={issueId}
        title="This issue has been deleted"
        message="A deleted issue cannot be edited."
      />
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <Link href={`/dashboard/issues/${issueId}`} className={`${backLinkClassName} w-fit`}>
          ← Back to Issue
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            Edit Issue
          </h1>
          <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{issue.issueId}</p>
        </div>

        <EditIssueForm
          issue={issue}
          categories={categories}
          hideResolution={isIssuesOnlyRole(currentUser?.role ?? null)}
        />
      </div>
    </DashboardLayout>
  );
}
