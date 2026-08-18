// WAREHOUSE MOBILE LITE — the worker's entry point.
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
// A thin server shell around the Stage 2 composer. The worker builds ONE report
// out of notes, photos with captions and a voice recording, then registers it
// with a single, separately-labelled action. There is no title, domain,
// priority, status, assignment, investigation, resolution or navigation control
// here, by construction — every one of those is derived on the server.

import MobileComposer from "./MobileComposer";

export default function MobileLitePage() {
  return (
    // header (fixed height) → scrollable timeline → composer pinned at the
    // bottom. Only the middle section scrolls.
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-xl font-bold tracking-tight">Add Issue</h1>
      </header>

      <MobileComposer />
    </main>
  );
}
