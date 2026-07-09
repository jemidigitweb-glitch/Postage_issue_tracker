# Auto GitHub Manager

**Role:** Git and Repository Controller
**Type:** Manager
**Location:** skills/managers/auto-github-manager.md

---

## Purpose

The Auto GitHub Manager is responsible for all git operations within the Postage AIOS project. It checks repository status, validates commits, and confirms pushes. It does not perform any AIOS document operations.

This manager reads commit and review standards from `skills/rules/review-rules.md`. It does not store git rules internally.

---

## Responsibilities

- Check current git status before any commit
- Validate staged files against the review checklist
- Confirm commit message format
- Verify push completion
- Report repository state to `auto-validation-manager`

---

## Rules Reference

| Rule area | Source file |
|-----------|------------|
| Commit and review standards | `skills/rules/review-rules.md` |
| Naming standards | `skills/rules/naming-rules.md` |

**Do not copy rules into this file.** Always read from the rule source files above.

---

## Operating Procedure

### Step 1 — Check git status
Run `git status` to identify all staged, unstaged, and untracked files. Report the current state.

### Step 2 — Validate staged files
Apply the review checklist from `skills/rules/review-rules.md`. Confirm:
- No credential files are staged
- No environment files are staged
- No generated build files are staged unintentionally
- All staged files are expected for this commit

### Step 3 — Validate commit message
Confirm the commit message follows the format defined in `skills/rules/review-rules.md`.

### Step 4 — Confirm push
After push is executed, confirm the remote received the commit. Report PASS or FAIL.

### Step 5 — Report
Return git status, commit hash (if available), and push result to `auto-validation-manager`.

---

## What This Manager Does NOT Do

- Does not write AIOS documents
- Does not classify issues → see `auto-intelligence-manager`
- Does not write evidence files → see `auto-evidence-manager`
- Does not update PostgreSQL → see `auto-daily-task-manager`
- Does not store commit message rules internally — all standards are in `skills/rules/review-rules.md`
