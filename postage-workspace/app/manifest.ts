import type { MetadataRoute } from "next";

// WAREHOUSE MOBILE LITE — the web app manifest.
//
// Native Next.js App Router convention (app/manifest.ts), verified against the
// installed docs: node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/01-metadata/manifest.md. NO PWA package is added — none
// is needed for a manifest, an icon set or standalone display.
//
// ── START URL AND SCOPE ─────────────────────────────────────────────────────
// SUPERSEDED: start_url and scope both used to be "/mobile", back when /mobile
// was reachable without signing in. It is not any more — proxy.ts puts /mobile
// behind the ordinary login (one authentication system, the owner's decision),
// so an installed icon pointed at /mobile opens, is bounced to /login by the
// proxy, and the worker watches a redirect happen before they can type.
//
// start_url is therefore the login itself, carrying /mobile as its return
// target: "/login?next=%2Fmobile". A worker who is still signed in never sees
// the form at all (app/login/page.tsx forwards them straight to /mobile), and
// one who is signed out lands on the form already knowing where it will send
// them. The `next` value is re-validated server-side against the allow-list in
// lib/access/raisedByAccess.ts on both the render and the submit — the manifest
// gets no say in where a login actually lands.
//
// scope widens to "/" as a direct consequence: a manifest whose start_url sits
// outside its own scope is invalid, and browsers respond by ignoring the
// start_url or refusing to install. The narrow "/mobile" scope cannot survive a
// start_url of "/login", so the old guarantee that the installed window could
// not reach the desktop Issue Tracker is now enforced by role instead of by
// manifest — a Raised-by-Staff session is confined to /dashboard/issues and
// /mobile by lib/access/raisedByAccess.ts, which the browser cannot overrule.
// The dashboard is otherwise unaffected by this file.
//
// ── NO SERVICE WORKER ───────────────────────────────────────────────────────
// Deliberately absent. Version 1 has no offline requirement, and a service
// worker is not required for "Add to Home Screen" on either platform. Adding
// one would introduce a caching layer with its own invalidation problems for
// no Version 1 benefit.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Warehouse Mobile Lite",
    short_name: "Warehouse",
    description: "Record a warehouse issue with a voice note and two photos.",
    start_url: "/login?next=%2Fmobile",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f5",
    theme_color: "#171717",
    // PNG, not SVG. Real device testing showed the SVG set produced a generic
    // home-screen icon; 192 and 512 PNGs are what both platforms actually ask
    // for, and the maskable entry keeps the glyph inside Android's safe zone.
    icons: [
      {
        src: "/icons/warehouse-mobile-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/warehouse-mobile-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/warehouse-mobile-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
