# Auto Handover Manager

**Role:** Handover File Controller
**Type:** Manager
**Location:** skills/managers/auto-handover-manager.md

---

## Purpose

The Auto Handover Manager is responsible for all operations involving the `handover/` folder. It ensures one handover file is created per day, operates in append mode when a day's file already exists, and prevents duplicate handover records.

This manager reads rules from `skills/rules/`. It uses the document structure from `skills/templates/handover-template.md`. It does not store rules or templates internally.

---

## Responsibilities

- Create one handover file per day in `handover/`
- Append new sections to an existing day's file rather than creating a duplicate
- Detect and prevent duplicate handover entries
- Confirm handover content is complete before closing

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

Document structure for handover files: `skills/templates/handover-template.md`

**Do not copy template structure into this file.** Always read from the template source above.

---

## Operating Procedure

### Step 1 — Check for existing day file
Before creating any handover file, check whether a file already exists in `handover/` for today's date using the naming standard in `skills/rules/naming-rules.md`.

### Step 2 — Apply duplicate rule
If a file for today already exists, apply the append rule from `skills/rules/duplicate-rules.md`. Do not create a second file for the same date.

### Step 3 — Create or append
- If no file exists: create using the structure in `skills/templates/handover-template.md`
- If file exists: append the new handover section to the existing file

### Step 4 — Confirm completeness
After writing, verify the handover file contains all required sections as defined in the template. Report status to `auto-validation-manager`.

---

## What This Manager Does NOT Do

- Does not modify files in any folder other than `handover/`
- Does not store naming rules internally
- Does not store duplicate prevention logic internally
- Does not write evidence files → see `auto-evidence-manager`
- Does not update PostgreSQL → see `auto-daily-task-manager`
