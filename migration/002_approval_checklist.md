# Approval Checklist — Issue Management Application Layer

Follows on from `migration/002_issue_management_system_PROPOSAL.md`. This document
contains **no SQL, no schema changes, no application code** — it exists to turn the
8 open questions from that proposal into explicit decisions for an owner (Varmen/
Laksika) to approve before any `migration/002_issue_management_system.sql` is written.

---

## Decision 1 — Historical issues table usage

**Recommendation:** Historical rows are **not** frozen from the workflow. All 92
migrated issues currently show `status = 'RED'` — they are real, unresolved
operational issues, not closed archival records. Freezing them out of the new
assignment/status/comment workflow would make the new system unable to actually
work the backlog it was built to track. Recommend: historical rows *can* transition
through RED→AMBER→GREEN, be assigned, and receive comments/notes, exactly like
future rows. What must never change is the **migrated content itself** — `issue_id`,
`issue_title`, `issue_description`, `category`, `staff_code`, `created_date`, and
the original `extra_data` keys populated by the migration — since that's sourced
directly from Laksika's/Janarthan's original material and is provenance, not
workflow state.

**Options:**
- **A (recommended):** Historical + future rows share one workflow, uniformly. Only workflow *fields* (status, resolution, assignment, comments) are ever written after migration; migrated content fields are immutable app-side.
- **B:** Historical rows are read-only forever; only rows created after go-live can move through the workflow.

**Impact:**
| | Option A (recommended) | Option B |
|---|---|---|
| 92 historical issues | Become active, workable records | Stay frozen — the backlog they represent can't be closed out through the new system |
| Future issue creation | Same code path as historical | Same code path, but with an extra “is this row historical?” branch everywhere |
| Application complexity | Lower — one uniform code path | Higher — every workflow feature needs a historical/future guard |
| Security | No difference | No difference |
| Maintainability | Better — no special case to remember | Worse — a permanent exception baked into every feature |

---

## Decision 2 — Workflow enforcement (status rules, resolution-before-GREEN)

**Recommendation: Option A — application-layer enforcement only**, for now.

**Options:**
- **A (recommended):** All validation (status order, resolution required before GREEN, reopen authorization) lives in the API/application code.
- **B:** A `CREATE TRIGGER` on `issue_tracking.issues` enforces these rules at the database level.

**Impact:**
| | Option A (recommended) | Option B |
|---|---|---|
| 92 historical issues | No DB object ever attached to the historical table | A new trigger is attached to the historical table (doesn't change its structure, but does attach new behavior to it — the most conservative reading of "don't modify" would avoid this) |
| Future issue creation | Validated before the INSERT/UPDATE reaches the DB | Validated regardless of caller, including any manual `psql` write |
| Application complexity | Moderate — validation lives in one place, in one language, versioned with the app | Higher — PL/pgSQL logic to write, test, and keep in sync with app-layer assumptions |
| Security | Weaker — a direct DB write (e.g. manual `psql`) bypasses it entirely, so DB credentials must be scoped tightly to the app | Stronger — enforced no matter what writes the table, true defense-in-depth |
| Maintainability | Easier to read, test, and change | Harder — schema migrations required to change a rule, plus two languages to maintain |

Recommend starting with A and revisiting B later as defense-in-depth once the app
is stable, rather than building both at once (keeps one source of truth for the rules).

---

## Decision 3 — Investigation notes and comments

**Recommendation: Option A — single `issue_comments` table** with a `comment_type`
discriminator (`'comment'` / `'investigation_note'`).

**Options:**
- **A (recommended):** One table, `comment_type` column.
- **B:** Two separate tables, `issue_comments` and `investigation_notes`.

**Impact:**
| | Option A (recommended) | Option B |
|---|---|---|
| 92 historical issues | n/a — new table either way | n/a |
| Future issue creation | n/a | n/a |
| Application complexity | Lower — one schema, one query path, filtered by type | Higher — two near-identical schemas and query paths |
| Security | Type-based visibility rules (e.g. "only management sees investigation notes") apply equally well to a filtered column | Same rules, just on two tables instead of one |
| Maintainability | Easier — one place to evolve | Harder — any shared change (e.g. adding edit history) must be made twice |

Would only recommend B if notes and comments are expected to diverge structurally
(e.g. notes need an approval workflow comments don't) — no such requirement has
been stated.

---

## Decision 4 — Reopen tracking

**Recommendation:** `issue_status_history` is sufficient. No separate
`issue_reopen_history` table.

A reopen is a status change where `from_status = 'GREEN'` — already fully captured
by `issue_status_history.is_reopen` (boolean) + `.reason` (text). A separate table
would either duplicate those same rows or require keeping two tables in sync for
no structural benefit.

**Impact:**
| | Single history table (recommended) | Separate reopen table |
|---|---|---|
| 92 historical issues | No difference | No difference |
| Future issue creation | No difference | No difference |
| Application complexity | Lower — one table to query for "full status timeline" | Higher — two tables to union for a full timeline |
| Security | Reopen-only visibility restriction (e.g. only admins see reopen reasons) is a `WHERE is_reopen = true` filter | Same restriction, just table-scoped instead of row-scoped |
| Maintainability | Easier | Harder — sync risk between two tables recording overlapping events |

Would only recommend splitting if reopen events need materially different
retention or access-control rules than ordinary status changes — not stated as
a requirement.

---

## Decision 5 — Roles and permissions

**Minimum roles, as requested:**

| Role | Can do |
|---|---|
| `staff` | View issues, add comments. Cannot change status, cannot assign/reassign. |
| `management` | Everything `staff` can, plus: assign/reassign, transition status RED→AMBER→GREEN, add investigation notes. Cannot authorize a GREEN→earlier reopen. |
| `admin` | Everything `management` can, plus: authorize reopening a GREEN issue, manage `management_users` accounts/roles. |

**Recommendation:** One `management_users` table with a `role` column,
`CHECK (role IN ('staff','management','admin'))` — **not** separate tables per role.

**Options:**
- **A (recommended):** Single table, checked `role` column.
- **B:** Separate tables per role (or full RBAC: `roles`/`permissions`/`role_permissions`).

**Impact:**
| | Option A (recommended) | Option B |
|---|---|---|
| 92 historical issues | No difference | No difference |
| Future issue creation | Role determines who can transition/assign — same either way | Same |
| Application complexity | Lower — one table, one column | Higher — either 3 near-identical tables, or full RBAC machinery this project doesn't yet need |
| Security | Simple to reason about and query (`WHERE role = ...`) | RBAC is more granular but adds attack surface (join logic to get permissions right) for no stated current need |
| Maintainability | Adding a 4th role later = one `CHECK` edit | Adding a 4th role = a new table, or new `role_permissions` rows |

**⚠️ Naming collision to resolve explicitly:** the role name `staff` is identical
to the existing `issue_staff` table's meaning (people who *raise* issues:
Nandhi/Sasi/Sathis/Nivarnan). Decision 6 below determines whether these are the
same population or a naming coincidence — please confirm which, since it changes
how `role = 'staff'` accounts get created.

---

## Decision 6 — `management_users` ↔ `issue_staff` relationship

**Recommendation: Option B — independent, no link.**

**Options:**
- **A:** `management_users` rows are linked to `issue_staff` (e.g. a nullable FK), so a staff member can log in as themselves.
- **B (recommended):** The two tables are entirely independent. `issue_staff` continues to mean "who historically raised/owns issues" (an immutable reference used by `issues.staff_code`). `management_users` is the app's own login/identity system for anyone who uses the app — including, potentially, the same 4 people, but as unrelated rows (same human, no schema tie).

**Impact:**
| | Option A | Option B (recommended) |
|---|---|---|
| 92 historical issues | No difference | No difference |
| Future issue creation | Submission form could auto-fill "raised by" from the logged-in user | Submission form asks who the issue is for/from as a separate field, same as any other input |
| Application complexity | Slightly lower for that one UX convenience | Slightly higher for that one form field; overall simpler data model |
| Security | Coupling a login table to a raise-provenance table means e.g. removing a staff member could unintentionally affect login access | Cleanly separates "who raised this issue historically" from "who can log into the app" — no accidental coupling |
| Maintainability | Two tables' lifecycles become linked — a schema change to one may ripple to the other | Two independently-evolvable tables |

---

## Decision 7 — Search requirements

**Recommendation: normal indexed filtering only, for now.** No indexes are being
added by this checklist — this is a decision record only, not implementation.

**Options:**
- **A (recommended):** Rely on existing indexes on `issues` (`staff_code`, `status`, `created_date`, `priority` — all already present) plus standard indexes on the new tables' FK columns. Free-text needs, if any, use `ILIKE '%term%'` without a new index (slower table scan, but zero new DDL against the historical table).
- **B:** Add PostgreSQL full-text search (`tsvector` + GIN index, or `pg_trgm`) on `issue_title`/`issue_description`.

**Impact:**
| | Option A (recommended) | Option B |
|---|---|---|
| 92 historical issues | Zero new DDL against `issues` | Requires a new `CREATE INDEX` *on* the historical `issues` table — non-destructive, but still DDL against it, needing separate sign-off |
| Future issue creation | No difference | No difference |
| Application complexity | Lower | Higher — needs a maintained `tsvector` (generated column or trigger) or trigram index, plus query-side ranking logic |
| Security | No difference | No difference |
| Maintainability | Simpler | An extra index + generated column to maintain through future schema changes |

Recommend deferring B until plain filtering is demonstrated insufficient in practice.

---

## Decision 8 — Future issue numbering

**Recommendation: no ceiling — confirm and close.** This is less of an open
decision than it looks: the `next_issue_id()` function proposed in
`002_issue_management_system_PROPOSAL.md` (§3.2) uses `lpad(v_number::text, 3, '0')`,
and `lpad` only *pads* short numbers — it never truncates. `lpad('1000', 3, '0')`
returns `'1000'` unchanged. So the function already produces `ND-999` → `ND-1000`
→ `ND-1001` with zero code changes needed when a staff code crosses 999 issues.

**Options:**
- **Confirmed (recommended):** Keep the function as designed — 3-digit padding under 1000, natural 4+ digit growth beyond that. Historical IDs (`ND-001`...`ND-045`) are never touched or renumbered.
- Alternative some teams choose: pre-emptively widen to 4-digit padding now (`ND-0046`) for visual consistency — but this would make future IDs *look* different from historical ones (`ND-045` vs `ND-0046`), which seems like a worse outcome than letting the width grow naturally only when actually needed.

**Impact:**
| | No ceiling (recommended) | Pre-emptive widening |
|---|---|---|
| 92 historical issues | Untouched — no retroactive renumbering | Untouched either way |
| Future issue creation | Unaffected up to and past 999 | Unaffected, but ID format changes now instead of later |
| Application complexity | Negligible — already handled | Negligible |
| Security | n/a | n/a |
| Maintainability | Nothing to do | A cosmetic decision made earlier than necessary |

---

## Output

**Files inspected:** none new this turn — this checklist is derived from the live
schema and repo findings already gathered and recorded in `002_issue_management_system_PROPOSAL.md`

**Files created:** `migration/002_approval_checklist.md` (this document)

**Files modified:** none

**Database writes performed:** ZERO

**Decisions requiring owner approval:**
1. Historical rows participate in the workflow (recommended) vs. stay frozen
2. App-layer enforcement (recommended) vs. DB trigger on `issues`
3. Single `issue_comments` table (recommended) vs. two separate tables
4. `issue_status_history` alone (recommended) vs. separate `issue_reopen_history`
5. Simple `role` column with staff/management/admin (recommended) vs. full RBAC — **plus the `staff` role/`issue_staff` naming collision needs an explicit answer**
6. `management_users` independent of `issue_staff` (recommended) vs. linked
7. Normal indexed filtering (recommended) vs. full-text search — no indexes added yet either way
8. No numbering ceiling, confirm and close (recommended) vs. pre-emptive 4-digit widening

**Recommended final architecture (pending the above sign-offs):**
- Historical + future issues share one workflow; migrated content fields immutable, workflow fields mutable, for all issues
- Validation enforced in the application layer only, no new DB triggers on `issues`
- One `issue_comments` table with a `comment_type` discriminator
- One `issue_status_history` table covering all status changes including reopens
- One `management_users` table with a checked `role` column (`staff`/`management`/`admin`), independent of `issue_staff`
- Filtering via existing + standard new-table indexes; no full-text search yet
- Issue numbering via `issue_number_counters` + `next_issue_id()`, no format ceiling

**Final status: READY FOR APPROVAL DECISIONS**

No SQL was generated. No schema or data was changed. No application code was written.
