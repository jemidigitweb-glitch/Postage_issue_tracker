import { redirect } from "next/navigation";

// THE SYSTEM'S FRONT DOOR.
//
// There is one entry point to this deployment and it is the sign-in page, so
// the bare origin (https://warehouse-mobile-lite.vercel.app/) sends the visitor
// straight there rather than showing a standing page of its own. /login then
// makes the only routing decision that matters: an already-signed-in visitor is
// forwarded to their destination, and everyone else gets the form.
//
// Warehouse Mobile Lite uses the same door with a return target —
// /login?next=%2Fmobile — which is what app/manifest.ts installs as the PWA's
// start_url. Both entry points therefore run through one authentication system,
// which is the standing decision recorded in proxy.ts.
//
// `redirect()` here issues a 307 (Next.js's default outside Server Actions);
// deliberately NOT permanentRedirect(), whose 308 browsers and proxies cache
// indefinitely — that would make a future landing page impossible to introduce
// without every returning visitor still being bounced.
export default function Home() {
  redirect("/login");
}
