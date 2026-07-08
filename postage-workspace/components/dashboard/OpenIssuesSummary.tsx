type Status = "Investigation Required" | "Under Investigation" | "Under Monitoring";
type Priority = "High" | "Normal";

interface Issue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
}

const issues: Issue[] = [
  { id: "ISSUE-001", title: "Placeholder Issue One",   status: "Investigation Required", priority: "High"   },
  { id: "ISSUE-002", title: "Placeholder Issue Two",   status: "Under Investigation",   priority: "High"   },
  { id: "ISSUE-003", title: "Placeholder Issue Three", status: "Under Investigation",   priority: "Normal" },
  { id: "ISSUE-004", title: "Placeholder Issue Four",  status: "Under Monitoring",      priority: "Normal" },
  { id: "ISSUE-005", title: "Placeholder Issue Five",  status: "Under Investigation",   priority: "Normal" },
];

const statusStyles: Record<Status, string> = {
  "Investigation Required": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Under Investigation":    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Under Monitoring":       "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const priorityStyles: Record<Priority, string> = {
  High:   "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 font-semibold",
  Normal: "bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-500",
};

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={["inline-block px-2 py-0.5 rounded-md text-xs font-medium", statusStyles[status]].join(" ")}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={["inline-block px-2 py-0.5 rounded-md text-xs", priorityStyles[priority]].join(" ")}>
      {priority}
    </span>
  );
}

export default function OpenIssuesSummary() {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">
        Open Issues
      </h2>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-32">
                  Issue ID
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Title
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-52">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-24">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {issues.map((issue) => (
                <tr key={issue.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    {issue.id}
                  </td>
                  <td className="px-5 py-3.5 text-neutral-800 dark:text-neutral-200">
                    {issue.title}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusBadge status={issue.status} />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <PriorityBadge priority={issue.priority} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
