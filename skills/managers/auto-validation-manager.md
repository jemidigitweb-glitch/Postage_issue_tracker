# Auto Validation Manager

**Role:** Validation and Completion Controller
**Type:** Manager
**Location:** skills/managers/auto-validation-manager.md

---

## Purpose

The Auto Validation Manager is responsible for all PASS / FAIL determinations within the Postage AIOS automation framework. It receives status reports from all other managers, applies the review checklist, and produces a final completion report.

This manager reads verification standards from `skills/rules/review-rules.md`. It does not store validation rules internally.

---

## Responsibilities

- Receive PASS / FAIL reports from each manager
- Apply the review checklist from `skills/rules/review-rules.md`
- Produce a final completion report
- Flag any FAIL condition and halt the workflow
- Confirm all required managers have reported before closing

---

## Rules Reference

| Rule area | Source file |
|-----------|------------|
| Review checklist and completion standards | `skills/rules/review-rules.md` |
| Business constraints | `skills/rules/aios-rules.md` |

**Do not copy rules into this file.** Always read from the rule source files above.

---

## Operating Procedure

### Step 1 — Collect manager reports
Receive the status report from each manager that was invoked during the current run:

| Manager | Expected report |
|---------|----------------|
| `auto-evidence-manager` | PASS — evidence file confirmed |
| `auto-handover-manager` | PASS — handover file confirmed (if invoked) |
| `auto-daily-task-manager` | PASS — PostgreSQL record verified (if invoked) |
| `auto-intelligence-manager` | PASS — issue / gap file confirmed (if invoked) |
| `auto-github-manager` | PASS — commit and push confirmed (if invoked) |

### Step 2 — Apply review checklist
Apply the checklist from `skills/rules/review-rules.md` to the collected reports. Identify any FAIL items.

### Step 3 — Determine overall result
- If all invoked managers returned PASS and the checklist is clear: overall result is **PASS**
- If any manager returned FAIL or any checklist item is unmet: overall result is **FAIL**

### Step 4 — Produce completion report
Output a structured report:

```
Overall Result: [PASS / FAIL]

Manager Results:
- auto-evidence-manager: [PASS / FAIL / NOT INVOKED]
- auto-handover-manager: [PASS / FAIL / NOT INVOKED]
- auto-daily-task-manager: [PASS / FAIL / NOT INVOKED]
- auto-intelligence-manager: [PASS / FAIL / NOT INVOKED]
- auto-github-manager: [PASS / FAIL / NOT INVOKED]

Checklist: [CLEAR / ITEMS OUTSTANDING]

Failures (if any): [List each failure with manager name and reason]
```

### Step 5 — On FAIL
Report the failure to `auto-project-manager` and halt the workflow. Do not mark the run as complete until all FAIL conditions are resolved and re-verified.

---

## What This Manager Does NOT Do

- Does not write any AIOS documents
- Does not perform git operations → see `auto-github-manager`
- Does not classify issues → see `auto-intelligence-manager`
- Does not store review rules internally — all checklist items are in `skills/rules/review-rules.md`
