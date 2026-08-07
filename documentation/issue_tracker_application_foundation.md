# Issue Tracker — Application Foundation

Stage 12 (continued) output. Records what was actually built as the
foundation layer in `postage-workspace/`, and what Next.js 16.2.10's real
(installed, now-read) documentation confirmed versus what
`issue_tracker_auth_architecture_decision.md` had flagged as provisional.

## Next.js 16 documentation findings (now verified, not provisional)

`postage-workspace/node_modules` did not exist when the Stage 12 decision
document was written, so its Next.js-specific claims were explicitly marked
unverified. Dependencies are now installed and the real local docs (`node_modules/next/dist/docs/`)
have been read. Key findings that affect this project's design:

1. **Middleware is renamed to Proxy in Next.js 16.** This is the specific
   breaking change `AGENTS.md` was warning about. There is no
   `middleware.ts` in this version — the equivalent file is **`proxy.ts`**
   at the project root (same level as `app/`), exporting a `proxy` function
   (default or named export) plus an optional `config.matcher`. Functionally
   equivalent to what "middleware" meant in earlier versions and in most
   training data, but the file name and export name are different.
2. **`cookies()` from `next/headers` is asynchronous** in this version —
   every call site must `await cookies()`.
3. **The `server-only` package** (now installed) is the framework-endorsed
   way to make a module a *build error* if it's ever imported into a Client
   Component, directly or transitively — not just a naming convention.
   Both `lib/db.ts` and `lib/auth.ts` use it.
4. **Official Data Access Layer (DAL) pattern:** a cached `verifySession()`
   (wrapped in React's `cache()`) that checks the DB, called from Server
   Components / Server Actions / Route Handlers close to the actual data —
   as opposed to `proxy.ts`, which should only do a cheap "optimistic"
   cookie-signature check (no DB call), since proxy runs on every request
   including prefetches. This project's `getCurrentUser()` (DB-backed) vs.
   `validateSession()` (cookie-only) split in `lib/auth.ts` mirrors this
   exactly.
5. **Server Actions security model, confirmed:** Next.js provides
   framework-level CSRF checking (Origin vs Host), a 1MB default body limit,
   and encrypted/dead-code-eliminated action references — but explicitly
   states these are *not* a substitute for application-level auth checks
   inside every action. Every Server Action must independently verify the
   session and authorization before doing anything, exactly as this
   project's `lib/auth.ts` foundation is shaped to require.
6. **Route Handlers** (`app/api/**/route.ts`) follow the same rule: treat
   as public endpoints, verify session + role inside the handler itself.

## Application folder structure

```
postage-workspace/
├── proxy.ts                  # NOT middleware.ts — Stage 14, not yet created
├── app/
│   ├── dashboard/
│   │   └── issues/           # existing stub page — untouched this stage
│   ├── login/                # Stage 14, not yet created
│   └── api/                  # Stage 15, not yet created (route handlers)
├── lib/
│   ├── db.ts                 # ✅ created this stage — pg Pool singleton
│   ├── auth.ts                # ✅ created this stage — typed placeholders
│   ├── queries/               # Stage 15, not yet created
│   │   ├── issues.ts
│   │   ├── staff.ts
│   │   ├── comments.ts
│   │   ├── assignments.ts
│   │   └── statusHistory.ts
│   └── dal.ts                 # Stage 14 — cached verifySession() per the
│                               # Next.js DAL pattern (not yet created)
├── components/
│   ├── dashboard/              # existing, untouched
│   └── issues/                 # Stage 16, not yet created
└── .env.local                  # never committed — Stage 13/14 setup step,
                                 # not created by this stage (no real values
                                 # exist to put in it yet)
```

## Database access pattern

```
Browser (React Client Components)
   │  form submit / fetch — never a direct DB call
   ▼
Server Actions ("use server") — form mutations
Route Handlers (app/api/**)   — REST-style reads
   │  parameterized queries only
   ▼
lib/db.ts   →  pg.Pool  (server-only, singleton, HMR-safe)
   │
   ▼
varmen_db.issue_tracking
```

`lib/db.ts`:
- Imports `server-only` as its first line — a Client Component importing it
  (even transitively) fails the build, not just a lint warning.
- Reads `process.env.DATABASE_URL` only. Throws immediately (naming only
  the missing variable, never a value) if unset, rather than failing later
  on first query with a less clear error.
- Uses a single `pg.Pool`, guarded via a `globalThis` singleton so Next.js
  dev-mode hot-module-reloading doesn't spawn a new pool on every file save
  (a well-known Node/`pg`/Next.js pitfall).
- Uses `ssl: { rejectUnauthorized: false }`, matching the same setting
  already required and validated against this Postgres server during the
  historical data migration (`migration/migrate-issues.js`, `PGSSL=require`).
- Exports the pool only — no query helper functions live here yet;
  `lib/queries/*.ts` (Stage 15) will import this pool and contain the
  actual parameterized SQL, scoped to `issue_tracking.*` only.

**Scope discipline carried forward from every prior stage:** nothing in
`lib/db.ts` references `ledsone`, `ph_dashboard`, `postgres`, `staff.users`,
or any HR/company staff table — and nothing added this stage touches
`issue_tracking.issue_staff` or `issue_tracking.issues`. This file makes a
connection pool available; it does not itself issue any query.

## Server/client separation rules

- `lib/db.ts` and `lib/auth.ts` both start with `import "server-only";` —
  enforced at build time, not just documented as a convention.
- No file in `lib/` may ever be imported by a file starting with
  `"use client"`, directly or through an import chain.
- No environment variable used by these files may ever be named
  `NEXT_PUBLIC_*` — that prefix is specifically what Next.js inlines into
  client-visible bundles.
- The browser cannot reach PostgreSQL even by accident: `pg` depends on
  Node's `net`/`tls` modules, which don't exist in a browser bundle. The
  `server-only` guard makes this a build-time certainty rather than an
  implementation detail someone could get wrong.

## Authentication architecture (foundation only — not implemented yet)

`lib/auth.ts` defines the types and function signatures Stage 14 will
implement, per the approved decisions in
`documentation/issue_tracker_auth_architecture_decision.md`:

- `Role = "staff" | "management" | "admin"` — exactly the three approved
  roles, no others.
- `SessionPayload` — the minimal signed-cookie contents (`userId`,
  `issuedAt`, `expiresAt`). No password, email, or other sensitive field is
  ever put in the cookie.
- `CurrentUser` — the identity re-fetched from
  `issue_tracking.management_users` (`userId`, `username`, `displayName`,
  `role`, `active`).
- `getCurrentUser()` — DB-backed, for use in Server Components/Actions/Route
  Handlers close to actual data access (the DAL pattern).
- `validateSession()` — cookie-only, no DB call, for use in the future
  `proxy.ts` (optimistic checks only, per the Next.js 16 guidance above).
- `hasPermission(user, permission)` — the single required enforcement point
  for authorization checks, so no Server Action or Route Handler writes an
  ad hoc role comparison inline.
- `isRole(user, role)` — narrow equality check only, explicitly **not** a
  hierarchy/rank comparison, matching Stage 12A DECISION-001's "no automatic
  permission inheritance" rule.

**Every function currently throws `NotImplementedError`** rather than
returning a placeholder user or a hardcoded boolean — this was a deliberate
choice so that nothing in this foundation could be mistaken for working
authentication and accidentally used to grant access before Stage 14 exists.

**Blocked on one open question** before `hasPermission()`'s underlying
permission table can be implemented: whether Management/Admin accounts may
create issues or add comments (flagged as unresolved in
`issue_tracker_auth_architecture_decision.md` Stage 12A). Not re-decided
here — carried forward as a blocker for Stage 14/15.

## Environment variable requirements (names only — no values)

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `lib/db.ts` | Postgres connection string for the app. Recommend (still not created) a narrower-scoped DB role than `varmen_user` — DML on `issue_tracking.*` only, no DDL. |
| `AUTH_SECRET` | `lib/auth.ts` (Stage 14) | Signing key for the session cookie. Not read anywhere yet — no code in this stage references it, since session signing isn't implemented yet. |

**Confirmed, not assumed:** `postage-workspace/.gitignore` contains `.env*`
(verified by reading the file directly). No `.env.local` file was created
this stage — there are no real values to put in one yet, and creating an
empty/placeholder one risked being mistaken for real configuration.

## Future implementation order

**Stage 13 (this stage):** Database connection layer — `lib/db.ts`. ✅ Done.

**Stage 14: Authentication implementation**
- `lib/dal.ts` — cached `verifySession()` per the Next.js DAL pattern
- Implement `getCurrentUser()`, `validateSession()`, `hasPermission()` for
  real (session signing/verification via a session management library,
  e.g. `jose`, per the Next.js docs' own recommendation — not yet installed)
- `proxy.ts` at the project root (NOT `middleware.ts`) for optimistic
  route protection
- Login page/route
- First admin account provisioning script, per Stage 12A DECISION-004
  (controlled, manual, no hardcoded/printed/exposed credentials, hash-only
  storage) — goes through the same review process the SQL migrations did

**Stage 15: Issue API / Server Actions**
- `lib/queries/*.ts` — parameterized queries against `issue_tracking.*`
- Server Actions for create/assign/status-change/comment, each calling
  `hasPermission()` explicitly
- Requires the Management/Admin create-issue-and-comment question resolved
  first

**Stage 16: UI pages**
- Replace the `app/dashboard/issues/page.tsx` stub with real data
- Issue detail, new-issue-submission, admin user-management pages
- Replace `OpenIssuesSummary.tsx`'s placeholder data and mismatched status
  vocabulary (`Investigation Required`/etc.) with real `RED`/`AMBER`/`GREEN`
  data

No files for Stage 14–16 were created this turn, per instruction.
