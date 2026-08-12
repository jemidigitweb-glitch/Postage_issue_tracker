import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import DiscussionCommentsPanel from "@/components/discussions/DiscussionCommentsPanel";
import DiscussionDetail from "@/components/discussions/DiscussionDetail";
import DiscussionParticipantsPanel from "@/components/discussions/DiscussionParticipantsPanel";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { redirectAssigneeToOwnIssues } from "@/lib/routeGuards";
import { listDiscussionComments } from "@/lib/queries/discussionComments";
import { getDiscussionGroupById } from "@/lib/queries/discussionGroups";
import { listDiscussionParticipants } from "@/lib/queries/discussionParticipants";
import {
  getAdjacentDiscussionIds,
  getDiscussionById,
  isValidDiscussionId,
  listDiscussionDomains,
} from "@/lib/queries/discussions";
import { listActiveStaff } from "@/lib/queries/staff";

// Real, database-backed Discussion detail page — mirrors
// app/dashboard/issues/[issueId]/page.tsx's structure (Previous/Next nav,
// invalid-ID vs not-found distinction, error-message fallback). `params` is
// a Promise in this Next.js version, same convention used there.

const backLinkClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";
const backLinkDisabledClassName =
  "rounded-lg border border-neutral-100 dark:border-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300 dark:text-neutral-700";

function NavBar({ previousId, nextId }: { previousId: string | null; nextId: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/dashboard/discussions" className={backLinkClassName}>
        ← Back to Discussions
      </Link>
      <div className="flex items-center gap-2">
        {previousId ? (
          <Link href={`/dashboard/discussions/${previousId}`} className={backLinkClassName}>
            ← Previous
          </Link>
        ) : (
          <span className={backLinkDisabledClassName}>← Previous</span>
        )}
        {nextId ? (
          <Link href={`/dashboard/discussions/${nextId}`} className={backLinkClassName}>
            Next →
          </Link>
        ) : (
          <span className={backLinkDisabledClassName}>Next →</span>
        )}
      </div>
    </div>
  );
}

function MessagePanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/discussions" className={backLinkClassName}>
        ← Back to Discussions
      </Link>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">{title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
      </div>
    </div>
  );
}

export default async function DiscussionDetailPage({
  params,
}: {
  params: Promise<{ discussionId: string }>;
}) {
  await redirectAssigneeToOwnIssues();

  const { discussionId: rawDiscussionId } = await params;
  const discussionId = decodeURIComponent(rawDiscussionId);

  if (!isValidDiscussionId(discussionId)) {
    return (
      <DashboardLayout>
        <MessagePanel
          title="Invalid Discussion ID"
          message={`"${discussionId}" is not a valid discussion ID format (expected something like "DISC-001").`}
        />
      </DashboardLayout>
    );
  }

  const currentUser = await getCurrentUser();
  if (!currentUser || !(await hasPermission(currentUser, "discussion:view"))) {
    return (
      <DashboardLayout>
        <MessagePanel
          title="Not authorized"
          message="You do not have permission to view discussions."
        />
      </DashboardLayout>
    );
  }

  let discussion: Awaited<ReturnType<typeof getDiscussionById>> = null;
  let adjacent: Awaited<ReturnType<typeof getAdjacentDiscussionIds>> = { previousId: null, nextId: null };
  let participants: Awaited<ReturnType<typeof listDiscussionParticipants>> = [];
  let comments: Awaited<ReturnType<typeof listDiscussionComments>> = [];
  let staff: Awaited<ReturnType<typeof listActiveStaff>> = [];
  // Existing Main Domains, offered as suggestions on the inline Main Domain
  // editor — the same list that drives the Discussions list Domain filter.
  let domains: Awaited<ReturnType<typeof listDiscussionDomains>> = [];
  let errorMessage: string | null = null;

  try {
    [discussion, adjacent, participants, comments, staff, domains] = await Promise.all([
      getDiscussionById(discussionId),
      getAdjacentDiscussionIds(discussionId),
      listDiscussionParticipants(discussionId),
      listDiscussionComments(discussionId),
      listActiveStaff(),
      listDiscussionDomains(),
    ]);
  } catch (error) {
    console.error(`[dashboard/discussions/${discussionId}] failed to load discussion:`, error);
    errorMessage = "Unable to load this discussion right now. Please try again shortly.";
  }

  if (errorMessage) {
    return (
      <DashboardLayout>
        <MessagePanel title="Something went wrong" message={errorMessage} />
      </DashboardLayout>
    );
  }

  if (!discussion) {
    return (
      <DashboardLayout>
        <MessagePanel title="Discussion not found" message={`No discussion with ID "${discussionId}" exists.`} />
      </DashboardLayout>
    );
  }

  // Only the group's NAME is shown on this page (not the full banner —
  // title/dates/objective/coordinator — which is still deliberately shown
  // just once, on the Discussions list's "Meeting / Group" column, to
  // avoid repeating that larger text on every individual Discussion).
  let groupTitle: string | null = null;
  if (discussion.groupId !== null) {
    try {
      const group = await getDiscussionGroupById(discussion.groupId);
      groupTitle = group?.title ?? null;
    } catch (error) {
      console.error(`[dashboard/discussions/${discussionId}] failed to load discussion group:`, error);
    }
  }

  const [canChangeStatus, canLinkIssue, canComment, canEditParticipants] = await Promise.all([
    hasPermission(currentUser, "discussion:change_status"),
    hasPermission(currentUser, "discussion:link_issue"),
    hasPermission(currentUser, "discussion:comment"),
    hasPermission(currentUser, "discussion:edit"),
  ]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <NavBar previousId={adjacent.previousId} nextId={adjacent.nextId} />
        <DiscussionDetail
          discussion={discussion}
          groupTitle={groupTitle}
          staff={staff}
          domains={domains}
          canEdit={canEditParticipants}
          canChangeStatus={canChangeStatus}
          canLinkIssue={canLinkIssue}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <DiscussionCommentsPanel discussionId={discussionId} comments={comments} canComment={canComment} />
          </div>

          <div className="flex flex-col gap-6">
            <DiscussionParticipantsPanel
              discussionId={discussionId}
              participants={participants}
              canEdit={canEditParticipants}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
