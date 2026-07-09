# AIOS Rules

**Type:** Rules
**Location:** skills/rules/aios-rules.md
**Authority:** Single source of truth for all AIOS business constraints and classification rules

---

## Architecture Rule

These rules exist in ONE location only — this file. No manager, template, or AIOS document may store copies of these rules. All managers must read from this file.

---

## Core AIOS Constraints

| Rule | Constraint |
|------|-----------|
| Source-first | Every procedural answer must cite a specific source document. If the answer is not in a source document, state that explicitly. Do not substitute general knowledge. |
| No invented rules | No rule, fact, or procedure may be invented. Everything must trace to a source document or a Varmen-confirmed decision. |
| No automatic commitment | The AIOS never commits to courier bookings or marks orders as shipped automatically. |
| Escalation path | Gap identified → Varmen → Laksika or direct resolution → Decision Log entry → then treated as fact. |
| Laksika authority | Laksika is the domain authority on postage operations. The AIOS does not overrule Laksika. |
| VERIFY REQUIRED | When a fact cannot be confirmed from source documents, mark it [VERIFY REQUIRED]. AI-generated plausibility is not the same as confirmation. |

---

## Classification Rules

### Daily Issue Classification

A situation is classified as a **Daily Issue** when:

- It is an active, repeating operational problem
- It is consuming warehouse or postage team resource
- It has been reported or observed on multiple occasions
- The root cause may or may not be identified

A Daily Issue does NOT automatically generate a Document Gap.

### Document Gap Classification

A situation is classified as a **Document Gap** when:

- Root cause investigation has confirmed that missing documentation is a contributing cause
- A specific piece of required documentation has been identified as absent from the AIOS
- The gap is not a duplicate of an existing gap record

**Critical boundary:** A Document Gap must NEVER be created before root cause is confirmed. Creating a gap when the root cause is unconfirmed incorrectly frames an execution or operational problem as a documentation problem.

### Classification: Neither

If a situation does not meet the threshold for Daily Issue or Document Gap classification:
- Record the observation as a note within the existing issue log
- Do not create a new file
- Do not escalate to Varmen until the situation meets classification criteria

---

## Document Governance Rules

| Rule | Detail |
|------|--------|
| One evidence file per day | The `auto-evidence-manager` must not create more than one evidence file per date. Append to the existing file. |
| One handover file per day | The `auto-handover-manager` must not create more than one handover file per date. Append to the existing file. |
| Superseded documents | Superseded source documents must never be referenced. The current authority document takes precedence. |
| Decision Log | Every confirmed resolution of a gap must be logged in the CLAUDE.md Decision Log before it is treated as operational fact. |
| Pending confirmation | Items marked [PENDING CONFIRMATION] must not be treated as settled. They remain open until explicitly resolved. |

---

## Sensitive Data Rules

- Credentials must never be stored in AIOS documents
- Courier contract pricing must not be stored without Varmen confirmation
- Customer shipping data must not be stored in AIOS documents

---

## Automation Boundary Rules

| Rule | Detail |
|------|--------|
| Managers only orchestrate | `auto-project-manager` only invokes other managers. It never performs domain operations directly. |
| Rules in one place | All rules exist only in `skills/rules/`. No manager or template may store a copy of a rule. |
| Templates in one place | All document structures exist only in `skills/templates/`. No manager may store template content. |
| Separation of concerns | Each manager is responsible for exactly one domain. No manager may perform another manager's operations. |
