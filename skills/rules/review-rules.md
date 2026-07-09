# Review Rules

**Type:** Rules
**Location:** skills/rules/review-rules.md
**Authority:** Single source of truth for all review checklists, commit standards, and completion criteria

---

## Architecture Rule

These rules exist in ONE location only — this file. No manager, template, or AIOS document may store copies of these rules. All managers must read from this file.

---

## Pre-Commit Checklist

Apply this checklist before any git commit is confirmed:

| # | Check | Required |
|---|-------|---------|
| 1 | `git status` reviewed — all staged files identified | YES |
| 2 | No credential files staged (`.env`, `credentials.json`, etc.) | YES |
| 3 | No environment files staged | YES |
| 4 | No `node_modules/` content staged | YES |
| 5 | No `.next/` build output staged | YES |
| 6 | All staged files are expected for this commit | YES |
| 7 | Commit message follows the format standard below | YES |
| 8 | Remote repository confirmed before push | YES |

If any item is NOT met, halt the commit and resolve before proceeding.

---

## Commit Message Format Standard

```
[Phase/Deliverable] - [Brief description of what was completed]
```

**Examples:**
```
Phase 5 Complete - AIOS Knowledge Portal
REQ-02-D02 - Postage Workspace Foundation
Issue 003 - Crystal Lighting Fixtures return rate logged
```

**Rules:**
- Must describe WHAT was completed, not just "update" or "fix"
- Must include phase or deliverable reference where applicable
- Must be written in English
- No emoji in commit messages unless explicitly requested by the operator

---

## Evidence Completion Checklist

Apply before closing an evidence file:

| # | Check | Required |
|---|-------|---------|
| 1 | Date is correct | YES |
| 2 | Developer name is correct | YES |
| 3 | Deliverable ID is present | YES |
| 4 | All required sections are populated | YES |
| 5 | Validation results recorded (PASS / FAIL) | YES |
| 6 | Remaining work section is complete | YES |
| 7 | Final assessment is present | YES |
| 8 | File naming follows `skills/rules/naming-rules.md` | YES |

---

## Handover Completion Checklist

Apply before closing a handover file:

| # | Check | Required |
|---|-------|---------|
| 1 | Session summary is present | YES |
| 2 | Completed tasks listed | YES |
| 3 | Open items listed with owners | YES |
| 4 | Next session starting point defined | YES |
| 5 | Known risks documented | YES |
| 6 | Handover confirmation section completed | YES |

---

## Validation Run Completion Criteria

A validation run is complete only when ALL of the following are true:

| Criterion | Required |
|-----------|---------|
| All invoked managers have returned a result | YES |
| No manager returned FAIL without a resolution | YES |
| Evidence file confirmed for today | YES |
| PostgreSQL record confirmed (if applicable) | YES |
| GitHub push confirmed (if applicable) | YES |
| No existing files were modified without authorisation | YES |
| Completion report produced by `auto-validation-manager` | YES |

---

## AIOS Document Review Checklist

Apply when reviewing any new AIOS document before it is treated as final:

| # | Check | Required |
|---|-------|---------|
| 1 | Every claim traces to a named source document | YES |
| 2 | No facts have been invented or extrapolated | YES |
| 3 | [VERIFY REQUIRED] markers used where facts are unconfirmed | YES |
| 4 | [PENDING CONFIRMATION] markers used where decisions are open | YES |
| 5 | No superseded documents referenced | YES |
| 6 | Governance principle followed (source-first) | YES |
| 7 | Varmen review noted as pending (if document is not yet approved) | YES |
