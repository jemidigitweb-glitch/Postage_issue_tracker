import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { redirectAssigneeToOwnIssues, redirectRaisedByToIssues } from "@/lib/routeGuards";

export default async function BookingPage() {
  // Assignees are confined to their own Issue list. Unauthenticated access to
  // this page is unchanged (see lib/routeGuards.ts).
  await redirectAssigneeToOwnIssues();
  // Raised by Staff holds issue:view_all, so the guard above lets them
  // through; this one confines them to the Issue list.
  await redirectRaisedByToIssues("/dashboard/booking");

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
          Booking Status
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          This section is under development.
        </p>
      </div>
    </DashboardLayout>
  );
}
