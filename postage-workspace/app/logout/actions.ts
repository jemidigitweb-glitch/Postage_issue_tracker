"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteSession } from "@/lib/session";
import { safeReturnTarget } from "@/lib/access/raisedByAccess";

// Logout Server Action. Mirrors app/login/actions.ts (the login half of the
// same flow) and follows the installed Next.js 16 docs' own logout example
// verbatim: node_modules/next/dist/docs/01-app/02-guides/authentication.md
// ("Deleting the session" → reuse deleteSession() on logout, then redirect).
//
// Deliberately reuses the EXISTING session mechanism — lib/session.ts's
// deleteSession(), which clears the same signed httpOnly cookie that
// createSession() sets. No second auth system, no new cookie name, no new
// session store: this file only invokes what is already there.
//
// This directory intentionally contains no page.tsx — an app/ directory
// without one creates no route. /logout is not a navigable page; this is
// only a colocated action module.

/**
 * Ends the session and returns to the login page.
 *
 * `formData` is optional and is used for ONE thing: an optional `next` field
 * naming where the person should land after signing in again. Warehouse Mobile
 * Lite sends "/mobile" so a worker who logs out is not dropped into the desktop
 * Issue list on their next sign-in. The sidebar sends nothing and behaves
 * exactly as before.
 *
 * The value is attacker-supplied, so it goes through the same allow-list every
 * other return target uses (lib/access/raisedByAccess.ts). Anything external,
 * protocol-relative or simply not on the list is discarded in favour of a plain
 * /login — the raw value is never redirected to.
 *
 * This remains the ONLY logout in the application: one session mechanism, one
 * cookie, one way out. Mobile Lite calls this action; it does not have a logout
 * of its own.
 */
export async function logout(formData?: FormData): Promise<void> {
  await deleteSession();

  // Clears the client-side Router Cache so a Back-button press after logout
  // cannot re-display a previously rendered protected page from cache.
  // Server-side enforcement (proxy.ts) already blocks any real request
  // without a valid session cookie; this closes the cached-render gap.
  revalidatePath("/", "layout");

  const next = safeReturnTarget(formData?.get("next"));
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
