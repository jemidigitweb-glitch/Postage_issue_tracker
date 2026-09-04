import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { loginDestination, safeReturnTarget } from "@/lib/access/raisedByAccess";

import LoginForm from "./LoginForm";

// Login page. Now functional (Stage 14b) — see app/login/actions.ts for
// the Server Action and lib/session.ts for session creation.
//
// Redirects an already-authenticated user straight to /dashboard/issues
// (the Issue Management page — the post-login landing page) rather than
// showing the form again, and redirects here from /dashboard is
// intentionally NOT yet enforced by proxy.ts (see proxy.ts's own comments)
// — this page works correctly on its own regardless of that.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Validated here as well as in the Server Action: an already-signed-in
  // visitor is redirected immediately, so the value must be safe before it is
  // used. Anything not on the internal allow-list becomes the Issue list.
  const destination = loginDestination(next);

  // ── A DATABASE HICCUP MUST NOT CLOSE THE FRONT DOOR ───────────────────────
  // getCurrentUser() is database-backed (it re-reads the role rather than
  // trusting the cookie), and this page is where every visitor to the
  // deployment arrives. An unhandled rejection here does not degrade the login
  // — it replaces it with Next.js's "This page couldn't load. A server error
  // occurred." screen, locking everybody out over a transient connection fault.
  //
  // The failure is contained instead: the visitor is treated as signed out and
  // shown the form, which is the correct fallback in both directions. Nobody is
  // let in — no session is created here, and the Server Action re-verifies the
  // password against the same database — and nobody who is genuinely signed in
  // loses anything beyond one skipped redirect, since their cookie survives and
  // the next request forwards them normally.
  //
  // redirect() stays OUTSIDE the try block: it signals by throwing, and catching
  // it here would swallow the forward (documented behaviour — see
  // node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md).
  let user: CurrentUser | null = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Message only. The error object from `pg` can carry the connection string.
    console.error(
      `[login] could not resolve the session, showing the form: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  if (user) {
    redirect(destination);
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

          <LoginForm next={safeReturnTarget(next)} />
        </div>
      </div>
    </main>
  );
}
