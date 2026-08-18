// WAREHOUSE MOBILE LITE — the worker's entry point.
//
// ── SIGN IN REQUIRED ────────────────────────────────────────────────────────
// CURRENT RULE. Warehouse Mobile Lite is behind the ordinary Issue Tracker
// login, used by the shared "Raised by Staff" account.
//
// SUPERSEDED: an intermediate design left /mobile open to anonymous browsers,
// protected only by a minted `wh_mobile` cookie that identified nobody. The
// owner has replaced that decision: an unauthenticated visitor may not use
// /mobile at all. The anonymous cookie is gone, and the application's own
// session is the single authorization source again.
//
// What protects this page:
//   - proxy.ts redirects a request with no session to /login?next=/mobile.
//   - This page then resolves the real user and requires `mobile:submit`,
//     which only `raised_by` and `admin` hold — an Assignee signing in cannot
//     reach it.
//   - Every Mobile Lite Server Action re-checks the same permission
//     independently, so a direct request without a session is rejected even
//     though this page never rendered for it. Hiding a screen is never the
//     guard.
//
// ── WHAT THIS PAGE IS ───────────────────────────────────────────────────────
// A thin server shell around the Stage 2 composer. The worker builds ONE report
// out of notes, photos with captions and a voice recording, then registers it
// with a single, separately-labelled action. There is no title, domain,
// priority, status, assignment, investigation, resolution or navigation control
// here, by construction — every one of those is derived on the server.

import { redirect } from "next/navigation";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { MOBILE_HOME, RAISED_BY_HOME } from "@/lib/access/raisedByAccess";
import { logout } from "@/app/logout/actions";
import MobileComposer from "./MobileComposer";

export default async function MobileLitePage() {
  // proxy.ts has already established that SOME session exists; this resolves
  // whose it is and whether they may submit from a phone.
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(MOBILE_HOME)}`);
  }
  if (!(await hasPermission(user, "mobile:submit"))) {
    // An Assignee who signs in lands back on their own Issue list rather than
    // a dead end, and no error page tells them what they were refused.
    redirect(RAISED_BY_HOME);
  }

  return (
    // header (fixed height) → scrollable timeline → composer pinned at the
    // bottom. Only the middle section scrolls.
    <main className="flex min-h-0 flex-1 flex-col">
      {/* One row: the screen's name on the left, the way out on the right.
          Logout is deliberately understated — a small text button, not a
          filled one — so a thumb reaching for Camera or Send never lands on it
          by accident, while still being a full 44px-tall tap target. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-xl font-bold tracking-tight">Add Issue</h1>

        {/* Posts to the SHARED logout action — the same one the desktop
            sidebar uses. Mobile Lite has no logout of its own. A plain form,
            so it works without JavaScript.

            `next=/mobile` sends the worker back here after signing in again
            instead of to the desktop Issue list. It is validated server-side
            against the return-target allow-list; the field is a convenience,
            never a trusted instruction.

            An unsent draft lives only in client state and is simply lost —
            logging out never registers it and never writes anything but the
            cleared session cookie. */}
        <form action={logout}>
          <input type="hidden" name="next" value={MOBILE_HOME} />
          <button
            type="submit"
            className="-mr-2 min-h-[44px] rounded-lg px-3 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            Logout
          </button>
        </form>
      </header>

      <MobileComposer />
    </main>
  );
}
