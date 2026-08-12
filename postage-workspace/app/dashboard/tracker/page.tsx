import Link from "next/link";
import { redirect } from "next/navigation";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import TrackerFilters from "@/components/tracker/TrackerFilters";
import TrackerKpiStrip from "@/components/tracker/TrackerKpiStrip";
import TrackerStaffTable from "@/components/tracker/TrackerStaffTable";
import TrackerTable from "@/components/tracker/TrackerTable";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { ASSIGNEE_HOME } from "@/lib/routeGuards";
import { listAssignmentUsers } from "@/lib/queries/assignmentUsers";
import {
  getTrackerOverview,
  listAssigneeTrackerSummary,
  listTrackerCategories,
  listTrackerIssues,
} from "@/lib/queries/tracker";

// SUPER ADMIN TRACKER — /dashboard/tracker
//
// Monitors the progress of Issues assigned to each Assignee. READ ONLY: this
// page and everything it calls only ever SELECT (see lib/queries/tracker.ts).
// There is no form, no Server Action, and no mutation reachable from here.
//
// ── ACCESS ──────────────────────────────────────────────────────────────────
// Gated on the `tracker:view` permission, which lib/access/permissions.ts
// grants to role 'admin' ONLY — not 'management', not 'staff'. Enforced here,
// server-side, before any query runs:
//
//   admin        -> renders
//   staff        -> redirect() to their own Issue list. Not a 403 page: an
//                   Assignee has no business knowing this route exists, and
//                   redirectAssigneeToOwnIssues() already establishes that
//                   "send them home" is this app's convention.
//   management   -> same redirect (holds issue:view_all but NOT tracker:view)
//   signed out   -> proxy.ts redirects to /login before this runs
//
// Hiding the sidebar link is presentation only; this check is the guard.
//
// searchParams is a Promise in this Next.js version — confirmed against
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md

type RawSearchParams = { [key: string]: string | string[] | undefined };

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function buildPageHref(baseParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(baseParams);
  next.set("page", String(page));
  return `/dashboard/tracker?${next.toString()}`;
}

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Resolved from the session only — never from a query parameter. Note
  // redirect() throws internally (NEXT_REDIRECT), so it is called before the
  // try/catch below rather than inside it.
  const currentUser = await getCurrentUser();
  const canViewTracker = currentUser ? await hasPermission(currentUser, "tracker:view") : false;
  if (!canViewTracker) {
    redirect(ASSIGNEE_HOME);
  }

  const resolved = await searchParams;

  const search = firstValue(resolved.q).trim();
  const assigneeIdRaw = firstValue(resolved.assignee).trim();
  const assigneeId = assigneeIdRaw ? Number.parseInt(assigneeIdRaw, 10) : null;
  const status = firstValue(resolved.status).trim();
  const category = firstValue(resolved.category).trim();
  const priority = firstValue(resolved.priority).trim();
  const trackingState = firstValue(resolved.tracking).trim();
  // The four date-range filters (raisedFrom/raisedTo/from/to) were removed
  // from this page. They are no longer read from the URL, no longer passed to
  // the query, and no longer carried in pagination or sort links — so a stale
  // bookmark or a hand-typed ?from=… has no effect on what the Tracker shows.
  //
  // lib/queries/tracker.ts still ACCEPTS those parameters: the query's meaning
  // is unchanged and the capability stays covered by npm run verify:scope.
  // It is simply not reachable from the UI. Re-exposing it later is a
  // props-and-inputs change, not a query change.

  const pageParam = Number.parseInt(firstValue(resolved.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  // Passed through unchanged; the query layer resolves it against the frozen
  // whitelist in lib/access/tracker.ts and falls back to the default order for
  // anything unrecognized, so a hand-edited ?sort= can never reach SQL.
  const sort = firstValue(resolved.sort).trim();
  const order = firstValue(resolved.order).trim() === "desc" ? "desc" : "asc";

  const hasActiveFilters = Boolean(
    search || assigneeIdRaw || status || trackingState || category || priority
  );

  let overview: Awaited<ReturnType<typeof getTrackerOverview>> | null = null;
  let summaries: Awaited<ReturnType<typeof listAssigneeTrackerSummary>> = [];
  let assignmentUsers: Awaited<ReturnType<typeof listAssignmentUsers>> = [];
  let categories: Awaited<ReturnType<typeof listTrackerCategories>> = [];
  let result: Awaited<ReturnType<typeof listTrackerIssues>> | null = null;
  let errorMessage: string | null = null;

  try {
    // The KPI strip and Staff Tracking are deliberately NOT filtered: they
    // describe the WHOLE assigned workload, so the true totals stay visible
    // while the Issue table below is drilled into a filtered slice. Only
    // listTrackerIssues() takes the filters.
    [overview, summaries, assignmentUsers, categories, result] = await Promise.all([
      getTrackerOverview(),
      listAssigneeTrackerSummary(),
      listAssignmentUsers(),
      listTrackerCategories(),
      listTrackerIssues({
        page,
        search,
        assigneeId,
        status,
        category,
        priority,
        trackingState,
        sort,
        order,
      }),
    ]);
  } catch (error) {
    // Never surface the raw error (could include connection details) to the
    // browser — log server-side only, show a generic message.
    console.error("[dashboard/tracker] failed to load tracker data:", error);
    errorMessage = "Unable to load the tracker right now. Please try again shortly.";
  }

  // Search/filter params only — shared by the pagination links and (via
  // TrackerTable) the sortable headers. Sort is added on top for pagination so
  // paging keeps the chosen order; the headers set their own sort/order and
  // drop `page` to return to page 1.
  const filterParams = new URLSearchParams();
  if (search) filterParams.set("q", search);
  if (assigneeIdRaw) filterParams.set("assignee", assigneeIdRaw);
  if (status) filterParams.set("status", status);
  if (category) filterParams.set("category", category);
  if (trackingState) filterParams.set("tracking", trackingState);
  if (priority) filterParams.set("priority", priority);

  const linkParams = new URLSearchParams(filterParams);
  if (sort) {
    linkParams.set("sort", sort);
    linkParams.set("order", order);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            Tracker
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Progress of Issues assigned to each assignee.
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-5 py-4 text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </div>
        ) : (
          <>
            {overview && <TrackerKpiStrip overview={overview} />}

            <TrackerFilters
              assignmentUsers={assignmentUsers}
              categories={categories}
              search={search}
              assigneeId={assigneeIdRaw}
              status={status}
              trackingState={trackingState}
              category={category}
              priority={priority}
              hasActiveFilters={hasActiveFilters}
            />

            <TrackerTable
              issues={result?.issues ?? []}
              sort={sort}
              order={order}
              baseParams={filterParams.toString()}
            />

            {result && result.totalCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                <span>
                  Showing {(result.page - 1) * result.pageSize + 1}–
                  {Math.min(result.page * result.pageSize, result.totalCount)} of {result.totalCount}
                </span>

                <div className="flex items-center gap-3">
                  {result.page > 1 ? (
                    <Link
                      href={buildPageHref(linkParams, result.page - 1)}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-neutral-100 dark:border-neutral-900 px-3 py-1.5 font-medium text-neutral-300 dark:text-neutral-700">
                      Previous
                    </span>
                  )}

                  <span>
                    Page {result.page} of {result.totalPages}
                  </span>

                  {result.page < result.totalPages ? (
                    <Link
                      href={buildPageHref(linkParams, result.page + 1)}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-neutral-100 dark:border-neutral-900 px-3 py-1.5 font-medium text-neutral-300 dark:text-neutral-700">
                      Next
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Staff Tracking sits LAST: the Issue table is the primary
                operational area and stays at the top of the page. This is the
                "who" roll-up, read after the work itself. Its links set
                ?assignee= on this same route, so the Issue table above filters
                in place — there is no separate staff page. */}
            <TrackerStaffTable summaries={summaries} activeAssigneeId={assigneeIdRaw} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
