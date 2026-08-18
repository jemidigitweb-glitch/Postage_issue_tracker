import type { MetadataRoute } from "next";

// WAREHOUSE MOBILE LITE — the web app manifest.
//
// Native Next.js App Router convention (app/manifest.ts), verified against the
// installed docs: node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/01-metadata/manifest.md. NO PWA package is added — none
// is needed for a manifest, an icon set or standalone display.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
// start_url and scope both point at /mobile, so an installed icon opens the
// worker screen directly and the installed app cannot wander into the desktop
// Issue Tracker. The dashboard is unaffected by this file.
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
    start_url: "/mobile",
    scope: "/mobile",
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
