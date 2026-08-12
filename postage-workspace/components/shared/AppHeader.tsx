export default function AppHeader({
  /** The Assignee's assignment_users.assignee_name, or null. Null for the
   *  Super Admin (who shows no name) and for any staff login without a
   *  valid assignee link. No role badge is rendered for anyone. */
  displayName = null,
}: {
  displayName?: string | null;
} = {}) {
  const date = new Date();
  const formatted = date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500">
          LEDSone
        </span>
        <span className="text-neutral-300 dark:text-neutral-700 select-none">
          /
        </span>
        <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          Postage Workspace
        </span>
      </div>

      <div className="flex items-center gap-3">
        {displayName && (
          <span className="text-xs text-neutral-600 dark:text-neutral-300">{displayName}</span>
        )}
        <span className="text-xs text-neutral-400 dark:text-neutral-500">{formatted}</span>
      </div>
    </header>
  );
}
