# Issue Tracker — Authentication Implementation Plan

Resolves the remaining open decisions from
`documentation/issue_tracker_auth_architecture_decision.md` and
`documentation/issue_tracker_application_structure.md`, and defines the
implementation plan for Stage 14. **No code files were created this turn.**
No database connection was made, no SQL was run, no dependencies were
installed.

Reviewed before writing: `documentation/issue_tracker_auth_architecture_decision.md`,
`documentation/issue_tracker_application_structure.md`,
`postage-workspace/AGENTS.md`, plus the Next.js 16.2.10 docs already read
directly from `postage-workspace/node_modules/next/dist/docs/` in earlier
stages this session (`authentication.md`, `server-actions.md`,
`16-proxy.md`, `03-layouts-and-pages.md`, `15-route-handlers.md`).

---

## 1. Session implementation decision

**Options evaluated:** `jose` vs `iron-session` (both explicitly recommended
by the Next.js 16 authentication guide read directly from
`node_modules/next/dist/docs/01-app/02-guides/authentication.md`).

### Security model

- **`jose`** implements JOSE signing (`SignJWT`/`jwtVerify`, algorithm
  `HS256` = HMAC-SHA256). The cookie payload is **tamper-evident, not
  confidential** — anyone holding the cookie can base64-decode and read it,
  but cannot forge or alter it without the secret. This is why the payload
  must stay limited to non-sensitive fields only.
- **`iron-session`** instead *seals* (encrypts + integrity-checks) the whole
  payload — stronger confidentiality, but a different primitive than what
  was already approved.

### Cookie handling

- httpOnly, `Secure` in production, `SameSite=Lax`, `Path=/`.
- `Max-Age`/`expires` set to match the signed token's own `exp` claim —
  redundant expiry enforcement is intentional (defense in depth: even if a
  cookie somehow outlived its intended lifetime, `jwtVerify` still rejects
  an expired token).
- Set and read exclusively via Next's `cookies()` API from `next/headers` —
  never `document.cookie` from client code (this cookie is httpOnly and
  therefore invisible to client JS by design).

### Server-side validation approach

Two-tier, matching the Next.js docs' own recommended split (already
reflected in the existing `lib/auth.ts` foundation function names):

1. **Optimistic check** (`validateSession()`): read the cookie, run
   `jwtVerify` with an explicit `algorithms: ['HS256']` allow-list (prevents
   algorithm-confusion attacks), check `exp`. No database call. This is the
   only kind of check `proxy.ts` should perform, since proxy runs on every
   request including prefetches.
2. **Authoritative check** (`getCurrentUser()`): calls `validateSession()`
   first, then re-fetches `role`/`active` from `issue_tracking.management_users`
   by `user_id` — never trusts a role embedded in the cookie, per the
   freshness decision already recorded in
   `issue_tracker_auth_architecture_decision.md` §2. Used in Server
   Components, Server Actions, and Route Handlers — anywhere close to
   actual data access.

### Compatibility with Next.js 16 async `cookies()`

Confirmed directly against the installed docs (not assumed): `cookies()`
from `next/headers` is asynchronous in this version — every call site must
`await cookies()`. `jose`'s own functions (`SignJWT().sign()`, `jwtVerify()`)
are independently async and don't interact with Next's cookie API at all —
they just produce/consume a string. The two compose cleanly:
`cookieStore.set('session', await encrypt(payload), {...})`. No
compatibility conflict exists between the two.

### Approved option: **`jose`**

**Reason:**
1. `HS256` signing is a literal, precise match for the already-approved
   "HMAC-signed httpOnly cookie" design (`issue_tracker_auth_architecture_decision.md`
   §1/§2) — `iron-session`'s sealing is a different (not worse, just
   different) primitive that would silently change an already-approved
   detail.
2. The Next.js 16.2.10 docs' own worked example for this exact use case
   uses `jose` (`SignJWT`/`jwtVerify`) — read directly from the installed
   package, giving a version-verified reference implementation rather than
   one requiring separate compatibility verification.
3. Matches the shape already committed to in `postage-workspace/lib/auth.ts`
   (separate `validateSession()` vs `getCurrentUser()` functions) more
   naturally than `iron-session`'s single bundled `getIronSession()` call.
4. No database session table required — a stateless signed cookie satisfies
   that requirement directly; `iron-session` would satisfy it equally well,
   so this point doesn't differentiate the two, but confirms neither option
   requires revisiting the "no new `sessions` table" decision.

---

## 2. Authentication flow

### Login flow

```
Browser (login form, Client Component)
   │  <form action={login}>  — plain form POST via Server Action, no client fetch
   ▼
Server Action  login(formData)  — 'use server'
   │  1. Validate formData shape (username/email + password present)
   │  2. Look up issue_tracking.management_users by username/email
   │     (parameterized query via lib/db.ts — never string-concatenated SQL)
   │  3. Verify password against management_users.password_hash
   │     (bcrypt/argon2id constant-time compare — never a manual string ==)
   │  4. If no match, or account inactive: return a generic "invalid
   │     credentials" error — never reveal whether the username or the
   │     password was wrong, and never reveal account-inactive status
   │     distinctly (both cases return the same generic message)
   │  5. On success: build SessionPayload { userId, issuedAt, expiresAt }
   │     (no role, no PII — see §1) → sign via jose → set httpOnly cookie
   │     via (await cookies()).set(...)
   │  6. redirect() to /dashboard
   ▼
Signed session cookie now present in the browser (httpOnly — invisible to
client JS), used on every subsequent request.
```

### Request validation (every protected page/action/route thereafter)

```
Browser
   │  navigation or Server Action / Route Handler call
   ▼
proxy.ts  (optimistic check — cookie-only, no DB call)
   │  reads cookie → validateSession() → invalid/missing ⇒ redirect to /login
   │                                   → valid ⇒ NextResponse.next()
   ▼
Server Component / Server Action / Route Handler
   │  calls lib/auth.ts's getCurrentUser()
   │    → validateSession() (re-verify signature/expiry)
   │    → SELECT user_id, username, display_name, role, active
   │      FROM issue_tracking.management_users WHERE user_id = $1
   │    → not found, or active = false ⇒ treat as unauthenticated (null),
   │      never default to any role
   ▼
hasPermission(currentUser, permission)   — explicit check, no role-rank
   comparison (per DECISION-001) — called before any mutation or
   sensitive read, using the finalized permission model in §3 below
```

This is the same DAL (Data Access Layer) pattern documented in the Next.js
16 authentication guide — `proxy.ts` stays cheap and DB-free; the real
authorization decision always happens close to the actual data access, not
in `proxy.ts` alone.

---

## 3. Permission model

Resolves the two open questions carried forward from
`issue_tracker_auth_architecture_decision.md` Stage 12A (Management/Admin
create-issue and add-comment permissions) and the undefined Admin
"system administration" scope.

### Admin

| Capability | Permission |
|---|---|
| User management | Full CRUD on `management_users`: create, deactivate, change role. This is the concrete, currently-defined content of "full system administration scope" — no broader admin-only feature has been requested by any approved feature spec yet, so nothing broader is defined here. **Explicitly left open for future extension, not assumed.** |
| Issue access | View all issues (same scope as every role — see DECISION-002; viewing is not the axis that differentiates roles). |
| Assignment permissions | Assign / reassign any issue. |
| Workflow permissions | Create issues; add comments/investigation notes; change status on **any** issue (not restricted to assigned-to-them); approve reopening (GREEN → earlier) with required reason. |

Every row above is Admin's own **explicit** permission list — per
DECISION-001, none of it is derived from being "above" Management; "full
permissions" means this literal, exhaustive list.

### Management

| Capability | Permission |
|---|---|
| Issue visibility | View all issues (same as every role). |
| Issue creation | **✅ Approved this document.** Reason: echoes DECISION-002's own stated rationale ("operational transparency is required") — restricting issue creation to Staff-only would force a Management user who identifies a problem to route it through a Staff account, working against that same transparency principle. This is the more judgment-based of the two resolved questions here; revisit if this reasoning doesn't match intent. |
| Comments / investigation notes | **✅ Approved this document.** Reason: Management's already-approved functions — "approve reopening" (which DECISION-003 requires a reason for) and "monitor workflow" — are difficult to exercise meaningfully without the ability to write a note. This is treated as necessary to exercise an already-granted function, not as inheritance from Staff's permission. |
| Assignment | Assign / reassign any issue. |
| Status changes | Change status on **any** issue (DECISION-003's "assigned issues only" restriction is specific to Staff's wording, not Management's) — full RED→AMBER→GREEN ordering and resolution-required-before-GREEN rules still apply regardless of role. |
| Reopening permissions | Approve reopening (GREEN → earlier) with a required reason. |

### Staff

| Capability | Permission |
|---|---|
| Issue visibility | View all issues (DECISION-002 — confirmed, not narrowed). |
| Assigned issue updates | May change status **only** for issues currently assigned to them. |
| Comments / investigation notes | ✅ — present in the original Stage 12 permission list from the start, never contested or removed by any later decision. |
| Status changes | Same restriction as "assigned issue updates" above — own-assigned issues only, full workflow rules apply (RED→AMBER→GREEN ordering, resolution required before GREEN, reopening requires authorization + reason — Staff cannot self-authorize a reopen even on their own assigned issue, since "approve reopening" is not in Staff's permission list). |
| Restrictions | Cannot assign/reassign any issue (including to themselves); cannot approve reopening; cannot change status on an issue not assigned to them; no user management; no admin scope. |

**Pattern that emerged from resolving this:** the axis that differentiates
the three roles is **control/action scope** (assignment, any-issue status
control, reopening authorization, user management) — not basic
participation. All three roles can view all issues, create issues, and
comment. This is stated explicitly here because it wasn't obvious from the
original fragmented per-role lists, and is worth recording as the
underlying logic, not just the resulting table.

**Alignment check against the four already-approved constraints — confirmed, not re-decided:**
- Staff can view all issues. ✅ (table above)
- Staff can change status only for assigned issues. ✅ (table above)
- RED → AMBER → GREEN enforced. ✅ — for every role, no carve-out (§1/§2 of the architecture decision doc)
- GREEN requires resolution. ✅ — for every role, no carve-out
- Reopening requires authorization and a reason. ✅ — only Management/Admin may authorize; Staff cannot, even on their own assigned issue

---

## 4. First admin provisioning design

Per DECISION-004 (already approved): a controlled, manually-invoked
provisioning script — never automatic, never hardcoded credentials, never
printed credentials, hash-only storage, documented process. Design only —
**not implemented or run this turn.**

- **Provisioning script approach:** a standalone script,
  `postage-workspace/scripts/create-first-admin.ts`, invoked manually and
  only once (e.g. `npx tsx scripts/create-first-admin.ts`) — never wired
  into `npm run build`, `npm run dev`, or any deploy step. Contains the
  same `current_database() = 'varmen_db'` hard safety check pattern used
  throughout every SQL script in this project (via the pool from
  `lib/db.ts`), aborting with zero writes if connected to the wrong
  database.
- **Password input method:** interactive terminal prompt with input
  masking (e.g. Node's `readline` with echo disabled, or a small prompt
  library) — never a CLI argument (visible in shell history and process
  listings) and never an environment variable (visible in process
  environment dumps/crash reports). Username/email/display name may be
  passed as plain CLI args or prompted too, since those aren't secret.
- **Password hashing approach:** bcrypt (cost ≥ 12) or argon2id, computed
  immediately after input, before any other step. The script inserts only
  the resulting hash into `management_users.password_hash` — the plaintext
  password is never written anywhere (not to disk, not to a log, not to
  the database).
- **No credentials stored in source:** the script itself contains no
  literal username, password, or hash — every identity/secret value comes
  from the interactive prompt at run time.
- **No credentials printed:** the script must never `console.log` (or
  otherwise output) the password or the computed hash. On success, it
  prints only non-sensitive confirmation: e.g. `Admin account "varmen"
  created (user_id=3, role=admin, created_at=...)`.
- **Audit requirements:** the script's success output (non-sensitive
  fields only, as above) is the audit record for who was provisioned and
  when. The script itself must go through the same review process the SQL
  migrations went through before it is ever run (per DECISION-004 — "no
  exception for being 'just a setup script'"), and its actual execution is
  a database write requiring the same explicit execute-approval gate every
  other write in this project has gone through. **Neither the script's
  creation nor its execution is approved by this document** — see §5.

---

## 5. Implementation boundaries

**Approved for next implementation (Stage 14, when explicitly instructed to proceed):**
- `lib/session.ts` — `jose`-based `encrypt()`/`decrypt()`,
  `createSession()`/`updateSession()`/`deleteSession()` using `cookies()`
- Real implementations of `lib/auth.ts`'s `getCurrentUser()`,
  `validateSession()`, `hasPermission()` (against the finalized matrix in
  §3), `isRole()`
- `proxy.ts` at the project root (not `middleware.ts`) — optimistic,
  cookie-only auth check
- Login page (`app/login/page.tsx`) and its Server Action
- The provisioning script's **code** (`scripts/create-first-admin.ts`), per
  the design in §4 — writing the script is implementation; running it is not

**Not yet approved — explicitly out of scope until separately authorized:**
- Any database write, including the provisioning script's actual execution
- User provisioning execution (creating the real first admin account)
- Issue management features — creation, assignment, status workflow,
  comments, history (unchanged restriction, carried through every prior
  stage)

---

## Report

**Files created:** `documentation/issue_tracker_auth_implementation_plan.md`
**Files modified:** none
**Database commands run:** none
**Database writes performed:** ZERO
**Commands executed:** see Validation below

---

## Stage 14 — Implemented

Implements the plan above, partially — the parts that don't require the
database query layer. No database write occurred; no user was created or
looked up; `jose` was installed as a dependency (no other new dependency).

### Implemented files

- **`lib/session.ts`** (new) — `createSession(userId)`, `verifySession()`,
  `deleteSession()`, all real. `jose` `SignJWT`/`jwtVerify` with `HS256`,
  algorithm pinned explicitly. `AUTH_SECRET` is checked lazily (inside each
  function call, not at module load) — deliberately different from
  `lib/db.ts`'s eager check, because this module is imported by `proxy.ts`,
  which Next.js loads on every request path resolution regardless of
  whether a session function actually runs; an eager throw here could break
  routes that never touch authentication.
- **`lib/auth.ts`** (rewritten) — `getCurrentUser()`, `requireUser()`,
  `requireRole()`, `hasPermission()` implemented, plus `validateSession()`
  and `isRole()` kept for continuity with prior documentation.
  `hasPermission()` is a real implementation now — the finalized permission
  matrix from §3 above is encoded as an explicit `Record<Role, Set<Permission>>`
  literal (not derived from rank), directly enforcing DECISION-001.
  `getCurrentUser()` is real up to the database boundary: if there's no
  valid session it correctly resolves `null` (no DB needed for that case);
  if there IS a valid session, it throws `UserLookupNotImplementedError`
  rather than fabricating a `CurrentUser` — the "clean placeholder
  boundary without fake users" the task required. `requireUser()` throws
  `UnauthenticatedError`; `requireRole()` throws `ForbiddenError` — both
  real, typed errors, not placeholders.
- **`proxy.ts`** (new, project root — not `middleware.ts`, confirmed
  renamed in this Next.js version) — calls `verifySession()` (cheap,
  cookie-only) on every `/dashboard/**` request. The check itself is real
  and runs; **the redirect is deliberately not enabled yet** — see
  "Implementation boundaries" below for why.
- **`app/login/page.tsx`** (new) — UI-only skeleton. No `action` on the
  form, submit button is `type="button"` and disabled, every input is
  disabled. Does not import `lib/auth.ts` or `lib/session.ts`.

### Implementation boundaries

**Approved and implemented this stage:**
- `lib/session.ts` — full, real implementation
- `lib/auth.ts` — full, real implementation up to (and honestly bounded at)
  the database lookup gap
- `proxy.ts` — real session-existence check; enforcement (the actual
  redirect) deliberately left disabled

**Why `proxy.ts`'s redirect isn't enabled yet, stated explicitly rather than
silently decided:** `app/login` has no way to actually create a session
this stage (no Server Action, no password verification). Enabling the
redirect now would make every existing `/dashboard/**` page — including
booking, couriers, and reports, none of which this project is authorized to
break — unreachable, with no way to log back in. This is a judgment call
made in favor of not breaking working functionality; flag if a different
tradeoff was intended (e.g. enabling the redirect now and accepting
`/dashboard` becomes temporarily inaccessible until login is real).

**Not implemented this stage, per instruction:**
- Database-backed user lookup (`lib/queries/*` still doesn't exist)
- Real login form submission / password verification
- Admin account provisioning (script or execution)
- Issue creation, assignment, workflow, comments, history — unchanged
  restriction, carried through every stage

### Remaining work

1. **Database-backed user lookup** — `lib/queries/users.ts` (or similar),
   the actual `SELECT ... FROM issue_tracking.management_users WHERE
   user_id = $1` query, wired into `getCurrentUser()` in place of the
   current `UserLookupNotImplementedError` throw.
2. **Login verification** — the real Server Action: look up by username/
   email, `bcrypt`/`argon2id` password compare, call `createSession()` on
   success, wire the (currently disabled) form in `app/login/page.tsx` to
   it.
3. **Admin provisioning script** — `scripts/create-first-admin.ts`, per the
   design in §4 above. Not written yet.
4. **Role enforcement testing** — once (1) and (2) exist, verify
   `hasPermission()`/`requireRole()` actually gate real Server Actions/
   Route Handlers correctly for all three roles against the matrix in §3,
   and enable `proxy.ts`'s redirect once there's a working login to redirect
   to.

### Validation

```
cd postage-workspace
npx tsc --noEmit
npx eslint .
npx next build
```

---

## Stage 14b — Database connection layer, login flow, and provisioning script implemented

Closes out every item in Stage 14's "Remaining work" list except role
enforcement testing (item 4 — needs a real account to log in with, which
requires actually running the provisioning script; not done this stage, see
below).

### Implemented login flow

```
Browser (app/login/page.tsx → LoginForm.tsx, Client Component)
   │  <form action={formAction}>  — useActionState wraps the Server Action
   ▼
app/login/actions.ts → login(prevState, formData)  — 'use server'
   │  1. Trim/require identifier + password from FormData
   │  2. findUserForLogin(identifier) — lib/queries/users.ts, parameterized
   │     query against issue_tracking.management_users (username OR email)
   │  3. If no user, or user.active === false: bcrypt.compare() against a
   │     fixed dummy hash anyway (timing-attack mitigation), then return
   │     the SAME generic error as every other failure mode
   │  4. bcrypt.compare(password, user.passwordHash) — real user, real hash
   │  5. On success: createSession(user.userId) — lib/session.ts, sets the
   │     signed httpOnly cookie — then redirect('/dashboard')
   │  6. On any failure: return { error: "Invalid username or password." }
   │     — same message for every case, never distinguishing which check
   │     failed
```

`app/login/page.tsx` is now an async Server Component: calls
`getCurrentUser()` first and redirects an already-authenticated visitor
straight to `/dashboard` (skips showing the form again) — the other half
of "redirect authenticated users appropriately."

**Database access implemented:** `lib/queries/users.ts` —
`findUserForLogin(identifier)` (includes `password_hash`, login-only shape)
and `findUserById(userId)` (DTO shape, no `password_hash`, used by
`getCurrentUser()`). Both parameterized, both read-only, both scoped
exclusively to `issue_tracking.management_users`. `lib/auth.ts`'s
`getCurrentUser()` now calls `findUserById()` for real — the
`UserLookupNotImplementedError` boundary from Stage 14 is gone, replaced
with the actual query.

**A real bug caught and fixed before it could break the build:**
`lib/db.ts`'s original (Stage 13) `DATABASE_URL` check ran eagerly at
module load. That was safe when nothing imported `lib/db.ts`. As of this
stage, `app/login/page.tsx` → `lib/auth.ts` → `lib/queries/users.ts` →
`lib/db.ts` is a real import chain reachable from a page Next.js evaluates
while collecting page data at build time — the same failure mode already
fixed once for `AUTH_SECRET` in `lib/session.ts` (Stage 14). Fixed by
converting `lib/db.ts` to the same lazy pattern: `getPool()` now creates
the `Pool` (and checks `DATABASE_URL`) only when actually called, never at
import time. Confirmed by actually running `next build` afterward (not just
reasoned about) — see Validation.

### Provisioning procedure

`scripts/create-first-admin.ts` — manual only, run via `npm run
create-first-admin` (a `package.json` script entry is a convenience alias,
not automatic execution — still requires an explicit human-invoked command).
**Not run this stage** — writing the script is implementation; running it
is a database write requiring separate authorization, consistent with every
prior stage's discipline.

Flow: prompts for username / email / display name (plain), then password
(masked — raw-mode stdin interception, prints `*` per keystroke, never the
real character) with confirmation and a 12-character minimum, hashes with
`bcrypt` (cost 12) immediately, connects via `lib/db.ts`'s `getPool()`, runs
`SELECT current_database(), current_user;` and **aborts with zero writes**
unless the result is exactly `varmen_db`, checks for an existing
username/email collision with a friendly error (avoids a raw constraint-
violation stack trace), then performs the single `INSERT INTO
issue_tracking.management_users (...) VALUES (..., 'admin', true)` —
role hardcoded to `'admin'` because provisioning *the first admin* is this
script's entire purpose, not general user creation. Success output prints
only `user_id`, `username`, `role`, `created_at` — never the password or
the hash.

### Required environment variables

Unchanged from earlier documentation, now actually load-bearing (not just
recommended) — the app will not run without them once anything calls the
functions that need them:

| Variable | Required by | Notes |
|---|---|---|
| `DATABASE_URL` | `lib/db.ts` (`getPool()`), transitively everything in `lib/queries/*` and `scripts/create-first-admin.ts` | Postgres connection string. Not yet created — no `.env.local` exists in this repo; still recommended (not yet actioned) to use a narrower-scoped DB role than `varmen_user`. |
| `AUTH_SECRET` | `lib/session.ts` (`createSession`/`verifySession`) | HMAC signing key for the session cookie. Generate via e.g. `openssl rand -base64 32`, per the Next.js docs' own suggestion. |
| `SESSION_COOKIE_NAME` *(optional)* | `lib/session.ts` | Defaults to `"session"` if unset. |
| `SESSION_MAX_AGE_SECONDS` *(optional)* | `lib/session.ts` | Defaults to 7 days if unset. |

No `.env.local` was created this stage — there are still no real values to
put in one. `postage-workspace/.gitignore`'s `.env*` pattern (confirmed by
direct read in an earlier stage) already covers it whenever it is created.

### Security notes

- Password never logged, anywhere — not in `app/login/actions.ts`, not in
  `scripts/create-first-admin.ts`. Grep-confirmed (see chat report).
- `password_hash` never logged, never returned from any function except
  internally within `findUserForLogin()`'s return value, which only
  `app/login/actions.ts` consumes and never re-exposes.
- Generic, identical error message for every login failure mode (missing
  fields, unknown identifier, inactive account, wrong password) — a
  malicious or curious caller cannot distinguish "no such account" from
  "wrong password" from the response.
- Timing-attack mitigation: a `bcrypt.compare()` always runs, even when no
  user was found, against a fixed non-secret dummy hash, so a failed
  lookup and a failed password check take comparable time.
- `jwtVerify`'s `algorithms: ['HS256']` allow-list is explicit (from Stage
  14) — prevents algorithm-confusion attacks.
- The provisioning script's target-database check is unconditional and
  runs before the only `INSERT` in the file — mirrors the same discipline
  used throughout every SQL migration script in this project.
- No user, password, or hash is hardcoded anywhere in any file created this
  stage.

### Implementation boundaries (updated)

**Approved and implemented this stage:**
- `lib/db.ts` — fixed to lazy `DATABASE_URL` checking
- `lib/queries/users.ts` — real, read-only, parameterized
- `lib/auth.ts`'s `getCurrentUser()` — real, database-backed, end to end
- `app/login/actions.ts`, `app/login/LoginForm.tsx`, updated
  `app/login/page.tsx` — real login flow, real session creation
- `scripts/create-first-admin.ts` — written, reviewed-in-place per its own
  safety checks, **not executed**

**Not implemented / not done this stage:**
- Running the provisioning script (no admin account exists yet)
- Enabling `proxy.ts`'s redirect (still deliberately deferred — see Stage
  14's own reasoning, unchanged: there was no way to log in before this
  stage; now there is, so this is close to being safe to enable, but doing
  so wasn't explicitly requested this turn and is left for the next
  explicit instruction)
- Role enforcement testing against a real logged-in session (blocked on
  actually running the provisioning script)
- Issue creation, assignment, workflow, comments, history — unchanged
  restriction, carried through every stage

### Validation (Stage 14b)

```
cd postage-workspace
npx tsc --noEmit
npx eslint .
npx next build
```

Results recorded in the chat report for this stage.

Results recorded in the chat report for this stage, not duplicated here.

---

## Stage 14c — Authentication validation (partial)

### Code review

Re-read `lib/session.ts`, `lib/auth.ts`, `lib/queries/users.ts`,
`app/login/actions.ts`, `app/login/LoginForm.tsx`, and
`scripts/create-first-admin.ts` in full. No bug found — no redesign
performed, per instruction ("do not redesign unless a real bug is found").

### Database identity check

```
SELECT current_database(), current_user;
→ varmen_db | varmen_user
```
Confirmed exactly matching before any further action was considered, per
instruction.

### First admin provisioning — deliberately not executed by the assistant this stage

A real design tension surfaced here, surfaced explicitly rather than
resolved unilaterally: `scripts/create-first-admin.ts` was built (Stage
14b) so the password is typed into a real interactive terminal and never
touches disk, a log, or any tool output — that was itself an explicit
security requirement (DECISION-004). The assistant's tool interface has no
way to relay a real-time typed secret the way the script expects; any
password piped in through a non-interactive command would land in the
session's tool-call history, which is exactly the exposure the masked-input
design exists to prevent. Rather than fabricate a password unilaterally
(which would either be unusable — nobody would know it — or would have to
be exposed some other way, undermining the design just built), or silently
skip the step, this was raised as an explicit question. **Decision: the
project owner runs `npm run create-first-admin` themselves, interactively,
in their own terminal — true masked input, exactly as designed, with zero
exposure in any chat or tool log.**

**Status at the time of this document: pending.** No account has been
created yet. `DATABASE_URL` is not present in the app's environment either
(only `MIGRATION_DB_URL` is, used by the migration scripts throughout this
project) — the owner will need to supply it for this one run.

### Authentication / authorization testing — blocked, not fabricated

Steps 4 (login test, session cookie check, `getCurrentUser()` check,
role-from-database check) and 5 (unauthenticated vs. authenticated admin
behavior) both require a real account to exist. **Not performed this
stage** — no test results are reported here because none were produced;
reporting placeholder or assumed results would misrepresent what was
actually verified. These will run once the account above exists.

### `proxy.ts` redirect — still not enabled

Unchanged from Stage 14b's reasoning: not enabled this stage either,
consistent with instruction 5 ("do not enable broad dashboard redirects
unless verified safe") — "verified safe" specifically requires the
end-to-end login test above to have actually passed first, which hasn't
happened yet.

### Remaining limitations

1. No admin account exists in `issue_tracking.management_users` yet.
2. End-to-end login → session → `getCurrentUser()` → role flow is
   implemented and code-reviewed, but not yet exercised against a real
   account.
3. `proxy.ts` enforcement remains disabled pending the above.
4. `DATABASE_URL` still has no `.env.local` entry in this repository.

---

## Stage 14d — Authentication validation (completed)

Closes out the items Stage 14c left blocked: an admin account now exists
(`admin_test`, provisioned by the project owner via
`npm run create-first-admin`, run interactively in their own terminal — the
assistant never saw the password), and `AUTH_SECRET` is now present.

### Environment fix

No `.env.local` existed anywhere in the repo. `DATABASE_URL` was already
present as a process environment variable, but `AUTH_SECRET` was set
nowhere — `lib/session.ts` would throw the moment any code path touched a
real session token. `AUTH_SECRET` is an app signing secret, not a user
credential, so the assistant generated one (`crypto.randomBytes(32)` →
base64) and wrote it to a new `postage-workspace/.env.local` (covered by
the existing `.env*` `.gitignore` entry — confirmed before writing, not
after). The generated value was never printed to any tool output or chat
message.

### Static validation

```
npx tsc --noEmit     → clean, no errors
npx eslint .          → clean, no errors/warnings
npx next build        → succeeded (Turbopack, all 10 routes compiled:
                         proxy detected and applied to /dashboard/**)
```

### Database check (read-only, before any live test)

A temporary, read-only script (`getPool()` + `SELECT current_database(),
current_user` + `SELECT ... FROM issue_tracking.management_users`, no
`password_hash` selected) confirmed:

```
Connected DB: varmen_db | user: varmen_user
management_users rows: 1
 - id=1 username=admin_test role=admin active=true created_at=2026-08-06
```

The script was deleted immediately after use; it was never committed and
performed zero writes.

### Manual login test (performed by the project owner, not the assistant)

The assistant does not have, and by this project's own established design
(Stage 14c) should not be given, `admin_test`'s password — it was typed
directly into `scripts/create-first-admin.ts`'s masked prompt and never
touched a log, a file, or any tool output. Rather than ask for it or
fabricate a synthetic session token to simulate a login (raised as an
option and explicitly declined), the project owner performed the real
browser login themselves against the assistant-started dev server
(`npx next dev`, `http://localhost:3000/login`) and reported the result:

| Check | Result |
|---|---|
| Login with `admin_test` | **PASS** |
| Redirect | `/dashboard` (confirmed) |
| Dashboard shell rendered | "LEDSone Postage Workspace" |
| Session cookie present | Yes, name `session` |
| `HttpOnly` | **true** |
| `SameSite` | `Lax` |
| `Secure` | Not set (expected — `NODE_ENV` is not `production` locally; `lib/session.ts` sets `secure: true` only in production) |

This exercises the full real path: `LoginForm.tsx` → `login()` Server
Action → `findUserForLogin()` (parameterized query against
`issue_tracking.management_users`) → `bcrypt.compare()` → `createSession()`
→ signed httpOnly cookie → `redirect('/dashboard')`.

### Code-level confirmation: `getCurrentUser()` and role source

Verified by direct re-read of `lib/session.ts`, `lib/auth.ts`, and
`lib/queries/users.ts` (not by a synthetic token — that approach was
proposed and declined):

- **`getCurrentUser()` resolves from the database, not the cookie.**
  `lib/auth.ts` — `getCurrentUser()` calls `validateSession()` (cookie
  signature/expiry only), then unconditionally calls `findUserById(session.userId)`
  (`lib/queries/users.ts`), which runs
  `SELECT user_id, username, display_name, role, active FROM
  issue_tracking.management_users WHERE user_id = $1`. There is no code
  path that returns a `CurrentUser` without this query executing.
- **The role cannot come from the cookie — structurally, not just by
  convention.** `SessionPayload` (`lib/auth.ts`) is typed as exactly
  `{ userId, issuedAt, expiresAt }` — no `role` field exists on the type.
  `lib/session.ts`'s `encrypt()` signs only `{ userId }` as the JWT claim
  (plus `iat`/`exp` from `jose` itself); `decrypt()` reads back only
  `userId`/`iat`/`exp`. A role value is never written into, or read out of,
  the cookie at any point — `role` only ever enters the system via the
  `findUserById()` database row.
- **Inactive or deleted accounts are not silently trusted.**
  `getCurrentUser()` treats `!user || !user.active` identically to "no
  session" — both resolve to `null`.

Combined with the manual login test above (which produced a real signed
cookie for `admin_test`) and the earlier direct database check confirming
`admin_test`'s row has `role = admin`, `active = true`, this is enough to
consider "role loaded from database, not cookie" **validated by
architecture, not merely asserted** — the type system and the query layer
together make a cookie-embedded role impossible to construct through the
app's own code, not just unlikely.

### `proxy.ts` review

Re-read in full. Current behavior, confirmed against a running server:

- `verifySession()` runs on every `/dashboard/**` request (cookie
  signature + expiry check only, no DB call) — this part is real and does
  execute.
- The actual `if (!session) redirect('/login')` enforcement is still
  commented out. Confirmed live: `curl http://localhost:3000/dashboard`
  with **no cookie at all** returns `200` and renders the dashboard shell —
  identical to the authenticated case. **No route in this app currently
  enforces authentication anywhere** — a repo-wide search for
  `getCurrentUser`/`requireUser`/`requireRole`/`hasPermission` outside
  `lib/` finds exactly one call site, `app/login/page.tsx`'s own
  "redirect away if already logged in" check. `/dashboard`,
  `/dashboard/booking`, `/dashboard/couriers`, `/dashboard/reports`,
  `/dashboard/issues`, and `/dashboard/issues/[issueId]` have zero
  server-side authorization checks of their own.
- **Is this safe, now that login works?** Login working removes the
  original blocking reason from Stage 14b/14c ("no way to log back in").
  It does **not** by itself make enabling the redirect safe, for a
  different reason: `app/dashboard/page.tsx` renders as "LEDSone Postage
  Workspace" and links to `booking`/`couriers`/`reports` — these read as
  already-in-use operational pages for the wider Postage department, not
  Issue-Tracker-only scaffolding. Exactly one account
  (`admin_test`) exists in `issue_tracking.management_users`. There is no
  self-registration and no built "add user" flow yet (the `user:manage`
  permission exists in the permission model but has no UI/route
  implementing it). Enabling the proxy redirect today would immediately
  redirect every visitor to those pages — other than whoever is holding
  `admin_test`'s credentials — to `/login`, with no account for them to log
  in with. That is a live-route-breaking change for anyone but the single
  test admin.
- **Decision: proxy.ts's redirect remains disabled.** Not re-implemented
  or changed this stage, per instruction ("do not change authentication
  code unless a failure is found") — no failure was found, this is a scope
  question, not a bug. Enabling it is a decision for the project owner /
  Varmen: either (a) provision accounts for existing dashboard users before
  enabling app-wide, or (b) narrow `PROTECTED_PATH_PREFIXES` to
  `/dashboard/issues` only so the Issue Tracker gets real protection
  without touching the other pages' current (already-established, pre-
  Issue-Tracker) access model. Both are feature/scope decisions, not
  validation, so neither was made unilaterally here.

### Files created

None (net). `postage-workspace/.env.local` was created (new, gitignored,
holds only `AUTH_SECRET`); a temporary read-only DB-check script was
created and deleted within this stage; a proposed synthetic-session-token
script was drafted but never written (rejected before creation).

### Files modified

None. No implementation code was changed this stage.

### Database commands run

- `SELECT current_database(), current_user;` (read-only, via a temporary,
  deleted script)
- `SELECT user_id, username, role, active, created_at FROM
  issue_tracking.management_users ORDER BY user_id;` (read-only, same
  script)

### Database writes performed

**ZERO.** The only write to `management_users` in this project's history
remains the project owner's own interactive run of
`scripts/create-first-admin.ts`, outside the assistant's tool access.

### Remaining limitations / warnings

1. **No route currently enforces authentication.** `/dashboard/**` is
   fully reachable without a session today. This is an accurate
   description of current behavior, not a defect introduced this stage —
   Stage 14b/14c left it this way deliberately, for the reasons above.
2. `proxy.ts`'s `verifySession()` call will throw if a `session`-named
   cookie is present but `AUTH_SECRET` is unset in the running environment
   (e.g. after a redeploy that lost `.env.local`) — an unauthenticated
   request with no cookie at all is unaffected (`verifySession()` returns
   `null` before ever reading the secret). Worth confirming `AUTH_SECRET`
   is provisioned in every environment this app runs in, not just this
   local one.
3. Only one account exists in `issue_tracking.management_users`
   (`admin_test`, role `admin`). `management`/`staff` roles are fully
   implemented in `lib/auth.ts`'s permission table but have never been
   exercised against a real logged-in account of either role.
4. Issue management features (creation, assignment, workflow, comments,
   history) remain out of scope — unchanged, carried through every stage.
