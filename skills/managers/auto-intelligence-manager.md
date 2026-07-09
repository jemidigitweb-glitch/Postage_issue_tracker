# Auto Intelligence Manager

**Role:** Issue and Gap Controller
**Type:** Manager
**Location:** skills/managers/auto-intelligence-manager.md

---

## Purpose

The Auto Intelligence Manager is responsible for all operations involving the `intelligence-inbox/` folder. It creates daily issue records, creates document gap records, detects duplicate issues, and applies the correct AIOS classification to each record.

This manager reads rules from `skills/rules/`. It does not store classification logic, naming rules, or duplicate prevention rules internally.

---

## Responsibilities

- Create new daily issue files in `intelligence-inbox/daily-issues/`
- Create new document gap files in `intelligence-inbox/document-gaps/`
- Detect duplicate issues before creating any new record
- Apply the correct AIOS classification (Daily Issue, Document Gap, or neither)
- Enforce the classification boundary: Document Gaps are only created when missing documentation is confirmed as the cause

---

## Rules Reference

| Rule area | Source file |
|-----------|------------|
| Naming standards | `skills/rules/naming-rules.md` |
| Duplicate prevention | `skills/rules/duplicate-rules.md` |
| Business constraints and classification | `skills/rules/aios-rules.md` |

**Do not copy rules into this file.** Always read from the rule source files above.

---

## Operating Procedure

### Step 1 — Receive issue description
Accept the issue description from the operator or from `auto-project-manager`.

### Step 2 — Duplicate detection
Before creating any file, check `intelligence-inbox/daily-issues/` for an existing issue covering the same operational problem. Apply the duplicate detection rule from `skills/rules/duplicate-rules.md`. If a duplicate is found, report it and halt. Do not create a second record for the same issue.

### Step 3 — Apply classification
Determine the correct classification by applying the rules in `skills/rules/aios-rules.md`:

- **Daily Issue** — an active, repeating operational problem
- **Document Gap** — confirmed absence of required documentation (only raised when root cause investigation confirms documentation is missing)
- **Neither** — if the situation does not meet either classification threshold, record the observation in the existing issue log rather than creating a new file

### Step 4 — Create the record
If classification is confirmed and no duplicate exists, create the appropriate file using the naming standard in `skills/rules/naming-rules.md`.

### Step 5 — Document Gap boundary check
Before creating any Document Gap, apply the classification boundary rule from `skills/rules/aios-rules.md`. A gap must NEVER be created before root cause is confirmed. If root cause is unconfirmed, record the concern in the Daily Issue only.

### Step 6 — Confirm and report
Verify the file was created. Report PASS or FAIL to `auto-validation-manager`.

---

## What This Manager Does NOT Do

- Does not write evidence files → see `auto-evidence-manager`
- Does not write handover files → see `auto-handover-manager`
- Does not update PostgreSQL → see `auto-daily-task-manager`
- Does not perform git operations → see `auto-github-manager`
- Does not store naming rules internally
- Does not store classification rules internally — all classification logic is in `skills/rules/aios-rules.md`
