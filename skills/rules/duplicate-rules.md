# Duplicate Rules

**Type:** Rules
**Location:** skills/rules/duplicate-rules.md
**Authority:** Single source of truth for all duplicate prevention rules

---

## Architecture Rule

These rules exist in ONE location only — this file. No manager, template, or AIOS document may store copies of these rules. All managers must read from this file.

---

## Evidence File Duplicate Prevention

| Rule | Action |
|------|--------|
| Before creating an evidence file, check `evidence/` for a file with today's date | If found: append to the existing file. Do not create a second file. |
| If an evidence file for today already contains a section for the same deliverable | Do not append a duplicate section. Report the duplicate to the operator. |
| Maximum evidence files per day | ONE. No exceptions. |

**Append mode:** When a file for today already exists, add new content as a new numbered section below the existing content. Preserve all existing content.

---

## Handover File Duplicate Prevention

| Rule | Action |
|------|--------|
| Before creating a handover file, check `handover/` for a file with today's date | If found: append to the existing file. Do not create a second file. |
| Maximum handover files per day | ONE. No exceptions. |

---

## Daily Issue Duplicate Prevention

Before creating a new issue file, check `intelligence-inbox/daily-issues/` for an existing issue covering the same operational problem.

**Duplicate detection criteria:**

An issue is a duplicate if:

- It describes the same operational problem in the same area of the business
- OR it uses the same SKU, courier, or process as an existing open issue
- OR the title is substantively the same as an existing issue, even if worded differently

**Action on duplicate detected:**

- Do not create a new file
- Reference the existing issue in the response
- If the new observation contains new evidence or new facts about the same problem, append the new evidence to the existing issue file
- Report the duplicate to the operator

---

## Document Gap Duplicate Prevention

Before creating a new gap file, check `intelligence-inbox/document-gaps/` for an existing gap covering the same missing documentation.

**Duplicate detection criteria:**

A gap is a duplicate if:

- It identifies the same missing document or process as an existing gap record
- OR it covers the same subject area as an existing gap, even if framed differently

**Action on duplicate detected:**

- Do not create a new file
- Reference the existing gap in the response
- If the new observation provides additional detail about the same missing documentation, append the new detail to the existing gap file

---

## PostgreSQL Daily Task Duplicate Prevention

| Rule | Action |
|------|--------|
| Before INSERT, check for a record with today's activity_date | If found: UPDATE the existing record. Do not INSERT a duplicate date record. |
| Verification SELECT must confirm exactly one record per date | If more than one record is found, report to operator for manual resolution. |

---

## General Duplicate Rule

When in doubt about whether something is a duplicate: **treat it as a duplicate and report it**. Creating an unnecessary file is harder to undo than failing to create one. The operator can always confirm that a new file is required.
