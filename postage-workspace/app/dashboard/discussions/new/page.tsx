import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import NewDiscussionForm from "./NewDiscussionForm";

export default async function NewDiscussionPage() {
  const user = await getCurrentUser();
  const canCreate = user ? await hasPermission(user, "discussion:create") : false;

  if (!canCreate) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-5">
          <Link
            href="/dashboard/discussions"
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors w-fit"
          >
            ← Back to Discussions
          </Link>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-10 text-center">
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
              You do not have permission to create discussions.
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Only management and admin accounts can create new discussions.
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
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            New Discussion
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Record a new discussion or meeting.
          </p>
        </div>
        <NewDiscussionForm />
      </div>
    </DashboardLayout>
  );
}
