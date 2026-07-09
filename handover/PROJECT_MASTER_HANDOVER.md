# PROJECT MASTER HANDOVER — Postage AIOS
# LEDSone — Postage Department
# Document Type: Permanent Master Handover
# Prepared By: Vishnu Sree (Vishnusri)
# Last Updated: 2026-07-07
# Status: ACTIVE — Updated after each major phase or deliverable

---

## Purpose of This Document

This document is the permanent, cumulative record of the LEDSone Postage AIOS project.
It allows any person, reviewer, or future LLM to understand the full project state —
what has been built, why it was built, what decisions were made, what remains open,
and exactly how to continue — without requiring verbal explanation from the builder.

This document supersedes the per-phase handover documents for continuity purposes.
Phase-specific documents (phase1-handover.md) remain in place as detailed phase records
and should be consulted alongside this file for phase-level detail.

**Read this document first whenever re-entering this project.**

---

## 1. Project Overview

### What the Postage AIOS Is

The Postage AIOS (Artificial Intelligence Operational System) is a structured knowledge
system for the LEDSone Postage department. It captures, organises, and preserves the
operational knowledge embedded in Laksika's BGCT workflow documents — making it available
to LLMs, staff, and future builders in a form that does not rely on any single person
remaining with the business.

### The Problem It Solves

LEDSone's Postage department holds operational knowledge across 12 workflows, 7 rule
categories, 8 couriers and platforms, and 4 warehouses. This knowledge currently exists
only in Laksika's BGCT workflow files and in the heads of the people who run operations
daily. If key staff leave, or if a new LLM is brought in to assist with a task, that
knowledge is at risk of being lost, misapplied, or reinvented. The Postage AIOS converts
it into a persistent, searchable, improvable system.

### What the Project Has Expanded to Include

The project started as a knowledge foundation build (Phase 1). It has since expanded to
include:

- A web-based AIOS Knowledge Portal for browsing all AIOS documents via a browser
- A standalone operational dashboard (Postage Workspace) for day-to-day operational use
- An ongoing intelligence collection system for daily issues and document gaps
- A reusable AIOS automation framework for structured builds

### What This Project Is NOT

- Not a booking automation system — it does not commit to courier bookings
- Not a source of invented rules — everything traces to confirmed source documents
- Not a replacement for Laksika — she remains the domain authority on postage operations
- Not operational until Varmen has formally approved the AIOS content

### Who Is Involved

| Person | Role | Responsibility |
|--------|------|----------------|
| MD | Strategic owner | Confirmed: no single optimisation goal — broader purpose across all AIOS builds |
| Varmen | Team Lead / Validator | Reviews and approves all content before operational use; resolves cross-AIOS decisions |
| Vishnu Sree (Vishnusri) | Builder | Structures documents into the AIOS; flags gaps; never invents facts |
| Laksika | Document source / future owner | Owns the BGCT workflow documents; final word on operational accuracy |
| Janarthan | Rules author | Authored the postage rules embedded within the workflow documents |

---

## 2. Current Project Status

| Workstream | Status | Last Updated |
|------------|--------|--------------|
| Phase 1 — AIOS Knowledge Foundation | CONDITIONAL PASS — pending Varmen approval | 2026-06-26 |
| AIOS Knowledge Portal (website) | COMPLETE — Phase 5 live, committed to git | 2026-06-30 |
| Postage Workspace (standalone dashboard) | Foundation COMPLETE — dashboard not yet built | 2026-07-03 |
| Intelligence Collection — Daily Issues | ACTIVE — 8 issues logged | 2026-07-06 |
| Intelligence Collection — Document Gaps | ACTIVE — 4 gaps identified | 2026-06-30 |
| AIOS Automation Framework | COMPLETE — 7 managers, 4 templates, 4 rule files | 2026-07-06 |
| Varmen Review and Approval | PENDING — no assets approved for operational use yet | — |

**Overall project status: Active build. Phase 1 content complete. Intelligence loop running.
Two applications in progress. Varmen approval is the primary blocker for operational use.**

---

## 3. Completed Deliverables

All deliverables listed here are complete unless otherwise noted.

### 3a. Phase 1 — AIOS Knowledge Foundation

Built from Laksika's BGCT workflow documents across two build sessions (2026-06-22 and
2026-06-23). Updated 2026-06-26 following Varmen confirmation (DL-01) and Laksika's
team structure document (Postage_Team_Workflow.pdf).

| # | Asset | Path | Status |
|---|-------|------|--------|
| 1 | CLAUDE.md | /postage-aios/CLAUDE.md | CONDITIONAL PASS |
| 2 | bgct-procedures.md | /context/bgct-procedures.md | CONDITIONAL PASS |
| 3 | janarthan-rules.md | /context/janarthan-rules.md | PASS |
| 4 | courier-vendor-info.md | /context/courier-vendor-info.md | CONDITIONAL PASS |
| 5 | vendor-booking-boundary.md | /context/vendor-booking-boundary.md | PASS |
| 6 | team-structure.md | /context/team-structure.md | PASS |
| 7 | postage-brief.md | /skills/postage-brief.md | PASS |
| 8 | procedure-lookup.md | /skills/procedure-lookup.md | PASS |
| 9 | courier-brief.md | /skills/courier-brief.md | PASS |
| 10 | booking-check.md | /skills/booking-check.md | PASS |
| 11 | issue-router.md | /skills/issue-router.md | PASS |
| 12 | daily-issue-log.md | /skills/daily-issue-log.md | PASS |
| 13 | pattern-check.md | /skills/pattern-check.md | PASS |
| 14 | phase1-completion-report.md | /validation/ | COMPLETE |
| 15 | phase1-handover.md | /handover/ | COMPLETE |
| 16 | phase1-evidence-pack.md | /evidence/ | COMPLETE |

Phase 1 totals: 13 AIOS assets | 10 PASS | 3 CONDITIONAL PASS | 0 NOT READY
Content volume: ~451,874 bytes / ~9,928 lines across all Phase 1 assets

### 3b. AIOS Knowledge Portal (Website)

A Next.js web application for browsing all AIOS documents via a browser. Built in three
website phases (Phase 3, Phase 4, Phase 5) on top of the Phase 1 and Phase 2 foundation.

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 3 | Real folder structure displayed on each section page | COMPLETE |
| Phase 4 | `.md` files clickable, rendered as styled web pages | COMPLETE |
| Phase 5 | Nested folder navigation with breadcrumb trail | COMPLETE |

Location: `/home/led284/Desktop/postage-aios/ui/`
Framework: Next.js (App Router), React 19, TypeScript 5, Tailwind CSS v4
Evidence: `evidence/30-06-2026__vishnusri__PAIOS__PHASE5-EVIDENCE.md`
Git commit: "Phase 5 - AIOS Knowledge Portal" (committed to repository)

The portal has eight sections:
Foundation | Context | Skills | Intelligence Inbox | Decisions | Evidence | Validation | Handover

### 3c. Postage Workspace (Standalone Dashboard)

A separate, independent Next.js application for day-to-day operational use by the
postage team. Not connected to or dependent on the AIOS Knowledge Portal.

| Component | Status |
|-----------|--------|
| Project initialisation | COMPLETE |
| Folder structure | COMPLETE |
| Landing page | COMPLETE |
| Root layout | COMPLETE |
| TypeScript validation | PASS |
| Production build | PASS |
| Dashboard implementation | NOT YET STARTED |

Location: `/home/led284/Desktop/postage-workspace/`
Evidence: `evidence/2026-07-03__vishnusri__PAIOS__REQ-02-D02-EVIDENCE.md`

### 3d. AIOS Automation Framework

A reusable set of manager, template, and rule documents that structure how future AIOS
builds and maintenance tasks should be approached.

| Layer | Files | Location |
|-------|-------|----------|
| Managers (7) | auto-daily-task, auto-evidence, auto-github, auto-handover, auto-intelligence, auto-project, auto-validation | /skills/managers/ |
| Templates (4) | daily-task, evidence, handover, validation | /skills/templates/ |
| Rules (4) | aios-rules, duplicate-rules, naming-rules, review-rules | /skills/rules/ |

The framework enforces a single-source-of-truth principle: rules live only in
`skills/rules/`, managers reference them, templates contain structure only. Nothing
is duplicated across layers.

---

## 4. Daily Issues

All daily issues logged in `intelligence-inbox/daily-issues/`. Issues 001 and 002 were
pre-existing at the start of the tracked build period. Issues 003–008 were created as
part of this project.

| # | File | Product / Area | Classification | Status |
|---|------|----------------|----------------|--------|
| 001 | issue-001-return-parcel-accumulation.md | Return parcels / Unit 4 | Daily Issue | Open |
| 002 | issue-002-website-order-collected-status.md | OMS order status | Daily Issue | Open |
| 003 | issue-003-high-return-rate-crystal-lighting-fixtures.md | Crystal 120 / Crystal 160 products | Daily Issue | Open |
| 004 | issue-004-labor-cost-and-assembly-pricing-discrepancy.md | Multi-component SKUs / labour cost | Daily Issue + references Gap 003 | Open |
| 005 | issue-005-inaccurate-courier-parcel-counting-and-sorting.md | DPD / EVRi / Royal Mail sorting | Daily Issue | Open |
| 006 | issue-006-inconsistent-return-addresses-on-postage-labels.md | Postage labels / return addresses | Daily Issue + references Gap 004 | Open |
| 007 | issue-007-phantom-inventory-metal-cord-clips-unit4.md | SKU CGSRBM — ~1,495 units missing | Daily Issue | Open — Under Investigation |
| 008 | issue-008-picking-image-mismatch-wire-connectors.md | SKU CODL632AGYAPK — wrong picking image | Daily Issue | Open — Under Investigation |

**Classification boundary (enforced for all issues):**
A Document Gap is only created when missing documentation is the confirmed cause —
not for execution problems or data errors. Issues 003, 005, 007, 008 are Daily Issues
only. Issues 004 and 006 each have an associated Document Gap.

---

## 5. Document Gaps

All document gaps logged in `intelligence-inbox/document-gaps/`.

| # | File | What Is Missing | Status | Source Issue |
|---|------|----------------|--------|--------------|
| 001 | gap-001-return-parcel-handling-process.md | Documented process for handling returned parcels | Open | Issue 001 |
| 002 | gap-002-website-order-collection-status-process.md | Process for managing website order collected status | Open | Issue 002 |
| 003 | gap-003-labor-inclusive-pricing-and-assembly-guidelines.md | Labour-inclusive pricing documentation and assembly cost guidelines | Open | Issue 004 |
| 004 | gap-004-return-address-selection-and-verification-protocol.md | Documented standard for return address selection and verification | Open | Issue 006 |

**Action to close a gap:** The relevant authority (Varmen or Laksika) must confirm the
correct policy or procedure → confirmed content is then written into the appropriate
AIOS document → gap record updated to RESOLVED with date and confirming authority.

---

## 6. Dashboard Project — Postage Workspace

### Why a Separate Application Was Built

Following analysis of user interview responses from Laksika and Atis Raj, and review of
the AIOS UI Build Guide, the decision was made to build a standalone operational
dashboard as a completely separate Next.js application — not as an extension of the
AIOS Knowledge Portal.

The rationale:
- The AIOS Knowledge Portal is a knowledge reference system — built for browsing,
  reading, and navigating documents
- The Postage Workspace is an operational tool — built for active daily work: tracking
  booking progress, checking courier status, logging issues, and acting on problems
- Combining the two would create a system that does neither job well
- Separation ensures the portal remains a clean knowledge reference while the workspace
  can be designed around operational workflows without constraint

The decision was confirmed on 2026-07-03 and is recorded in evidence pack
`2026-07-03__vishnusri__PAIOS__REQ-02-D02-EVIDENCE.md`.

### Current Status

The Postage Workspace foundation is complete:
- Project initialised at `/home/led284/Desktop/postage-workspace/`
- Folder structure created (`components/`, `hooks/`, `lib/`, `types/`, `styles/`)
- Landing page and root layout built
- TypeScript check and production build both PASS

Dashboard implementation has not begun. Components to build (in order):
Dashboard Layout → Header → Sidebar → Region Status → Today's Progress →
Courier Status → Open Issues → Quick Actions

### Important: Independence Requirement

The AIOS Knowledge Portal (`postage-aios/ui/`) and the Postage Workspace
(`postage-workspace/`) are fully independent applications. No code, dependencies,
or data structures are shared. Changes to one must not affect the other.

---

## 7. AIOS Automation Framework

The automation framework lives in `skills/` and is structured in three layers:

### Layer 1 — Rules (`skills/rules/`)

Single source of truth for AIOS governance and operating principles.

| File | Purpose |
|------|---------|
| aios-rules.md | Core AIOS governance principles — source-first, no invented facts, escalation path |
| duplicate-rules.md | Rules for detecting and avoiding duplicate content across AIOS documents |
| naming-rules.md | Naming conventions for all AIOS files and folders |
| review-rules.md | Review and validation standards for AIOS content |

### Layer 2 — Managers (`skills/managers/`)

Agent-level orchestration files. Each manager references the relevant rules from
`skills/rules/` — rules are not duplicated inside managers.

| File | Purpose |
|------|---------|
| auto-daily-task-manager.md | Manages daily issue logging and operational task cycles |
| auto-evidence-manager.md | Manages evidence pack creation after completed deliverables |
| auto-github-manager.md | Manages git commits, branch conventions, and repository hygiene |
| auto-handover-manager.md | Manages handover document creation and updates |
| auto-intelligence-manager.md | Manages intelligence inbox processing — issue triage and gap identification |
| auto-project-manager.md | Manages overall project state, phase transitions, and cross-workstream coordination |
| auto-validation-manager.md | Manages validation checks and PASS / CONDITIONAL PASS / NOT READY assessments |

### Layer 3 — Templates (`skills/templates/`)

Structure-only skeletons. Templates contain section headings and format guidance —
no rules, no governance, no duplicated content.

| File | Purpose |
|------|---------|
| daily-task-template.md | Template for daily task records |
| evidence-template.md | Template for evidence pack creation |
| handover-template.md | Template for handover documents |
| validation-template.md | Template for validation reports |

### Framework Principle

Rules live once in `skills/rules/`. Managers reference rules by name. Templates
contain structure only. Nothing is invented or duplicated. This ensures the framework
can be updated in one place (rules) without hunting for stale copies across managers
or templates.

---

## 8. Folder Structure

Complete structure of the Postage AIOS repository as of 2026-07-07.

```
/home/led284/Desktop/postage-aios/
│
├── CLAUDE.md                                  ← Foundation knowledge file — READ FIRST
├── README.md                                  ← Project status notice
├── 26-06-2026__vishnu__PAIOS__PHASE1-FINAL.md ← Phase 1 final build log
│
├── context/                                   ← Reference knowledge layer
│   ├── bgct-procedures.md                     ← 12 workflow summaries (CONDITIONAL PASS)
│   ├── janarthan-rules.md                     ← 40 operational rules (PASS)
│   ├── courier-vendor-info.md                 ← Courier and system reference (CONDITIONAL PASS)
│   ├── vendor-booking-boundary.md             ← Ownership confirmed by Varmen (PASS)
│   ├── team-structure.md                      ← Team structure from Laksika PDF (PASS)
│   └── README.md
│
├── skills/                                    ← LLM navigation and task skills
│   ├── postage-brief.md                       ← Entry point for a new LLM
│   ├── procedure-lookup.md                    ← Routes to correct workflow
│   ├── courier-brief.md                       ← Courier quick reference
│   ├── booking-check.md                       ← Pre-booking validation
│   ├── issue-router.md                        ← Issue classification and routing
│   ├── daily-issue-log.md                     ← Issue logging framework
│   ├── pattern-check.md                       ← Recurring issue pattern detection
│   ├── managers/                              ← 7 automation manager files
│   ├── rules/                                 ← 4 governance rule files
│   ├── templates/                             ← 4 structure-only templates
│   └── README.md
│
├── intelligence-inbox/
│   ├── daily-issues/                          ← 8 issues logged (001–008)
│   ├── document-gaps/                         ← 4 gaps identified (001–004)
│   ├── processed/                             ← Resolved items archive (empty)
│   └── daily-issues.zip                       ← Archived input batch
│
├── evidence/                                  ← Completed phase evidence packs
│   ├── phase1-evidence-pack.md                ← Phase 1 formal evidence (2026-06-26)
│   ├── 30-06-2026__vishnusri__PAIOS__PHASE5-EVIDENCE.md
│   ├── 2026-07-03__vishnusri__PAIOS__REQ-02-D02-EVIDENCE.md
│   └── README.md
│
├── decisions/                                 ← Confirmed Decision Log entries (empty)
│
├── validation/
│   ├── phase1-completion-report.md            ← Full Phase 1 assessment
│   └── README.md
│
├── handover/
│   ├── PROJECT_MASTER_HANDOVER.md             ← THIS FILE
│   ├── phase1-handover.md                     ← Phase 1 detailed handover
│   └── README.md
│
├── Phase2-inputs/                             ← Raw input materials for Phase 2
│   └── (issue inputs 001–010, one image)
│
├── ui/                                        ← AIOS Knowledge Portal (Next.js app)
│   ├── app/                                   ← App Router pages
│   ├── components/                            ← Shared UI components
│   ├── utils/                                 ← readFolder, readMarkdown, iconMap
│   ├── data/                                  ← navigation.ts — section definitions
│   └── ...
│
└── postage_aios_2026-06-22_work_log.csv       ← Phase 1 build activity log
```

**Postage Workspace** is a separate repository:
```
/home/led284/Desktop/postage-workspace/
├── app/layout.tsx                             ← Metadata: LEDSone Postage Workspace
├── app/page.tsx                               ← Landing page
├── components/{dashboard,booking,courier,issues,reports,submit,shared}/
├── hooks/ | lib/ | types/ | styles/
└── ...
```

---

## 9. Technologies Used

### AIOS Knowledge Portal (`postage-aios/ui/`)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | App Router | Web framework — server components, dynamic routing |
| React | 19 | UI rendering |
| TypeScript | 5 (strict mode) | Type safety |
| Tailwind CSS | v4 | Styling — `@import "tailwindcss"`, `@theme inline`, CSS variables |
| react-markdown | v10 | Client-side markdown rendering |
| remark-gfm | v4 | GitHub Flavored Markdown support (tables, strikethrough, etc.) |
| Lucide React | ^1.22.0 | Icons (ArrowLeft, ChevronRight, Folder, FileText, etc.) |

**Key implementation details:**
- `params` is `Promise<{ slug: string[] }>` in Next.js 16 — all dynamic pages are `async` and `await params`
- `process.cwd()` in server components resolves to `ui/` — AIOS root is `path.resolve(process.cwd(), '..')`
- `force-dynamic` on `/document/[...slug]` and `/folder/[...slug]` for SSR on every request
- Path traversal prevention in `readMarkdown` and `isFolderReadable` — checks resolved path starts with `aiosRoot + path.sep`

### Postage Workspace (`postage-workspace/`)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2.10 | Web framework — App Router |
| React | Latest | UI rendering |
| TypeScript | Latest | Type safety |
| Tailwind CSS | Latest | Styling |
| ESLint | Latest | Code quality |

### AIOS Knowledge System (Markdown documents)

All knowledge assets are plain Markdown files. No database, no special tools required
to read or edit them. Any text editor or LLM can read the source files directly.

---

## 10. Business Knowledge Captured

### Workflows Documented

| # | Workflow | Coverage | Source File |
|---|---------|---------|-------------|
| 1 | UK and DE Daily Booking | Full (38 steps, 10 phases) | Daily Booking Workflow Final.md v2.0 |
| 2 | German 2nd Booking | Full | German 2nd Booking Process Workflow.docx.md |
| 3 | German Vendor Booking | Full | German Vendor Booking Guide.md |
| 4 | German Return Labels | Full | German Return Label Workflow Guide.docx.md |
| 5 | US Marketplace Booking | Full | USA Booking Workflow Guide.docx.md |
| 6 | Canada Marketplace Booking | Full | CA Booking Workflow Guide.docx.md |
| 7 | UK Collection Labels | Full | UK Collection Label Workflow.docx.md |
| 8 | EVRi Courier Enquiries | Full | EVRi courier update.docx.md |
| 9 | Amazon FBA Booking (UK) | Partial — first 60 lines only | Amazon FBA Label Booking Workflow.md |
| 10 | DE DHL eBay Tracking Email | Partial — first section only | DE DHL eBay Tracking Email Workflow.md |
| 11 | Royal Mail Enquiries | Partial — opening section only | Royal Mail courier update.md |
| 12 | — | — | — |

### Janarthan Rules Extracted — 40 Total

| Category | Count | Rule IDs |
|----------|-------|----------|
| Routing Rules | 7 | R-ROUTE-01 to R-ROUTE-07 |
| Warehouse Rules | 7 | R-WH-01 to R-WH-07 |
| Carrier Selection Rules | 6 | R-CARRIER-01 to R-CARRIER-06 |
| Service Assignment Rules | 15 | R-SVC-01 to R-SVC-15 |
| Validation Rules | 6 | R-VAL-01 to R-VAL-06 |
| Exception Handling Rules | 10 | R-EXC-01 to R-EXC-10 |
| Booking Decision Rules | 10 | R-BK-01 to R-BK-10 |

Full rule text is in `CLAUDE.md` and `context/janarthan-rules.md`.

### Warehouses

| Warehouse | Region | Products |
|-----------|--------|---------|
| Unit 3 | UK | Standard UK fulfilment |
| Unit 4 | UK | Standard UK fulfilment (Cables, Transformers, Lampholders go to Unit 3) |
| Trossingen Schmutter | Germany | Lampshades, pendants, large fittings, Amazon Vendor |
| Trossingen Kronen | Germany | Transformers, LED bulbs, small fittings, Kleinpaket items |

### Couriers and Platforms

DHL (DE outbound + returns) | Royal Mail (UK domestic) | EVRi (UK domestic) |
GLS (DE + 1st Class + >€20) | Stallion Express (Canada) | GoShippo (US warehouse) |
Amazon Seller Central (US + UK FBA) | Amazon Vendor Central (DE wholesale) | eBay Seller Hub (US eBay)

### Team Structure

4 team members (Person 1–4 naming from Postage_Team_Workflow.pdf).
Two shifts: morning (09:00–17:30) and afternoon (12:30–20:30 SL time).
Person 1 is confirmed as team lead. Weekly pack team meeting exists (day [VERIFY REQUIRED]).
Full detail: `context/team-structure.md`

### Microsoft Teams Channels

MSG and Post | Packlist Label Issue | German postage / Replacements |
Evri & DPD Parcel Updates | Smart Track and Royal Mail Parcel Updates |
US Marketplace | German Vendor (WhatsApp group)

### Dropbox Folder Paths

| Region | Path Pattern |
|--------|-------------|
| DE daily | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/ |
| DE 2nd booking | .../2nd Booking/schmutter or kronen |
| DE Amazon Vendor | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/BOX 01, BOX 02 |
| UK | Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY |
| US | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY |
| Canada | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY |

---

## 11. Important Decisions

All decisions that have shaped the project and must be preserved for future builders.

### Resolved Decisions

| Decision ID | Date | Decision | Confirmed By |
|-------------|------|---------|--------------|
| DL-01 | 2026-06-26 | Postage owns vendor booking execution (not Purchasing) | Varmen |
| — | 2026-06-26 | team-structure.md populated from Postage_Team_Workflow.pdf — Known Gap 1 resolved | Laksika (source) |
| — | 2026-06-22 | Daily Booking Workflow Final.md v2.0 is the authority for UK/DE booking; UK & DE Booking.md and Booking 2.md are superseded and excluded | Builder (confirmed from source) |
| — | 2026-06-22 | German 2nd Booking Process Workflow.docx (1).md is a confirmed duplicate — excluded from all builds | Builder (confirmed from source) |
| — | Pre-project | No single optimisation metric for this AIOS — breadth is intentional | MD |
| REQ-02-D02 | 2026-07-03 | Postage Workspace is a separate, independent application — AIOS Knowledge Portal is not modified | Vishnusri (confirmed) |

### Open Decision Log Items

Items from CLAUDE.md that remain [PENDING CONFIRMATION]:

| Decision ID | Question | Who Confirms | Status |
|-------------|---------|-------------|--------|
| DL-02 | DHL billing account 63748818590101 still current? | Laksika | Pending |
| DL-03 | All UK FBA Amazon account names confirmed (Ledsone, DCVoltage, SRM)? | Laksika | Pending |
| DL-04 | Is UK Collection Label Workflow in scope for internal AIOS use? | Varmen + Laksika | Pending |
| DL-05 | Complete steps for Royal Mail enquiry process | Laksika | Pending |
| DL-06 | Complete steps for Amazon FBA booking workflow | Laksika | Pending |
| DL-07 | Complete steps for DE DHL eBay tracking email | Laksika | Pending |
| DL-08 | GLS account details and enquiry process | Laksika | Pending |

---

## 12. Current Progress

A summary of where each workstream stands as of the last update date (2026-07-07).

### AIOS Knowledge Foundation
- All 13 Phase 1 assets built and assessed
- 10 PASS, 3 CONDITIONAL PASS, 0 NOT READY
- Pending: Varmen approval before operational use
- Pending: Laksika confirmation of 3 partial-read workflows (§6 DE DHL eBay, §9 Amazon FBA, §12 Royal Mail)

### AIOS Knowledge Portal
- Phase 3, 4, and 5 all complete
- Committed to git: "Phase 5 - AIOS Knowledge Portal"
- Full nested folder navigation with breadcrumb trail functional
- All `.md` files render as styled pages via react-markdown + remark-gfm
- TypeScript: PASS | Production build: PASS

### Postage Workspace Dashboard
- Foundation built and validated (2026-07-03)
- Dashboard implementation not yet started
- 8 components in the planned build sequence

### Intelligence Collection
- 8 daily issues logged (001–008)
- 4 document gaps identified (001–004)
- Issues 007 and 008 are active under investigation
- Pattern detection not yet active (requires Varmen approval and more issue volume)

### Automation Framework
- 7 managers, 4 templates, 4 rule files — all created
- Framework has not yet been formally validated or used in a live automation task

---

## 13. Next Immediate Tasks

Actions that should be completed next, in priority order.

### Priority 1 — Required Before Operational Use

| Action | Owner | What It Unlocks |
|--------|-------|----------------|
| Varmen reviews and approves CLAUDE.md | Varmen | Foundation moves to operational status |
| Varmen reviews and approves all 13 Phase 1 assets | Varmen | All content moves to operational status |
| Record Varmen approval in decisions/ folder | Varmen / Vishnusri | Phase 1 formally closed |

### Priority 2 — Required for Full Phase 1 Completion

| Action | Owner | What It Unlocks |
|--------|-------|----------------|
| Laksika provides complete steps for DE DHL eBay tracking (DL-07) | Laksika | bgct-procedures.md §6 VERIFY REQUIRED removed |
| Laksika provides complete steps for Amazon FBA booking (DL-06) | Laksika | bgct-procedures.md §9 VERIFY REQUIRED removed |
| Laksika provides complete steps for Royal Mail enquiries (DL-05) | Laksika | bgct-procedures.md §12 VERIFY REQUIRED removed |
| Update bgct-procedures.md §6, §9, §12 with confirmed steps | Vishnusri | CONDITIONAL PASS → PASS |

### Priority 3 — Dashboard Implementation

| Action | Owner | Notes |
|--------|-------|-------|
| Begin Postage Workspace dashboard build | Vishnusri | Start with Dashboard Layout → Header → Sidebar |
| Follow AIOS UI Build Guide for component development | Vishnusri | Component-by-component order confirmed |

### Priority 4 — Intelligence Loop

| Action | Owner | Notes |
|--------|-------|-------|
| Investigate Issue 007 (phantom inventory SKU CGSRBM) | Warehouse team | Physical audit + PO reconciliation |
| Investigate Issue 008 (picking image SKU CODL632AGYAPK) | Warehouse team | Image replacement + inventory audit |
| Continue daily issue logging as new issues surface | Postage team | Use skills/daily-issue-log.md framework |

---

## 14. Pending Work

Work that has been scoped or committed to but not yet completed.

| Item | Description | Dependency |
|------|------------|-----------|
| Three partial workflows | bgct-procedures.md §6, §9, §12 need complete step content | Laksika |
| GLS details | courier-vendor-info.md §4 incomplete — no account or procedure | Laksika |
| Courier relationship document | No SLAs, rate cards, or account contacts in source | Laksika (Gap 2) |
| booking-check.md vendor scope note | Minor text update — remove provisional marker (DL-01 resolved) | Vishnusri |
| Cross-AIOS bridge file | Postage ↔ Purchasing boundary file (now unblocked since DL-01 resolved) | Vishnusri |
| Postage Workspace dashboard | 8 components not yet built | Vishnusri |
| Daily issue backlog | Historical issue backlog from Atis Raj not yet transferred | Vishnusri + Atis Raj |
| decisions/ folder | No confirmed decision files recorded yet — only CLAUDE.md entries | Vishnusri after Varmen approval |
| Team structure weekly meeting day | [VERIFY REQUIRED] — source says "to be confirmed with team" | Laksika |
| DHL billing account confirmation (DL-02) | Account 63748818590101 seen on label — may have changed | Laksika |
| FBA account name confirmation (DL-03) | Ledsone / DCVoltage / SRM — may not be complete list | Laksika |
| Gap resolutions (001–004) | All 4 document gaps require confirmed policy from Laksika / Varmen | Varmen + Laksika |

---

## 15. AIOS Rules

The core operating rules that govern all work in this project. These must be followed
by any builder, LLM, or team member working on this AIOS.

### What This AIOS Always Does

1. **Source-first.** Every procedural answer cites a specific workflow document by name.
   If the answer is not in a source document, say so explicitly. Never substitute
   general knowledge for confirmed source content.

2. **Rules are rules, not steps.** Janarthan's rules are surfaced as condition → action
   statements, not buried in SOP lists. They are findable independently of procedures.

3. **VERIFY REQUIRED is used when needed.** When a fact cannot be confirmed from source
   documents, mark it `[VERIFY REQUIRED]`. LLM plausibility is not the same as
   a source document confirming something.

4. **Escalation path is followed.** Gap identified → Varmen → Laksika or direct
   resolution → Decision Log entry → then treated as fact.

5. **Evidence requirements are stated.** When describing a completed workflow, note what
   evidence must be saved: label PDFs, screenshots, Dropbox paths, packlist files,
   Teams posts.

6. **Authoritative document versions are used.** Daily Booking Workflow Final.md (v2.0)
   is the authority for UK/DE booking. UK & DE Booking.md and Booking 2.md are
   superseded. German 2nd Booking Process Workflow.docx (1).md is a confirmed duplicate.

### What This AIOS Never Does

1. **Invent a postage rule** not found in a source document or confirmed by Varmen.

2. **Commit to a courier booking** or mark an order as shipped automatically.

3. **Merge Janarthan's rules silently into procedures.** The rules layer is kept distinct.

4. **Treat [PENDING CONFIRMATION] items as settled.** They remain open until explicitly resolved.

5. **Store sensitive data** — courier contract pricing, credentials, or customer data —
   without Varmen confirming this is acceptable.

6. **Override Laksika** as the domain authority on postage operations.

### Classification Boundary (Daily Issue vs Document Gap)

A **Daily Issue** is created when:
- An operational problem is confirmed and active
- The cause may be an execution error, data error, or system behaviour

A **Document Gap** is created when:
- Investigation or confirmed evidence shows that missing documentation is the cause
- Not as a precaution — only when the gap is confirmed

Never create a Document Gap as a precautionary measure before the cause is established.

---

## 16. How To Continue This Project

A concrete guide for the next person, reviewer, or LLM who opens this project.

### First 10 Minutes — Orient

1. Read this document in full (you are reading it now)
2. Read `CLAUDE.md` — Purpose, Governance, and Decision Log sections
3. Check `validation/phase1-completion-report.md` for Phase 1 detail
4. Run `git log --oneline -10` to see recent commits and branch state

### Before Any Content Work

- Confirm Varmen has reviewed and approved CLAUDE.md. If not, do not start new content —
  contact Varmen first. No AIOS content is operational without Varmen's approval.
- Check this document's Last Updated date (Section 17) — if more than two weeks have
  passed since the last update, review open issues and decisions for new developments
  before acting

### For Knowledge Foundation Work

- Use `context/bgct-procedures.md` as the reference for workflow procedure content
- Use `context/janarthan-rules.md` for rule content
- Never duplicate rule text across files — rules live in janarthan-rules.md and CLAUDE.md
- When adding confirmed content from Laksika, remove the corresponding `[VERIFY REQUIRED]`
  marker and add a Decision Log entry in CLAUDE.md with date and confirming authority

### For Website Work (AIOS Knowledge Portal)

- Location: `/home/led284/Desktop/postage-aios/ui/`
- Run `npx tsc --noEmit` as the authoritative TypeScript check — not IDE diagnostics
- `params` is `Promise<{ slug: string[] }>` — always `async` + `await params`
- AIOS root is `path.resolve(process.cwd(), '..')` from within the `ui/` directory
- After significant changes, run `npm run build` to confirm no build errors

### For Dashboard Work (Postage Workspace)

- Location: `/home/led284/Desktop/postage-workspace/`
- Fully independent from the AIOS Knowledge Portal — do not link or import between them
- Follow the AIOS UI Build Guide for component development approach
- ChatGPT handles planning, architecture, and UX — Claude Code handles implementation

### For Intelligence Collection

- New daily issues go in `intelligence-inbox/daily-issues/`
- Naming convention: `issue-NNN-short-description.md` (three-digit padded number)
- New document gaps go in `intelligence-inbox/document-gaps/`
- Naming convention: `gap-NNN-short-description.md`
- Always apply the classification boundary — do not create a gap without confirmed evidence

### For Evidence Packs

- Evidence packs go in `evidence/`
- Naming convention: `YYYY-MM-DD__developer__PROJECT__DELIVERABLE-ID-EVIDENCE.md`
- Every evidence pack must have: Objective / Work Completed / Validation Evidence / Final Status

### What a New LLM Must NOT Do

- Rebuild Phase 1 assets — they are complete. Read them, do not rebuild them.
- Invent team member names — use Person 1–4 naming from team-structure.md
- Fill in the three [VERIFY REQUIRED] workflows from general knowledge
- Resolve any [PENDING CONFIRMATION] item without Varmen or Laksika input
- Modify the AIOS Knowledge Portal and the Postage Workspace at the same time in the
  same session — they are independent and changes to one must not affect the other

---

## 17. Last Updated

| Field | Value |
|-------|-------|
| **Document version** | 1.0 |
| **Last updated** | 2026-07-07 |
| **Updated by** | Vishnu Sree (Vishnusri) |
| **Reason for update** | Initial creation — master handover document compiled from full project history |
| **Next update trigger** | Any of: major deliverable completed, Varmen approval received, new phase started, significant open decision resolved |

---

### How to Update This Document

When updating, always:
1. Edit the section(s) that changed — do not rewrite the whole document
2. Update Section 2 (Current Project Status) to reflect the new overall state
3. Move completed items from Section 13 (Next Immediate Tasks) to Section 3 (Completed Deliverables)
4. Move resolved pending items from Section 14 (Pending Work) and Section 11 (Decisions) to resolved
5. Update Section 17 (Last Updated) with the new date, updater, and reason

**Do not delete historical decision records.** Move resolved decisions within Section 11
from the Open table to the Resolved table — they must remain visible.

---

*Permanent master handover document | Project: Postage AIOS | LEDSone Postage Department*
*Prepared by: Vishnu Sree (Vishnusri) | Date: 2026-07-07*
