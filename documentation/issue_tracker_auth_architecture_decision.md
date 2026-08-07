# Issue Tracker — Authentication and Application Architecture Decision

Stage 12 output. Documentation only — no application code, no database
objects, no database connection made while producing this document.

Reviewed before writing: `postage-workspace/` structure (via Stage 11
discovery), `postage-workspace/AGENTS.md`, `migration/002_issue_management_system.sql`,
`migration/002_architecture_decisions.md`, `migration/002_issue_management_system_PROPOSAL.md`.

**Important limitation to disclose up front:** `postage-workspace/AGENTS.md`
states *"This is NOT the Next.js you know — breaking changes... Read the
relevant guide in `node_modules/next/dist/docs/` before writing any code."*
`postage-workspace/node_modules` does not exist yet (dependencies were never
installed), so those local docs could not actually be read for this
document — there is nothing at that path to read yet. Everything below about
Next.js 16.2.10's specific API surface (cookies, route handlers, server
actions) is based on general App Router knowledge, **not** verified against
this project's actual installed version. **Before Stage 13 begins, `npm
install` must run in `postage-workspace/` and the AGENTS.md-mandated docs
must actually be read** — treat any Next.js-specific API detail below as
provisional until then.

---

## 1. Authentication approach

### Constraint from the already-executed migration

`migration/002_issue_management_system.sql` (already run — see
`002_architecture_decisions.md` DECISION-005/006) created
`issue_tracking.management_users` with a `password_hash TEXT NOT NULL`
column. This is already live in `varmen_db`. That column only makes sense
under a **credentials-based** login model (username/email + password checked
against a locally-stored hash) — a third-party identity provider that
handles credentials entirely itself would leave that column unused, which
would mean re-opening the schema decision we just went through five stages
of approval for. That materially narrows the real choice here.

### Comparison

| | Custom session cookie | JWT | Third-party provider |
|---|---|---|---|
| **Security impact** | Strong if implemented correctly: httpOnly + Secure + SameSite cookie, HMAC-signed payload, server-only secret. Risk is entirely in getting the crypto and cookie flags right. | Same security profile *if* also stored in an httpOnly cookie (never `localStorage` — that's XSS-exposed). Adds key-management surface (signing key rotation) for no benefit here (see below). | Generally strongest out-of-the-box for the *provider's own* flows, but only if credentials are delegated to it — doesn't fit with `password_hash` already existing locally. |
| **Implementation complexity** | Low–moderate: login route, password verify, sign/verify cookie, `getCurrentUser()` helper. | Comparable to custom cookies, plus a JWT library (`jose`) and key management, for a benefit (token portability across services) this single-app architecture doesn't need. | Adds a real external dependency whose compatibility with this specific Next.js 16.2.10 build is **unverified** — a genuine unknown given AGENTS.md's explicit warning that this version has breaking changes from what's normally expected. |
| **Next.js 16 compatibility** | Uses standard Web `cookies()`/`Request`/`Response` primitives — exact API surface still needs confirming per AGENTS.md before implementation, but no third-party version-matching risk. | Same as custom cookies, plus a JWT library's own compatibility to verify. | Extra, unverified compatibility risk on top of the framework's own already-flagged instability. |
| **Server-side authorization** | `middleware.ts` (or per-route/action checks) verifies the cookie signature, extracts `user_id`/`role`. | Same shape as custom cookies once JWT is put in a cookie. | Delegated to the provider's own middleware/SDK — another unverified integration point. |

### Recommendation: **custom session cookie authentication**

Reasons, in order of weight:
1. The live schema already commits to local password storage — this is the
   path of least resistance and doesn't require reopening an approved,
   already-executed migration decision.
2. This is a single first-party app talking to a single server — JWT's main
   advantage (a token multiple independent services can verify) doesn't
   apply, and a third-party provider's main advantage (federated identity
   across many apps) doesn't apply either.
3. A third-party auth library adds an *unverified* compatibility risk on top
   of a framework version already flagged as non-standard — one unknown is
   enough; recommend not stacking a second one.
4. Fully within our own control, easiest to reason about and audit.

**Known limitation, stated plainly, not hidden:** a stateless signed cookie
cannot be instantly revoked server-side before it expires (no
"log out everywhere" without extra state). Acceptable for an internal
operational tool at this scale; if instant revocation becomes a real
requirement later, that's a new table (`sessions`) and a new decision cycle,
not something to build preemptively now.

---

## 2. User identity model

- **Login identity source:** `management_users.username` (or `email`) +
  password, verified against `management_users.password_hash`.
- **`user_id` handling:** on successful login, `management_users.user_id`
  (the `BIGSERIAL` PK) is embedded in the signed session cookie payload.
  This is the single canonical identity used everywhere downstream —
  `issue_status_history.changed_by`, `issue_assignment_history.assigned_to`/
  `assigned_by`, `issue_comments.author_id` all resolve to this value.
- **Password handling:** hashed at account-creation time with a strong
  adaptive hash (bcrypt cost ≥ 12, or argon2id if available) — never stored
  or logged in plaintext. Verified with the hashing library's own
  constant-time compare, never a manual string comparison. No self-service
  registration is in scope (nothing in the approved feature set asked for
  it) — accounts are admin-created, consistent with the Admin role's "user
  management" responsibility in §3.
- **Session handling:** an httpOnly, `Secure` (in production), `SameSite=Lax`
  cookie holding at minimum `{ user_id, role, issued_at, expiry }`,
  HMAC-signed with a server-only secret (`AUTH_SECRET` — see §5). Every
  server action/route handler re-verifies the signature and expiry before
  trusting the payload; an invalid or expired cookie is treated as
  unauthenticated, not defaulted to any role.
- **Role checking approach:** the role travels in the signed cookie for
  convenience, but recommend **re-checking `management_users.role` and
  `.active` against the database on each authorization-sensitive request**
  rather than trusting the cookie's embedded role for the cookie's full
  lifetime. This is a deliberate freshness-over-micro-performance choice —
  at this application's expected traffic, the extra indexed lookup by
  primary key is cheap, and it means a role change or account deactivation
  takes effect on the next request, not only after the old session expires.

---

## 3. Authorization matrix

> **Superseded by owner approval — see "Stage 12A — Owner-Approved
> Decisions" below for the binding version.** The analysis below is kept
> as-is, unedited, as the original reasoning record; it is no longer the
> operative design where it conflicts with Stage 12A.

Assumed role hierarchy (standard, not contradicted anywhere in the approved
decisions): **admin ⊇ management ⊇ staff** — each higher role includes
everything the roles below it can do, plus its own additional permissions.
**Flagged as an assumption requiring confirmation**, not stated explicitly
in any of the 8 approved architecture decisions.

| Permission | Staff | Management | Admin |
|---|---|---|---|
| View issues | ✅ *(scope ambiguous — see below)* | ✅ all issues | ✅ all issues |
| Create issues | ✅ | ✅ | ✅ |
| Add comments / investigation notes | ✅ | ✅ | ✅ |
| Change status of an issue assigned to them | ✅ *(own assigned issues only)* | ✅ any issue | ✅ any issue |
| Assign / reassign issues | ❌ | ✅ | ✅ |
| Approve reopening (GREEN → earlier) | ❌ | ✅ | ✅ |
| Monitor workflow (status/assignment history, cross-issue view) | ❌ | ✅ | ✅ |
| User management (`management_users` CRUD, role changes) | ❌ | ❌ | ✅ |
| System administration (undefined scope) | ❌ | ❌ | ✅ |

**Two open questions, not silently resolved:**
1. **Staff "view issues" scope** — the brief doesn't say whether Staff see
   only issues they raised/are assigned to, or all issues (like
   Management's explicitly-stated "view all issues"). I've assumed the
   narrower reading (own-related issues only) since Management's line item
   explicitly calls out "all," implying Staff's is narrower by contrast —
   but this needs an explicit confirm, not an assumption baked into
   implementation.
2. **"Change assigned issue status" for Staff** — read as "an issue
   currently assigned to them," not "assign a status to any issue." Also
   needs confirmation this is the intended scope, and whether Staff's status
   changes are still subject to the RED→AMBER→GREEN ordering and
   resolution-required-before-GREEN rules from DECISION-002 (assumed yes —
   those rules were approved without a role carve-out).

---

## 4. Application architecture

```
Browser (React client components)
   │  form submit / fetch
   ▼
Next.js Server Actions ("use server") and/or Route Handlers (app/api/**)
   │  parameterized queries only
   ▼
lib/db.ts  (server-only pg.Pool singleton)
   │
   ▼
varmen_db.issue_tracking  (PostgreSQL)
```

- **Database connection module** — `postage-workspace/lib/db.ts`: a single
  `pg.Pool`, instantiated once and reused (guarded against Next.js dev-mode
  hot-reload spawning duplicate pools — a well-known Node/Next.js pitfall,
  handled via a module-scoped singleton). Reads `process.env.DATABASE_URL`.
  No `"use client"` directive anywhere in this file or its import chain.
- **Server actions or route handlers** — recommend Server Actions for
  form-driven mutations (new issue, add comment, change status, assign) and
  Route Handlers under `app/api/issues/**` for anything needing REST-style
  access (e.g. a future external integration, or data fetched by client
  components that isn't a form submit). Both execute exclusively server-side
  in the App Router model. **Exact idiomatic pattern for this Next.js
  version is one of the items that needs confirming against the real docs
  before Stage 13/15**, per the AGENTS.md caveat above.
- **Authentication helpers** — `lib/auth.ts`: password hashing/verification,
  session cookie sign/verify, a `getCurrentUser()` helper callable from any
  server action/route/server component.
- **Protected routes** — `middleware.ts` at the app root: checks the session
  cookie on `/dashboard/**` and issue API routes, redirects unauthenticated
  requests to a login page. Role-specific checks (e.g. only
  `management`/`admin` may call the assignment action) are layered on top,
  inside the individual server action/route, not left to middleware alone.
- **Issue queries** — `lib/queries/{issues,staff,comments,assignments,statusHistory}.ts`,
  as scoped in Stage 11 — parameterized queries exclusively (no string
  concatenation into SQL), matching the discipline already established in
  `migrate-issues.js`.
- **UI components** — as scoped in Stage 11 (`IssueTable`, `IssueStatusBadge`,
  `IssueDetail`, `AssignmentPanel`, `CommentThread`, `StatusHistoryTimeline`,
  `NewIssueForm`). Client components never import `lib/db.ts` or any DB
  query module directly — they call server actions / fetch from route
  handlers only.

**Explicit confirmations requested:**
- **PostgreSQL credentials are server-side only** — `DATABASE_URL` is read
  exclusively inside `lib/db.ts`, which is never imported by a `"use
  client"` component or anything in its tree.
- **No `NEXT_PUBLIC_` database variables** — confirmed there is no reason
  for any DB connection detail to ever carry that prefix (Next.js inlines
  `NEXT_PUBLIC_*` variables into the client JS bundle).
- **Browser never connects directly to PostgreSQL** — structurally enforced,
  not just conventionally avoided: the `pg` package depends on Node's
  `net`/`tls` modules and cannot run in a browser bundle at all. The
  remaining discipline required is simply never leaking a connection string
  or raw DB error into a client-visible response.

---

## 5. Environment variables

Names only — no values requested, none exposed here.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | App's own Postgres connection string (server-side only). Recommend a **distinct, narrower-scoped DB role** from `varmen_user` (which the migration scripts use) — an app role with DML rights on `issue_tracking.*` only, no DDL. This is a recommendation for Stage 13, not yet decided or created. |
| `AUTH_SECRET` | HMAC/signing key for session cookies (server-side only). |
| `SESSION_COOKIE_NAME` *(optional)* | Naming convenience, not a secret. |
| `SESSION_MAX_AGE_SECONDS` *(optional)* | Session lifetime configuration, not a secret. |

**Confirmed — these must never be committed:**
- `postage-workspace/.gitignore` already contains `.env*` (verified by
  reading the file directly this turn, not assumed).
- The repo root `.gitignore` also contains `.env` and `.env.*` (confirmed
  earlier in this project's history).
- A future `postage-workspace/.env.local` for these variables is therefore
  already covered by existing ignore rules — no `.gitignore` change needed
  when Stage 13 creates it.

---

## 6. Next implementation stages

**Stage 13: Create database connection layer**
`lib/db.ts` (pg.Pool singleton), `.env.local` with `DATABASE_URL` (value
supplied out-of-band, never committed), confirm connectivity with a
read-only test query against `issue_tracking`.

**Stage 14: Create authentication implementation**
`lib/auth.ts` (hashing, session sign/verify, `getCurrentUser()`),
`middleware.ts` (route protection), login page/route, first admin account
provisioning approach (needs its own small decision — e.g. a one-off seed
script vs. a manual `INSERT`, run through the same execution-approval
process already established for this project).

**Stage 15: Create issue API / server actions**
`lib/queries/*.ts`, server actions/route handlers for: create issue, assign/
reassign, change status (with RED→AMBER→GREEN + resolution-before-GREEN +
reopen-authorization enforcement per DECISION-002), add comment/investigation
note — each gated by the role checks from §3.

**Stage 16: Create UI pages**
Replace the `app/dashboard/issues/page.tsx` stub with a real list view
wired to Stage 15's data layer; add issue detail, new-issue-submission, and
(if needed) an admin user-management page. Replace
`OpenIssuesSummary.tsx`'s hardcoded placeholder data and mismatched status
vocabulary with real data using `RED`/`AMBER`/`GREEN`.

No files for any of these stages have been created yet.

---

## Stage 12A — Owner-Approved Decisions

This section records the owner's binding answers to the "Remaining
questions" raised in the original Stage 12 document. Sections 1–6 above are
preserved unedited as the original analysis; where this section differs from
them, **this section governs.**

### DECISION-001 — Role hierarchy

**Approved:** Admin has full permissions. Management can perform management
functions. Staff can perform staff functions. **No automatic permission
inheritance should be assumed** unless explicitly implemented through
authorization checks.

**Implementation consequence — supersedes §3's "admin ⊇ management ⊇ staff"
assumption:** authorization code must not use a rank/hierarchy comparison
(e.g. "role level ≥ required level ⇒ allow"). Every permission for every
role must be checked against an **explicit** per-role permission list —
implemented as a literal table/map of `role → [allowed actions]`, not
derived. "Admin has full permissions" means Admin's explicit list contains
every action in the system (see the finalized matrix below) — it is still an
explicit, exhaustive list for Admin, not an inference from being "above"
Management.

**New question this creates (not silently resolved — see "Remaining
questions" below):** the original Stage 12 permission lists for Management
(assign/reassign, view all issues, approve reopening, monitor workflow) and
Staff (view, create, comment, change own-assigned status) don't overlap on
"create issues" or "add comments." Combined with "no automatic inheritance,"
this raises a real operational question — can a Management or Admin account
create an issue or leave a comment, or is that Staff-only? Flagged
explicitly rather than assumed either way.

### DECISION-002 — Staff issue visibility

**Approved:** Staff can view all issues.

**Reason (owner-provided):** Operational transparency is required. Viewing
permissions are separate from modification permissions.

**Supersedes** §3's flagged ambiguity ("Staff 'view issues' scope"). Staff's
view scope is now confirmed as **all issues**, identical in scope to
Management/Admin's view access — read access is not the axis that
distinguishes the three roles; write/action permissions are.

### DECISION-003 — Staff status changes

**Approved:** Staff can change status only for issues assigned to them.

**Conditions (owner-provided, all apply regardless of role):**
- Restricted to their own assigned issues only.
- Workflow ordering enforced: RED → AMBER → GREEN.
- GREEN requires a final resolution to be present.
- Reopening requires authorized permission **and** a required reason.

This confirms the reading already assumed in §3/§4 (DECISION-002 from the
main architecture decisions applies without a role carve-out) — no change
to the earlier analysis, now explicitly locked in rather than assumed.

### DECISION-004 — First admin account provisioning

**Approved:** Create the first admin account through a controlled local
development provisioning script or one-time setup command.

**Requirements (owner-provided):**
- Never hardcode passwords into source files.
- Never print credentials.
- Never expose secrets.
- Store only password hashes in `management_users.password_hash`.
- Document the provisioning process.

**Implementation consequence:** Stage 14 will include a one-time,
manually-invoked provisioning script (e.g. `scripts/create-first-admin.ts`,
not run automatically on build/deploy) that prompts for or reads credentials
from an out-of-band source (never a literal in the script), hashes the
password before any database write, and inserts only the hash into
`management_users`. The script itself, its invocation method, and its
safety checks (same `current_database() = 'varmen_db'` discipline used
throughout this project) will go through the same review process as the SQL
migrations did — no exception for being "just a setup script."

### DECISION-005 — Next.js 16 documentation verification

**Approved:** Before implementation begins:
- Install `postage-workspace` dependencies if required.
- Read the local Next.js 16 documentation referenced by `AGENTS.md`.
- Confirm the correct Server Actions and Route Handler patterns before
  writing application code.

**Status:** Confirmed as a **mandatory prerequisite gate for Stage 13**, not
optional groundwork. This directly resolves remaining question 5 from the
original Stage 12 report (`postage-workspace/node_modules` did not exist at
the time that document was written, so the AGENTS.md-mandated docs could not
be read yet). Stage 13 must not begin until this gate is satisfied.

### Finalized authorization matrix (binding — supersedes §3)

| Permission | Staff | Management | Admin |
|---|---|---|---|
| View issues (all) | ✅ | ✅ | ✅ |
| Create issues | ✅ | ⚠️ *unresolved — see new question above* | ✅ *(full permissions)* |
| Add comments / investigation notes | ✅ | ⚠️ *unresolved — see new question above* | ✅ *(full permissions)* |
| Change status of an issue assigned to them | ✅ *(own assigned issues only)* | — *(see "assign/reassign" and "any issue" rows instead)* | ✅ *(full permissions)* |
| Assign / reassign issues | ❌ | ✅ | ✅ *(full permissions)* |
| Approve reopening (with required reason) | ❌ | ✅ | ✅ *(full permissions)* |
| Monitor workflow (status/assignment history, cross-issue view) | ❌ | ✅ | ✅ *(full permissions)* |
| User management (`management_users` CRUD, role changes) | ❌ | ❌ | ✅ |
| System administration (scope not yet defined) | ❌ | ❌ | ✅ |

Every ✅/❌ above must be implemented as an explicit, individually-checked
authorization rule per DECISION-001 — none may be derived from a role-rank
comparison.

---

## Report

**Files created:** `documentation/issue_tracker_auth_architecture_decision.md` (Stage 12)
**Files modified:** `documentation/issue_tracker_auth_architecture_decision.md` (Stage 12A — added owner-approved decisions, did not remove or rewrite prior analysis)
**Database commands run:** none
**Database writes performed:** ZERO

**Decisions made (Stage 12, recommendations):**
- Authentication approach: custom session cookie (not JWT, not a
  third-party provider)
- Session storage: stateless, HMAC-signed httpOnly cookie (no new
  `sessions` table)
- Role freshness: re-check `management_users.role`/`.active` from the DB
  per request rather than trusting the cookie's embedded role for its full
  lifetime
- Server Actions for form mutations, Route Handlers for REST-style access
- `DATABASE_URL` recommended to use a narrower-scoped DB role than
  `varmen_user` (not yet created)

**Decisions completed (Stage 12A, owner-approved — see full section above):**
- DECISION-001: Role permissions are explicit per-role, no automatic
  hierarchy inheritance in authorization code
- DECISION-002: Staff can view all issues (read access is not
  role-differentiated; write/action access is)
- DECISION-003: Staff status changes limited to their own assigned issues,
  full workflow rules (ordering, resolution-before-GREEN, authorized
  reopening with reason) still apply
- DECISION-004: First admin account via a controlled, manually-invoked
  provisioning script — no hardcoded/printed/exposed credentials, hash-only
  storage, documented process, same review discipline as the SQL migrations
- DECISION-005: Installing dependencies and reading the real Next.js 16
  docs is a mandatory gate before Stage 13, not optional prep

**Remaining questions (still open — need explicit answers before Stage 13–15 implementation):**
1. **New, raised by DECISION-001's "no inheritance" rule:** can Management
   or Admin accounts create issues or add comments/investigation notes, or
   is that Staff-only? The original per-role permission lists don't overlap
   on these two actions, and "no automatic inheritance" means this can no
   longer be assumed either way — needs an explicit owner answer, marked
   ⚠️ in the finalized matrix above.
2. Exact scope of Admin's "system administration" permission — still
   undefined beyond "full permissions"; not urgent, but will need
   definition before any admin-only feature beyond user management is built.

Resolved this stage (no longer open): role hierarchy/inheritance model,
Staff view scope, Staff status-change scope, first-admin provisioning
method, Next.js 16 doc-verification requirement.

**Final status:** ARCHITECTURE DECISION DOCUMENT COMPLETE FOR STAGE 12A —
5 of 5 requested decisions recorded. One new question surfaced by
DECISION-001 remains open (see above) and should be resolved before Stage
15 (issue API/server actions) implements the create-issue and add-comment
authorization checks. Not proceeding to Stage 13 this turn, per instruction.
