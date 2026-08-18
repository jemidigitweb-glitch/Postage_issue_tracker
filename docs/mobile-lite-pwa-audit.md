# Warehouse Mobile Lite PWA — Stage 1 Read-Only Audit

**Date:** 2026-08-14
**Branch:** `feature/mobile-lite-pwa`
**Stage:** 1 — audit only. No application file, database row, migration, package or deployment was touched.
**Database identity confirmed:** `current_database = varmen_db`, `current_user = varmen_user`. Read-only throughout; no `CREATE/ALTER/DROP/TRUNCATE/INSERT/UPDATE/DELETE` was executed.

---

## 1. Existing frontend architecture

| Finding | Evidence |
|---|---|
| Next.js **16.2.10**, App Router, React 19.2.4, Turbopack | `postage-workspace/package.json`; build output `▲ Next.js 16.2.10 (Turbopack)` |
| TypeScript throughout, Tailwind CSS v4 (`@tailwindcss/postcss`) | `package.json` devDependencies, `postcss.config.mjs`, `app/globals.css` |
| Server Components by default; `"use client"` only where interaction demands it | e.g. `components/issues/VoiceRecorder.tsx:1`, `components/issues/AssignmentPanel.tsx:1` |
| No component library, no icon package — inline SVG | `components/shared/AppSidebar.tsx:89` comment, `components/issues/IssueAiAssistant.tsx` `SparkleIcon` |
| Routes present: `/`, `/login`, `/logout`, `/dashboard/**` | `app/` directory listing |

**There is no `/mobile` route today.** `app/` contains only `dashboard`, `login`, `logout`, `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`.

---

## 2. Existing backend architecture

- **No REST/GraphQL API routes for Issues.** There is no `app/api/**` directory. Every write is a **Server Action** (`"use server"`).
- Data access is centralised in `lib/queries/*.ts`, each importing `server-only`.
- All Postgres access goes through `lib/db.ts`:
  - `query()` and `getVerifiedClient()` both call `assertDatabaseIdentity()`, which **refuses to run unless `current_database() = 'varmen_db'` and `current_user = 'varmen_user'`** (`lib/db.ts:89-103`).
  - `getVerifiedClient()` returns a checked-out client for multi-statement transactions.
- Pure rule modules live in `lib/access/*.ts` with no `server-only`, no `next/*` and no DB import, so they are unit-testable (`tests/`).

**Call flow for any Issue write:** Client Component → Server Action (`app/dashboard/issues/*-actions.ts`) → `lib/queries/*.ts` → `lib/db.ts` → PostgreSQL.

---

## 3. Current Issue creation flow

**UI:** `app/dashboard/issues/new/page.tsx` → `app/dashboard/issues/new/NewIssueForm.tsx` (client).
**Server Action:** `createIssueAction` in **`app/dashboard/issues/new/actions.ts:166`**.

Ordered behaviour (`actions.ts:166-307`):

1. `getCurrentUser()`; reject if unauthenticated.
2. `hasPermission(user, "issue:create")`; reject otherwise.
3. Read and validate text fields.
4. Read files: `imageFiles`, `audioFiles`, `voiceRecording`.
5. `validateFileCount()` per kind.
6. If any attachment and `isAttachmentStorageConfigured()` is false → abort **before** creating anything.
7. `prepareFiles()` — reads each file into memory and validates **by its bytes**.
8. Upload each file via `uploadAttachment()`; on any failure `deleteAttachments()` rolls back the uploads already done.
9. Write `extra_data.images` (backward-compatible shape) and `extra_data.attachments` (richer, additive).
10. `createIssue()` (one transaction); on failure delete all uploaded assets.
11. `revalidatePath("/dashboard/issues")` then `redirect("/dashboard/issues/<id>")`.

**Design property worth reusing:** an Issue is never created with silently-missing evidence, and a failed submission leaves no half-complete Issue.

---

## 4. Issue ID generation

**Service:** `createIssue()` in **`lib/queries/issues.ts:553`**.
**Generator:** SQL function **`issue_tracking.next_issue_id(p_staff_code)`**, defined in `migration/006_next_issue_id_lazy_counter.sql:55`.

Flow inside one transaction (`issues.ts:553-608`):

1. `SELECT active FROM issue_tracking.issue_staff WHERE staff_code = $1` — unknown or inactive code raises `InvalidStaffError` **before** an ID is allocated.
2. `SELECT issue_tracking.next_issue_id($1)`.
3. `INSERT INTO issue_tracking.issues (...) VALUES ($1,…, 'RED', …, CURRENT_DATE, $8::jsonb)`.
4. `COMMIT`; any error → `ROLLBACK`.

### Concurrency safety — **YES**

`next_issue_id()` performs a **lazy `INSERT … ON CONFLICT DO NOTHING`** into `issue_tracking.issue_number_counters`, then an **atomic `UPDATE … SET next_number = next_number + 1 … RETURNING next_number - 1`** (`migration/006:65-75`). The row-level lock taken by that `UPDATE` serialises concurrent callers, so two simultaneous submissions cannot receive the same number. The migration header also records a fixed truncation bug in the old `lpad(…, 3, '0')` (it truncates at 4+ digits) — the current function no longer has it.

`issue_id` is additionally constrained by `chk_issue_staff_prefix`: `split_part(issue_id,'-',1) = staff_code`.

---

## 5. RED status and created date/time

| Value | How it is set | Evidence |
|---|---|---|
| `status = 'RED'` | **Hard-coded literal** in the INSERT — never read from the form | `lib/queries/issues.ts:587` |
| `created_date` | `CURRENT_DATE` in the INSERT | `lib/queries/issues.ts:587` |
| `created_at` | column default `now()` | `information_schema` |
| `updated_at` | column default `now()` | `information_schema` |
| Valid statuses | `CHECK (status IN ('RED','AMBER','GREEN'))` | `issues_status_check` |

No client value can override any of these — the action never reads a form key for them.

---

## 6. Minimum fields required to create an Issue

**Database NOT NULL columns (no default):** `issue_id`, `staff_code`, `issue_title`, `issue_description`, `category`, `created_date`.
Defaults supply `extra_data` (`'{}'`), `created_at`, `updated_at`. `status` is NOT NULL and always supplied as `'RED'` by the code.

**CHECK constraints that matter:**
- `issues_issue_title_check` — `btrim(issue_title) <> ''` → **title must be non-blank at the database level**
- `issues_category_check` — `btrim(category) <> ''` → **Domain must be non-blank**
- `issues_extra_data_check` — `jsonb_typeof(extra_data) = 'object'`
- **`issue_description` is NOT NULL but has no non-empty CHECK** — the empty string satisfies the database; only the application requires content.

**Application-level requirement** (`actions.ts:186`):
```
if (!staffCode || !title || !description || !category) → "Raised By, Title, Domain, and Description are all required."
```

| Field | Mandatory? | Enforced where |
|---|---|---|
| Raised By (`staff_code`) | **Yes** | app + FK + `chk_issue_staff_prefix` |
| Title | **Yes** | app + DB CHECK (non-blank) |
| Description | **Yes (app)** | app only; DB allows `''` |
| Domain (`category`) | **Yes** | app + DB CHECK (non-blank) |
| Priority | No | nullable |
| Fix & Action Required | No | nullable |
| extra_data fields | No | optional |

### Smallest safe FUTURE way for Mobile Lite to satisfy these without extra worker inputs

**Do not weaken any validation.** Instead have a thin Mobile Lite Server Action supply the four required values **server-side**:

- `title` — a generated, deterministic label, e.g. `Warehouse voice report — <date/time>`.
- `description` — a fixed sentence stating the evidence is the attached voice recording, e.g. `Voice report recorded in Warehouse Mobile Lite. The original recording and two evidence photos are attached.`
- `category` — a fixed Domain constant for this intake channel (owner decision; the field is free text today).
- `staff_code` — resolved from the signed-in session, **not** from the request body.

All four are constants or session-derived, so the worker still sees only Record / Photo 1 / Photo 2 / REGISTER. **This is a recommendation only — nothing has been implemented.**

---

## 7. Media management flow

**Validation (pure):** `lib/access/attachments.ts`
**Upload (server-only):** `lib/cloudinary.ts`
**Storage:** Cloudinary, signed server-side. Images → `image` resource type; audio → `video` resource type (`lib/cloudinary.ts:110-113`). Upload folder `issue-tracker/intake` (`cloudinary.ts:48`).
**Credentials:** `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`, read from `process.env`, never `NEXT_PUBLIC_`, never logged or returned. The browser never receives a key, signature or upload preset.
**Database metadata:** no media table. Everything is stored on the Issue in **`issues.extra_data`** (JSONB):
- `extra_data.images[]` — `{url, public_id, original_name}` (backward-compatible with 64 historical images)
- `extra_data.attachments[]` — `{type, url, public_id, original_name, mime_type, source, bytes}` (additive; **41 of 144** Issues already carry it)

**Association to the Issue:** attachments are uploaded first, then written into `extra_data` in the same `createIssue()` INSERT — so media is bound to the Issue at creation.

**Limits and types** (`lib/access/attachments.ts:23-65`):

| | Value |
|---|---|
| Image types | JPEG only — `.jpg`, `.jpeg`, magic bytes `FF D8 FF` |
| Audio extensions | `.mp3`, `.m4a`, `.mp4`, `.wav`, `.ogg`, `.oga`, `.webm` |
| Audio accept string | `audio/*,.mp3,.m4a,.mp4,.wav,.ogg,.oga,.webm` |
| Max image | 10 MB |
| Max audio | 25 MB |
| Max images per Issue | **10** |
| Max audio per Issue | **5** |

**Validation is byte-based, not MIME-based** (`validateFile()`, `attachments.ts:194`): size → extension → **magic-byte sniff**. `looksLikeAudio()` recognises ID3/MPEG sync, `RIFF…WAVE`, `OggS`, `…ftyp` (MP4/M4A), **EBML `1A 45 DF A3` (WebM/Matroska)** and `fLaC`. A file with no extension still passes if its bytes are valid — explicitly allowed for recorded blobs (`attachments.ts:211`).

**Error handling / cleanup:** upload failure → `deleteAttachments()` removes what already uploaded; Issue-insert failure → same, best effort, logged if it cannot complete. Orphaned storage is the only residual risk (cost, not corruption).

**Existing tests:** `tests/attachments.test.ts`, `tests/issueAudioAttachments.test.ts`, `tests/aiSanitization.test.ts`.

### Answers to the seven media questions

1. **Can the current media system already store audio?** **YES** — `AttachmentKind = "image" | "audio"`; audio routes to Cloudinary's `video` resource type.
2. **Which audio types are accepted?** The seven extensions above, decided by magic bytes: MP3, WAV, OGG/Opus, MP4/M4A, **WebM**, FLAC.
3. **Can browser-recorded audio be uploaded without backend changes?** **YES.** `components/issues/VoiceRecorder.tsx:34-48` records with `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` (iOS), names the file `voice-recording.<webm|m4a|ogg>`, and posts it as `voiceRecording`. Both container families are already accepted, and the action tags them `source: "voice_recording"`.
4. **Can two images be attached to one Issue?** **YES** — the cap is 10 images.
5. **Can 1 voice + 2 images attach to the same Issue?** **YES** — within both caps, in a single submission.
6. **Would all three be visible/downloadable from the Web Issue Tracker?** **YES.** Images render in `components/issues/IssueDetail.tsx` "IMAGES / ATTACHMENTS" (thumbnail links to the full asset). Audio renders in `components/issues/IssueAudioAttachments.tsx` with a native `<audio controls>`. Note the portal split: `includeHistorical` is true only for the Super Admin; Assignees see `ASSIGNEE_VISIBLE_SOURCES = ["upload","voice_recording"]`, which **includes** Mobile Lite recordings.
7. **Does the media system need changes for Mobile Lite?** **NO** for storage, validation, association and display. The only open question is whether photos captured on a phone are JPEG — see Warnings.

---

## 8. Authentication and session

| Element | Implementation | Evidence |
|---|---|---|
| Login page | `/login` — "Username or email" + Password | `app/login/page.tsx`, `app/login/LoginForm.tsx:13-45` |
| Login action | verifies with `bcrypt.compare`; single generic error; dummy-hash compare for timing | `app/login/actions.ts:43-69` |
| Session | signed **JWT cookie** via `jose`; default **7 days**, override `SESSION_MAX_AGE_SECONDS`; cookie name `session` (override `SESSION_COOKIE_NAME`) | `lib/session.ts:21-24, 84-92` |
| Identity resolution | `getCurrentUser()` re-reads role/active from `management_users` on every request — never trusts a role in the cookie | `lib/auth.ts` |
| Route protection | **`postage-workspace/proxy.ts`** (Next.js proxy/middleware) — cookie-presence check, redirect to `/login` | `proxy.ts:49-79` |
| Protected prefixes | `/dashboard/issues`, `/dashboard/discussions`, `/dashboard/tracker`, `/dashboard/account-settings` | `proxy.ts:49-52`, matcher `:76-79` |
| Roles | `staff` (Assignee) / `management` / `admin` (Super Admin) | `lib/access/permissions.ts:21` |
| Logout | sidebar form → `app/logout/actions.ts` | `components/shared/AppSidebar.tsx:84-108` |

### The one real authentication finding

**`issue:create` is held by `admin` and `management` only — NOT by `staff`** (`lib/access/permissions.ts:81-127`). Every existing warehouse-style login created so far is role `staff`.

So a warehouse worker signed in today **can authenticate but cannot create an Issue**. `/mobile` can reuse the existing session mechanism unchanged, but a decision is required on how the REGISTER action is authorised. Options, smallest first:

- **A.** Mobile Lite requires an account that already holds `issue:create` (i.e. workers use a `management`/`admin`-role login). No code change; wrong security posture — it grants full desktop authority.
- **B.** Add one new permission key (e.g. `issue:create_mobile`) granted to `staff`, and have only the Mobile Lite action check it. Additive to the matrix; no existing permission widens.
- **C.** Grant `issue:create` to `staff`. **Not recommended** — it would also unlock the desktop "New Issue" page and "+ New Issue" button for every Assignee.

**Recommendation: option B.** No new users, no credentials, no password provisioning, no role change to any existing account. Owner approval required before implementation.

---

## 9. Recommended Mobile Lite route and folder

| | Proposal |
|---|---|
| Route | **`/mobile`** (plus `/mobile/registered` or an in-page confirmation state) |
| Folder | **`postage-workspace/app/mobile/`** with its own `layout.tsx` |
| Server Action | **`postage-workspace/app/mobile/actions.ts`** — thin; delegates to existing services |
| Outside the dashboard UI? | **Yes.** `app/dashboard/layout.tsx` and `DashboardLayout`/`AppSidebar` are only applied under `app/dashboard/**`; a sibling `app/mobile/` inherits only the root `app/layout.tsx`. |
| Existing layouts affecting it | Only `app/layout.tsx` (html/body + `metadata`). A `app/mobile/layout.tsx` can set mobile viewport/manifest without touching the desktop layout. |
| Proxy/middleware effect | **None today** — `proxy.ts` matches only the four `/dashboard/**` prefixes. Adding `/mobile/:path*` to `PROTECTED_PREFIXES` and `config.matcher` is a two-line additive change that leaves every existing prefix untouched. |
| Dashboard components | **Avoid** `DashboardLayout`, `AppSidebar`, `IssueTable`, `IssueDetail`, `AssignmentPanel`. **Safe to reuse (pure/shared):** `lib/access/attachments.ts`, `lib/cloudinary.ts`, `lib/queries/issues.ts` (`createIssue`), `lib/auth.ts`, `lib/session.ts`, and optionally the recording logic pattern from `VoiceRecorder.tsx`. |
| Isolation from Super Admin / Assignee portals | Different route subtree, different layout, no shared component, no change to `resolveIssueDetailView()` or the permission matrix. Mobile Lite writes through the *same services* but renders none of their UI. |

---

## 10. PWA audit

Searched the repository for a manifest, service worker, PWA package, icons and installability support.

- `postage-workspace/public/` contains only `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — Next.js starter assets. **No app icon, no `manifest.json`/`.webmanifest`, no `sw.js`, no service worker.**
- `package.json` contains **no** `next-pwa`, `@ducanh2912/next-pwa`, `serwist` or `workbox` dependency.
- `app/layout.tsx` declares `metadata` but **no `manifest` entry and no `viewport` export**.
- Camera helpers: none. Microphone/audio recording: **already exists** — `components/issues/VoiceRecorder.tsx` uses native `MediaRecorder` + `getUserMedia`, with a graceful fallback to a file input when unsupported (`VoiceRecorder.tsx:24, 41, 63-64, 125-136`).

**PWA SUPPORT CURRENTLY EXISTS: NO**
**NEW DEPENDENCY LIKELY REQUIRED: NO**

Everything Version 1 needs is browser-native or built into Next.js:
- Manifest → `app/manifest.ts` (Next.js App Router native route convention) or a static `public/manifest.webmanifest`.
- Icons → two PNGs (192×192, 512×512) added to `public/`.
- Standalone display → `"display": "standalone"` in the manifest; iOS additionally honours `apple-mobile-web-app-capable` via `app/mobile/layout.tsx` metadata.
- Camera → `<input type="file" accept="image/jpeg" capture="environment">`; no library.
- Microphone → the existing `MediaRecorder` approach.
- Offline/service worker → **out of scope for Version 1** (offline drafts are explicitly excluded). If installability alone is the goal, a service worker is not strictly required on Android/Chrome for the install prompt in current versions, but a minimal one may be added later if the owner wants it — that would be the only point a dependency (e.g. `serwist`) becomes worth considering, and it is **not** recommended now.

HTTPS is already satisfied in production (Vercel).

---

## 11. Database change decision

**DATABASE CHANGE REQUIRED: NO**

The existing `issue_tracking` schema supports Mobile Lite exactly as it stands:

- `issues` already holds everything an Issue needs; `next_issue_id()` already allocates IDs concurrency-safely; `status='RED'`, `created_date`, `created_at` are already automatic.
- Media needs no table: `extra_data` is JSONB with only a `jsonb_typeof = 'object'` constraint, and the `attachments` key is already in production use on **41 of 144** Issues.
- Audio is already an accepted attachment kind, already stored, already rendered.
- Assignment, workflow, history and comments are untouched by intake.

One prerequisite is **data**, not schema: `createIssue()` requires a valid, active `issue_staff` row whose `staff_code` prefixes the Issue ID. Mobile Lite must either reuse an existing Raised By code or have one provisioned — an ordinary INSERT through the existing "Add Staff" UI, **not** a migration. Owner decision.

---

## 12. Backend change decision

**BACKEND CHANGE REQUIRED: YES — but small and additive.**

Required:

1. **One new Server Action**, `app/mobile/actions.ts` → `registerMobileIssueAction`. It must: resolve the session, check authorisation, accept exactly `voiceRecording` + two image files, supply title/description/category/staffCode server-side, then call the **existing** `validateFile()` → `uploadAttachment()` → `createIssue()` chain. **No issue-management business logic is duplicated** — the action is a thin entry point.
2. **One permission key** for `staff` (option B in §8), or an owner decision to use option A instead.
3. **Two lines in `proxy.ts`** to protect `/mobile` (additive: a new prefix and a new matcher entry; no existing entry changes).

Not required: no new API layer, no new database access module, no new media service, no changes to `createIssue()`, `next_issue_id()`, `lib/cloudinary.ts` or `lib/access/attachments.ts`.

Target architecture:

```
/mobile (client UI: record + 2 photos + REGISTER)
  └─ app/mobile/actions.ts        ← thin, new
       ├─ lib/auth.ts             ← existing session + permission
       ├─ lib/access/attachments  ← existing byte validation
       ├─ lib/cloudinary.ts       ← existing signed upload
       └─ lib/queries/issues.ts   ← existing createIssue() → next_issue_id() → PostgreSQL
```

---

## 13. Regression risks

| Area | Risk | Why it is low / how to keep it low |
|---|---|---|
| Existing login | Low | No change to `login`/`session`/`getCurrentUser` |
| Route protection | **Medium** | `proxy.ts` edits must be purely additive; a wrong matcher could unprotect `/dashboard/**` |
| Permission matrix | **Medium** | Adding a key to `staff` must not touch `issue:create`, or Assignees gain the desktop New Issue page |
| Existing Issue creation | Low–Medium | Shared `createIssue()`; any signature change would affect the desktop form. Do not change it |
| Issue ID generation | Low | Unchanged; concurrency already handled in SQL |
| Media upload/view | Low–Medium | Shared validators. Do not relax JPEG-only or the byte sniffing to make phone photos pass |
| Issue list / detail | Low | Mobile Lite writes the same shapes (`images` + `attachments`) the readers already expect |
| RED→AMBER→GREEN workflow | None expected | Intake only; no status code touched |
| Assignment / reassignment | None expected | Mobile Lite creates unassigned Issues |
| Investigation / resolution / comments | None expected | Not reachable from `/mobile` |
| Super Admin portal | Low | No shared layout or component |
| Assignee portal | Low | No shared layout or component |
| Root layout | **Medium** | Adding manifest/viewport metadata must be scoped to `app/mobile/layout.tsx` where possible; a global change affects every page |

---

## 14. Regression tests required after future implementation

Existing suites to re-run (`npm test`, `tsx --test tests/*.test.ts`):
`access.test.ts` (permission matrix — must prove `staff` still lacks `issue:create`), `attachments.test.ts`, `issueAudioAttachments.test.ts`, `assigneeWorkflow.test.ts`, `issueDetailView.test.ts`, `issueDetailMarkup.test.ts`.

New tests worth adding:
- Mobile Lite validation: rejects a submission missing the voice recording or either photo; rejects non-JPEG/non-audio bytes.
- The generated title/description/category constants are applied and are non-blank (satisfying `issues_issue_title_check` / `issues_category_check`).
- The new permission key grants Mobile Lite registration but **not** desktop `issue:create`.
- Route protection: signed-out `/mobile` redirects to `/login`; the four existing `/dashboard/**` prefixes still redirect.
- Transactional cleanup: a forced `createIssue()` failure deletes uploaded assets.

Manual verification: install on Android and iOS home screens, camera capture, microphone permission, then confirm the Issue and all three media files appear in the Web Issue Tracker.

---

## 15. Recommended implementation stages

| Stage | Content | Size |
|---|---|---|
| **2** | Owner decisions: authorisation option (A/B/C), Raised By staff code, fixed Domain value, generated title/description wording | Decision only |
| **3** | `/mobile` route skeleton: `app/mobile/layout.tsx` + `page.tsx`, mobile-first UI shell, no submission yet. Proxy protection added | Small |
| **4** | Capture: voice recording + two photo inputs, client-side previews and re-record/retake. Still no submission | Medium |
| **5** | `registerMobileIssueAction` wired to existing validation → upload → `createIssue()`; confirmation screen showing the generated Issue ID | Medium |
| **6** | PWA shell: `app/manifest.ts`, two icons, standalone display, iOS home-screen metadata | Small |
| **7** | Verification: regression suite, manual device install/capture test, end-to-end check in the Web Issue Tracker | Small |

---

## 16. Warnings and unresolved items

1. **`staff` cannot create Issues today.** Stage 2 decision required (§8). Blocking for a worker-facing REGISTER.
2. **Images are JPEG-only.** Modern iPhones default to **HEIC**, and some Android cameras produce HEIF. `looksLikeJpeg()` rejects both. Mitigations: set `accept="image/jpeg"` + `capture` (iOS usually converts to JPEG when a web form requests it), or accept HEIC — which would mean **relaxing a shared validator that the desktop path also uses**. Needs a decision and testing on real devices.
3. **A Raised By `staff_code` must exist** for Mobile Lite Issues. There are 5 today (AT, ND, NV, SA, ST). Creating one is a data task via the existing Add Staff UI, not a migration.
4. **Domain for Mobile Lite Issues** is undecided. `category` is free text and must be non-blank; the Step 2 Domain vocabulary work is still open.
5. **No `apple-touch-icon` or app icon exists.** Two PNGs must be supplied by the owner or generated.
6. **iOS PWA limitations** — `MediaRecorder` support on iOS Safari is version-dependent; `VoiceRecorder.tsx` already falls back to a file input, which Mobile Lite should keep.
7. **Offline is explicitly out of scope**; a failed submission on a weak warehouse signal will simply error. If that proves painful in the field it becomes a future owner request, not a Version 1 change.
8. **`lib/ai/geminiClient.ts` currently logs a token-usage diagnostic in production** (unrelated to Mobile Lite, noted for completeness).

---

## 17. Verdict

**SAFE TO PROCEED** to Stage 2 (owner decisions), subject to items 1–4 above.

- Database change required: **NO**
- Backend change required: **YES** — one thin Server Action, one permission key, two additive proxy lines
- New dependency required: **NO**
- Existing media system supports 1 voice + 2 photos on one Issue **today**, visible in the Web Issue Tracker

**No application source file, database row, migration, package or deployment was modified during this audit.**

---
---

# Stage 1 Extended Audit — Unresolved Issues and Risk Review

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **Still audit-only.**
Database identity re-confirmed: `current_database = varmen_db`, `current_user = varmen_user`. Read-only; no write statement executed.
Everything above this line is the original Stage 1 audit and is preserved unchanged.

---

## A. Mobile worker identity → `staff_code`

### The three identity tables are unrelated

| Table | Purpose | Key | Links to |
|---|---|---|---|
| `management_users` | **Login identity** — who can sign in | `user_id` | referenced by `assignment_users.user_id` |
| `assignment_users` | **Assignee identity** — who an Issue can be assigned to | `assignee_id` | `user_id` → `management_users` (FK, partial-unique) |
| `issue_staff` | **"Raised By"** — who reported an Issue | `staff_code` (PK) | referenced by `issues.staff_code` |

**There is no foreign key, no join column and no code path connecting `issue_staff` to either of the other two.** Confirmed:
- FK map of the schema: `issue_staff` is referenced only by `issues.staff_code` and `issue_number_counters.staff_code`. It references nothing.
- `issue_staff` columns are exactly `staff_code, staff_name, active, created_at, updated_at` — no `user_id`, no email.
- `lib/queries/assigneeLink.ts` states it explicitly: *"issue_tracking.issue_staff ('Raised By') is NEVER consulted here and must never be used as an ownership source."*
- Repository search for any user→staff_code mapping in `lib/` or `app/`: **no result**.

### Live data proves there is no coincidental mapping either

| `issue_staff` | name | matches an assignee name? | matches a login display name? |
|---|---|---|---|
| AT | Atisraj | 0 | 0 |
| ND | Nandhi | 0 | 0 |
| NV | Nivarnan | 0 | 0 |
| SA | Sasi | 0 | 0 |
| ST | Sathis | 0 | 0 |

The 11 logins are `admin_test` plus the 10 assignees (Suman, Varman, Bietrick, Janani, Luxsika, Manoranjani, Mayurika, Muguntha, Rajiv, Arun). **Zero overlap with the five Raised By people.**

### Answers

1. **Who can log in?** Only rows in `management_users`: 1 `admin`, 10 `staff`. No other login mechanism exists.
2. **Role access:** `admin` → everything; `staff` → own assigned Issues + Account Settings; `management` → defined in the matrix but **held by no account**.
3. **Are warehouse workers represented today?** **Not as a distinct concept.** The 10 `staff` accounts are Assignees (investigators), not reporters.
4. **In which table?** `management_users` (login) + `assignment_users` (assignee). Never `issue_staff`.
5. **Do those users have `issue_staff` rows?** **No — none of them.**
6. **Deterministic mapping to `staff_code`?** **None exists.**
7. **Enforced or coincidental?** Neither — there is nothing to enforce, and no coincidence either (0 name matches).
8. **Are usernames/emails unique enough?** `username` and `email` are UNIQUE, so they *could* key a mapping — but no such mapping exists.
9. **Would mapping by display name be unsafe?** **Yes.** `display_name` is not unique, is user-editable in Account Settings, and matches nothing today. It must never key an identity.
10. **Would a new mapping be required?** Yes — either an explicit configuration constant or a per-user link.
11. **Provisioning a `staff_code` — data or schema?** **Data.** `issue_staff` rows are inserted through the existing "Add Staff" UI (`addRaisedByStaff`, `app/dashboard/issues/add-staff/actions.ts:79`). Adding a *column* to link them would be schema — not required by any option below.
12. **Can Mobile Lite use the session identity without weakening desktop permissions?** Yes for *authentication*. The `staff_code` question is separate and must be answered by configuration, not by the session.

### `MOBILE WORKER → STAFF_CODE MAPPING: NO EXISTING SAFE MAPPING`

Future options (owner decision, none implemented):

| Option | What it means | Cost | Risk |
|---|---|---|---|
| **A1** | One shared Raised By row for the channel, e.g. `WH` / "Warehouse Mobile" — every Mobile Lite Issue uses it | 1 data row via existing UI | Issues attributable to the *channel*, not the person; the actual person can still be recorded in `extra_data` |
| **A2** | One `issue_staff` row per worker + a `username` → `staff_code` map | 1 row per worker + a constant map | Map maintained by hand; drift risk |
| **A3** | Add a nullable `user_id` column to `issue_staff` | **Schema change** | Cleanest long-term; needs migration + owner approval |

**Recommended for Version 1: A1**, with the acting user recorded inside `extra_data` (additive JSONB, no schema change). One data row, no migration, and Issue IDs stay meaningful (`WH-001`, `WH-002`…) through the existing lazy counter.

---

## B. Authorization model

1. **Who holds `issue:create`?** `admin` and `management` only (`lib/access/permissions.ts:90,109`). `staff` holds exactly three keys (`:81-85`).
2. **What else does it allow?** Checked in exactly three places: `app/dashboard/issues/new/actions.ts:174` (the write), `new/page.tsx:17` (page affordance), `issues/page.tsx:144` ("+ New Issue" button).
3. **Pages/actions relying on it:** the desktop New Issue page and its Server Action.
4. **Would granting it to `staff` expose desktop creation?** **Yes — all three call sites would light up**, giving every Assignee the full desktop intake form.
5. **Other management functions exposed?** No — `user:manage`, `issue:delete`, `issue:assign`, `tracker:view`, `discussion:*` are separate keys.
6. **Can a Mobile-Lite-specific permission exist safely?** **Yes.** `Permission` is a TypeScript union and `ROLE_PERMISSIONS` an explicit per-role `Set`. **DECISION-001: no role hierarchy or inheritance**, so nothing acquires it implicitly.
7. **Application code or DB change?** **Application code only.** Permissions are not stored in the database — only the `role` string is.
8. **Hard-coded or data-driven?** **Hard-coded**, deliberately.
9. **Tests proving role isolation?** **Yes** — `tests/access.test.ts` asserts each role holds "exactly that set and nothing more" (`:66`, `:91`) and that `staff` "specifically cannot create or delete Issues" (`:145`).
10. **Can `/mobile` authenticate but authorise differently?** **Yes** — `getCurrentUser()` and `hasPermission()` are independent.

### Options

| Option | Change | Blast radius | Verdict |
|---|---|---|---|
| **B1** Workers use an `admin`/`management` login | none | Full desktop authority in a warehouse pocket | **Rejected** |
| **B2** New key `issue:create_mobile` for `staff`, checked only by the Mobile Lite action | +1 union member, +1 set entry, +1 test | Desktop creation stays closed | **Recommended** |
| **B3** Grant `issue:create` to `staff` | 1 line | Opens the desktop form to every Assignee | **Rejected** |

---

## C. Domain / category

1. **Where do Domains come from?** The free-text column `issues.category`. The New Issue form offers a `<datalist>` from `listCategories()` — `SELECT DISTINCT category` (`lib/queries/issues.ts:385-394`).
2. **Hard-coded or data-driven?** **Data-driven and unconstrained** — only `CHECK (btrim(category) <> '')` and a 50-character app cap. No enum, no lookup table.
3. **Canonical values today (144):** `listing` 36 · `purchase` 24 · **`inventory` 22** · `postage` 19 · `ph` 14 · `pricing` 11 · `not specified` 11 · `om` 5 · `vendor` 1 · `fba` 1.
4. **Exact spelling/casing of Inventory:** **`inventory`**, all lower case, matching every other value. The UI capitalises for display.
5. **Actively used?** **Yes** — 22 Issues, all assigned to Manoranjani, set deliberately in the approved Domain task.
6. **Do Mobile Lite Issues belong to `inventory`?** **Not automatically.** A warehouse voice report may concern damage, a courier problem, a picking error or stock. Forcing `inventory` would pollute a Domain that now has a specific, approved meaning and a single owner.
7. **Reporting/filtering/history impact:** Domain filters are populated from live data, so a new value appears automatically. **No history is written for category** — a later re-classification leaves no audit trail.
8. **Does anything else depend on category?** Display, filtering (`i.category = $8`), sorting (`domain: "i.category"`), and the AI prompt. **No issue-prefix, assignment, workflow or permission logic reads it.**
9. **Does a fixed Mobile Lite category need a DB change?** **No.**
10. **Is another value better?** `not specified` is being retired and must not grow. A **new dedicated value** — e.g. `warehouse` — says where the report came from without pre-judging the problem, keeps `inventory` clean, and allows re-classification on review.

### `RECOMMENDED MOBILE LITE DEFAULT DOMAIN: warehouse` — *provisional, OWNER DECISION REQUIRED*

Evidence: category has no dependent logic (8–9); `inventory` now carries an approved specific meaning and owner (5–6); `not specified` is being eliminated. Alternatives: `inventory` (accepting pollution) or an existing value such as `postage`. **Nothing created or renamed.**

---

## D. Title and description generation

1. **Title constraints:** `issue_title` is `text`, NOT NULL, `CHECK (btrim(issue_title) <> '')`. App cap **200 characters** (`MAX_SHORT_TEXT`).
2. **Description constraints:** `issue_description` is `text`, NOT NULL, **no non-empty CHECK**. App cap **20,000 characters**.
3. **Maximum lengths:** both far larger than any generated value needs.
4. **Search/index dependencies:** search is `issue_id ILIKE '%…%' OR issue_title ILIKE '%…%'` (`issues.ts:334`) — substring scan, **no full-text index, no uniqueness index**. Sorting by title is offered in both tables.
5. **Identical titles allowed?** **Yes** — no unique constraint.
6. **Problems with a constant title?** Valid but useless: Title is the main list column; 50 identical rows are unscannable and unsearchable.
7. **Fixed description with voice as primary evidence?** Acceptable — the DB does not require it to be non-blank, and Description renders directly above the audio player.
8. **Attachment metadata for context?** Filename, byte size and MIME are already captured in `extra_data.attachments`, entirely server-side. Using them in a title string changes no validator.
9. **Prominence:** Title is the list column and detail `<h1>`; Description is the first content block. Both highly visible.
10. **Would fixed placeholders hurt?** **Yes**, if identical. Make the generated title *distinguishing* rather than *descriptive*.
11. **Date/worker identity server-side?** Safe — both come from the server, never the request body. Pattern: `Warehouse report — <Worker> — <DD/MM/YYYY HH:MM>` — unique in practice, under 200 chars, sortable and searchable.
12. **Could later transcription update these fields?** Technically yes, **but** there is no history table for title/description, so an overwrite would erase the original silently. The safe pattern is to write transcription into a **new `extra_data` key** and leave intake values untouched.

**Recommendation (not implemented):** server-generated distinguishing title; fixed description naming the recording as primary evidence; both produced server-side.

---

## E. Photo capture — JPEG vs HEIC

### Repository-evidenced facts

- `IMAGE_EXTENSIONS = [".jpg", ".jpeg"]`; `IMAGE_ACCEPT = "image/jpeg,.jpg,.jpeg"` (`lib/access/attachments.ts:51,64`).
- `looksLikeJpeg()` requires the first three bytes `FF D8 FF` (`:86-88`). **A HEIC file begins `…ftypheic` and would fail**, and would fail the extension check if named `.heic`.
- Validation order is size → extension → bytes, and **the bytes decide**. A renamed HEIC still fails.
- This validator is **shared with the desktop path** — it cannot be relaxed for Mobile Lite alone.
- Max image 10 MB, max 10 images.
- Cloudinary receives whatever passes, resource type `image`.

### Device/browser assumptions — REQUIRE REAL-DEVICE TESTING

- `<input type="file" accept="image/jpeg" capture="environment">` is the standard mechanism; no library needed.
- **Android Chrome** typically delivers JPEG — expected to pass.
- **iPhone Safari** stores HEIC internally but has historically **transcoded to JPEG when a form requests `image/jpeg`**. This is the single most important real-device check.
- Canvas conversion (`toBlob('image/jpeg')`) works **only if the browser can decode HEIC** — Safari can, Android Chrome generally cannot. It also strips EXIF orientation and costs memory proportional to the decoded bitmap (12 MP ≈ 48 MB RGBA) — a real risk on low-end phones.
- A HEIC-decoding library (e.g. `heic2any`) adds ~1 MB of WASM/JS. **Not recommended.**
- Cloudinary *can* ingest HEIC, but only if our validator allows it — which would mean changing shared validation.

**Safest future approach:** leave the global validator untouched; request JPEG via `accept`/`capture`; if a non-JPEG arrives, **reject it in the Mobile Lite UI with a clear message**. Mobile-Lite-specific preprocessing is strictly safer than changing global validation.

---

## F. Audio / iOS / MediaRecorder — full trace of `components/issues/VoiceRecorder.tsx`

1. **API:** `getUserMedia({audio:true})` + `MediaRecorder` (`:125,129`).
2. **MIME negotiation:** `["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]`, first supported wins via `isTypeSupported()` (`:34-42`); if none, the recorder is constructed with no options and the browser chooses.
3. **Fallback probe:** `MediaRecorder !== undefined` **and** `navigator.mediaDevices?.getUserMedia` (`:63-64`); when false a **plain file input** is rendered instead.
4. **File-input fallback:** the same `<input type="file" name="voiceRecording">` the recorder writes into — the server path is identical either way.
5. **Maximum duration:** **none.** A counter runs but nothing stops the recording.
6. **Maximum upload size:** enforced only server-side at **25 MB** — a long recording is rejected *after* upload begins.
7. **Lifecycle:** click → `getUserMedia` → `start()` → chunks in `ondataavailable` → `stop()` → `onstop` builds a Blob → object URL preview → `releaseStream()`.
8. **Permission denied:** caught; stream released; one neutral message; no raw browser error (`:152-161`).
9. **Cancel / re-record:** `removeRecording()` stops the timer, releases the stream, clears blob and chunks, revokes the URL, **clears the file input**, resets state.
10. **Unsupported browser:** file input.
11. **If the browser chooses `audio/mp4`:** the file is named `voice-recording.m4a` (`:46-48`), MIME `audio/mp4`.
12. **Do both pass validation?** **Yes** — `.webm` and `.m4a` are in `AUDIO_EXTENSIONS`; `looksLikeAudio()` accepts EBML for WebM and `ftyp` at offset 4 for MP4/M4A.
13. **Cleanup:** an unmount effect stops the timer, releases the microphone and revokes the preview URL (`:110-119`).
14. **Player compatibility:** `IssueAudioAttachments.tsx` uses native `<audio controls>`. Safari plays `audio/mp4`; **Safari does not play WebM/Opus**, so an Android-recorded note may not play back for an iPhone reviewer.
15. **Can Mobile Lite reuse the component directly?** **Not as-is.** It is a desktop form control (writes into a hidden input via `DataTransfer`, dashboard styling, lives in `components/issues/`). Importing it would couple Mobile Lite to dashboard code — the isolation rule forbids it.
16. **Reusable logic worth extracting later (not now):** `pickMimeType()`, `extensionFor()` and the support probe are pure helpers with no DOM coupling; a future stage could move them to `lib/access/` without changing behaviour. **No refactor made.**

---

## G. Three-file atomicity (1 voice + 2 images + 1 Issue)

Traced against `createIssueAction` (`app/dashboard/issues/new/actions.ts:216-303`):

1. **Files uploaded before the DB transaction?** **Yes.**
2. **File 1 uploads, file 2 fails?** Loop catches → `deleteAttachments(uploaded)` removes file 1 → error returned. **No Issue created.**
3. **All upload but INSERT fails?** All three deleted, error returned, no Issue.
4. **Cleanup guaranteed?** **No — best effort.** `deleteAttachments()` never throws.
5. **If cleanup fails?** Logged (`[cloudinary] orphan cleanup failed for <public_id>`); user still sees the original error. **Orphaned assets — storage cost, never corruption.**
6. **Duplicate Issues after retry?** A failed attempt creates none, so retry is clean. A **succeeded-but-unseen** attempt would create a second Issue.
7. **Duplicate media after retry?** **Yes** — `unique_filename=true`, `overwrite=false`, random suffix. Harmless duplicates.
8. **Double-tap protection?** Only `disabled={pending}` on the submit button. That defeats a double *click*, not a duplicate *request*.
9. **Are Server Actions idempotent?** **No.** Each invocation allocates a fresh ID and inserts a row. No request key or dedupe.
10. **Concurrency protections:** the counter's atomic `UPDATE … RETURNING` (correct IDs under load) and the `createIssue()` transaction (all-or-nothing). Neither prevents two intentional-looking submissions.
11. **Could a mobile network retry create two Issues?** **Yes — the real risk.** If the request commits but the response is lost, a resubmit creates a **second Issue with a second ID and duplicate media**.
12. **What would guarantee one press = one Issue?** A client-generated idempotency key recorded server-side (in `extra_data` with a uniqueness check, or a small dedupe table), so a repeat returns the original Issue ID. **Not implemented; recommended later.**

**Verdict: sufficient for atomicity, NOT sufficient for duplicate prevention.**

---

## H. Proxy / route protection (`postage-workspace/proxy.ts`)

1. **Protected today:** `/dashboard/issues`, `/dashboard/discussions`, `/dashboard/tracker`, `/dashboard/account-settings` (`:48-53`, matcher `:74-80`).
2. **Public:** everything else — `/`, `/login`, `/logout`, `/dashboard`, `/dashboard/booking`, `/dashboard/couriers`, `/dashboard/reports`.
3. **Redirect behaviour:** no valid session → redirect to `/login`; otherwise `next()`.
4. **Role behaviour:** **none** — the proxy checks only that a session cookie verifies. Roles are enforced in pages and actions.
5. **Matcher:** four `:path*` patterns; the in-function prefix test is a redundant second guard.
6. **Would `/mobile` be public?** **Yes — completely unprotected at the edge** if added today.
7. **Smallest safe protection:** append `"/mobile"` to the prefix list and `"/mobile/:path*"` to the matcher. Two additive lines; no existing entry edited.
8. **Risk of altering dashboard protection:** real but low — the danger is *editing* an existing string. Mitigation: a test asserting all four existing prefixes still redirect.
9. **Existing proxy/auth tests:** **none.** **Confirmed coverage gap.**
10. **Could route-level auth avoid proxy changes?** Yes — `app/mobile/page.tsx` can call `getCurrentUser()` and redirect itself; the action re-checks regardless. This is how `/dashboard/booking` already behaves.
11. **Trade-offs:**

| | Proxy protection | Page/action protection |
|---|---|---|
| Pro | Blocks before rendering; consistent with `/dashboard/issues` | No shared file touched → zero dashboard regression risk |
| Con | Edits a file every protected route depends on | The route shell renders before redirecting |

**Recommendation: do both** — page guard plus the two additive proxy lines, with a test pinning the existing four prefixes.

---

## I. PWA installability — exact minimum for Next.js 16.2.10

Verified against the installed docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`):

- **Manifest:** native support — `app/manifest.ts` exporting `MetadataRoute.Manifest`, or static `app/manifest.json|.webmanifest`. **No package required.**
- **Required fields:** `name`, `short_name`, `start_url`, `display: "standalone"`, `icons` (192×192 and 512×512 PNG), plus `background_color`/`theme_color`.
- **Icons:** **none exist** — `public/` holds only five Next.js starter SVGs. Two PNGs must be produced.
- **Metadata:** `app/mobile/layout.tsx` can set `viewport` and Apple tags (`apple-mobile-web-app-capable`, status-bar style, `apple-touch-icon`) **scoped to Mobile Lite**, leaving the root layout untouched.
- **HTTPS:** already satisfied by Vercel.
- **iOS:** installs via Share → "Add to Home Screen"; no install prompt. iOS honours `apple-touch-icon` and the standalone meta tag rather than manifest icons.
- **Service worker:** **not required for Version 1** — offline is out of scope.
- **Offline capability required for installability?** **No.**
- **Is a PWA package necessary?** **No.**

**Conclusion: manifest + 2 icons + scoped metadata. Zero new dependencies.**

---

## J. Network failure / retry behaviour

| Scenario | Current behaviour | What a worker would see |
|---|---|---|
| Upload timeout | **No timeout configured** — the Cloudinary `fetch` has no `AbortSignal` (`lib/cloudinary.ts:190`) | Spinner forever |
| Server Action failure | Returns `{error}` in the action state | Red message, form still filled |
| Cloudinary failure | `"Could not upload \"<name>\". Please try again."`; prior uploads deleted | Clear error, nothing created |
| DB failure | Uploads deleted; `"Could not save this issue. Please try again."` | Clear error, nothing created |
| Partial upload | Cannot persist — all-or-nothing | — |
| Navigation during submission | The action may still commit; the browser never learns the Issue ID | **Silent success — worst case** |
| Double submission | Button disabled while pending; a genuine resubmit creates a **second Issue** | Two Issues, no warning |
| Retry after failure | Safe — a failed attempt leaves nothing behind | — |

**Version 1 must make failure unmistakable:** a blocking in-flight state, an explicit success screen showing the **generated Issue ID** (the only proof of commit), and an error state stating nothing was saved and the recording is still held. **No UI created.**

---

## K. Visibility of a Mobile Lite Issue in the Web Issue Tracker

1. **List columns:** Issue ID, Title, Raised By, Domain, Assigned To, Status, Priority, Date Raised, Actions — all populated (Priority null renders empty, as it already does for all 144).
2. **Detail fields:** ID, Title, Status/Priority badges, Raised By, Date Raised, Domain, Updated, Description, then media.
3. **Voice attachment:** renders in **AUDIO ATTACHMENTS** with `<audio controls>` — `source: "voice_recording"` is inside `ASSIGNEE_VISIBLE_SOURCES`, so **both portals** see it.
4. **Photos:** render in **IMAGES / ATTACHMENTS** provided they are also written to `extra_data.images` in the legacy three-key shape (the existing action already does this).
5. **Raised By:** shows `issue_staff.staff_name` for the chosen code.
6. **Domain:** capitalised in the meta grid and list; filterable immediately.
7. **RED status:** standard badge; the Assignee portal reads it as "Not Solved".
8. **Assignment:** available — created unassigned and RED, so the new RED-only assignment gate permits assigning it.
9. **Investigation workflow:** fully available once assigned.
10. **Resolution workflow:** unchanged.
11. **Do `extra_data` source markers affect the UI?** Only `attachments[].source` does. Unknown top-level keys are rendered by the **"Additional details"** block via `humanizeKey()` — an arbitrary new key **would become visible** unless added to `HIDDEN_META_KEYS`.
12. **Does a Mobile Lite Issue need a source marker?** Not technically; useful for reporting, and `staff_code` already implies the channel under A1.
13. **Can a marker live in `extra_data`?** **Yes, no schema change** — but see point 11.

---

## L. Historical safety (read-only verification)

| Check | Value |
|---|---|
| Issues total | **144** (ND 67 · AT 30 · SA 27 · NV 14 · ST 6) |
| Soft-deleted | 0 |
| Raised By staff | 5 (AT, ND, NV, SA, ST — all active) |
| Issues with `extra_data.attachments` | **41** |
| Issue-number counters | 5, one per real prefix |
| Assignees / logins | 10 / 11 |
| Current assignments | 22 (all Manoranjani) |

**Any future Mobile Lite work is purely additive:** new `issues` rows with new IDs from a **new counter** (a new prefix creates its counter row lazily), writing only to `extra_data` on those new rows, reading — never writing — existing data. `chk_issue_staff_prefix` guarantees a Mobile Lite ID cannot collide with an existing prefix's sequence.

---

## M. Test coverage — present vs missing

**Present (20 test files):** permission matrix and role isolation (`access.test.ts`); assignee workflow (`assigneeWorkflow`, `issueWorkDetails`, `issueStatusLabels`); attachment validation (`attachments.test.ts`); audio attachment reading (`issueAudioAttachments.test.ts`); detail-view composition (`issueDetailView`, `issueDetailMarkup`); AI flow/schema/sanitisation; account settings and assignee validation; plus a live-DB transactional proof that always rolls back (`scripts/verify-assignee-transactions.ts`).

**Missing — confirmed gaps:**

| Gap | Why it matters | Suggested home |
|---|---|---|
| **No test for `proxy.ts`** | The one file whose edit could unprotect the dashboard | new `tests/routeProtection.test.ts` |
| **No test for session issue/verify/expiry** | 7-day JWT behaviour unproven | new `tests/session.test.ts` |
| **No test for `createIssue()` / `next_issue_id()`** | ID allocation and RED default untested | extend the verify-script pattern |
| **No concurrency test for ID allocation** | Two simultaneous registrations | live script, rolled back |
| **No test for upload-failure cleanup** | `deleteAttachments()` rollback path unverified | new `tests/uploadCleanup.test.ts` (fake uploader) |
| **No duplicate-submission test** | The §G-11 risk | new, once idempotency is designed |
| **No test that `staff` cannot reach desktop creation** | Would catch a B2 mistake | extend `tests/access.test.ts` |
| Mobile Lite registration validation | Does not exist yet | future `tests/mobileRegistration.test.ts` |

---

## N. Additional risks found in this extended pass

### CONFIRMED ISSUES

1. **Server Action body limit is 1 MB by default — and `next.config.ts` is empty.**
   Installed Next.js docs (`serverActions.md:28`): *"By default, the maximum size of the request body sent to a Server Action is 1MB."* `next.config.ts` contains no `serverActions` block, yet `attachments.ts` permits **10 MB images and 25 MB audio**. **A single phone photo (2–5 MB) would exceed the limit** — so 1 voice + 2 photos cannot be submitted through a Server Action today. This affects **the existing desktop Add New Issue path too**, and is the largest blocker found. Fixing it means editing `next.config.ts`, which is outside this stage's permitted edits and needs owner approval. (Platform request-size ceilings are a separate limit to verify before choosing a value.)
2. **No user→`staff_code` mapping exists at all** (§A) — blocking.
3. **`staff` cannot create Issues** (§B) — blocking.
4. **No proxy/session/creation tests** (§M) — those paths are unguarded by CI.
5. **No idempotency** (§G-11) — a lost response yields duplicate Issues.
6. **No upload timeout** (§J) — a stalled request hangs indefinitely.
7. **No recording duration cap** (§F-5/6) — a worker can exceed 25 MB and only learn after uploading.

### RISKS TO TEST (device/browser)

8. iPhone Safari HEIC vs `accept="image/jpeg"` (§E) — highest-value real-device test.
9. iOS `MediaRecorder` availability by version; the file-input fallback must be exercised on a real iPhone.
10. **Safari cannot play WebM/Opus** — an Android-recorded note may not play back for an iPhone reviewer (§F-14).
11. Camera/microphone permission prompts inside an installed PWA (standalone) differ from a browser tab.
12. Very small screens (≤360 px) and orientation changes — no mobile layout exists yet to assess.
13. Browser back/refresh during recording — unmount cleanup covers the microphone; a mid-submission refresh is untested.
14. Session expiry (7-day JWT) mid-upload → the action returns "must be signed in" **after** the recording is made; the worker must not lose the audio.

### NOT A PROBLEM ON CURRENT EVIDENCE

15. **CSRF:** Server Actions are POST-only with an Origin check and non-guessable action IDs.
16. **Direct Server Action invocation:** every action re-resolves the session and re-checks permissions server-side.
17. **Filename safety:** `sanitizeFilename()` strips directory components, control characters and everything outside an allow-list, caps at 120 chars, and is never used to build a filesystem path.
18. **XSS:** React escapes by default; no `dangerouslySetInnerHTML` in the Issue paths; attachment URLs validated as `https://` before render.
19. **Secrets exposure:** Cloudinary and DB credentials are read only in `server-only` modules, never `NEXT_PUBLIC_`; uploads are signed server-side.
20. **Authorization bypass via `extra_data`:** the New Issue action writes a fixed allow-list of keys; a Mobile Lite action should do the same.
21. **Orphan media:** bounded, logged, storage-cost only.
22. **Accessibility:** existing components use real `<button>`s, labels and `role="alert"`/`role="status"` — a good baseline.

---

## Owner decisions required before Stage 2 ends

1. **Authorisation** — approve option **B2** (new `issue:create_mobile` key for `staff`)?
2. **Raised By** — approve **A1** (one shared `issue_staff` row, e.g. `WH` / "Warehouse Mobile"); confirm code and display name?
3. **Domain** — approve **`warehouse`**, or choose `inventory` / another value?
4. **Title/description** — approve the server-generated title pattern and fixed description wording?
5. **Body size limit** — approve editing `next.config.ts` to raise `serverActions.bodySizeLimit` (required before any photo upload can work) and decide the ceiling?
6. **Idempotency** — accept the duplicate-Issue risk in Version 1, or schedule a safeguard?
7. **HEIC** — accept "reject non-JPEG with a clear message", or require conversion?
8. **Recording cap** — impose a client-side maximum duration (e.g. 3 minutes)?

## Revised recommended stages

| Stage | Content |
|---|---|
| **2** | Owner decisions 1–8; provision the Raised By row via the existing Add Staff UI (data only) |
| **3** | `next.config.ts` body-size limit + a real-device photo/audio size probe against the existing desktop form |
| **4** | `/mobile` route skeleton, page-level auth guard, additive proxy protection + route-protection test |
| **5** | Capture UI: recording (with duration cap) + two photo inputs, JPEG-only messaging |
| **6** | `registerMobileIssueAction` on the existing validate → upload → `createIssue()` chain, plus the new permission key and tests |
| **7** | PWA shell: `app/manifest.ts`, two icons, scoped iOS metadata |
| **8** | Idempotency safeguard (if approved) + regression suite + real-device verification |

## Extended-audit verdict

**READY FOR OWNER DECISIONS** — with the caveat that decision **5 (Server Action body size limit)** is a hard technical blocker: without it, no photo can be submitted through a Server Action, on Mobile Lite **or** the existing desktop form.

---
---

# Stage 2 — Decisions and Technical Readiness Review

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **Still no implementation.**
Database identity re-confirmed: `current_database = varmen_db`, `current_user = varmen_user`. Read-only; no write statement executed, no row created, no migration written, no configuration file edited.
Stage 1 and the Stage 1 Extended Audit above are preserved unchanged.

---

## 2.1 Authorization — `issue:create_mobile`

### Can the current permission system support it without touching desktop permissions?

**Yes.** Verified against `lib/access/permissions.ts`:

- `Permission` is a **TypeScript union of string literals** (`:24-60`). Adding `"issue:create_mobile"` extends the union; nothing else changes.
- `ROLE_PERMISSIONS` is an **explicit per-role `Set`** (`:77-128`). Adding the key to the `staff` set touches one line inside one set.
- `roleHasPermission()` is a plain `Set.has()` lookup (`:131-136`) — **no hierarchy, no inheritance** (DECISION-001, stated in the file header). `management` and `admin` cannot acquire the key implicitly, and `staff` cannot acquire anything else.
- Permissions are **not stored in the database** — only `management_users.role` is, CHECK-constrained to `staff|management|admin`. **No database change of any kind.**

### What must NOT happen

`issue:create` stays exactly as it is. Its three call sites (`app/dashboard/issues/new/actions.ts:174`, `new/page.tsx:17`, `issues/page.tsx:144`) must remain the only gate on desktop creation. The Mobile Lite action must check **only** `issue:create_mobile`, so the desktop form and the "+ New Issue" button stay invisible and unreachable for `staff`.

### Known consequence for the test suite

`tests/access.test.ts` asserts each role holds "exactly that set and nothing more" (`:66`, `:91`) and that `staff` "holds exactly three permissions" (`:91`). Adding a fourth key to `staff` **will fail those assertions until they are updated deliberately** — which is the correct behaviour: the test is designed to make a permission change impossible to slip in unnoticed. Stage 6 must update the expected set *and* add a new assertion that `staff` still lacks `issue:create`.

### Decision recorded

**APPROVED DESIGN (not implemented):** add `issue:create_mobile`, grant to `staff` only, check it only from `app/mobile/actions.ts`. No implementation was performed — a "minimal technical proof" was not necessary, because the mechanism is a pure lookup in a hard-coded table and its behaviour is fully determined by reading it.

---

## 2.2 Raised By — the `WH` row

### How Raised By rows are created today

Path: `/dashboard/issues/add-staff` → `addStaffAction` → **`addRaisedByStaff()`** (`app/dashboard/issues/add-staff/actions.ts:79-106`) → `createStaff()` (`lib/queries/staff.ts`).

Rules enforced there:

| Rule | Value | Evidence |
|---|---|---|
| Permission | `user:manage` — **Super Admin only** | `add-staff/actions.ts:55` |
| Staff code pattern | `/^[A-Z0-9]{1,10}$/`, upper-cased before validation | `:42`, `:80`, `:83` |
| Name required, max length | 100 characters | `:43`, `:86-91` |
| Active flag | from the form checkbox | `:59` |
| Writes | **`issue_tracking.issue_staff` only** — "Creates no login, stores no email, no username, and no password" | `:74-78` |
| Duplicate handling | `DuplicateStaffCodeError` → *"Staff code WH already exists."* | `:96-98` |

### Verdict

**`staff_code = 'WH'`, `staff_name = 'Warehouse Mobile'` can be created entirely through the existing UI, with no schema change and no migration.**

- `WH` satisfies `/^[A-Z0-9]{1,10}$/`.
- `Warehouse Mobile` is 16 characters, well inside the 100 limit.
- It is a **single INSERT into `issue_staff`** performed by a Super Admin through a page that already exists. No script, no SQL, no migration.
- The Issue-ID counter row for `WH` is created **lazily and automatically** by `next_issue_id()` on the first Mobile Lite Issue (`migration/006:65`), producing `WH-001`, `WH-002`… . `chk_issue_staff_prefix` then guarantees those IDs cannot collide with ND/AT/SA/NV/ST sequences.

**Not created.** This is documentation of the exact safe path only.

### Keeping the real person identifiable

`staff_code = 'WH'` identifies the *channel*, not the person. The authenticated user must therefore be recorded on the Issue itself. The safe location is **`extra_data`** — JSONB, constrained only by `jsonb_typeof(extra_data) = 'object'`, so this needs no schema change.

Proposed keys (server-derived only, never from the request body):

| Key | Value | Source |
|---|---|---|
| `mobileSubmittedByUserId` | `management_users.user_id` | session |
| `mobileSubmittedByUsername` | `management_users.username` | session |
| `mobileSource` | `"mobile-lite"` | constant |

⚠️ **Display consequence (from Extended Audit §K-11):** unknown top-level `extra_data` keys are rendered by the Issue detail page's **"Additional details"** block via `humanizeKey()`. These three keys would therefore become **visible to the Super Admin** — which is arguably desirable ("Mobile Submitted By Username: arun"), but it is a UI consequence that must be chosen deliberately, not discovered. The alternative is adding them to `HIDDEN_META_KEYS` in `components/issues/IssueDetail.tsx`. **OWNER DECISION.**

---

## 2.3 Domain value

### Exact validation rules and where they apply

| Layer | Rule | Location |
|---|---|---|
| Database | `CHECK (btrim(category) <> '')` — non-blank only | `issues_category_check` |
| Database | `category` is `varchar`, NOT NULL, no default | `information_schema` |
| Application | required, and `category.length > 50` rejected | `app/dashboard/issues/new/actions.ts:186, 192` |
| UI | free-text input with a `<datalist>` of existing values | `new/NewIssueForm.tsx:224-241`, fed by `listCategories()` |

**There is no enum, no lookup table, and no code that branches on a category value.** Confirmed by search: `category` is used for display, filtering (`i.category = $8`), sorting (`domain: "i.category"`) and the AI prompt — nothing else. No prefix, assignment, workflow or permission logic reads it.

### Recommendation

**`warehouse`** — lower case, matching every existing value (`listing`, `purchase`, `inventory`, `postage`, `ph`, `pricing`, `om`, `vendor`, `fba`, `not specified`). The UI capitalises for display.

Rationale:
- `inventory` now has an approved, specific meaning and one owner (22 Issues, all Manoranjani). A voice report from the floor may concern damage, a courier, a picking error or stock — routing them all to `inventory` would corrupt a Domain that was just curated.
- `not specified` is being retired and must not grow.
- A distinct value makes Mobile Lite intake filterable on day one and allows a Super Admin to re-classify on review.
- **Setting it requires no data creation now** — a Domain "exists" simply by appearing on an Issue.

### `RECOMMENDED PROVISIONAL DOMAIN: warehouse` — **OWNER DECISION REQUIRED**

Alternatives if rejected: `inventory` (accepting pollution) or an existing operational value such as `postage`.

---

## 2.4 Generated title and description

### Constraints to satisfy

- Title: NOT NULL, `CHECK (btrim(issue_title) <> '')`, app cap **200 chars**, **no uniqueness index**, appears as the main list column and the detail `<h1>`, and is one of the two fields substring-searched.
- Description: NOT NULL (no non-blank CHECK), app cap **20,000 chars**, rendered as the first content block above the media.

### Proposed wording (deterministic, server-generated)

**Title**
```
Warehouse report — <username> — <DD/MM/YYYY HH:MM>
```
e.g. `Warehouse report — arun — 14/08/2026 09:42`

- Every component is server-derived (session username, server clock) — nothing from the request body.
- Length ≈ 45 characters, far inside 200.
- Distinguishing rather than descriptive: sortable, searchable, and never two identical rows in practice.
- Timestamp should be rendered in the application's existing display timezone convention (`lib/datetime.ts`, Asia/Colombo) so it matches every other date the team sees.

**Description**
```
Voice report recorded in Warehouse Mobile. The original voice recording is the
primary description of this Issue and is attached, together with two evidence
photos. No text description was entered by the reporter.
```

- States plainly that the audio is the evidence, so a reviewer is not left wondering whether text is missing.
- Fixed and identical across Issues — acceptable because Description is read *after* opening the Issue, where the audio player sits directly beneath it.

### Transcription rule (design decision, binding on later stages)

Any future transcription, AI summary or root-cause suggestion **must be written to a new `extra_data` key** (e.g. `mobileTranscript`) and **must never overwrite `issue_title` or `issue_description`**.

Reason, evidenced: there is **no history table for either column** — `issue_status_history` records status transitions, `issue_comments` records investigation notes, and neither captures a title/description edit. An overwrite would therefore erase the original intake wording with no audit trail, which contradicts "the original voice recording remains the primary evidence".

---

## 2.5 Server Action body-size limitation

### Where the 1 MB limit comes from — confirmed

Installed Next.js documentation, `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:28`:

> *"By default, the maximum size of the request body sent to a Server Action is 1MB, to prevent the consumption of excessive server resources in parsing large amounts of data, as well as potential DDoS attacks."*

Also stated in `.../02-guides/server-actions.md:83`. The configuration key in this version is **`experimental.serverActions.bodySizeLimit`**, accepting bytes or a string such as `'500kb'` / `'3mb'`.

**`postage-workspace/next.config.ts` is empty** — `const nextConfig: NextConfig = {};`. So the default 1 MB is in force for **every** Server Action, including the existing desktop `createIssueAction`.

### Evidence from live data

All 52 stored audio attachments measure **20 KB – 911 KB (avg 217 KB)** — but every one of them was written by `scripts/import-historical-audio.ts`, a **CLI script that never crossed a Server Action**, so none of them exercised this limit. 13 Issues carry 2+ images, all from the historical migration, also server-side.

**Conclusion: the 1 MB limit has never been tested by a real browser upload in this application.** A single modern phone photo (2–5 MB) exceeds it on its own.

### Recommended value

**`bodySizeLimit: '12mb'`**, paired with tighter Mobile-Lite-specific per-file caps.

Reasoning:

| Component | Realistic worst case |
|---|---|
| Evidence photo 1 (12 MP JPEG) | ~5 MB |
| Evidence photo 2 | ~5 MB |
| Voice recording (3 min) | ~0.5 MB (Opus) – ~3 MB (iOS AAC) |
| Multipart overhead | ~1 % |
| **Total** | **~11 MB** |

- 12 MB covers the intended payload with a small margin and **nothing more**.
- It is deliberately *far below* what the app's own validators would permit (10 MB × 10 images + 25 MB × 5 audio ≈ 350 MB) — the request limit should not be raised to match those caps.
- The desktop form benefits identically: it currently cannot accept a real phone photo either, so this is a **latent-bug fix**, not a new risk.
- Recommended companions (Stage 5/6): Mobile Lite enforces its own client-side and server-side caps of **5 MB per photo** and **5 MB for the recording**, so a legitimate submission is always ≈ 15 MB or less and an abusive one is rejected before upload.

### ⚠️ Platform limit — must be verified before relying on 12 MB

Serverless platforms impose their own request-body ceiling **independently of Next.js configuration**, and it is commonly around **4.5 MB** on Vercel's serverless functions. If that applies to this deployment, **raising `bodySizeLimit` alone will not be sufficient** — the request would be rejected before Next.js ever sees it.

**This must be verified against the platform's current documentation and a real upload before Stage 5 is designed.** If the ceiling is confirmed, the architecture changes materially, and the correct answer is:

> **Signed direct-to-Cloudinary upload from the browser.** The server issues a short-lived signature (the signing logic already exists in `lib/cloudinary.ts:102-108`); the browser POSTs each file straight to Cloudinary; only the resulting `public_id`/`secure_url` values are sent to the Server Action. Request bodies stay in the kilobytes, no platform limit applies, and the existing `createIssue()` path is unchanged.

This alternative is **more work but strictly more scalable**, and it also removes the "no upload timeout" problem from the server. It is recorded here as the fallback architecture; **no code has been written for either option.**

### Status

**CONFIGURATION CHANGE REQUIRED — STOPPED FOR REVIEW.** `next.config.ts` was **not** modified. Nothing was verified by executing an upload, because doing so would require the change.

---

## 2.6 Idempotency — "one REGISTER press = one Issue"

### What happens today when the network fails after COMMIT

Sequence with no idempotency (current code):

1. Worker presses REGISTER.
2. Files upload to Cloudinary. ✅
3. `createIssue()` opens a transaction, allocates `WH-007`, INSERTs, **COMMITs**. ✅ **The Issue now exists and is visible in the Web Issue Tracker.**
4. The response is lost — signal drops, the phone sleeps, the browser is closed, a proxy times out.
5. The worker sees an error or a hung spinner and presses REGISTER again.
6. Steps 2–3 repeat from scratch: **new uploads, a new ID `WH-008`, a second Issue** with the same voice recording and photos.

**Result: two Issues for one real event, and the worker has no way to know.** Nothing in the current architecture prevents this — Server Actions are not idempotent, each call allocates a fresh ID, and the only protection (`disabled={pending}`) dies with the page.

### Recommended mechanism — no database migration required

**Client-generated submission key + advisory lock + `extra_data` lookup.**

1. **Client:** generate one key per *attempt-set* — `crypto.randomUUID()` — when the worker first presses REGISTER, and **persist it** (component state plus `sessionStorage`) so every retry of the same report reuses the same key. A new key is generated only after a confirmed success or an explicit "start new report".
2. **Server, inside the existing transaction:**
   - `SELECT pg_advisory_xact_lock(hashtext($key))` — serialises concurrent retries of the same key; released automatically at COMMIT/ROLLBACK; **needs no table**.
   - `SELECT issue_id FROM issue_tracking.issues WHERE extra_data->>'mobileSubmissionId' = $key LIMIT 1` — if found, **return that Issue ID and create nothing**.
   - Otherwise allocate the ID and INSERT with `extra_data.mobileSubmissionId = $key`.
3. **Duplicate media on a retry:** if the lookup finds an existing Issue after files were already re-uploaded, the action calls the existing `deleteAttachments()` on the fresh uploads, so no orphan accumulates.

Why this needs **no migration**:

- `extra_data` is existing JSONB constrained only to be an object — adding a key to a *new* row is already how `attachments`, `images`, `sourceFile` etc. work.
- `pg_advisory_xact_lock` is a built-in function requiring no object.
- The lookup is a sequential scan over 144+ rows — trivially fast at this scale. A partial index on `(extra_data->>'mobileSubmissionId')` would be a **future optimisation, not a requirement**, and would be a schema change requiring separate approval.

**A database migration is therefore NOT required for idempotency.** If the owner later wants a dedicated dedupe table or a unique index, that becomes a separate approved change — nothing here presumes it.

### Residual case this does not solve

If the response is lost **and** the worker never retries (closes the app and walks away), the Issue exists and the worker never sees the ID. That is not a duplicate problem — it is a confirmation problem, addressed by the Version 1 UI requirement in §2.9.

**Not implemented.**

---

## 2.7 HEIC / iPhone handling

### Existing validator behaviour — re-confirmed, unchanged

- `IMAGE_EXTENSIONS = [".jpg", ".jpeg"]`, `IMAGE_ACCEPT = "image/jpeg,.jpg,.jpeg"` (`lib/access/attachments.ts:51, 64`).
- `looksLikeJpeg()` requires bytes `FF D8 FF` (`:86-88`); a HEIC file begins `…ftypheic` and **fails**.
- Order is size → extension → **bytes decide** (`:194-230`), so renaming a HEIC to `.jpg` still fails.
- The message a user would see: *"…is not a valid JPEG image. Only real .jpg/.jpeg files are accepted."*
- **This validator is shared with the desktop path and is NOT being weakened.**

### Can the browser be instructed to produce JPEG?

Partially, and by request rather than by guarantee:

- `<input type="file" accept="image/jpeg" capture="environment">` tells the browser both *what is wanted* and *to prefer the camera*. `accept` is a filter/hint — it is **not enforceable**.
- **Android Chrome** camera captures are JPEG in the overwhelming majority of cases → expected to pass.
- **iPhone Safari** stores HEIC natively but has historically **transcoded to JPEG when a web form requests `image/jpeg`**. This is the behaviour Mobile Lite would depend on, and it is a *device behaviour*, not a repository fact.

### What happens on a real iPhone if HEIC does arrive

The file is rejected server-side by `looksLikeJpeg()` with the message above — **safe, but useless to a warehouse worker**, who cannot change their camera format mid-shift. Version 1 must therefore detect it **client-side** and say something actionable, e.g. *"This photo format is not supported. In Settings → Camera → Formats, choose 'Most Compatible', then retake."*

### Conversion options — deliberately not taken

- Canvas `toBlob('image/jpeg')` works only where the browser can decode HEIC (Safari yes, Android Chrome generally no), strips EXIF orientation, and costs memory proportional to the decoded bitmap (12 MP ≈ 48 MB RGBA) — a real risk on low-end devices.
- A decoding library (`heic2any`) adds roughly 1 MB of WASM/JS to a warehouse phone on a weak link.

**No conversion dependency added. No validator changed.**

### `REAL-DEVICE TESTING REQUIRED` — highest priority before Stage 5

Test matrix: iPhone (recent iOS, both "High Efficiency" and "Most Compatible" camera settings) × Safari; Android Chrome; both in a browser tab **and** as an installed home-screen PWA.

---

## 2.8 Recording duration

### Current behaviour

| Aspect | Value | Evidence |
|---|---|---|
| Duration cap | **None** — a counter increments but nothing stops recording | `VoiceRecorder.tsx:149-151` |
| Server size cap | **25 MB** per audio file | `MAX_AUDIO_BYTES`, `attachments.ts:25` |
| Count cap | 5 audio files per Issue | `MAX_AUDIO_FILES` |
| When size is enforced | **After the bytes reach the server** | `validateFile()` |
| Real recordings in the database | 20 KB – 911 KB, avg 217 KB (52 files, all historical imports) | live read-only query |

### Recommendation for Version 1: **3 minutes**, hard client-side stop with a visible countdown

| Format | ~bitrate | 3 minutes ≈ |
|---|---|---|
| Opus in WebM (Android/desktop Chrome) | 24–32 kbps | **0.5–0.7 MB** |
| AAC in MP4/M4A (iOS Safari) | 64–128 kbps | **1.4–2.9 MB** |

- 3 minutes is comfortably longer than a spoken warehouse observation (the existing corpus averages 217 KB ≈ well under a minute) and keeps the worst case ≈ 3 MB.
- It keeps the total submission inside the recommended 12 MB body limit **with both photos**.
- It prevents the current failure mode where a worker records for twenty minutes and is told only after a long upload that the file is too large.
- Implementation shape (Stage 5): auto-stop at the cap, show remaining time, and keep whatever was recorded rather than discarding it.

**Not implemented.**

---

## 2.9 Architecture verification

The Stage 1 recommendation:

```
/mobile → isolated mobile UI
        → thin app/mobile/actions.ts
        → existing validation (lib/access/attachments.ts)
        → existing uploadAttachment() (lib/cloudinary.ts)
        → existing createIssue() (lib/queries/issues.ts)
        → existing next_issue_id() (SQL)
        → PostgreSQL
```

**Confirmed as the safest architecture, with one conditional amendment.**

Why it remains safest:
- Zero duplication of issue-management logic — ID allocation, RED default, timestamps, transactional integrity and cleanup all stay in the single implementation the desktop already uses and that is already in production.
- Isolation is structural: `app/mobile/` inherits only the root layout, so no dashboard layout, sidebar or portal component is touched.
- Every safety property already proven in Stage 1 (byte validation, signed server-side uploads, all-or-nothing creation, orphan cleanup) is inherited rather than re-created.

**Conditional amendment (§2.5):** if the platform request-body ceiling is confirmed at ~4.5 MB, the *upload leg* must move to **signed direct-to-Cloudinary uploads from the browser**, with the Server Action receiving only the resulting identifiers. Everything downstream — `createIssue()`, `next_issue_id()`, PostgreSQL — is unchanged. This is an upload-transport change, not an architecture change.

Version 1 UI requirements that follow from the audits (Stage 5 input, not implemented):
- A blocking in-flight state that cannot be dismissed by accident.
- A success screen showing the **generated Issue ID** — the only proof the Issue committed.
- An error state that states plainly that nothing was saved and the recording is still held.

---

## 2.10 Repository state check (read-only)

| Check | Result |
|---|---|
| Branch | `feature/mobile-lite-pwa` |
| `git status --short` | `?? docs/mobile-lite-pwa-audit.md` only |
| Application files changed | **None** |
| `next.config.ts` | Untouched (still empty) |
| `proxy.ts` | Untouched |
| `lib/access/permissions.ts` | Untouched |
| `lib/access/attachments.ts` | Untouched |
| Packages installed | None |
| Migrations created | None |
| Database writes | **None** |
| `/mobile`, manifest, icons | Do not exist |

---

## 2.11 Stage 2 decision summary

| # | Decision | Status |
|---|---|---|
| 1 | Permission `issue:create_mobile` for `staff`, checked only by the Mobile Lite action | **Design approved — not implemented** |
| 2 | Raised By `WH` / "Warehouse Mobile", created via the existing Add Staff UI | **Path confirmed — row not created** |
| 3 | Person recorded in `extra_data` (3 server-derived keys) | **Proposed — display side-effect needs an owner call** |
| 4 | Domain `warehouse` | **OWNER DECISION REQUIRED** |
| 5 | Generated title/description wording | **Proposed above — owner to confirm wording** |
| 6 | `bodySizeLimit: '12mb'` + Mobile Lite per-file caps | **STOPPED FOR REVIEW — config not changed** |
| 7 | Platform ~4.5 MB request ceiling | **MUST VERIFY — may force signed direct upload** |
| 8 | Idempotency via submission key + advisory lock + `extra_data` | **Design approved — no migration required — not implemented** |
| 9 | HEIC: request JPEG, reject clearly, never weaken the validator | **Confirmed — real-device testing required** |
| 10 | Recording cap 3 minutes | **Recommended — not implemented** |

**Stage 2 verdict: PASS.** Two items block Stage 3 from becoming Stage 5 work: the body-size/platform-ceiling question (6 + 7) and the Domain decision (4). Neither prevents Stage 3 (route skeleton) from starting once approved.

---
---

# Stage 1 Audit Closure

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **Read-only. Nothing implemented.**
Database identity re-confirmed: `current_database = varmen_db`, `current_user = varmen_user`. No write statement executed.
All earlier Stage 1, Extended Audit and Stage 2 findings above are preserved unchanged.

---

## C.1 Upload architecture — DECIDED

### A. Deployment platform

**Vercel.** Evidence: `.vercel/project.json` and `postage-workspace/.vercel/project.json` both link to the same project, `projectName = "issue-tracker"`; production was deployed from this repository with `vercel --prod` (deployment `dpl_GkN8nHrmMuisjJwKbdWyZTFvRtXY`, aliases `issue-tracker-bice-six.vercel.app` and `issue-tracker-jk-4f13.vercel.app`).

### B. Inbound request-body limit — first-party documentation

Vercel Functions Limits (`https://vercel.com/docs/functions/limitations`, "Request body size", last updated 2026-07-01):

> *"The maximum payload size for the request body or the response body of a Vercel Function is **4.5 MB**. If a Vercel Function receives a payload in excess of the limit it will return an error 413: `FUNCTION_PAYLOAD_TOO_LARGE`."*

Vercel additionally publishes a dedicated guide, *"How do I bypass the 4.5MB body size limit of Vercel Functions"*, linked directly from that limit — confirming the documented remedy is **not** a configuration increase.

### C. Would raising `serverActions.bodySizeLimit` work in production?

**No.** The 4.5 MB ceiling is enforced by the platform **before the request reaches the Next.js runtime**, so `experimental.serverActions.bodySizeLimit` cannot lift it. The intended Mobile Lite payload — 2 evidence photos (~5 MB each) + 1 voice recording — is roughly 11 MB and would be rejected with a 413 regardless of the Next.js setting. The Stage 2 recommendation of `'12mb'` is therefore **withdrawn**: it would have worked locally and failed in production, which is the worst possible outcome.

### D. Would a Route Handler avoid the limit?

**No.** The limit is documented against **Vercel Functions**, which is what a Route Handler, a Server Action and a rendered route all compile to on this platform. Changing the entry point does not change the ceiling.

### E. Is signed browser → Cloudinary upload feasible with the existing setup?

**Yes, with no new dependency and no secret exposure.** Evidence from `postage-workspace/lib/cloudinary.ts`:

- `sign(params, apiSecret)` (`:102-108`) already computes Cloudinary's SHA-1 signature server-side; it is a pure function of the signed parameters and the secret.
- `readConfig()` (`:66-84`) reads `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` from `process.env` inside a `server-only` module.
- Cloudinary's signed-upload contract requires the browser to hold only `api_key`, `timestamp` and `signature` — **`api_secret` never leaves the server**, exactly as today. The existing header already documents this posture: *"the browser never receives a key, a signature, or an upload preset"* — under Option B it receives a **short-lived signature scoped to one upload**, still never the secret.
- The existing `deleteAttachments()` (`:235-270`) remains usable for cleanup of assets whose Issue was never created.

**What changes:** the browser POSTs each file directly to `api.cloudinary.com`; the Server Action then receives only `public_id` / `secure_url` / `bytes` / `mime_type` — a JSON body of a few hundred bytes, far under 4.5 MB.
**What does not change:** `createIssue()`, `next_issue_id()`, the RED default, `extra_data` shapes, the Issue detail rendering, and the database.

**One consequence to design for (Stage 5/6):** byte-level validation currently happens on the server *before* upload (`validateFile()` sniffs magic bytes). With direct upload, the bytes no longer pass through our server, so validation must be performed **client-side before upload** and re-asserted server-side from Cloudinary's returned metadata (`resource_type`, `format`, `bytes`). `lib/access/attachments.ts` is a pure module with no `server-only` import, so its existing validators can be reused in the browser **without modification**.

### UPLOAD ARCHITECTURE: **OPTION B — Signed direct Cloudinary upload**

Reason: Vercel documents a hard 4.5 MB request-body limit for every Function; the intended payload is ~11 MB; no Next.js configuration or alternative route type can raise it; and the repository already contains server-side Cloudinary signing that supports the documented remedy without exposing a secret or adding a dependency.

---

## C.2 Raised By / `staff_code` — DECIDED

Re-confirmed from schema, code and live data (Extended Audit §A): `issue_staff` has **no foreign key, no join column and no code path** to `management_users` or `assignment_users`; its columns are `staff_code, staff_name, active, created_at, updated_at`; and the five stored Raised By people (Atisraj, Nandhi, Nivarnan, Sasi, Sathis) have **zero name overlap** with the eleven login accounts. No repository code maps a user to a `staff_code`.

### STAFF_CODE STRATEGY: **C. GENERIC WH REPORTER REQUIRES OWNER APPROVAL**

**Minimum owner/data decision needed:** approve creation of **one** `issue_staff` row — `staff_code = WH`, `staff_name = Warehouse Mobile` — through the existing `/dashboard/issues/add-staff` page, performed by a Super Admin. `WH` satisfies the existing `/^[A-Z0-9]{1,10}$/` rule and the name is within the 100-character limit.

- **No migration.** This is one INSERT through a page that already exists.
- **No schema change.** Nothing is added to any table definition.
- The `WH` ID counter is created automatically by `next_issue_id()` on the first Issue (`WH-001`, `WH-002`…), and `chk_issue_staff_prefix` guarantees no collision with ND/AT/SA/NV/ST.
- The individual worker stays identifiable through server-derived `extra_data` keys (Stage 2 §2.2) — the channel is the Raised By, the person is on the record.

Option B (one row per worker) remains available but requires a hand-maintained username→code map and more owner effort; it is not recommended for Version 1.

---

## C.3 Domain — DECIDED

Verified against live data and code:

| Question | Answer |
|---|---|
| Exact stored value | **`inventory`** — lower case, as stored in `issues.category` |
| Existing use | **22 Issues**, all currently assigned to Manoranjani |
| Affects Issue-ID generation? | **No** — IDs come from `next_issue_id(staff_code)`; category is not an input |
| Affects RED/AMBER/GREEN workflow? | **No** — `lib/access/issueWorkflow.ts` and `issueStatus.ts` never read category |
| Affects assignment? | **No** — `issue_assignments` keys on `assignee_id`; the new RED-only gate reads `issues.status` only |
| Affects authorization? | **No** — `lib/access/permissions.ts` contains no category logic |
| Where category is used | display, filtering (`i.category = $8`), sorting (`domain: "i.category"`), and the AI prompt — nothing else |
| Validation | `CHECK (btrim(category) <> '')`, `varchar`, app cap 50 characters, free text with datalist suggestions |

### MOBILE LITE DOMAIN: **INVENTORY — SAFE**

Canonical stored value to use verbatim: **`inventory`**

Technically safe in every respect: no logic depends on the value, no data change is needed for the Domain to "exist", and a Super Admin can re-classify any individual Issue later. One note for the owner, recorded once and not re-litigated: `inventory` currently denotes a curated set of 22 stock-accuracy Issues with a single owner, so warehouse voice reports about damage, couriers or picking will also land there. That is an operational preference, not a technical risk. **No Issue was updated and no Domain was created or renamed.**

---

## C.4 Idempotency — DECIDED

Assessed against the four scenarios:

| Scenario | Current outcome |
|---|---|
| Double tap | Blocked by `disabled={pending}` only while the page lives |
| Weak network | Upload may complete, response may not arrive |
| **Lost response after DB COMMIT** | **Issue exists; worker sees an error; a retry creates a SECOND Issue with a second ID** |
| Browser retry / reload | Same as above — nothing links the two attempts |

Warehouse connectivity is explicitly the expected operating condition, and Option B makes retries *more* likely to be partial (files already in Cloudinary, Issue not yet created). The failure is silent, produces duplicate operational records, and the worker has no way to detect it.

### IDEMPOTENCY: **REQUIRED FOR VERSION 1**

**Smallest future design (unchanged from Stage 2 §2.6, still requiring no migration):**

1. The client generates one `crypto.randomUUID()` per report and persists it (component state + `sessionStorage`), reusing it for every retry until a confirmed success.
2. Inside the existing `createIssue()` transaction: `SELECT pg_advisory_xact_lock(hashtext($key))` — a built-in function, no table needed, released automatically at COMMIT/ROLLBACK.
3. `SELECT issue_id FROM issue_tracking.issues WHERE extra_data->>'mobileSubmissionId' = $key LIMIT 1` — if a row exists, **return that Issue ID and insert nothing**.
4. Otherwise allocate the ID and INSERT with `extra_data.mobileSubmissionId = $key`.
5. Any Cloudinary assets uploaded by the duplicate attempt are removed with the existing `deleteAttachments()`.

**No database change, no migration, no index required** at this data volume (144 rows). A partial index would be a later optimisation needing separate approval.

---

## C.5 Real-device UAT

**HEIC: REAL IPHONE UAT REQUIRED**
Repository evidence is settled — `looksLikeJpeg()` requires `FF D8 FF`, HEIC begins `…ftypheic` and is rejected, and the shared validator will not be weakened. Whether an iPhone actually delivers JPEG when the form requests `image/jpeg` is a device behaviour that only hardware can prove. Test both camera settings ("High Efficiency" and "Most Compatible"), in Safari and as an installed home-screen PWA.

**ANDROID CAMERA: REAL ANDROID UAT REQUIRED**
Android Chrome is expected to deliver JPEG from `capture="environment"`, but this must be proven on a real device, in a tab and as an installed PWA.

Neither is an audit blocker: repository evidence does not show the flow cannot work, only that the output format is device-determined.

Additional UAT to run in the same session: microphone permission inside a standalone PWA; `MediaRecorder` availability on the actual iOS version; playback of an Android-recorded WebM/Opus file on an iPhone reviewer's browser (expected to fail — Safari does not support WebM); ≤360 px layout and orientation changes.

---

## C.6 Reclassification of earlier warnings

| Warning (source) | Classification |
|---|---|
| Server Action 1 MB limit / `next.config.ts` empty | **NO LONGER BLOCKING** — superseded by Option B; no config change needed |
| Vercel 4.5 MB platform ceiling | **NO LONGER BLOCKING** — quantified and designed around |
| `staff` lacks `issue:create` | **IMPLEMENTATION ITEM** — add `issue:create_mobile` (Stage 6) |
| No user→`staff_code` mapping | **OWNER DECISION** — approve the `WH` row |
| Domain undecided | **RESOLVED** — `inventory` |
| No idempotency | **IMPLEMENTATION ITEM** — required for Version 1 |
| No upload timeout | **IMPLEMENTATION ITEM** — client-side `AbortSignal` on the direct upload |
| No recording duration cap | **IMPLEMENTATION ITEM** — 3-minute client cap |
| HEIC / iPhone | **UAT ITEM** |
| Android camera output | **UAT ITEM** |
| Safari cannot play WebM/Opus | **UAT ITEM** |
| `/mobile` unprotected by `proxy.ts` | **IMPLEMENTATION ITEM** — two additive lines + page guard |
| No proxy/session/creation tests | **IMPLEMENTATION ITEM** — add with the feature |
| `tests/access.test.ts` "exactly that set" will fail on the new key | **IMPLEMENTATION ITEM** — update deliberately |
| `extra_data` keys surface in "Additional details" | **OWNER DECISION** — show or hide the submitter keys |
| Title/description wording | **OWNER DECISION** — confirm the proposed strings |
| PWA icons do not exist | **IMPLEMENTATION ITEM** — two PNGs |
| Gemini token diagnostic in production | **NO LONGER BLOCKING** — unrelated to Mobile Lite |

---

## C.7 Implementation readiness

| Question | Answer |
|---|---|
| Which upload architecture? | **Option B — signed direct Cloudinary upload** |
| How is `staff_code` obtained? | One approved `WH` / "Warehouse Mobile" row via the existing Add Staff UI |
| Which Domain? | **`inventory`** |
| Does Version 1 need idempotency? | **Yes** — submission key + advisory lock + `extra_data`, no migration |
| What needs real hardware? | iPhone HEIC, Android camera output, PWA permissions, Safari WebM playback |
| Database change required? | **NO** |
| Migration required? | **NO** |
| New dependencies required? | **NO** |
| Application implementation started? | **NO** |

**Revised stage plan** (Stage 3 onward, not started):

| Stage | Content |
|---|---|
| 3 | `/mobile` route skeleton + page-level auth guard + additive `proxy.ts` protection + route-protection test |
| 4 | Capture UI: recording (3-minute cap) + two photo inputs, client-side byte validation reusing `lib/access/attachments.ts` |
| 5 | Signed-upload endpoint (server issues a scoped signature) + browser → Cloudinary direct upload with timeout and abort |
| 6 | `registerMobileIssueAction`: `issue:create_mobile`, idempotency key, `createIssue()` with `WH` + `inventory` + generated title/description; tests |
| 7 | PWA shell: `app/manifest.ts`, two icons, scoped iOS metadata |
| 8 | Regression suite + real-device UAT on iPhone and Android |

### FINAL AUDIT STATUS: **AUDIT COMPLETE — READY FOR IMPLEMENTATION PLANNING**

---
---

# Stage 2 — Approved Implementation Plan

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **PLANNING ONLY — nothing implemented.**
No application file, permission, configuration, database row, migration, package or PWA asset was created or changed. No database access was required for this stage.
All Stage 1, Extended Audit, Stage 2 review and Audit Closure sections above are preserved unchanged.

---

## P.1 Final architecture

```
Warehouse phone (installed PWA or browser tab)
  │
  ├─ 1. GET /mobile ......................... session required (page guard + proxy)
  │
  ├─ 2. capture: 1 voice recording + 2 JPEG photos (browser-native, no library)
  │        client-side validation reuses lib/access/attachments.ts (pure module)
  │
  ├─ 3. request upload signature (Server Action, tiny JSON)
  │        auth: session + issue:create_mobile
  │        returns: cloudName, apiKey, timestamp, signature, folder, publicId, resourceType
  │
  ├─ 4. browser POSTs each file DIRECTLY to api.cloudinary.com (bypasses Vercel's 4.5 MB limit)
  │
  ├─ 5. REGISTER → metadata-only Server Action (a few hundred bytes)
  │        auth + submission UUID + 3 expected public_ids
  │        server independently verifies each asset with Cloudinary's Admin API
  │        └─ existing createIssue() → next_issue_id() → 'RED' → CURRENT_DATE → PostgreSQL
  │
  └─ 6. confirmation screen: "Issue Registered — <ID>"
```

Nothing downstream of step 5 changes: `createIssue()`, `next_issue_id()`, the RED literal, the timestamps, `extra_data.images`, `extra_data.attachments`, the Issue detail rendering and the whole desktop experience are untouched.

---

## P.2 Cloudinary direct-upload design

Answering each required point against the **actual** `postage-workspace/lib/cloudinary.ts`.

**1. Server-side entry point.** New file `app/mobile/upload-actions.ts`, one exported Server Action:
`requestMobileUploadSignature({ submissionId, slot })` where `slot ∈ { "photo-1", "photo-2", "voice" }`.
It calls a **new additive export** in `lib/cloudinary.ts` — `createSignedUploadParams()` — which reuses the existing private `sign()` (`:102-108`) and `readConfig()` (`:66-84`). **No existing function is modified.**

**2. Authentication required before a signature is issued.** `getCurrentUser()`; null → refuse. Same session mechanism as every other action.

**3. Mobile-specific authorization.** `hasPermission(user, "issue:create_mobile")`. A holder of desktop `issue:create` alone does **not** get a signature — the keys are independent.

**4. Signed parameters.** Exactly the set the existing `sign()` contract supports, in sorted order:
`public_id`, `timestamp`, `overwrite=false`.
Per Cloudinary's contract (documented in `lib/cloudinary.ts:96-101`), `api_key`, `file`, `resource_type` and `signature` are **excluded** from the signed string. `folder` is not sent separately because the folder is embedded in `public_id`.

**5. Freshness/expiry.** Two layers:
   a. Cloudinary rejects a signature whose `timestamp` is more than **1 hour** old — the natural expiry, no state required.
   b. The `public_id` is **server-composed and bound to the submission**: `issue-tracker/mobile/<submissionId>/<slot>`. A signature is therefore usable only for the one asset path it was minted for; it cannot be replayed to write anywhere else.

**6. What the browser receives.** `{ cloudName, apiKey, timestamp, signature, publicId, resourceType }` — `resourceType` is `image` for photos and `video` for audio, matching the existing `RESOURCE_TYPE` map (`:110-113`).

**7. `api_secret` never reaches the client.** `lib/cloudinary.ts` imports `server-only`, making a client import a **build error**. `readConfig()` and `sign()` are module-private; only the six fields above are returned. `api_key` is Cloudinary's public identifier and is safe to expose — this is the standard signed-upload contract and is what makes the secret unnecessary in the browser.

**8. Separate handling per kind.**
   - **image/jpeg** → `resource_type=image`, `public_id` ends `photo-1` / `photo-2`.
   - **audio** → `resource_type=video` (Cloudinary stores audio under video, per the existing comment `:32-37`), accepted browser containers `audio/webm` and `audio/mp4` as produced by `MediaRecorder`.

**9. Mobile-specific size limits** (enforced client-side before upload **and** re-checked server-side from Cloudinary's reported `bytes`; the shared desktop caps are NOT changed):
   - photo ≤ **5 MB** each (desktop global cap stays 10 MB)
   - voice ≤ **5 MB** (desktop global cap stays 25 MB)

**10. Asset metadata returned to the client.** Cloudinary's upload response gives `public_id`, `secure_url`, `bytes`, `format`, `resource_type`. The client keeps only `public_id` per slot; everything else is re-fetched server-side (point 12) rather than trusted.

**11. What the registration action accepts.** `{ submissionId, photo1PublicId, photo2PublicId, voicePublicId }` — three strings and a UUID. **No URLs, no bytes, no MIME types, no filenames from the client.**

**12. Independent server-side verification.** For each public_id the action calls a **new additive** `lib/cloudinary.ts` export, `getUploadedAsset(publicId, resourceType)`, hitting Cloudinary's Admin API with server-side credentials, and asserts:
   - the asset exists;
   - `resource_type` matches the slot;
   - `format` is `jpg`/`jpeg` for photos, and an accepted audio container for the recording;
   - `bytes` is within the mobile caps;
   - the returned `secure_url` is `https://`.
   Only then are `secure_url` / `bytes` / `format` taken **from Cloudinary's response** and written to `extra_data`.

**13. Preventing attachment of an arbitrary Cloudinary asset.** The action recomputes the expected public_id from the session and the submission UUID and requires an **exact string match**:
`issue-tracker/mobile/<submissionId>/photo-1|photo-2|voice`.
A public_id from any other folder — including another worker's submission or a historical Issue's asset — fails the comparison before any network call. This is the primary defence; point 12 is the secondary one.

**14. Abandoned uploads.** A worker who uploads and never presses REGISTER leaves assets under `issue-tracker/mobile/<submissionId>/`. No Issue references them and no user-facing surface reads that folder. Cleanup is a **later housekeeping task** (a Cloudinary folder lifecycle rule or a manual sweep), not a Version 1 blocker — the same "orphaned storage is cost, never corruption" position the desktop path already takes (`lib/cloudinary.ts:226-234`).

**15. Failed registration.** If verification passes but `createIssue()` throws, the action calls the **existing** `deleteAttachments()` with the three verified assets — the same rollback the desktop path already performs.

**16. Retry/idempotency interaction.** Because the folder is keyed by submission UUID and `overwrite=false` is signed, a retry of the *same* report re-uses the *same* public_ids. Cloudinary returns the existing asset rather than creating a duplicate, and the idempotency check (P.4) returns the original Issue ID. **A retry therefore produces neither a duplicate Issue nor duplicate media.**

**17. Desktop media behaviour unchanged.** `uploadAttachment()`, `deleteAttachments()`, `validateFile()`, `looksLikeJpeg()`, `looksLikeAudio()`, every limit constant and `app/dashboard/issues/new/actions.ts` are **not modified**. The two new Cloudinary exports are additive; the desktop form keeps uploading through the Server Action exactly as it does today.

---

## P.3 Authorization plan

**Exact `lib/access/permissions.ts` change** (two lines, both additive):
1. add `| "issue:create_mobile"` to the `Permission` union;
2. add `"issue:create_mobile"` to the **`staff`** set only.
`admin` and `management` are **not** given it — Mobile Lite is a warehouse channel, and no desktop role needs it.

**Exact checks in the future Mobile Lite code** — three independent gates, all server-side:
- `app/mobile/page.tsx` — `getCurrentUser()` → `redirect("/login")`; then `hasPermission(user, "issue:create_mobile")` → a plain "not available for this account" page.
- `app/mobile/upload-actions.ts` — both checks again before minting a signature.
- `app/mobile/actions.ts` — both checks again before registering.

**What it must never grant:** desktop `issue:create` stays exactly as it is, so `app/dashboard/issues/new/actions.ts:174`, `new/page.tsx:17` and `issues/page.tsx:144` continue to refuse `staff`. No change to `issue:assign`, `issue:delete`, `user:manage`, `tracker:view`, `discussion:*`, or the status/assignment workflow.

**Tests needing updates:**
- `tests/access.test.ts:91` — "holds exactly three permissions" → four.
- `tests/access.test.ts:66`/`:91` — the "exactly that set and nothing more" assertions.
- **New assertion (required):** `staff` holds `issue:create_mobile` **and still does not hold `issue:create`**.
- **New assertion:** `admin` and `management` do **not** hold `issue:create_mobile`.

**Route protection for `/mobile`:** two additive lines in `proxy.ts` — `"/mobile"` in `PROTECTED_PATH_PREFIXES` and `"/mobile/:path*"` in `config.matcher` — plus the page guard above. No existing prefix or matcher entry is edited.

---

## P.4 Idempotency plan

| Question | Answer |
|---|---|
| **1. When is the UUID generated?** | `crypto.randomUUID()` when a **new report is started** (page mount / "New report" tap) — *before* capture, because the upload folder is keyed by it |
| **2. How long does it persist?** | For the life of that report: component state **and** `sessionStorage`, so a refresh or an accidental back-navigation reuses it |
| **3. When is a new one generated?** | Only after a **confirmed success** (Issue ID shown) or an explicit "Start new report" |
| **4. On retry** | Same UUID → same public_ids → Cloudinary returns existing assets → server finds the committed Issue (if any) and returns its ID, or completes the registration that never finished |
| **5. Lost response after COMMIT** | The retry's lookup finds `extra_data.mobileSubmissionId = <uuid>`, returns **the original Issue ID**, inserts nothing, and the worker finally sees the confirmation they missed |
| **6. Two simultaneous REGISTER requests** | The first takes `pg_advisory_xact_lock(hashtext($uuid))`; the second blocks until the first COMMITs, then its lookup finds the row and returns the same ID. **Exactly one Issue.** |
| **7. Duplicate Cloudinary uploads** | Prevented structurally: deterministic public_id + signed `overwrite=false`. If a stray asset is ever created it is removed by `deleteAttachments()` on the no-op path |
| **8. Is `pg_advisory_xact_lock(hashtext(...))` still preferred?** | **Yes** — it is a built-in requiring no table, no migration and no cleanup, and it is released automatically at COMMIT/ROLLBACK. The direct-upload architecture does not change this: the race is on the Issue insert, not on the upload |
| **9. Is a migration/UNIQUE constraint needed for Version 1?** | **No.** The advisory lock provides the mutual exclusion a UNIQUE index would provide, and the lookup over 144+ rows is trivial. A partial index on `(extra_data->>'mobileSubmissionId')` is a **future performance option** requiring separate approval |

Implementation location: inside the **existing** `createIssue()` transaction, via a new optional parameter (e.g. `idempotencyKey`) — additive, ignored by the desktop caller. Alternative if we prefer zero change to `createIssue()`: a thin `createMobileIssue()` wrapper in `lib/queries/issues.ts` that opens the transaction, takes the lock, performs the lookup, and delegates. **Decide at Stage 5; both avoid duplicating business logic.**

---

## P.5 Raised By / `staff_code` plan

**Preferred approach — system reporter.** One `issue_staff` row: `staff_code = WH`, `staff_name = Warehouse Mobile`.

**The ONE data operation required later:** a Super Admin adds that row through the existing `/dashboard/issues/add-staff` page (person type "Raised By"). `WH` satisfies `/^[A-Z0-9]{1,10}$/`; the name is within the 100-character cap; the write touches `issue_tracking.issue_staff` only. The `WH` ID counter appears automatically on the first Issue (`WH-001`…), and `chk_issue_staff_prefix` guarantees no collision.

**NOT EXECUTED. No script, no SQL, no migration, no credentials, and no change to `assignment_users` or `management_users`.**

**Individual accountability.** The authenticated worker is captured server-side from the session — never from the request body — and written to `extra_data` (P.6). The channel is the Raised By; the person is on the record.

---

## P.6 `extra_data` contract

Reusing existing structures wherever they exist; **nothing is duplicated**.

**Existing keys, written exactly as the desktop path already writes them:**

| Key | Purpose | Rendered by |
|---|---|---|
| `images[]` | `{url, public_id, original_name}` — the two photos, legacy three-key shape | existing IMAGES / ATTACHMENTS gallery |
| `attachments[]` | `{type, url, public_id, original_name, mime_type, source, bytes}` — all three assets; audio carries `source: "voice_recording"` | existing gallery + AUDIO ATTACHMENTS player |

**New Mobile Lite keys:**

| Key | Example | Visibility |
|---|---|---|
| `mobileReporter` | `"arun"` | **USER-VISIBLE** — renders as "Mobile Reporter" in Additional details, giving accountability at a glance |
| `mobileSubmissionId` | UUID | **INTERNAL/HIDDEN** |
| `mobileReporterUserId` | `50` | **INTERNAL/HIDDEN** |
| `mobileSource` | `"mobile-lite"` | **INTERNAL/HIDDEN** |

**Hiding mechanism:** add the three internal keys to the existing `HIDDEN_META_KEYS` in `components/issues/IssueDetail.tsx` — the same list that already hides five ingestion-provenance keys. Additive; no existing key's behaviour changes.

---

## P.7 Photo and audio capture plan

**Photos — exactly two.**
- `<input type="file" accept="image/jpeg" capture="environment">` per slot; browser-native, no library.
- Client-side check before upload: **JPEG magic bytes** (`FF D8 FF`) read from the first 16 bytes via `FileReader`/`arrayBuffer()`, reusing **`looksLikeJpeg()` from `lib/access/attachments.ts`** — a pure module with no `server-only` import, so it imports cleanly into a Client Component **without modification**.
- Size check ≤ 5 MB before upload.
- **HEIC rejection message (actionable):** *"This photo is in a format we can't accept (HEIC). On iPhone: Settings → Camera → Formats → Most Compatible, then retake the photo."*
- Server re-verifies `format` from Cloudinary after upload (P.2 §12).
- **The global desktop validator is not relaxed in any way.**

**Voice — exactly one.**
- Browser-native `MediaRecorder`, negotiating `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`, with a file-input fallback when unsupported — the same proven approach as `VoiceRecorder.tsx`. Mobile Lite gets **its own component**; the desktop one is not imported or refactored.
- Client-side check: accepted container by magic bytes (`looksLikeAudio()`), ≤ 5 MB.
- **Duration limit: 3 minutes proposed** — a **product decision, owner-confirmable**, not a database or architecture requirement. It exists to keep uploads small on weak links and to prevent a 20-minute recording failing after a long upload. Implemented as an auto-stop with a visible countdown that **keeps** what was recorded.
- **No conversion library** for Version 1 unless UAT proves one necessary.

---

## P.8 PWA plan

Minimum Version 1, native only:

| Item | File | Notes |
|---|---|---|
| Manifest | **`app/manifest.ts`** | `MetadataRoute.Manifest`; `name`, `short_name`, `start_url: "/mobile"`, `display: "standalone"`, `background_color`, `theme_color`, `icons` |
| Icons | **`public/icons/mobile-192.png`**, **`public/icons/mobile-512.png`** | plus `public/icons/apple-touch-icon.png` for iOS |
| Metadata | **`app/mobile/layout.tsx`** | `viewport`, `apple-mobile-web-app-capable`, status-bar style, `apple-touch-icon` — **scoped to `/mobile`**, root layout untouched |
| Standalone display | manifest `display` | Android install prompt; iOS via Share → Add to Home Screen |

**No service worker, no offline drafts, no push notifications, no PWA package.** HTTPS is already provided by the platform.

---

## P.9 Automated test plan

**New test files**

| File | Covers |
|---|---|
| `tests/mobilePermissions.test.ts` | `staff` holds `issue:create_mobile`; `staff` still **lacks** `issue:create`; `admin`/`management` lack the mobile key; unauthenticated holds nothing |
| `tests/routeProtection.test.ts` | `/mobile` protected; the four existing `/dashboard/**` prefixes still protected (regression pin) |
| `tests/mobileUploadSignature.test.ts` | signature refused without session/permission; public_id is server-composed and bound to submission+slot; secret never in the returned shape |
| `tests/mobileRegistration.test.ts` | rejects a foreign/mismatched public_id; requires exactly 2 photos + 1 voice; server-derived `WH`, `inventory`, RED, title, description; client cannot override any of them |
| `tests/mobileIdempotency.test.ts` | same UUID twice → one Issue, same ID returned; concurrent submissions → one Issue |
| `tests/mobileCleanup.test.ts` | failed `createIssue()` → `deleteAttachments()` called with all three assets |

**Existing regression suites to re-run** (identified by the audit): `access.test.ts` (updated), `attachments.test.ts`, `issueAudioAttachments.test.ts`, `assigneeWorkflow.test.ts`, `issueWorkDetails.test.ts`, `issueDetailView.test.ts`, `issueDetailMarkup.test.ts`, `accountSettings.test.ts`, `assigneeValidation.test.ts`.

**Live-database verification** (rolled back, following `scripts/verify-assignee-transactions.ts`): Issue ID allocation for a new prefix; RED default; idempotency under concurrency.

**Required implementation gate: `npm run build` must pass** before any stage is considered complete.

---

## P.10 Manual UAT plan

| # | Test | Pass criteria |
|---|---|---|
| 1 | iPhone camera / HEIC | Photo uploads, or the actionable HEIC message appears with correct guidance |
| 2 | Android camera | Photo uploads as JPEG |
| 3 | iPhone microphone | Recording works or the file-input fallback appears; result plays back on the detail page |
| 4 | Android microphone | Recording works; note whether the resulting WebM plays on an iPhone reviewer's browser |
| 5 | Installed PWA (both platforms) | Installs to home screen, opens standalone, camera and microphone permissions still work |
| 6 | ≤360 px screen | All four controls reachable, nothing clipped, no horizontal scroll |
| 7 | Portrait/landscape | Layout survives rotation mid-capture |
| 8 | Weak network / airplane mode mid-submit | Clear failure message; retry produces **one** Issue, not two |
| 9 | Double tap REGISTER | Exactly one Issue |
| 10 | End-to-end in the Web Issue Tracker | Issue visible, RED, Raised By "Warehouse Mobile", Domain Inventory, voice plays, both photos open, then assignment → investigation → resolution all still work |

---

## P.11 Implementation stages

### Stage 3 — Authorization + isolated `/mobile` shell + signing foundation
- **New:** `app/mobile/layout.tsx`, `app/mobile/page.tsx`, `app/mobile/upload-actions.ts`, `tests/mobilePermissions.test.ts`, `tests/routeProtection.test.ts`, `tests/mobileUploadSignature.test.ts`
- **Modified:** `lib/access/permissions.ts` (+2 lines), `proxy.ts` (+2 lines), `lib/cloudinary.ts` (**additive export** `createSignedUploadParams()`), `tests/access.test.ts`
- **Database writes:** none
- **Safety checks:** desktop `issue:create` unchanged; the four existing protected prefixes pinned by test; `server-only` still guards the secret
- **Acceptance:** `/mobile` renders a placeholder for an authorised `staff` user, redirects when signed out, refuses a user without the key; a signature can be minted; `npm run build` passes

### Stage 4 — Capture + signed direct upload
- **New:** `components/mobile/MobileVoiceRecorder.tsx`, `components/mobile/MobilePhotoInput.tsx`, `components/mobile/MobileCaptureForm.tsx`, `lib/access/mobileMedia.ts` (mobile-only caps + client validation helpers)
- **Modified:** `app/mobile/page.tsx`
- **Database writes:** none
- **Safety checks:** global validators untouched; no desktop component imported; upload aborts on timeout
- **Acceptance:** three files reach Cloudinary under `issue-tracker/mobile/<uuid>/`; oversized/HEIC files rejected client-side with the correct message

### Stage 5 — Registration + idempotency + cleanup
- **New:** `app/mobile/actions.ts`, `app/mobile/registered/page.tsx` (or an in-page success state), `tests/mobileRegistration.test.ts`, `tests/mobileIdempotency.test.ts`, `tests/mobileCleanup.test.ts`
- **Modified:** `lib/cloudinary.ts` (**additive** `getUploadedAsset()`), `lib/queries/issues.ts` (additive `idempotencyKey` parameter **or** a `createMobileIssue()` wrapper), `components/issues/IssueDetail.tsx` (`HIDDEN_META_KEYS` +3)
- **Database writes:** **the first real Issue INSERTs** — Mobile Lite test Issues only, after the `WH` row exists
- **Safety checks:** public_id binding; Admin-API verification; advisory-lock idempotency; `deleteAttachments()` on failure; server-derived staff/domain/title/description/status
- **Acceptance:** one press = one Issue; retry returns the same ID; the Issue appears correctly in the Web Issue Tracker with voice and both photos

### Stage 6 — PWA shell + full regression
- **New:** `app/manifest.ts`, `public/icons/mobile-192.png`, `public/icons/mobile-512.png`, `public/icons/apple-touch-icon.png`
- **Modified:** `app/mobile/layout.tsx` (metadata)
- **Database writes:** none
- **Acceptance:** installs on Android and iOS; whole suite green; `npm run build` passes

### Stage 7 — UAT and final verification
- **New/Modified:** none expected (fixes only if UAT finds defects)
- **Acceptance:** the ten UAT tests in P.10 pass on real hardware

---

## P.12 Files expected to change

**Created:** `app/mobile/layout.tsx` · `app/mobile/page.tsx` · `app/mobile/upload-actions.ts` · `app/mobile/actions.ts` · `app/mobile/registered/page.tsx` · `components/mobile/MobileCaptureForm.tsx` · `components/mobile/MobileVoiceRecorder.tsx` · `components/mobile/MobilePhotoInput.tsx` · `lib/access/mobileMedia.ts` · `app/manifest.ts` · three icon files · six new test files.

**Modified (all additive):** `lib/access/permissions.ts` · `proxy.ts` · `lib/cloudinary.ts` · `lib/queries/issues.ts` · `components/issues/IssueDetail.tsx` · `tests/access.test.ts`.

**Explicitly NOT modified:** `next.config.ts` (the body-limit change is no longer needed) · `lib/access/attachments.ts` · `app/dashboard/**` · `lib/access/issueWorkflow.ts` · `lib/access/issueWorkDetails.ts` · any migration · `package.json`.

**Database change: NO · Migration: NO · New dependencies: NONE.**

---

## P.13 Owner approvals still required

1. **Create the `WH` / "Warehouse Mobile" Raised By row** (one data operation, existing UI, before Stage 5).
2. **Confirm the title pattern** `Warehouse report — <username> — <DD/MM/YYYY HH:MM>`.
3. **Confirm the description wording** (voice recording is the primary evidence; two photos attached).
4. **Confirm `mobileReporter` is user-visible** while the other three keys are hidden.
5. **Confirm the 3-minute recording cap** (product choice, changeable later).
6. **Confirm mobile size caps** (5 MB photo, 5 MB voice).

---

## P.14 Warnings carried into implementation

- Abandoned-upload housekeeping is deferred (storage cost only) — schedule a Cloudinary lifecycle rule after Version 1.
- Safari cannot play WebM/Opus: an Android recording may not play back for an iPhone reviewer (UAT #4).
- `tests/access.test.ts` will fail the moment the permission is added until updated — by design.
- Cloudinary Admin API usage in Stage 5 adds one server→Cloudinary round trip per asset; acceptable at this volume.
- The `inventory` Domain will now receive general warehouse reports as well as curated stock-accuracy Issues.

### Stage 2 verdict: **READY FOR IMPLEMENTATION** (Stage 3 may begin on approval).

---
---

# Stage 2A — Final Authorization and Owner Defaults

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **Correction to the Stage 2 plan. Nothing implemented.**
Database identity re-confirmed: `current_database = varmen_db`, `current_user = varmen_user`. Read-only; no write statement executed.

---

## A.1 The authorization assumption was wrong — corrected

The Stage 2 plan proposed granting `issue:create_mobile` to the existing **`staff`** role. Re-examined against evidence rather than the role name:

### What `staff` actually means today

| Role | Accounts | Also a linked Assignee | Not an Assignee |
|---|---:|---:|---:|
| `admin` | 1 | 0 | 1 |
| **`staff`** | **10** | **10** | **0** |

**Every single `staff` account is a linked Assignee.** Not one exists that is not. Corroborating evidence:

- `lib/access/permissions.ts:12-13` defines the role explicitly: *"Assignee = DB role 'staff', scoped to Issues currently assigned to them"*, and the `staff` set comment reads *"ASSIGNEE"* (`:78`).
- The ten accounts are Suman, Varman, Bietrick, Janani, Luxsika, Manoranjani, Mayurika, Muguntha, Rajiv and Arun — the investigators created in the assignee-provisioning task, one of whom currently holds all 22 Inventory Issues.
- The five Raised By people who actually report Issues (Atisraj, Nandhi, Nivarnan, Sasi, Sathis) have **no logins at all**.

**Conclusion: `staff` means "Assignee/investigator", not "warehouse worker". There are no warehouse-worker accounts in this system today.** Granting the mobile key to the role would hand Mobile Lite registration to ten investigators and to zero actual warehouse workers — precisely inverting the intent.

### Options considered

| | **Option A** — grant to all `staff` | **Option B** — permission key + application allowlist | **Option C** — declare blocked |
|---|---|---|---|
| Who receives access | All 10 Assignees (incl. Manoranjani, who holds 22 Issues). No warehouse worker, because none exists | Only accounts named in a server-side allowlist. **Deny-by-default** — an empty list grants access to nobody | Nobody until the owner provisions |
| Desktop permissions change | No | No | No |
| Database/schema change | No | **No** | No |
| Migration | No | **No** | No |
| New credentials/users required | No — but then the feature has no real users | **Not to implement.** Worker accounts are needed before UAT, which is an owner data decision | Yes, before anything |
| Assignee access changes | **Yes in effect** — every Assignee gains a register button | No | No |
| Super Admin access changes | No | No | No |
| New role created | No | **No** | No |

Option A is rejected: it changes what the Assignee role can do, based on a name rather than on intent. Option C is unnecessarily strict — the *mechanism* can be built and proven safe now, and it is safe precisely because it denies by default.

### MOBILE AUTHORIZATION TARGET:

**OPTION B — permission key `issue:create_mobile` granted to role `staff`, PLUS a server-side warehouse allowlist that must also pass. Both checks required. Deny-by-default.**

Design (to be built in Stage 3, not now):

1. `issue:create_mobile` is added to the `Permission` union and to the `staff` set — the coarse gate, keeping desktop `issue:create` untouched.
2. A new pure module (e.g. `lib/access/mobileAccess.ts`) exposes `isWarehouseMobileUser(user)`, checking the authenticated **username** against an explicit allowlist supplied by configuration (an env var such as `MOBILE_LITE_USERNAMES`, or a checked-in constant — owner's choice).
3. Every Mobile Lite surface requires **both**: the page, the signature action and the registration action.
4. With no allowlist configured the function returns `false` for everyone, so a partially-deployed feature is inert rather than open.

Why this is safe and provable before Stage 3:
- **No schema change, no migration, no new role, no credential creation.**
- It cannot widen any existing access: `staff` gains one key that only Mobile Lite reads, and the allowlist can only *narrow* that further.
- It is unit-testable with no database — the same discipline as the rest of `lib/access/*`.
- The identity it keys on (`username`) is **UNIQUE** in `management_users`, unlike `display_name`, which is user-editable and non-unique and must never be used.

**Remaining owner input (data, not code):** which accounts go on the allowlist, and whether warehouse workers get their own logins. Note for that decision — recorded because it is easy to miss: the existing "Add Assignee" flow creates a `management_users` login **and** an `assignment_users` row in one transaction, so a login created that way also appears in the "Assign To" pool. If warehouse workers should not be assignable, that provisioning path needs an owner decision before UAT. **It does not block Stage 3**, because the allowlist is empty-safe.

---

## A.2 Locked Version 1 owner defaults (proposed — no data created)

| # | Item | Locked value |
|---|---|---|
| **A** | System Raised By | `staff_code = WH`, `staff_name = Warehouse Mobile` — **one future Super Admin data operation** through the existing Add Staff UI. No migration, no script, no credentials. The actual authenticated worker is retained separately in server-derived metadata |
| **B** | Domain | `inventory` (existing canonical value, already approved) |
| **C** | Generated title | `Warehouse report — <authenticated username> — <DD/MM/YYYY HH:MM>` — server-side only, client cannot influence it |
| **D** | Generated description | `Warehouse Mobile report. The attached voice recording is the primary issue evidence, accompanied by two evidence photos.` — server-side only, client cannot influence it |
| **E** | Reporter visibility | **VISIBLE:** `mobileReporter` (human-readable username) in the normal Issue detail. **HIDDEN** via `HIDDEN_META_KEYS`: `mobileSubmissionId`, `mobileReporterUserId`, `mobileSource` |
| **F** | Recording limit | **3 minutes** — a Mobile Lite UI/product limit, **not** a database constraint; changeable without touching schema or validators |
| **G** | Mobile file-size limits | Photo 1 ≤ **5 MB**, Photo 2 ≤ **5 MB**, Voice ≤ **5 MB** — **Mobile-Lite-specific**. Existing desktop limits (10 MB image / 25 MB audio) are **not** altered |

---

## A.3 Unchanged approvals

- **Upload architecture:** signed direct browser→Cloudinary upload; the three-file payload never traverses a Vercel Function; `api_secret` stays server-side; no new dependency. **Not reopened.**
- **Idempotency:** required for Version 1 — submission UUID + `pg_advisory_xact_lock` + `extra_data` lookup; one logical REGISTER = exactly one Issue; no migration.
- **Database change: NO. Migration: NO.**

---

## A.4 Status after Stage 2A

The mobile authorization target is now resolved with evidence, needs no schema change, creates no role, and is safe by construction (deny-by-default).

### **READY FOR IMPLEMENTATION**

Stage 3 may begin. The one outstanding owner input — allowlist membership and whether warehouse workers receive their own logins — is required before UAT, not before Stage 3, because an unconfigured allowlist grants access to nobody.

**Amendment to the Stage 2 plan:** Stage 3's file list gains `lib/access/mobileAccess.ts` (new) and `tests/mobileAccess.test.ts` (new); `tests/mobilePermissions.test.ts` additionally asserts that the mobile permission alone is **not** sufficient without allowlist membership.

---
---

# Stage 3 — Authorization, Route and Signing Foundation

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **First implementation stage — complete.**
No database access was required or performed. No Issue, staff row, credential or media asset was created. Not committed, not pushed, not deployed.

## What was built

| Area | Outcome |
|---|---|
| Permission | `issue:create_mobile` added to the `Permission` union and to the **`staff`** set only. `issue:create` untouched — the desktop New Issue page and "+ New Issue" button stay closed to Assignees |
| Allowlist | `lib/mobile/mobileAccess.ts` (pure) + `lib/mobile/mobileAccessConfig.ts` (`server-only`). `canAccessMobileLite(user)` requires **permission AND allowlist membership**. `MOBILE_LITE_ALLOWED_USERNAMES` is unset locally, so **access is currently denied to everyone** |
| Route | `app/mobile/layout.tsx` + `app/mobile/page.tsx` — own layout, no dashboard component, exactly the four approved controls, all disabled placeholders |
| Route protection | `proxy.ts` gained `"/mobile"` and `"/mobile/:path*"` — additive; the four `/dashboard` entries are byte-identical and pinned by test |
| Signing foundation | `createSignedUploadParams()` added to `lib/cloudinary.ts` (additive) + `requestMobileUploadTicket()` in `app/mobile/upload-actions.ts`. Signs `public_id`, `overwrite=false`, `timestamp`; returns six safe fields; `api_secret` never leaves the server |
| public_id rule | `issue-tracker/mobile/<submissionId>/<voice\|photo1\|photo2>` — composed server-side from a validated UUID and a fixed slot; invalid input throws before anything is signed |

## Evidence

- `npm test` — **834 tests, 139 suites, 834 pass, 0 fail**.
- `npm run build` — **passed**; the route table now lists `ƒ /mobile`.
- Two pre-existing exact-set assertions (`tests/access.test.ts`, `tests/tracker.test.ts`) were **extended, not removed**, and both gained a new assertion that `staff` still lacks `issue:create`.
- `git status` shows no file under `app/dashboard/`, `components/issues/`, `components/shared/` or `lib/queries/`.

## Deliberately NOT done in this stage

Voice capture, photo capture, direct upload, registration, the `WH` row, generated title/description, `inventory` write, RED write, idempotency, media cleanup, PWA manifest/icons, HEIC handling and the 3-minute timer — all belong to Stages 4–7.

**Next: Stage 4 — capture UI and signed direct upload.**

---
---

# Stage 3 Correction — Logged-Out Mobile Lite Access

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **Correction to Stage 3. Stage 4 not started.**
No database access, no PostgreSQL write, no migration, no deployment.

## Owner clarification

**`/mobile` must work while the main Issue Tracker is LOGGED OUT.** A warehouse worker must not need a Tracker account, an Assignee account, a Super Admin account, an allowlist entry, `issue:create` or `issue:create_mobile` to open and use the worker interface.

## What was superseded (recorded, not silently deleted)

The first Stage 3 revision gated `/mobile` on **a Tracker session + `issue:create_mobile` + `MOBILE_LITE_ALLOWED_USERNAMES`**. That design — including the Stage 2A "Option B" recommendation that produced it — is **SUPERSEDED**. It was built on the assumption that a worker would sign in to the Tracker, which the owner has now corrected. The reasoning that led to it (role `staff` means Assignee; 10 of 10 staff accounts are linked Assignees) remains factually correct and is preserved above; only the conclusion changed.

Removed cleanly rather than left as dead code:
- the `issue:create_mobile` permission (union entry and `staff` set entry),
- `MOBILE_LITE_ALLOWED_USERNAMES` and `lib/mobile/mobileAccessConfig.ts` (file deleted),
- `canAccessMobileLite()`, `parseAllowedUsernames()`, `isUsernameAllowed()`,
- `/mobile` from the Tracker-protected prefix list in `proxy.ts`.

The Assignee permission set is back to its pre-Mobile-Lite meaning (three permissions), pinned by assertions in `tests/access.test.ts`, `tests/tracker.test.ts` and `tests/mobileAccess.test.ts`.

## What replaced it — the anonymous Mobile Lite session

| Property | Implementation |
|---|---|
| Identity | **None.** The token carries no user id, username, role or permission |
| Creation | `proxy.ts` mints one when a browser opens `/mobile` without a valid cookie |
| Signing | jose HS256 over the existing `AUTH_SECRET` — the same primitive `lib/session.ts` uses |
| Unpredictability | `crypto.randomUUID()` session id, signed |
| Cookie | `wh_mobile`, **HttpOnly**, **SameSite=lax**, **Secure in production**, **Path=/mobile** (never sent to `/dashboard`), 12-hour expiry |
| Storage | **None** — self-contained and signature-verified. No row, no schema change, no migration |
| Separation from the Tracker | Different cookie name; a mandatory `purpose` claim; and verification **rejects any token carrying a `userId`**, so a Tracker cookie can never authenticate Mobile Lite (and this token is rejected by the Tracker's own verifier, which requires `userId`) |
| What it grants | Nothing. It is required only by the Mobile Lite Server Action |

`requestMobileUploadTicket()` now requires this session **instead of** a login/permission/allowlist, and keeps every other Stage 3 check: UUID validation, slot allow-list (`voice`, `photo1`, `photo2`), server-composed `public_id`, and `api_secret` never leaving the server.

## Evidence

- `npm test` — **844 tests, 141 suites, 844 pass, 0 fail**.
- `npm run build` — **passed**. `/mobile` is now listed **`○` (static)**, proof that it reads no session at all.
- Live server check (`next start -p 3100`, logged out, no cookies):
  - `GET /mobile` → **HTTP 200**, no redirect, body contains all four controls, and the response sets `wh_mobile=…; Path=/mobile; Secure; HttpOnly; SameSite=lax`.
  - `/dashboard/issues`, `/dashboard/discussions`, `/dashboard/tracker`, `/dashboard/account-settings` → **HTTP 307 → /login**, unchanged.
  - `/login` → HTTP 200.

## Still true

REGISTER writes nothing; no `WH` row; no worker accounts; no Super Admin or Assignee behaviour changed; no desktop UI touched.

**Next: Stage 4 — voice + two photo capture and signed direct Cloudinary upload.**

---
---

# Stage 4 — Voice + Two-Photo Capture and Direct Upload

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa` · **Implementation stage complete.**
No PostgreSQL access of any kind. No Issue, `WH` row, user, migration or deployment. REGISTER still creates nothing.

## The `overwrite=false` replacement problem — resolved without weakening anything

Stage 3 signed a deterministic `public_id` with `overwrite=false`. The repository's own documentation of that flag records the consequence: Cloudinary **returns the existing asset** for a public_id already present. A re-record would therefore have appeared to succeed while the ORIGINAL recording silently remained.

**Resolution — a server-composed attempt segment. `overwrite` stays `false`.**

```
issue-tracker/mobile/<submissionId>/<slot>/<attemptId>
```

| Identifier | Lifetime |
|---|---|
| `submissionId` | One UUID for the whole report. Unchanged by failure, retry, re-record or replacement. A new one only for a genuinely new report |
| `slot` | `voice` / `photo1` / `photo2` — nothing else is accepted |
| `attemptId` | New UUID when NEW media is accepted (re-record, retake). **Unchanged when retrying the same failed upload** |

Consequences: a retry re-sends to the same path and creates no duplicate asset; a deliberate replacement lands on a new path, so the previous evidence is never overwritten and is recorded as **superseded**. The server validates both UUIDs and the slot, then composes the path — the browser never supplies one.

## What was built

| Piece | File |
|---|---|
| Pure media rules (5 MB caps, 3-minute limit, JPEG/audio byte checks, HEIC message) | `lib/mobile/mobileMedia.ts` — reuses the existing `looksLikeJpeg`/`looksLikeAudio` sniffers |
| Pure slot state machine (retry vs replace, superseded, readiness) | `lib/mobile/mobileSlots.ts` |
| Direct-upload boundary | `lib/mobile/mobileUpload.ts` — injectable fetch, so tests never touch Cloudinary |
| Attempt-aware public_id | `lib/mobile/mobileAccess.ts` |
| Ticket action, now attempt-aware | `app/mobile/upload-actions.ts` |
| Worker UI — four controls | `app/mobile/MobileCapture.tsx` (client), rendered by `app/mobile/page.tsx` |

Mobile caps are **tighter** than the desktop's and are additive: `lib/access/attachments.ts` is unmodified (10 MB images / 25 MB audio, JPEG-only), and a test pins that.

## Evidence

- `npm test` — **886 tests, 149 suites, 886 pass, 0 fail**. No real Cloudinary asset is created: every upload test drives a fake fetch.
- `npm run build` — **passed**; `/mobile` still `○` static.
- Client-bundle checks: the Cloudinary **api_secret value does not appear in any client bundle**; `api.cloudinary.com` does appear, confirming the browser posts **directly** to Cloudinary rather than through a Function.
- Live server (logged out): `GET /mobile` → **HTTP 200**, sets `wh_mobile`, body contains exactly one each of Record Voice / Take Evidence Photo 1 / Take Evidence Photo 2 / REGISTER, and **no "Issue Registered"** text. `/dashboard/issues` and `/dashboard/account-settings` → **307**.

## Superseded media — deferred to Stage 5, deliberately

Replaced assets are retained in client state as `superseded`. No delete is performed: the existing `deleteAttachments()` is `server-only` and takes `StoredAttachment` shapes tied to the desktop flow, so wiring it here would mean widening its scope or adding a delete endpoint reachable from an anonymous session. **Neither was done.** Cleanup of superseded Mobile Lite assets is a **Stage 5 responsibility**; until then a replaced asset is orphaned storage — cost, never incorrect evidence, because only the active asset is ever registered.

**Next: Stage 5 — registration, `WH`/`inventory`/server-derived fields, idempotency and cleanup.**

---

## Stage 4 Correction — strict four-action UI + public-exposure finding

**Correction:** the "Start a new report" control was removed, along with its state setter, so no unused reset path remains. `/mobile` now offers exactly four worker actions: **Record Voice · Take Evidence Photo 1 · Take Evidence Photo 2 · REGISTER** (plus status/error/retry text inside those controls). A fresh submission id will be minted automatically after a successful registration — Stage 5 owns that.

Unchanged: voice re-record, photo replacement, signed direct Cloudinary upload, stable `submissionId`, the `attemptId` retry/replace design, `overwrite=false`, logged-out access, and all authentication.

**Evidence:** `npm test` 887/887 pass · `npm run build` passed · live logged-out `GET /mobile` → 200 showing exactly the four actions and no "Start a new report" · `/dashboard/issues` and `/dashboard/tracker` → 307.

### ⚠️ Public-exposure finding (read-only — nothing implemented)

| Question | Answer |
|---|---|
| Can any visitor opening `/mobile` obtain a `wh_mobile` session? | **YES** — `proxy.ts` mints one for any request to `/mobile`, by design (no login) |
| Can that session request signed upload tickets? | **YES** — the anonymous session is the only gate |
| Is rate limiting implemented anywhere? | **NO** — no rate-limit, throttle or quota code exists in `app/`, `lib/` or `proxy.ts` |
| Would a Stage 5 registration action protected **only** by `wh_mobile` let any public visitor create an Issue? | **YES** |

Consequence to decide **before** Stage 5 ships: with `/mobile` publicly reachable, anyone who knows the URL could upload media and create Issues. Options for the owner — network restriction (warehouse Wi-Fi/VPN or an allowlisted IP range), a shared device PIN, per-request rate limiting, or accepting the risk on an internal-only deployment. **No security feature was added in this correction.**

---
---

# Stage 5 — Version 1 Registration and PWA Implementation

**Date:** 2026-08-14 · **Branch:** `feature/mobile-lite-pwa`

## ⛔ PUBLIC DEPLOYMENT BLOCKED PENDING OWNER DEPLOYMENT-ACCESS DECISION

`/mobile` is login-free by design. Any visitor who can reach the URL obtains a `wh_mobile` session, can request signed upload tickets, and — now that registration exists — **could create Issues**. There is no rate limiting. **This build is LOCAL DEVELOPMENT ONLY and must not be deployed publicly** until the owner decides on a deployment-access control (network/VPN restriction, device PIN, rate limiting, or accepting the risk on an internal-only deployment). No such feature was added in this stage, as instructed.

## What was built

| Piece | File |
|---|---|
| Pure registration rules (server-derived fields, asset verification, extra_data) | `lib/mobile/mobileRegistration.ts` |
| Idempotent creation reusing the existing statements | `lib/queries/issues.ts` — new `createIssueTx()` (extracted verbatim) + `createMobileIssue()` |
| Registration action | `app/mobile/register-actions.ts` |
| REGISTER wiring + success screen | `app/mobile/MobileCapture.tsx` |
| PWA manifest, icons, home-screen metadata | `app/manifest.ts`, `public/icons/*.svg`, `app/mobile/layout.tsx` |

**Server-derived, never client-controlled:** Raised By `WH` · Domain `inventory` · Status `RED` (the existing hard-coded literal) · Issue ID from `issue_tracking.next_issue_id()` · `created_date`/`created_at` from the database · Title `Warehouse report — DD/MM/YYYY HH:MM` (no username — the login-free design has none) · fixed Description.

**Idempotency:** one transaction → `pg_advisory_xact_lock(hashtext(submissionId))` → lookup on `extra_data->>'mobileSubmissionId'` → return the existing Issue ID, or insert exactly once via the shared `createIssueTx()`. **No migration, no unique constraint.**

**Asset verification:** each asset must sit at exactly `issue-tracker/mobile/<submissionId>/<slot>/<attemptId>` with a valid attempt UUID, the right resource type, an accepted format, a size inside the mobile cap, and an `https` URL. An arbitrary or foreign Cloudinary asset cannot be attached.

**Cleanup:** superseded assets are deleted **only after a successful commit** and **only** after re-checking they are inside this submission's namespace, via the existing `deleteAttachments()`. A failed registration deletes nothing, so the worker can simply press REGISTER again.

**No reporter row was created.** Without `WH`, registration fails cleanly with *"Warehouse Mobile is not set up yet."* — it never falls back to ND/SA/ST/NV or any other staff code.

## Evidence

- `npm test` — **930 tests, 155 suites, 930 pass, 0 fail**. No database and no Cloudinary asset is touched by any test.
- `npm run build` — **passed**.
- Read-only database check: **144 Issues, 0 `WH` rows, 0 Mobile Lite Issues** — nothing was written.
- Live (logged out): `/mobile` → 200 with exactly the four actions and no "Issue Registered"; `/manifest.webmanifest` serves the Warehouse Mobile Lite manifest (`standalone`, `start_url: /mobile`); `/dashboard/issues` → 307.

## Deferred

Abandoned (never-registered) Cloudinary uploads are **deferred maintenance** — no background housekeeping in Version 1. PNG icons for iOS home-screen fidelity are a UAT follow-up (SVG icons are declared today).

**Next: FINAL LOCAL UAT + `WH` setup.**
