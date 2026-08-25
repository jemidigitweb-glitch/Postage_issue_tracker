export const dynamic = "force-dynamic";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import RegionBookingStatus from "@/components/dashboard/RegionBookingStatus";
import CourierStatus from "@/components/dashboard/CourierStatus";
import UnshippedOrders from "@/components/dashboard/UnshippedOrders";
import PostageUpdates from "@/components/dashboard/PostageUpdates";
import OpenIssuesSummary from "@/components/dashboard/OpenIssuesSummary";
import { redirectAssigneeToOwnIssues, redirectRaisedByToIssues } from "@/lib/routeGuards";

export default async function DashboardPage() {
  await redirectAssigneeToOwnIssues();
  // Raised by Staff holds issue:view_all, so the guard above lets them
  // through; this one confines them to the Issue list.
  await redirectRaisedByToIssues("/dashboard");

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            Postage Dashboard
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Daily booking overview for all regions.
          </p>
        </div>

        <RegionBookingStatus />
        <CourierStatus />
        <UnshippedOrders />
        <PostageUpdates />
        <OpenIssuesSummary />
      </div>
    </DashboardLayout>
  );
}
