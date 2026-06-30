# BGCT Procedures — Postage AIOS
# LEDSone — Postage Department
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review and approval
# Source: Laksika's workflow documents (Postage workflow folder)
# Builder: Vishnu Sree | Validator: Varmen

---

## What This File Is

This file contains structured summaries of all confirmed Postage operational
workflows. It is NOT a copy of the source SOPs. Each section extracts the
key structured elements (purpose, trigger, systems, inputs, workflow steps,
outputs, validation, evidence, exceptions) from the approved source documents.

Janarthan's rules are NOT repeated here. They live in context/janarthan-rules.md
as a separate, independently searchable rule layer.

Every section cites its source document. Where source documents were incomplete
or not fully readable, the section is marked [VERIFY REQUIRED].

---

## Source Documents Used

| Document | Workflow Covered | Read Status |
|----------|-----------------|-------------|
| Daily Booking Workflow Final.md (v2.0) | UK Booking, DE Booking | Full read |
| German 2nd Booking Process Workflow.docx.md | Germany 2nd Booking | Full read |
| German Vendor Booking Guide.md | German Vendor Booking | Full read |
| German Return Label Workflow Guide.docx.md | German Return Labels | Full read |
| DE DHL eBay Tracking Email Workflow.md | DE DHL eBay Tracking | Partial read |
| USA Booking Workflow Guide.docx.md | USA Booking | Full read |
| CA Booking Workflow Guide.docx.md | Canada Booking | Full read |
| Amazon FBA Label Booking Workflow.md | Amazon FBA Booking | Partial read — file too large |
| UK Collection Label Workflow.docx.md | UK Collection Labels | Full read |
| EVRi courier update.docx.md | EVRi Courier Enquiries | Full read |
| Royal Mail courier update.md | Royal Mail Enquiries | Partial read — file too large |

---

## Procedure Index

1. [UK Booking](#1-uk-booking)
2. [Germany (DE) Booking](#2-germany-de-booking)
3. [Germany Second Booking](#3-germany-second-booking)
4. [German Vendor Booking](#4-german-vendor-booking)
5. [German Return Labels](#5-german-return-labels)
6. [DE DHL eBay Tracking Workflow](#6-de-dhl-ebay-tracking-workflow)
7. [USA Booking](#7-usa-booking)
8. [Canada Booking](#8-canada-booking)
9. [Amazon FBA Label Booking](#9-amazon-fba-label-booking)
10. [UK Collection Labels](#10-uk-collection-labels)
11. [EVRi Courier Enquiries](#11-evri-courier-enquiries)
12. [Royal Mail Enquiries](#12-royal-mail-enquiries)

---

## 1. UK Booking

**Source:** Daily Booking Workflow Final.md (Version 2.0, AIOS Governance Ready, 18/06/2026)

### Purpose
Process all UK domestic orders received from Amazon, eBay, Shopify, Wayfair,
Avasam, OnBuy, and Faire. Generate labels, route to the correct UK warehouse
(Unit 3 or Unit 4), and mark orders as shipped in the LEDSone OMS.

### Trigger
Runs daily at the start of the operational day. Manual trigger — initiated by
the Postage team member opening the LEDSone OMS and beginning the booking
sequence.

### Required Systems
| System | Purpose |
|--------|---------|
| LEDSone OMS | order.vintageinterior.co.uk — all booking, filtering, labelling, status updates |
| Microsoft Teams | MSG & Post channel; Packlist Label Issue channel |
| Dropbox | UK Postage Label/YYYY/Month/DD.MM.YYYY — label and packlist storage |
| LEDSone Dashboard | dashboard.digitweblk.com — Combo Products for Wrong SKU resolution |

### Inputs
- New orders queued in LEDSone OMS across all UK marketplace channels
- Manual platform orders uploaded for Wayfair, Avasam, OnBuy, Faire
- Teams messages in MSG & Post (cancellations, address changes, notes)
- Teams messages in Packlist Label Issue (warehouse changes, rebooking requests)

### High-Level Workflow
10 phases, 38 steps total:

**Phase 1 — Initial Order Processing**
Move yesterday's completed orders to Dispatched. Upload any manual platform
orders (Wayfair, Avasam, OnBuy, Faire) not yet in queue. Confirm new orders
are queued and ready.

**Phase 2 — Flag and Country Assignment**
Change FR (France) and NL (Netherlands) orders to DE flag. Apply UK
International exclusions: US, Canada, Ireland, Sweden, Switzerland, Malta
remain as UK International — all others change flag to DE.

**Phase 3 — Wrong SKU Correction**
Identify all orders with Wrong SKU flag. Use Combo Products page for visual
image confirmation. Correct before moving to booking stage.

**Phase 4 — Teams Group Checks**
Check MSG & Post channel: action cancellations, address changes, alternative
instructions. Check Packlist Label Issue channel: action any warehouse change
or rebooking requests.

**Phase 5 — Booking Rules: UK and Wayfair**
Run booking rules for UK orders and Wayfair-specific rules.

**Phase 6 — Booking Rules: UK and DE Without Replacement**
Run booking rules for UK and DE orders excluding replacement orders.

**Phase 7 — Warehouse Stock Check (Netherlands)**
For Netherlands orders: check DE stock first. If available → route to
Trossingen. If not → change flag to UK and route to Unit 3 or Unit 4.

**Phase 8 — DE Service Assignment**
Assign DE services in this sequence: No Service → GLS (1st class + >€20)
→ DHL → International (by product type) → Trossingen service types (6 types
checked individually). Book 5 Schmutter DHL Paket via Amazon account.
Print DE labels only after all DE service steps are complete.

**Phase 9 — UK Service Assignment**
Assign UK services in this sequence: No Service → Unit 4 Packing/Others →
1st Class Amazon by weight → 2nd Day → International (excl. US, Canada,
Sweden, Switzerland) → Country-specific (US, Canada, Ireland, Sweden,
Switzerland) → Others by flag → Royal Mail waterfall cascade (Large Letter
NEX → Tracked 48 2kg → Tracked 48 5kg). Unit 4 + Cable/Transformer/Lampholder
→ move to Unit 3. Print UK labels only after all UK service steps are complete.

**Phase 10 — Completion**
Print labels. Save Packlist.htm to Dropbox. Update shipped status in OMS.

### Outputs
| Output | Filename | Destination |
|--------|----------|-------------|
| UK label file | Labels PDF | Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY |
| UK packlist | Packlist.htm | Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY |
| OMS status | Shipped | LEDSone OMS — all booked UK orders |

### Validation Checks
14-item Pre-Completion Checklist (R-VAL-06) must be completed before the
session is marked done:
- All UK orders booked (no In Progress without a service)
- No remaining Wrong SKU orders
- No remaining No Service orders
- UK labels printed — count matches UK order count
- UK packlist uploaded to correct Dropbox date folder
- All warehouse assignments verified
- Teams MSG & Post fully checked and actioned
- Teams Packlist Label Issue fully checked and actioned
- UK shipped status updated in OMS

### Evidence Required
- UK label PDF saved to Dropbox
- UK Packlist.htm saved to Dropbox
- Shipped status screenshot confirming all orders updated

### Known Exceptions
| Exception | Action |
|-----------|--------|
| Stock unavailable | Change warehouse assignment; escalate to team lead if no stock anywhere |
| Service cannot be assigned | Check product type and weight; manually assign closest match; log in Teams |
| Booking rule fails | Re-run; test 1 order if fails again; notify team lead if system-wide |
| Duplicate Shopify order | Do not book; flag in MSG & Post Teams group; await confirmation |
| Motherland warehouse | Confirm stock out; manually select correct warehouse; never book to Motherland |
| Address change after booking | Cancel label; update address; re-book; log the change |
| Wrong SKU cannot be identified | Log "UNABLE TO IDENTIFY" in Listing Correction; escalate to team lead |

---

## 2. Germany (DE) Booking

**Source:** Daily Booking Workflow Final.md (Version 2.0, AIOS Governance Ready, 18/06/2026)

### Purpose
Process all DE-flagged orders from the daily booking session. Generate DHL labels
from Trossingen Schmutter and Trossingen Kronen warehouses and mark orders as
shipped. DE booking runs within the same daily workflow as UK booking (Phases 8
and 10 cover DE-specific steps).

### Trigger
Runs within the same daily booking session as UK booking. DE service assignment
(Phase 8) runs before UK service assignment (Phase 9) in the same workflow.

### Required Systems
| System | Purpose |
|--------|---------|
| LEDSone OMS | order.vintageinterior.co.uk — booking, service assignment, label generation |
| Dropbox | German Postage Label/YYYY/Month/DD.MM.YYYY — label and packlist storage |
| Microsoft Teams | MSG & Post; Packlist Label Issue |

### Inputs
- DE-flagged orders in LEDSone OMS (includes FR and NL orders converted to DE
  flag in Phase 2, and UK International orders routed to DE)
- Any outstanding orders from the previous day's queue

### High-Level Workflow
DE-specific steps within the 10-phase daily booking workflow:

**Phase 2** — FR/NL orders flagged to DE; UK International exclusions applied

**Phase 8 — DE Service Assignment (6 sub-steps):**
1. No Service orders → add correct service
2. 1st Class + shipping value over €20 → GLS
3. DHL service orders → assign DHL
4. Product types Bulb / Packing Area / Transformer → International
5. Product types Cable / Lampholder / Lampshade / Lampshade Only / Lampshade
   Instruction → International
6. Trossingen service types checked individually (6 types):
   Kronen DHL Paket / Kronen DHL Paket International /
   Schmutter DHL Kleinpaket / Schmutter DHL Paket /
   Schmutter DHL Paket International / Kronen DHL Kleinpaket
7. Schmutter DHL Paket → book exactly 5 via Amazon account portal

**Phase 10** — DE labels printed; packlist saved to Dropbox; shipped status updated

### Outputs
| Output | Filename | Destination |
|--------|----------|-------------|
| DE label file | Labels PDF | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY |
| DE packlist | Packlist.htm | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY |
| OMS status | Shipped | LEDSone OMS — all booked DE orders |

### Validation Checks
Pre-Completion Checklist items relevant to DE (from R-VAL-06):
- All DE orders booked (no In Progress without a service)
- No remaining No Service orders for DE
- All 6 Trossingen service types individually checked
- DE labels printed — count matches DE order count
- German packlist uploaded to correct Dropbox date folder
- DE shipped status updated in OMS

### Evidence Required
- DE label PDF saved to Dropbox
- DE Packlist.htm saved to Dropbox
- Shipped status screenshot for DE orders

### Known Exceptions
Same exception table as UK Booking above applies. DE-specific additions:
| Exception | Action |
|-----------|--------|
| DE Netherlands order assigned domestic DHL | Change to DHL Paket International (R-ROUTE-04) |
| DE order shows International method but domestic service | Correct to DHL Paket International; move back to New status (R-ROUTE-05) |
| GLS service needed but no GLS account details available | [VERIFY REQUIRED — GLS account and procedure not yet confirmed] |

---

## 3. Germany Second Booking

**Source:** German 2nd Booking Process Workflow.docx.md

### Purpose
Process German orders that were not completed in the main morning booking session.
Runs as a separate afternoon booking through both Trossingen warehouses (Schmutter
and Kronen), generating DHL labels, verifying them, and logging order counts in
the German Time Sheet.

### Trigger
Time-triggered: 1:30 PM SL time (standard) / 2:30 PM SL time (European summer
time change). Runs every operational day. Initiated manually.

### Required Systems
| System | Purpose |
|--------|---------|
| LEDSone OMS | order.vintageinterior.co.uk — booking, Assign Rules, label generation |
| Google Sheets | German Time Sheet — order count logging |
| Dropbox | German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/schmutter and kronen |

### Inputs
- German orders remaining in the OMS queue after the main morning booking run
- Completed 1st booking orders still showing active (need to be moved to Dispatched)

### High-Level Workflow
7 phases:

**Phase 1 — Clear 1st Booking**
Move all first-booking completed orders to Dispatched status before running
any rules on the 2nd booking queue.

**Phase 2 — Wrong SKU / Error Shipments**
Identify and correct Wrong SKU orders using Combo Products page (image
confirmation required — code match alone not sufficient). Resolve Error
Shipment orders.

**Phase 3 — Routing Corrections**
Fix International orders incorrectly assigned domestic DHL → change to DHL
Paket International. Run Netherlands country filter for DE orders with Netherlands
destination. Move corrected orders back to New status.

**Phase 4 — 2nd Booking: Schmutter**
Run Assign Rules on Schmutter warehouse orders. Book Schmutter first.

**Phase 5 — 2nd Booking: Kronen**
Run Assign Rules on Kronen warehouse orders. Book Kronen after Schmutter is
complete. Do not run simultaneously.

**Phase 6 — DHL Label Verification**
Visually verify every DHL label before sending to warehouse. Check all 9 fields:
label type header, Von (From), An (To), Abrechnungsnr., Referenznr., Sendungsnr.
(18-digit), weight, Leitcode barcode, Sendungsnummer barcode. If any field is
missing or blank barcode: DO NOT send to print.

**Phase 7 — Count Logging**
Log final order counts in German Time Sheet (Google Sheets). Record Schmutter
count and Kronen count separately.

### Outputs
| Output | Filename | Destination |
|--------|----------|-------------|
| Schmutter labels | Labels-[N].pdf | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/schmutter |
| Kronen labels | Labels-[N].pdf | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/kronen |
| Packlist | Packlist.htm | Dropbox (both warehouse subfolders) |
| Order count log | German Time Sheet | Google Sheets |

### Validation Checks
- All 6 Trossingen service types checked individually before booking
- Every DHL label verified against 9-field checklist before printing
- Schmutter booking completed before Kronen booking starts
- First-booking completed orders moved to Dispatched before Assign Rules runs
- Order counts logged in German Time Sheet

### Evidence Required
- Schmutter Labels PDF saved to Dropbox (correct 2nd Booking/schmutter subfolder)
- Kronen Labels PDF saved to Dropbox (correct 2nd Booking/kronen subfolder)
- Packlist.htm files saved for both warehouses
- German Time Sheet count entry with today's date

### Known Exceptions
| Exception | Action |
|-----------|--------|
| Wrong SKU cannot be identified | Log "UNABLE TO IDENTIFY"; escalate; do not book |
| DHL label has missing or blank barcode | Do not print; raise with team immediately |
| International order assigned domestic DHL | Correct to DHL Paket International; back to New |
| DE Netherlands order with domestic DHL | Assign DHL Paket International via Netherlands filter |
| Schmutter has no stock | Switch to Kronen if stock available; if neither, escalate |

---

## 4. German Vendor Booking

**Source:** German Vendor Booking Guide.md

### Purpose
Process wholesale Amazon Vendor purchase orders (POs) for the DTM1 Werne
fulfilment centre. Generates DHL labels, submits the Advance Shipping Notice
(ASN) on Amazon Vendor Central, downloads carton labels, and confirms completion
to the warehouse team via WhatsApp.

### Trigger
Initiated when the warehouse team sends a WhatsApp picklist photo in the German
Vendor WhatsApp group. The picklist photo shows box assignments and quantities.
No fixed time — triggered by warehouse team.

### Required Systems
| System | Purpose |
|--------|---------|
| WhatsApp Web | web.whatsapp.com — receive picklist photo; send confirmation |
| Amazon Vendor Central | vendorcentral.amazon.eu (DE – Ledsone UK Limited – DE) — PO verification and ASN submission |
| LEDSone OMS | order.vintageinterior.co.uk — create DHL labels (search postcode 59368) |
| Google Sheets | Amazon Vendor PO Box Details - DE — tracking number log |
| Dropbox | German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/BOX 01, BOX 02 |
| MaxAI.me | maxai.me/pdf-tools/split-pdf/ — split multi-page carton label PDFs |

### Inputs
- WhatsApp picklist photo from warehouse showing box assignments and contents
- Amazon Vendor Central PO details (PO number, destination, quantities)
- Verified PO information from Vendor Central

### High-Level Workflow
9 steps:

1. Receive WhatsApp picklist photo in German Vendor group. Note box count and contents.
2. Log in to Amazon Vendor Central. Verify PO details match the picklist.
3. Update Google Sheet (Amazon Vendor PO Box Details - DE) with PO details.
4. Create DHL labels in LEDSone OMS. Search by postcode 59368.
   Always select: Trossingen Schmutter DHL Paket. Never Kleinpaket, never International.
5. Save DHL label PDFs to Dropbox (Amazon Vendor date folder).
6. Paste all tracking numbers (Sendungsnummern) into Google Sheet.
7. Submit ASN on Amazon Vendor Central. Only submit after ALL labels are created
   and ALL tracking numbers are recorded in the Google Sheet.
8. Download carton label PDF from Vendor Central. Check page count.
   If more than 1 page: split using MaxAI.me before saving.
   Save each page to its own BOX subfolder (BOX 01, BOX 02).
9. Confirm completion in German Vendor WhatsApp group.

### Outputs
| Output | Destination |
|--------|-------------|
| DHL label PDFs | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/ |
| Tracking numbers | Google Sheet (Amazon Vendor PO Box Details - DE) |
| ASN submitted | Amazon Vendor Central |
| Carton labels (split) | Dropbox/Amazon Vendor date folder/BOX 01, BOX 02 |
| WhatsApp confirmation | German Vendor WhatsApp group |

### Validation Checks
- DHL service selection: always Trossingen Schmutter DHL Paket — never Kleinpaket, never International
- All DHL labels created BEFORE ASN submission
- All tracking numbers recorded in Google Sheet BEFORE ASN submission
- Carton label page count checked — multi-page PDFs must be split before saving
- One carton label page per BOX subfolder — no multi-page PDFs in a single BOX folder
- WhatsApp confirmation sent after all steps complete

### Evidence Required
- DHL label PDFs in Dropbox Amazon Vendor folder
- Tracking numbers entered in Google Sheet
- ASN submission confirmation from Vendor Central
- Carton labels saved to individual BOX subfolders
- WhatsApp confirmation message sent

### Known Exceptions
| Exception | Action |
|-----------|--------|
| PO details on Vendor Central do not match picklist | Do not proceed; clarify with warehouse team before creating labels |
| More boxes than PO shows | Confirm with warehouse team; update Google Sheet before submitting ASN |
| Carton label PDF has multiple pages | Must split before saving — never save multi-page PDF to a single BOX folder |
| ASN already submitted but label missing | [VERIFY REQUIRED — procedure for this scenario not confirmed in source document] |
| DHL label generated with wrong service | Cancel and recreate with Trossingen Schmutter DHL Paket |

---

## 5. German Return Labels

**Source:** German Return Label Workflow Guide.docx.md

### Purpose
Generate DHL return labels (Retourenlabels) for German customers who need to
return items. Labels are generated via the DHL Business Portal and shared back
to the requesting CST team member via Microsoft Teams.

### Trigger
Request received in Microsoft Teams, channel: German postage / Replacements.
The CST team member sends the customer's return address details. No fixed time —
triggered by incoming Teams message.

### Required Systems
| System | Purpose |
|--------|---------|
| Microsoft Teams | German postage / Replacements channel — receive request and send label |
| DHL Business Portal | geschaeftskunden.dhl.de — generate Retourenlabel |
| IONOS Email | mailbusiness.ionos.co.uk — receives the label PDF from DHL |
| PDFResizer.com | pdfresizer.com/crop — crop the full A4 label to shipping label portion |

### Inputs
From the Teams message:
- Customer full name
- Street and house number
- Town / city
- 5-digit German postcode
- Country (always Germany)
- Request type (return label / return label return case)

### High-Level Workflow
6 steps:

1. Receive customer return details from Teams (German postage / Replacements channel).
2. Log in to DHL Business Portal (geschaeftskunden.dhl.de).
   Navigate: Parcel & goods → Returns column → Order a return.
3. Select DHL RETOURE ONLINE tab. Do not select SELBSTZAHLER.
   Fill in Sender section with customer details.
   Customer email: postage@ledsone.co.uk (to receive the label PDF).
   Confirm return receiver (pre-filled): Hüttenlampe e.K., Schmutter Str. 16,
   78647 Trossingen — do not change.
   Click Order. Note the Sendungsnummer from the confirmation page.
4. Open IONOS inbox (mailbusiness.ionos.co.uk).
   Find DHL return confirmation email from no-reply@deutschepost.de.
   Click Retourenlabel herunterladen. Enter postcode to confirm. Download PDF.
5. Open pdfresizer.com/crop. Upload Retourenlabel.pdf.
   Use Crop to selection to extract the shipping label portion (top half).
   Download cropped PDF.
6. Return to Teams. Reply to the original request message (not a new message).
   Paste the Sendungsnummer and attach the cropped PDF. Send.

### Outputs
| Output | Destination |
|--------|-------------|
| Cropped Retourenlabel PDF | Sent as Teams reply attachment |
| Sendungsnummer | Pasted as text in Teams reply |

### Validation Checks
- Tab selection confirmed as DHL RETOURE ONLINE before filling any form field
- Return receiver verified as Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen
- Customer email field set to postage@ledsone.co.uk
- Sendungsnummer copied before closing confirmation page
- Teams response posted as REPLY to original message — not a new message

### Evidence Required
- Cropped Retourenlabel PDF shared in Teams
- Sendungsnummer included in the Teams reply
- Reply linked to the original CST request message

### Known Exceptions
| Exception | Action |
|-----------|--------|
| IONOS email does not arrive promptly | Wait a short time; if still missing, check DHL portal order history |
| Customer postcode is 4 digits (non-German address) | [VERIFY REQUIRED — confirm handling of non-standard German postcodes with Laksika] |
| Return receiver field is blank or shows wrong address | Do not proceed; raise with team — field must always show Hüttenlampe e.K. |
| Teams message has incomplete address | Request missing fields from the CST member before generating label |

---

## 6. DE DHL eBay Tracking Workflow

**Source:** DE DHL eBay Tracking Email Workflow.md (partial read — file not fully confirmed)

### Purpose
Export DHL shipping profile data from LEDSone OMS for German eBay orders and
send the tracking information. Covers both Trossingen Kronen and Trossingen
Schmutter DHL profile variants.

### Trigger
Time-triggered: Monday to Friday only. Must run AFTER all German booking for
the day is complete. Approximate time: 5:00 PM SL time.
Must not run during or before the main booking session.

### Required Systems
| System | Purpose |
|--------|---------|
| LEDSone OMS | order.vintageinterior.co.uk — export DHL shipping profile data |

[VERIFY REQUIRED: Additional systems used for this workflow not confirmed —
source file was only partially readable. Confirm complete system list with Laksika.]

### Inputs
- Completed German eBay orders from the day's booking sessions (both 1st and 2nd booking)

[VERIFY REQUIRED: Exact input format and filter criteria not confirmed from partial read.]

### High-Level Workflow

[VERIFY REQUIRED: Full step sequence not confirmed — source file (DE DHL eBay
Tracking Email Workflow.md) was partially read. The following is confirmed
from the opening section only:]

- Run only after ALL German booking is complete for the day
- Covers both Kronen and Schmutter DHL shipping profile variants
- Involves export of DHL shipping data from OMS
- Monday to Friday — does not run on weekends

Full step detail must be confirmed with Laksika before this section can be
populated further.

### Outputs
[VERIFY REQUIRED: Output format, destination, and recipient not confirmed.]

### Validation Checks
- Must not be run before the German 2nd booking session is complete
- Monday to Friday only — not run on weekends or public holidays

[VERIFY REQUIRED: Additional validation steps not confirmed.]

### Evidence Required
[VERIFY REQUIRED: Evidence requirements not confirmed from partial read.]

### Known Exceptions
[VERIFY REQUIRED: Exception handling not confirmed from partial read.]

**Action Required:** Request complete workflow steps from Laksika. See CLAUDE.md
Decision Log — "Complete steps for DE DHL eBay tracking email" marked
[PENDING CONFIRMATION].

---

## 7. USA Booking

**Source:** USA Booking Workflow Guide.docx.md

### Purpose
Process US marketplace orders across three platforms: GoShippo (warehouse orders),
Amazon Seller Central (Amazon marketplace), and eBay Seller Hub (eBay marketplace).
Generate and save shipping labels, update LEDSone, and confirm shipment.

### Trigger
Runs daily. Initiated by the Postage team member filtering for US orders in
LEDSone OMS. No fixed time specified.

### Required Systems
| System | Purpose |
|--------|---------|
| LEDSone OMS | order.vintageinterior.co.uk — filter orders, move to In Progress, update shipping method and tracking |
| GoShippo | apps.goshippo.com/orders — purchase labels for warehouse orders (UPS Ground) |
| Amazon Seller Central | sellercentral.amazon.com — Buy Shipping for Amazon marketplace orders |
| eBay Seller Hub | ebay.com — Buy Shipping for eBay marketplace orders |
| PDFResizer.com | pdfresizer.com — merge and crop label PDFs |
| Dropbox | US Postage/YYYY/Month/DD.MM.YYYY — label and packlist storage |
| Microsoft Teams | US Marketplace channel — booking update posts |

### Inputs
- US orders in LEDSone OMS (Book from US filter applied)
- Order details: recipient address, weight, product type
- Packlist generated from OMS

### High-Level Workflow
9 phases, 25 steps:

**Phase 1 — Filter and Identify**
Apply Book from US filter in LEDSone OMS. Identify all US orders to be processed.

**Phase 2 — Wrong SKU Resolution**
Resolve any Wrong SKU orders before moving to In Progress. Use Combo Products
page for image confirmation.

**Phase 3 — Address Verification**
Verify all recipient addresses are complete and valid before purchasing labels.

**Phase 4 — Move to In Progress**
Move verified orders to In Progress status in OMS.

**Phase 5 — Generate Packlist**
Generate and save Packlist.htm to Dropbox US folder.

**Phase 6 — Purchase Labels (GoShippo — warehouse orders)**
Log in to GoShippo. Select UPS Ground as default carrier.
Standard dimensions: 9x6x6 inches (lampshade); 5x5x5 (cable).
Check weight from OMS packlist before confirming.

**Phase 7 — Purchase Labels (Amazon Seller Central)**
Use Buy Shipping on Amazon Seller Central.
Select USPS Ground Advantage Cubic ($9.65) as first choice.
USPS Ground Advantage (1–70 lb, $10.00) as second option.

**Phase 8 — Purchase Labels (eBay Seller Hub)**
Use Buy Shipping on eBay Seller Hub for EBAY - electricalsone and US1 channel
orders. USPS or FedEx as available.

**Phase 9 — Label Processing and Completion**
Merge/crop label PDFs using PDFResizer.com. Save final LABELS.pdf to Dropbox.
Update shipping method in LEDSone to match carrier actually purchased.
Enter tracking numbers in LEDSone. Mark all US orders as Shipped.
Update inventory. Post completion update in Teams US Marketplace channel.

### Outputs
| Output | Filename | Destination |
|--------|----------|-------------|
| US label file | LABELS.pdf | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY |
| US packlist | Packlist.htm | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY |
| OMS update | Shipped + tracking numbers | LEDSone OMS |
| Team update | Completion post | Teams US Marketplace channel |

### Validation Checks
- Wrong SKU orders resolved before In Progress status
- Carrier in LEDSone must match carrier actually purchased (GoShippo/Amazon/eBay)
- USPS Ground Advantage Cubic selected for Amazon orders (not Priority Mail or FedEx
  unless expedited is specifically required)
- UPS Ground selected for GoShippo warehouse orders
- Tracking numbers entered in OMS before marking as Shipped
- Teams update posted in US Marketplace channel

### Evidence Required
- LABELS.pdf saved to correct Dropbox date folder
- Packlist.htm saved to correct Dropbox date folder
- Shipped status and tracking numbers confirmed in OMS
- Teams post confirming booking completion

### Known Exceptions
| Exception | Action |
|-----------|--------|
| GoShippo label purchase fails | Try alternative carrier (USPS Ground Advantage); if still failing notify team |
| Amazon Buy Shipping unavailable | Note reason; use alternative platform if possible; log in Teams |
| Address incomplete or unverifiable | Do not purchase label; contact CS team for correct address |
| Weight significantly different from packlist | Recheck product weight; do not purchase with incorrect weight |

---

## 8. Canada Booking

**Source:** CA Booking Workflow Guide.docx.md

### Purpose
Process Canada marketplace orders (Amazon, eBay, Shopify) via Stallion Express.
Generate and purchase shipping labels, save to Dropbox, update LEDSone, and mark
orders as shipped.

### Trigger
Runs daily. Initiated by filtering for Canadian orders in LEDSone OMS.
No fixed time specified.

### Required Systems
| System | Purpose |
|--------|---------|
| LEDSone OMS | order.vintageinterior.co.uk — filter, move to In Progress, update status and tracking |
| LEDSone Dashboard | dashboard.digitweblk.com — Canada warehouse inventory check |
| Stallion Express | ship.stallionexpress.ca — purchase Canada postage (account: Cottage Lighting Ltd) |
| Dropbox | Canada Postage/YYYY/Month/DD.MM.YYYY — label storage |
| Dropbox | Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE — packlist storage |

### Inputs
- Canada orders in LEDSone OMS (Book from CA filter applied)
- Canada inventory confirmed from LEDSone Dashboard
- Stallion Import Template CSV exported from LEDSone OMS

### High-Level Workflow
8 phases:

**Phase 1 — Filter Canada Orders**
Apply Book from CA filter in LEDSone OMS. Identify all Canada orders.

**Phase 2 — Verify Addresses and Inventory**
Verify customer addresses are complete. Confirm Canada warehouse inventory
in LEDSone Dashboard.

**Phase 3 — Move to In Progress**
Move verified Canada orders to In Progress status in OMS.

**Phase 4 — Generate Packlist**
Generate Packlist.htm. Save to Dropbox Unit-03 Postage Folder.

**Phase 5 — Export Stallion Template**
Export the Stallion Import Template CSV from LEDSone OMS.

**Phase 6 — Upload to Stallion Express**
Log in to Stallion Express (ship.stallionexpress.ca, Cottage Lighting Ltd).
Upload the Stallion Import Template CSV.
Review rates. Select Intelcom Standard as the carrier.
If the import file pre-assigned Canada Post Expedited, switch to Intelcom Standard
before purchasing. Intelcom Standard: approx $10.03 / 2–4 business days.
Canada Post Expedited ($19.88, 7–11 days) is fallback only.

**Phase 7 — Purchase and Download**
Purchase labels. Download StallionLabels.pdf.
Save to Dropbox Canada Postage date folder.

**Phase 8 — Update LEDSone and Complete**
Update shipping method in LEDSone to match carrier purchased.
Enter tracking numbers. Mark all Canada orders as Shipped.
Update Canada inventory.

### Outputs
| Output | Filename | Destination |
|--------|----------|-------------|
| Canada label file | StallionLabels.pdf | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY |
| Canada packlist | Packlist.htm | Dropbox/Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE |
| OMS update | Shipped + tracking numbers | LEDSone OMS |

### Validation Checks
- Intelcom Standard selected — not Canada Post Expedited unless Intelcom is unavailable
- If Stallion import pre-assigned Canada Post Expedited: switch to Intelcom Standard
  at shipment editing step before purchase
- Shipping method in LEDSone updated to match carrier actually purchased
- Tracking numbers entered before marking as Shipped
- Canada inventory updated after booking

### Evidence Required
- StallionLabels.pdf saved to correct Dropbox date folder
- Packlist.htm saved to correct Unit-03 Postage Folder path
- Shipped status and tracking numbers confirmed in OMS

### Known Exceptions
| Exception | Action |
|-----------|--------|
| Intelcom Standard unavailable for a specific destination | Use Canada Post Expedited as fallback; note reason |
| Stallion CSV import fails | Check CSV format matches Stallion Import Template; re-export from OMS |
| Address unverifiable by Stallion | Correct address in OMS; re-export and re-upload |
| Canada inventory not matching OMS | Confirm with warehouse before completing booking |

---

## 9. Amazon FBA Label Booking

**Source:** Amazon FBA Label Booking Workflow.md (partial read — file too large to read completely)

### Purpose
Process UK Amazon FBA shipments by generating Amazon-compliant box labels and
submitting shipment details to Amazon Seller Central. Initiated by warehouse
picklist photos received via WhatsApp.

### Trigger
Initiated when the warehouse team sends a WhatsApp picklist photo showing box
assignments, contents, and weights for FBA shipments.

### Required Systems
| System | Purpose |
|--------|---------|
| WhatsApp | Receive warehouse picklist photo |
| Amazon Seller Central | FBA Manage Shipments — book and generate FBA labels |
| Google Sheets | FBA Shipments Pending Details (UK Shipment_Details tab) |

[VERIFY REQUIRED: Additional systems not confirmed from partial read.]

### Inputs
- WhatsApp picklist photo from warehouse (box assignments, contents, weights)
- Amazon Seller Central FBA shipment workflow

### High-Level Workflow
[VERIFY REQUIRED: Full workflow steps not confirmed — source file was too large
to read completely. The following is confirmed from the opening section only:]

- Packing method: Pack Individual Units — Standard packing
- Google Sheet tracked: FBA Shipments Pending Details (UK Shipment_Details tab)
- Amazon Seller Central accounts used: Ledsone / DCVoltage / SRM
  [VERIFY REQUIRED: Confirm whether all account names are complete]
- Workflow involves WhatsApp picklist → FBA shipment creation → label download

Full step-by-step workflow must be confirmed with Laksika before this section
can be populated.

### Outputs
[VERIFY REQUIRED: Output file names, Dropbox paths, and system update steps
not confirmed from partial read.]

### Validation Checks
[VERIFY REQUIRED: Validation steps not confirmed.]

### Evidence Required
[VERIFY REQUIRED: Evidence requirements not confirmed.]

### Known Exceptions
[VERIFY REQUIRED: Exception handling not confirmed.]

**Action Required:** Request complete workflow steps from Laksika. See CLAUDE.md
Decision Log — "Complete steps for Amazon FBA booking workflow" marked
[PENDING CONFIRMATION].

---

## 10. UK Collection Labels

**Source:** UK Collection Label Workflow.docx.md

### Purpose
Generate and deliver parcel collection labels for UK customers who need to
hand a return or outbound parcel to a courier at their home or business address.
This is a customer-facing process triggered by customer request.

### Trigger
Customer submits a collection label request. No fixed time — triggered
by customer request received through the applicable channel.

Note: [VERIFY REQUIRED — whether this workflow is in scope for internal AIOS
operational use. Source document appears to describe a customer-facing process.
Confirm with Varmen and Laksika.]

### Required Systems
[VERIFY REQUIRED: Specific internal systems used to generate collection labels
not confirmed from source document. Source document describes the customer
journey; internal systems not fully specified.]

### Inputs
- Customer name and collection address
- Parcel weight and dimensions
- Service type required (standard / next-day / economy / bulky)

### High-Level Workflow
6 steps:

1. Customer submits collection label request.
2. System validates: address eligibility, parcel eligibility (weight, size),
   and requested service availability.
3. Label auto-generated based on validated inputs.
4. Label delivered to customer via email, SMS, or portal download.
5. Customer attaches label to parcel and presents to courier for collection.
6. Tracking confirmation sent to customer.

Carrier assignment by parcel type:
- Royal Mail: standard parcels under 20kg
- DPD: next-day or timed delivery
- Evri: economy returns
- Yodel: bulky or heavy items over 20kg

### Outputs
| Output | Format | Delivery method |
|--------|--------|----------------|
| Collection label | A6, 300 DPI, PDF | Email / SMS / portal |
| Tracking confirmation | System-generated | To customer |

### Validation Checks
- Address validated before label generation
- Parcel weight and size validated against carrier limits
- Correct carrier assigned based on service type and parcel weight
- Label format: A6, 300 DPI, PDF

### Evidence Required
[VERIFY REQUIRED: Internal evidence requirements not confirmed — source document
is customer-facing and does not describe internal record-keeping requirements.]

### Known Exceptions
| Exception | Action |
|-----------|--------|
| Parcel exceeds carrier weight limits | Route to Yodel for bulky/heavy over 20kg |
| Address not eligible for collection | [VERIFY REQUIRED — handling not described in source] |
| Customer does not receive label | [VERIFY REQUIRED — resend process not described in source] |

---

## 11. EVRi Courier Enquiries

**Source:** EVRi courier update.docx.md

### Purpose
Submit formal tracking enquiries to EVRi for parcels that have been flagged
as problematic in the Microsoft Teams "Evri & DPD Parcel Updates" channel.
Obtain a reference number, post it back to the Teams thread, and monitor
the IONOS inbox for EVRi's response.

### Trigger
A parcel tracking issue is posted in the Microsoft Teams channel:
Evri & DPD Parcel Updates. The Postage team member spots the flag and
initiates the enquiry process. No fixed time — triggered by Teams message.

### Required Systems
| System | Purpose |
|--------|---------|
| Microsoft Teams | Evri & DPD Parcel Updates — receive flag; post reference number reply |
| EVRi Client Portal | clients.evricloud.co.uk — submit enquiry form (account: Ledsone) |
| IONOS Email | mailbusiness.ionos.co.uk — receives EVRi enquiry responses to postage@ledsone.co.uk |

### Inputs
- Tracking number from the Teams message (format: starts with H04RQ or T019VA)
- Issue description and context from the Teams message

### High-Level Workflow
14 steps:

1. Identify the tracking number from the Teams message.
2. Log in to EVRi Client Portal (clients.evricloud.co.uk, account: Ledsone).
3. Navigate to Web Form section.
4. Fill in contact details (name, email: postage@ledsone.co.uk).
5. Enter tracking number in the tracking field.
6. Click Search.
7. Review the parcel status returned.
8. Click Delivery Enquiry.
9. Select the appropriate sub-option matching the issue type.
10. Enter the standard REF: comment for the situation:
    - In transit / not delivered → REF: Please request the courier to prioritise this shipment and ensure the parcel is delivered within 24 hours.
    - Claimed attempted delivery but did not → REF: Please request the courier to reattempt delivery as soon as possible.
    - No tracking movement → REF: Please investigate why this parcel has not moved and provide an update.
    - Returned to sender → REF: Please investigate and provide the reason this parcel has been returned.
    - Delivery instructions needed → REF: [specific instructions].
11. Click Submit Enquiry.
12. Copy the reference number from the confirmation page. Do not close page first.
13. Go to Teams. Find the original parcel message. Post the reference number as a
    REPLY — not a new message.
14. Monitor IONOS inbox for EVRi's response email. Screenshot it and post in Teams.

### Outputs
| Output | Destination |
|--------|-------------|
| EVRi enquiry reference number | Posted as Teams reply in Evri & DPD Parcel Updates |
| EVRi response screenshot | Posted as Teams reply in Evri & DPD Parcel Updates |

### Validation Checks
- Tracking number format confirmed (H04RQ... or T019VA...) before submitting
- REF: comment format used — must begin with "REF:" followed by standard text
- Reference number posted as REPLY to original Teams message — not a new message
- Confirmation page not closed before reference number is copied
- IONOS inbox checked for EVRi response after submission

### Evidence Required
- EVRi enquiry reference number visible in Teams thread reply
- EVRi response email screenshot posted in Teams thread

### Known Exceptions
| Exception | Action |
|-----------|--------|
| Tracking number not found in EVRi portal | Verify format is H04RQ or T019VA prefix; if not, may be wrong courier — check DPD instead |
| EVRi portal is unavailable | Note time; retry later; log in Teams that enquiry is pending |
| No response from EVRi in IONOS inbox | Allow reasonable time; check IONOS spam folder |
| Tracking number belongs to DPD not EVRi | Route to DPD enquiry process instead |

---

## 12. Royal Mail Enquiries

**Source:** Royal Mail courier update.md (partial read — file too large to read completely)

### Purpose
Submit tracking enquiries for Royal Mail parcels that are flagged in the Microsoft
Teams channel "Smart Track and Royal Mail Parcel Updates". Enquiries are raised
via the Royal Mail Regional Account Service Team portal.

### Trigger
A parcel tracking issue is posted in the Microsoft Teams channel:
Smart Track and Royal Mail Parcel Updates. No fixed time — triggered by Teams message.

### Required Systems
| System | Purpose |
|--------|---------|
| Microsoft Teams | Smart Track and Royal Mail Parcel Updates — receive flag; post response |
| Royal Mail portal | help.royalmail.com/s/regionalaccountserviceteam — submit enquiry |

[VERIFY REQUIRED: Additional systems not confirmed from partial read.]

### Inputs
- Tracking number from the Teams message
- Issue description from the Teams message

### High-Level Workflow
[VERIFY REQUIRED: Full step sequence not confirmed — source file (Royal Mail
courier update.md) was too large to read completely. The following is confirmed
from the opening section only:]

- Enquiries are raised via Royal Mail Regional Account Service Team portal
- Portal URL: help.royalmail.com/s/regionalaccountserviceteam
- Requests arrive in Teams channel: Smart Track and Royal Mail Parcel Updates

Full step-by-step workflow must be confirmed with Laksika before this section
can be populated.

### Outputs
[VERIFY REQUIRED: Output and response process not confirmed from partial read.]

### Validation Checks
[VERIFY REQUIRED: Validation steps not confirmed.]

### Evidence Required
[VERIFY REQUIRED: Evidence requirements not confirmed.]

### Known Exceptions
[VERIFY REQUIRED: Exception handling not confirmed.]

**Action Required:** Request complete workflow steps from Laksika. See CLAUDE.md
Decision Log — "Complete steps for Royal Mail enquiry process" marked
[PENDING CONFIRMATION].

---

## Validation Summary

### Source Files Used

| Source File | Sections Populated | Read Status |
|-------------|-------------------|-------------|
| Daily Booking Workflow Final.md (v2.0) | UK Booking (§1), DE Booking (§2) | Full |
| German 2nd Booking Process Workflow.docx.md | Germany 2nd Booking (§3) | Full |
| German Vendor Booking Guide.md | German Vendor Booking (§4) | Full |
| German Return Label Workflow Guide.docx.md | German Return Labels (§5) | Full |
| DE DHL eBay Tracking Email Workflow.md | DE DHL eBay Tracking (§6) | Partial |
| USA Booking Workflow Guide.docx.md | USA Booking (§7) | Full |
| CA Booking Workflow Guide.docx.md | Canada Booking (§8) | Full |
| Amazon FBA Label Booking Workflow.md | Amazon FBA Booking (§9) | Partial |
| UK Collection Label Workflow.docx.md | UK Collection Labels (§10) | Full |
| EVRi courier update.docx.md | EVRi Courier Enquiries (§11) | Full |
| Royal Mail courier update.md | Royal Mail Enquiries (§12) | Partial |

### Sections Created

All 12 required sections are present:
§1 UK Booking — §2 Germany DE Booking — §3 Germany 2nd Booking —
§4 German Vendor Booking — §5 German Return Labels —
§6 DE DHL eBay Tracking — §7 USA Booking — §8 Canada Booking —
§9 Amazon FBA Booking — §10 UK Collection Labels —
§11 EVRi Courier Enquiries — §12 Royal Mail Enquiries

### Missing Information (VERIFY REQUIRED items)

| Section | Missing Information | Action |
|---------|-------------------|--------|
| §2 Germany DE Booking | GLS account and enquiry process | Request from Laksika |
| §6 DE DHL eBay Tracking | Full workflow steps | Request from Laksika |
| §9 Amazon FBA Booking | Full workflow steps; output paths; evidence requirements | Request from Laksika |
| §10 UK Collection Labels | Internal systems used; evidence requirements; scope confirmation | Confirm with Varmen and Laksika |
| §12 Royal Mail Enquiries | Full workflow steps; output format; evidence requirements | Request from Laksika |

### PASS / FAIL Assessment

**RESULT: CONDITIONAL PASS**

**What passes:**
- All 12 workflow areas are represented
- Every populated section traces directly to a named source document
- No information was invented — [VERIFY REQUIRED] marks every unconfirmed area
- Janarthan's rules are not duplicated here (they remain in janarthan-rules.md)
- Fully-readable source files produced fully-populated sections
- Partially-read source files produced partial sections with clear gap markers

**Conditions for full PASS:**
1. Three partially-read source files (DE DHL, FBA, Royal Mail) reviewed and gaps filled
2. Varmen confirms whether UK Collection Labels workflow is in scope for internal AIOS use
3. Varmen reviews and approves this file before it is treated as operational

**This file must not be treated as final until Varmen has reviewed and approved it.**
