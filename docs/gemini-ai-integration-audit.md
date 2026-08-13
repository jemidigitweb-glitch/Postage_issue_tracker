# Gemini Flash AI Assistant — Read-Only Investigation / Design Audit

**Repository:** `Postage_issue_tracker` (app root: `postage-workspace/`)
**Stage:** INVESTIGATION / DESIGN ONLY — nothing implemented, nothing installed, no schema change, no key added.
**Audit date:** 2026-08-13
**Audited branch / commit:** `main` @ `cc90456` (`feat: complete issue tracker workflow and audio support`), in sync with `origin/main` (0 ahead / 0 behind).
**Status:** DRAFT — pending owner approval. See §29 Owner Decisions Required.

Every claim below is labelled:

| Label | Meaning |
|---|---|
| **CURRENT VERIFIED FACT** | Read directly out of this repository, this database, or current official Google documentation during this audit. |
| **PROPOSED DESIGN** | A recommendation for a future stage. Not built. |
| **FUTURE OPTIONAL IDEA** | Deliberately deferred; revisit only under a stated condition. |

---

## 0. Current System Completion Gate

**CURRENT VERIFIED FACT.** All five commands were run against the working tree on 2026-08-13.

| Gate | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **PASS** — 442 tests, 79 suites, 0 fail, 0 skipped |
| Historical audio | `npm run verify:historical-audio` | **PASS** — 52 recordings across 41 Issues; hashes match; 52/52 Cloudinary assets reachable; nothing written |
| Access scope | `npm run verify:scope` | **PASS** — all checks; `assignment_users.user_id present: true`; "No rows were written" |
| Lint | `npm run lint` | **PASS** — clean, exit 0 |
| Build | `npm run build` | **PASS** — Next.js 16.2.10 (Turbopack), compiled 8.7s, TypeScript clean, 14/14 static pages |

**Git state (CURRENT VERIFIED FACT)**

- Branch `main`, tracking `origin/main`, **0 ahead / 0 behind** — the last commit `cc90456` is pushed.
- Working tree is **not clean**: 14 modified files plus 2 untracked files (`lib/datetime.ts`, `tests/datetime.test.ts`) from the immediately preceding Asia/Colombo timezone-display task. Those changes are **display-only, fully tested, and passing all five gates above** — they were deliberately left uncommitted on the owner's instruction ("Do NOT commit, push or deploy"). They are therefore **not** in the deployed build.

**Vercel production state (CURRENT VERIFIED FACT)**

- Project `jk-4f13/issue-tracker`, root directory `postage-workspace`, framework `nextjs`, Node `24.x`.
- Latest **Production** deployment: `https://issue-tracker-60kcv1xnu-jk-4f13.vercel.app` — status **● Ready**, age 16h, build 34s. Thirteen prior production deployments all Ready.
- Production environment variables present: `DATABASE_URL`, `AUTH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — **all marked Sensitive / Hidden, none `NEXT_PUBLIC_*`**. No AI-related variable exists. (Names only were read; no value was retrieved or logged.)

### Gate verdict

> **Current implementations completed: PASS**

The one caveat, stated plainly rather than hidden: the deployed production build is commit `cc90456`, which **predates** the uncommitted timezone-display work in the tree. The system is stable and every gate passes both with and without those edits (they are additive and covered by their own tests). Nothing in this Gemini audit depends on them.

---

## 1. Current Issue System Architecture Relevant to AI

**All of §1 is CURRENT VERIFIED FACT.**

### 1.1 Stack

Next.js `16.2.10` (App Router, Turbopack), React `19.2.4`, TypeScript `5`, `pg` `8.22`, `jose` `6.2.8` (session signing), `bcryptjs` `3.0.3`, Tailwind 4. Tests are `tsx --test tests/*.test.ts` (Node's built-in runner). Deployment: Vercel, Node 24.x.

### 1.2 Frontend structure

- `app/` — App Router. Routes: `/`, `/login`, `/logout`, `/dashboard`, `/dashboard/issues`, `/dashboard/issues/[issueId]`, `/dashboard/issues/new`, `/dashboard/issues/add-staff`, `/dashboard/tracker`, `/dashboard/tracker/[issueId]`, `/dashboard/discussions/**`, `/dashboard/booking`, `/dashboard/couriers`, `/dashboard/reports`.
- `components/` — grouped by feature: `issues/`, `tracker/`, `discussions/`, `dashboard/`, `shared/`, `common/`.
- Pages are **async Server Components**. Client interactivity is isolated into `"use client"` components that call Server Actions through `useActionState` (e.g. `components/issues/AssigneeStatusControl.tsx`, `IssueProgressUpdateForm.tsx`, `AssignmentPanel.tsx`).
- `params` and `searchParams` are **Promises** in this Next.js version (documented in-file against `node_modules/next/dist/docs/`).

### 1.3 Backend structure — **there are no API routes**

There is **no `app/api/` directory and no `route.ts` anywhere in the repository.** Every mutation is a **Server Action** in a `"use server"` file colocated with its route:

`app/dashboard/issues/status-actions.ts`, `assign-actions.ts`, `delete-actions.ts`, `new/actions.ts`, `add-staff/actions.ts`, `app/login/actions.ts`, `app/logout/actions.ts`, plus nine `app/dashboard/discussions/**/*-actions.ts`.

This matters for §2: **an AI feature should be a Server Action, not a new REST route**, because a Server Action inherits the established authorization pattern and adds no new publicly-addressable surface.

### 1.4 Authentication and roles

- `proxy.ts` (middleware) verifies only that *some* validly-signed, unexpired session cookie exists. It performs **no** database lookup and knows nothing about roles — it cannot authorize anything.
- `lib/session.ts` — signed, httpOnly cookie via `jose`; payload is `{ userId, issuedAt, expiresAt }` only. No role, no PII in the cookie.
- `lib/auth.ts` — server-only. `getCurrentUser()` re-fetches role/active from `issue_tracking.management_users` on every request (never trusts the cookie's claim). Exposes `requireUser()`, `requireRole()`, `hasPermission()`, `isSuperAdmin()`, `getIssueAccessScope()`, `getCurrentUserWithScope()`.
- `lib/access/permissions.ts` — **pure module, no `server-only`, no `next/*`, no DB import**, so it is directly unit-testable. Contains the `Permission` string-union, the explicit per-role `ROLE_PERMISSIONS` table (no hierarchy or inheritance — DECISION-001), `IssueAccessScope`, `resolveIssueAccessScope()`, `issueScopeQueryArgs()`, `effectiveAssigneeFilter()`.

Roles: `staff` (= **Assignee**), `management` (unused; no account holds it), `admin` (= **Super Admin**).

Assignee holds exactly two permissions: `issue:view_own_assigned`, `issue:change_status_own_assigned`. Both are *necessary but not sufficient* — every call site must additionally prove the specific Issue is currently assigned to that user.

### 1.5 Assignee ownership chain

```
issue_tracking.management_users.user_id      (login identity, from the session)
  → issue_tracking.assignment_users.user_id  (link column, migration 011 — APPLIED, verified)
  → issue_tracking.assignment_users.assignee_id
  → issue_tracking.issue_assignments.assignee_id   WHERE is_current = true
```

Implemented by `lib/queries/assigneeLink.ts` (`findAssigneeForUser`, `findAssigneeIdForUser`) — fails closed to `null` on any error, missing column, unlinked account, or inactive assignee.

`issue_tracking.issue_staff` ("Raised By") is **never** an ownership source. This is stated in `permissions.ts`, `auth.ts` and `assigneeLink.ts`, and is asserted by `verify:scope` ("Assignee identity comes from assignment_users, never issue_staff").

The scope is enforced *in SQL*, via `scopePredicate()` in `lib/queries/issues.ts`:

```sql
AND ($u::boolean OR EXISTS (
      SELECT 1 FROM issue_tracking.issue_assignments ia
      WHERE ia.issue_id = i.issue_id AND ia.is_current = true AND ia.assignee_id = $a::int))
```

`"none"` binds `assigneeId = NULL`, so the comparison is never true and the fail-closed path is the same code path as the normal one.

### 1.6 Super Admin boundaries

`lib/access/issueDetailView.ts` — pure function `resolveIssueDetailView({canChangeStatusAny, canChangeStatusOwnAssigned})` returns named booleans. **The Super Admin check comes first and is absolute**: a holder of `issue:change_status_any` always resolves to `kind: "admin"` with every assignee-portal flag off. This is the existing, tested mechanism for "this feature belongs to one portal only" — and it is exactly where an AI flag belongs (§2).

### 1.7 Issue detail page structure

`app/dashboard/issues/[issueId]/page.tsx` — one route serving both portals:

1. validates the ID shape (`isValidIssueId`), 2. resolves `{user, scope}` from the session only, 3. resolves three permissions, 4. calls `resolveIssueDetailView(...)`, 5. loads data in one `Promise.all` (all scoped), 6. renders `<IssueDetail>` plus — **for the assignee only** — `<AssigneeStatusControl>` and `<IssueWorkProgress>`, and — for `issue:assign` holders only — `<AssignmentPanel>`.

An out-of-scope Issue returns `null` and renders the **same** "Issue not found" panel a nonexistent ID produces, deliberately, so existence cannot be probed.

### 1.8 Query / service layer

`lib/queries/*.ts` — every module is `server-only` and talks to Postgres **only** through `query()` / `getVerifiedClient()` in `lib/db.ts`. Relevant modules: `issues.ts`, `issueAssignments.ts`, `issueStatus.ts`, `issueWorkProgress.ts`, `assigneeLink.ts`, `assignmentUsers.ts`, `tracker.ts`, `staff.ts`, `users.ts`.

Reads that can reach Issue rows take an `IssueAccessScope` parameter. Writes take a `requireAssigneeId` and **re-verify ownership inside the transaction after locking the row**, so a concurrent reassignment cannot be raced.

### 1.9 Database connection handling

`lib/db.ts`: `server-only`; single `pg.Pool`; `DATABASE_URL` read **lazily inside `getPool()`** (never at module load, so `next build` cannot break); `ssl: { rejectUnauthorized: false }`; HMR-safe global singleton in dev. Before the first query of a process it asserts `current_database() = 'varmen_db'` and `current_user = 'varmen_user'` and refuses otherwise. Nothing in the file logs or returns the connection string.

### 1.10 Environment-variable handling

Server-only variables, never `NEXT_PUBLIC_*`: `DATABASE_URL`, `AUTH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `MIGRATION_DB_URL` (local only). `.env*` is gitignored. `postage-workspace/.gitignore` also ignores `.vercel`. The existing comment convention in `.env.local` ("Server-side only. Never prefix with NEXT_PUBLIC_.") is the pattern a Gemini key must follow.

### 1.11 Database structure relevant to AI

Schema `issue_tracking`, 17 tables + 1 view:
`issues`, `issue_staff`, `issue_comments`, `issue_status_history`, `issue_assignments`, `issue_assignment_history`, `issue_staff_assignments`, `assignment_users`, `management_users`, `issue_number_counters`, `v_current_assignment`, plus 6 `discussion*` tables (out of scope for AI).

`issues` columns relevant here: `issue_id`, `issue_title`, `issue_description`, `staff_code`, `status`, `priority`, `category`, `created_date` (DATE), `updated_at`, `deleted_at`, `resolution`, `implementation_progress`, `implementation_done`, `final_resolution`, `process_started_at`, `completed_at`, `completed_date` (DATE), `extra_data` (JSONB, `jsonb_typeof = object` constraint).

**Installed extensions: `plpgsql` only.** Available but not installed: `pg_trgm 1.6`, `unaccent 1.1`, `fuzzystrmatch 1.2`, `btree_gin 1.3`. **`vector` (pgvector) is NOT in `pg_available_extensions`** — this is decisive for §11.

### 1.12 Attachments / images / audio

There is **no attachments table**. Evidence lives in `issues.extra_data`:

- `extra_data.images` — `[{url, public_id, original_name}]`; 40 Issues, 64 images.
- `extra_data.attachments` — richer `StoredAttachment[]` (`type`, `url`, `public_id`, `original_name`, `mime_type`, `source`, `bytes`); 42 Issues; 52 audio recordings across 41 Issues (verified by `verify:historical-audio`).
- Storage is Cloudinary (`lib/cloudinary.ts`); validation is `lib/access/attachments.ts` — magic-byte sniffing, not the browser's declared MIME.
- `source` is `"upload" | "voice_recording" | "historical"`. `ASSIGNEE_VISIBLE_SOURCES = ["upload","voice_recording"]` — historical audio is filtered **server-side** so an Assignee's page never receives those URLs. Any AI feature must respect the same filter.

### 1.13 Validation patterns to reuse

`lib/access/*` is the established home for **pure, testable, dependency-free** rules: `issueWorkDetails.ts` (`validateProgressUpdate`, `validateTransitionWorkDetails` returning `{ok:true,value} | {ok:false,error}`), `issueWorkflow.ts`, `attachments.ts`, `assigneeValidation.ts`, `permissions.ts`, `issueDetailView.ts`. Server Actions trim, length-cap, allow-list against fixed arrays, never echo input back in errors, and log the real error server-side while returning a generic message.

### 1.14 Reusable permission helpers

`hasPermission(user, permission)`, `getIssueAccessScope(user)`, `getCurrentUserWithScope()`, `roleHasPermission()`, `resolveIssueAccessScope()`, `issueScopeQueryArgs()`, `scopePredicate()`, `resolveIssueDetailView()`. An AI feature needs **no new authorization primitive** — only a new `Permission` string and a new flag on the existing view resolver.

---

## 2. Best Integration Point

**PROPOSED DESIGN.** Lowest architectural risk, in order of preference:

1. **A new Server Action file, `app/dashboard/issues/ai-actions.ts`** (`"use server"`), exporting one action — `analyseIssueWithAiAction(prevState, formData)`. It mirrors `status-actions.ts` exactly: one private `authorizeAiAnalysis()` gate at the top, `isValidIssueId()` shape check, session-derived assignee id, generic user-facing errors, real errors logged server-side.
   *Why:* it is the pattern every other mutation already uses; it adds **no** new publicly-addressable route; `"use server"` guarantees the module (and therefore the Gemini key) can never enter a client bundle.
2. **A new flag on `resolveIssueDetailView()`** — `showAiAssistant: boolean`, `true` only on the `"assignee"` branch, `false` on `"admin"` and `"other"`. Because the Super Admin branch returns `NOTHING_EXTRA` first and absolutely, "the Super Admin has no AI action" becomes a property of a pure function with an exhaustive unit test, not of how the JSX happens to be written.
3. **One new component, `components/issues/IssueAiAssistant.tsx`** (`"use client"`), rendered from `app/dashboard/issues/[issueId]/page.tsx` behind `view.showAiAssistant`, using `useActionState` like `IssueProgressUpdateForm`.

**Explicitly rejected:** a `app/api/ai/route.ts` Route Handler (introduces the repo's first public API surface and a second authorization idiom); adding AI to `components/issues/IssueDetail.tsx` (shared with the Super Admin page, which is frozen); anything in `components/tracker/*`.

---

## 3. Recommended Gemini Model

**CURRENT VERIFIED FACT** (fetched from official docs during this audit, 2026-08-13):

| Model ID | Status | Input / Output tokens | Price /1M in → out | Structured outputs |
|---|---|---|---|---|
| `gemini-3.6-flash` | **Stable**, latest update July 2026, *no shutdown date announced* | 1,048,576 / 65,536 | $1.50 → $7.50 | Yes (also function calling, thinking) |
| `gemini-3.5-flash` | Stable | 1M / 64k | $1.50 → $9.00 | Yes |
| `gemini-3.5-flash-lite` | Stable | — | $0.30 → $2.50 | Yes |
| `gemini-3.1-flash-lite` | Stable but **shutdown 2027-05-07**, replaced by `gemini-3.5-flash-lite` | — | — | Yes |

### Recommendation — **`gemini-3.6-flash`**

**PROPOSED DESIGN.**

- **Suitability.** Root-cause reasoning over ~2–4k tokens of operational text is a reasoning task, not a bulk-classification task. 3.6 Flash is the current flagship Flash tier and is documented as GA/production-ready.
- **Reasoning vs cost.** It is *cheaper on output* than `gemini-3.5-flash` ($7.50 vs $9.00/1M) while documented as stronger on complex tasks with reduced token usage. There is no reason to choose 3.5 Flash over it.
- **Cost in this workload.** Measured from the real data (§8.4): ~2–3k input tokens and ~800–1,500 output tokens per analysis ⇒ **≈ US$0.013–0.016 per analysis**. At 50 analyses/day ≈ **$0.75/day ≈ $23/month**. Cost is not a constraint here; correctness and privacy are.
- **Latency.** Not published per-model. Flash tier with thinking enabled should be assumed to take **several seconds**, which is why §18 specifies an explicit pending state and §17 a 45s timeout — do not design for sub-second.
- **Structured output.** Supported (§4.2).
- **Lifecycle.** Stable with no announced shutdown; Google states listed shutdown dates are "the *earliest possible dates*" and that exact dates are communicated "with advance notice." **Pin the exact string `gemini-3.6-flash` in one server-side constant** so a model change is a one-line, reviewable edit.

### Fallback — **`gemini-3.5-flash-lite`**

**PROPOSED DESIGN.** Use it **only** on a `503 UNAVAILABLE` (model overloaded) or a `429` that survives the retry budget — i.e. availability failover, never quality failover, and never silently:

- one attempt only, no further fallback;
- the response is labelled in the UI: *"Generated with the fallback model — treat with extra caution."*;
- if the fallback also fails, show the error state (§21). Do **not** cascade to a third model.

Reason for choosing Flash-Lite as the fallback rather than 3.5 Flash: it is a genuinely different capacity pool at 1/5 the input cost, and a degraded-but-available answer plus an explicit banner is more honest than an equally-priced model that may be experiencing the same overload.

---

## 4. Official Documentation References

**CURRENT VERIFIED FACT** — all fetched 2026-08-13. Re-verify before implementation; this ecosystem moves fast.

| Topic | URL | What it established |
|---|---|---|
| Model catalogue | https://ai.google.dev/gemini-api/docs/models | Current Flash line-up and exact model ID strings |
| Gemini 3.6 Flash | https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash | 1,048,576 in / 65,536 out; text+image+video+audio+PDF in, text out; structured outputs, function calling, thinking; stable, updated July 2026 |
| Structured output | https://ai.google.dev/gemini-api/docs/structured-output | `response_format: {type, mime_type, schema}`; supported JSON-Schema subset; "Not all JSON Schema features are supported"; "Very large or deeply nested schemas may be rejected" |
| JS quickstart | https://ai.google.dev/gemini-api/docs/quickstart | `npm install @google/genai`; `new GoogleGenAI({})` reads `GEMINI_API_KEY` from the environment; `ai.interactions.create({...})`; `interaction.output_text` |
| Pricing | https://ai.google.dev/gemini-api/docs/pricing | Per-model prices; free tier "Content used to improve our products: **Yes**"; paid "**No**" |
| API Terms | https://ai.google.dev/gemini-api/terms | Unpaid: content used to develop Google products; "Human reviewers may read, annotate, and process your API input and output"; **"Do not submit sensitive, confidential, or personal information to the Unpaid Services."** Paid: not used for product improvement; limited abuse/legal logging under the Data Processing Addendum |
| Rate limits | https://ai.google.dev/gemini-api/docs/rate-limits | Free / Tier 1 (billing linked) / Tier 2 ($100 + 3 days) / Tier 3 ($1,000 + 30 days); measured in RPM, TPM, RPD; **exact per-model numbers are not published on the page — they must be read from AI Studio** (https://aistudio.google.com/rate-limit); exceeding returns `429 RESOURCE_EXHAUSTED` |
| Troubleshooting | https://ai.google.dev/gemini-api/docs/troubleshooting | "implement an exponential backoff strategy" for `429`/`503`; "Do not retry on client errors (like `400` or `403`)"; official SDKs "include automatic retry logic with exponential backoff by default" |
| API errors | https://ai.google.dev/gemini-api/docs/api-errors | 400/401/403/404/409/416/429/500/501/503/504; blocked codes `safety`, `recitation`, `language`, `prohibited_content`, `spii`, `blocklist`, `content_blocked`, …; generation errors `malformed_function_call`, … |
| Deprecations | https://ai.google.dev/gemini-api/docs/deprecations | `gemini-3.6-flash` / `gemini-3.5-flash`: "No shutdown date announced". Listed dates are "the *earliest possible dates*", communicated "with advance notice" |
| SDK reference | https://googleapis.github.io/js-genai/ · https://github.com/googleapis/js-genai | `HttpOptions.timeout` (ms). Open issue #1277: `config.httpOptions.timeout` is reported ineffective for `models.generateContent` — **verify timeout behaviour empirically at implementation time and wrap in `AbortSignal.timeout()` regardless** |

> **Caveat, stated honestly:** the current docs show the newer **Interactions API** (`ai.interactions.create`, `input`, `response_format`, `output_text`) rather than the older `models.generateContent` / `responseMimeType` / `responseSchema` shape, and the search results reference a "Generate Content API (Legacy)". Nothing in this audit depends on which surface is used — but **the exact call shape must be re-read from the quickstart and structured-output pages on the day Phase 3 is written**, not copied from this document.

---

## 5. Proposed Backend Flow

**PROPOSED DESIGN.**

```
Assignee clicks "Analyse with AI" on /dashboard/issues/[issueId]
  │  (a <form action={…}> posting only issueId — no Issue content from the client)
  ▼
app/dashboard/issues/ai-actions.ts  → analyseIssueWithAiAction()      "use server"
  │
  ├─ 1. getCurrentUser()                      → not signed in ⇒ generic error
  ├─ 2. hasPermission(user,"issue:analyse_own_assigned")
  │       ⇒ Super Admin does NOT hold it ⇒ refused here, not just hidden in UI
  ├─ 3. getIssueAccessScope(user)  ⇒ must be kind==="assignee"; else refuse
  ├─ 4. isValidIssueId(issueId)                → shape check before any query
  ├─ 5. getIssueById(issueId, scope)           → SQL-enforced ownership;
  │       null ⇒ "Issue not found or not assigned to you." (identical wording
  │       whether it is someone else's or does not exist)
  ├─ 6. rate-limit check (per assignee, in-memory; §17)
  ├─ 7. sanitizeIssueForAi(issue)              → strict ALLOW-LIST (§13)
  ├─ 8. findSimilarIssuesForAi(issue, {limit:5}) → §10; returns sanitized rows
  ├─ 9. buildAnalysisPrompt(current, similar, SYSTEM_LOCATION_MAP)  (§9)
  ├─10. lib/ai/geminiClient.ts → structured request, 45s AbortSignal,
  │       retry policy (§17), model pinned in one constant
  ├─11. parseAiAnalysis(raw)   → validate against the schema (§7);
  │       invalid ⇒ one repair retry ⇒ then fail cleanly. NEVER render unvalidated text.
  ├─12. drop any relatedHistoricalIssues entry whose issueId is not in the
  │       set actually sent (anti-hallucination, §13.4)
  └─13. return { ok:true, analysis } in the action state
  ▼
UI renders read-only panel. NO database write. NO revalidatePath().
```

**Invariants:** the browser never calls Gemini; the browser never sends Issue content (only `issueId`, re-fetched server-side); no DB write occurs on any path; failure at any step returns a generic message and leaves the page fully usable.

---

## 6. Proposed Frontend Flow

**PROPOSED DESIGN.**

1. `page.tsx` computes `view.showAiAssistant` (assignee only) and renders `<IssueAiAssistant issueId={issue.issueId} />`. Nothing else on the page changes.
2. Collapsed default state: a card titled **AI Assistant** with one primary button, **Analyse with AI**, plus a one-line note: *"Advisory only. AI output is never saved and never changes this Issue."*
3. Submitting runs the Server Action via `useActionState`; `pending` disables the button and shows *"Analysing… this can take up to a minute."*
4. Result renders read-only sections (§18). No field is editable. No control writes anything.
5. Errors render inside the card (§21). The rest of the page — status control, work progress, images, audio — is untouched and fully functional.
6. Result lives in React state only. Navigating away discards it (§20).

---

## 7. Proposed Structured AI Response Schema

**PROPOSED DESIGN.** Deliberately shallow — max nesting depth 2 — because the docs warn "Very large or deeply nested schemas may be rejected."

```ts
// lib/ai/analysisSchema.ts  (PROPOSED — not created)

export type AiConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface AiRootCause {
  cause: string;        // ≤ 300 chars — what may be going wrong
  whyLikely: string;    // ≤ 400 chars — evidence FROM THE SUPPLIED CONTEXT ONLY
  confidence: AiConfidence;
}

export interface AiAreaToCheck {
  area: string;         // must be one of SYSTEM_LOCATION_MAP's labels (§9)
  whatToLookFor: string;// ≤ 300 chars
}

export interface AiRelatedIssue {
  issueId: string;      // MUST be one of the IDs supplied in context
  whySimilar: string;   // ≤ 200 chars
}

export interface AiIssueAnalysis {
  summary: string;                       // ≤ 600 chars, 2–3 sentences
  likelyRootCauses: AiRootCause[];       // 1–4
  confidence: AiConfidence;              // overall
  areasToCheck: AiAreaToCheck[];         // 1–6
  investigationSteps: string[];          // 2–8, imperative, ordered
  suggestedFix: string;                  // ≤ 800 chars
  alternativeSolutions: string[];        // 0–3
  relatedHistoricalIssues: AiRelatedIssue[]; // 0–5
  warnings: string[];                    // ≥ 1, ALWAYS
}
```

JSON-Schema counterpart uses only documented-supported constructs: `type`, `properties`, `required`, `description`, `enum`, `items`, `minItems`, `maxItems`, `additionalProperties: false`. Every field is in `required` (arrays may be empty rather than absent) — a fixed shape is easier to validate and easier for the model to satisfy.

**On `likelyRootCauses` containing `cause` / `whyLikely` / `confidence`: yes, adopt it.** Splitting the claim from its justification is the single highest-value structural choice here: it forces the model to expose reasoning the assignee can check against reality, and it makes an unsupported guess visibly unsupported instead of burying it in prose. It costs one nesting level, which is affordable.

**On confidence — deliberately not a probability.** `LOW | MEDIUM | HIGH` only. An LLM's self-reported numeric confidence is not calibrated; printing "87%" would manufacture false precision for an operations user. Define the scale in the prompt and print the definition in the UI:

- **HIGH** — the supplied Issue text plus a similar past Issue directly support this.
- **MEDIUM** — consistent with the supplied context but not directly evidenced.
- **LOW** — plausible pattern only; no supporting evidence in the supplied context.

**Server-side validation (`parseAiAnalysis`) is mandatory** and must additionally enforce: at least one `warnings` entry (inject the standard human-verification warning if the model omits it), array bounds, string length caps, `confidence` ∈ the enum, and the historical-ID allow-list check. Structured output is not a guarantee — the docs themselves recommend "robust error handling for schema-compliant but semantically incorrect outputs."

---

## 8. Issue Fields Available for AI

### 8.1 `issue_tracking.issues` columns

| Field | Classification | Reasoning |
|---|---|---|
| `issue_id` | **SAFE TO SEND** | Internal reference; needed so output can cite the Issue |
| `issue_title` | **SAFE TO SEND** | Core signal. 146/146 populated |
| `issue_description` | **SEND ONLY AFTER SANITIZATION** | Core signal, but free text typed by staff — must pass the secret/PII redactor and a length cap |
| `category` (Domain) | **SAFE TO SEND** | 10 distinct values; strong retrieval key |
| `status` | **SAFE TO SEND** | RED/AMBER/GREEN only |
| `priority` | **SAFE TO SEND** | Enum; only 19/146 populated |
| `created_date` | **SAFE TO SEND** | DATE only; useful for "how long has this been open" |
| `resolution` (Fix & Action Required) | **SEND ONLY AFTER SANITIZATION** | Free text; 125/146 populated — the richest resolution-like signal in the corpus |
| `implementation_progress` | **SEND ONLY AFTER SANITIZATION** | Free text; 1/146 populated today |
| `implementation_done` | **SEND ONLY AFTER SANITIZATION** | Free text; 1/146 |
| `final_resolution` | **SEND ONLY AFTER SANITIZATION** | Free text; 1/146 |
| `process_started_at` / `completed_at` / `completed_date` | **SAFE TO SEND** | Timestamps; send as dates, not raw ISO, to avoid implying precision |
| `staff_code` / `staff_name` (Raised By) | **DO NOT SEND** | Personal identifier; contributes nothing to root-cause reasoning. If a raiser must be referenced, send the opaque `staff_code` **only** — never the name. Default: omit both |
| `deleted_at` | **DO NOT SEND** | Internal lifecycle metadata |
| `updated_at` | **DO NOT SEND** | Internal bookkeeping; no diagnostic value |

### 8.2 `extra_data` keys — **CURRENT VERIFIED FACT** (measured across all 146 rows)

| Key | Rows | Classification | Reasoning |
|---|---|---|---|
| `rootCause` | 100 | **SEND ONLY AFTER SANITIZATION** | The single most valuable historical field. Max length 4,084 chars ⇒ must be truncated |
| `whatIsHappening` | 64 | **SEND ONLY AFTER SANITIZATION** | Observed-behaviour text; directly matches the "summary" task |
| `sku` | 18 | **SAFE TO SEND** | Product code; strong retrieval key, not personal data |
| `documentGap` | 32 | **SEND ONLY AFTER SANITIZATION** | Occasionally useful process context |
| `member` | 114 | **DO NOT SEND** | Staff personal name. Not needed to diagnose anything |
| `dataLink` | 6 | **DO NOT SEND** | Internal URL — leaks infrastructure topology; the assignee can already click it in the UI |
| `images` | 40 | **DO NOT SEND** (Phase A) | Cloudinary URLs. See §14 |
| `attachments` | 42 | **DO NOT SEND** (Phase A) | Audio/image URLs + provenance. See §14 |
| `sourceFile` | 52 | **DO NOT SEND** | Ingestion provenance — internal file paths |
| `sourceId` | 52 | **DO NOT SEND** | Migration metadata |
| `originalOwner` | 52 | **DO NOT SEND** | Personal name + migration metadata |
| `sourceType` / `sourceFidelity` / `evidenceStatus` / `knownLimits` | 30 each | **DO NOT SEND** | Migration/audit metadata; no diagnostic value |
| `domainConfidence` | 24 | **DO NOT SEND** | Migration classifier metadata; would be mistaken for AI confidence |
| `evidenceFiles` | 22 | **DO NOT SEND** | Internal file paths |
| `classification` | 22 | **DO NOT SEND** | Migration metadata |
| `originalPriority` | 3 | **DO NOT SEND** | Pre-normalisation artefact |
| *any key not listed above* | — | **DO NOT SEND** | Allow-list, not deny-list: unknown keys are dropped |

**The whole `extra_data` object must never be forwarded.** Only four keys — `rootCause`, `whatIsHappening`, `sku`, `documentGap` — are eligible, each individually sanitized and truncated. Note `extra_data` reaches 5,457 chars on one row; blind forwarding would leak Cloudinary URLs, source file paths and staff names in a single line of code.

### 8.3 Other sources

| Source | Classification | Reasoning |
|---|---|---|
| `issue_comments` (`investigation_note`) | **SEND ONLY AFTER SANITIZATION** | Genuine investigation notes. Only 2 rows exist today ⇒ negligible Phase A value, but include the (empty-safe) path |
| `issue_status_history` | **SAFE TO SEND** — as a count/shape summary only | e.g. "3 status changes, currently RED for 12 days". Never the `reason` free text in Phase A |
| `issue_assignments` | **DO NOT SEND** | Who works on what is not diagnostic; it is staff data |
| `management_users` / `assignment_users` | **DO NOT SEND** | Identity and credentials tables. Never |
| Discussions tables | **DO NOT SEND** | Different module, different consent basis |

### 8.4 Resulting payload size — **CURRENT VERIFIED FACT** (measured)

avg title 71 chars (max 273) · avg description 296 (max 1,077) · avg resolution 453 (max 2,092) · avg rootCause 247 (max 4,084).

Current Issue ≈ 1,100 chars ≈ 300 tokens. Five sanitized historical Issues ≈ 3,000 chars ≈ 800 tokens. Instructions + schema + location map ≈ 1,000–1,500 tokens. **Total ≈ 2,000–3,000 input tokens** — 0.3% of the 1M window. Context size is a non-issue; per-field truncation is about *privacy and focus*, not capacity.

---

## 9. "Where the Assignee Should Check" Design

**CURRENT VERIFIED FACT:** Gemini has no knowledge of LEDSone's internal systems. Left unguided it will invent plausible-sounding locations ("check the ERP", "look in the WMS dashboard") that do not exist here — the single most likely way this feature loses the assignee's trust.

**PROPOSED DESIGN — a code-defined, server-side, allow-listed map.**

```ts
// lib/ai/systemLocations.ts  (PROPOSED — not created)
export const SYSTEM_LOCATION_MAP = [
  { area: "Inventory System",        holds: "stock quantity, stock movement history" },
  { area: "Listing Management",      holds: "marketplace listing quantity, listing content, SKU mapping" },
  { area: "Order Management",        holds: "orders, order status, dispatch records" },
  { area: "Warehouse System",        holds: "physical stock location, picking and warehouse movement" },
  { area: "Supplier / Purchasing",   holds: "supplier records, purchase orders, lead times" },
  { area: "Returns",                 holds: "returned items, return reasons" },
  { area: "Issue Tracking System",   holds: "past Issues, investigation notes, past resolutions" },
] as const;
```

Rules:

1. The labels are injected into the prompt, and `areasToCheck[].area` is **validated server-side against this exact list** — any invented area is dropped before rendering. This is why `area` is a constrained string, not free text.
2. **Only labels and one-line descriptions.** No URLs, no hostnames, no table names, no credentials, no schema. The map tells the model *what kind of place* to point at, never how to reach it.
3. **Where it should live:** **code-defined, server-side, allow-listed** — a frozen `const` in `lib/ai/`, reviewed in a PR like any other rule, unit-testable, impossible to reach from the browser. **Not** a DB/config table (that would need a migration, an admin UI, and a validation story for zero benefit at this size) and **not** documentation-only (unenforceable).
4. **FUTURE OPTIONAL IDEA:** if the map ever exceeds ~30 entries or needs non-developer editing, revisit a `issue_tracking.ai_system_locations` table. Not before.
5. **Do not build the map's content in this stage.** The seven entries above are a *shape example* drawn from the domains actually present in the data (`listing` 40, `purchase` 36, `postage` 19, `ph` 14, `pricing` 11, `om` 6, `Inventory` 2, `vendor` 1, `fba` 1). **The real labels must be confirmed by the owner** (§29) — inventing them would repeat exactly the mistake this section exists to prevent.

---

## 10. Historical Issue Usage & Phase A Retrieval Design

### 10.1 What the data actually contains — **CURRENT VERIFIED FACT** (measured 2026-08-13)

| Measure | Count (of 146 Issues, 0 soft-deleted) |
|---|---|
| Status RED | **145** |
| Status AMBER | 0 |
| Status GREEN | **1** |
| `completed_at` populated | **1** |
| `final_resolution` populated | **1** |
| `implementation_done` populated | **1** |
| `implementation_progress` populated | **1** |
| `resolution` (intake "Fix & Action Required") populated | **125** |
| `issue_description` populated | **146** |
| `extra_data.rootCause` | **100** |
| `extra_data.whatIsHappening` | **64** |
| `extra_data.sku` | **18** |
| `issue_comments` (investigation notes) | **2** |
| `issue_status_history` rows | 14, on **1** Issue |
| `issue_assignments` (current) | 2, across 1 assignee |

### 10.2 The honest conclusion

> **There is exactly ONE genuinely completed/resolved Issue in the database.**

Calling the feature "Previous Resolved Issues" would be a factual misrepresentation of the corpus. **Use the wording "Similar Past Issues"** in the UI and in the prompt.

But the corpus is **not** empty of useful investigation material: 125 Issues carry intake-time "Fix & Action Required" text (avg 453 chars) and 100 carry a `rootCause`. That is real, human-written diagnostic content — it is simply *proposed* diagnosis rather than *confirmed* outcome. The prompt must say so explicitly, e.g.:

> "The following are similar past Issues from the same tracker. Their 'suggestedFixAtIntake' and 'rootCauseAtIntake' fields were written when the Issue was RAISED and were **not necessarily confirmed as correct**. Treat them as prior hypotheses, not as verified solutions."

**Phase A can work immediately** — with that framing. Without it, the feature would present 145 unresolved Issues as though they were solved cases, which is worse than having no historical context at all.

### 10.3 Retrieval design — **PROPOSED DESIGN**

A new `lib/queries/issueSimilarity.ts` exporting `findSimilarIssuesForAi(current, {limit: 5})`. Pure SQL, read-only, deterministic, **no new extension required**:

```
score =  3  if category matches
      +  4  if extra_data->>'sku' matches (exact, when both present)
      +  2  per distinct significant keyword from the current title found in
             the candidate's title      (ILIKE, wildcard-escaped, stop-worded)
      +  1  per distinct significant keyword found in the candidate's description
      +  2  if the candidate has a non-empty `resolution`   (prefer Issues that
             carry SOME diagnostic text)
      +  3  if the candidate is GREEN with a final_resolution (genuinely solved)
ORDER BY score DESC, created_date DESC
LIMIT 5, excluding the current issue_id and any deleted_at IS NOT NULL
```

- Keywords are extracted **server-side** from the current Issue's title, lower-cased, stop-worded, length ≥ 4, capped at 8 terms, and each is passed through the existing `escapeLikePattern()` from `lib/queries/issues.ts` and bound as a parameter — never concatenated.
- `pg_trgm` similarity is **available but not installed**. At 146 rows a sequential scan with ILIKE is instantaneous; installing an extension is a database change and is out of scope. **FUTURE OPTIONAL IDEA:** install `pg_trgm` and switch to `similarity()` when row count exceeds ~2,000.
- PostgreSQL native full-text (`to_tsvector`) needs no extension and is a reasonable Phase-A+ upgrade, but adds a functional index (a schema change) for negligible benefit at 146 rows. Deferred.
- Hard cap of **5** context Issues, enforced in the query **and** re-asserted in the sanitizer, and logged if truncation occurs (no silent capping).

---

## 11. Phase B — Embeddings / Vector Search Assessment

**FUTURE OPTIONAL IDEA. Do not build.**

| Consideration | Finding |
|---|---|
| Current volume | 146 Issues. Keyword + category + SKU scoring over 146 rows is exhaustive and exact — embeddings would add machinery, not recall |
| **pgvector availability** | **BLOCKER (CURRENT VERIFIED FACT): `vector` does not appear in `pg_available_extensions` on this server.** Only `plpgsql` is installed; `pg_trgm`, `unaccent`, `fuzzystrmatch`, `btree_gin` are available. pgvector would require the database provider to make the extension available and a superuser `CREATE EXTENSION` — an infrastructure request, not a migration we can write |
| Storage approach (if unblocked) | `issue_tracking.issue_embeddings(issue_id PK/FK, embedding vector(N), model text, source_hash text, updated_at)` — a separate table, never a column on `issues`, so re-embedding never touches the Issue record |
| Reindex strategy | Hash the sanitized embedding input; re-embed only when the hash changes; a backfill script alongside the existing `scripts/verify-*.ts` pattern |
| Privacy | Embedding = sending every Issue's text to an embedding model, including Issues nobody has asked about. Much broader exposure than Phase A's on-demand, 6-Issue-at-a-time flow. Requires the paid tier and a separate owner decision |
| Model choice | `gemini-embedding-001` (stable) or `gemini-embedding-2-preview`; a preview model must not back a persisted index that is expensive to rebuild |
| Migration | Yes — one new table + index, plus the extension prerequisite |
| Operational complexity | HIGH: extension provisioning, backfill, drift, dimension migrations on model change, index tuning |
| Cost | Embedding 146 Issues is pennies; the cost is engineering and operational, not tokens |

**Revisit condition — all three must hold:**

1. **> 1,000** non-deleted Issues, **and**
2. **> 150** Issues with a genuine `final_resolution` (today: **1**), **and**
3. measured Phase-A dissatisfaction — assignees reporting that "Similar Past Issues" misses relevant cases.

Until then, the correct answer is a better keyword query, not a vector index.

---

## 12. Cross-Assignee Historical Access Decision

**This is a policy decision, not a technical one. → OWNER APPROVAL REQUIRED.**

| | **Option A** — sanitized summaries from the whole corpus | **Option B** — only Issues the assignee may already open |
|---|---|---|
| Usefulness | **High.** The whole point is institutional memory | **Near zero today.** The one linked assignee currently has **2** assigned Issues; retrieval would almost always return nothing |
| Privacy | Moderate — depends entirely on sanitization | Minimal |
| Authorization | Widens what an assignee can *learn* beyond what they can *open*. A deliberate, documented exception, not a bug | No change to the model |
| Implementation | Retrieval query intentionally bypasses `scopePredicate()` — must be a separate, clearly-named function with its own tests | Reuses the existing scope predicate |

**Recommendation: Option A, narrowly constrained.** Option B makes the feature useless with today's data (2 assigned Issues out of 146), and the operational value is precisely in learning from Issues you were not assigned.

If Option A is approved, these constraints are **not optional**:

1. **Strip harder than for the current Issue.** From a cross-assignee historical row send **only**: `issueId`, `title`, `category`, `sku`, `rootCauseAtIntake`, `whatWasHappening`, `suggestedFixAtIntake`, `finalResolution` (when present), `status`, `createdDate`. Nothing else.
2. **Never** `staff_name`, `member`, `originalOwner`, assignee identity, `dataLink`, attachment URLs, or any `source*` metadata.
3. **IDs and titles: yes, expose them** — the assignee must be able to say "TS-014 looks like mine" and ask the Super Admin about it. A recommendation the user cannot verify is worse than none.
4. **The link must NOT be clickable.** Render `TS-014` as plain text with a tooltip: *"You may not have access to this Issue — ask a Super Admin."* A clickable link to an out-of-scope Issue would render the correct "Issue not found" page, which reads as a broken feature and quietly confirms the ID exists.
5. Cap at 5 historical Issues per analysis; never expose a browsable list.
6. If Option A is rejected, ship Phase A with **retrieval disabled** (`relatedHistoricalIssues: []`) rather than shipping Option B's empty results dressed up as a feature.

---

## 13. Privacy / Data-Sanitization Rules

**PROPOSED DESIGN.** Two pure helpers in `lib/access/aiSanitization.ts` — pure, no `server-only`, no DB, no network, exactly like the rest of `lib/access/*`, so every rule is unit-testable.

### 13.1 Strict allow-list, never a deny-list

```ts
export function sanitizeIssueForAi(issue: IssueDetail): SanitizedIssue
export function sanitizeHistoricalIssueForAi(row: SimilarIssueRow): SanitizedHistoricalIssue
```

Both **construct a brand-new object literal** field by field. Neither ever spreads (`...issue`) nor forwards `extraData` wholesale. A field added to `IssueDetail` in future is therefore excluded by default — the safe direction.

```ts
interface SanitizedIssue {
  issueId: string; title: string; domain: string;
  status: "RED"|"AMBER"|"GREEN"; priority: string|null;
  createdDate: string; daysOpen: number;
  description: string;                 // redacted + truncated 1500
  suggestedFixAtIntake: string|null;   // resolution,           redacted + 1500
  rootCauseAtIntake: string|null;      // extra_data.rootCause, redacted + 1500
  whatIsHappening: string|null;        // redacted + 1000
  documentGap: string|null;            // redacted + 500
  sku: string|null;                    // format-validated, else dropped
  workInProgress: string|null;         // implementation_progress, redacted + 1500
  workDone: string|null;               // implementation_done,     redacted + 1500
  finalResolution: string|null;        // redacted + 1500
  statusChangeCount: number;           // shape only, never reason text
}
```

### 13.2 Must NEVER be sent — enforced by construction, then re-checked

Passwords and password hashes · database credentials · `DATABASE_URL` or any connection string · `AUTH_SECRET` · session cookies/tokens · any Cloudinary credential · the Gemini key itself · any `process.env` value · internal credential metadata · staff personal names (`staff_name`, `member`, `originalOwner`) · customer names, addresses, emails, phone numbers · supplier personal contact details · attachments/files (§14) · raw image or audio URLs · ingestion provenance (`sourceFile`, `sourceId`, `evidenceFiles`) · migration metadata (`sourceType`, `sourceFidelity`, `evidenceStatus`, `knownLimits`, `classification`, `domainConfidence`, `originalPriority`) · `dataLink` · any unlisted `extra_data` key · infrastructure details (hostnames, table names, file paths).

The allow-list already excludes all of these. The redactor below is **defence in depth for free text**, where a staff member may have pasted something they should not have.

### 13.3 Redaction behaviour for free text

Applied to every free-text field, in order:

1. **URLs** → `[link removed]` (catches pasted Cloudinary/dashboard/portal links).
2. **Email addresses** → `[email removed]`.
3. **Long digit runs (≥ 9)** → `[number removed]` (phone numbers, account numbers, DHL 18-digit `Sendungsnummer`). Short codes and SKUs survive.
4. **Credential-shaped tokens** — `postgres://…`, `postgresql://…`, `AIza[0-9A-Za-z_-]{20,}`, `sk-…`, `Bearer …`, any `KEY=`/`SECRET=`/`TOKEN=`/`PASSWORD=` assignment, and any run of ≥ 32 base64/hex characters → `[redacted]`.
5. **Control characters** stripped; whitespace collapsed.
6. **Truncate** to the per-field cap, appending `…[truncated]` so the model knows text was cut.

Redaction is **replacement, never deletion** — the placeholder keeps the sentence intelligible and tells the model something existed there.

### 13.4 A final assertion before the request leaves the process

`assertNoSecrets(payload)` — serialize the outgoing payload and fail closed (throw, log server-side, return a generic error to the user) if it matches any credential pattern **or contains the literal value of any of `DATABASE_URL`, `AUTH_SECRET`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, or the Gemini key**. This is the same instinct as `verify-historical-audio.ts`'s existing "manifest contains no credential-like strings — secret scan clean" check, which already passes today.

Symmetrically, on the way back: any `relatedHistoricalIssues[].issueId` not in the set actually sent is **dropped**, and `areasToCheck[].area` not in `SYSTEM_LOCATION_MAP` is **dropped**. The model cannot introduce an Issue ID or a system location that was not given to it.

---

## 14. Attachment / Image / Audio Policy

**PROPOSED DESIGN — Phase A sends NO attachment content of any kind. Recommendation: conservative, and explicit.**

| Option | Phase A verdict |
|---|---|
| Send no files | **YES — this is the recommendation** |
| Send text metadata only | **Only a count**, e.g. `"attachments: 2 images, 1 voice recording"`, so the model can say "photographic evidence exists — review it". No filenames (staff-authored, may contain names), no URLs, no `public_id` |
| Send images for vision analysis | **NO in Phase A.** FUTURE OPTIONAL IDEA |
| Send audio for transcription | **NO in Phase A.** FUTURE OPTIONAL IDEA |

Reasons: Cloudinary URLs are effectively unguessable credentials to the asset and must never leave the server; images of warehouse/label/screen content are the most likely place for incidental customer and supplier personal data, which no text redactor can catch; the historical voice recordings are **Super Admin-only evidence** (`ASSIGNEE_VISIBLE_SOURCES` excludes `"historical"`) and routing them through an assignee-triggered AI call would quietly bypass a deliberate, tested access decision; and audio/image tokens dominate cost and latency for unproven benefit.

> **Phase A must ignore attachment content entirely, sending at most an anonymous count.** Revisit only after Phase A has been in real use, and only under a separate owner decision (§29).

---

## 15. API Key / Environment Security Design

**PROPOSED DESIGN.**

- **Variable name: `GEMINI_API_KEY`** — matches what `new GoogleGenAI({})` reads by default per the official quickstart, so no key is ever passed through application code as a literal.
- **Not added in this stage.** It does not exist locally or in Vercel today (verified: Production has only `DATABASE_URL`, `AUTH_SECRET`, and the three Cloudinary variables).
- Rules, matching the existing Cloudinary convention exactly:
  - server-side only, read **only** inside `lib/ai/geminiClient.ts`, which imports `server-only`;
  - **never** `NEXT_PUBLIC_*` (Next.js inlines those into client bundles);
  - never returned to the client, never in an action's return value, never in an error message;
  - **never logged** — the client must log error *codes and statuses*, never the request config;
  - never committed (`.env*` is gitignored) and never stored in PostgreSQL;
  - checked **lazily inside the call path**, not at module load — the same discipline `lib/db.ts` and `lib/session.ts` already use so `next build` cannot break in an environment without it. Missing key ⇒ the feature reports "AI assistance is not configured" (§21) and the rest of the page is unaffected.
- **Local:** add to `postage-workspace/.env.local` with the same "Server-side only. Never prefix with NEXT_PUBLIC_." comment block used for Cloudinary.
- **Vercel:** `vercel env add GEMINI_API_KEY production` (and `preview` only if AI is wanted on preview deployments — recommended **not**, to limit exposure). Mark **Sensitive**, as the five existing variables are. Use a **separate key per environment** so a preview leak cannot be replayed against production quota, and so either can be rotated independently.
- Rotation: keys are rotated in the Google AI Studio console and updated in Vercel; no code change, no redeploy of secrets in source.

---

## 16. Free Tier vs Paid Tier

**CURRENT VERIFIED FACT.** Google's own API Terms state, for the Unpaid Services:

> "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services"
> "Human reviewers may read, annotate, and process your API input and output."
> **"Do not submit sensitive, confidential, or personal information to the Unpaid Services."**

The pricing page confirms the split: free tier "Content used to improve our products: **Yes**"; paid tier "**No**", with prompts logged only briefly for abuse detection and legal obligation, under the Data Processing Addendum.

Issue content in this system routinely includes supplier problems, SKUs, inventory and warehouse detail, operational failures, staff references, customer-related information and internal company process — i.e. exactly the categories the terms tell you not to submit to the Unpaid Services.

### Verdict

> **Free tier suitable for this company's real Issue data: NO.**
> **Paid tier (billing enabled, Tier 1 or above): REQUIRED.**

The practical reason is **not** cost — the estimate is ~$23/month at 50 analyses/day. It is that the free tier grants Google a licence to use LEDSone's operational content for product development **and permits human review of it**. That is a commercial confidentiality decision, and it cannot be mitigated by sanitization: even perfectly sanitized Issue text is confidential business information.

Free tier is acceptable **only** for development against synthetic/fabricated Issues, and that boundary should be written down, not assumed.

---

## 17. Timeout / Retry / Rate-Limit Design

**PROPOSED DESIGN.**

| Parameter | Value | Rationale |
|---|---|---|
| Request timeout | **45 s**, via `AbortSignal.timeout(45_000)` on the call **and** `httpOptions.timeout` | A Flash model with thinking over ~3k tokens should land in single-digit seconds; 45 s absorbs a slow tail without holding a Server Action open indefinitely. Set both: js-genai issue #1277 reports `httpOptions.timeout` being ineffective on some call paths, so `AbortSignal` is the guarantee |
| Max retries | **2** (3 attempts total) | Beyond this the user is waiting too long; show the error and let them retry deliberately |
| Backoff | Exponential with jitter: **1 s → 2 s**, ±25% | Matches Google's documented guidance ("1 second, then 2s, 4s, 8s") |
| Total wall-clock budget | **~90 s** hard ceiling across all attempts | Bounds the Server Action |
| **Retry:** `429`, `500`, `503`, `504`, network/socket errors, abort-on-timeout | Yes | Documented as transient/retryable |
| **Do NOT retry:** `400`, `401`, `403`, `404`, `409`, `416`, `501` | No | Documented client errors — "Do not retry on client errors (like 400 or 403)"; retrying wastes quota and hides the real fault |
| `429` specifically | Retry twice with backoff, then **stop**. Do **not** fail over to the fallback model on the first 429 — a project-level quota is likely shared. Surface "AI assistance is busy right now. Please try again in a few minutes." | Avoids amplifying a quota problem |
| `503` (overloaded) | Retry once, then **one** attempt on `gemini-3.5-flash-lite`, with the response banner-labelled (§3) | Availability failover |
| Malformed / schema-invalid response | **One** repair attempt (resend with "Your previous response was not valid JSON matching the schema; return only valid JSON"), then fail cleanly. Never render unvalidated output | Structured output is not guaranteed |
| Safety block / refusal (`safety`, `prohibited_content`, `spii`, `blocklist`, `recitation`, `content_blocked`) | **Never retry.** Show a specific, non-alarming message and log the blocked-reason code server-side | Retrying a content block is futile and looks like probing |
| Application-side rate limit | **10 analyses per assignee per hour**, in-memory per server instance, plus **1 concurrent analysis per assignee** | Protects the shared API quota and the budget from a click-loop. In-memory is imperfect across serverless instances but needs no schema change; a shared limiter is a FUTURE OPTIONAL IDEA |
| SDK auto-retry | Note that the official SDKs "include automatic retry logic with exponential backoff by default" — **measure it before layering our own**, or the effective wait becomes the product of both | Avoid double-retry |

**User-facing error text** is generic and actionable; internal codes, model names, prompts and request bodies are logged server-side only (§21).

---

## 18. Suggested UI Changes

**PROPOSED DESIGN. Nothing is changed in this stage.**

### One panel, not three buttons — recommended: **Option B**

Three separate top-level buttons ("Analyse with AI", "Suggest Resolution", "Find Similar Issues") would mean three actions, three permission checks, three failure surfaces and three prompts producing overlapping output — for a single underlying operation. **One `AI Assistant` panel with one primary action** is cleaner, cheaper (one API call instead of three), and easier to keep safe.

"Suggested Fix" and "Similar Past Issues" are already *fields of the single structured response* (§7). They are **sections of the result**, not separate features.

```
┌─ AI ASSISTANT ───────────────────────────────────── advisory ─┐
│  Advisory only. Nothing here is saved or changes this Issue.  │
│                                              [ Analyse with AI ]│
├───────────────────────────────────────────────────────────────┤
│  ⚠  AI-generated. Verify before acting.        Confidence: MEDIUM│
│                                                                │
│  Summary                                                       │
│  Likely Root Causes        ← cause · Why this is likely · conf. │
│  Where To Check            ← area · what to look for           │
│  Investigation Steps       ← ordered list                      │
│  Suggested Fix             ← labelled "AI Suggested Fix"       │
│  Alternative Solutions                                         │
│  Similar Past Issues       ← ID + title + why similar,          │
│                              PLAIN TEXT, not links (§12)        │
│  Warnings                  ← always at least one               │
│                                                                │
│  Generated <time> · gemini-3.6-flash · not saved  [ Clear ]     │
└────────────────────────────────────────────────────────────────┘
```

- Placed **below** `IssueWorkProgress`, so the assignee's own work fields stay above the fold and the AI panel reads as a consultation, not an instruction.
- Every element is **read-only**. The only controls are *Analyse with AI* and *Clear*.
- Visual language must differ from the workflow cards (e.g. a distinct border/tint plus a persistent "advisory" chip) so an AI suggestion is never mistaken for a recorded fact.
- Section headings state the recommended labels: **Summary · Likely Root Causes · Why This Is Likely · Where To Check · Investigation Steps · Suggested Fix · Alternative Solutions · Similar Past Issues · Confidence · Human Verification Warning**.
- **Super Admin sees none of this** (§7 of the security design) — the panel does not render, and the action refuses independently.

---

## 19. "Suggest Resolution" Safety

**PROPOSED DESIGN.** The AI may *suggest* a resolution. It must never *record* one.

The action performs **no database write of any kind** — not to `issues`, not to `issue_comments`, not to `issue_status_history`. It must not call `updateIssueStatus`, `recordIssueProgress`, or `revalidatePath`. Nothing in `lib/queries/issueStatus.ts` or `lib/queries/issueWorkProgress.ts` is imported by the AI module. That absence is the guarantee, and a test asserts the import graph.

Concretely the AI must **not**: write `final_resolution`, set GREEN, set `completed_at`/`completed_date`, submit a status transition, write `implementation_done` or `implementation_progress`, or change priority or assignment.

**Separation in the UI:**

- The AI's text is headed **"AI Suggested Fix (not saved)"**, inside the AI panel, visually distinct.
- The assignee's own **Final Resolution** stays exactly where it is today — inside `IssueWorkProgress`, written only by `updateIssueStatusAction`, with the existing `validateTransitionWorkDetails` requirements intact.
- **PROPOSED, optional:** a "Copy to clipboard" control. It copies text and nothing more — it must **not** prefill the Final Resolution textarea. Prefilling converts "the assignee decided" into "the assignee pressed Save", which is precisely the failure mode this section exists to prevent. If the owner wants prefill, it must be a separate decision with an explicit "edited from AI suggestion" marker.
- The GREEN transition rules are untouched: Implementation Done and Final Resolution remain required, human-entered fields.

---

## 20. Suggested Database Changes

> **Database migration needed for Phase A: NO.**

**PROPOSED DESIGN.** Phase A is entirely transient:

- generate on demand, in a Server Action;
- hold the result in React state (`useActionState`) only;
- **do not** persist to PostgreSQL, cookies, `localStorage`, or the Next.js cache;
- no `revalidatePath()` — nothing changed;
- navigating away or refreshing discards it, which is *correct*: a stale AI opinion presented alongside newer human work is actively misleading.

Retrieval (§10) reads only existing columns. Sanitization is pure code. The permission is a TypeScript string-union member, not a database row. **Nothing in Phase A requires DDL.**

**FUTURE OPTIONAL IDEA — `issue_tracking.ai_analysis_history`.** Only if the owner later wants auditability ("what did the AI say before the assignee closed this?") or usage analytics. Sketch only, no SQL written: `analysis_id`, `issue_id` FK, `requested_by_user_id`, `assignee_id`, `model`, `prompt_hash`, `response_jsonb`, `created_at`. It would introduce a retention question (AI text about Issues, held indefinitely), a PII question, and a migration — which is exactly why it is not Phase A.

---

## 21. Error / Fallback Handling

**PROPOSED DESIGN.** Non-negotiable rule: **the Issue detail page must work normally when AI is unavailable.** The AI panel is an isolated, additive card; every failure is contained inside it. AI failure never blocks viewing an Issue, changing status, recording progress, or writing a final resolution.

| Condition | User sees | Server does |
|---|---|---|
| `GEMINI_API_KEY` missing | "AI assistance is not configured. Contact your administrator." Button disabled | Log once at startup of the call path; **never name a value** |
| Gemini unavailable (`503` after retries) | "AI assistance is temporarily unavailable. Please try again shortly." | Log status + attempt count |
| Rate limit (`429` after retries) | "AI assistance is busy right now. Please try again in a few minutes." | Log; do not fail over |
| App-side per-assignee limit | "You have reached the hourly limit for AI analysis (10 per hour)." | No API call made |
| Timeout | "The analysis took too long and was stopped. Please try again." | Log elapsed ms |
| Invalid / unparseable response | "The AI response could not be read. Please try again." | Log the validation failure and a **truncated, redacted** excerpt — never the full response |
| Safety block / refusal | "The AI declined to analyse this Issue. Please investigate manually." | Log the blocked-reason code |
| No similar Issues found | Section renders "No similar past Issues found." Analysis still shown | Normal path |
| Insufficient Issue context (e.g. description < 20 chars) | "This Issue does not contain enough detail for a useful analysis." Button disabled with reason | **No API call** — do not spend tokens on an empty prompt |
| Auth/ownership failure | "Issue not found or not assigned to you." — identical wording either way | Log; never confirm existence |
| Any unexpected error | "Could not complete the analysis. Please try again." | `console.error` with context, matching `toActionError()` in `status-actions.ts` |

No error message ever contains a stack trace, a prompt, a model response, an internal URL, an env-var value, or an SQL fragment.

---

## 22. Testing Plan

**PROPOSED DESIGN.** New tests follow the existing `tests/*.test.ts` convention (`tsx --test`, `node:test`, `node:assert/strict`), plus one read-only verification script matching `scripts/verify-*.ts`.

### SECURITY — `tests/aiPermissions.test.ts`
- Assignee holds `issue:analyse_own_assigned`; **Super Admin (`admin`) does NOT**; `management` does not; `null` role does not.
- `resolveIssueDetailView` returns `showAiAssistant: true` **only** for the assignee branch; `false` for `admin` and `other` — exhaustive over all four input combinations.
- The permission matrix's "holds exactly that set" assertions are updated so the new key cannot be added to `admin` unnoticed.
- Crafted-request tests: a forged `issueId` for another assignee's Issue ⇒ refused with the "not found or not assigned to you" wording; an unlinked staff account (scope `none`) ⇒ refused; unauthenticated ⇒ refused; a client-supplied assignee id is ignored (session-derived only).
- **API key never client-visible:** assert `lib/ai/geminiClient.ts` imports `server-only`; assert no `NEXT_PUBLIC_*` reference to it anywhere; grep the built client chunks for the literal key value in the verification script.
- Import-graph test: the AI module must not import `issueStatus.ts` or `issueWorkProgress.ts` write helpers (§19).

### SANITIZATION — `tests/aiSanitization.test.ts`
- Every allow-listed field is included when present; every prohibited field is absent — asserted against a fixture containing **all 19 real `extra_data` keys**, so `member`, `sourceFile`, `dataLink`, `images`, `attachments`, `originalOwner` are all proven stripped.
- `extra_data` is never forwarded wholesale: adding an unknown key to the fixture must not change the output.
- Redaction: URLs, emails, ≥9-digit runs, `postgres://`, `AIza…`, `Bearer …`, `SECRET=`, long base64 → replaced.
- Truncation applies at the documented caps and appends the marker.
- `assertNoSecrets` throws when a fixture contains the literal value of a monitored env var.
- Adding a field to `IssueDetail` does not leak it (allow-list-by-construction test).

### AI RESPONSE — `tests/aiResponseSchema.test.ts`
- Valid response parses; missing required field rejected; wrong type rejected; extra properties rejected.
- Arrays beyond `maxItems` rejected or clamped; strings beyond caps clamped.
- `confidence` outside `LOW|MEDIUM|HIGH` rejected.
- **Hallucinated `issueId`** not in the supplied set is dropped; hallucinated `area` not in `SYSTEM_LOCATION_MAP` is dropped.
- `warnings` is non-empty **always** — including when the model omits it (the standard warning is injected).

### HISTORICAL RETRIEVAL — `tests/aiSimilarity.test.ts` + `scripts/verify-ai-context.ts`
- Scoring ranks same-SKU above same-category above keyword-only.
- Zero matches returns `[]` cleanly.
- The 5-Issue cap is enforced and truncation is logged, never silent.
- Cross-assignee policy: whichever option is approved is asserted; sensitive columns are absent from the projection.
- Keyword extraction escapes `%`/`_` (reuses `escapeLikePattern`) — the existing `tracker.test.ts` injection-string fixtures are a good model.
- The verification script asserts **read-only**: table counts before and after are identical, exactly as `verify:scope` and `verify:historical-audio` already do.

### ERRORS — `tests/aiClientBehaviour.test.ts` (injected fake transport, no network)
- `429` → 2 retries with growing delay → clean error, no fallback.
- `503` → retry → fallback model → banner flag set.
- `500`/`504`/network error → retried; `400`/`403` → **not** retried.
- Timeout aborts at the budget and returns the timeout state.
- Malformed JSON → one repair attempt → clean failure.
- Safety block → no retry, specific message, code logged.

### REGRESSION — existing suites must stay green unchanged
- All 442 current tests pass unmodified.
- Status workflow, transition rules, final-resolution requirements unchanged (`assigneeWorkflow`, `issueWorkDetails`, `issueStatusLabels`).
- Super Admin markup unchanged (`issueDetailMarkup.test.ts` — extend `FORBIDDEN_HEADINGS` with "AI Assistant").
- `npm run verify:scope` and `verify:historical-audio` still report "nothing was written".
- Assignments unchanged; **no DB writes on any AI path** (row counts before/after).
- With `GEMINI_API_KEY` unset, the Issue detail page renders and every existing control works.

---

## 23. Estimated Complexity

| Phase | Complexity | Effort (dev-days) | What drives it |
|---|---|---|---|
| 1 — Sanitization + schema | **MEDIUM** | 1.5–2.5 | Not the code — the *judgement*. 19 `extra_data` keys to classify, redaction patterns to get right, and an exhaustive test fixture. This is where the privacy guarantee is actually won |
| 2 — Historical retrieval | **MEDIUM** | 1–2 | Scoring SQL, keyword extraction with safe escaping, cross-assignee policy, read-only verification script |
| 3 — Gemini server client | **MEDIUM** | 1–2 | SDK call shape must be re-verified live (§4 caveat); retry/backoff/timeout interacting with SDK auto-retry; structured-output validation; injectable transport for tests |
| 4 — Permission + Server Action | **LOW** | 0.5–1 | The existing pattern is excellent; one `Permission` member, one view flag, one action modelled on `status-actions.ts` |
| 5 — AI Assistant UI | **LOW–MEDIUM** | 1–1.5 | Read-only rendering is easy; making "advisory, not saved" unmistakable is the real work |
| 6 — Hardening + full tests | **MEDIUM–HIGH** | 2–3 | The full §22 matrix, rate limiting, secret-scan verification, error-path coverage |
| 7 — Embeddings | **HIGH** | not estimated | **Blocked**: pgvector unavailable on this server (§11) |

**Phases 1–6 total: ≈ 7–12 developer-days.** Highest-risk items: (a) the Gemini API surface differing from documentation at implementation time, (b) sanitization completeness, (c) keeping the Super Admin page provably unchanged.

---

## 24. Exact Files Likely to Change

Paths are relative to `postage-workspace/`. **PROPOSED — none created or modified in this stage.**

### NEW FILES

| Path | Purpose |
|---|---|
| `lib/access/aiSanitization.ts` | `sanitizeIssueForAi`, `sanitizeHistoricalIssueForAi`, redaction, `assertNoSecrets`. Pure — no `server-only`, no DB, no network (matches `lib/access/*` discipline) |
| `lib/ai/analysisSchema.ts` | `AiIssueAnalysis` types, the JSON Schema literal, `parseAiAnalysis()` validator |
| `lib/ai/systemLocations.ts` | Frozen `SYSTEM_LOCATION_MAP` allow-list (§9) |
| `lib/ai/prompt.ts` | Prompt construction from sanitized context. Pure, testable |
| `lib/ai/geminiClient.ts` | `server-only`. The **only** file reading `GEMINI_API_KEY`; model constant, timeout, retry/backoff, fallback, injectable transport |
| `app/dashboard/issues/ai-actions.ts` | `"use server"` — `analyseIssueWithAiAction()`, authorization gate, orchestration |
| `lib/queries/issueSimilarity.ts` | `server-only` — `findSimilarIssuesForAi()` |
| `components/issues/IssueAiAssistant.tsx` | `"use client"` — the read-only panel |
| `scripts/verify-ai-context.ts` | Read-only verification: sanitized payload contains no secrets/PII, retrieval is scoped as approved, **no rows written** |
| `tests/aiSanitization.test.ts`, `tests/aiResponseSchema.test.ts`, `tests/aiPermissions.test.ts`, `tests/aiSimilarity.test.ts`, `tests/aiClientBehaviour.test.ts` | §22 |

### MODIFIED FILES

| Path | Change |
|---|---|
| `lib/access/permissions.ts` | Add `"issue:analyse_own_assigned"` to the `Permission` union and to the `staff` set **only** — explicitly *not* to `admin` |
| `lib/access/issueDetailView.ts` | Add `showAiAssistant` to `IssueDetailView` and `NOTHING_EXTRA`; `true` on the assignee branch only |
| `app/dashboard/issues/[issueId]/page.tsx` | Render `<IssueAiAssistant>` behind `view.showAiAssistant`. One conditional block; nothing existing altered |
| `tests/access.test.ts` | Extend the exhaustive per-role assertions |
| `tests/issueDetailView.test.ts` | Assert the new flag across all input combinations |
| `tests/issueDetailMarkup.test.ts` | Add "AI Assistant" to `FORBIDDEN_HEADINGS` for the Super Admin |
| `package.json` | Add `@google/genai`; add `"verify:ai-context"` script |
| `.env.local` (local, gitignored) + Vercel env | Add `GEMINI_API_KEY` — **not in this stage** |

### NO-TOUCH FILES

| Path | Why |
|---|---|
| `components/issues/IssueDetail.tsx` | Shared with the Super Admin's frozen page. `issueDetailMarkup.test.ts` guards it |
| `components/tracker/*` (`TrackerTable`, `TrackerStaffTable`, `TrackerIssueDetail`, `TrackerTimeline`, `TrackerFilters`, `TrackerKpiStrip`) | Tracker is Super Admin observation; AI has no place in it |
| `app/dashboard/tracker/**` | Same |
| `lib/queries/tracker.ts` | Same; guarded by `verify:scope` |
| `lib/queries/issueStatus.ts`, `lib/queries/issueWorkProgress.ts` | The status/work **writers**. AI must never import their write paths |
| `app/dashboard/issues/status-actions.ts`, `assign-actions.ts`, `delete-actions.ts` | Existing mutation surface — unchanged |
| `migration/*.sql` | No migration in Phase A. Never edit an applied migration |
| `components/discussions/**`, `app/dashboard/discussions/**`, `lib/queries/discussion*.ts` | Unrelated module |
| `lib/db.ts`, `lib/auth.ts`, `lib/session.ts`, `proxy.ts` | Working, tested auth/DB core. AI composes with these; it does not modify them |
| `lib/cloudinary.ts`, `lib/access/attachments.ts` | No attachment handling in Phase A |
| `scripts/verify-issue-scope.ts`, `scripts/verify-historical-audio.ts`, `scripts/verify-issue-work-progress.ts` | Existing verification gates must keep passing **unmodified** — that is their value |

---

## 25. Implementation Stages

**PROPOSED DESIGN.** Each phase is independently shippable and independently verifiable. Phases 1–2 touch no external service and change no user-visible behaviour.

### PHASE 1 — Sanitization helpers + response schema
- **Goal:** the privacy guarantee, in pure testable code, before anything can call an API.
- **Files:** NEW `lib/access/aiSanitization.ts`, `lib/ai/analysisSchema.ts`, `lib/ai/systemLocations.ts`, `tests/aiSanitization.test.ts`, `tests/aiResponseSchema.test.ts`.
- **DB impact:** none. **User-visible:** none.
- **Gate:** `npm test` green (442 + new); a fixture with all 19 real `extra_data` keys proves every prohibited field is stripped; `npm run lint`, `npm run build` clean.

### PHASE 2 — Read-only historical retrieval
- **Goal:** "Similar Past Issues" selection, with the approved cross-assignee policy.
- **Files:** NEW `lib/queries/issueSimilarity.ts`, `tests/aiSimilarity.test.ts`, `scripts/verify-ai-context.ts`; MODIFIED `package.json` (script only).
- **DB impact:** reads only — **no migration**. **User-visible:** none.
- **Gate:** `verify:ai-context` shows identical row counts before/after and no secrets in the sanitized payload; `verify:scope` still passes.
- **Blocked on:** owner decision on §12.

### PHASE 3 — Server-side Gemini client
- **Goal:** one server-only module that can produce a validated `AiIssueAnalysis`.
- **Files:** NEW `lib/ai/geminiClient.ts`, `lib/ai/prompt.ts`, `tests/aiClientBehaviour.test.ts`; MODIFIED `package.json` (`@google/genai`).
- **DB impact:** none. **User-visible:** none (no UI yet).
- **Gate:** all error paths covered with an injected fake transport (no network in tests); **re-verify the live SDK call shape against the official quickstart and structured-output pages before writing this** (§4 caveat); manual smoke test against a **paid-tier** key using a fabricated Issue only.
- **Blocked on:** owner approval of paid tier (§16) and key provisioning (§15).

### PHASE 4 — Assignee-only permission + Server Action
- **Goal:** authorization and orchestration, still with no UI.
- **Files:** MODIFIED `lib/access/permissions.ts`, `lib/access/issueDetailView.ts`, `tests/access.test.ts`, `tests/issueDetailView.test.ts`; NEW `app/dashboard/issues/ai-actions.ts`, `tests/aiPermissions.test.ts`.
- **DB impact:** none. **User-visible:** none.
- **Gate:** Super Admin proven not to hold the permission and `showAiAssistant` proven false for `admin`; crafted-request tests pass; import-graph test proves no write-path import.

### PHASE 5 — AI Assistant UI
- **Goal:** the read-only panel, assignee portal only.
- **Files:** NEW `components/issues/IssueAiAssistant.tsx`; MODIFIED `app/dashboard/issues/[issueId]/page.tsx`, `tests/issueDetailMarkup.test.ts`.
- **DB impact:** none. **User-visible:** **first visible change** — one new card for assignees.
- **Gate:** Super Admin markup contains no "AI Assistant"; page fully functional with `GEMINI_API_KEY` unset; all five commands green.

### PHASE 6 — Hardening + complete tests
- **Goal:** production-ready failure behaviour.
- **Files:** MODIFIED `lib/ai/geminiClient.ts`, `ai-actions.ts`, `IssueAiAssistant.tsx`; EXTENDED test suites; `scripts/verify-ai-context.ts`.
- **DB impact:** none. **User-visible:** better error messages, per-assignee rate limiting.
- **Gate:** the full §22 matrix; secret scan over built client chunks; `npm test`, `verify:scope`, `verify:historical-audio`, `verify:ai-context`, `lint`, `build` all green; only then deploy.

### PHASE 7 — Embeddings / vector similarity (OPTIONAL, FUTURE)
- **Currently blocked:** pgvector is not available on this database server (§11). Revisit only under the three stated conditions.

---

## 26. Risks and Limitations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **The corpus has 1 genuinely resolved Issue.** "Learn from past resolutions" is largely aspirational today | **HIGH** | "Similar Past Issues" wording; prompt states past fixes are unconfirmed intake hypotheses (§10.2). Re-evaluate value after ~50 completed Issues |
| R2 | **Confident-sounding wrong answers.** An assignee may act on a fabricated root cause | **HIGH** | Mandatory `warnings`; `whyLikely` per cause; LOW/MEDIUM/HIGH not percentages; persistent advisory chip; no auto-write anywhere |
| R3 | **Confidential data reaching a free tier** | **HIGH** | Paid tier mandated (§16); sanitization allow-list; `assertNoSecrets` before send |
| R4 | **Hallucinated Issue IDs / system locations** | MEDIUM | Server-side allow-list filtering of `relatedHistoricalIssues` and `areasToCheck` (§13.4) |
| R5 | **Gemini API surface drift.** The docs show an Interactions API differing from the older `generateContent` shape | MEDIUM | Pin the SDK version; re-verify the call shape at Phase 3; isolate all API contact in one file |
| R6 | **Model deprecation** | LOW | `gemini-3.6-flash` has no announced shutdown; Google gives advance notice; model pinned in one constant |
| R7 | **Cross-assignee data exposure** | MEDIUM | Owner decision (§12) + hard field allow-list + non-clickable IDs |
| R8 | **Cost or quota surprise** | LOW | ~$0.015/analysis; per-assignee hourly cap; no batch/background calls; free tier explicitly not used |
| R9 | **Latency frustration** | LOW | Explicit pending state; 45 s cap; the page is fully usable meanwhile |
| R10 | **Scope creep into the Super Admin portal** | MEDIUM | Permission excluded from `admin`; `resolveIssueDetailView` admin branch returns `NOTHING_EXTRA` first; markup test forbids the heading |
| R11 | **Assignee de-skilling** — investigation replaced by acceptance | MEDIUM | Output is guidance ("where to check", "steps"), never a one-click answer; no prefill of Final Resolution (§19) |
| R12 | **Rate limits are not published per model**; they must be read from AI Studio | LOW | Read the project's actual limits before Phase 6; treat `429` as expected, not exceptional |
| R13 | **pgvector unavailable** blocks Phase 7 | LOW | Documented; Phase A does not need it |
| R14 | **In-memory rate limiting is per-instance** on serverless | LOW | Accepted for Phase A; a shared limiter would need a schema change |

---

## 27. No-Touch Files

Consolidated for review convenience — see §24 for reasons: `components/issues/IssueDetail.tsx` · all of `components/tracker/**` · `app/dashboard/tracker/**` · `lib/queries/tracker.ts` · `lib/queries/issueStatus.ts` and `lib/queries/issueWorkProgress.ts` (write paths) · `app/dashboard/issues/status-actions.ts`, `assign-actions.ts`, `delete-actions.ts` · `migration/*.sql` · `components/discussions/**`, `app/dashboard/discussions/**`, `lib/queries/discussion*.ts` · `lib/db.ts`, `lib/auth.ts`, `lib/session.ts`, `proxy.ts` · `lib/cloudinary.ts`, `lib/access/attachments.ts` · `scripts/verify-issue-scope.ts`, `scripts/verify-historical-audio.ts`, `scripts/verify-issue-work-progress.ts`.

---

## 28. Assignee-Only Security Design (detail)

**PROPOSED DESIGN.** Three independent layers; each alone is sufficient to deny.

1. **Permission.** New key `issue:analyse_own_assigned`, added to `staff` **only**. Not `admin`, not `management`. Because `ROLE_PERMISSIONS` is an explicit literal table with no inheritance (DECISION-001), the Super Admin cannot acquire it by being "higher".
2. **Ownership.** `getIssueAccessScope(user)` must return `kind === "assignee"`; the Issue is then loaded with `getIssueById(issueId, scope)`, whose SQL predicate requires a **current** assignment to that `assignee_id`. An unlinked or inactive assignee resolves to `none` and matches nothing. The assignee id comes from the session — never from the form, never from a query parameter (`effectiveAssigneeFilter` already encodes this anti-tampering rule).
3. **UI gating.** `resolveIssueDetailView().showAiAssistant` — defence in depth, explicitly *not* the guard.

**Against crafted server requests:** Server Actions are POST endpoints with framework-generated action IDs, but they must never be *assumed* unreachable. Therefore: the action re-authenticates from the cookie on every call; `issueId` is shape-validated then used only as a bind parameter; ownership is proven by SQL, not by a client claim; the failure message is identical for "does not exist" and "belongs to someone else"; the per-assignee rate limit is keyed on the **session-derived** assignee id; and no client-supplied Issue *content* is ever accepted — only an ID, with the content re-fetched server-side. A forged request from another assignee therefore reaches exactly the same refusal as a URL-tampering attempt today.

**Super Admin:** the panel does not render **and** the action refuses. Should the owner later want Super Admin AI access, it is a separate decision and a separate permission key (e.g. `issue:analyse_any`) — never a widening of the assignee key.

---

## 29. Owner Decisions Required

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| **D1** | **Approve paid Gemini API usage** (billing enabled, Tier 1+). Free tier permits Google to use content for product development and permits human review | **Approve.** ≈$23/month at 50 analyses/day. Free tier is unusable for real Issue data | Phases 3–6. **Hard blocker** |
| **D2** | **Cross-assignee historical retrieval** — Option A (whole sanitized corpus) or Option B (only the assignee's own Issues) | **Option A** with the six constraints in §12. Option B returns nothing useful today (2 assigned Issues of 146) | Phase 2 |
| **D3** | **UI wording:** "Similar Past Issues" vs "Previous Resolved Issues" | **"Similar Past Issues."** Only 1 Issue in the database is genuinely resolved | Phases 2, 5 |
| **D4** | **Transient results vs persistence** | **Transient** for Phase A — no migration, no retention question | Phase 5 (§20) |
| **D5** | **Attachment / image / audio analysis scope** | **Exclude entirely from Phase A**; at most an anonymous count | Phase 1 (§14) |
| **D6** | **Fallback model** — is a labelled, lower-capability answer acceptable on `503`? | **Yes**, `gemini-3.5-flash-lite`, availability-only, always banner-labelled | Phase 3 |
| **D7** | **Future embeddings (Phase B)** | **Defer.** Blocked anyway: pgvector unavailable on this server | Phase 7 |
| **D8** | **Confirm the real System Knowledge / Investigation Map labels** (§9). The seven entries here are a shape example, not confirmed company systems | Owner/Varmen to confirm the actual system names before Phase 1 | Phase 1 |
| **D9** | **Super Admin AI access** — excluded by default | **Keep excluded.** Revisit as a separate permission key if wanted | Phase 4 |
| **D10** | **Per-assignee rate limit** — 10/hour proposed | Confirm or adjust | Phase 6 |
| **D11** | **Is Gemini (a US-hosted third party) an acceptable processor** for this operational content at all, under LEDSone's own confidentiality expectations? | Owner/Varmen judgement. Technical controls cannot answer this | **Everything** |

---

## 30. Final Recommendation

**Gemini integration feasibility: CONDITIONAL — proceed, subject to D1, D2, D8 and D11.**

The architecture is unusually well suited to this. Authorization is already a pure, exhaustively-tested module; Issue access is already enforced in SQL rather than in the UI; there is already a single pure function deciding what each portal renders; and there is already a convention for server-only secrets that no browser bundle can reach. An assignee-only, read-only, non-persisting AI panel composes with all of that **without modifying any of it** — one new `Permission` member, one new boolean on an existing view resolver, one conditional block on one page, and a handful of genuinely new files. No migration, no schema change, no change to the Super Admin portal, no change to the status or resolution workflow.

Three things are genuinely conditional, and none is a code problem:

1. **The free tier cannot be used.** Google's own terms say not to submit confidential information to it, and this data is exactly that. Paid tier or nothing.
2. **The historical corpus is far thinner than the feature name implies** — 1 genuinely resolved Issue out of 146. The 125 intake-time "Fix & Action Required" texts and 100 `rootCause` entries make the feature worthwhile *today*, but only if the wording and the prompt are honest that these are prior hypotheses, not verified solutions. Overselling this is the fastest way to lose the assignees' trust in it.
3. **Cross-assignee retrieval is a policy call**, and it is the difference between a useful feature and an empty one.

Build it in the order given (§25), with sanitization first and the UI last, so the privacy guarantee is proven in tests before a single byte can leave the server. Keep it advisory: the moment AI output can write `final_resolution` or set GREEN, the audit trail stops being a record of what a human concluded — and that record is the thing this whole system exists to protect.

**Recommended immediate next step:** obtain decisions D1, D2, D8 and D11. Nothing should be built before D1 and D11.

---

*End of audit. No application code, database object, migration, dependency, environment variable or deployment was created or modified in producing this document.*
