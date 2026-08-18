// scripts/verify-mobile-auth.ts
//
// LIVE verification that /mobile requires authentication. Hits a RUNNING local
// server over HTTP — source assertions cannot prove this, because the question
// is what the running process actually serves.
//
// Usage (with `npm run dev` running in another terminal):
//   npm run verify:mobile-auth
//   npm run verify:mobile-auth -- http://localhost:3001
//
// Read-only: every request is a GET, no database connection is opened, no
// credential is read, and no Issue is created. It never signs in — proving the
// LOGGED-OUT behaviour is the whole point, so it deliberately sends no valid
// session and cannot create one.
//
// Why the forged-cookie cases matter: "no cookie" alone would also pass if the
// guard merely looked for the cookie's presence. Sending a syntactically
// plausible but unsigned token proves the session is actually VERIFIED, and
// sending the retired `wh_mobile` cookie proves the deleted anonymous design
// cannot be revived from the client side.

const DEFAULT_ORIGIN = "http://localhost:3000";
const MOBILE_PATH = "/mobile";
const EXPECTED_LOCATION = "/login?next=%2Fmobile";

/** Text that only appears once the Mobile Lite UI has rendered. */
const MOBILE_UI_MARKER = "Add Issue";

interface Probe {
  label: string;
  cookie?: string;
}

const PROBES: Probe[] = [
  { label: "no cookie at all" },
  { label: "empty session cookie", cookie: "session=" },
  { label: "garbage session cookie", cookie: "session=not-a-token" },
  {
    label: "forged, unsigned JWT-shaped token",
    cookie: "session=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.invalid-signature",
  },
  { label: "retired anonymous wh_mobile cookie", cookie: "wh_mobile=anything" },
  { label: "retired cookie plus a junk session", cookie: "wh_mobile=x; session=y" },
];

let failures = 0;

function report(ok: boolean, label: string, detail: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

async function probeMobile(origin: string, probe: Probe): Promise<void> {
  const response = await fetch(`${origin}${MOBILE_PATH}`, {
    redirect: "manual",
    headers: probe.cookie ? { cookie: probe.cookie } : {},
  });

  const location = response.headers.get("location") ?? "";
  const redirected = response.status >= 300 && response.status < 400;
  const toLogin = location.includes("/login");
  const carriesNext = location.includes("next=%2Fmobile") || location.includes("next=/mobile");

  report(
    redirected && toLogin && carriesNext,
    probe.label,
    `status ${response.status} -> ${location || "(no location)"}`
  );

  // The UI must not be in the body of the refusal either: a redirect that still
  // ships the screen would let a client ignore the redirect and render it.
  const body = await response.text();
  report(
    !body.includes(MOBILE_UI_MARKER),
    `${probe.label}: no Mobile UI in the response body`,
    body.includes(MOBILE_UI_MARKER) ? "the UI WAS present" : "clean"
  );
}

async function probeReturnTargets(origin: string): Promise<void> {
  // The login page must accept /mobile as a return target and refuse external
  // ones. Checked through the rendered hidden field, which is what actually
  // gets submitted.
  const safe = await fetch(`${origin}/login?next=%2Fmobile`).then((r) => r.text());
  report(
    safe.includes('name="next" value="/mobile"'),
    "login accepts next=/mobile",
    safe.includes('name="next"') ? "hidden field present" : "hidden field MISSING"
  );

  const hostile = await fetch(`${origin}/login?next=https%3A%2F%2Fevil.example`).then((r) => r.text());
  report(
    !hostile.includes('name="next" value="https://evil.example"'),
    "login refuses an external next",
    "no hidden field carries the external target"
  );
}

async function main() {
  const origin = process.argv[2] ?? DEFAULT_ORIGIN;
  console.log(`=== Warehouse Mobile Lite — logged-out access check ===`);
  console.log(`Origin: ${origin}\n`);

  try {
    await fetch(`${origin}/login`);
  } catch {
    console.error(
      `Could not reach ${origin}. Start the dev server first (npm run dev), or pass the origin as an argument.`
    );
    process.exitCode = 1;
    return;
  }

  for (const probe of PROBES) {
    await probeMobile(origin, probe);
  }
  await probeReturnTargets(origin);

  console.log(
    failures === 0
      ? "\nALL CHECKS PASSED — /mobile is not reachable without a verified session."
      : `\n${failures} CHECK(S) FAILED — /mobile is reachable without authentication.`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
