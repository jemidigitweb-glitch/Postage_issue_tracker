// WAREHOUSE MOBILE LITE — Stage 3 shell (corrected).
//
// ── NO ISSUE TRACKER LOGIN ──────────────────────────────────────────────────
// SUPERSEDED DESIGN: an earlier revision required a Tracker session, the
// "issue:create_mobile" permission and membership of a username allowlist. The
// owner clarified that a warehouse worker must be able to open /mobile while
// the main Issue Tracker is LOGGED OUT — no Assignee account, no Super Admin
// account, no allowlist. That gate is gone.
//
// This page therefore reads NO session and performs NO authorization. It is a
// public worker-facing entry point to the same backend, not a second Issue
// Tracking System.
//
// What protects the system instead:
//   - proxy.ts issues an anonymous, signed, httpOnly Mobile Lite cookie when a
//     browser first opens /mobile (lib/mobile/mobileSession.ts). It identifies
//     nobody and grants nothing.
//   - Every Mobile Lite Server Action requires that cookie, so the signed-
//     upload endpoint is not open to the world.
//   - /dashboard/** is untouched and still requires a real Tracker session.
//
// ── WHAT THIS PAGE IS ───────────────────────────────────────────────────────
// A thin server shell around the client capture component. It offers exactly
// four worker actions — Record Voice, Take Evidence Photo 1, Take Evidence
// Photo 2, REGISTER — plus the status text a worker needs. No title,
// description, domain, priority, status, assignment, investigation, resolution
// or navigation control exists here, by construction.
//
// STAGE 4 BOUNDARY: capture and direct upload are live; REGISTER is enabled
// only once all three uploads succeed and then DOES NOTHING. It creates no
// Issue, writes no database row, and shows no Issue ID — that is Stage 5. The
// page says so rather than implying a success that did not happen.

import MobileCapture from "./MobileCapture";

export default function MobileLitePage() {
  return (
    <main className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-bold tracking-tight">Warehouse Mobile</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Record what happened, add two photos, then register.
        </p>
      </header>

      <MobileCapture />
    </main>
  );
}
