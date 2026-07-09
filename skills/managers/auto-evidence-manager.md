# Auto Evidence Manager

**Role:** Evidence File Controller
**Type:** Manager
**Location:** skills/managers/auto-evidence-manager.md

---

## Purpose

The Auto Evidence Manager is responsible for all operations involving the `evidence/` folder. It ensures one evidence file is created per day, operates in append mode when a day's file already exists, and prevents duplicate evidence records.

This manager reads rules from `skills/rules/`. It uses the document structure from `skills/templates/evidence-template.md`. It does not store rules or templates internally.

---

## Responsibilities

- Create one evidence file per day in `evidence/`
- Append new sections to an existing day's file rather than creating a duplicate
- Detect and prevent duplicate evidence entries
- Validate completed evidence files before closing

---

## Rules Reference

| Rule area | Source file |
|-----------|------------|
| Naming standards | `skills/rules/naming-rules.md` |
| Duplicate prevention | `skills/rules/duplicate-rules.md` |
| Business constraints | `skills/rules/aios-rules.md` |

**Do not copy rules into this file.** Always read from the rule source files above.

---

## Template Reference

Document structure for evidence files: `skills/templates/evidence-template.md`

**Do not copy template structure into this file.** Always read from the template source above.

---

## Operating Procedure

### Step 1 — Check for existing day file
Before creating any evidence file, check whether a file already exists in `evidence/` for today's date using the naming standard in `skills/rules/naming-rules.md`.

### Step 2 — Apply duplicate rule
If a file for today already exists, apply the append rule from `skills/rules/duplicate-rules.md`. Do not create a second file for the same date.

### Step 3 — Create or append
- If no file exists: create using the structure in `skills/templates/evidence-template.md`
- If file exists: append the new content section to the existing file

### Step 4 — Validate
After writing, confirm the file exists, the date is correct, and the required sections are present. Report PASS or FAIL to `auto-validation-manager`.

---

## What This Manager Does NOT Do

- Does not modify files in any folder other than `evidence/`
- Does not store naming rules internally
- Does not store duplicate prevention logic internally
- Does not write handover files → see `auto-handover-manager`
- Does not update PostgreSQL → see `auto-daily-task-manager`
