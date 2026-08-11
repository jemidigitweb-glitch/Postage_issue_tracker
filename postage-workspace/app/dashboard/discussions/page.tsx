import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import DiscussionFilters from "@/components/discussions/DiscussionFilters";
import DiscussionTable from "@/components/discussions/DiscussionTable";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { listDiscussionDomains, listDiscussionMemberNames, listDiscussions } from "@/lib/queries/discussions";

// Real, database-backed Discussion list — mirrors app/dashboard/issues/page.tsx's
// structure (server component, searchParams-driven filters/pagination,
// plain GET-form filters, Link-based pagination).

type RawSearchParams = { [key: string]: string | string[] | undefined };

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildPageHref(baseParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(baseParams);
  next.set("page", String(page));
  return `/dashboard/discussions?${next.toString()}`;
}

export default async function DiscussionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolved = await searchParams;

  const search = firstValue(resolved.q).trim();
  const status = firstValue(resolved.status).trim();
  const domain = firstValue(resolved.domain).trim();
  const member = firstValue(resolved.member).trim();

  const pageParam = Number.parseInt(firstValue(resolved.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const hasActiveFilters = Boolean(search || status || domain || member);

  let domains: Awaited<ReturnType<typeof listDiscussionDomains>> = [];
  let members: Awaited<ReturnType<typeof listDiscussionMemberNames>> = [];
  let result: Awaited<ReturnType<typeof listDiscussions>> | null = null;
  let errorMessage: string | null = null;

  try {
    [domains, members, result] = await Promise.all([
      listDiscussionDomains(),
      listDiscussionMemberNames(),
      listDiscussions({ page, search, status, domain, member }),
    ]);
  } catch (error) {
    console.error("[dashboard/discussions] failed to load discussions:", error);
    errorMessage = "Unable to load discussions right now. Please try again shortly.";
  }

  const currentUser = await getCurrentUser();
  const canCreate = currentUser ? await hasPermission(currentUser, "discussion:create") : false;
  const canDelete = currentUser ? await hasPermission(currentUser, "discussion:delete") : false;

  const linkParams = new URLSearchParams();
  if (search) linkParams.set("q", search);
  if (status) linkParams.set("status", status);
  if (domain) linkParams.set("domain", domain);
  if (member) linkParams.set("member", member);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
              Discussions
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Important discussions and meetings — MD, management, warehouse, and sales teams.
            </p>
          </div>
          {canCreate && (
            <Link
              href="/dashboard/discussions/new"
              className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
            >
              + New Discussion
            </Link>
          )}
        </div>

        <DiscussionFilters
          domains={domains}
          members={members}
          search={search}
          status={status}
          domain={domain}
          member={member}
          hasActiveFilters={hasActiveFilters}
        />

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-5 py-4 text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </div>
        ) : (
          <>
            <DiscussionTable discussions={result?.discussions ?? []} canDelete={canDelete} />

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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
