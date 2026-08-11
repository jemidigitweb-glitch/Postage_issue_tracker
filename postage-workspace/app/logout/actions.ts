"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteSession } from "@/lib/session";

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

export async function logout(): Promise<void> {
  await deleteSession();

  // Clears the client-side Router Cache so a Back-button press after logout
  // cannot re-display a previously rendered protected page from cache.
  // Server-side enforcement (proxy.ts) already blocks any real request
  // without a valid session cookie; this closes the cached-render gap.
  revalidatePath("/", "layout");

  redirect("/login");
}
