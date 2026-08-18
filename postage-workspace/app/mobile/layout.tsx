import type { Metadata, Viewport } from "next";

// WAREHOUSE MOBILE LITE — its own layout.
//
// DELIBERATELY separate from app/dashboard/layout.tsx. Nothing here imports
// DashboardLayout, AppSidebar, or any Issue/assignment/investigation
// component, so the Super Admin portal and the Assignee portal cannot be
// altered by anything in this subtree — and this subtree cannot inherit their
// navigation, which a warehouse worker must not see.
//
// It inherits only the root app/layout.tsx (html/body + global stylesheet),
// which is untouched. The viewport and mobile metadata below are scoped HERE,
// so no desktop page's <head> changes.
//
// PWA metadata is scoped HERE rather than in the root layout, so no desktop
// page's <head> changes: the manifest link, the standalone hints and the
// home-screen icon apply to /mobile only.

export const metadata: Metadata = {
  title: "Warehouse Mobile Lite",
  description: "Record a warehouse issue with a voice note and two photos.",
  manifest: "/manifest.webmanifest",
  applicationName: "Warehouse Mobile Lite",
  appleWebApp: {
    // iOS installs via Share → Add to Home Screen; these are what it reads.
    capable: true,
    title: "Warehouse",
    statusBarStyle: "black-translucent",
  },
  // PNG, not SVG. Real iPhone testing showed the previous SVG apple-touch-icon
  // was ignored by Safari, which fell back to a screenshot of the page — 180x180
  // PNG is the size iOS actually asks for.
  icons: {
    icon: [
      { url: "/icons/warehouse-mobile-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/warehouse-mobile-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/warehouse-mobile-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171717",
  // The capture controls are large touch targets; zooming is left enabled
  // deliberately — disabling it is an accessibility regression for anyone who
  // needs to enlarge text.
  maximumScale: 5,
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
      <div className="mx-auto w-full max-w-md px-4 py-6">{children}</div>
    </div>
  );
}
