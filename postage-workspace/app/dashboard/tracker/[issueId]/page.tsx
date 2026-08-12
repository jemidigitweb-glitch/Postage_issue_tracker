import Link from "next/link";
import { redirect } from "next/navigation";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import TrackerIssueDetail from "@/components/tracker/TrackerIssueDetail";
import TrackerTimeline from "@/components/tracker/TrackerTimeline";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { ASSIGNEE_HOME } from "@/lib/routeGuards";
import { isValidIssueId } from "@/lib/queries/issues";
import { getTrackerIssueDetail, getTrackerIssueTimeline } from "@/lib/queries/tracker";

// SUPER ADMIN TRACKER DETAIL — /dashboard/tracker/[issueId]
//
// The full lifecycle of one assigned Issue: its record, its workflow/process
// fields, and every stored workflow event in chronological order.
//
// ── READ ONLY ───────────────────────────────────────────────────────────────
// Nothing on this page can change anything. There is no <form>, no Server
// Action import, and the two queries it calls are SELECT-only (see
// lib/queries/tracker.ts). It is deliberately NOT a second Issue editor —
// status changes and work-progress edits live in their own portals and are
// untouched by this stage.
//
// ── ACCESS ──────────────────────────────────────────────────────────────────
// Same gate as the Tracker index: `tracker:view`, which
// lib/access/permissions.ts grants to role 'admin' ONLY. Checked server-side
// BEFORE any query runs, so an Assignee typing this URL never reaches the
// database, let alone the record. proxy.ts already redirects a signed-out
// request to /login (the /dashboard/tracker prefix covers this route too).
//
// params/searchParams are Promises in this Next.js version — confirmed against
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md

const backLinkClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";

function MessagePanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Explicit destination, never history.back() — see the NavBar note. */}
      <Link href="/dashboard/tracker" className={backLinkClassName}>
        ← Back to Tracker
      </Link>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">{title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
      </div>
    </div>
  );
}

export default async function TrackerIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  // Resolved from the session only — never from params. redirect() throws
  // internally (NEXT_REDIRECT), so it is called outside the try/catch below.
  const currentUser = await getCurrentUser();
  const canViewTracker = currentUser ? await hasPermission(currentUser, "tracker:view") : false;
  if (!canViewTracker) {
    redirect(ASSIGNEE_HOME);
  }

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

  let issue: Awaited<ReturnType<typeof getTrackerIssueDetail>> = null;
  let timeline: Awaited<ReturnType<typeof getTrackerIssueTimeline>> = [];
  let errorMessage: string | null = null;

  try {
    [issue, timeline] = await Promise.all([
      getTrackerIssueDetail(issueId),
      getTrackerIssueTimeline(issueId),
    ]);
  } catch (error) {
    // Never surface the raw error (could include connection details) to the
    // browser — log server-side only, show a generic message.
    console.error(`[dashboard/tracker/${issueId}] failed to load issue:`, error);
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
    // Covers "no such Issue", "soft-deleted", and "not currently assigned" —
    // the Tracker only tracks assigned work, so an unassigned Issue has no
    // record here.
    return (
      <DashboardLayout>
        <MessagePanel
          title="Not tracked"
          message={`No currently-assigned issue with ID "${issueId}" was found.`}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Back returns to MONITORING. Explicit destination, NOT browser
              history, so it behaves identically however the page was reached
              (Tracker table, direct URL, bookmark, or a fresh tab). */}
          <Link href="/dashboard/tracker" className={backLinkClassName}>
            ← Back to Tracker
          </Link>
          {/* The separate route to the normal Super Admin Issue page, where an
              Issue is actually worked on. The Tracker itself stays read-only;
              this is a link, not a control. */}
          <Link href={`/dashboard/issues/${issue.issueId}`} className={backLinkClassName}>
            Open Issue →
          </Link>
        </div>

        <TrackerIssueDetail issue={issue} />
        <TrackerTimeline events={timeline} />
      </div>
    </DashboardLayout>
  );
}
