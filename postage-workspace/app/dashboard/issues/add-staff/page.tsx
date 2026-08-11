import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import AddStaffForm from "./AddStaffForm";

// Page-level authorization gate — defense in depth alongside the
// server-action check in ./actions.ts (which is the check that actually
// matters; this just avoids showing the form to someone who can't submit
// it). Mirrors the getCurrentUser()/hasPermission() pattern already used in
// app/dashboard/issues/page.tsx for canAssign/canManageStaff.

const backLinkClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors";

export default async function AddStaffPage() {
  const currentUser = await getCurrentUser();
  const canManageStaff = currentUser ? await hasPermission(currentUser, "user:manage") : false;

  if (!canManageStaff) {
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
              You don&apos;t have permission to add staff.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <div>
          <Link href="/dashboard/issues" className={`${backLinkClassName} mb-4 inline-block`}>
            ← Back to Issue List
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            Add Person
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Add an issue raiser (issue_tracking.issue_staff) or an assignee
            (issue_tracking.assignment_users). One record, one table.
          </p>
        </div>

        <AddStaffForm />
      </div>
    </DashboardLayout>
  );
}
