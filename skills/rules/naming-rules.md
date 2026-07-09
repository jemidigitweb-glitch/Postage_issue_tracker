# Naming Rules

**Type:** Rules
**Location:** skills/rules/naming-rules.md
**Authority:** Single source of truth for all naming and folder standards

---

## Architecture Rule

These rules exist in ONE location only — this file. No manager, template, or AIOS document may store copies of these rules. All managers must read from this file.

---

## Evidence File Naming Standard

```
YYYY-MM-DD__[developer]__PAIOS__[deliverable-id]-EVIDENCE.md
```

**Examples:**
```
2026-07-03__vishnusri__PAIOS__REQ-02-D02-EVIDENCE.md
30-06-2026__vishnusri__PAIOS__PHASE5-EVIDENCE.md
```

**Rules:**
- Date comes first in format `YYYY-MM-DD` or `DD-MM-YYYY` — use whichever format is consistent with the active project convention
- Developer name in lowercase, no spaces
- `PAIOS` is the fixed project identifier
- Deliverable ID or phase identifier follows
- `EVIDENCE` suffix is mandatory
- File extension is `.md`

---

## Handover File Naming Standard

```
YYYY-MM-DD__[developer]__PAIOS__[phase]-HANDOVER.md
```

**Example:**
```
2026-07-03__vishnusri__PAIOS__PHASE5-HANDOVER.md
```

---

## Daily Issue File Naming Standard

```
issue-[NNN]-[short-description].md
```

**Rules:**
- Issue number is three digits, zero-padded: `001`, `002`, `003`
- Short description uses hyphens, no spaces, all lowercase
- Description must be meaningful — no generic names like `issue-003-problem.md`

**Examples:**
```
issue-001-return-parcel-accumulation.md
issue-003-high-return-rate-crystal-lighting-fixtures.md
```

---

## Document Gap File Naming Standard

```
gap-[NNN]-[short-description].md
```

**Rules:**
- Gap number is three digits, zero-padded: `001`, `002`, `003`
- Short description uses hyphens, no spaces, all lowercase
- Gap number must NOT duplicate an existing issue number — gaps have their own sequence

**Examples:**
```
gap-001-royal-mail-enquiry-complete-process.md
gap-003-labor-inclusive-pricing-and-assembly-guidelines.md
```

---

## Skill File Naming Standard

```
[skill-name].md
```

**Rules:**
- All lowercase, hyphens for spaces
- Name must describe the skill's purpose

---

## Folder Standards

| Folder | Contents |
|--------|---------|
| `evidence/` | One evidence file per day maximum |
| `handover/` | One handover file per day maximum |
| `intelligence-inbox/daily-issues/` | Issue files only, numbered sequentially |
| `intelligence-inbox/document-gaps/` | Gap files only, numbered sequentially |
| `intelligence-inbox/processed/` | Processed intelligence records only |
| `skills/managers/` | Manager files only — no rules, no templates |
| `skills/templates/` | Template files only — no rules, no workflow |
| `skills/rules/` | Rule files only — single source of truth |
| `context/` | Context reference documents only |
| `decisions/` | Decision log records only |
| `validation/` | Validation reports only |

---

## Prohibited Naming Patterns

- No spaces in file names
- No uppercase characters except in the project identifier (`PAIOS`) and status suffixes (`EVIDENCE`, `HANDOVER`)
- No duplicate numbers within the same sequence (issues have their own sequence; gaps have their own sequence)
- No generic names that do not describe the content
