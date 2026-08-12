# Issue Tracker — Super Admin / Assignee Auth Design

**Stage:** 2 — Final design + migration proposal
**Status:** PROPOSAL — pending Varmen review. Nothing in this document has been executed.
**Date:** 2026-08-12
**Source of truth:** Stage 1 read-only audit of `postage-workspace/` and `varmen_db.issue_tracking`.

> **Not done in this stage:** no migration executed, no accounts created, no passwords set,
> no assignment data changed, no Tracker code, no email notifications, no deployment.

---

## 1. Target model

### Super Admin

- Remains **`role = 'admin'`** in `issue_tracking.management_users`. **No `super_admin` DB role is introduced.**
- "Super Admin" is a **display and interpretation layer only** — the application renders the label and
  gates Super-Admin-only features on `role === 'admin'`.
- The existing account (`user_id = 1`, `username = 'admin_test'`) is **not modified**. Its `user_id` is
  referenced by `issue_assignments.assigned_by`, `issue_status_history.changed_by`,
  `issue_comments.author_id`, and `issues.deleted_by`; leaving the row untouched means zero historical
  or FK impact. (All four of those tables currently hold 0 rows referencing it, so the risk is nil today
  and stays nil under this design.)
- Full Issues + Discussions access, future Tracker access, assign/reassign, user management.

### Assignee

- Reuses **`role = 'staff'`** — already permitted by the existing
  `CHECK (role IN ('staff','management','admin'))`. **No CHECK constraint change, no new role value.**
- Each assignee login links **1:1** to exactly one existing `issue_tracking.assignment_users` row via
  the new `assignment_users.user_id` column (migration 011).
- Sees and works **only** Issues currently assigned to that assignee, enforced server-side.
- No assign/reassign, no delete, no staff/assignee management, no Discussions management, no Tracker.

### Why reuse `staff` rather than add `'assignee'`

`staff` currently holds **zero users** (live: one row, `role = 'admin'`). Redefining what `staff` can do
is therefore free right now and breaks no historical data or existing permission. Adding an
`'assignee'` value would require dropping and re-adding the `management_users_role_check` constraint —
a real DDL change on the auth table for no functional gain. This decision must be revisited *before*
any account is ever created with `role = 'staff'` under the old meaning.

---

## 2. Final permission matrix

Permission keys live in `lib/auth.ts`'s `Permission` union and `ROLE_PERMISSIONS` table. The table stays
an explicit literal set per role — **no hierarchy, no inheritance** (DECISION-001 stands).

### Changes to the permission vocabulary

| Key | Change | Held by |
|---|---|---|
| `issue:view_all` | unchanged | admin, management |
| `issue:view_own_assigned` | **NEW** | staff |
| `issue:change_status_own_assigned` | unchanged key, now genuinely enforceable | staff |
| `issue:delete` | **NEW** (no permission key exists today) | admin |
| `tracker:view` | **NEW** | admin |
| `issue:create` | **removed from `staff`** | admin, management |
| `issue:comment` | **removed from `staff`** (see note below) | admin, management |
| `discussion:view`, `discussion:comment` | **removed from `staff`** | admin, management |

### SUPER ADMIN (`role = 'admin'`) — final set

| Capability | Permission key | Status |
|---|---|---|
| View all Issues | `issue:view_all` | exists |
| Open any Issue detail | `issue:view_all` | exists |
| Create Issues | `issue:create` | exists |
| Assign / reassign | `issue:assign` | exists |
| Change any Issue status | `issue:change_status_any` | exists |
| Soft-delete / restore Issues | `issue:delete` | **new key** |
| Approve reopen | `issue:approve_reopen` | exists (no reopen path implemented) |
| Manage Raised By (`issue_staff`) and Assignees (`assignment_users`) | `user:manage` | exists |
| Manage login accounts | `user:manage` | exists |
| Discussions — full set | `discussion:*` (9 keys) | exists |
| Tracker | `tracker:view` | **new key** |

### ASSIGNEE (`role = 'staff'`) — final set

| Capability | Permission key | Additional server-side gate |
|---|---|---|
| View own assigned Issues only | `issue:view_own_assigned` | every query filtered by session-resolved `assignee_id` |
| Open own Issue detail only | `issue:view_own_assigned` | ownership re-checked per `issue_id`; non-owned → **Not Found** |
| RED → AMBER on own Issue | `issue:change_status_own_assigned` | current assignment verified in the same transaction |
| AMBER → GREEN on own Issue | `issue:change_status_own_assigned` | same |

**Explicitly NOT held by assignees:** `issue:view_all`, `issue:create`, `issue:assign`,
`issue:change_status_any`, `issue:approve_reopen`, `issue:delete`, `user:manage`, `tracker:view`,
and every `discussion:*` key.

### Issue workflow — unchanged

The workflow business rules in `lib/queries/issueStatus.ts` are **not redesigned**: RED → AMBER → GREEN,
forward-only, same-status is a no-op, backwards is rejected, and there is no reopen path for any role.
Assignee status changes go through the *existing* `updateIssueStatus()` unchanged; the only addition is
an ownership check layered in front of it.

### Comments / investigation notes / final resolution — capability gap

The Stage 1 audit confirmed:

- `issue_tracking.issue_comments` exists (0 rows) but has **no query module and no UI**.
- `issue_tracking.issue_status_history` is written by `updateIssueStatus()` but **never read or displayed**.
- `issues.resolution` is read on the Assigned Issues card but is **never written by any code path**.

So "add investigation / progress / comment / final resolution" is **not supported by the existing
workflow today** — for any role. This design therefore grants assignees **no comment permission**,
because granting a permission for a feature that does not exist would be misleading. Building the Issue
comment/resolution surface is a separate, explicitly-scoped piece of work; when it happens, the
assignee keys `issue:comment_own_assigned` and `issue:resolve_own_assigned` should be added then, with
the same per-issue ownership gate. Flagged as an unresolved decision in §7.

---

## 3. Login account design

### Storage

All authentication data stays in **`issue_tracking.management_users`**: `username`, `email`,
`password_hash` (bcrypt cost 12), `role`, `active`.

**No password, password hash, or credential of any kind is ever stored in `assignment_users`.**
Migration 011 adds one column to that table — a `BIGINT` foreign key — and nothing else.

### The ownership chain

```
issue_tracking.management_users.user_id          ← authentication (username / email / password_hash / role / active)
              ↕  (1:1, nullable, uidx_assignment_users_user_id)
issue_tracking.assignment_users.user_id
              ↓
issue_tracking.assignment_users.assignee_id      ← the "Assign To" identity
              ↓
issue_tracking.issue_assignments.assignee_id     ← WHERE is_current = true
              ↓
issue_tracking.issue_assignments.issue_id
              ↓
issue_tracking.issues.issue_id                   ← Issue ownership
```

Resolution at request time: session cookie → `userId` → `getCurrentUser()` (DB re-read of role/active)
→ `getCurrentAssigneeId()` joins `assignment_users` on `user_id` → `assignee_id` → every Issue query is
filtered by it. The Super Admin has no `assignment_users` row, so `getCurrentAssigneeId()` returns
`null` for them and the scope filter is not applied.

### Invariants

- One login → at most one assignee row (`uidx_assignment_users_user_id`, partial unique).
- One assignee row → at most one login (`assignee_id` is the primary key).
- `user_id` is nullable: an assignee with no login keeps working in the "Assign To" dropdown exactly as
  today. This is the state of all 10 rows immediately after 011.
- A `role = 'staff'` account with **no** linked assignee row resolves to `assignee_id = null` and must
  therefore see **zero** Issues — fail closed, never fail open.

### The 10 existing assignees

From `issue_tracking.assignment_users`, live at audit time — `assignee_id` and `assignee_name` only:

| assignee_id | assignee_name |
|---|---|
| 1 | Rajive |
| 2 | Mayurika |
| 3 | Arun |
| 4 | Suman |
| 5 | Manoranjiny |
| 6 | Luxcika |
| 7 | Janany |
| 8 | Varman |
| 9 | Muhuntha |
| 10 | Bietrick |

All 10 are `active = true`. None has a login account.

### Provisioning template — NEEDS INPUT

No usernames or email addresses exist for these people anywhere in the codebase or database.
**None are invented here.** Varmen / Laksika must supply them before any account is created.

| Assignee | Username | Email | Login Account Status |
|---|---|---|---|
| Rajive (id 1) | NEEDS INPUT | NEEDS INPUT | Not created |
| Mayurika (id 2) | NEEDS INPUT | NEEDS INPUT | Not created |
| Arun (id 3) | NEEDS INPUT | NEEDS INPUT | Not created |
| Suman (id 4) | NEEDS INPUT | NEEDS INPUT | Not created |
| Manoranjiny (id 5) | NEEDS INPUT | NEEDS INPUT | Not created |
| Luxcika (id 6) | NEEDS INPUT | NEEDS INPUT | Not created |
| Janany (id 7) | NEEDS INPUT | NEEDS INPUT | Not created |
| Varman (id 8) | NEEDS INPUT | NEEDS INPUT | Not created |
| Muhuntha (id 9) | NEEDS INPUT | NEEDS INPUT | Not created |
| Bietrick (id 10) | NEEDS INPUT | NEEDS INPUT | Not created |

Constraints to respect when the values arrive: `username` UNIQUE `VARCHAR(50)`, `email` UNIQUE
`VARCHAR(255)`, both NOT NULL. Passwords must be collected via a masked interactive prompt and hashed
immediately — never a CLI argument, never an environment variable, never committed — following the
model already established in `scripts/create-first-admin.ts`.

---

## 4. Security-hardening plan — implementation order

These are ordered so that **every hole is closed before the first assignee login exists**. Items A and B
are live defects today, independent of this feature. Nothing here is implemented in Stage 2.

| # | Target | Change | Why this order |
|---|---|---|---|
| **A** | `app/dashboard/issues/delete-actions.ts` | `softDeleteIssuesAction` currently checks only "is signed in". Add `hasPermission(user, "issue:delete")` — Super Admin only. Gate the unused `restoreIssues()` the same way if it is ever wired up. | Highest severity. Without this, the first assignee account can bulk soft-delete all 144 Issues by posting arbitrary IDs. |
| **B** | `app/dashboard/issues/new/actions.ts` | `createIssueAction` has **no** `getCurrentUser()` call at all. Add authentication + `issue:create`. | Second live defect. Must be closed before a lower-privileged role exists. |
| **C** | `lib/queries/issues.ts` → `listIssues()`, and `app/dashboard/issues/page.tsx` | Add an `assigneeId` scope parameter resolved **from the session**, never from input: `EXISTS (SELECT 1 FROM issue_tracking.issue_assignments ia WHERE ia.issue_id = i.issue_id AND ia.is_current AND ia.assignee_id = $n)`. Callers without `issue:view_all` must pass it; `null` assignee ⇒ empty result. | The list is the entry point; scope it before anything links to it. |
| **D** | `app/dashboard/issues/page.tsx` (`?tab=assigned`) → `listAssignedIssues()` | The `?assignee=` query param is currently passed straight into the query. For an assignee it must be **ignored entirely** and replaced by the session-resolved id. The param remains readable **only** when the caller holds `issue:view_all`. | This is the specific URL-tampering vector in the requirement. |
| **E** | `app/dashboard/issues/[issueId]/page.tsx` → `getIssueById()` | The page makes **no** `getCurrentUser()` call today. Add authentication, then pass the scope into `getIssueById()`. A non-owned Issue must return the existing **"Issue not found"** panel — never a 403, never a different message, so existence is not leaked. | Direct-URL access to another assignee's Issue. |
| **F** | `lib/queries/issues.ts` → `getAdjacentIssueIds()` | Apply the same assignment scope to both the Previous and Next lookups. | Unscoped, it enumerates neighbouring Issue IDs across ownership boundaries. |
| **G** | `app/dashboard/issues/status-actions.ts` → `updateIssueStatusAction` | For a caller holding only `issue:change_status_own_assigned`, verify the current assignment (`is_current = true` AND `assignee_id` = session assignee) **inside the same transaction** as the status update, alongside the existing `SELECT … FOR UPDATE`. Do not change any workflow rule. | Closes the gap the file's own comment documents. Must be transactional or it races with reassignment. |
| **H** | `assign-actions.ts`, `AssignmentPanel.tsx`, `IssueTable.tsx`, `add-staff/` | Keep `issue:assign` / `user:manage` as the server gates (already correct). Additionally hide the assign dropdown, bulk controls, delete button, and Add Staff link for assignees — presentation only, layered on top of the server checks. | UI hiding is defense in depth, never the guard. |
| **I** | `proxy.ts` | Add `/dashboard/tracker/:path*` to `matcher` and `PROTECTED_PATH_PREFIXES` when Tracker is built. Proxy stays cookie-only — it can never enforce role. | Do not let the future route ship outside the matcher. |

**Verification gate before any account is created:** with A–H merged, sign in as the Super Admin and
confirm every existing behaviour is unchanged; then confirm that a `role = 'staff'` account with a
`null` assignee link sees zero Issues and can mutate nothing.

---

## 5. Login and navigation design

### Post-login redirect

Both roles land on **`/dashboard/issues`**. There is no separate assignee route — the same page is
scoped server-side by the session-resolved `assignee_id`. This keeps one code path, one set of
enforcement points, and no "assignee-only URL" that could be guessed or shared.

`app/login/actions.ts` and `app/login/page.tsx` keep their existing `redirect("/dashboard/issues")`
unchanged.

### Sidebar (`components/shared/AppSidebar.tsx`)

`AppSidebar` is a Client Component today and builds `navItems` from a module-level constant. The role
must be resolved on the server and passed down as a prop from `DashboardLayout` — never fetched or
inferred client-side.

**Super Admin**

- Issues
- Discussions
- Tracker *(future — not built in this stage)*
- Logout

**Assignee**

- My Issues → `/dashboard/issues`
- Logout

The Issues/Assigned tab strip (`IssueTabs.tsx`) is Super-Admin-only; assignees see a single scoped list
with no tab switcher, since both tabs would show the same rows for them.

`AppHeader` should show the signed-in display name and role label ("Super Admin" / assignee name); it
currently renders only a date.

---

## 6. Tracker V1 contract (future — no code in this stage)

**Route:** `/dashboard/tracker` — Super Admin only.
**Enforcement:** `tracker:view` checked in the page *and* in every query function, plus the proxy
matcher entry from §4 item I. Never proxy-only.

**Data source (no new tables):**
`issue_assignments ia` (`is_current = true`) `JOIN issues i` (`deleted_at IS NULL`)
`JOIN assignment_users au` `JOIN issue_staff s`, plus a `LEFT JOIN LATERAL` onto the newest
`issue_status_history` row per Issue for Last Activity.

### Summary — one row per assignee

| Column | Derivation |
|---|---|
| Assignee | `assignment_users.assignee_name` |
| Total Assigned | `count(*)` where `is_current` and not deleted |
| RED | `count(*) FILTER (WHERE i.status = 'RED')` |
| AMBER | `count(*) FILTER (WHERE i.status = 'AMBER')` |
| GREEN | `count(*) FILTER (WHERE i.status = 'GREEN')` |
| Completion % | `GREEN / NULLIF(total, 0)` |
| Oldest Open | max days since `ia.assigned_at` where `status <> 'GREEN'` |
| Last Activity | greatest of newest `issue_status_history.changed_at` and `ia.assigned_at` |

### Detail — one row per assigned Issue

Issue ID · Title · Assignee · Status · Priority · Domain (`issues.category`) · Raised By
(`issue_staff.staff_name`) · Created Date (`issues.created_date`) · Assigned Date (`ia.assigned_at`) ·
Days Open (`CURRENT_DATE - assigned_at::date`) · View (link to `/dashboard/issues/{issue_id}`).

### Filters

Assignee (`assignment_users`) · Status (RED/AMBER/GREEN) · Domain (`listCategories()`) ·
Date range (on `assigned_at`, with a toggle for `created_date`) · Search (`issue_id` or `issue_title`,
ILIKE, reusing the existing `escapeLikePattern()` helper).

### Pagination and sorting

Mirror `listIssues()` exactly: `COUNT(*) OVER()` for the total, default page size 20, max 100,
`?sort=` resolved against a frozen whitelist with an `issue_id` tiebreaker. No user input ever reaches
an `ORDER BY` expression.

### Known V1 limitation

`issue_assignments` and `issue_status_history` are both empty today, so on first load Tracker shows
zeros for everyone. Time-in-status metrics only become meaningful once status history accumulates.

---

## 7. Warnings and unresolved decisions

1. **`issue_assignments` has 0 rows.** Assignee-scoped visibility shipping before any Issue is assigned
   means every assignee logs in to an empty list. Assign work first, or ship both together.
2. **Comment / investigation note / final resolution do not exist for Issues** in any form (§2).
   Whether assignees need them — and therefore whether that surface must be built before go-live — is
   an open decision for Varmen.
3. **`/dashboard`, `/dashboard/booking`, `/dashboard/couriers`, `/dashboard/reports` remain
   unauthenticated** (outside the proxy matcher, by prior deliberate decision). Assignee accounts will
   be able to reach them. Widening the matcher is a separate decision, unresolved.
4. **Assign-once semantics.** There is no reassignment path in the UI or the action today. If an
   assignee leaves or is deactivated, their Issues cannot currently be moved to anyone else. Confirm
   whether reassignment is required before assignee logins go live.
5. **Deactivating a login does not unassign Issues.** An inactive assignee's Issues become invisible to
   everyone except the Super Admin. Tracker should surface orphaned/inactive assignments.
6. **`assignment_users.assignee_name` is UNIQUE** — two people with the same name cannot both exist.
   Relevant when provisioning real accounts for 10 people.
7. **Redefining `staff` is free today but breaking later.** It must land before any account is created
   with `role = 'staff'`.
8. **Usernames, emails, and passwords for all 10 assignees are NEEDS INPUT.** Nothing was invented.
9. Migration 011 has **not** been executed. `assignment_users.user_id` does not exist in the live
   database as of 2026-08-12.
