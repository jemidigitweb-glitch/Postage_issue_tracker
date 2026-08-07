import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

import LoginForm from "./LoginForm";

// Login page. Now functional (Stage 14b) — see app/login/actions.ts for
// the Server Action and lib/session.ts for session creation.
//
// Redirects an already-authenticated user straight to /dashboard/issues
// (the Issue Management page — the post-login landing page) rather than
// showing the form again, and redirects here from /dashboard is
// intentionally NOT yet enforced by proxy.ts (see proxy.ts's own comments)
// — this page works correctly on its own regardless of that.
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard/issues");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
            Sign in
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
            Sign in with your issue tracker account.
          </p>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
