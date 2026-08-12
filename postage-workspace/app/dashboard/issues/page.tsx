import Link from "next/link";

import AssignedIssueCard from "@/components/issues/AssignedIssueCard";
import AssignedIssuesFilters from "@/components/issues/AssignedIssuesFilters";
import AssigneeIssueFilters from "@/components/issues/AssigneeIssueFilters";
import AssigneeIssuesTable from "@/components/issues/AssigneeIssuesTable";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import IssueFilters from "@/components/issues/IssueFilters";
import IssueTable from "@/components/issues/IssueTable";
import IssueTabs from "@/components/issues/IssueTabs";
import { getCurrentUserWithScope, hasPermission, type IssueAccessScope } from "@/lib/auth";
import { listAssignmentUsers } from "@/lib/queries/assignmentUsers";
import {
  listAssignedIssues,
  listAssigneeCategories,
  listAssigneeIssues,
} from "@/lib/queries/issueAssignments";
import { listCategories, listIssues } from "@/lib/queries/issues";
import { listStaff } from "@/lib/queries/staff";

// Real, database-backed issue list. One route, three views, chosen by the
// caller's permissions (never by a query parameter):
//
//   SUPER ADMIN (issue:view_all)
//     /dashboard/issues              -> Issues table            [unchanged]
//     /dashboard/issues?tab=assigned -> Assigned Issues cards   [unchanged]
//
//   ASSIGNEE (role 'staff')
//     /dashboard/issues              -> Assigned Issues table
//     ?tab= is ignored — there is no tab strip and nothing to switch to.
//
// The assignee view is a SEPARATE component using SEPARATE table, filter and
// query code. Nothing on the Super Admin path was modified to make room for
// it, so the admin UI cannot regress through a shared-component change.
//
// searchParams is a Promise in this Next.js version — confirmed against
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
// (same convention already used by app/dashboard/issues/[issueId]/page.tsx
// for `params`).

type RawSearchParams = { [key: string]: string | string[] | undefined };

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function buildPageHref(basePath: string, baseParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(baseParams);
  next.set("page", String(page));
  return `${basePath}?${next.toString()}`;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolved = await searchParams;

  // Resolved once, server-side, before anything is read. `scope` is the only
  // thing that decides which Issues this request may see — it is derived from
  // the session, never from a query parameter. An assignee whose login is not
  // linked to an assignment_users row (which is EVERY assignee today, because
  // migration 011 is not applied) resolves to scope "none" and sees nothing.
  const { user: currentUser, scope } = await getCurrentUserWithScope();
  const canViewAll = currentUser ? await hasPermission(currentUser, "issue:view_all") : false;

  const tab = firstValue(resolved.tab) === "assigned" ? "assigned" : "issues";

  // ── ASSIGNEE PORTAL ─────────────────────────────────────────────────────
  // An assignee always gets their own Assigned Issues view, whatever ?tab=
  // says — there is no tab strip and nothing else to switch to. This branch
  // is reachable ONLY without issue:view_all, so no Super Admin request can
  // ever enter it.
  if (!canViewAll) {
    return <AssigneeAssignedIssues resolved={resolved} scope={scope} />;
  }

  // The Issues/Assigned tab strip is a Super Admin affordance. UNCHANGED:
  // the assigned tab still renders the same card view it always has.
  if (tab === "assigned") {
    // A holder of issue:change_status_any keeps every transition it could
    // make before, including RED -> GREEN in one step.
    const canSkipToGreen = currentUser
      ? await hasPermission(currentUser, "issue:change_status_any")
      : false;
    return (
      <AssignedIssuesTabContent
        resolved={resolved}
        scope={scope}
        canViewAll={canViewAll}
        canSkipToGreen={canSkipToGreen}
      />
    );
  }

  const search = firstValue(resolved.q).trim();
  const staffCode = firstValue(resolved.staff).trim();
  const status = firstValue(resolved.status).trim();
  const priority = firstValue(resolved.priority).trim();
  const category = firstValue(resolved.category).trim();

  const pageParam = Number.parseInt(firstValue(resolved.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  // Sort state lives in the URL. An unrecognized key is passed through to
  // listIssues() unchanged, which resolves it against its whitelist and falls
  // back to the default order — so a hand-edited ?sort= can never break the
  // page or reach SQL.
  const sort = firstValue(resolved.sort).trim();
  const order = firstValue(resolved.order).trim() === "desc" ? "desc" : "asc";

  const hasActiveFilters = Boolean(search || staffCode || status || priority || category);

  let staff: Awaited<ReturnType<typeof listStaff>> = [];
  let categories: Awaited<ReturnType<typeof listCategories>> = [];
  let assignmentUsers: Awaited<ReturnType<typeof listAssignmentUsers>> = [];
  let result: Awaited<ReturnType<typeof listIssues>> | null = null;
  let errorMessage: string | null = null;

  try {
    [staff, categories, assignmentUsers, result] = await Promise.all([
      listStaff(),
      listCategories(),
      listAssignmentUsers(),
      listIssues(scope, { page, search, staffCode, status, priority, category, sort, order }),
    ]);
  } catch (error) {
    // Never surface the raw error (could include connection details) to
    // the browser — log server-side only, show a generic message.
    console.error("[dashboard/issues] failed to load issues:", error);
    errorMessage = "Unable to load issues right now. Please try again shortly.";
  }

  // UI affordances only — every one of these is independently enforced in
  // the corresponding Server Action, which is the real guard.
  const [canAssign, canManageStaff, canCreate, canDelete] = currentUser
    ? await Promise.all([
        hasPermission(currentUser, "issue:assign"),
        hasPermission(currentUser, "user:manage"),
        hasPermission(currentUser, "issue:create"),
        hasPermission(currentUser, "issue:delete"),
      ])
    : [false, false, false, false];

  // Search/filter params only — shared by the pagination links and the
  // sortable headers. Sort is added on top of this for pagination (so paging
  // keeps the chosen order) but deliberately NOT for the headers, which set
  // their own sort/order and drop `page` to return to page 1.
  const filterParams = new URLSearchParams();
  if (search) filterParams.set("q", search);
  if (staffCode) filterParams.set("staff", staffCode);
  if (status) filterParams.set("status", status);
  if (priority) filterParams.set("priority", priority);
  if (category) filterParams.set("category", category);

  const linkParams = new URLSearchParams(filterParams);
  if (sort) {
    linkParams.set("sort", sort);
    linkParams.set("order", order);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
              Open Issues
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Issues raised by Postage staff.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <Link
                href="/dashboard/issues/new"
                className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
              >
                + New Issue
              </Link>
            )}
            {canManageStaff && (
              <Link
                href="/dashboard/issues/add-staff"
                className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
              >
                + Add Staff
              </Link>
            )}
          </div>
        </div>

        <IssueTabs active="issues" />

        <IssueFilters
          staff={staff}
          categories={categories}
          search={search}
          staffCode={staffCode}
          status={status}
          priority={priority}
          category={category}
          hasActiveFilters={hasActiveFilters}
        />

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-5 py-4 text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </div>
        ) : (
          <>
            <IssueTable
              issues={result?.issues ?? []}
              assignmentUsers={assignmentUsers}
              canAssign={canAssign}
              canDelete={canDelete}
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
                      href={buildPageHref("/dashboard/issues", linkParams, result.page - 1)}
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
                      href={buildPageHref("/dashboard/issues", linkParams, result.page + 1)}
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

async function AssignedIssuesTabContent({
  resolved,
  scope,
  canViewAll,
  canSkipToGreen,
}: {
  resolved: RawSearchParams;
  scope: IssueAccessScope;
  /** True only for a holder of issue:view_all (Super Admin / management). */
  canViewAll: boolean;
  /** True only for a holder of issue:change_status_any — see the call site. */
  canSkipToGreen: boolean;
}) {
  // SUPER ADMIN ONLY as of the Assignee Portal stage — the caller reaches
  // this component only when canViewAll is true. The canViewAll branches
  // below are therefore always the "true" side now; they are left in place
  // rather than simplified so this component's rendered output is provably
  // identical to what it produced before.
  // ── URL-tampering guard ────────────────────────────────────────────────
  // ?assignee=<id> is read ONLY for a caller who may see every Issue. For an
  // assignee it is discarded here and never reaches the query; the query
  // layer (listAssignedIssues -> effectiveAssigneeFilter) independently
  // substitutes the session-derived id, so tampering fails even if this
  // page-level guard were removed.
  const assigneeIdRaw = canViewAll ? firstValue(resolved.assignee).trim() : "";
  const assigneeId = assigneeIdRaw ? Number.parseInt(assigneeIdRaw, 10) : null;
  const status = firstValue(resolved.status).trim();

  const pageParam = Number.parseInt(firstValue(resolved.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const hasActiveFilters = Boolean(assigneeIdRaw || status);

  let assignmentUsers: Awaited<ReturnType<typeof listAssignmentUsers>> = [];
  let result: Awaited<ReturnType<typeof listAssignedIssues>> | null = null;
  let errorMessage: string | null = null;

  try {
    [assignmentUsers, result] = await Promise.all([
      listAssignmentUsers(),
      listAssignedIssues(scope, { page, assigneeId, status }),
    ]);
  } catch (error) {
    console.error("[dashboard/issues?tab=assigned] failed to load assigned issues:", error);
    errorMessage = "Unable to load assigned issues right now. Please try again shortly.";
  }

  const linkParams = new URLSearchParams();
  linkParams.set("tab", "assigned");
  if (assigneeIdRaw) linkParams.set("assignee", assigneeIdRaw);
  if (status) linkParams.set("status", status);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            {/* Always "Open Issues": this component is now reachable only
                with issue:view_all, so the former assignee branch is gone
                rather than left as unreachable wording. */}
            Open Issues
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {canViewAll
              ? "Issues currently assigned via the Assign To workflow."
              : "Issues currently assigned to you."}
          </p>
        </div>

        {/* Tab strip is a Super Admin affordance — an assignee has only one
            view, so there is nothing to switch between. */}
        {canViewAll && <IssueTabs active="assigned" />}

        <AssignedIssuesFilters
          assignmentUsers={assignmentUsers}
          assigneeId={assigneeIdRaw}
          status={status}
          hasActiveFilters={hasActiveFilters}
          showAssigneeFilter={canViewAll}
        />

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-5 py-4 text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </div>
        ) : (result?.issues.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-12 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No assigned issues match the current filters.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {result!.issues.map((issue) => (
                <AssignedIssueCard key={issue.issueId} issue={issue} canSkipToGreen={canSkipToGreen} />
              ))}
            </div>

            {result && result.totalCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                <span>
                  Showing {(result.page - 1) * result.pageSize + 1}–
                  {Math.min(result.page * result.pageSize, result.totalCount)} of {result.totalCount}
                </span>

                <div className="flex items-center gap-3">
                  {result.page > 1 ? (
                    <Link
                      href={buildPageHref("/dashboard/issues", linkParams, result.page - 1)}
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
                      href={buildPageHref("/dashboard/issues", linkParams, result.page + 1)}
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// ASSIGNEE PORTAL â€” "Assigned Issues"
//
// Reached ONLY from the !canViewAll branch above, so nothing in here can be
// rendered for a Super Admin. It replaces the assignee's former card list
// with a table; the Super Admin's card view (AssignedIssuesTabContent) and
// the Super Admin's Issues table (IssueTable) are both untouched.
//
// Nothing on this view exposes an admin control: no New Issue, no Add Staff,
// no tab strip, no selection, no bulk actions, no assign/reassign, no delete.
// Each of those is additionally guarded by its own permission check in the
// corresponding Server Action, so absence here is presentation, not the gate.
//
// State lives entirely in the URL â€” q / status / category / priority / sort /
// order / page â€” so filters, sorting and paging are shareable, survive a
// refresh, and compose with each other.
// ---------------------------------------------------------------------------
async function AssigneeAssignedIssues({
  resolved,
  scope,
}: {
  resolved: RawSearchParams;
  /** Session-derived. listAssigneeIssues() refuses any scope that is not
   *  "assignee", so an unlinked account sees an empty table rather than
   *  anyone else's work. */
  scope: IssueAccessScope;
}) {
  const search = firstValue(resolved.q).trim();
  const status = firstValue(resolved.status).trim();
  const category = firstValue(resolved.category).trim();
  const priority = firstValue(resolved.priority).trim();

  const pageParam = Number.parseInt(firstValue(resolved.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  // Passed through unchanged; the query layer resolves it against its frozen
  // whitelist and falls back to the default order for anything unrecognized,
  // so a hand-edited ?sort= can never reach SQL or break the page.
  const sort = firstValue(resolved.sort).trim();
  const order = firstValue(resolved.order).trim() === "desc" ? "desc" : "asc";

  const hasActiveFilters = Boolean(search || status || category || priority);

  let categories: Awaited<ReturnType<typeof listAssigneeCategories>> = [];
  let result: Awaited<ReturnType<typeof listAssigneeIssues>> | null = null;
  let errorMessage: string | null = null;

  try {
    [categories, result] = await Promise.all([
      listAssigneeCategories(scope),
      listAssigneeIssues(scope, { page, search, status, category, priority, sort, order }),
    ]);
  } catch (error) {
    // Never surface the raw error (could include connection details) to the
    // browser â€” log server-side only, show a generic message.
    console.error("[dashboard/issues] failed to load assigned issues:", error);
    errorMessage = "Unable to load your assigned issues right now. Please try again shortly.";
  }

  // Search/filter params only â€” shared by the pagination links and (via
  // AssigneeIssuesTable) the sortable headers. Sort is added on top for
  // pagination so paging keeps the chosen order; the headers set their own
  // sort/order and drop `page` to return to page 1.
  const filterParams = new URLSearchParams();
  if (search) filterParams.set("q", search);
  if (status) filterParams.set("status", status);
  if (category) filterParams.set("category", category);
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
            Assigned Issues
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Issues currently assigned to you.
          </p>
        </div>

        <AssigneeIssueFilters
          categories={categories}
          search={search}
          status={status}
          category={category}
          priority={priority}
          hasActiveFilters={hasActiveFilters}
        />

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-5 py-4 text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </div>
        ) : (
          <>
            <AssigneeIssuesTable
              issues={result?.issues ?? []}
              sort={sort}
              order={order}
              baseParams={filterParams.toString()}
            />

            {result && result.totalCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                <span>
                  Showing {(result.page - 1) * result.pageSize + 1}â€“
                  {Math.min(result.page * result.pageSize, result.totalCount)} of {result.totalCount}
                </span>

                <div className="flex items-center gap-3">
                  {result.page > 1 ? (
                    <Link
                      href={buildPageHref("/dashboard/issues", linkParams, result.page - 1)}
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
                      href={buildPageHref("/dashboard/issues", linkParams, result.page + 1)}
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

