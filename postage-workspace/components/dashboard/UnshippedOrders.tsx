const regions = [
  { name: "UK",      flag: "🇬🇧" },
  { name: "Germany", flag: "🇩🇪" },
  { name: "US",      flag: "🇺🇸" },
  { name: "Canada",  flag: "🇨🇦" },
];

export default function UnshippedOrders() {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">
        Unshipped Orders
      </h2>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-36">Region</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Unshipped Orders</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Priority Orders</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Oldest Pending</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {regions.map((region) => (
                <tr key={region.name} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true">{region.flag}</span>
                      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{region.name}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">—</td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">—</td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">—</td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">Not Connected</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
