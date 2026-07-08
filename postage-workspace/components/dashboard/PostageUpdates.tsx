const categories = [
  "Courier Updates",
  "Customer Updates",
  "Internal Postage Updates",
  "Pending Actions",
];

export default function PostageUpdates() {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">
        Postage Updates
      </h2>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-52">Category</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Last Updated</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {categories.map((category) => (
                <tr key={category} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{category}</td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">No updates</td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">—</td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">Normal</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
