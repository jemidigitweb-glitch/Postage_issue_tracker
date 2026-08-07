# Issue Tracker — Application Structure

Records the application skeleton created for the Issue Management System:
folders/placeholder routes only, no business logic, no authentication, no
database queries, no database connection made while producing this document
or the files it describes.

## Chosen application location: `postage-workspace`

Confirmed in earlier discovery (Stage 11) and unchanged: `postage-workspace`
is the operational dashboard app (`/dashboard/{booking,couriers,issues,reports}`),
already has a stubbed `/dashboard/issues` route and sidebar entry, and
matches the Postage AIOS context this project is part of. `ui/` is a
separate, unrelated documentation viewer and is untouched by this or any
prior stage. `Push/` scripts are untouched — they target a different schema
(`varman_aios.hub_pages`) entirely.

## Architecture

```
Browser (React Client Components)
   │  form submit / fetch — never a direct DB call
   ▼
Server Actions ("use server")     Route Handlers (app/api/**/route.ts)
   │  parameterized queries only
   ▼
lib/queries/*.ts   (Stage 15 — not yet created; README.md placeholders only)
   │
   ▼
lib/db.ts          (server-only pg.Pool singleton — created Stage 13)
   │
   ▼
varmen_db.issue_tracking   (PostgreSQL)
```

This flow was established in `documentation/issue_tracker_auth_architecture_decision.md`
§4 and `documentation/issue_tracker_application_foundation.md`, and is
unchanged by this stage — this document records the skeleton that will fill
in the "Browser" and `lib/queries/*` layers, not a new architecture.

### Server-only database access rule

`postage-workspace/lib/db.ts` (already created, Stage 13) begins with
`import "server-only";` — a Next.js framework-enforced guarantee, not just
a naming convention: any Client Component that imports it, directly or
transitively, fails the build. Every future query module under
`lib/queries/` will import the pool from `lib/db.ts` and inherit that same
guarantee by construction (importing a server-only module makes the
importer server-only too).

### No `NEXT_PUBLIC_` database variables

Confirmed, unchanged from prior stages: `lib/db.ts` reads `DATABASE_URL`
only. Nothing in this skeleton introduces any `NEXT_PUBLIC_*` variable, and
none should ever be added for a database credential or connection detail —
that prefix is specifically what Next.js inlines into client-visible
bundles.

## Application skeleton created this stage

```
postage-workspace/
├── app/dashboard/issues/
│   ├── page.tsx                  # existing stub — UNTOUCHED this stage
│   ├── new/
│   │   └── page.tsx              # ✅ created — placeholder route, no form/logic
│   └── [issueId]/
│       └── page.tsx              # ✅ created — placeholder dynamic route,
│                                  #    no data fetching, no lib/db.ts import
├── components/issues/
│   └── README.md                 # ✅ created — documents planned components,
│                                  #    no component code
└── lib/queries/
    └── README.md                 # ✅ created — documents planned query
                                   #    modules, no query code, no SQL
```

Every placeholder page mirrors the existing `app/dashboard/issues/page.tsx`
stub's own style exactly (`DashboardLayout` wrapper, "This section is under
development" message) — no new visual pattern introduced, nothing wired to
real data.

**Route-level correctness confirmed against the installed Next.js 16 docs**
(not assumed): `app/dashboard/issues/[issueId]/page.tsx` uses
`params: Promise<{ issueId: string }>` and `await params` — confirmed as
the correct convention for this Next.js version by reading
`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
directly. A static segment (`new/`) and a dynamic segment (`[issueId]/`) at
the same route level do not conflict — Next.js resolves the static segment
first, so `/dashboard/issues/new` will never be captured by `[issueId]`.

## Future issue management modules (not created yet)

| Module | Location | Stage |
|---|---|---|
| Database connection | `lib/db.ts` | 13 — done |
| Query layer | `lib/queries/{issues,staff,comments,assignments,statusHistory}.ts` | 15 |
| Server Actions | colocated with forms, or `lib/actions/*.ts` | 15 |
| Route Handlers | `app/api/issues/**/route.ts` (confirmed convention: named `GET`/`POST`/etc. exports in a `route.ts` file — verified against `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`) | 15 |
| Issue list UI | `app/dashboard/issues/page.tsx` (replaces existing stub) | 16 |
| Issue submission UI | `app/dashboard/issues/new/page.tsx` (replaces this stage's placeholder) | 16 |
| Issue detail UI | `app/dashboard/issues/[issueId]/page.tsx` (replaces this stage's placeholder) | 16 |
| Issue components | `components/issues/*.tsx` (see `components/issues/README.md`) | 16 |

## Authentication integration point

Not implemented this stage (explicitly out of scope, per instruction). The
integration point is already designed in
`documentation/issue_tracker_auth_architecture_decision.md` and
`postage-workspace/lib/auth.ts` (Stage 13 foundation — typed placeholders
only, every function throws `NotImplementedError`):

- `proxy.ts` (project root — **not** `middleware.ts`; confirmed renamed in
  this Next.js version via `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`)
  will perform an optimistic, cookie-only check and redirect unauthenticated
  requests away from `/dashboard/**`, including every route created this
  stage.
- Every future Server Action and Route Handler under the modules listed
  above must call `lib/auth.ts`'s `getCurrentUser()` (DB-backed) and
  `hasPermission()` explicitly — per the Next.js docs' own security
  guidance (read this session): framework-level protections on Server
  Actions/Route Handlers are not a substitute for an explicit in-handler
  authorization check.
- None of the placeholder pages created this stage call `getCurrentUser()`
  or any auth helper yet — they render unconditionally, since they contain
  no real data or actions to protect. This will change in Stage 16 when
  they're wired to real functionality.

## Unresolved authorization decisions

Carried forward, not resolved by this stage (this stage was scaffolding
only):

1. **Session implementation library** (`jose` vs `iron-session`) —
   evaluation was in progress in
   `documentation/issue_tracker_auth_architecture_decision.md` when this
   task redirected to scaffolding; still open.
2. **Management/Admin: may they create issues or add comments?** — the
   permission-matrix question `documentation/issue_tracker_auth_architecture_decision.md`
   Stage 12A flagged as unresolved; still open.
3. **Admin's "system administration" permission scope** — still undefined
   beyond "full permissions."

None of these block the skeleton created this stage, since no page here
calls any authorization logic yet — but all three must be resolved before
Stage 15 (Server Actions/Route Handlers, which must call `hasPermission()`)
can be implemented correctly.

## Existing UI protection

Per instruction, inspected but **not modified**:

### `app/dashboard/issues/page.tsx`
Unchanged stub: `<h1>Open Issues</h1>` + "This section is under
development." No data, no logic. Confirmed identical to every prior
inspection this project — untouched again this stage.

### `components/dashboard/OpenIssuesSummary.tsx`
Unchanged. Renders 5 hardcoded placeholder issues with:

```ts
type Status = "Investigation Required" | "Under Investigation" | "Under Monitoring";
type Priority = "High" | "Normal";
```

**Current placeholder status labels:** `"Investigation Required"`,
`"Under Investigation"`, `"Under Monitoring"` — three labels, styled red/
amber/blue respectively.

**Future `RED`/`AMBER`/`GREEN` mapping requirement:** the actual database
values (`issue_tracking.issues.status`, `CHECK`-constrained to exactly
`'RED'`, `'AMBER'`, `'GREEN'`) do not match this component's placeholder
vocabulary either in count (2 mapped colors used here — red, amber — no
green/blue-equivalent state exists in the real schema) or in wording. A
mapping decision is required before Stage 16 replaces this component's data
source — either:
- Display the real values directly (`RED`/`AMBER`/`GREEN`), dropping the
  descriptive labels entirely, or
- Keep descriptive labels but map them correctly: `RED → "Investigation
  Required"` (or similar), `AMBER → "Under Investigation"`, `GREEN → ?`
  (this component currently has no green-equivalent state at all — a "Under
  Monitoring" blue state exists in the placeholder with no corresponding
  database status, so this mapping is not a straightforward 1:1 rename and
  needs an explicit decision, not an assumption).

**Migration impact:** none to the database — this is a display-layer
concern only. `Priority` (`"High" | "Normal"`) also doesn't match the
database's actual `priority` values (`critical`/`high`/`medium`/`low`/
`NULL`, per `issue_tracking.issues` `CHECK` constraint) — same kind of
mapping decision needed, flagged here for the same future stage rather than
addressed now, since this stage is scaffolding/documentation only.

---

## Report

**Files created:**
- `postage-workspace/app/dashboard/issues/new/page.tsx`
- `postage-workspace/app/dashboard/issues/[issueId]/page.tsx`
- `postage-workspace/components/issues/README.md`
- `postage-workspace/lib/queries/README.md`
- `documentation/issue_tracker_application_structure.md` (this file)

**Files modified:** none — `app/dashboard/issues/page.tsx` and
`components/dashboard/OpenIssuesSummary.tsx` were inspected only, per
instruction.

**Database commands run:** none
**Database writes performed:** ZERO
