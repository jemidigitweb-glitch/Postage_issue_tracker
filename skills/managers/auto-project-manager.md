# Auto Project Manager

**Role:** Orchestrator
**Type:** Manager
**Location:** skills/managers/auto-project-manager.md

---

## Purpose

The Auto Project Manager coordinates the complete automation workflow for the Postage AIOS. It invokes each specialist manager in the correct sequence and confirms completion.

This manager contains NO business rules and NO document templates. All rules are read from `skills/rules/`. All templates are read from `skills/templates/`. All domain logic belongs to the specialist managers.

---

## Architecture Principle

```
auto-project-manager
        │
        ├── reads nothing from rules/ directly
        ├── reads nothing from templates/ directly
        │
        ├── invokes → auto-validation-manager
        ├── invokes → auto-evidence-manager
        ├── invokes → auto-handover-manager
        ├── invokes → auto-daily-task-manager
        ├── invokes → auto-intelligence-manager
        └── invokes → auto-github-manager
```

The Project Manager only orchestrates. It never stores rules, never stores templates, never performs domain operations directly.

---

## Invocation Sequence

When a full automation run is required, invoke managers in this order:

| Step | Manager | Trigger condition |
|------|---------|------------------|
| 1 | `auto-validation-manager` | Always — validate before recording |
| 2 | `auto-evidence-manager` | Always — record completed work |
| 3 | `auto-handover-manager` | When handover content is available |
| 4 | `auto-daily-task-manager` | When PostgreSQL record is required |
| 5 | `auto-intelligence-manager` | When issues or gaps are to be logged |
| 6 | `auto-github-manager` | When commit or push is required |

---

## What This Manager Does NOT Do

- Does not store naming rules → see `skills/rules/naming-rules.md`
- Does not store duplicate prevention rules → see `skills/rules/duplicate-rules.md`
- Does not store business constraints → see `skills/rules/aios-rules.md`
- Does not store review checklists → see `skills/rules/review-rules.md`
- Does not contain document templates → see `skills/templates/`
- Does not perform git operations → see `auto-github-manager`
- Does not write evidence files → see `auto-evidence-manager`
- Does not write handover files → see `auto-handover-manager`
- Does not classify issues → see `auto-intelligence-manager`

---

## Completion Check

After invoking all required managers, confirm:

1. Validation result received from `auto-validation-manager`
2. Evidence file confirmed from `auto-evidence-manager`
3. Handover file confirmed from `auto-handover-manager` (if applicable)
4. PostgreSQL record confirmed from `auto-daily-task-manager` (if applicable)
5. Intelligence records confirmed from `auto-intelligence-manager` (if applicable)
6. Git status confirmed from `auto-github-manager` (if applicable)

If any manager returns FAIL, halt and report. Do not proceed to the next manager until the failure is resolved.
