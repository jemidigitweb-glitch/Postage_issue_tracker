# Courier & Vendor Information Repository — Postage AIOS
# LEDSone — Postage Department
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review and approval
# Source: Extracted from CLAUDE.md and Laksika's BGCT workflow documents
# Builder: Vishnu Sree | Validator: Varmen

---

## What This File Is

This file is a consolidated reference repository for all couriers, shipping
platforms, marketplaces, and vendor-related systems used by the Postage team.

**What this file is NOT:**
- It is not a copy of operational procedures (those are in bgct-procedures.md)
- It is not a rules repository (those are in janarthan-rules.md)
- It does not contain SLA commitments, rate cards, or contract terms — those
  are not available in the source documents

**How to use this file:**
Use it to quickly identify which courier or platform handles a specific region or
task, what account names and portals are in use, what tracking formats to expect,
and what the known limitations are. For step-by-step workflow instructions, refer
to bgct-procedures.md.

---

## Contents

1. [DHL](#1-dhl)
2. [Royal Mail](#2-royal-mail)
3. [EVRi](#3-evri)
4. [GLS](#4-gls)
5. [Stallion Express](#5-stallion-express)
6. [GoShippo](#6-goshippo)
7. [Amazon Seller Central](#7-amazon-seller-central)
8. [Amazon Vendor Central](#8-amazon-vendor-central)
9. [eBay Seller Hub](#9-ebay-seller-hub)
10. [Dropbox](#10-dropbox)
11. [Microsoft Teams](#11-microsoft-teams)

---

## 1. DHL

### Overview
DHL is the primary courier for all German outbound shipments from Trossingen
warehouses and for all German customer return labels. It is the only courier
used for DE bookings and Amazon Vendor (DTM1 Werne) shipments. All DHL label
generation and return label creation goes through the DHL Business Portal.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| DHL Business Portal | geschaeftskunden.dhl.de | German return label generation (Retourenlabel); primary DHL management portal |
| LEDSone OMS | order.vintageinterior.co.uk | DHL label generation for all DE daily and 2nd booking orders |
| IONOS Email | mailbusiness.ionos.co.uk | Receives DHL return label PDFs to postage@ledsone.co.uk |

### Services Used

| DHL Service | When Used | Warehouse |
|-------------|-----------|-----------|
| DHL PAKET | Standard German domestic parcels | Trossingen Schmutter and Trossingen Kronen |
| DHL KLEINPAKET | Smaller/lighter items — transformers, bulbs, small fittings | Trossingen Kronen primarily |
| DHL PAKET INTERNATIONAL | International destinations from DE warehouse (France, Netherlands, Italy, Belgium, and others) | Trossingen Schmutter and Trossingen Kronen |
| DHL RETOURE ONLINE | German customer return labels only — never Selbstzahler | DHL Business Portal only — not OMS |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Business Portal URL | geschaeftskunden.dhl.de | Confirmed |
| Sender address on labels | Hüttenlampen / Schmutter Str 16 / 78647 Trossingen / GERMANY | Confirmed |
| DHL billing account number | 63748818590101 | [VERIFY REQUIRED — seen on source label; confirm still current with Laksika] |
| Return receiver (fixed) | Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen, Germany | Confirmed |
| IONOS receiving email | postage@ledsone.co.uk | Confirmed |

### Tracking Format
- Sendungsnummer format: 18-digit number starting with 003404...
- Example prefix: 003404...
- Label barcode: Leitcode barcode + Sendungsnummer barcode (both required on every label)

### Countries Served

| Country / Region | DHL Service Used |
|-----------------|-----------------|
| Germany (domestic) | DHL PAKET or DHL KLEINPAKET |
| France | DHL PAKET INTERNATIONAL |
| Netherlands | DHL PAKET INTERNATIONAL |
| Italy, Belgium, and other EU destinations | DHL PAKET INTERNATIONAL |
| Germany (Amazon Vendor DTM1 Werne) | DHL PAKET (Trossingen Schmutter only — no International) |
| German customers returning items | DHL RETOURE ONLINE |

### Workflows Using DHL

| Workflow | DHL Role |
|----------|---------|
| UK and DE Daily Booking | DE order label generation (all Trossingen services) |
| Germany 2nd Booking | DE 2nd booking label generation; visual label verification |
| German Vendor Booking | DHL PAKET labels for Amazon Vendor DTM1 Werne; ASN tracking numbers |
| German Return Labels | DHL RETOURE ONLINE — return label to Trossingen |
| DE DHL eBay Tracking Workflow | DHL shipping profile data export from OMS |

### Known Dependencies
- LEDSone OMS must be used to create all DHL PAKET and DHL KLEINPAKET labels
  for DE orders — DHL Business Portal is used only for return labels
- IONOS inbox (mailbusiness.ionos.co.uk) must be accessible to receive return
  label PDFs from DHL after submission
- DHL billing account number must be present on every label (Abrechnungsnr. field)
- All DHL labels must be visually verified against 9 fields before printing
  (see R-VAL-01 in janarthan-rules.md)

### Known Limitations
- GLS (not DHL) is used for DE orders with 1st Class service AND shipping value
  over €20 — not all DE orders go through DHL
- DHL KLEINPAKET must not be used for Amazon Vendor DTM1 Werne shipments
- DHL PAKET INTERNATIONAL must not be used for Amazon Vendor DTM1 Werne shipments
- Return label tab selection error (SELBSTZAHLER vs ONLINE) creates wrong label type

### Related Documents
- Source: Daily Booking Workflow Final.md (v2.0) — DE service assignment steps
- Source: German 2nd Booking Process Workflow.docx.md — label verification
- Source: German Vendor Booking Guide.md — Vendor DHL PAKET constraints
- Source: German Return Label Workflow Guide.docx.md — RETOURE ONLINE process
- Source: DE DHL eBay Tracking Email Workflow.md — tracking data export (partial read)
- Rule references: R-CARRIER-04, R-CARRIER-05, R-VAL-01, R-BK-05, R-BK-06 in janarthan-rules.md

---

## 2. Royal Mail

### Overview
Royal Mail is used for UK domestic outbound shipments. Three specific service
variants are in use, applied through a defined waterfall cascade during the UK
service assignment phase of daily booking. Tracking enquiries are managed through
a dedicated Royal Mail Regional Account Service Team portal, flagged via Microsoft
Teams.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| LEDSone OMS | order.vintageinterior.co.uk | Royal Mail label generation for UK outbound orders |
| Royal Mail Enquiry Portal | help.royalmail.com/s/regionalaccountserviceteam | Tracking enquiry submission |
| Microsoft Teams | Smart Track and Royal Mail Parcel Updates channel | Receive enquiry requests; post enquiry responses |

### Services Used

| Service | When Used | Cascade Position |
|---------|-----------|-----------------|
| Royal Mail 48 Large Letter NEX | Unit 4 + Packing Area + Others product flags; also waterfall cascade step 1 for remaining UK orders | Step 1 |
| Royal Mail Tracked 48 NEX (2kg) | Remaining UK orders not captured by step 1 | Step 2 |
| Royal Mail Tracked 48 NEX (5kg) | Remaining UK orders not captured by steps 1 or 2 | Step 3 |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Enquiry portal | help.royalmail.com/s/regionalaccountserviceteam | Confirmed |
| Account type | Regional Account — Regional Account Service Team portal | Confirmed |
| Teams channel for enquiries | Smart Track and Royal Mail Parcel Updates | Confirmed |

[VERIFY REQUIRED: Royal Mail account name, account number, and full enquiry
submission process not confirmed — source file (Royal Mail courier update.md)
was too large to read completely. Full process to be confirmed with Laksika.]

### Countries Served
UK domestic destinations only. UK International orders (non-standard destinations)
are handled through a separate International service assignment step — not through
the Royal Mail waterfall cascade.

### Workflows Using Royal Mail

| Workflow | Royal Mail Role |
|----------|---------------|
| UK and DE Daily Booking | UK label generation via Royal Mail waterfall cascade |
| Royal Mail Enquiries | Post-booking tracking enquiry management |

### Known Dependencies
- Royal Mail service cascade sequence must be followed in exact order:
  Large Letter NEX → Tracked 48 (2kg) → Tracked 48 (5kg)
- Enquiry requests arrive via Teams; responses must be posted back to the same Teams thread
- UK labels must not be printed until all UK service assignment steps are complete

### Known Limitations
- Full Royal Mail enquiry process is not confirmed from source documents
  [VERIFY REQUIRED — see CLAUDE.md Decision Log]
- Royal Mail is not used for DE orders, US orders, Canada orders, or return labels
- Royal Mail services are part of a waterfall cascade — each step captures only
  orders not handled by the prior step

### Related Documents
- Source: Daily Booking Workflow Final.md (v2.0) — Phase 9 UK service assignment
- Source: Royal Mail courier update.md — enquiry process (partial read only)
- Rule references: R-SVC-09, R-SVC-15, R-CARRIER-06 in janarthan-rules.md

---

## 3. EVRi

### Overview
EVRi is used for UK domestic parcel delivery. When tracking issues are flagged by
the customer or raised internally, the Postage team submits formal enquiries through
the EVRi Client Portal. Enquiry requests arrive via Microsoft Teams and responses
are received via the IONOS email inbox.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| EVRi Client Portal | clients.evricloud.co.uk | Parcel enquiry submission |
| Microsoft Teams | Evri & DPD Parcel Updates channel | Receive enquiry flags; post reference number responses |
| IONOS Email | mailbusiness.ionos.co.uk | Receives EVRi enquiry confirmation and response emails |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Portal URL | clients.evricloud.co.uk | Confirmed |
| Account name | Ledsone | Confirmed |
| Contact email | postage@ledsone.co.uk | Confirmed |
| Tracking number prefix | H04RQ or T019VA | Confirmed |
| IONOS receiving inbox | mailbusiness.ionos.co.uk | Confirmed |
| Teams enquiry channel | Evri & DPD Parcel Updates | Confirmed |

### Enquiry Process Ownership
The Postage team owns and manages all EVRi enquiry submissions. The process is:
- Enquiry trigger arrives in Teams (Evri & DPD Parcel Updates)
- Postage team member submits enquiry via EVRi Client Portal
- Reference number is posted back to the Teams thread as a reply
- EVRi response arrives at postage@ledsone.co.uk (IONOS)
- Response screenshot is posted in the Teams thread

### Workflows Using EVRi

| Workflow | EVRi Role |
|----------|----------|
| UK and DE Daily Booking | EVRi is one of the UK domestic delivery carriers |
| EVRi Courier Enquiries | Post-delivery tracking enquiry management (14-step process) |

### Known Dependencies
- IONOS inbox (mailbusiness.ionos.co.uk) must be accessible for EVRi responses
- EVRi enquiry comments must follow a mandatory REF: format (see R-EXC-09 in janarthan-rules.md)
- Reference number must be posted as a REPLY to the original Teams message —
  not a new message (see R-EXC-10 in janarthan-rules.md)
- Tracking numbers can be validated by prefix: H04RQ or T019VA

### Known Limitations
- If the tracking number does not start with H04RQ or T019VA, the parcel may
  belong to DPD — check before submitting an EVRi enquiry
- The EVRi Client Portal and IONOS inbox are separate systems requiring separate logins
- EVRi enquiry responses are received by email, not directly in Teams —
  the Postage team must manually screenshot and re-post

### Related Documents
- Source: EVRi courier update.docx.md — full 14-step enquiry process
- Rule references: R-CARRIER-06, R-EXC-09, R-EXC-10 in janarthan-rules.md

---

## 4. GLS

### Overview
GLS is used as the shipping service for DE orders that meet two simultaneous
conditions: the service is 1st Class AND the shipping value is over €20. It is
not a general-purpose DE carrier — it applies to a specific service and value
combination only.

### Known Usage

| Condition | Action |
|-----------|--------|
| DE order with 1st Class service AND shipping value over €20 | Change service to GLS |

This rule is confirmed in the booking workflow (R-SVC-02 in janarthan-rules.md)
and is applied during Phase 8 of the daily UK/DE booking.

### Account Information

[VERIFY REQUIRED: GLS account details, portal URL, login credentials, and
enquiry process are NOT documented in any source document.
Action required: Request GLS account and procedure information from Laksika.
See CLAUDE.md Decision Log — "GLS account details and enquiry process" marked
[PENDING CONFIRMATION].]

### Workflows Using GLS

| Workflow | GLS Role |
|----------|---------|
| UK and DE Daily Booking | Service assigned to qualifying DE orders (1st Class + >€20) |

### Known Dependencies
- GLS service assignment is triggered by two conditions: 1st Class service AND
  shipping value over €20 — both must be true simultaneously
- If GLS account is unavailable or credentials are unknown, the DE booking step
  for GLS-eligible orders cannot proceed
- No GLS-specific portal, account, or enquiry process is documented

### Known Limitations
- GLS is one of the least-documented elements of the Postage system
- No GLS portal, tracking format, or enquiry channel is confirmed
- Enquiry handling for GLS parcels is entirely unconfirmed
- Full reliance on Laksika to provide missing GLS details

### Related Documents
- Source: Daily Booking Workflow Final.md (v2.0) — Phase 8 Step 17
- Rule references: R-SVC-02 in janarthan-rules.md
- CLAUDE.md Decision Log — GLS gap marked [PENDING CONFIRMATION]
- CLAUDE.md Known Gap 5 — GLS Details Not Documented

---

## 5. Stallion Express

### Overview
Stallion Express is the shipping platform used for all Canada marketplace orders.
It provides label purchasing for multiple Canadian carriers from a single interface.
The Postage team imports order data using a Stallion-formatted CSV template exported
from LEDSone OMS. Intelcom Standard is the mandatory default carrier.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| Stallion Express | ship.stallionexpress.ca | Canada postage purchasing; CSV import; label download |
| LEDSone OMS | order.vintageinterior.co.uk | Generate Stallion Import Template CSV; update shipping method after purchase |
| LEDSone Dashboard | dashboard.digitweblk.com | Canada warehouse inventory confirmation before booking |
| Dropbox | Canada Postage/YYYY/Month/DD.MM.YYYY | Label file storage after download |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Platform URL | ship.stallionexpress.ca | Confirmed |
| Account name | Cottage Lighting Ltd | Confirmed |
| Default carrier | Intelcom Standard | Confirmed |
| Default carrier cost | Approx $10.03 per parcel | Confirmed (subject to change) |
| Default delivery time | 2–4 business days | Confirmed |
| Fallback carrier | Canada Post Expedited | Confirmed |
| Fallback carrier cost | Approx $19.88 per parcel | Confirmed (subject to change) |
| Fallback delivery time | 7–11 business days | Confirmed |
| Import format | Stallion Import Template CSV (exported from LEDSone OMS) | Confirmed |
| Label file format | StallionLabels.pdf | Confirmed |
| Tracking prefix | SE-prefixed (e.g. SE260225TEJ0) | Confirmed |

### Canada Workflow Usage

| Step | Stallion Role |
|------|--------------|
| CSV import | Stallion Import Template CSV uploaded directly to ship.stallionexpress.ca |
| Rate selection | Intelcom Standard selected after rates are returned — Canada Post Expedited must be switched to Intelcom Standard if pre-assigned |
| Label purchase | Labels purchased and downloaded as StallionLabels.pdf |
| Tracking | SE-prefixed tracking numbers generated per shipment |

### Dropbox File Paths

| File | Path |
|------|------|
| Canada label file | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY/StallionLabels.pdf |
| Canada packlist | Dropbox/Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE/Packlist.htm |

### Workflows Using Stallion Express

| Workflow | Stallion Role |
|----------|--------------|
| Canada Booking | Primary label purchasing platform for all Canada marketplace orders |

### Known Dependencies
- Stallion Import Template CSV must be exported from LEDSone OMS before uploading
- Canada warehouse inventory must be confirmed in LEDSone Dashboard before booking
- If the Stallion import pre-assigns Canada Post Expedited, the carrier must be
  manually switched to Intelcom Standard before purchase
- After label purchase, the shipping method in LEDSone OMS must be updated to match
  the carrier used

### Known Limitations
- Rate pricing ($10.03 / $19.88) is from source documents and may change —
  [VERIFY REQUIRED: confirm current rates are still accurate with Laksika]
- Stallion Express is used exclusively for Canada orders — not UK, DE, or US
- No Stallion contact details, support channels, or account escalation paths
  are documented in the source materials

### Related Documents
- Source: CA Booking Workflow Guide.docx.md — full Canada booking process
- Rule references: R-CARRIER-01, R-BK-08 in janarthan-rules.md

---

## 6. GoShippo

### Overview
GoShippo is the label purchasing platform for US warehouse orders. It aggregates
multiple US carriers and allows the Postage team to select rates and purchase
labels directly. UPS Ground is the default carrier for warehouse orders. Labels
are downloaded as PDFs and saved to Dropbox.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| GoShippo | apps.goshippo.com/orders | US warehouse order label purchasing |
| LEDSone OMS | order.vintageinterior.co.uk | Order source data; update shipping method and tracking after purchase |
| PDFResizer.com | pdfresizer.com | Crop and merge label PDFs after download |
| Dropbox | US Postage/YYYY/Month/DD.MM.YYYY | Label file storage |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Platform URL | apps.goshippo.com/orders | Confirmed |
| Default carrier | UPS Ground | Confirmed |
| Default carrier cost | Approx $8.34 for 0.5kg, 3–5 days | Confirmed (subject to change) |
| Alternative carrier | USPS Ground Advantage | Confirmed |
| Label format | 4x6 in PDF | Confirmed |

### Carrier Details

| Carrier | Conditions | Cost (approx) | Transit |
|---------|------------|---------------|---------|
| UPS Ground | Default for all US warehouse orders | $8.34 / 0.5kg | 3–5 days |
| USPS Ground Advantage | Alternative if UPS Ground unavailable or not suitable | [VERIFY REQUIRED] | 3–5 days |

### Standard Parcel Dimensions Used on GoShippo

| Product Type | Dimensions |
|-------------|------------|
| Lampshade orders | 9x6x6 inches |
| Cable orders | 5x5x5 inches |

Weight: checked against LEDSone packlist before confirming.

### Dropbox File Paths

| File | Path |
|------|------|
| US label file | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY/LABELS.pdf |
| US packlist | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY/Packlist.htm |

### Workflows Using GoShippo

| Workflow | GoShippo Role |
|----------|--------------|
| USA Booking | Label purchasing for US warehouse orders (Phase 6 of 9-phase workflow) |

### Known Dependencies
- Weight must be verified against LEDSone OMS packlist before purchasing each label
- After purchase, the shipping method in LEDSone OMS must be updated to match UPS Ground
  (or whichever carrier was actually used)
- Label PDFs from GoShippo are processed through PDFResizer.com before saving to Dropbox
- GoShippo is used only for US warehouse orders — Amazon and eBay US orders use their
  own platforms (Amazon Seller Central and eBay Seller Hub)

### Known Limitations
- GoShippo is not used for DE, UK, or Canada orders
- Rate pricing is from source documents and may change
  [VERIFY REQUIRED: confirm current rates with Laksika]
- No GoShippo account name, login details, or escalation contact is documented

### Related Documents
- Source: USA Booking Workflow Guide.docx.md — Phase 4 GoShippo label purchasing
- Rule references: R-CARRIER-02, R-BK-07 in janarthan-rules.md

---

## 7. Amazon Seller Central

### Overview
Amazon Seller Central is used in two distinct contexts by the Postage team:
(1) as a Buy Shipping platform for US Amazon marketplace orders, and (2) as the
booking and label management system for UK Amazon FBA shipments. These are
separate use cases with separate accounts.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| Amazon Seller Central (US) | sellercentral.amazon.com | US marketplace Buy Shipping; USPS Ground Advantage Cubic labels |
| Amazon Seller Central (UK FBA) | sellercentral.amazon.com | UK FBA shipment booking; carton and unit labels |
| LEDSone OMS | order.vintageinterior.co.uk | Order source; status updates after purchase |
| Google Sheets | docs.google.com | FBA Shipments Pending Details (UK Shipment_Details tab) |
| WhatsApp | web.whatsapp.com | UK FBA — receive picklist photos from warehouse |

### Account Information

| Account Context | Account / Entity | Status |
|----------------|-----------------|--------|
| US marketplace | Neighbour Market United States | Confirmed |
| UK FBA | Ledsone | Confirmed |
| UK FBA | DCVoltage | Confirmed |
| UK FBA | SRM | Confirmed |

[VERIFY REQUIRED: Confirm whether all UK FBA account names are listed — Ledsone,
DCVoltage, SRM seen in source. There may be additional accounts. See CLAUDE.md
Decision Log — "All UK FBA Amazon account names confirmed?"]

### Preferred Carrier (US Marketplace)

| Carrier | Priority | Cost (approx) | Notes |
|---------|----------|---------------|-------|
| USPS Ground Advantage Cubic | First choice | $9.65 | Confirmed preferred carrier |
| USPS Ground Advantage (1–70 lb) | Second choice | $10.00 | Used if Cubic not available |
| USPS Priority Mail | Avoid unless expedited required | Higher | Not a default |
| FedEx | Avoid unless expedited required | Higher | Not a default |

### UK FBA Packing Method
Pack Individual Units — Standard packing.
Google Sheet tracked: FBA Shipments Pending Details (UK Shipment_Details tab).
[VERIFY REQUIRED: Full UK FBA workflow steps, label types, and Dropbox save paths
are not confirmed — source file too large to read fully.]

### Workflows Using Amazon Seller Central

| Workflow | Role |
|----------|------|
| USA Booking | Buy Shipping for US Amazon marketplace orders (Phase 7) |
| Amazon FBA Booking (UK) | FBA shipment creation, label download, ASN management |
| UK and DE Daily Booking | Trossingen Schmutter DHL Paket — booked via Amazon account portal (exactly 5 parcels) |

### Known Dependencies
- For US marketplace: after purchasing labels on Amazon Seller Central, the
  shipping method in LEDSone OMS must be updated to match the carrier purchased
- For UK FBA: picklist photo must be received via WhatsApp before booking begins
- For Trossingen Schmutter DHL Paket: the booking portal route through Amazon
  account is required — exactly 5 parcels per booking action

### Known Limitations
- Full UK FBA workflow is not confirmed from source documents
  [VERIFY REQUIRED — see CLAUDE.md Decision Log]
- UK FBA account name list may be incomplete
- Amazon Seller Central is the platform for US Amazon and UK FBA — it is NOT used
  for DE Amazon Vendor (that uses Amazon Vendor Central separately)

### Related Documents
- Source: USA Booking Workflow Guide.docx.md — Phase 7 Amazon Seller Central
- Source: Amazon FBA Label Booking Workflow.md — UK FBA (partial read only)
- Source: Daily Booking Workflow Final.md (v2.0) — Phase 8 Step 22 (Schmutter DHL Paket)
- Rule references: R-CARRIER-03, R-SVC-07, R-BK-07 in janarthan-rules.md

---

## 8. Amazon Vendor Central

### Overview
Amazon Vendor Central (DE account) is used exclusively for processing wholesale
Amazon Vendor purchase orders (POs) destined for DTM1, Amazon Logistik Werne GmbH,
Werne, Germany. This is a separate platform from Amazon Seller Central and requires
its own login. The Postage team uses it to verify POs, submit Advance Shipping
Notices (ASNs), and download carton labels.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| Amazon Vendor Central | vendorcentral.amazon.eu | PO verification; ASN submission; carton label download |
| LEDSone OMS | order.vintageinterior.co.uk | DHL label generation for Vendor orders (search postcode 59368) |
| Google Sheets | docs.google.com | Amazon Vendor PO Box Details - DE — tracking number logging |
| Dropbox | German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY | Label and carton label storage |
| MaxAI.me | maxai.me/pdf-tools/split-pdf/ | Split multi-page carton label PDFs before Dropbox save |
| WhatsApp Web | web.whatsapp.com | German Vendor group — receive picklist photos; send booking confirmation |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Platform URL | vendorcentral.amazon.eu | Confirmed |
| Account name | DE – Ledsone UK Limited – DE | Confirmed |
| Destination | DTM1, Amazon Logistik Werne GmbH, Raiffeisenstrasse 7, Werne, 59368, Germany | Confirmed |
| Carrier for this destination | DHL PAKET (Trossingen Schmutter only) | Confirmed — fixed constraint |

### Required Sequencing
Amazon Vendor Central activities follow a strict sequence. This is not procedural
guidance — it is a system dependency:
1. All DHL labels must be created in LEDSone OMS first
2. All tracking numbers must be recorded in the Google Sheet
3. Only then can the ASN be submitted on Vendor Central
4. Carton label PDF is downloaded after ASN submission

Tracking numbers cannot be retrieved from Vendor Central after ASN submission.

### Dropbox File Paths

| File | Path |
|------|------|
| DHL label PDFs | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/ |
| Carton labels | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/BOX 01, BOX 02, ... |

### Workflows Using Amazon Vendor Central

| Workflow | Role |
|----------|------|
| German Vendor Booking | PO verification; ASN submission; carton label download |

### Known Dependencies
- DHL label creation in LEDSone OMS must be completed before Vendor Central is used
- Google Sheet (Amazon Vendor PO Box Details - DE) must be fully updated before ASN submission
- MaxAI.me required when carton label PDF has more than one page
- WhatsApp German Vendor group is the trigger source for this workflow

### Known Limitations
- Amazon Vendor Central (DE) is entirely separate from Amazon Seller Central
  used for US and UK FBA — different URL, different account, different purpose
- Only one carrier is permitted for DTM1 Werne: Trossingen Schmutter DHL PAKET
- Once ASN is submitted, tracking numbers cannot be retrieved from Vendor Central
- Carton labels must be split into individual files per BOX — multi-page PDFs
  in a single BOX folder will result in FC rejection

### Related Documents
- Source: German Vendor Booking Guide.md — full Vendor booking workflow
- Rule references: R-WH-06, R-CARRIER-04, R-VAL-04, R-VAL-05, R-BK-02, R-BK-03 in janarthan-rules.md

---

## 9. eBay Seller Hub

### Overview
eBay Seller Hub is used for purchasing shipping labels for US eBay marketplace
orders. The Postage team uses the Buy Shipping function within Seller Hub to
generate labels for orders placed on eBay under the US1 and EBAY - electricalsone
channels as mapped in LEDSone OMS.

### Systems Used

| System | URL | Usage |
|--------|-----|-------|
| eBay Seller Hub | ebay.com Seller Hub | US eBay order Buy Shipping — label purchase |
| LEDSone OMS | order.vintageinterior.co.uk | Order source; channel mapping (US1, EBAY - electricalsone); update shipping method and tracking |
| PDFResizer.com | pdfresizer.com | Crop and merge label PDFs |
| Dropbox | US Postage/YYYY/Month/DD.MM.YYYY | Label file storage |

### Account Information

| Field | Value | Status |
|-------|-------|--------|
| Platform | eBay Seller Hub (Buy Shipping function) | Confirmed |
| LEDSone channel names | EBAY - electricalsone; US1 | Confirmed |
| Carriers available | USPS; FedEx | Confirmed |

[VERIFY REQUIRED: eBay Seller Hub account name/seller ID and any account-specific
defaults are not documented in source materials. Confirm with Laksika.]

### Carriers Used Via eBay Seller Hub

| Carrier | Notes |
|---------|-------|
| USPS | Available for US eBay orders |
| FedEx | Available for US eBay orders |

[VERIFY REQUIRED: Preferred carrier selection rules for eBay orders specifically
are not fully documented — source materials confirm USPS and FedEx are available
but do not specify a default for eBay Seller Hub orders.]

### Dropbox File Paths

| File | Path |
|------|------|
| US label file | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY/LABELS.pdf |

### Workflows Using eBay Seller Hub

| Workflow | Role |
|----------|------|
| USA Booking | Label purchasing for US eBay marketplace orders (Phase 8 of 9-phase workflow) |

### Known Dependencies
- Orders from EBAY - electricalsone and US1 LEDSone channels are purchased via eBay Seller Hub
- After purchase, the shipping method in LEDSone OMS must be updated to match the
  carrier actually used
- Label PDFs are merged with other US platform labels using PDFResizer.com before
  saving the consolidated LABELS.pdf to Dropbox

### Known Limitations
- eBay Seller Hub is used only for US eBay orders — not UK or DE eBay orders
- DE eBay tracking is managed separately via the DE DHL eBay Tracking Email workflow
  (uses DHL labels from OMS, not eBay Seller Hub labels)
- No eBay-specific carrier preference rule is confirmed for Seller Hub
  [VERIFY REQUIRED]

### Related Documents
- Source: USA Booking Workflow Guide.docx.md — Phase 8 eBay Seller Hub
- Rule references: R-BK-07 in janarthan-rules.md (update LEDSone after purchase)

---

## 10. Dropbox

### Overview
Dropbox is the central file storage system for all Postage label and packlist
outputs. Every workflow that generates labels or packlists saves its outputs
to a structured Dropbox folder hierarchy organised by region and date. Dropbox
is a shared folder accessible to all relevant team members.

### Systems Used

| System | Usage |
|--------|-------|
| Dropbox (shared folder) | All label PDF and Packlist.htm file storage across all regions and workflows |

[VERIFY REQUIRED: Specific Dropbox account name, owner, and access management
are not documented in source materials.]

### Complete Folder Structure Used by Postage

| Region / Workflow | Dropbox Path |
|------------------|-------------|
| DE daily booking labels | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/ |
| DE 2nd booking — Schmutter | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/schmutter |
| DE 2nd booking — Kronen | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/kronen |
| DE Amazon Vendor labels | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/ |
| DE Amazon Vendor carton labels | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/BOX 01, BOX 02 |
| UK daily booking labels | Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY |
| US orders | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY |
| Canada orders | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY |
| Canada FBA / Unit 3 packlist | Dropbox/Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE |

### Standard File Names Used

| File | Used In |
|------|---------|
| Packlist.htm | UK/DE/German 2nd booking packlists |
| Labels-[N].pdf | German 2nd booking labels (Schmutter and Kronen) |
| LABELS.pdf | US booking consolidated label file |
| StallionLabels.pdf | Canada booking label file |
| Retourenlabel.pdf | German return label (before cropping) |
| Labels PDF (DHL) | German Vendor DHL label files |
| Carton label (split) | German Vendor BOX subfolders |

### Usage Within Postage Operations

Dropbox is used in every workflow as the mandatory output destination:
- UK/DE Daily Booking: packlist and label PDFs saved before shipped status is updated
- German 2nd Booking: labels saved to separate Schmutter and Kronen subfolders
- German Vendor Booking: DHL labels and split carton labels saved per BOX folder
- USA Booking: consolidated LABELS.pdf saved after PDF merge
- Canada Booking: StallionLabels.pdf saved after Stallion purchase
- German Return Labels: cropped Retourenlabel.pdf saved (personal copy only —
  label is shared via Teams, not from Dropbox)

### Known Dependencies
- Dropbox must be accessible before a booking session can be closed
- Date folder structure (YYYY/Month/DD.MM.YYYY) must be created before saving
- Files must be saved to the correct region subfolder — saving to the wrong path
  creates routing confusion at the warehouse
- German 2nd booking requires separate subfolder creation: 2nd Booking/schmutter
  and 2nd Booking/kronen

### Known Limitations
- Dropbox account access management is not documented
  [VERIFY REQUIRED: who owns the shared Dropbox and who manages access?]
- No Dropbox backup or recovery procedure is documented in source materials
- File naming conventions are standardised per workflow but not globally enforced —
  naming deviations could cause confusion

### Related Documents
- Source: Daily Booking Workflow Final.md (v2.0) — all UK/DE Dropbox paths
- Source: German 2nd Booking Process Workflow.docx.md — 2nd booking Dropbox paths
- Source: German Vendor Booking Guide.md — Amazon Vendor Dropbox folder structure
- Source: USA Booking Workflow Guide.docx.md — US Dropbox path
- Source: CA Booking Workflow Guide.docx.md — Canada Dropbox paths

---

## 11. Microsoft Teams

### Overview
Microsoft Teams is the primary internal communication platform for the Postage
team. Multiple dedicated channels serve distinct operational purposes. Teams is
not used for label generation or system operations — its role is to receive task
triggers, communicate booking updates, share outputs, and log issues that require
team coordination.

### Systems Used

| System | Usage |
|--------|-------|
| Microsoft Teams (shared workspace) | Internal communication across all dedicated Postage channels |

[VERIFY REQUIRED: The Microsoft Teams tenant name, workspace URL, and access
management details are not documented in source materials.]

### Known Channels Used by Postage

| Channel | Purpose | Relevant Workflow |
|---------|---------|------------------|
| MSG and Post | Cancellations, address changes, alternative delivery instructions — checked at the start of every UK/DE booking session | UK and DE Daily Booking |
| Packlist Label Issue | Warehouse change requests and rebooking instructions — checked during every booking session | UK and DE Daily Booking |
| German postage / Replacements | German customer return label requests — received from CST team | German Return Labels |
| Evri & DPD Parcel Updates | EVRi and DPD tracking enquiry triggers — Postage team posts reference number replies here | EVRi Courier Enquiries |
| Smart Track and Royal Mail Parcel Updates | Royal Mail tracking enquiry triggers — Postage team posts responses here | Royal Mail Enquiries |
| US Marketplace | US booking coordination, wrong SKU resolution, booking completion updates | USA Booking |
| German Vendor (WhatsApp group) | Note: this is WhatsApp, not Teams — warehouse picklist photos for Amazon Vendor bookings | German Vendor Booking |

Note: The German Vendor group operates via WhatsApp Web (web.whatsapp.com),
not via Microsoft Teams. It is listed here to prevent confusion — WhatsApp is
separate from the Teams channel list.

### How Teams Is Used Per Channel

**MSG and Post**
- Checked at the beginning of every daily UK/DE booking session
- Actions cancellations, address changes, or special instructions before booking rules run
- If a change affects an already-booked label, the label must be cancelled and re-booked

**Packlist Label Issue**
- Checked at the beginning of every daily UK/DE booking session (alongside MSG and Post)
- Actions warehouse-side requests: rebook, change warehouse, fix packlist errors
- Both channels must be fully actioned before the booking session is closed

**German postage / Replacements**
- CST team members post customer return address details here
- Postage team responds with: Sendungsnummer (text) + cropped Retourenlabel PDF (attachment)
- Response must be a REPLY to the original request — not a new message

**Evri & DPD Parcel Updates**
- Postage team checks this channel for parcel tracking flags
- After submitting an EVRi enquiry, the reference number is posted here as a REPLY
- EVRi response screenshot (from IONOS inbox) is also posted here as a follow-up REPLY
- DPD enquiries: [VERIFY REQUIRED — DPD enquiry process not documented in source files]

**Smart Track and Royal Mail Parcel Updates**
- Postage team checks this channel for Royal Mail tracking flags
- Enquiries are raised via the Royal Mail Regional Account Service Team portal
- Response posting process: [VERIFY REQUIRED — full Royal Mail enquiry response
  protocol not confirmed from source documents]

**US Marketplace**
- Postage team posts booking completion update after US orders are shipped
- Used for wrong SKU coordination and team updates during the US booking session

### Known Dependencies
- MSG and Post and Packlist Label Issue must be checked before booking rules run —
  unactioned messages may affect orders in the current queue
- EVRi and Royal Mail enquiry channels require REPLY threading — new messages break
  the audit trail
- German Return Label responses must be replies to maintain request-response linkage

### Known Limitations
- DPD enquiry process is not documented — DPD parcels may appear in the
  Evri & DPD Parcel Updates channel but no DPD-specific enquiry procedure is
  confirmed [VERIFY REQUIRED]
- Teams workspace details, admin access, and channel management are not documented
- WhatsApp (German Vendor group) is a separate system from Teams and must not
  be confused with Teams channels

### Related Documents
- Source: Daily Booking Workflow Final.md (v2.0) — MSG and Post; Packlist Label Issue
- Source: EVRi courier update.docx.md — Evri & DPD Parcel Updates channel
- Source: German Return Label Workflow Guide.docx.md — German postage / Replacements
- Source: Royal Mail courier update.md — Smart Track channel (partial read)
- Source: USA Booking Workflow Guide.docx.md — US Marketplace channel

---

## Validation Summary

### Systems Documented

| Type | Systems |
|------|---------|
| Couriers | DHL, Royal Mail, EVRi, GLS, Intelcom Standard (via Stallion), Canada Post Expedited (via Stallion), UPS Ground (via GoShippo), USPS (via GoShippo / Amazon) |
| Shipping Platforms | GoShippo, Stallion Express |
| Marketplace Platforms | Amazon Seller Central (US + UK FBA), Amazon Vendor Central (DE), eBay Seller Hub |
| Infrastructure | Dropbox, Microsoft Teams |

### Sections Documented

| # | Section | Status |
|---|---------|--------|
| 1 | DHL | Fully populated from source |
| 2 | Royal Mail | Partially populated — enquiry process [VERIFY REQUIRED] |
| 3 | EVRi | Fully populated from source |
| 4 | GLS | Partially populated — account details entirely [VERIFY REQUIRED] |
| 5 | Stallion Express | Fully populated from source |
| 6 | GoShippo | Fully populated from source |
| 7 | Amazon Seller Central | Partially populated — UK FBA full workflow [VERIFY REQUIRED] |
| 8 | Amazon Vendor Central | Fully populated from source |
| 9 | eBay Seller Hub | Partially populated — carrier default for eBay [VERIFY REQUIRED] |
| 10 | Dropbox | Fully populated from source |
| 11 | Microsoft Teams | Mostly populated — DPD enquiry process [VERIFY REQUIRED] |

### Source Files Used

| Source Document | Sections Informed |
|----------------|------------------|
| CLAUDE.md (Permanent Context / Courier Ecosystem) | All sections — primary reference |
| Daily Booking Workflow Final.md (v2.0) | DHL, Royal Mail, EVRi, GLS, Dropbox, Teams |
| German 2nd Booking Process Workflow.docx.md | DHL, Dropbox |
| German Vendor Booking Guide.md | DHL, Amazon Vendor Central, Dropbox |
| German Return Label Workflow Guide.docx.md | DHL, Teams (German postage / Replacements) |
| EVRi courier update.docx.md | EVRi, Teams (Evri & DPD Parcel Updates) |
| USA Booking Workflow Guide.docx.md | GoShippo, Amazon Seller Central, eBay Seller Hub, Dropbox, Teams |
| CA Booking Workflow Guide.docx.md | Stallion Express, Dropbox |
| Amazon FBA Label Booking Workflow.md | Amazon Seller Central UK FBA (partial — [VERIFY REQUIRED]) |
| Royal Mail courier update.md | Royal Mail (partial — [VERIFY REQUIRED]) |
| DE DHL eBay Tracking Email Workflow.md | DHL, eBay Seller Hub (partial — [VERIFY REQUIRED]) |

### Missing Information

| Section | Missing Information | Required Action |
|---------|-------------------|----------------|
| DHL | Billing account 63748818590101 still current? | Confirm with Laksika |
| DHL | Account contacts, SLAs, escalation path | Request from Laksika |
| Royal Mail | Full enquiry process steps; account name/number; response protocol | Confirm with Laksika (source file unread) |
| Royal Mail | Account contacts, SLAs, escalation path | Request from Laksika |
| EVRi | Account contacts, SLAs, escalation path | Request from Laksika |
| GLS | Everything — portal, account, tracking format, enquiry process | Request from Laksika (Gap 5 in CLAUDE.md) |
| Stallion Express | Confirm rate pricing still current ($10.03 / $19.88) | Confirm with Laksika |
| Stallion Express | Account contacts, escalation path | Request from Laksika |
| GoShippo | Account name/login details; confirm rate pricing | Confirm with Laksika |
| Amazon Seller Central | Full UK FBA workflow; complete account list for FBA | Confirm with Laksika (source file unread) |
| Amazon Seller Central | UK FBA Dropbox paths and evidence requirements | Confirm with Laksika |
| eBay Seller Hub | Account name/seller ID; carrier default for eBay-specific orders | Confirm with Laksika |
| Dropbox | Account owner; access management; backup procedure | Request from Laksika or Varmen |
| Teams | Workspace URL; admin; DPD enquiry process | Confirm with Laksika (DPD process not documented) |

### PASS / FAIL Assessment

**RESULT: CONDITIONAL PASS**

**What passes:**
- All 11 required sections are present
- All couriers, platforms, and systems in scope are represented
- Every statement traces to a confirmed source document or CLAUDE.md
- No operational procedures were copied from bgct-procedures.md
- No rules were duplicated from janarthan-rules.md
- Missing information is clearly marked [VERIFY REQUIRED] — nothing was invented
- No contacts, SLAs, rate cards, or contracts were fabricated
- DPD presence in Teams channel noted but marked [VERIFY REQUIRED] — not assumed

**Conditions for full PASS:**
1. GLS account details are confirmed by Laksika and the GLS section is updated
2. Royal Mail enquiry process is confirmed from full source file read
3. UK FBA Dropbox paths and evidence requirements are confirmed
4. Varmen reviews and approves this file before it is treated as operational

**This file must not be treated as final until Varmen has reviewed and approved it.**
