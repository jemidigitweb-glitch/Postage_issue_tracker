# Postage Brief Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Builder: Vishnu Sree | Validator: Varmen

---

## Skill Purpose

This skill gives an LLM a fast, accurate picture of the Postage department
without requiring it to read all context files. It is a navigation entry point,
not an exhaustive knowledge base.

When a question arrives, read this file first. Then follow the navigation
guide at the end to identify which context file contains the authoritative
detail for that question.

---

## 1. What Is Postage?

The Postage department at LEDSone manages all outbound and return shipments
for orders placed across multiple e-commerce marketplaces. Operations run
from Sri Lanka (SL time) against physical warehouses in the UK and Germany.

**What Postage is responsible for:**
- Daily booking of UK and German orders through the LEDSone OMS
- Label generation and Dropbox filing for all regions
- Warehouse routing decisions (which warehouse fulfils which order)
- Courier and carrier selection per order
- Return label generation for German customers
- Parcel enquiry submission for EVRi and Royal Mail issues
- US, Canada, and Amazon FBA marketplace shipment booking
- Amazon Vendor (DE wholesale) shipment booking and ASN submission

**What Postage is NOT responsible for:**
- Purchasing or procurement decisions
- Customer service communication (CST team handles customer contact;
  Postage generates and delivers labels as requested by CST)
- Vendor/courier booking ownership boundary — this is unresolved;
  see context/vendor-booking-boundary.md

**Marketplaces served:** Amazon, eBay, Shopify, Wayfair, Avasam, OnBuy, Faire

**Warehouses:** Unit 3 (UK), Unit 4 (UK), Trossingen Schmutter (DE),
Trossingen Kronen (DE)

---

## 2. Primary Responsibilities

| Responsibility | Region | Frequency |
|---------------|--------|-----------|
| UK order booking and label generation | UK | Daily |
| DE order booking and label generation | Germany | Daily |
| Germany 2nd booking (Schmutter and Kronen) | Germany | Daily (1:30 PM SL) |
| German Vendor booking for Amazon DTM1 Werne | Germany | As triggered by warehouse |
| German customer return labels | Germany | As requested by CST via Teams |
| DE DHL eBay tracking email | Germany | Mon–Fri, 5:00 PM SL (after all booking complete) |
| US marketplace booking (GoShippo, Amazon, eBay) | United States | Daily |
| Canada marketplace booking (Stallion Express) | Canada | Daily |
| Amazon FBA booking (UK) | UK | As triggered by warehouse |
| UK collection label generation | UK | As requested |
| EVRi courier enquiry submission | UK | As flagged in Teams |
| Royal Mail enquiry submission | UK | As flagged in Teams |

---

## 3. Main Workflows

There are 12 confirmed operational workflows. Full structured summaries —
including trigger, systems, inputs, steps, outputs, validation, evidence
required, and known exceptions — are in:

→ **context/bgct-procedures.md**

**Workflow index:**

| # | Workflow | Trigger | Key Output |
|---|---------|---------|-----------|
| 1 | UK Booking | Daily (manual start) | UK label PDFs + Packlist.htm in Dropbox |
| 2 | DE Booking | Daily (within UK/DE session) | DE label PDFs + Packlist.htm in Dropbox |
| 3 | Germany 2nd Booking | Daily 1:30 PM SL | Schmutter + Kronen label PDFs in Dropbox |
| 4 | German Vendor Booking | WhatsApp picklist from warehouse | DHL labels + ASN on Vendor Central |
| 5 | German Return Labels | Teams request from CST | Cropped Retourenlabel PDF via Teams |
| 6 | DE DHL eBay Tracking | Mon–Fri, after all German booking | [VERIFY REQUIRED — partial read] |
| 7 | USA Booking | Daily (manual start) | LABELS.pdf in Dropbox |
| 8 | Canada Booking | Daily (manual start) | StallionLabels.pdf in Dropbox |
| 9 | Amazon FBA Booking (UK) | WhatsApp picklist from warehouse | [VERIFY REQUIRED — partial read] |
| 10 | UK Collection Labels | Customer request | A6 label PDF via email/SMS/portal |
| 11 | EVRi Courier Enquiries | Teams flag in Evri & DPD Parcel Updates | EVRi reference number posted in Teams |
| 12 | Royal Mail Enquiries | Teams flag in Smart Track channel | [VERIFY REQUIRED — partial read] |

Workflows 6, 9, and 12 are partially confirmed — source files were too large
to read completely. See CLAUDE.md Known Gap 4 and Decision Log.

---

## 4. Main Couriers and Platforms

Full account details, tracking formats, service types, folder paths, and
known limitations for every system are in:

→ **context/courier-vendor-info.md**

**Courier quick reference:**

| Courier | Region | Primary Use |
|---------|--------|-------------|
| DHL | Germany | All DE outbound + German return labels |
| Royal Mail | UK | UK domestic outbound (waterfall cascade) |
| EVRi | UK | UK domestic outbound + enquiry management |
| GLS | Germany | DE orders: 1st Class service + value over €20 only |
| Intelcom Standard | Canada | Default Canada carrier via Stallion Express |
| Canada Post Expedited | Canada | Fallback only — more expensive |
| UPS Ground | United States | Default US warehouse carrier via GoShippo |
| USPS Ground Advantage Cubic | United States | Default US Amazon orders via Seller Central |

**Platform quick reference:**

| Platform | URL | Purpose |
|----------|-----|---------|
| LEDSone OMS | order.vintageinterior.co.uk | All booking, filtering, labelling, status updates |
| GoShippo | apps.goshippo.com/orders | US warehouse label purchasing |
| Stallion Express | ship.stallionexpress.ca | Canada label purchasing (Cottage Lighting Ltd) |
| Amazon Seller Central | sellercentral.amazon.com | US Amazon Buy Shipping; UK FBA booking |
| Amazon Vendor Central | vendorcentral.amazon.eu | DE wholesale POs + ASN submission |
| eBay Seller Hub | ebay.com Seller Hub | US eBay Buy Shipping |
| DHL Business Portal | geschaeftskunden.dhl.de | German return labels only |
| EVRi Client Portal | clients.evricloud.co.uk | EVRi parcel enquiries (account: Ledsone) |
| Dropbox | Shared folder | All label and packlist file storage |
| Microsoft Teams | Shared workspace | Internal triggers, responses, and updates |

**GLS is the least-documented courier** — account details, portal, and
enquiry process are not confirmed from source documents.
See context/courier-vendor-info.md §4 and CLAUDE.md Known Gap 5.

---

## 5. Key Business Rules

There are 40 confirmed Janarthan rules across 7 categories. Every rule is
documented with Rule ID, Business Purpose, Trigger Condition, Expected Action,
and Source Reference in:

→ **context/janarthan-rules.md**

**Rule categories and counts:**

| Category | Count | Prefix |
|----------|-------|--------|
| Routing Rules | 7 | R-ROUTE |
| Warehouse Rules | 7 | R-WH |
| Carrier Selection Rules | 6 | R-CARRIER |
| Service Assignment Rules | 15 | R-SVC |
| Validation Rules | 6 | R-VAL |
| Exception Handling Rules | 10 | R-EXC |
| Booking Decision Rules | 10 | R-BK |

**High-priority rules to know (not a substitute for reading the full rule):**

- **R-ROUTE-07** — All flag changes must complete before any booking rule runs
- **R-ROUTE-02** — Six countries must NOT be re-flagged to DE (US, Canada, Ireland, Sweden, Switzerland, Malta)
- **R-WH-01** — "Motherland" warehouse assignment is never valid — always investigate
- **R-VAL-01** — Every DHL label must be visually verified across 9 fields before printing
- **R-VAL-06** — 14-item Pre-Completion Checklist must be completed before closing the daily session
- **R-CARRIER-04** — Amazon Vendor DTM1 Werne: only Trossingen Schmutter DHL PAKET — no exceptions
- **R-BK-09** — Labels must not be printed until all service assignment steps for that region are complete
- **R-EXC-06** — Wrong SKU not identifiable: log "UNABLE TO IDENTIFY", escalate — never guess

When citing a rule to a user, always use the Rule ID (e.g. R-VAL-01) so it
can be looked up precisely in context/janarthan-rules.md.

---

## 6. Important Context Files

| File | What It Contains | When to Read It |
|------|-----------------|----------------|
| CLAUDE.md | Full operational foundation: all workflows, all 40 rules, tools, courier ecosystem, Governance, Decision Log, Known Gaps | When answering any operational question or when a fact needs tracing to its source |
| context/bgct-procedures.md | Structured summaries of all 12 workflows — trigger, systems, inputs, steps, outputs, validation, evidence, exceptions | When a user asks how to do a specific workflow |
| context/janarthan-rules.md | All 40 rules with full Business Purpose, Trigger Condition, Expected Action, and Source Reference | When a user asks why a rule exists, what a rule requires, or which rule applies to their situation |
| context/courier-vendor-info.md | Account details, tracking formats, service types, folder paths, and limitations for every courier and platform | When a user asks which courier/platform to use, what an account is called, or where a file goes |
| context/vendor-booking-boundary.md | Open cross-AIOS ownership question for vendor/courier booking | When a user asks who owns vendor booking, or when the /booking-check skill scope is relevant |
| context/team-structure.md | Team roles and responsibilities | NOT YET POPULATED — source document does not exist (CLAUDE.md Known Gap 1) |

---

## 7. Known Open Questions

These items are confirmed as unresolved. Do not guess or invent answers to them.
Direct users to Varmen for resolution.

| Question | Where Documented | Who Resolves |
|----------|-----------------|-------------|
| Who owns vendor/courier booking — Postage or Purchasing? | CLAUDE.md Decision Log; context/vendor-booking-boundary.md | Varmen |
| DHL billing account 63748818590101 still current? | CLAUDE.md Decision Log | Laksika |
| All UK FBA Amazon account names confirmed? | CLAUDE.md Decision Log | Laksika |
| Is UK Collection Label workflow in scope for internal AIOS use? | CLAUDE.md Decision Log | Varmen + Laksika |
| Complete steps for Royal Mail enquiry process | CLAUDE.md Decision Log | Laksika |
| Complete steps for Amazon FBA booking workflow | CLAUDE.md Decision Log | Laksika |
| Complete steps for DE DHL eBay tracking email | CLAUDE.md Decision Log | Laksika |
| GLS account details and enquiry process | CLAUDE.md Decision Log | Laksika |
| Postage team structure and named operators | CLAUDE.md Known Gap 1 | Laksika |
| Courier relationship document (SLAs, contacts, rate cards) | CLAUDE.md Known Gap 2 | Laksika |

If a user asks about any of these items, state clearly that the information
is [PENDING CONFIRMATION] and direct them to Varmen.

---

## 8. When to Escalate

**Escalate to Varmen when:**
- A gap in knowledge cannot be resolved from CLAUDE.md or context files
- A question involves the vendor/courier booking boundary
- A cross-AIOS decision is needed
- A process change needs to be confirmed and recorded in the Decision Log
- A source document conflict cannot be resolved without domain authority input

**Direct to Laksika when:**
- A procedural question cannot be answered from the source workflow documents
- A rule requires operational clarification not found in any BGCT document
- Confirmation of a [VERIFY REQUIRED] or [PENDING CONFIRMATION] item is needed

**Escalation path:** Gap identified → flag to Varmen → Varmen directs to
Laksika or resolves directly → confirmed resolution recorded in CLAUDE.md
Decision Log → treated as operational fact.

**Source:** CLAUDE.md Governance; CLAUDE.md Operating Rules

---

## 9. What This Skill Does NOT Cover

This skill does not contain:
- Full workflow step-by-step instructions → see context/bgct-procedures.md
- Full 40 Janarthan rules → see context/janarthan-rules.md
- Courier account details and folder paths → see context/courier-vendor-info.md
- The vendor booking boundary question detail → see context/vendor-booking-boundary.md
- Team structure and named operators → context/team-structure.md does not yet exist
- Courier SLAs, rate cards, or contact details → not documented in any source file
- Any answer to a [PENDING CONFIRMATION] Decision Log item
- Any invented rule, procedure, or contact detail

---

## 10. Quick Navigation Guide

Use this guide to identify which file to read for a given question type.

| Question Type | Go To |
|--------------|-------|
| How do I process [UK / DE / US / Canada / FBA / Return / Vendor] orders? | context/bgct-procedures.md |
| What is the rule for [routing / warehouse / carrier / service / validation]? | context/janarthan-rules.md |
| Which courier handles [country / service type]? | context/courier-vendor-info.md §1–4 |
| Which platform do I use for [US / Canada / Germany / eBay]? | context/courier-vendor-info.md §5–9 |
| Where does [label / packlist] go in Dropbox? | context/courier-vendor-info.md §10 |
| Which Teams channel handles [EVRi / Royal Mail / return labels / US]? | context/courier-vendor-info.md §11 |
| Who owns vendor booking — Postage or Purchasing? | context/vendor-booking-boundary.md |
| Is this an unresolved question? Who confirms it? | CLAUDE.md Decision Log |
| What are all 40 Janarthan rules? | context/janarthan-rules.md |
| What is the Pre-Completion Checklist? | context/janarthan-rules.md — R-VAL-06 |
| What is the EVRi REF: comment format? | context/janarthan-rules.md — R-EXC-09 |
| What DHL services are used in Germany? | context/courier-vendor-info.md §1 |
| What should I do when a booking rule fails? | context/janarthan-rules.md — R-EXC-03 |
| What should I do with a Motherland warehouse assignment? | context/janarthan-rules.md — R-WH-01 |
| What service do I apply to a DE order with 1st Class + value over €20? | context/janarthan-rules.md — R-SVC-02 |
| What is the full Postage domain picture? | CLAUDE.md |

---

## Validation Summary

### Sources Referenced

| Source | Sections Informed |
|--------|------------------|
| CLAUDE.md | §1 What Is Postage; §2 Responsibilities; §7 Open Questions; §8 Escalate; governance/escalation path |
| context/bgct-procedures.md | §3 Workflow index |
| context/janarthan-rules.md | §5 Rule categories, counts, and high-priority examples |
| context/courier-vendor-info.md | §4 Courier and platform quick reference |
| context/vendor-booking-boundary.md | §1, §4, §7 — boundary status and pending decision |

### Sections Created

All 10 required sections are present:
§1 What Is Postage — §2 Primary Responsibilities — §3 Main Workflows —
§4 Main Couriers and Platforms — §5 Key Business Rules —
§6 Important Context Files — §7 Known Open Questions —
§8 When to Escalate — §9 What This Skill Does NOT Cover —
§10 Quick Navigation Guide

### Unresolved Dependencies

| Dependency | Impact on This Skill |
|-----------|---------------------|
| context/team-structure.md not yet populated | §6 file table notes this accurately |
| Workflows 6, 9, 12 are partial reads | §3 workflow table marks these [VERIFY REQUIRED] |
| Vendor booking boundary unresolved | §7 and §10 route correctly to vendor-booking-boundary.md |
| GLS account details missing | §4 notes GLS is least-documented courier |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- A new LLM reading this file understands what Postage does, where detailed
  knowledge lives, and which file to read next — without reading the full AIOS
- No full workflow steps are copied — bgct-procedures.md is referenced
- No full 40 rules are listed — janarthan-rules.md is referenced with counts
  and 8 illustrative high-priority examples only
- No courier account detail is duplicated — courier-vendor-info.md is referenced
- Unresolved items are clearly marked and routed to the correct resolution path
- The Quick Navigation Guide gives a new LLM a single lookup table to orient
  any incoming question to the correct source file

**Pending Varmen review before operational use.**
