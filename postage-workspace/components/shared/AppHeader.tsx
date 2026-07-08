export default function AppHeader() {
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

      <span className="text-xs text-neutral-400 dark:text-neutral-500">
        {formatted}
      </span>
    </header>
  );
}
