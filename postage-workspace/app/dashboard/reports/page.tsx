import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { redirectAssigneeToOwnIssues, redirectRaisedByToIssues } from "@/lib/routeGuards";

export default async function ReportsPage() {
  await redirectAssigneeToOwnIssues();
  // Raised by Staff holds issue:view_all, so the guard above lets them
  // through; this one confines them to the Issue list.
  await redirectRaisedByToIssues("/dashboard/reports");

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
          Reports
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          This section is under development.
        </p>
      </div>
    </DashboardLayout>
  );
}
