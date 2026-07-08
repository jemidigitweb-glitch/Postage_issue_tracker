export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col">

      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 px-8 py-4">
        <span className="text-xs font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500">
          LEDSone
        </span>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-lg text-center">

          {/* Title */}
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-3">
            LEDSone Postage Workspace
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-neutral-500 dark:text-neutral-400 mb-12">
            Operational Dashboard for the Postage Team
          </p>

          {/* Status block */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl px-8 py-6 bg-neutral-50 dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3">
              Project Status
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
                Foundation Setup Complete
              </span>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 px-8 py-4 text-center">
        <span className="text-xs text-neutral-400 dark:text-neutral-600">
          LEDSone · Postage Department
        </span>
      </footer>

    </div>
  );
}
