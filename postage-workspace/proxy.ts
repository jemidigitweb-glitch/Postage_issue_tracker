import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifySession } from "@/lib/session";

// Next.js 16 request protection. Confirmed against the installed docs (not
// assumed): node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
// — Middleware is renamed to Proxy in this version; this file (`proxy.ts` at
// the project root, not `middleware.ts`) is the direct replacement, same
// runtime behavior.
//
// Deliberately lightweight: calls only lib/session.ts's verifySession()
// (cookie signature + expiry check, no database) — never
// lib/auth.ts's getCurrentUser() (database-backed). Proxy runs on every
// request, including prefetches, so a DB call here would be a real
// performance cost on every navigation — this matches the Next.js docs'
// own "optimistic checks" guidance exactly.
//
// Scope: Issue Tracker routes only. Enforcement is enabled here — but only
// for /dashboard/issues and /dashboard/discussions and below. The rest of
// /dashboard (booking, couriers, reports — pre-existing, already-in-use
// Postage department pages, none of which this project is authorized to
// break) is deliberately left outside PROTECTED_PATH_PREFIXES: only one
// account exists in issue_tracking.management_users today, and there is no
// provisioning path yet for the other people who currently use those
// pages. Widening protection to all of /dashboard is a separate decision,
// not made here — see documentation/issue_tracker_auth_implementation_plan.md
// Stage 14d.
//
// /dashboard/discussions added alongside /dashboard/issues (additive — the
// Discussions module, same session-cookie-only check, same auth system).

const PROTECTED_PATH_PREFIXES = ["/dashboard/issues", "/dashboard/discussions"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = PROTECTED_PATH_PREFIXES.some((prefix) =>
    path.startsWith(prefix)
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const session = await verifySession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/issues/:path*", "/dashboard/discussions/:path*"],
};
