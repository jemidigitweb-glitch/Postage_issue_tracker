# Issue Router Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Builder: Vishnu Sree | Validator: Varmen

---

## 1. Skill Purpose

This skill identifies the type of operational issue, routes it to the affected
workflow, relevant courier or platform, and correct escalation path. It does not
resolve issues — it tells an LLM where to look and who to involve.

**One question this skill answers:**
"What type of issue is this, where should I investigate, and who resolves it?"

**What this skill does NOT do:**
- Resolve issues directly
- Quote rule text — rule IDs are used as references only
- Describe workflow steps — procedure sections are referenced only
- Cover issues outside confirmed source documents

---

## 2. How To Use This Skill

**Step 1 — Identify the issue category.**
Read Section 3. Match the symptoms described to the closest issue category.

**Step 2 — Follow the routing.**
Each category in Sections 4–7 provides: likely workflow, relevant rule IDs,
relevant context and skill files, and escalation path.

**Step 3 — Escalate if the routing does not resolve the question.**
Use Section 8 for escalation paths by recipient.

**Step 4 — If the issue does not match any category:**
State clearly it is not covered by source documents. Escalate to Varmen.
Do not invent a resolution path.

---

## 3. Issue Categories

Nine confirmed issue categories based on operational workflows and exception
handling rules in the source documents.

| # | Category | Typical Symptoms |
|---|---------|-----------------|
| 1 | Booking Issues | Order not booking; service not assigning; label not generating; rule not running |
| 2 | Vendor Booking Issues | Amazon Vendor PO mismatch; ASN not submitting; DHL label rejected; carton label missing |
| 3 | Return Label Issues | German return label not generating; wrong tab selected; label not received in IONOS |
| 4 | Tracking Issues | Parcel not moving; delivery not attempted; tracking number format unclear |
| 5 | Courier Issues | DHL label error; Royal Mail enquiry; EVRi enquiry; GLS service question |
| 6 | Marketplace Issues | Amazon, eBay, or Shopify order problem; FBA mismatch; Vendor Central error |
| 7 | Validation Failures | Label failed visual check; Pre-Completion Checklist item incomplete; count mismatch |
| 8 | Missing Information Issues | Wrong SKU; Motherland warehouse; incomplete address; unresolvable gap |
| 9 | Workflow Exception Issues | Duplicate order; booking rule failure; warehouse unavailable; stock out |

---

## 4. Workflow Routing Matrix

For each issue category, this matrix identifies the affected workflow,
the source procedure section, relevant rule category, and first-response action.

---

### Category 1 — Booking Issues

| Symptom | Affected Workflow | Procedure Section | Rule Reference | First Response |
|---------|-----------------|------------------|---------------|---------------|
| UK order not booking | UK Booking | bgct-procedures.md §1 | R-ROUTE-07, R-SVC-08 | Confirm flags complete; confirm No Service resolved; re-run rule |
| DE order not booking | DE Booking | bgct-procedures.md §2 | R-ROUTE-07, R-SVC-01 | Confirm flags complete; confirm No Service resolved; re-run rule |
| Booking rule not running | UK or DE Booking | bgct-procedures.md §1 or §2 | R-EXC-03 | Re-run rule; test 1 order; notify team lead if system-wide |
| Service not assigning to UK order | UK Booking | bgct-procedures.md §1 Phase 9 | R-SVC-08 to R-SVC-15 | Check product type and weight; manually assign closest match; log in Teams |
| Service not assigning to DE order | DE Booking | bgct-procedures.md §2 Phase 8 | R-SVC-01 to R-SVC-07 | Check product type; apply correct DE service filter |
| UK label not generating | UK Booking | bgct-procedures.md §1 Phase 10 | R-BK-09 | Confirm all UK service steps complete before printing |
| DE label not generating | DE Booking | bgct-procedures.md §2 Phase 10 | R-BK-09 | Confirm all DE service steps complete before printing |
| 2nd booking rule not running on Schmutter | Germany 2nd Booking | bgct-procedures.md §3 Phase 4 | R-WH-07, R-BK-01 | Confirm first booking cleared to Dispatched; run Schmutter before Kronen |
| Canada label not generating | Canada Booking | bgct-procedures.md §8 | R-CARRIER-01 | Confirm Intelcom Standard selected; check CSV format |
| US label not generating | USA Booking | bgct-procedures.md §7 | R-CARRIER-02, R-CARRIER-03 | Confirm carrier selected; check weight and dimensions |

---

### Category 2 — Vendor Booking Issues

| Symptom | Affected Workflow | Procedure Section | Rule Reference | First Response |
|---------|-----------------|------------------|---------------|---------------|
| PO quantity does not match picklist | German Vendor Booking | bgct-procedures.md §4 Step 2 | bgct-procedures.md §4 Exceptions | Do not proceed; clarify with warehouse team before creating labels |
| DHL label service is wrong (Kleinpaket or International used) | German Vendor Booking | bgct-procedures.md §4 Step 4 | R-CARRIER-04 | Cancel label; recreate using Trossingen Schmutter DHL PAKET only |
| ASN rejected or cannot be submitted | German Vendor Booking | bgct-procedures.md §4 Step 7 | R-VAL-04, R-BK-02 | Confirm all tracking numbers recorded in Google Sheet first |
| Tracking numbers missing before ASN | German Vendor Booking | bgct-procedures.md §4 Step 6 | R-VAL-04 | Do not submit ASN until all tracking numbers confirmed |
| Carton label PDF has multiple pages — not split | German Vendor Booking | bgct-procedures.md §4 Step 8 | R-VAL-05, R-BK-03 | Split using maxai.me before saving; one page per BOX folder |
| Box missing its carton label in Dropbox | German Vendor Booking | bgct-procedures.md §4 Step 8 | R-BK-03 | Re-download carton label PDF; split and re-save correct page to BOX subfolder |
| WhatsApp confirmation not sent | German Vendor Booking | bgct-procedures.md §4 Step 9 | bgct-procedures.md §4 Evidence | Send WhatsApp confirmation before closing |

**Vendor booking ownership note:**
These issues are routed to Postage based on the provisional architecture position.
Ownership is [PENDING CONFIRMATION]. See context/vendor-booking-boundary.md.

---

### Category 3 — Return Label Issues

| Symptom | Affected Workflow | Procedure Section | Rule Reference | First Response |
|---------|-----------------|------------------|---------------|---------------|
| German return label request received in Teams | German Return Labels | bgct-procedures.md §5 | R-CARRIER-05, R-BK-06 | Confirm address is complete; open DHL Business Portal |
| Wrong DHL tab selected (SELBSTZAHLER instead of ONLINE) | German Return Labels | bgct-procedures.md §5 Step 2 | R-CARRIER-05 | Do not fill in form; switch to RETOURE ONLINE tab first |
| Return receiver field blank or incorrect | German Return Labels | bgct-procedures.md §5 Step 2 | R-BK-05 | Do not generate; raise with team; field must show Hüttenlampe e.K. |
| IONOS email not received after submission | German Return Labels | bgct-procedures.md §5 Step 4 | bgct-procedures.md §5 Exceptions | Wait; check IONOS spam; check DHL portal order history |
| Label not cropped before sharing in Teams | German Return Labels | bgct-procedures.md §5 Step 5 | bgct-procedures.md §5 | Crop via PDFResizer.com before posting |
| Response posted as new Teams message (not reply) | German Return Labels | bgct-procedures.md §5 Step 6 | bgct-procedures.md §5 | Delete new message; repost as reply to original CST request |
| Customer address incomplete in Teams request | German Return Labels | bgct-procedures.md §5 Inputs | bgct-procedures.md §5 | Request missing fields from CST before generating |

---

### Category 4 — Tracking Issues

| Symptom | Affected Workflow | Teams Channel | Rule Reference | First Response |
|---------|-----------------|--------------|---------------|---------------|
| EVRi parcel not moving | EVRi Courier Enquiries | Evri & DPD Parcel Updates | R-EXC-09, R-EXC-10 | Submit enquiry via EVRi portal; post REF: comment; post reference as Teams reply |
| EVRi courier claimed non-delivery falsely | EVRi Courier Enquiries | Evri & DPD Parcel Updates | R-EXC-09 | Submit "reattempt delivery" REF: comment |
| EVRi parcel returned to sender | EVRi Courier Enquiries | Evri & DPD Parcel Updates | R-EXC-09 | Submit "investigate and provide reason" REF: comment |
| Royal Mail parcel not delivered | Royal Mail Enquiries | Smart Track and Royal Mail Parcel Updates | bgct-procedures.md §12 | Submit enquiry via help.royalmail.com/s/regionalaccountserviceteam [VERIFY REQUIRED] |
| DHL tracking number format unclear | DE Booking or German Vendor | courier-vendor-info.md §1 | R-VAL-01 | DHL Sendungsnummer is 18 digits starting with 003404... |
| Stallion tracking prefix unrecognised | Canada Booking | courier-vendor-info.md §5 | bgct-procedures.md §8 | Stallion tracking is SE-prefixed (e.g. SE260225TEJ0) |
| DPD parcel tracking issue | Evri & DPD Parcel Updates | Evri & DPD Parcel Updates | [VERIFY REQUIRED] | DPD enquiry process not documented — escalate to Laksika |

---

### Category 5 — Courier Issues

| Symptom | Courier | Relevant File | Rule Reference | First Response |
|---------|---------|--------------|---------------|---------------|
| DHL label has missing or blank field | DHL | courier-vendor-info.md §1 | R-VAL-01 | Do not print; raise with team; check all 9 label fields |
| DHL RETOURE SELBSTZAHLER selected instead of ONLINE | DHL | courier-vendor-info.md §1 | R-CARRIER-05 | Switch to RETOURE ONLINE tab; restart form |
| GLS service needed but portal/account unknown | GLS | courier-vendor-info.md §4 | R-SVC-02 | [VERIFY REQUIRED] — escalate to Laksika; GLS not documented beyond trigger rule |
| EVRi enquiry reference number not posted in Teams | EVRi | courier-vendor-info.md §3 | R-EXC-10 | Do not close EVRi portal; copy reference; post as Teams reply |
| EVRi enquiry comment missing REF: prefix | EVRi | courier-vendor-info.md §3 | R-EXC-09 | Resubmit with correct REF: standard comment format |
| Royal Mail enquiry process steps unclear | Royal Mail | courier-vendor-info.md §2 | bgct-procedures.md §12 | [VERIFY REQUIRED] — full process not confirmed; escalate to Laksika |
| Canada Post Expedited selected instead of Intelcom | Stallion Express | courier-vendor-info.md §5 | R-CARRIER-01, R-BK-08 | Switch to Intelcom Standard at Stallion editing step before purchase |
| UPS not available on GoShippo | GoShippo | courier-vendor-info.md §6 | R-CARRIER-02 | Try USPS Ground Advantage as alternative; log reason |

---

### Category 6 — Marketplace Issues

| Symptom | Platform | Procedure Section | Rule Reference | First Response |
|---------|---------|------------------|---------------|---------------|
| US Amazon order not generating Buy Shipping label | Amazon Seller Central | bgct-procedures.md §7 Phase 7 | R-CARRIER-03 | Confirm USPS Ground Advantage Cubic selected; check account (Neighbour Market US) |
| US eBay order not in GoShippo | eBay Seller Hub | bgct-procedures.md §7 Phase 8 | bgct-procedures.md §7 | US eBay orders use eBay Seller Hub — not GoShippo |
| Amazon Vendor Central — wrong account used | Amazon Vendor Central | bgct-procedures.md §4 | R-CARRIER-04 | Correct account: DE – Ledsone UK Limited – DE at vendorcentral.amazon.eu |
| Amazon FBA booking steps unclear | Amazon Seller Central (FBA) | bgct-procedures.md §9 | bgct-procedures.md §9 | [VERIFY REQUIRED] — source file partially read; escalate to Laksika |
| Stallion CSV upload failing | Stallion Express | bgct-procedures.md §8 Phase 5 | bgct-procedures.md §8 | Check CSV format matches Stallion Import Template; re-export from OMS |
| Duplicate Shopify order in queue | Shopify / LEDSone OMS | bgct-procedures.md §1 | R-EXC-04 | Do not book; flag in MSG & Post Teams group; await confirmation |
| Wayfair order showing Motherland warehouse | Wayfair / LEDSone OMS | bgct-procedures.md §1 Phase 5 | R-WH-01, R-VAL-03, R-EXC-07 | Confirm stock out; manually select correct warehouse; never book to Motherland |

---

## 5. Courier Issue Routing

Use this section when the issue is courier-specific and the workflow is secondary.

| Courier | Issue Type | Route To | Escalate To |
|---------|-----------|---------|------------|
| DHL | Label generation error | courier-vendor-info.md §1 + context/janarthan-rules.md R-VAL-01 | Team lead if label cannot be corrected |
| DHL | Return label not generated | bgct-procedures.md §5 + R-BK-05, R-BK-06 | Team lead if portal unavailable |
| DHL | Service selection error (Vendor) | context/janarthan-rules.md R-CARRIER-04 | Team lead — wrong DHL service for DTM1 Werne is rejected by Amazon FC |
| Royal Mail | Tracking enquiry | bgct-procedures.md §12 [VERIFY REQUIRED] | Laksika — full enquiry steps not confirmed |
| EVRi | Tracking enquiry | bgct-procedures.md §11 + R-EXC-09, R-EXC-10 | Team lead if portal unavailable |
| EVRi | Tracking number not EVRi prefix | courier-vendor-info.md §3 | Check if parcel is DPD — DPD process not documented; escalate to Laksika |
| GLS | Any operational question | courier-vendor-info.md §4 | Laksika — GLS procedure not documented |
| Intelcom / Canada Post | Carrier switch required | context/janarthan-rules.md R-CARRIER-01 | bgct-procedures.md §8 for execution |
| UPS / USPS | US carrier selection | context/janarthan-rules.md R-CARRIER-02, R-CARRIER-03 | bgct-procedures.md §7 for execution |

---

## 6. Booking Issue Routing

Use this section when the issue is specific to a booking action or sequence.

| Booking Failure Type | Rule Reference | Immediate Action | Escalation |
|--------------------|---------------|-----------------|-----------|
| Wrong SKU cannot be identified | R-EXC-06 | Log "UNABLE TO IDENTIFY" in Listing Correction | Team lead |
| Service cannot be assigned | R-EXC-02 | Check product type and weight; manually assign closest match; log in Teams Packlist Label Issue | Team lead if still unresolvable |
| Booking rule fails to run | R-EXC-03 | Re-run on affected orders; test 1 order if fails again | Team lead immediately if system-wide |
| Stock unavailable | R-EXC-01 | Change to alternative warehouse (DE → UK, or Schmutter ↔ Kronen) | Team lead if no stock anywhere |
| Warehouse unavailable | R-EXC-05 | Switch all affected orders to alternative warehouse | Team lead immediately |
| Duplicate order detected | R-EXC-04 | Do not book; flag in Teams MSG & Post | Await team confirmation before proceeding |
| Address change after label booked | R-EXC-08 | Cancel label if carrier permits; update address in OMS; re-book; log change | Team lead if cancellation not possible |
| Labels printed before all service steps complete | R-BK-09 | Stop printing; complete all service steps; reprint incorrect labels | Team lead if labels already sent to warehouse |
| Schmutter 2nd booking run before Kronen check done | R-BK-01 | Pause; complete Schmutter run fully; then run Kronen | — |
| ASN submitted before all tracking numbers recorded | R-VAL-04, R-BK-02 | Tracking numbers cannot be retrieved from Vendor Central after submission; escalate immediately | Laksika + Varmen |

---

## 7. Validation Failure Routing

Use this section when a check or verification step has failed.

| Validation Failure | Rule Reference | Immediate Action | Escalation |
|------------------|---------------|-----------------|-----------|
| DHL label: missing address, blank barcode, incorrect sender | R-VAL-01 | Do not send to print; raise with team | Team lead |
| Wrong SKU corrected by code match only — no image confirmed | R-VAL-02 | Reopen Combo Products; confirm image match before SKU update | Team lead if cannot be confirmed |
| Wayfair Motherland — assumed routing error without confirming stock | R-VAL-03 | Confirm stock is out of expected warehouse before selecting alternative | Team lead |
| ASN submitted without all tracking numbers | R-VAL-04 | Escalate immediately — tracking numbers cannot be recovered from Vendor Central | Laksika + Varmen |
| Multi-page carton label saved to single BOX folder | R-VAL-05 | Re-download; split via maxai.me; save one page per BOX folder | Team lead if labels already submitted to Amazon |
| Pre-Completion Checklist item incomplete at session end | R-VAL-06 | Do not close session; complete outstanding item or formally escalate | Team lead |
| Label count does not match order count | R-VAL-06 | Investigate missing or duplicate labels before marking session done | Team lead |
| UK/DE packed status not updated | R-VAL-06 | Update OMS shipped status before closing session | — |
| Packlist not saved to Dropbox | R-VAL-06 | Save to correct date folder before closing session | — |

---

## 8. Escalation Guidance

### Escalate to team lead when:
- Booking rule fails system-wide (R-EXC-03)
- Stock unavailable at all warehouses (R-EXC-01)
- Warehouse unavailable (R-EXC-05)
- Wrong SKU cannot be identified after image check (R-EXC-06)
- DHL label has blank barcode or missing field (R-VAL-01)
- ASN submitted without all tracking numbers (R-VAL-04)
- Any Pre-Completion Checklist item cannot be completed (R-VAL-06)
- Labels printed before service steps complete and labels reached warehouse (R-BK-09)

### Escalate to Laksika when:
- GLS account or process needed (not documented)
- Royal Mail enquiry full steps needed (source partially read)
- Amazon FBA booking steps beyond the 4 confirmed checks (source partially read)
- DE DHL eBay Tracking full steps needed (source partially read)
- DPD enquiry process needed (not documented)
- Any [VERIFY REQUIRED] item is blocking operational progress
- ASN submitted before tracking numbers recorded — recovery options unclear

### Escalate to Varmen when:
- Vendor booking ownership is the subject of the issue (see context/vendor-booking-boundary.md)
- A cross-AIOS decision is needed
- A confirmed gap requires a formal Decision Log entry before work can continue
- ASN tracking number loss event — potential Amazon relationship impact

### Do not escalate when:
- The issue matches a confirmed exception rule and the prescribed action resolves it
- The routing in Sections 4–7 leads to a clear, documented resolution path
- The issue is a standard operational exception covered by R-EXC-01 to R-EXC-10

---

## 9. Known Limitations

| Limitation | Impact |
|-----------|--------|
| GLS procedure not documented | Cannot route GLS-specific issues beyond confirming trigger rule R-SVC-02 |
| Royal Mail enquiry process partially confirmed | Can confirm Teams channel and portal URL; cannot route full step sequence |
| Amazon FBA booking partially confirmed | Can route 4 confirmed checks; all others are [VERIFY REQUIRED] |
| DE DHL eBay Tracking partially confirmed | Cannot route this workflow's issues — source partial read |
| DPD enquiry process not documented | DPD parcels appear in Teams channel but have no documented enquiry path |
| Team structure not documented | Cannot name specific individuals in routing — role titles only (team lead, Postage team member, CST, warehouse team) |
| Courier SLA and contact details not documented | Cannot route issues that require contacting a courier account manager |
| Vendor booking ownership unresolved | Vendor booking issue routing is provisional — see context/vendor-booking-boundary.md |
| This skill routes issues only | It does not resolve them — follow the referenced procedure or rule for resolution |

---

## 10. Quick Navigation Guide

| I need to route... | Go To |
|-------------------|-------|
| A booking that is not running or assigning a service | Section 4 Category 1 |
| A German Vendor PO or ASN issue | Section 4 Category 2 |
| A German return label issue | Section 4 Category 3 |
| A parcel that is not moving or not delivered | Section 4 Category 4 |
| A courier-specific problem (DHL, Royal Mail, EVRi, GLS) | Section 5 Courier Issue Routing |
| A marketplace or platform error | Section 4 Category 6 |
| A label or count validation failure | Section 7 Validation Failure Routing |
| A Wrong SKU or Motherland warehouse issue | Section 4 Category 8 |
| A duplicate order or warehouse down | Section 4 Category 9 |
| Any booking action that failed or was done in wrong sequence | Section 6 Booking Issue Routing |
| Who to contact for this issue | Section 8 Escalation Guidance |
| Full procedure steps for a workflow | context/bgct-procedures.md |
| Full rule text for a cited rule ID | context/janarthan-rules.md |
| Courier account details and tracking formats | context/courier-vendor-info.md |
| Vendor booking ownership question | context/vendor-booking-boundary.md |
| Booking readiness checks before acting | skills/booking-check.md |
| Which procedure to read next | skills/procedure-lookup.md |

---

## Validation Summary

### Issue Category Count: 9
1. Booking Issues — 2. Vendor Booking Issues — 3. Return Label Issues —
4. Tracking Issues — 5. Courier Issues — 6. Marketplace Issues —
7. Validation Failures — 8. Missing Information Issues — 9. Workflow Exception Issues

### Routing Entries Created

| Section | Entries |
|---------|---------|
| Category 1 — Booking Issues (§4) | 10 routing rows |
| Category 2 — Vendor Booking Issues (§4) | 7 routing rows |
| Category 3 — Return Label Issues (§4) | 7 routing rows |
| Category 4 — Tracking Issues (§4) | 7 routing rows |
| Category 5 — Courier Issues (§4) | 8 routing rows |
| Category 6 — Marketplace Issues (§4) | 7 routing rows |
| Courier Issue Routing (§5) | 9 routing rows |
| Booking Issue Routing (§6) | 10 routing rows |
| Validation Failure Routing (§7) | 9 routing rows |
| **Total** | **74 routing entries** |

### Source Files Used

| Source | Usage |
|--------|-------|
| context/janarthan-rules.md | Rule IDs cited in all routing tables — R-ROUTE, R-WH, R-CARRIER, R-SVC, R-VAL, R-EXC, R-BK |
| context/bgct-procedures.md | Procedure section references across all workflow routing |
| context/courier-vendor-info.md | Courier and platform routing in §5 |
| context/vendor-booking-boundary.md | Vendor booking ownership note in §4 Category 2 and §8 |
| CLAUDE.md | Exception handling; escalation path; governance; Decision Log references |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- All 9 required issue categories are present with symptoms, affected workflow,
  relevant files, and escalation path
- 74 routing entries span booking, courier, marketplace, validation, and exception issues
- No procedure steps are copied — all execution guidance routes to bgct-procedures.md
- No rule text is copied — all rules are referenced by ID only
- [VERIFY REQUIRED] items are correctly flagged for GLS, Royal Mail, FBA, DE DHL eBay,
  and DPD — no invented routing for undocumented processes
- Vendor booking ownership is flagged as provisional throughout without inventing a decision
- A future LLM can consistently determine: what type of issue occurred, where to
  investigate, which workflow applies, and when escalation is required

**Pending Varmen review before operational use.**
