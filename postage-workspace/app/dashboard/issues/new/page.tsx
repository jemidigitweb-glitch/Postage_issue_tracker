import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { isIssuesOnlyRole } from "@/lib/access/raisedByAccess";
import { findRaiserForUser } from "@/lib/queries/raiserLink";
import { listActiveStaff } from "@/lib/queries/staff";
import { listCategories } from "@/lib/queries/issues";
import NewIssueForm from "./NewIssueForm";

const backLinkClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";

export default async function NewIssuePage() {
  // Page-level gate matching app/dashboard/issues/add-staff/page.tsx. The
  // real guard is createIssueAction's own issue:create check — this only
  // avoids showing a form to someone whose submission would be rejected.
  const currentUser = await getCurrentUser();
  const canCreate = currentUser ? await hasPermission(currentUser, "issue:create") : false;

  if (!canCreate) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-5">
          <Link href="/dashboard/issues" className={backLinkClassName}>
            ← Back to Issue List
          </Link>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-10 text-center">
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
              Not authorized
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              You don&apos;t have permission to create issues.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // SELF-RAISER (role raised_by): they file Issues as themselves, so there is
  // no raiser to choose. Their own linked issue_staff name is shown read-only
  // and the picker is not rendered at all. The staff list is not even fetched
  // for them — a form that cannot offer a choice has no use for the options.
  //
  // If the account is somehow unlinked, the page still renders: the action
  // refuses the submission with a clear message, which is the guard. Blocking
  // the page here as well would only turn a fixable setup problem into a dead
  // end with no explanation.
  const selfRaiser = isIssuesOnlyRole(currentUser?.role ?? null);
  const [staff, categories, linkedRaiser] = await Promise.all([
    selfRaiser ? Promise.resolve([]) : listActiveStaff(),
    // Existing Domain values, offered as datalist suggestions so a new Issue
    // lands in an established category. Read-only; the column stays free text.
    listCategories(),
    selfRaiser && currentUser ? findRaiserForUser(currentUser.userId) : Promise.resolve(null),
  ]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        {/* Navigation link, not a form control — it is rendered outside
            NewIssueForm entirely, so it cannot submit or save anything. */}
        <Link
          href="/dashboard/issues"
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors w-fit"
        >
          ← Back to Issues
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            New Issue
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Create a new issue.
          </p>
        </div>

        <NewIssueForm
          staff={staff}
          categories={categories}
          selfRaiserName={linkedRaiser?.staffName ?? null}
        />
      </div>
    </DashboardLayout>
  );
}
