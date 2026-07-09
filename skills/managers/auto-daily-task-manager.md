# Auto Daily Task Manager

**Role:** PostgreSQL Daily Task Controller
**Type:** Manager
**Location:** skills/managers/auto-daily-task-manager.md

---

## Purpose

The Auto Daily Task Manager is responsible exclusively for recording completed work into the PostgreSQL `daily_task` schema. It handles record creation, update, and verification for the designated daily task table.

This manager reads constraints from `skills/rules/aios-rules.md`. It uses the record structure from `skills/templates/daily-task-template.md`. It does not store rules or templates internally.

---

## Responsibilities

- Insert or update a daily task record in the PostgreSQL database
- Verify the record was saved correctly via SELECT
- Report PASS or FAIL based on the verification result
- Ensure one record per activity date — no duplicate date entries

---

## Rules Reference

| Rule area | Source file |
|-----------|------------|
| Business constraints | `skills/rules/aios-rules.md` |
| Duplicate prevention | `skills/rules/duplicate-rules.md` |

**Do not copy rules into this file.** Always read from the rule source files above.

---

## Template Reference

Record field structure: `skills/templates/daily-task-template.md`

**Do not copy template structure into this file.** Always read from the template source above.

---

## Database Target

| Field | Value |
|-------|-------|
| Schema | `daily_task` |
| Table | As specified in the active project configuration |
| Record type | Single record per activity date |

The table name is project-specific and must be confirmed from the active project context before any INSERT or UPDATE is executed. Do not hardcode a table name in this manager.

---

## Operating Procedure

### Step 1 — Confirm table target
Retrieve the correct table name from the active project configuration. Do not proceed without a confirmed table name.

### Step 2 — Check for existing date record
Execute a SELECT to check whether a record already exists for today's activity date. Apply the rule from `skills/rules/duplicate-rules.md`.

### Step 3 — Insert or update
- If no record exists for today: execute INSERT using fields from `skills/templates/daily-task-template.md`
- If a record exists: execute UPDATE to append or revise the day's entry

### Step 4 — Verify
Execute a SELECT to confirm the record is present and the data is correct. Report PASS or FAIL to `auto-validation-manager`.

---

## What This Manager Does NOT Do

- Does not write to the `evidence/` folder → see `auto-evidence-manager`
- Does not write to the `handover/` folder → see `auto-handover-manager`
- Does not classify issues → see `auto-intelligence-manager`
- Does not perform git operations → see `auto-github-manager`
- Does not store database credentials or connection strings
