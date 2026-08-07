# Proposal — Issue Management Application Layer

**Status: PROPOSAL ONLY. No SQL in this document has been executed. No file named
`migration/002_issue_management_system.sql` has been created.** This document is
the design/review artifact requested before that file (or any database write) is
created. It exists so Varmen/Laksika can review the design before any DDL is run.

---

## 1. Current database state (`varmen_db`, schema `issue_tracking`)

Re-confirmed live via read-only `psql` query immediately before writing this proposal
(not assumed from memory).

### `issue_tracking.issue_staff`

| Column | Type | Nullable | Default |
|---|---|---|---|
| staff_code | varchar | NO | — |
| staff_name | varchar | NO | — |
| active | boolean | NO | true |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

- PK: `staff_code`
- Row count: **4** (ND=Nandhi, SA=Sasi, ST=Sathis, NV=Nivarnan)

### `issue_tracking.issues`

| Column | Type | Nullable | Default |
|---|---|---|---|
| issue_id | varchar | NO | — |
| staff_code | varchar | NO | — |
| issue_title | text | NO | — |
| issue_description | text | NO | — |
| category | varchar | NO | — |
| status | varchar | NO | — |
| priority | varchar | YES | — |
| resolution | text | YES | — |
| created_date | date | NO | — |
| completed_date | date | YES | — |
| extra_data | jsonb | NO | '{}'::jsonb |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

- PK: `issue_id`
- FK: `staff_code` → `issue_staff(staff_code)` (`ON DELETE RESTRICT`, `ON UPDATE CASCADE`)
- Checks: `status IN ('RED','AMBER','GREEN')`; `priority IS NULL OR priority IN ('critical','high','medium','low')`; `extra_data` must be a JSON object; `completed_date >= created_date`; **`chk_issue_staff_prefix`: `split_part(issue_id,'-',1) = staff_code`**
- Existing indexes: PK (`issue_id`), plus non-unique on `staff_code`, `status`, `created_date`, `priority`
- Row count: **92**

### Historical data preservation requirement — confirmed understanding

"Do not modify existing historical tables" is read as two distinct guarantees, both
of which this proposal honors:

1. **No DDL against `issue_staff` or `issues`** — no `CREATE`, `ALTER`, `DROP`, or
   `TRUNCATE` targeting either table. Every new object lives in new tables/views/functions.
2. **No corruption of the 92 + 4 already-migrated rows** — nothing in this proposal
   deletes, overwrites, or renumbers any existing row.

**Open question (see §5):** future issue submissions and status/assignment/resolution
changes on those future issues necessarily continue to use the *same* `issues` table
— there is only one `issues` table, for both historical and future rows. I'm reading
"do not modify" as protecting the table's DDL and the 92 existing rows' data, not as
a permanent freeze on ever inserting/updating a row in `issues` again (that would make
"new issue submission" impossible). Flagging this explicitly rather than assuming —
see Question 1.

---

## 2. Feature → object mapping

| Feature | Primary object(s) |
|---|---|
| New issue submission | `issues` (existing, INSERT only) + `issue_number_counters` |
| Server-generated issue IDs for future issues | `issue_number_counters` + `issue_tracking.next_issue_id()` function |
| Management assignment/reassignment | `issue_assignment_history` |
| Investigation notes | `issue_comments` (`comment_type = 'investigation_note'`) — see Question 3 |
| RED → AMBER → GREEN workflow | `issue_status_history` (+ app-layer or trigger validation — see Question 2) |
| Final resolution required before GREEN | app-layer/trigger check against `issues.resolution` — see Question 2 |
| Authorised reopening with reason | `issue_status_history` (`is_reopen`, `reason`) + `management_users.role` |
| Assignment history | `issue_assignment_history` |
| Comment history | `issue_comments` |
| Status history | `issue_status_history` |
| Search/filter/pagination | existing indexes on `issues` (already cover status/staff_code/date/priority) + new indexes on new tables; full-text search would need a new index *on* `issues` — see Question 7 |
| User roles and permissions | `management_users.role` (simple) — see Question 5 |

---

## 3. Proposed new objects (all inside `issue_tracking`, all new)

### 3.1 `issue_tracking.management_users`

**Purpose:** People who use the application layer to manage issues — assign,
comment, change status, reopen. Per project governance (CLAUDE.md), these are
different individuals (Varmen, Laksika, Vishnu Sree, etc.) from the 4 people in
`issue_staff` (Nandhi, Sasi, Sathis, Nivarnan), who *raise* issues. No auth/user
system exists anywhere in the repo today (confirmed by a repo-wide search) — this
is the foundational table everything else in this proposal depends on.

| Column | Type | Nullable | Default |
|---|---|---|---|
| user_id | BIGSERIAL | NO | auto |
| username | VARCHAR(50) | NO | — |
| display_name | VARCHAR(100) | NO | — |
| email | VARCHAR(255) | NO | — |
| password_hash | TEXT | NO | — |
| role | VARCHAR(20) | NO | — |
| active | BOOLEAN | NO | true |
| created_at | TIMESTAMPTZ | NO | now() |
| updated_at | TIMESTAMPTZ | NO | now() |

- PK: `user_id`
- Unique: `username`, `email`
- Check: `role IN ('admin','manager','staff','viewer')` (see Question 5 — may change)
- FK: none inbound (this table is referenced *by* the others below)
- Relationship to `issues`: indirect, via `issue_assignment_history`, `issue_comments`, `issue_status_history`
- Why needed: every other new table needs a "who did this" reference; there is currently no such identity table anywhere in the project

### 3.2 `issue_tracking.issue_number_counters`

**Purpose:** Atomic, race-safe generation of future `issue_id` values that stay
compliant with the *existing* `chk_issue_staff_prefix` check on `issues` (prefix
must equal `staff_code`) — without altering that constraint or the table it lives on.

| Column | Type | Nullable | Default |
|---|---|---|---|
| staff_code | VARCHAR(10) | NO | — |
| next_number | INTEGER | NO | 1 |
| updated_at | TIMESTAMPTZ | NO | now() |

- PK: `staff_code`
- FK: `staff_code` → `issue_staff(staff_code)` (read-only reference — this table is never written to `issue_staff`, only reads its key)
- Relationship to `issues`: consumed by application insert logic to produce e.g. `ND-046`
- Why needed: Postgres sequences aren't naturally keyed per staff code; this table + an atomic `UPDATE ... RETURNING` (or the helper function below) prevents two concurrent submissions from the same staff member colliding on the same ID
- **Seed data required:** one row per current staff code, `next_number` = current max + 1 (ND=46, SA=28, ST=7, NV=15). This is a data write into a **new** table, not `issue_staff`/`issues` — still requires the same execute-approval process as before.

Companion function (also new, also inside `issue_tracking`):
```sql
CREATE OR REPLACE FUNCTION issue_tracking.next_issue_id(p_staff_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE v_number INTEGER;
BEGIN
  UPDATE issue_tracking.issue_number_counters
  SET next_number = next_number + 1, updated_at = now()
  WHERE staff_code = p_staff_code
  RETURNING next_number - 1 INTO v_number;
  IF v_number IS NULL THEN
    RAISE EXCEPTION 'No issue_number_counters row for staff_code %', p_staff_code;
  END IF;
  RETURN p_staff_code || '-' || lpad(v_number::text, 3, '0');
END;
$$ LANGUAGE plpgsql;
```
Note: 3-digit zero-padding matches the existing convention (`ND-001`...`ND-045`).
At 999 issues for one staff code this format would need to change — not urgent
at current volumes, flagged for awareness (Question 8).

### 3.3 `issue_tracking.issue_status_history`

**Purpose:** Append-only audit trail of every status change — normal RED→AMBER→GREEN
progression *and* authorised reopenings — with who changed it and why.

| Column | Type | Nullable | Default |
|---|---|---|---|
| history_id | BIGSERIAL | NO | auto |
| issue_id | VARCHAR(20) | NO | — |
| from_status | VARCHAR(20) | YES | — |
| to_status | VARCHAR(20) | NO | — |
| changed_by | BIGINT | NO | — |
| changed_at | TIMESTAMPTZ | NO | now() |
| is_reopen | BOOLEAN | NO | false |
| reason | TEXT | YES | — |

- PK: `history_id`
- FK: `issue_id` → `issues(issue_id)` `ON DELETE RESTRICT`; `changed_by` → `management_users(user_id)`
- Check: `from_status IS NULL OR from_status IN ('RED','AMBER','GREEN')`; `to_status IN ('RED','AMBER','GREEN')`
- Indexes: `(issue_id)`, `(changed_at)`
- Why needed: explicit "RED→AMBER→GREEN workflow," "authorised reopening with reason," and "status history" requirements. `issues.status` remains the live current value on the row itself (unchanged column); this table is purely the audit trail layered on top.

### 3.4 `issue_tracking.issue_assignment_history`

**Purpose:** Append-only audit trail of every assignment/reassignment.

| Column | Type | Nullable | Default |
|---|---|---|---|
| history_id | BIGSERIAL | NO | auto |
| issue_id | VARCHAR(20) | NO | — |
| assigned_to | BIGINT | NO | — |
| assigned_by | BIGINT | NO | — |
| assigned_at | TIMESTAMPTZ | NO | now() |
| reason | TEXT | YES | — |

- PK: `history_id`
- FK: `issue_id` → `issues(issue_id)`; `assigned_to`/`assigned_by` → `management_users(user_id)`
- Indexes: `(issue_id)`, `(assigned_to)`
- Why needed: explicit "assignment/reassignment" and "assignment history" requirements.

Companion view (read-only, no data write, safe to include):
```sql
CREATE OR REPLACE VIEW issue_tracking.v_current_assignment AS
SELECT DISTINCT ON (issue_id) issue_id, assigned_to, assigned_by, assigned_at
FROM issue_tracking.issue_assignment_history
ORDER BY issue_id, assigned_at DESC;
```
This derives "who is currently assigned" from the history table rather than
duplicating that state in a second table — one source of truth, no sync risk.

### 3.5 `issue_tracking.issue_comments`

**Purpose:** Comments and investigation notes on an issue.

| Column | Type | Nullable | Default |
|---|---|---|---|
| comment_id | BIGSERIAL | NO | auto |
| issue_id | VARCHAR(20) | NO | — |
| author_id | BIGINT | NO | — |
| comment_type | VARCHAR(20) | NO | 'comment' |
| body | TEXT | NO | — |
| created_at | TIMESTAMPTZ | NO | now() |
| updated_at | TIMESTAMPTZ | NO | now() |

- PK: `comment_id`
- FK: `issue_id` → `issues(issue_id)`; `author_id` → `management_users(user_id)`
- Check: `comment_type IN ('comment','investigation_note')`
- Indexes: `(issue_id)`, `(issue_id, comment_type)`
- Why needed: explicit "investigation notes" and "comment history" requirements.
  **Design decision flagged, not assumed** — see Question 3: one table with a
  type discriminator, rather than two structurally-identical tables
  (`issue_comments` + a separate `issue_investigation_notes`), since the
  columns would otherwise be duplicated verbatim.

### 3.6 `issue_tracking.issue_reopen_history` — **not proposed**

You listed this as "if needed." Recommendation: **don't create it.** A reopen is
just a status change where `from_status = 'GREEN'` and `to_status` moves backward
— it's already fully captured by `issue_status_history.is_reopen` + `.reason`.
A separate table would either duplicate those rows or require keeping two tables
in sync. Flagged as Question 4 in case there's a reporting/access-control reason
to isolate reopen events I'm not aware of.

### 3.7 Authentication / role tables — **minimal version proposed, not full RBAC**

`management_users.role` (a checked varchar, §3.1) rather than separate
`roles` / `permissions` / `role_permissions` tables. Full RBAC is easy to add
later without touching what's proposed here (it would sit alongside, not replace,
`management_users`). Flagged as Question 5 — proposing the smaller version per
"don't build for hypothetical future requirements," but this is very much a
call for you/Varmen to make given how central roles are to "authorised reopening."

---

## 4. Migration safety plan for the future `migration/002_issue_management_system.sql`

Not created yet, per instruction. When approved, it will:

- Contain only `CREATE TABLE`, `CREATE INDEX`, `CREATE VIEW`, `CREATE FUNCTION`
  statements for the 5 new tables + 1 view + 1 function above, plus the seed
  `INSERT`s into `issue_number_counters`
- **Never** contain `CREATE SCHEMA` (schema already exists), and never
  `ALTER`/`DROP`/`TRUNCATE` anything, historical or new
- **Never** contain any statement referencing `issue_staff` or `issues` other than
  read-only `REFERENCES` clauses in new FKs (which don't modify those tables)
- Run inside one transaction, `BEGIN...COMMIT`, mirroring `migrate-issues.js`'s
  existing safety model (hard `current_database() = 'varmen_db'` check first)
- Ship with a paired `migration/rollback_002.sql` containing only `DROP` statements
  for the 6 new objects (view → tables in FK-dependency order: `issue_comments`,
  `issue_status_history`, `issue_assignment_history`, `issue_number_counters`,
  then `management_users` last since the others reference it), never touching
  `issue_staff`/`issues`
- Ship with a paired `migration/verify_002.sql` containing only `SELECT`s that
  confirm: all 5 new tables + view + function exist with expected columns/FKs;
  `issue_number_counters` seed values are correct (max+1 per staff code); and —
  critically — **`issue_staff` count is still 4 and `issues` count is still 92**,
  unchanged, as the explicit historical-preservation check

---

## 5. Questions requiring approval before any SQL is written or run

1. **Scope of "do not modify historical tables"** — confirmed as: no DDL against
   `issue_staff`/`issues`, and no corruption of the 92+4 existing rows. Future
   issue INSERTs and lifecycle UPDATEs (status/resolution/assignment reflected
   on the row) to *new* rows in the same `issues` table are assumed in-scope,
   since that's unavoidable for "new issue submission" to mean anything. Please
   confirm this reading.
2. **Trigger vs. app-layer enforcement** — should RED→AMBER→GREEN ordering,
   "resolution required before GREEN," and reopen authorization be enforced by
   a `CREATE TRIGGER` attached to `issue_tracking.issues` (a new object, doesn't
   change the table's structure, but does attach new behavior to it), or should
   the historical table have zero new DB-level objects attached to it, with all
   validation done in the application layer only?
3. **Comments vs. investigation notes** — one `issue_comments` table with a
   `comment_type` column (proposed), or two separate tables?
4. **Reopen history** — confirm no separate `issue_reopen_history` table is
   needed (captured via `issue_status_history.is_reopen`), or explain the
   reporting/access need that would justify splitting it out.
5. **Roles** — simple checked `role` column (proposed) vs. full RBAC
   (`roles`/`permissions`/`role_permissions` tables)?
6. **`management_users` vs. `issue_staff`** — intentionally separate
   populations (issue-raisers vs. issue-managers), or should there be a link
   between them (e.g. a staff member who is also an app user)?
7. **Full-text search** — existing indexes on `issues` already cover
   status/staff_code/created_date/priority filtering. If free-text search over
   `issue_title`/`issue_description` is required, that needs a new `CREATE INDEX`
   *on* the existing `issues` table — non-destructive DDL, but still DDL against
   a historical table, so it needs separate explicit sign-off from everything
   else in this proposal. Needed now, or defer?
8. **3-digit issue-number ceiling** — `ND-999` is the last ID the current format
   supports for one staff code. Not urgent (highest current count is 45), but
   worth deciding the long-term plan (e.g. widen to 4 digits) now vs. later.
