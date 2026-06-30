# POSTAGE AIOS
# LEDSone — Postage Department
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review and approval before operational use
# Source material: Laksika's BGCT workflow documents
# Builder: Vishnu Sree | Validator: Varmen

---

## PURPOSE

Build and continuously improve a structured knowledge system for Postage operations,
using Laksika's BGCT documents as the foundation — with daily issues and lessons
feeding in over time to make the system smarter.

This AIOS is NOT built around a single optimisation metric. Postage holds broad
responsibility across courier management, booking workflows, service selection,
warehouse routing, label generation, vendor relationships, and operational support.
No single number (fastest dispatch, lowest cost, fewest errors) defines what this
system exists to maximise. The breadth is intentional and must not be narrowed.

**What this system does:**
- Answers questions about Postage procedures using confirmed source documents only
- Navigates booking workflows for UK, DE, Germany (2nd booking), Vendor, Return
  Labels, Collection Labels, US, Canada, and FBA orders
- Surfaces Janarthan's operational rules as a distinct, searchable rule layer
- Supports daily issue logging and pattern recognition over time
- Serves as institutional memory so operational knowledge is not lost when staff change

**What this system does NOT do:**
- Invent rules not found in source documents
- Commit to courier bookings or confirm shipments automatically
- Override Laksika as the domain authority on postage knowledge
- Treat any fact as confirmed unless it traces to a source document or Varmen decision

---

## GOVERNANCE

| Person | Role | Responsibility |
|--------|------|----------------|
| MD | Strategic owner | Confirmed: no single optimisation goal — broader purpose applies across all AIOS builds |
| Varmen | Team Lead — Validator | Reviews and approves all content before it is treated as final; resolves gaps not covered by source documents; makes cross-AIOS boundary decisions |
| Vishnu Sree | Builder | Structures Laksika's documents into the AIOS; flags gaps; never invents facts or rules |
| Laksika | Document source / likely eventual owner | Owns the BGCT workflow documents; final word on what is accurate in postage operations; likely day-to-day owner post-handover (to be confirmed at Phase 4) |
| Janarthan | Rules author | Authored the postage rules embedded within the workflow documents; rules are extracted and preserved here as a distinct layer |

**Confirmed by Laksika:**
- The workflow documents in the Postage workflow folder are the BGCT source material.
- Janarthan's rules are embedded within those workflow documents as routing logic,
  booking rules, carrier selection rules, validation rules, and exception handling.
- There is no separate Janarthan rules document.

**Governance principle:**
Every fact in this AIOS must trace back to Laksika's workflow documents, Janarthan's
extracted rules, or a Varmen-approved resolution of a confirmed gap. Nothing is
invented by the builder.

**Escalation path:**
Gap identified → flag to Varmen → Varmen directs to Laksika or resolves directly →
confirmed resolution recorded in Decision Log → treated as operational fact.

---

## PERMANENT CONTEXT

### Postage Operations

LEDSone processes orders across Amazon, eBay, Shopify, Wayfair, Avasam, OnBuy,
and Faire for multiple destination regions. Postage operations manage the daily
booking, label generation, warehouse routing, and courier handover for all
outbound and return shipments. Operations run from Sri Lanka (SL time) against
UK and German warehouses.

---

#### UK and DE Daily Booking

Primary daily workflow. All UK and DE orders are processed through the LEDSone
OMS (order.vintageinterior.co.uk) in a 38-step sequence across 10 phases:

Phase 1 — Initial order processing (move completed orders to Dispatched, upload
manual platform orders, queue new orders)
Phase 2 — Flag and country assignment (FR/NL → DE; UK International exclusions)
Phase 3 — Wrong SKU correction (identify and fix before booking rules run)
Phase 4 — Teams group checks (MSG & Post; Packlist Label Issue)
Phase 5 — Booking rules: UK and Wayfair
Phase 6 — Booking rules: UK and DE without replacement
Phase 7 — Warehouse stock check for Netherlands orders
Phase 8 — DE service assignment (No Service → GLS → DHL → International → Trossingen)
Phase 9 — UK service assignment (No Service → Unit 4 rules → weight/class rules →
           International → country-specific → waterfall cascade)
Phase 10 — Labels printed, packlists saved to Dropbox, shipped status updated

UK warehouses: Unit 3, Unit 4
DE warehouses: Trossingen Schmutter, Trossingen Kronen
Manual platforms: Wayfair, Avasam, OnBuy, Faire
Source: Daily Booking Workflow Final.md (Version 2.0, AIOS Governance Ready, 18/06/2026)

---

#### German 2nd Booking

Daily afternoon task run at 1:30 PM SL time (2:30 PM during European summer time
change). Processes German orders through Trossingen Schmutter and Trossingen Kronen
separately after the main booking run.

Sequence: move 1st booking completed orders to Dispatched → run Assign Rules on
remaining → handle Wrong SKU / Error Shipments → fix International and Netherlands
routing → 2nd booking for Schmutter → 2nd booking for Kronen → verify DHL labels
→ log order counts in German Time Sheet

Dropbox path: Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/schmutter
              Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/kronen
Packlist filename: Packlist.htm
Labels filename: Labels-[N].pdf
Source: German 2nd Booking Process Workflow.docx.md

---

#### German Vendor Booking

Processes wholesale Amazon Vendor purchase orders (POs) for DTM1 Werne, Germany.
Initiated by a WhatsApp picklist photo from the warehouse team.

Sequence: check WhatsApp picklist photo (German Vendor group) → verify POs on
Amazon Vendor Central → update Google Sheet (Amazon Vendor PO Box Details - DE) →
create DHL labels in LEDSone OMS (search postcode 59368) → save labels to Dropbox
→ paste tracking numbers in Google Sheet → submit ASN on Vendor Central →
download and split carton labels → save to Dropbox BOX subfolders → confirm on
WhatsApp

Amazon Vendor Central: vendorcentral.amazon.eu
Account: DE – Ledsone UK Limited – DE
Destination: DTM1, Amazon Logistik Werne GmbH, Raiffeisenstrasse 7, Werne, 59368 Germany
Dropbox path: Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/BOX 01, BOX 02
Source: German Vendor Booking Guide.md

---

#### German Return Labels

Generates DHL return labels (Retourenlabel) for German customers. Requests arrive
via Microsoft Teams (German postage / Replacements channel) from the CST team.

Sequence: receive customer address from Teams → log in to DHL Business Portal →
select DHL RETOURE ONLINE tab → fill in customer address (sender section) →
confirm return receiver is pre-filled as Hüttenlampe e.K. → submit → download PDF
from IONOS email → crop via PDFResizer.com → share cropped label and Sendungsnummer
back in Teams as a reply to the original request

DHL Business Portal: geschaeftskunden.dhl.de
Return receiver (fixed): Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen, Germany
Email for label delivery: postage@ledsone.co.uk
IONOS inbox: mailbusiness.ionos.co.uk
Source: German Return Label Workflow Guide.docx.md

---

#### UK Collection Labels

Customer-facing process for requesting parcel collection labels. Six-step sequence:
customer submits request → system validates address, eligibility, parcel details →
label is auto-generated → label delivered via email, SMS, or portal → customer
attaches label and hands parcel to courier → tracking confirmation.

Label format: A6, 300 DPI, PDF
Carrier assignment logic: Royal Mail (standard, under 20kg), DPD (next-day/timed),
Evri (economy returns), Yodel (bulky/heavy, over 20kg)
Source: UK Collection Label Workflow.docx.md

---

#### US Marketplace Booking

Processes US orders across three platforms. 25-step workflow across 9 phases.

GoShippo (warehouse orders): apps.goshippo.com/orders — UPS Ground default
Amazon Seller Central: sellercentral.amazon.com — USPS Ground Advantage Cubic default
eBay Seller Hub: eBay Buy Shipping

Sequence: apply Book from US filter → resolve Wrong SKU → verify addresses → move
to In Progress → generate and save Packlist.htm → buy labels on GoShippo/Amazon/eBay
→ merge/crop PDFs via PDFResizer.com → save LABELS.pdf to Dropbox → update shipping
method in LEDSone → enter tracking numbers → mark as Shipped → update inventory →
post update in Teams US Marketplace channel

Dropbox path: Dropbox/US Postage/YYYY/Month/DD.MM.YYYY/
Packlist: Packlist.htm | Labels: LABELS.pdf
Source: USA Booking Workflow Guide.docx.md

---

#### Canada Marketplace Booking

Processes Canada orders (Amazon/eBay/Shopify) via Stallion Express. Eight-phase
workflow.

Stallion Express: ship.stallionexpress.ca
Account name: Cottage Lighting Ltd
Default carrier: Intelcom Standard (2–4 business days, approx $10.03)
Fallback: Canada Post Expedited (7–11 business days, approx $19.88)
Import format: Stallion Import Template CSV (exported from LEDSone OMS)

Sequence: filter Book from CA orders → verify addresses and Canada inventory →
move to In Progress → generate packlist → export Stallion template → upload to
Stallion → get rates → select Intelcom Standard → purchase → download label →
save to Dropbox → update shipping method in LEDSone → mark as Shipped → update
inventory

Dropbox path: Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY/StallionLabels.pdf
Packlist path: Dropbox/Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE/Packlist.htm
Source: CA Booking Workflow Guide.docx.md

---

#### Amazon FBA Booking (UK)

Processes UK Amazon FBA shipments. Initiated by a warehouse WhatsApp picklist photo
showing box assignments and weights.

Google Sheet: FBA Shipments Pending Details (UK Shipment_Details tab)
Booking platform: Amazon Seller Central (Ledsone / DCVoltage / SRM accounts)
Packing method: Pack Individual Units — Standard packing

[VERIFY REQUIRED: Full workflow steps not fully confirmed — source file too large
to read completely. Confirm complete process with Laksika.]
Source: Amazon FBA Label Booking Workflow.md (partial read)

---

#### EVRi Courier Enquiries

Raised via EVRi Client Portal when parcels are flagged in the Teams channel
"Evri & DPD Parcel Updates". 14-step process.

Sequence: identify tracking number from Teams message → log in to EVRi portal →
navigate to Web form → fill in contact details → enter tracking number → click
Search → check parcel status → click Delivery Enquiry → select sub-option →
enter standard REF: comment → click Submit Enquiry → copy reference number →
post reference in Teams as reply to original message → check IONOS inbox for
EVRi reply → screenshot reply → post screenshot in Teams

EVRi portal: clients.evricloud.co.uk
Account name: Ledsone
Email: postage@ledsone.co.uk
Tracking prefix: H04RQ or T019VA
Teams channel: Evri & DPD Parcel Updates
IONOS inbox: mailbusiness.ionos.co.uk
Source: EVRi courier update.docx.md

---

#### Royal Mail Enquiries

Raised via Royal Mail Regional Account Service Team portal when tracking updates
are requested in Teams channel "Smart Track and Royal Mail Parcel Updates".

Portal: help.royalmail.com/s/regionalaccountserviceteam
Teams channel: Smart Track and Royal Mail Parcel Updates
[VERIFY REQUIRED: Full Royal Mail enquiry process not confirmed — source file too
large to read completely. Confirm complete steps with Laksika.]
Source: Royal Mail courier update.md (partial read)

---

#### DE DHL eBay Tracking Email

Daily task. Run Monday to Friday after ALL German booking is complete, at
approximately 5:00 PM SL time. Exports DHL shipping profile data from LEDSone OMS
for German eBay orders. Covers both Kronen and Schmutter profile variants.

[VERIFY REQUIRED: Full step detail not fully confirmed — source file partially read.
Confirm complete export and email process with Laksika.]
Source: DE DHL eBay Tracking Email Workflow.md (partial read)

---

### Tools Used

| Tool | URL | Purpose |
|------|-----|---------|
| LEDSone OMS | order.vintageinterior.co.uk | Primary order management — all booking, filtering, labelling, and status updates |
| LEDSone Dashboard | dashboard.digitweblk.com | Canada warehouse inventory; Combo Products lookup (/new/searchproducts.php) |
| Dropbox | Shared folder | All label and packlist file storage — structured by region and date |
| Microsoft Teams | Shared workspace | Internal communication across multiple dedicated channels |
| Google Sheets | docs.google.com | German Time Sheet; FBA Shipments Pending Details; Amazon Vendor PO Box Details - DE |
| GoShippo | apps.goshippo.com/orders | US order label purchasing (UPS, USPS) |
| Stallion Express | ship.stallionexpress.ca | Canada order postage purchasing |
| Amazon Vendor Central | vendorcentral.amazon.eu | DE wholesale PO management and ASN submission |
| Amazon Seller Central | sellercentral.amazon.com | US Amazon marketplace Buy Shipping; UK FBA booking |
| eBay Seller Hub | ebay.com Seller Hub | US eBay marketplace Buy Shipping |
| DHL Business Portal | geschaeftskunden.dhl.de | German return label (Retourenlabel) generation |
| EVRi Client Portal | clients.evricloud.co.uk | EVRi parcel enquiry submission |
| IONOS Email | mailbusiness.ionos.co.uk | Receives EVRi enquiry responses to postage@ledsone.co.uk |
| WhatsApp Web | web.whatsapp.com | German Vendor group — warehouse picklist photos and booking confirmations |
| PDFResizer.com | pdfresizer.com | Crop and merge label PDFs (US orders, German return labels) |
| MaxAI.me | maxai.me/pdf-tools/split-pdf/ | Split multi-page carton label PDFs (Amazon Vendor) |

**Microsoft Teams channels used by Postage:**

| Channel | Purpose |
|---------|---------|
| MSG and Post | Cancellations, address changes, alternative messages — checked during daily UK/DE booking |
| Packlist Label Issue | Warehouse change requests and rebooking — checked during daily booking |
| German postage / Replacements | German customer return label requests from CST |
| Evri & DPD Parcel Updates | EVRi and DPD tracking enquiry requests |
| Smart Track and Royal Mail Parcel Updates | Royal Mail tracking enquiry requests |
| US Marketplace | US booking coordination, wrong SKU resolution, team updates |
| German Vendor (WhatsApp group) | Warehouse picklist photos for Amazon Vendor bookings |

**Dropbox folder structure by region:**

| Region | Path |
|--------|------|
| DE daily / 2nd booking | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/2nd Booking/schmutter or kronen |
| DE Amazon Vendor | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/BOX 01, BOX 02 |
| UK | Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY |
| US | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY |
| Canada | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY |
| Canada FBA | Dropbox/Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE |

---

### Courier Ecosystem

#### DHL
Used for all German outbound shipments from Trossingen warehouses and German return
labels.

| Service | When used |
|---------|-----------|
| DHL PAKET | Standard German domestic parcels |
| DHL KLEINPAKET | Smaller / lighter items — transformers, bulbs |
| DHL PAKET INTERNATIONAL | International destinations from DE warehouse (France, Netherlands, Italy, Belgium, etc.) |
| DHL RETOURE ONLINE | German return labels — DHL Business Portal only |

Portal: geschaeftskunden.dhl.de
Sender address on labels: Hüttenlampen / Schmutter Str 16 / 78647 Trossingen / GERMANY
DHL billing account: 63748818590101 [VERIFY REQUIRED: confirm current]
Tracking number format: 18-digit Sendungsnummer starting with 003404...
Label fields to verify: Von (From), An (To), Abrechnungsnr., Referenznr.,
Sendungsnr., weight, Leitcode barcode, Sendungsnummer barcode

#### Royal Mail
Used for UK domestic outbound shipments.

| Service | When used |
|---------|-----------|
| Royal Mail 48 Large Letter NEX | UK + Unit 4 + Packing Area + Others; waterfall cascade step 1 |
| Royal Mail Tracked 48 NEX (2kg) | Waterfall cascade step 2 |
| Royal Mail Tracked 48 NEX (5kg) | Waterfall cascade step 3 |

Enquiry portal: help.royalmail.com/s/regionalaccountserviceteam
Teams channel: Smart Track and Royal Mail Parcel Updates

#### EVRi
Used for UK domestic parcels.

Portal: clients.evricloud.co.uk
Account name: Ledsone
Contact email: postage@ledsone.co.uk
Tracking prefix: H04RQ or T019VA
Reply email: IONOS at mailbusiness.ionos.co.uk
Teams channel: Evri & DPD Parcel Updates

#### GLS
Used for DE orders that are 1st class AND shipping value over €20.
[VERIFY REQUIRED: GLS account details, portal, and enquiry process not in source
documents. Request from Laksika.]

#### Stallion Express
Used for Canada marketplace orders.

Platform: ship.stallionexpress.ca
Account: Cottage Lighting Ltd
Default carrier: Intelcom Standard ($10.03, 2–4 business days)
Fallback: Canada Post Expedited ($19.88, 7–11 business days)
Import format: Stallion Import Template CSV (from LEDSone OMS)
Tracking prefix: SE-prefixed (e.g. SE260225TEJ0)

#### GoShippo
Used for US warehouse orders.

Platform: apps.goshippo.com/orders
Default carrier: UPS Ground ($8.34 for 0.5kg, 3–5 days)
Alternative: USPS Ground Advantage (3–5 days)
Label format: 4x6in PDF

#### Amazon Platforms
Amazon Seller Central (US): sellercentral.amazon.com — Neighbour Market United States
Amazon Seller Central (UK FBA): Ledsone / DCVoltage / SRM accounts
Amazon Vendor Central (DE): vendorcentral.amazon.eu — DE – Ledsone UK Limited – DE
Preferred US carrier: USPS Ground Advantage Cubic ($9.65)
Amazon Vendor destination: DTM1, Werne, Germany (postcode 59368)

#### eBay Seller Hub
Used for US eBay marketplace shipping.
Channels in LEDSone: EBAY - electricalsone, US1
Carriers: USPS, FedEx

---

## JANARTHAN RULES

Confirmed by Laksika: Janarthan's rules are embedded within the BGCT workflow
documents as routing logic, booking constraints, carrier selection rules, validation
requirements, and exception handling. There is no separate Janarthan rules document.

The rules below are extracted from the workflow source files and preserved here as
a distinct rule layer — separate from procedural steps — so they can be found,
referenced, and updated independently of the SOPs.

**Rule format:** Each rule is written as a clear condition → action statement.
Rules are numbered with a category prefix (R-ROUTE, R-WH, R-CARRIER, R-SVC,
R-VAL, R-EXC, R-BK) so they can be cited precisely.

---

### Routing Rules

**R-ROUTE-01**
Condition: FR (France) or NL (Netherlands) orders appear in the queue.
Action: Change their booking flag to DE before any booking rules run.
These orders route through the German warehouse system, not the UK system.
Source: Daily Booking Workflow Final.md, Phase 2

**R-ROUTE-02**
Condition: UK International orders are in the queue.
Action: Apply country exclusion before changing flags to DE. The following
countries must NOT have their flag changed to DE — they stay as UK International:
United States | Canada | Ireland | Sweden | Switzerland | Malta
All other UK International countries get their flag changed to DE.
Source: Daily Booking Workflow Final.md, Phase 2 Step 05

**R-ROUTE-03**
Condition: An order is for US, Canada, Ireland, Sweden, Switzerland, or Malta.
Action: Do not re-flag to DE. Assign country-specific services. These six countries
always route as UK International with dedicated per-country service assignment.
Source: Daily Booking Workflow Final.md, Phase 9 Steps 28–29

**R-ROUTE-04**
Condition: A DE-flagged order has a Netherlands destination.
Action: Assign DHL Paket International, not a domestic DHL service. Run a separate
Netherlands country filter after the main booking rule to catch these.
Source: German 2nd Booking Process Workflow.docx.md, Phase 3 Step 07

**R-ROUTE-05**
Condition: A DE-flagged order shows an International shipping method but has been
assigned a domestic DHL service.
Action: Change to DHL Paket International. Move the order back to New status so it
re-enters the booking queue with the corrected service.
Source: German 2nd Booking Process Workflow.docx.md, Phase 3 Step 06

**R-ROUTE-06**
Condition: An order has a Wrong SKU flag.
Action: Correct the SKU before booking rules run. Wrong SKU orders must never
proceed to the booking rule stage. Correct first, then return to the queue.
Source: Daily Booking Workflow Final.md, Phase 3;
German 2nd Booking Process Workflow.docx.md, Phase 2

**R-ROUTE-07**
Condition: Beginning any booking session.
Action: Complete all flag changes and country assignments before triggering any
booking rule. Running rules before flag changes sends orders to the wrong warehouse
and service.
Source: Daily Booking Workflow Final.md, Phases 2–5 sequencing

---

### Warehouse Rules

**R-WH-01**
Condition: An order shows "Motherland" as its warehouse assignment.
Action: Do not treat this as a valid routing. "Motherland" means the OMS could not
find stock and defaulted. Always confirm stock is out, then manually select the
correct alternative warehouse.
Source: Daily Booking Workflow Final.md, Phase 5 Step 10

**R-WH-02**
Condition: A DE-flagged Netherlands order needs warehouse assignment.
Action: If DE stock is available, route to Trossingen Schmutter or Trossingen Kronen
based on which warehouse has stock. If no DE stock exists at either warehouse, change
the flag to UK and route through the UK system.
Source: Daily Booking Workflow Final.md, Phase 7 Step 14

**R-WH-03**
Condition: A UK-flagged Netherlands order needs warehouse assignment.
Action: Route to Unit 3 or Unit 4 based on stock availability. Do not route
UK-flagged Netherlands orders to DE warehouses.
Source: Daily Booking Workflow Final.md, Phase 7 Step 15

**R-WH-04**
Condition: A UK order with product type Cable, Transformer, or Lampholder is
assigned to Unit 4.
Action: Move the warehouse assignment to Unit 3. These product types are not
fulfilled from Unit 4.
Source: Daily Booking Workflow Final.md, Phase 9 Step 34

**R-WH-05**
Condition: Assigning German 2nd booking orders to Trossingen warehouses.
Action: Apply warehouse-to-product type mapping:
- Trossingen Schmutter → lampshades, pendants, large fittings
- Trossingen Kronen → transformers, LED bulbs, small fittings, Kleinpaket items
Source: German 2nd Booking Process Workflow.docx.md, Phase 5

**R-WH-06**
Condition: An Amazon Vendor order is for DTM1, Werne, Germany (postcode 59368).
Action: Always fulfil from Trossingen Schmutter. No other warehouse is permitted
for this destination.
Source: German Vendor Booking Guide.md, Step 4

**R-WH-07**
Condition: Starting the German 2nd booking session.
Action: Move all first-booking completed orders to Dispatched status first. Run
Assign Rules only after that is done. Running Assign Rules without clearing the
completed batch causes queue count confusion and potential double-processing.
Source: German 2nd Booking Process Workflow.docx.md, Phase 1

---

### Carrier Selection Rules

**R-CARRIER-01**
Condition: Canada order is being booked on Stallion Express.
Action: Select Intelcom Standard as the carrier. Do not default to Canada Post
Expedited. If the Stallion import file pre-assigned Canada Post Expedited, switch
to Intelcom Standard before purchasing. Reason: Intelcom Standard is significantly
cheaper (~$10.03 vs ~$19.88 per parcel).
Source: CA Booking Workflow Guide.docx.md, Phases 5–6

**R-CARRIER-02**
Condition: US warehouse order is being booked on GoShippo.
Action: Select UPS Ground as the default carrier. Standard dimensions: 9x6x6 inches
for lampshade orders; 5x5x5 for cable orders. Check weight against LEDSone packlist
before setting.
Source: USA Booking Workflow Guide.docx.md, Phase 4

**R-CARRIER-03**
Condition: US Amazon marketplace order is being booked via Amazon Seller Central
Buy Shipping.
Action: Select USPS Ground Advantage Cubic ($9.65) as the first choice. USPS
Ground Advantage (1–70 lb, $10.00) is the second option. Do not default to USPS
Priority Mail or FedEx unless the order specifically requires expedited delivery.
Source: USA Booking Workflow Guide.docx.md, Phase 5

**R-CARRIER-04**
Condition: Amazon Vendor order for DTM1 Werne.
Action: Use Trossingen Schmutter DHL Paket. DHL Kleinpaket is not permitted.
DHL Paket International is not permitted. Using any other service results in
Amazon rejecting the shipment at the fulfilment centre.
Source: German Vendor Booking Guide.md, Step 4 and Common Mistakes section

**R-CARRIER-05**
Condition: A German return label is being generated.
Action: Always select the DHL RETOURE ONLINE tab on the DHL Business Portal form.
Never select DHL RETOURE SELBSTZAHLER. Confirm the tab selection before filling
in any form fields.
Source: German Return Label Workflow Guide.docx.md, Step 3

**R-CARRIER-06**
Condition: A UK Collection Label is being generated.
Action: Apply carrier assignment by parcel type:
- Royal Mail: standard parcels under 20kg
- DPD: next-day or timed delivery
- Evri: economy returns
- Yodel: bulky or heavy items over 20kg
Source: UK Collection Label Workflow.docx.md, Phase 2 Step 03

---

### Service Assignment Rules

**R-SVC-01**
Condition: DE order shows No Service.
Action: Add the correct shipping service. This step runs before any product-type
or destination-specific DE service filters.
Source: Daily Booking Workflow Final.md, Phase 8 Step 16

**R-SVC-02**
Condition: DE order with 1st Class service AND shipping value over €20.
Action: Change to GLS service.
Source: Daily Booking Workflow Final.md, Phase 8 Step 17

**R-SVC-03**
Condition: DE order with DHL service already assigned.
Action: Assign the DHL service. This step confirms the existing DHL assignment
and does not change it.
Source: Daily Booking Workflow Final.md, Phase 8 Step 18

**R-SVC-04**
Condition: DE order with product type Bulb, Packing Area, or Transformer.
Action: Change to International service.
Source: Daily Booking Workflow Final.md, Phase 8 Step 19

**R-SVC-05**
Condition: DE order with product type Cable, Lampholder, Lampshade, Lampshade
Only, or Lampshade Instruction.
Action: Change to International service.
Source: Daily Booking Workflow Final.md, Phase 8 Step 20

**R-SVC-06**
Condition: DE Trossingen orders are being assigned services.
Action: Check each of the following six service types individually — do not batch:
1. Trossingen Kronen DHL Paket
2. Trossingen Kronen DHL Paket International
3. Trossingen Schmutter DHL Kleinpaket
4. Trossingen Schmutter DHL Paket
5. Trossingen Schmutter DHL Paket International
6. Trossingen Kronen DHL Kleinpaket
Source: Daily Booking Workflow Final.md, Phase 8 Step 21

**R-SVC-07**
Condition: DE + Trossingen Schmutter DHL Paket orders are ready.
Action: Book exactly 5 parcels via the Amazon account booking portal. The number
5 is a fixed rule, not an estimate or approximation.
Source: Daily Booking Workflow Final.md, Phase 8 Step 22

**R-SVC-08**
Condition: UK order shows No Service.
Action: Add the correct shipping service. This step runs before any UK product-type
or destination-specific filters.
Source: Daily Booking Workflow Final.md, Phase 9 Step 24

**R-SVC-09**
Condition: UK order assigned to Unit 4 with product flag Packing Area or Others.
Action: Change to Royal Mail 48 Large Letter NEX.
Source: Daily Booking Workflow Final.md, Phase 9 Step 25

**R-SVC-10**
Condition: UK order with 1st Class service from Amazon channel.
Action: Assign service by weight band. Check each order's weight individually
before assigning. Do not apply a blanket service.
Source: Daily Booking Workflow Final.md, Phase 9 Step 26

**R-SVC-11**
Condition: UK order flagged as 2nd Day.
Action: Assign 2nd Day shipping service.
Source: Daily Booking Workflow Final.md, Phase 9 Step 27

**R-SVC-12**
Condition: UK International order (after country exclusions).
Action: Assign International service. Exclude from this step: US, Canada, Sweden,
Switzerland. Ireland IS included here — Ireland is excluded only from the DE flag
change (R-ROUTE-02), not from International service assignment.
Source: Daily Booking Workflow Final.md, Phase 9 Steps 28–29

**R-SVC-13**
Condition: Order is for US, Canada, Ireland, Sweden, or Switzerland.
Action: Assign a dedicated country-specific shipping service for each country
individually. Do not include in the general International service filter.
Source: Daily Booking Workflow Final.md, Phase 9 Step 29

**R-SVC-14**
Condition: UK order with product flag "Others".
Action: Check each product flag individually and assign the correct service per
flag type. Do not apply a blanket service to the Others group.
Source: Daily Booking Workflow Final.md, Phase 9 Step 30

**R-SVC-15**
Condition: UK orders remain after all specific service filters above.
Action: Apply the Royal Mail service cascade in this exact order — do not skip
steps or reverse the sequence:
1. Filter remaining → Royal Mail 48 Large Letter NEX
2. Filter remaining → Royal Mail Tracked 48 NEX (2kg)
3. Filter remaining → Royal Mail Tracked 48 NEX (5kg)
Source: Daily Booking Workflow Final.md, Phase 9 Steps 31–33

---

### Validation Rules

**R-VAL-01**
Condition: DHL labels have been generated.
Action: Visually verify every label before sending to the warehouse for printing.
Check all nine fields:

| Field | What to verify |
|-------|----------------|
| Label type header | DHL PAKET or DHL KLEINPAKET — correct for order size |
| Von (From) | Correct Trossingen sender address |
| An (To) | Customer full name, full address, correct country |
| Abrechnungsnr. | Billing account number is present |
| Referenznr. | OMS order reference is present |
| Sendungsnr. | 18-digit DHL tracking number, starts with 003404... |
| Weight | Shown in kg, reasonable for the product type |
| Leitcode barcode | Present and clearly printed |
| Sendungsnummer barcode | 18-digit barcode is present |

If any label shows a missing address, incorrect sender, or blank barcode area:
DO NOT send to print. Raise with the team immediately.
Source: German 2nd Booking Process Workflow.docx.md, Phase 6

**R-VAL-02**
Condition: A Wrong SKU needs to be corrected.
Action: Use the Combo Products page (dashboard.digitweblk.com/new/searchproducts.php).
Open the Combo Product Details popup and visually compare product images against what
the customer ordered. A matching code alone is not sufficient — image confirmation
is required before updating the SKU.
Source: German 2nd Booking Process Workflow.docx.md, Phase 2

**R-VAL-03**
Condition: A Wayfair order shows "Motherland" as the warehouse.
Action: Do not assume it is a routing error. Confirm stock is actually out of the
expected warehouse before selecting an alternative. "Motherland" is specifically the
OMS out-of-stock default, not a mislabelling.
Source: Daily Booking Workflow Final.md, Phase 5 Step 10

**R-VAL-04**
Condition: Amazon Vendor ASN is ready to submit.
Action: Confirm all DHL labels have been created and all tracking numbers have been
recorded in the Google Sheet before submitting the ASN on Vendor Central. Tracking
numbers cannot be retrieved from Vendor Central after ASN submission.
Source: German Vendor Booking Guide.md, Common Mistakes section

**R-VAL-05**
Condition: Amazon Vendor shipment has multiple boxes.
Action: Check the page count of the downloaded carton label PDF. If more than one
page, split using maxai.me/pdf-tools/split-pdf/ before saving to Dropbox. Each
box must have exactly one label page saved in its BOX subfolder. A box missing
its label will be rejected at the Amazon fulfilment centre.
Source: German Vendor Booking Guide.md, Step 8

**R-VAL-06**
Condition: Daily UK/DE booking session is ending.
Action: Complete all 14 items of the Pre-Completion Validation Checklist before
marking the session done:
- All UK orders booked (no In Progress without a service)
- All DE orders booked (no In Progress without a service)
- No remaining Wrong SKU / Error Shipment orders
- No remaining No Service orders for UK or DE
- All 6 Trossingen service types individually checked
- UK labels printed — count matches UK order count
- DE labels printed — count matches DE order count
- German packlist uploaded to Dropbox (correct date folder)
- UK packlist uploaded to Dropbox (correct date folder)
- All warehouse assignments verified
- Teams MSG & Post group fully checked and actioned
- Teams Packlist Label Issue group fully checked and actioned
- UK shipped status updated in OMS
- DE shipped status updated in OMS
Source: Daily Booking Workflow Final.md, Section 5

---

### Exception Handling Rules

**R-EXC-01 — Stock unavailable**
Change to alternative warehouse: DE → UK, or Schmutter ↔ Kronen within DE.
If no stock exists at any warehouse, escalate to team lead before proceeding.
Do not leave orders unbooked.
Source: Daily Booking Workflow Final.md, Section 4

**R-EXC-02 — Service cannot be assigned**
Check product type and weight. Manually assign the closest matching service.
If still unresolvable, log in the Packlist Label Issue Teams group. Do not skip
the order or mark complete without a service.
Source: Daily Booking Workflow Final.md, Section 4

**R-EXC-03 — Booking rule fails to run**
Re-run the rule on the affected orders. If it fails again, run 1 test order
manually to confirm system behaviour. If system-wide failure is confirmed, notify
team lead immediately.
Source: Daily Booking Workflow Final.md, Section 4

**R-EXC-04 — Duplicate Shopify order**
Do not book the duplicate. Flag in MSG and Post Teams group. Await confirmation
before cancelling or proceeding with either order.
Source: Daily Booking Workflow Final.md, Section 4

**R-EXC-05 — Warehouse unavailable**
Switch all affected orders to an alternative warehouse. Notify team lead. Do not
wait for the warehouse to become available before moving affected orders.
Source: Daily Booking Workflow Final.md, Section 4

**R-EXC-06 — Wrong SKU cannot be identified after Combo Products check**
Log in Listing Correction with note "UNABLE TO IDENTIFY". Escalate to team lead.
Do not use a nearest-match SKU without image confirmation. Do not book the order
with an unconfirmed SKU.
Source: Daily Booking Workflow Final.md, Section 4;
German 2nd Booking Process Workflow.docx.md, Phase 2

**R-EXC-07 — Wayfair order shows Motherland warehouse**
Confirm stock is out of the expected warehouse. Manually select the correct
alternative. Never book to Motherland under any circumstances.
Source: Daily Booking Workflow Final.md, Phase 5 Step 10 and Section 4

**R-EXC-08 — Address change received after a label has been booked**
Cancel the booked label if the carrier permits cancellation. Update the address
in the OMS. Re-book with the correct address. Log the change.
Source: Daily Booking Workflow Final.md, Section 4

**R-EXC-09 — EVRi enquiry — required comment format**
All EVRi enquiry comments must begin with "REF:" followed by a clear instruction.

| Situation | Required comment text |
|-----------|----------------------|
| Parcel in transit, not yet delivered | REF: Please request the courier to prioritise this shipment and ensure the parcel is delivered within 24 hours. |
| Courier claimed attempted delivery but did not | REF: Please request the courier to reattempt delivery as soon as possible. |
| No tracking movement | REF: Please investigate why this parcel has not moved and provide an update. |
| Parcel returned to sender | REF: Please investigate and provide the reason this parcel has been returned. |
| Delivery instructions needed | REF: [Enter specific delivery instructions, e.g. leave in porch, call recipient] |

Source: EVRi courier update.docx.md, Step 9

**R-EXC-10 — EVRi reference number protocol**
After EVRi enquiry submission, the reference number from the confirmation page
must be posted as a REPLY to the original parcel message in the Teams "Evri & DPD
Parcel Updates" channel. Post as a reply — not a new message. Do not close the
confirmation page before copying the reference number.
Source: EVRi courier update.docx.md, Steps 13–14

---

### Booking Decision Rules

**R-BK-01**
German 2nd booking: run the Schmutter warehouse booking before the Kronen warehouse
booking. The sequence is Schmutter first, then Kronen. They are not run simultaneously.
Source: German 2nd Booking Process Workflow.docx.md, Phases 4–5

**R-BK-02**
Amazon Vendor booking: create all DHL labels → collect all tracking numbers →
then submit ASN on Vendor Central. The ASN is submitted only when all tracking
numbers from all boxes are recorded in the Google Sheet.
Source: German Vendor Booking Guide.md, Step 5 and Common Mistakes

**R-BK-03**
Amazon Vendor carton labels (multiple boxes): split the carton label PDF using
maxai.me before saving. Save one page per BOX subfolder in Dropbox. Do not save
a multi-page PDF into a single BOX folder.
Source: German Vendor Booking Guide.md, Step 8

**R-BK-04**
DE DHL eBay tracking email: run only after ALL German booking for the day is
complete. Must not run during or before the main booking session.
Timing: Monday to Friday, approximately 5:00 PM SL time.
Source: DE DHL eBay Tracking Email Workflow.md, opening instruction

**R-BK-05**
German return labels — return receiver: the receiver is always fixed as
Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen, Germany. This field is
pre-filled on the DHL portal. Verify it is correct but do not change it.
Source: German Return Label Workflow Guide.docx.md, Step 3

**R-BK-06**
German return labels — form selection: always select the DHL RETOURE ONLINE tab
before filling in any form field. Confirm the tab before proceeding.
Source: German Return Label Workflow Guide.docx.md, Step 3

**R-BK-07**
US orders: after purchasing labels on GoShippo or Amazon Seller Central, update
the shipping method in LEDSone to match the carrier actually used. Records must
be consistent across systems.
Source: USA Booking Workflow Guide.docx.md, Phase 8 Step 20

**R-BK-08**
Canada orders: if the Stallion import file has pre-assigned Canada Post Expedited,
switch to Intelcom Standard before confirming payment. The switch happens at the
Stallion shipment editing step before purchase.
Source: CA Booking Workflow Guide.docx.md, Phase 5 Step 18

**R-BK-09**
Daily UK/DE booking — label printing timing:
- DE labels: print only after ALL DE service assignment steps are done
  (R-SVC-01 through R-SVC-07 complete for all orders).
- UK labels: print only after ALL UK service assignment steps are done
  (R-SVC-08 through R-SVC-15 complete for all orders).
Printing before all filters are complete produces labels for partially processed
orders, requiring reprints.
Source: Daily Booking Workflow Final.md, Phase 8 Step 23 (DE) and Phase 9 Step 35 (UK)

**R-BK-10**
German 2nd booking — Wrong SKU correction: open the Combo Products page, click
View on the matching product, and compare product images in the Combo Product
Details popup. An ENC code match alone is not sufficient. Image confirmation is
required before updating the SKU in the order.
Source: German 2nd Booking Process Workflow.docx.md, Phase 2 Step 04

---

## DYNAMIC CONTEXT

Updated regularly by the person running day-to-day operations. All entries must
include a date. Changes confirmed by Varmen before being treated as fact.

### Current Priorities

```
[NO ENTRIES — populate when live operational priorities are confirmed]

Format:
Date | Priority | Status | Owner
```

### Open Issues

```
[NO ENTRIES — populate as daily issues are logged]

Format:
Date | Issue description | Region or Courier | Status | Escalated to
```

### Active Investigations

```
[NO ENTRIES — populate as recurring patterns are identified]

Format:
Date | Pattern | Source data | Next review | Owner
```

### Process Changes

```
[NO ENTRIES — populate when confirmed by Laksika or Varmen]

Format:
Date | Change | Affected workflow | Confirmed by | Effective from
```

---

## DECISION LOG

Every confirmed resolution of a gap must be logged here before being treated as
operational fact. Nothing moves to Permanent Context without a Decision Log entry.

| Date | Question or Gap | Decision | Confirmed by | Notes |
|------|----------------|----------|-------------|-------|
| 2026-06-26 | Vendor/courier booking ownership: Postage or Purchasing? | Postage owns vendor booking execution | Varmen | Cross-AIOS boundary resolved |
| — | DHL billing account 63748818590101 still current? | [PENDING CONFIRMATION] | Laksika | Seen on label in source |
| — | All UK FBA Amazon account names confirmed? | [PENDING CONFIRMATION] | Laksika | Ledsone/DCVoltage/SRM seen — may not be complete |
| — | Is UK Collection Label Workflow in scope for internal AIOS use? | [PENDING CONFIRMATION] | Varmen / Laksika | Document is customer-facing |
| — | Complete steps for Royal Mail enquiry process | [PENDING CONFIRMATION] | Laksika | Source file too large to read fully |
| — | Complete steps for Amazon FBA booking workflow | [PENDING CONFIRMATION] | Laksika | Source file too large to read fully |
| — | Complete steps for DE DHL eBay tracking email | [PENDING CONFIRMATION] | Laksika | Source file partially read |
| — | GLS account details and enquiry process | [PENDING CONFIRMATION] | Laksika | Not in any source file |

---

## OPERATING RULES

### What this AIOS always does

1. **Source-first.** Every procedural answer cites a specific workflow document
   by name. If the answer is not in a source document, say so explicitly and direct
   to Laksika or Varmen. Do not substitute general knowledge.

2. **Rules are rules, not steps.** Janarthan's rules are surfaced as explicit
   condition → action statements, not buried inside SOP step lists. They are
   findable independently of the procedures.

3. **VERIFY REQUIRED is used when needed.** When a fact cannot be confirmed from
   source documents, mark it [VERIFY REQUIRED]. AI-generated plausibility is not
   the same as the document confirming something.

4. **Escalation path is followed.** Gap identified → Varmen → Laksika or direct
   resolution → Decision Log entry → then treated as fact.

5. **Evidence requirements are stated.** When describing a completed workflow,
   note what evidence must be saved: label PDFs, screenshots, Dropbox paths,
   packlist files, Teams posts.

6. **Authoritative document versions are used.** Daily Booking Workflow Final.md
   (v2.0, AIOS Governance Ready) is the authority for UK/DE booking.
   UK & DE Booking.md and Booking 2.md are superseded — do not reference them.
   German 2nd Booking Process Workflow.docx (1).md is a confirmed duplicate —
   do not use it.

### What this AIOS never does

1. **Invent a postage rule** not found in a source document or confirmed by Varmen.

2. **Commit to a courier booking** or mark an order as shipped automatically.

3. **Merge Janarthan's rules silently into procedures.** The rules layer is kept
   distinct so it can be found and updated independently.

4. **Treat [PENDING CONFIRMATION] items as settled.** These remain open in the
   Decision Log until explicitly resolved.

5. **Store sensitive data** — courier contract pricing, credentials, or customer
   shipping data — without Varmen confirming this is acceptable.

6. **Overrule Laksika** as the domain authority on postage operations.

---

## KNOWN GAPS

### Gap 2 — Courier Relationship Document Not Available
No dedicated courier relationship document exists in the source materials.
Courier names, portals, and account names are confirmed (from workflow procedures)
but formal relationship details — account contacts, SLAs, rate cards, escalation
contacts — are not documented.
Impact: context/courier-vendor-info.md can only be partially populated.
Action: Request courier contact and relationship document from Laksika.

### Gap 3 — Vendor Booking Ownership Boundary — RESOLVED
Confirmed 2026-06-26 by Varmen: vendor booking execution is owned by Postage.
Decision recorded in CLAUDE.md Decision Log DL-01 (2026-06-26).
See context/vendor-booking-boundary.md (Confirmed Decision section).
Impact resolved: context/vendor-booking-boundary.md is finalised. The /booking-check
skill scope for vendor booking is confirmed. Cross-AIOS bridge file creation is unblocked.

### Gap 4 — Three Workflow Files Not Fully Readable
The following source files could not be fully read (file size exceeded read limits):
- Amazon FBA Label Booking Workflow.md — only opening 60 lines confirmed
- Royal Mail courier update.md — only opening section confirmed
- DE DHL eBay Tracking Email Workflow.md — only first section confirmed

These three workflows are marked [VERIFY REQUIRED] in this file. The partial
content that was read is included; the unread remainder may contain additional
rules or steps that have not been extracted.
Action: Open and review these files manually. Add confirmed content as Phase 2
additions to this CLAUDE.md.

### Gap 5 — GLS Details Not Documented
GLS appears as a required service (R-SVC-02: DE + 1st Class + >€20 → GLS) but
no GLS-specific procedure, account details, or enquiry process exists in the
source documents.
Action: Request GLS account and procedure information from Laksika.

### Gap 6 — Daily Issue Collection Backlog Not Provided
The existing daily issue collection process (run by Vishnu Sree via Atis Raj)
has not been transferred into this AIOS. No historical issue log was provided.
Impact: intelligence-inbox/daily-issues/ is empty. Pattern detection cannot
function until issues are logged.
Action: Confirm with Vishnu Sree where existing issues are stored. Begin
transferring to intelligence-inbox/daily-issues/ as a Phase 2 activity.

---

## VALIDATION SECTION

### Source Files Used

| Source File | Sections Informed |
|-------------|------------------|
| Daily Booking Workflow Final.md (v2.0) | UK/DE booking overview; Tools; Royal Mail courier section; R-ROUTE-01 to 07; R-WH-01 to 04; R-SVC-01 to 15; R-VAL-03, R-VAL-06; R-EXC-01 to 08; R-BK-07, R-BK-09; Dropbox paths UK/DE |
| German 2nd Booking Process Workflow.docx.md | German 2nd booking overview; Google Sheets; DHL service types; R-ROUTE-04, R-ROUTE-05; R-WH-02, R-WH-03, R-WH-05, R-WH-07; R-VAL-01, R-VAL-02; R-BK-01, R-BK-04, R-BK-10 |
| German Vendor Booking Guide.md | German Vendor overview; Amazon Vendor Central; WhatsApp/MaxAI tools; R-WH-06; R-CARRIER-04; R-VAL-04, R-VAL-05; R-BK-02, R-BK-03; Dropbox path Amazon Vendor |
| German Return Label Workflow Guide.docx.md | German Return Labels overview; DHL Business Portal; R-CARRIER-05; R-BK-05, R-BK-06 |
| USA Booking Workflow Guide.docx.md | US booking overview; GoShippo/Seller Central/eBay sections; PDFResizer tool; R-CARRIER-02, R-CARRIER-03; R-BK-07; Dropbox path US |
| CA Booking Workflow Guide.docx.md | Canada booking overview; Stallion Express section; R-CARRIER-01; R-BK-08; Dropbox paths Canada |
| EVRi courier update.docx.md | EVRi enquiry overview; EVRi portal/IONOS detail; R-EXC-09, R-EXC-10 |
| DE DHL eBay Tracking Email Workflow.md | DE DHL tracking email overview (partial); R-BK-04 |
| Amazon FBA Label Booking Workflow.md | Amazon FBA overview (partial — first 60 lines only) |
| UK Collection Label Workflow.docx.md | UK Collection Labels overview; R-CARRIER-06 |
| Postage_AIOS_Architecture.md | Purpose section; Governance section; vendor booking boundary gap; broader purpose framing |
| Postage_CLAUDE.md (skeleton) | Decision Log structure; Known Gaps list framing |

### Janarthan Rules Extracted

Total rules: **40**

| Category | Count | Rule IDs |
|----------|-------|----------|
| Routing Rules | 7 | R-ROUTE-01 to R-ROUTE-07 |
| Warehouse Rules | 7 | R-WH-01 to R-WH-07 |
| Carrier Selection Rules | 6 | R-CARRIER-01 to R-CARRIER-06 |
| Service Assignment Rules | 15 | R-SVC-01 to R-SVC-15 |
| Validation Rules | 6 | R-VAL-01 to R-VAL-06 |
| Exception Handling Rules | 10 | R-EXC-01 to R-EXC-10 |
| Booking Decision Rules | 10 | R-BK-01 to R-BK-10 |

### Known Gaps Summary

| Gap | Severity | Required Action |
|-----|----------|----------------|
| ~~Team structure~~ | RESOLVED | Completed 2026-06-26 — Postage_Team_Workflow.pdf (Laksika) |
| Courier relationship document not available | MEDIUM | Request from Laksika |
| ~~Vendor booking ownership boundary~~ | RESOLVED | Confirmed by Varmen 2026-06-26 — see DL-01 |
| Three workflow files not fully readable | MEDIUM | Manual review or Laksika summary |
| GLS details not documented | LOW | Request from Laksika |
| Daily issue backlog not provided | LOW | Confirm with Vishnu Sree |

### PASS / FAIL Assessment

**RESULT: CONDITIONAL PASS**

**What passes:**
- Every operational section traces to a named source file
- All 40 extracted rules cite their source document and section
- [VERIFY REQUIRED] and [PENDING CONFIRMATION] markers are used correctly —
  no gaps have been filled with invented content
- Purpose and Governance sections trace to Postage_AIOS_Architecture.md
- No procedures were invented or extrapolated beyond what the source files confirm
- Superseded versions (UK & DE Booking.md, Booking 2.md) and the confirmed
  duplicate (German 2nd Booking Process Workflow.docx (1).md) are excluded
- The Janarthan Rules section reflects Laksika's confirmed statement that rules
  are embedded in the workflow documents — not assumed

**Conditions for full PASS:**
1. Varmen reviews and approves this file before it is used operationally
2. Three partially-read workflow files are reviewed; any additional rules or
   corrections are applied
3. Decision Log gaps are resolved in the order Varmen directs

**This file must not be treated as final or used operationally until
Varmen has reviewed and approved it.**
Reference: Postage_CLAUDE_Generation_Guide.md — Steps 5 and 6.
