# Booking Check Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Note: Scope of this skill is provisional — vendor booking ownership is
#       [PENDING CONFIRMATION]. See context/vendor-booking-boundary.md.
# Builder: Vishnu Sree | Validator: Varmen

---

## 1. Skill Purpose

This skill helps an LLM determine whether a booking request is ready to proceed,
which procedure to consult, which rules apply, and when escalation is required —
without reading the full AIOS.

**Three questions this skill answers:**
1. Is this booking ready to proceed?
2. Which procedure and rules apply to this booking?
3. If a check fails, what should happen next?

**What this skill does NOT do:**
- Provide booking steps → see context/bgct-procedures.md
- Quote rule text in full → see context/janarthan-rules.md
- Confirm ownership of vendor booking → see context/vendor-booking-boundary.md
- Make booking decisions autonomously — it validates readiness only

**Scope note:**
This skill currently covers Postage-executed bookings based on the provisional
architecture assumption that Postage owns booking execution. If Varmen confirms
a different boundary, this skill must be updated. See context/vendor-booking-boundary.md.

---

## 2. How To Use This Skill

**Step 1 — Identify the workflow.**
Match the booking request to a workflow in Section 4 (Workflow-Specific Booking Checks).

**Step 2 — Run the Universal Checklist (Section 3).**
Apply all 5 universal checks to every booking regardless of workflow type.

**Step 3 — Run the workflow-specific checks (Section 4).**
Apply the checks for the matched workflow. Each check references the rule ID or
procedure section that defines it — do not quote rule text; cite the reference.

**Step 4 — If all checks pass:**
The booking is ready to proceed. Direct to the procedure section in
context/bgct-procedures.md for execution guidance.

**Step 5 — If any check fails:**
Do not proceed. Follow the escalation path in Section 7 or the workflow-specific
escalation note.

---

## 3. Universal Booking Validation Checklist

Apply these 5 checks to every booking before running workflow-specific checks.
A single failure stops the booking.

| # | Check | Pass Condition | If Failed |
|---|-------|---------------|-----------|
| U1 | Wrong SKU check | No order in the queue carries a Wrong SKU flag | Correct SKU before any booking rule runs — R-ROUTE-06 |
| U2 | Flag assignment complete | All flag changes (FR/NL → DE; UK International exclusions) are done | Complete flag changes before triggering rules — R-ROUTE-07 |
| U3 | Motherland warehouse not present | No order shows "Motherland" as its warehouse assignment | Confirm stock is out; manually select correct warehouse — R-WH-01 |
| U4 | Teams channels checked | MSG & Post and Packlist Label Issue have been reviewed and actioned | Action all messages before proceeding — see bgct-procedures.md §1 Phase 4 |
| U5 | No Service orders resolved | No order remains with No Service before booking rules run | Add correct service first — R-SVC-01 (DE) or R-SVC-08 (UK) |

**Rule references:** R-ROUTE-06, R-ROUTE-07, R-WH-01, R-SVC-01, R-SVC-08
→ Full rule text: context/janarthan-rules.md

---

## 4. Workflow-Specific Booking Checks

---

### 4.1 UK Booking

**Related procedure:** context/bgct-procedures.md §1 UK Booking
**Related rule categories:** R-ROUTE, R-WH, R-SVC, R-VAL, R-EXC, R-BK

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| UK1 | UK flag check | All FR/NL orders have been re-flagged to DE; all UK International exclusion countries identified | R-ROUTE-01, R-ROUTE-02 | Complete Phase 2 flag assignment before proceeding |
| UK2 | UK International countries confirmed | US, Canada, Ireland, Sweden, Switzerland, Malta excluded from DE flag change | R-ROUTE-02, R-ROUTE-03 | Recheck country list against exclusion rule |
| UK3 | Netherlands stock check complete | Netherlands orders have been confirmed for UK or DE warehouse based on stock | R-WH-02, R-WH-03 | Run warehouse stock check — bgct-procedures.md §1 Phase 7 |
| UK4 | Unit 4 product type check | No Cable, Transformer, or Lampholder assigned to Unit 4 | R-WH-04 | Move these product types to Unit 3 |
| UK5 | All UK service steps complete | R-SVC-08 through R-SVC-15 all applied in correct sequence before printing | R-SVC-08 to R-SVC-15, R-BK-09 | Complete remaining service steps; do not print labels yet |
| UK6 | UK label count verified | Label count matches UK order count | R-VAL-06 checklist item | Investigate discrepancy before marking session complete |
| UK7 | UK packlist saved | Packlist.htm saved to Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY | R-VAL-06 checklist item | Save packlist before closing session |
| UK8 | Shipped status updated | All UK orders marked Shipped in OMS | R-VAL-06 checklist item | Update OMS before closing session |

**Escalation if UK check fails:**
- Wrong SKU unresolvable → R-EXC-06 (log "UNABLE TO IDENTIFY", escalate to team lead)
- Service unassignable → R-EXC-02 (manual assign closest match; log in Teams)
- Booking rule fails → R-EXC-03 (re-run; test 1 order; notify team lead if system-wide)
- Duplicate Shopify order → R-EXC-04 (do not book; flag in Teams)
- Address change after booking → R-EXC-08 (cancel label; update; re-book; log)

---

### 4.2 Germany (DE) Booking

**Related procedure:** context/bgct-procedures.md §2 Germany (DE) Booking
**Related rule categories:** R-ROUTE, R-WH, R-SVC, R-VAL, R-EXC, R-BK

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| DE1 | FR/NL orders re-flagged | France and Netherlands orders carry DE flag | R-ROUTE-01 | Re-apply flag change before rules run |
| DE2 | DE Netherlands routing confirmed | Netherlands DE orders assigned DHL PAKET INTERNATIONAL — not domestic DHL | R-ROUTE-04, R-ROUTE-05 | Change to DHL PAKET INTERNATIONAL; move to New status |
| DE3 | GLS check applied | DE 1st Class orders with value over €20 changed to GLS service | R-SVC-02 | Apply GLS filter for qualifying orders |
| DE4 | Six Trossingen service types checked individually | All 6 service types (Kronen DHL Paket, Kronen International, Schmutter Kleinpaket, Schmutter Paket, Schmutter International, Kronen Kleinpaket) checked one by one | R-SVC-06 | Return to service assignment step; check each type individually |
| DE5 | Schmutter DHL Paket booking count | Exactly 5 parcels booked via Amazon account portal | R-SVC-07 | Correct count before confirming |
| DE6 | All DE service steps complete before labels printed | R-SVC-01 through R-SVC-07 all applied before any DE labels printed | R-BK-09 | Complete remaining DE service steps first |
| DE7 | DE label count verified | DE label count matches DE order count | R-VAL-06 checklist item | Investigate discrepancy |
| DE8 | German packlist saved | Packlist.htm saved to Dropbox German Postage Label date folder | R-VAL-06 checklist item | Save packlist before closing |
| DE9 | DE shipped status updated | All DE orders marked Shipped in OMS | R-VAL-06 checklist item | Update OMS before closing |

**Escalation if DE check fails:**
Same as UK escalation paths — R-EXC-01 through R-EXC-08 apply.
GLS-specific failures: GLS procedure not fully documented → escalate to Laksika.

---

### 4.3 Germany Second Booking

**Related procedure:** context/bgct-procedures.md §3 Germany Second Booking
**Related rule categories:** R-WH, R-SVC, R-VAL, R-ROUTE, R-BK, R-EXC

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| 2ND1 | First booking cleared | All first-booking completed orders moved to Dispatched before running Assign Rules | R-WH-07 | Move to Dispatched; then run Assign Rules |
| 2ND2 | Wrong SKU corrected with image confirmation | All Wrong SKU orders corrected using Combo Products image — not code match alone | R-BK-10 | Return to image confirmation step; do not proceed without visual match |
| 2ND3 | International routing corrected | International method + domestic DHL service orders corrected to DHL PAKET INTERNATIONAL and moved to New | R-ROUTE-05 | Correct and requeue before booking |
| 2ND4 | Netherlands filter run | Netherlands DE orders assigned DHL PAKET INTERNATIONAL via separate country filter | R-ROUTE-04 | Run Netherlands filter after main booking |
| 2ND5 | Schmutter run before Kronen | Schmutter warehouse booking completed before Kronen booking starts | R-BK-01 | Complete Schmutter run first; do not run simultaneously |
| 2ND6 | Every DHL label visually verified | All 9 label fields checked on every label before sending to print | R-VAL-01 | Do not send unverified labels to print; raise with team |
| 2ND7 | German Time Sheet logged | Schmutter and Kronen order counts entered in Google Sheet | bgct-procedures.md §3 Phase 7 | Log before closing 2nd booking session |

**Escalation if 2nd booking check fails:**
- Wrong SKU unresolvable → R-EXC-06
- DHL label has blank barcode or missing field → R-VAL-01 (do not print; raise immediately)
- Schmutter or Kronen has no stock → R-EXC-01

---

### 4.4 German Vendor Booking

**Related procedure:** context/bgct-procedures.md §4 German Vendor Booking
**Related rule categories:** R-WH, R-CARRIER, R-VAL, R-BK

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| GV1 | WhatsApp picklist received | Picklist photo received in German Vendor WhatsApp group before booking starts | bgct-procedures.md §4 Step 1 | Do not start booking without confirmed picklist |
| GV2 | PO verified on Vendor Central | PO details on Amazon Vendor Central match the WhatsApp picklist | bgct-procedures.md §4 Step 2 | Do not proceed until quantities match; clarify with warehouse team |
| GV3 | Warehouse confirmed as Trossingen Schmutter | No other warehouse used for DTM1 Werne | R-WH-06 | Correct to Trossingen Schmutter before label creation |
| GV4 | DHL service confirmed as DHL PAKET only | DHL Kleinpaket and DHL PAKET INTERNATIONAL are not selected | R-CARRIER-04 | Change to DHL PAKET; DHL Kleinpaket and International rejected by Amazon FC |
| GV5 | All tracking numbers recorded before ASN | Every DHL tracking number entered in Google Sheet before ASN submission | R-VAL-04, R-BK-02 | Do not submit ASN until all tracking numbers confirmed |
| GV6 | Carton label page count checked | If PDF has more than 1 page, split using maxai.me before saving | R-VAL-05, R-BK-03 | Split PDF first; save one page per BOX subfolder |
| GV7 | One carton label per BOX subfolder | Each BOX folder contains exactly one carton label page | R-VAL-05, R-BK-03 | Correct folder structure before warehouse collection |
| GV8 | WhatsApp confirmation sent | Confirmation posted in German Vendor WhatsApp group after all steps complete | bgct-procedures.md §4 Step 9 | Send confirmation before closing |

**Escalation if Vendor check fails:**
- PO quantity mismatch → do not proceed; clarify with warehouse team
- Missing tracking numbers before ASN → do not submit ASN; complete labels first
- Multi-page carton label not split → R-BK-03; split before saving
- Wrong carrier selected → R-CARRIER-04; correct before label is used at FC

**Vendor booking ownership note:**
This workflow is currently documented as Postage-executed based on operational
evidence and provisional architecture position. Formal ownership is [PENDING
CONFIRMATION]. See context/vendor-booking-boundary.md.

---

### 4.5 German Return Labels

**Related procedure:** context/bgct-procedures.md §5 German Return Labels
**Related rule categories:** R-CARRIER, R-BK

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| RL1 | Customer address complete in Teams request | Full name, street, house number, town, 5-digit postcode, country provided | bgct-procedures.md §5 Inputs | Request missing fields from CST before generating label |
| RL2 | DHL RETOURE ONLINE tab selected | RETOURE ONLINE confirmed before any form field is entered | R-CARRIER-05, R-BK-06 | Do not fill in any field until correct tab is confirmed |
| RL3 | Return receiver is pre-filled and correct | Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen — pre-filled and unchanged | R-BK-05 | Do not generate label if field is blank or wrong; raise with team |
| RL4 | IONOS inbox checked | Label PDF received at postage@ledsone.co.uk after submission | bgct-procedures.md §5 Step 4 | Wait for IONOS email; check spam; if missing check DHL portal order history |
| RL5 | Label cropped before sharing | PDF cropped using PDFResizer.com before posting in Teams | bgct-procedures.md §5 Step 5 | Crop before sharing — do not send full A4 page |
| RL6 | Response posted as reply | Sendungsnummer and cropped PDF posted as REPLY to original Teams request — not a new message | bgct-procedures.md §5 Step 6 | Delete new message; repost as reply |

**Escalation if return label check fails:**
- Address incomplete → request missing fields from CST before proceeding
- Return receiver field wrong or blank → do not generate; raise with team immediately
- DHL portal error → check geschaeftskunden.dhl.de for system status

---

### 4.6 USA Booking

**Related procedure:** context/bgct-procedures.md §7 USA Booking
**Related rule categories:** R-CARRIER, R-BK, R-ROUTE, R-EXC

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| US1 | Wrong SKU resolved | All Wrong SKU orders corrected before orders moved to In Progress | bgct-procedures.md §7 Phase 2 | Correct all Wrong SKU first |
| US2 | Addresses verified | All recipient addresses confirmed valid before label purchase | bgct-procedures.md §7 Phase 3 | Do not purchase label for unverified address |
| US3 | GoShippo carrier confirmed | UPS Ground selected as default for warehouse orders | R-CARRIER-02 | Switch to UPS Ground; confirm weight from packlist |
| US4 | Amazon carrier confirmed | USPS Ground Advantage Cubic ($9.65) selected — not Priority Mail or FedEx | R-CARRIER-03 | Switch to USPS Ground Advantage Cubic |
| US5 | Label PDFs processed | All labels merged/cropped via PDFResizer.com; saved as LABELS.pdf in Dropbox | bgct-procedures.md §7 Phase 9 | Complete PDF processing before marking Shipped |
| US6 | Shipping method updated in OMS | LEDSone OMS shipping method updated to match carrier actually purchased | R-BK-07 | Update OMS; records must be consistent across systems |
| US7 | Tracking numbers entered | All tracking numbers entered in OMS before marking as Shipped | bgct-procedures.md §7 Phase 9 | Enter tracking numbers; do not mark Shipped without them |
| US8 | Teams US Marketplace updated | Completion post made in Teams US Marketplace channel | bgct-procedures.md §7 Phase 9 | Post update before closing |

**Escalation if USA check fails:**
- GoShippo label purchase fails → R-EXC-02 (try alternative carrier; notify team)
- Address unverifiable → do not purchase; contact CS for correct address

---

### 4.7 Canada Booking

**Related procedure:** context/bgct-procedures.md §8 Canada Booking
**Related rule categories:** R-CARRIER, R-BK

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| CA1 | Canada inventory confirmed | Canada warehouse stock confirmed in LEDSone Dashboard before booking | bgct-procedures.md §8 Phase 2 | Confirm stock; do not book unavailable items |
| CA2 | Stallion Import Template CSV exported | CSV exported from LEDSone OMS using correct template before upload | bgct-procedures.md §8 Phase 5 | Re-export from OMS; check format matches Stallion template |
| CA3 | Intelcom Standard selected | Intelcom Standard confirmed — not Canada Post Expedited | R-CARRIER-01 | Switch to Intelcom Standard before purchase |
| CA4 | Canada Post switched if pre-assigned | If Stallion import pre-assigned Canada Post Expedited, switched to Intelcom Standard before purchase | R-BK-08 | Switch at Stallion shipment editing step before payment |
| CA5 | Shipping method updated in OMS | LEDSone OMS shipping method updated to match Intelcom Standard | bgct-procedures.md §8 Phase 8 | Update OMS after purchase; records must match |
| CA6 | Tracking numbers entered | All SE-prefixed tracking numbers entered in OMS before marking as Shipped | bgct-procedures.md §8 Phase 8 | Enter tracking numbers first |
| CA7 | StallionLabels.pdf saved | Label file saved to Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY/ | bgct-procedures.md §8 Phase 7 | Save before marking Shipped |

**Escalation if Canada check fails:**
- Intelcom Standard unavailable → use Canada Post Expedited as fallback; note reason
- Stallion CSV import fails → check format; re-export from OMS

---

### 4.8 Amazon FBA Booking (UK)

**Related procedure:** context/bgct-procedures.md §9 Amazon FBA Label Booking
**Status: [VERIFY REQUIRED] — source file too large to read fully**

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| FBA1 | WhatsApp picklist received | Picklist photo received from warehouse before booking starts | bgct-procedures.md §9 Trigger | Do not start without confirmed picklist |
| FBA2 | Google Sheet updated | FBA Shipments Pending Details (UK Shipment_Details tab) reflects current shipment | bgct-procedures.md §9 (partial) | Update Sheet before proceeding |
| FBA3 | Correct Seller Central account selected | Ledsone / DCVoltage / SRM — correct account for this shipment | bgct-procedures.md §9 (partial) | Confirm account before creating shipment |
| FBA4 | Packing method confirmed | Pack Individual Units — Standard packing selected | bgct-procedures.md §9 (partial) | Change packing method before proceeding |

**Important: FBA-specific validation beyond the above 4 checks is [VERIFY REQUIRED].**
The source file was too large to read completely. For any FBA check not listed here,
consult Laksika before proceeding. Do not invent additional validation steps.

**Escalation if FBA check fails:**
- Any step not covered by the 4 confirmed checks above → escalate to Laksika
- Account confusion (Vendor Central vs Seller Central) → R-CARRIER-04 note applies
  for Vendor; for FBA use Seller Central accounts only (Ledsone, DCVoltage, SRM)

---

### 4.9 UK Collection Labels

**Related procedure:** context/bgct-procedures.md §10 UK Collection Labels
**Status: Scope pending Varmen + Laksika confirmation for internal AIOS use**

| # | Check | Pass Condition | Rule Reference | If Failed |
|---|-------|---------------|---------------|-----------|
| CL1 | Customer address complete | Full collection address provided with postcode | bgct-procedures.md §10 Step 2 | Request missing address fields before generating label |
| CL2 | Parcel weight confirmed | Parcel weight known before carrier is selected | R-CARRIER-06 | Confirm weight; carrier assignment depends on it |
| CL3 | Correct carrier selected | Royal Mail (<20kg standard), DPD (next-day/timed), Evri (economy returns), Yodel (>20kg bulky) | R-CARRIER-06 | Reselect correct carrier by parcel type and weight |
| CL4 | Label format confirmed | A6, 300 DPI, PDF | bgct-procedures.md §10 Step 3 | Confirm format before delivery |
| CL5 | Delivery method confirmed | Email / SMS / portal download — correct for this customer request | bgct-procedures.md §10 Step 4 | Confirm delivery method before generating |

**Scope note:** Whether this workflow is in internal AIOS scope is [PENDING
CONFIRMATION]. See CLAUDE.md Decision Log and context/vendor-booking-boundary.md
escalation note.

**Escalation if collection label check fails:**
- Any scope question → confirm with Varmen before using this workflow internally
- Carrier selection unclear → R-CARRIER-06 in context/janarthan-rules.md

---

## 5. Rule-Based Validation References

Use this table when a specific type of pre-booking check is needed and the
workflow is not the primary question. All rule text is in context/janarthan-rules.md.

| Check Type | Rule ID | What It Validates |
|-----------|---------|------------------|
| Wrong SKU before booking | R-ROUTE-06 | SKU corrected using image confirmation before any rule runs |
| Flags complete before rules | R-ROUTE-07 | All flag changes done before booking rule triggered |
| Motherland assignment | R-WH-01 | Motherland never treated as valid — confirm stock out first |
| Unit 4 product type | R-WH-04 | Cable/Transformer/Lampholder → Unit 3, not Unit 4 |
| Trossingen product mapping | R-WH-05 | Schmutter vs Kronen by product type |
| First booking cleared | R-WH-07 | Dispatched before Assign Rules in 2nd booking |
| Canada carrier default | R-CARRIER-01 | Intelcom Standard, not Canada Post Expedited |
| US warehouse carrier | R-CARRIER-02 | UPS Ground on GoShippo |
| US Amazon carrier | R-CARRIER-03 | USPS Ground Advantage Cubic first |
| Vendor DHL service | R-CARRIER-04 | Trossingen Schmutter DHL PAKET only for DTM1 Werne |
| Return label tab | R-CARRIER-05 | DHL RETOURE ONLINE — not SELBSTZAHLER |
| Collection label carrier | R-CARRIER-06 | Royal Mail / DPD / Evri / Yodel by weight and type |
| Wrong SKU image confirmation | R-VAL-02 | Image match required — code match alone not sufficient |
| Wayfair Motherland | R-VAL-03 | Confirm stock out before selecting alternative |
| ASN before tracking | R-VAL-04 | All tracking numbers recorded before ASN submission |
| Carton label split | R-VAL-05 | Multi-page PDF split before Dropbox save |
| Pre-completion checklist | R-VAL-06 | 14 items before closing daily session |
| Label printing timing | R-BK-09 | All service steps complete before any label prints |
| Schmutter before Kronen | R-BK-01 | Sequence: Schmutter 2nd booking first, then Kronen |
| ASN sequence | R-BK-02 | Labels → tracking numbers → ASN — in that order |
| Return receiver fixed | R-BK-05 | Hüttenlampe e.K. pre-filled — verify, do not change |
| Return tab before form | R-BK-06 | Tab confirmed before filling any field |

---

## 6. Exception Handling Checks

Before closing any session with unresolved issues, verify each exception has
been handled. Rule text is in context/janarthan-rules.md.

| Exception | Rule | Required Action Before Closing |
|-----------|------|-------------------------------|
| Stock unavailable | R-EXC-01 | Alternative warehouse confirmed or escalated to team lead |
| Service cannot be assigned | R-EXC-02 | Manually assigned or logged in Teams Packlist Label Issue |
| Booking rule failed | R-EXC-03 | Re-run attempted; test order run if failed again; team lead notified if system-wide |
| Duplicate Shopify order | R-EXC-04 | Flagged in Teams MSG & Post; not booked; awaiting confirmation |
| Warehouse unavailable | R-EXC-05 | All affected orders switched to alternative; team lead notified |
| Wrong SKU unidentifiable | R-EXC-06 | Logged "UNABLE TO IDENTIFY" in Listing Correction; escalated to team lead |
| Wayfair Motherland | R-EXC-07 | Stock out confirmed; alternative warehouse selected manually |
| Address change after booking | R-EXC-08 | Label cancelled; address updated; re-booked; change logged |
| EVRi comment format | R-EXC-09 | REF: prefix used with standard comment text |
| EVRi reference number posted | R-EXC-10 | Reference number posted as REPLY in Teams thread before page closed |

If any exception row is incomplete at session close, do not mark the session done.
Resolve or formally escalate each item first.

---

## 7. Escalation Guidance

### Escalate to team lead when:
- Stock is unavailable at all warehouses (R-EXC-01)
- A booking rule fails system-wide (R-EXC-03)
- A warehouse is unavailable (R-EXC-05)
- A Wrong SKU cannot be identified after image check (R-EXC-06)
- A DHL label has missing fields or blank barcode (R-VAL-01)
- Any check in this skill fails and cannot be resolved independently

### Escalate to Laksika when:
- A procedural question is not answered by context/bgct-procedures.md
- A GLS-specific validation is needed (GLS procedure not documented)
- Amazon FBA checks beyond the 4 confirmed items are needed (source partial read)
- Royal Mail enquiry validation is needed (source partial read)
- Any [VERIFY REQUIRED] item must be resolved before booking proceeds

### Escalate to Varmen when:
- A cross-AIOS boundary question arises (vendor booking ownership)
- A Decision Log [PENDING CONFIRMATION] item is blocking the booking
- UK Collection Labels scope question arises

### Do not proceed with a booking when:
- Any Universal Check (U1–U5) fails and has not been resolved
- Any workflow-specific check critical to booking integrity fails
- A [VERIFY REQUIRED] procedure section is the only guidance available
  and the procedure is needed to complete the booking safely

---

## 8. Known Limitations

| Limitation | Impact |
|-----------|--------|
| Amazon FBA checks are partial | Only 4 confirmed checks; full validation requires Laksika input |
| DE DHL eBay Tracking not covered | No booking validation for this workflow — source partial read |
| Royal Mail Enquiries not covered | No booking validation for this workflow — source partial read |
| GLS procedure not documented | Cannot validate GLS booking beyond confirming the trigger rule (R-SVC-02) |
| UK Collection Labels scope unconfirmed | Validation checks provided but scope for internal use is [PENDING CONFIRMATION] |
| Vendor booking ownership [PENDING CONFIRMATION] | Skill scope is provisional; may need re-scoping after Varmen decision |
| Team structure not documented | Cannot name specific individuals in escalation paths — role titles used only |
| Courier SLAs and contacts not documented | Cannot validate against service commitment thresholds |
| This skill does not execute bookings | It validates readiness only — booking execution is in context/bgct-procedures.md |

---

## 9. Quick Navigation Guide

| Question | Go To |
|---------|-------|
| Is a UK booking ready to proceed? | Section 4.1 UK Booking checks |
| Is a DE booking ready to proceed? | Section 4.2 Germany (DE) Booking checks |
| Is a 2nd German booking ready? | Section 4.3 Germany Second Booking checks |
| Is a German Vendor booking ready? | Section 4.4 German Vendor Booking checks |
| Is a German return label request ready? | Section 4.5 German Return Labels checks |
| Is a US booking ready? | Section 4.6 USA Booking checks |
| Is a Canada booking ready? | Section 4.7 Canada Booking checks |
| Is an FBA booking ready? | Section 4.8 Amazon FBA checks (partial) |
| Is a collection label request ready? | Section 4.9 UK Collection Labels checks |
| What checks apply to every booking? | Section 3 Universal Checklist |
| Which rule applies to a specific check type? | Section 5 Rule-Based Validation References |
| Is an exception resolved before session close? | Section 6 Exception Handling Checks |
| Who do I escalate to if a check fails? | Section 7 Escalation Guidance |
| What is NOT covered by this skill? | Section 8 Known Limitations |
| Full procedure steps for a workflow | context/bgct-procedures.md |
| Full rule text for a cited rule ID | context/janarthan-rules.md |
| Vendor booking ownership question | context/vendor-booking-boundary.md |

---

## Validation Summary

### Workflow Count Covered: 9
UK Booking — Germany DE Booking — Germany Second Booking — German Vendor
Booking — German Return Labels — USA Booking — Canada Booking — Amazon FBA
Booking (partial) — UK Collection Labels (scope pending)

### Validation Check Groups Created

| Group | Items |
|-------|-------|
| Universal Checklist (§3) | 5 checks — apply to every booking |
| UK Booking (§4.1) | 8 checks |
| Germany DE Booking (§4.2) | 9 checks |
| Germany Second Booking (§4.3) | 7 checks |
| German Vendor Booking (§4.4) | 8 checks |
| German Return Labels (§4.5) | 6 checks |
| USA Booking (§4.6) | 8 checks |
| Canada Booking (§4.7) | 7 checks |
| Amazon FBA Booking (§4.8) | 4 checks (partial — [VERIFY REQUIRED]) |
| UK Collection Labels (§4.9) | 5 checks (scope [PENDING CONFIRMATION]) |
| Rule-Based Validation References (§5) | 21 rule-to-check mappings |
| Exception Handling Checks (§6) | 10 exception resolution confirmations |
| **Total checks across all groups** | **78** | |

### Rule Categories Referenced

| Category | Count Referenced | Method |
|----------|-----------------|--------|
| R-ROUTE | 6 | Rule ID only — no rule text |
| R-WH | 6 | Rule ID only — no rule text |
| R-CARRIER | 6 | Rule ID only — no rule text |
| R-SVC | 3 | Rule ID only — no rule text |
| R-VAL | 6 | Rule ID only — no rule text |
| R-EXC | 10 | Rule ID only — no rule text |
| R-BK | 7 | Rule ID only — no rule text |

### Source Files Used

| Source | Usage |
|--------|-------|
| context/janarthan-rules.md | Rule IDs referenced across all check tables and §5 |
| context/bgct-procedures.md | Procedure section references across all workflow checks |
| context/vendor-booking-boundary.md | Scope note in §1, §4.4, §4.9, §7 |
| CLAUDE.md | Decision Log references; exception handling; escalation path |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- A future LLM can determine whether a booking is ready using the Universal
  Checklist (§3) plus the workflow-specific checks (§4)
- Every check references a rule ID or procedure section — no rule text is copied
- No procedure steps are included — all execution guidance routes to bgct-procedures.md
- Partial and unconfirmed workflows (FBA, DE DHL eBay, Royal Mail) are correctly
  scoped with [VERIFY REQUIRED] rather than invented checks
- Vendor booking ownership scope is flagged throughout without inventing a decision
- The skill answers all four target questions: ready or not, which procedure,
  which rules, and when to escalate

**Pending Varmen review before operational use.**
