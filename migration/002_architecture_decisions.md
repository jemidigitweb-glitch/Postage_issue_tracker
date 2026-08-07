# Decision Record

Approval template for the Issue Management Application Layer schema design.
Builds on `migration/002_issue_management_system_PROPOSAL.md` (object design) and
`migration/002_approval_checklist.md` (full options/impact analysis). This document
contains no SQL, no schema changes, no application code.

**To complete:** fill in "Approved option" (and "Reason" if it differs from the
recommendation) for each decision below. `migration/002_issue_management_system.sql`
will not be created until every decision here is approved.

---

## DECISION-001

**Question:** Can historical issues (the 92 migrated rows) move through the
RED → AMBER → GREEN workflow, or do they stay permanently frozen?

**Options:**
- A. Historical issues can move through RED → AMBER → GREEN workflow
- B. Historical issues remain permanently frozen

**Recommended option:** A

**Approved option:** A

**Reason:** Historical issues should participate in the workflow because all 92
migrated issues are existing open RED issues. Freezing them would prevent
assignment, investigation, status progression, comments, and resolution
tracking. Existing historical data must remain unchanged, but workflow features
may operate on these records.

**Impact:** Historical rows become active, workable records. Application code
uses one uniform path for all issues instead of a permanent historical/future
branch in every workflow feature.

**Migration implications:** No schema difference either way — this only affects
application-layer logic (which rows a feature is allowed to touch), not any table
structure. Does not change what `002_issue_management_system.sql` needs to contain.

---

## DECISION-002

**Question:** How is workflow validation (status order, resolution required
before GREEN, reopen authorization) enforced?

**Options:**
- A. Application-layer validation
- B. Database trigger enforcement

**Recommended option:** A

**Approved option:** A

**Reason:** Use application-layer validation instead of database triggers. This
avoids modifying the historical issues table structure and keeps business rules
maintainable. The application must enforce: RED → AMBER → GREEN workflow;
resolution required before GREEN; authorised reopening with required reason.

**Impact:** Validation logic lives in the API layer, in one language, versioned
with the app. A malformed direct SQL write would not be blocked at the DB level.

**Migration implications:** If A: `002_issue_management_system.sql` contains no
`CREATE TRIGGER` on `issues`. If B: it would need to add a trigger function +
`CREATE TRIGGER ... ON issue_tracking.issues` — a new object attached to the
historical table, requiring separate explicit sign-off beyond this decision.

---

## DECISION-003

**Question:** Do comments and investigation notes live in one table or two?

**Options:**
- A. Single `issue_comments` table with `comment_type`
- B. Separate tables

**Recommended option:** A

**Approved option:** A

**Reason:** Use one `issue_comments` table with a `comment_type` field. This
supports investigation notes, management comments, resolution notes, and
future comment categories without duplicate tables.

**Impact:** One schema, one query path filtered by type, vs. two near-identical
schemas/paths that must be kept in sync for any shared change.

**Migration implications:** If A: `002_issue_management_system.sql` creates one
`issue_comments` table with a `comment_type CHECK` constraint. If B: it creates
two tables instead, each independently indexed.

---

## DECISION-004

**Question:** Is a separate reopen-tracking table needed, or does status
history cover it?

**Options:**
- A. Use `issue_status_history` only
- B. Add separate reopen history table

**Recommended option:** A

**Approved option:** A

**Reason:** Use `issue_status_history` only. A separate reopen history table is
unnecessary because reopening is a status transition and can be recorded with
status history and a required reopen reason.

**Impact:** One table gives the full status timeline directly; two tables would
require a union to reconstruct it.

**Migration implications:** If A: no `issue_reopen_history` table is created — one
fewer object in `002_issue_management_system.sql`. If B: an additional table,
FK'd to `issues` and `management_users`, is added to the migration.

---

## DECISION-005

**Question:** What role/permission model does `management_users` use?

**Options:**
- A. Simple roles: `staff`, `management`, `admin`
- B. Full RBAC permission model

**Recommended option:** A

**Approved option:** A

**Reason:** Use simple role-based access control: staff, management, admin.
Full RBAC is unnecessary for the initial system. Existing `issue_staff` data
remains historical issue ownership data and is separate from authentication
roles.

**Impact:** Adding a future 4th role is a one-line `CHECK` constraint change
under A, versus new table rows under B. **Naming collision to resolve:** the
`staff` role name is identical to the existing `issue_staff` table's meaning
(people who raise issues) — see DECISION-006 for whether these are the same
population.

**Migration implications:** If A: `management_users.role` gets
`CHECK (role IN ('staff','management','admin'))`. If B:
`002_issue_management_system.sql` would need `roles`, `permissions`, and
`role_permissions` tables in place of that single column.

---

## DECISION-006

**Question:** Is `management_users` linked to `issue_staff`, or fully
independent?

**Options:**
- A. Independent `management_users` table
- B. Link management users to `issue_staff`

**Recommended option:** A

**Approved option:** A

**Reason:** Keep `management_users` independent from `issue_staff`.
Authentication accounts and historical issue ownership records have different
purposes. This prevents changes to historical staff data.

**Impact:** Under A, "who raised this" and "who's logged in" are entered
independently (e.g. a free-text or dropdown field on issue submission). Under B,
submission could auto-fill from the logged-in user, at the cost of tying two
tables' lifecycles together.

**Migration implications:** If A: no FK between `management_users` and
`issue_staff` in `002_issue_management_system.sql`. If B: `management_users`
gains a nullable FK to `issue_staff(staff_code)`.

---

## DECISION-007

**Question:** Does search need only indexed filtering, or full-text search?

**Options:**
- A. Indexed filtering only
- B. PostgreSQL full-text search

**Recommended option:** A

**Approved option:** A

**Reason:** Use normal indexed filtering initially. Do not add full-text search
indexes now. Search, filtering, and pagination requirements can be supported
without additional complexity. Full-text search can be added later if required.

**Impact:** Full-text search would need a maintained `tsvector` (generated
column or trigger) or trigram index — real ongoing complexity for a need that
hasn't been demonstrated yet.

**Migration implications:** If A: `002_issue_management_system.sql` adds no new
index to the historical `issues` table. If B: it would need a new
`CREATE INDEX ... ON issue_tracking.issues` — non-destructive DDL, but still DDL
against the historical table, requiring separate explicit sign-off beyond this
decision.

---

## DECISION-008

**Question:** Does future issue numbering need a scalable format, or does the
existing 3-digit format stay as a hard limit?

**Options:**
- A. Scalable numbering without 3-digit limitation
- B. Fixed 3-digit numbering

**Recommended option:** A

**Approved option:** A

**Reason:** Use a scalable concurrency-safe issue number generator with no
3-digit limitation. Future issue growth must be supported while preserving
staff prefix formatting.

**Impact:** Historical IDs (`ND-001`...`ND-045`) are never touched or renumbered
either way. Under A, future IDs simply grow past 3 digits when needed. Under B,
some other mechanism (rejecting the 1000th issue, or a hard cap) would need to
be designed and would eventually block new issue creation for a busy staff code.

**Migration implications:** If A: `next_issue_id()` ships exactly as proposed in
`002_issue_management_system_PROPOSAL.md` §3.2. If B: the function needs an added
guard clause to reject/handle the overflow case, and a decision on what happens
when a staff code hits issue #1000.

---

## Sign-off

| Field | Value |
|---|---|
| Reviewed by | Project Owner |
| Date | 2026-08-06 |
| All 8 decisions approved | Yes — DECISION-001 through DECISION-008 all approved as Option A |
| Cleared to create `migration/002_issue_management_system.sql` | Pending architecture compliance review (next step) |
