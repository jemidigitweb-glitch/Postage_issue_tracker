import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { listActiveStaff } from "@/lib/queries/staff";
import NewIssueForm from "./NewIssueForm";

export default async function NewIssuePage() {
  // Active staff only — a deactivated staff member shouldn't be selectable
  // as the raiser of a brand new issue (compare the "Raised By" filter on
  // the issue list, which intentionally includes inactive staff too, since
  // that's for finding existing historical issues).
  const staff = await listActiveStaff();

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
            Create a new issue in issue_tracking.issues.
          </p>
        </div>

        <NewIssueForm staff={staff} />
      </div>
    </DashboardLayout>
  );
}
