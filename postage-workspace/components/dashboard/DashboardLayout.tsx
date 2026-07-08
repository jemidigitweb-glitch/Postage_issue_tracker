import type { ReactNode } from "react";
import AppHeader from "@/components/shared/AppHeader";
import AppSidebar from "@/components/shared/AppSidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        <AppSidebar />

        <main className="flex-1 overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-950">
          {children}
        </main>
      </div>
    </div>
  );
}
