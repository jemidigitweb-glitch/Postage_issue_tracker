import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function IssuesPage() {
  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
          Open Issues
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          This section is under development.
        </p>
      </div>
    </DashboardLayout>
  );
}
