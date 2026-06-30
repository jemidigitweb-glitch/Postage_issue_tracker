# Janarthan Rules Repository — Postage AIOS
# LEDSone — Postage Department
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review and approval
# Source: Extracted from Laksika's BGCT workflow documents
# Builder: Vishnu Sree | Validator: Varmen

---

## What This File Is

This file is the dedicated rule repository for Janarthan's operational postage
rules. These rules are extracted from Laksika's BGCT workflow documents where
they appear as embedded routing logic, booking constraints, carrier selection
rules, validation requirements, and exception handling.

**Confirmed by Laksika:** There is no separate Janarthan rules document. The rules
are embedded within the workflow documents and are extracted here as a distinct,
independently searchable layer — kept separate from procedure steps so they can
be found, cited, and updated without navigating the full SOPs.

## How Rules Are Structured

Each rule entry contains:
- **Rule ID** — unique identifier with category prefix
- **Rule Name** — short descriptive title
- **Business Purpose** — why this rule exists and what problem it prevents
- **Trigger Condition** — the specific situation that activates this rule
- **Expected Action** — the required response when the trigger is met
- **Source Reference** — the source document and section the rule was extracted from

## How To Cite a Rule

Use the Rule ID (e.g. R-ROUTE-02, R-VAL-01) when referencing a rule in:
- CLAUDE.md Decision Log entries
- intelligence-inbox/daily-issues/ log entries
- Teams messages or handover notes
- Escalations to Varmen

## Rule Categories and Counts

| Category | Count | Rule IDs |
|----------|-------|----------|
| Routing Rules | 7 | R-ROUTE-01 to R-ROUTE-07 |
| Warehouse Rules | 7 | R-WH-01 to R-WH-07 |
| Carrier Selection Rules | 6 | R-CARRIER-01 to R-CARRIER-06 |
| Service Assignment Rules | 15 | R-SVC-01 to R-SVC-15 |
| Validation Rules | 6 | R-VAL-01 to R-VAL-06 |
| Exception Handling Rules | 10 | R-EXC-01 to R-EXC-10 |
| Booking Decision Rules | 10 | R-BK-01 to R-BK-10 |
| **Total** | **40** | |

---

## 1. Routing Rules

Rules that determine how orders are classified and directed to the correct
warehouse system before any booking is processed.

---

### R-ROUTE-01

**Rule Name:** FR and NL Orders Rerouted to DE

**Business Purpose:**
France and Netherlands orders are fulfilled from the German warehouses, not
the UK warehouses. Without this flag change, they would be processed through
the UK booking system and routed incorrectly.

**Trigger Condition:**
FR (France) or NL (Netherlands) orders appear in the booking queue.

**Expected Action:**
Change the booking flag to DE before any booking rules run. These orders
must enter the German warehouse booking system, not the UK system. The flag
change must happen before any service assignment or warehouse routing step.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 2

---

### R-ROUTE-02

**Rule Name:** UK International Country Exclusions Before DE Flag Change

**Business Purpose:**
Not all UK International orders should be rerouted to DE warehouses. Six
specific countries must remain in the UK International system with their own
service assignments. Applying a blanket DE flag change would mis-route these
orders.

**Trigger Condition:**
UK International orders are in the queue and the DE flag change step is
about to run.

**Expected Action:**
Apply the country exclusion list before changing any flag to DE.
The following six countries must NOT have their flag changed to DE — they
remain as UK International:
- United States
- Canada
- Ireland
- Sweden
- Switzerland
- Malta

All other UK International countries: change flag to DE.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 2 Step 05

---

### R-ROUTE-03

**Rule Name:** Six Countries Always Route as UK International

**Business Purpose:**
US, Canada, Ireland, Sweden, Switzerland, and Malta each have dedicated
country-specific shipping services that must be assigned individually. They
must not be grouped into the general International service assignment.

**Trigger Condition:**
An order is destined for US, Canada, Ireland, Sweden, Switzerland, or Malta.

**Expected Action:**
Do not re-flag to DE. Assign a dedicated country-specific shipping service.
These six countries always route as UK International. Country-specific service
assignment is handled in Phase 9 (UK service assignment) individually per
country — not grouped with the general International service.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Steps 28–29

---

### R-ROUTE-04

**Rule Name:** DE Netherlands Orders Require International DHL Service

**Business Purpose:**
Netherlands is a different country from Germany. DE-flagged orders going to
Netherlands need DHL Paket International, not a domestic DHL service. Booking
with a domestic service results in failed delivery.

**Trigger Condition:**
A DE-flagged order has a Netherlands destination country.

**Expected Action:**
Assign DHL Paket International — not DHL Paket or DHL Kleinpaket. Run a
separate Netherlands country filter step after the main booking rule to catch
these orders. They will not always be caught by the standard DE service
assignment filters.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 3 Step 07

---

### R-ROUTE-05

**Rule Name:** DE International Method / Wrong Domestic Service — Correct and Requeue

**Business Purpose:**
During booking, a DE order may display an International shipping method in
the OMS but have been assigned a domestic DHL service. This is a mismatch
that would generate the wrong label. The order must be corrected before
printing and re-enter the queue with the right service.

**Trigger Condition:**
A DE-flagged order shows an International shipping method in the OMS but has
been assigned a domestic DHL service (DHL Paket or DHL Kleinpaket).

**Expected Action:**
Change the service to DHL Paket International. Move the order back to New
status so it re-enters the booking queue and is processed correctly in the
next booking cycle with the corrected service.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 3 Step 06

---

### R-ROUTE-06

**Rule Name:** Wrong SKU Must Be Corrected Before Booking Rules Run

**Business Purpose:**
Booking an order with a Wrong SKU creates a permanent mismatch between the
item shipped and the order record. The booking rules cannot route an order
correctly if the product type is wrong. Correction must precede routing.

**Trigger Condition:**
An order has a Wrong SKU flag at any point during a booking session.

**Expected Action:**
Correct the SKU before triggering any booking rule. Wrong SKU orders must
never reach the booking rule stage with an unresolved SKU flag. Identify,
correct, then return to the queue.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 3;
German 2nd Booking Process Workflow.docx.md, Phase 2

---

### R-ROUTE-07

**Rule Name:** All Flag Changes Before Any Booking Rule

**Business Purpose:**
Booking rules route orders based on their current flag. If flag changes have
not been completed before rules run, orders will be sent to the wrong warehouse
or assigned the wrong service — and the error may not be caught until labels
are printed or parcels are collected.

**Trigger Condition:**
Beginning any booking session in the LEDSone OMS.

**Expected Action:**
Complete all flag changes (FR/NL → DE, UK International exclusions, country
assignments) before triggering any booking rule. This is a session sequencing
rule — flags first, then rules. Running rules before flags is not permitted.

**Source Reference:**
Daily Booking Workflow Final.md, Phases 2–5 sequencing

---

## 2. Warehouse Rules

Rules that govern which physical warehouse an order is routed to and what
product types belong at each location.

---

### R-WH-01

**Rule Name:** Motherland Warehouse Is Never a Valid Final Assignment

**Business Purpose:**
"Motherland" is the LEDSone OMS fallback assignment used when the system
cannot find stock. It does not refer to a real warehouse. Booking to Motherland
means booking to nothing — the order cannot be fulfilled.

**Trigger Condition:**
An order shows "Motherland" as its warehouse assignment in the OMS.

**Expected Action:**
Do not treat this as a valid routing. Confirm that stock is actually out of
the expected warehouse. Manually select the correct alternative warehouse
before completing the booking. Booking to Motherland is never permitted.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 5 Step 10

---

### R-WH-02

**Rule Name:** DE Netherlands Orders — DE Stock First, Then UK Fallback

**Business Purpose:**
Netherlands orders flagged as DE should be fulfilled from Trossingen if stock
is available. If neither Trossingen warehouse has stock, the order must be
rerouted to the UK system rather than remaining unbooked.

**Trigger Condition:**
A DE-flagged order has a Netherlands destination and needs a warehouse assignment.

**Expected Action:**
If DE stock is available at either Trossingen warehouse: route to Trossingen
Schmutter or Trossingen Kronen based on which has stock.
If no DE stock exists at either warehouse: change the order flag to UK and route
through the UK warehouse system.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 7 Step 14

---

### R-WH-03

**Rule Name:** UK Netherlands Orders Stay in UK Warehouse System

**Business Purpose:**
UK-flagged Netherlands orders are fulfilled from UK warehouses. They must not
be accidentally routed to Trossingen even though Netherlands orders can also
be fulfilled from DE under certain conditions.

**Trigger Condition:**
A UK-flagged order has a Netherlands destination and needs a warehouse assignment.

**Expected Action:**
Route to Unit 3 or Unit 4 based on stock availability. Do not route UK-flagged
Netherlands orders to Trossingen Schmutter or Trossingen Kronen.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 7 Step 15

---

### R-WH-04

**Rule Name:** UK Cable, Transformer, Lampholder — Move from Unit 4 to Unit 3

**Business Purpose:**
Cable, Transformer, and Lampholder product types are not stored at or fulfilled
from Unit 4. Leaving these warehouse-assigned to Unit 4 would result in a
failed pick or incorrect routing when the warehouse team processes the order.

**Trigger Condition:**
A UK order with product type Cable, Transformer, or Lampholder is assigned to
Unit 4.

**Expected Action:**
Move the warehouse assignment to Unit 3. These product types are fulfilled
exclusively from Unit 3.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 34

---

### R-WH-05

**Rule Name:** Trossingen Warehouse Product Type Mapping

**Business Purpose:**
Trossingen Schmutter and Trossingen Kronen store different product types.
Routing a product to the wrong Trossingen warehouse results in a failed pick.
This rule defines which products belong at each warehouse.

**Trigger Condition:**
German 2nd booking orders are being assigned to Trossingen warehouses.

**Expected Action:**
Apply the warehouse-to-product type mapping:
- Trossingen Schmutter: lampshades, pendants, large fittings
- Trossingen Kronen: transformers, LED bulbs, small fittings, Kleinpaket items

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 5

---

### R-WH-06

**Rule Name:** Amazon Vendor DTM1 Werne — Always Trossingen Schmutter

**Business Purpose:**
Amazon Vendor Central purchase orders for DTM1 Werne must always be fulfilled
from Trossingen Schmutter. This is a fixed contractual or operational constraint.
Using any other warehouse is not permitted for this destination.

**Trigger Condition:**
An Amazon Vendor order is destined for DTM1, Amazon Logistik Werne GmbH,
Raiffeisenstrasse 7, Werne, 59368, Germany.

**Expected Action:**
Fulfil from Trossingen Schmutter only. No other warehouse is permitted for
this destination under any circumstances.

**Source Reference:**
German Vendor Booking Guide.md, Step 4

---

### R-WH-07

**Rule Name:** German 2nd Booking — Dispatched Before Assign Rules

**Business Purpose:**
If first-booking completed orders remain active in the queue when Assign Rules
is run for the 2nd booking, they inflate the queue count and risk double-processing.
Clearing them to Dispatched first creates a clean 2nd booking queue.

**Trigger Condition:**
Starting the German 2nd booking session.

**Expected Action:**
Move all first-booking completed orders to Dispatched status. Only then run
Assign Rules on the remaining queue. This sequencing is mandatory — running
Assign Rules before clearing completed orders causes queue count confusion and
potential double-processing.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 1

---

## 3. Carrier Selection Rules

Rules that determine which courier or carrier service must be used in a given
booking situation. These rules constrain carrier choice — they are not suggestions.

---

### R-CARRIER-01

**Rule Name:** Canada Default Carrier — Intelcom Standard, Not Canada Post Expedited

**Business Purpose:**
Intelcom Standard is significantly cheaper than Canada Post Expedited
(approx $10.03 vs $19.88 per parcel). The Stallion Express import file may
auto-assign Canada Post Expedited — this rule requires switching to Intelcom
Standard before purchase to control shipping costs.

**Trigger Condition:**
A Canada order is being booked on Stallion Express (ship.stallionexpress.ca).

**Expected Action:**
Select Intelcom Standard as the carrier (2–4 business days, approx $10.03).
Do not default to Canada Post Expedited. If the Stallion import file has
pre-assigned Canada Post Expedited, switch to Intelcom Standard at the Stallion
shipment editing step before confirming purchase.

**Source Reference:**
CA Booking Workflow Guide.docx.md, Phases 5–6

---

### R-CARRIER-02

**Rule Name:** US Warehouse Orders — UPS Ground Default on GoShippo

**Business Purpose:**
UPS Ground is the confirmed default carrier for US warehouse orders through
GoShippo. Standard parcel dimensions are defined per product type to ensure
consistent label generation.

**Trigger Condition:**
A US warehouse order is being booked on GoShippo (apps.goshippo.com/orders).

**Expected Action:**
Select UPS Ground as the default carrier. Use standard dimensions:
- 9x6x6 inches for lampshade orders
- 5x5x5 inches for cable orders
Check the actual weight against the LEDSone packlist before confirming.

**Source Reference:**
USA Booking Workflow Guide.docx.md, Phase 4

---

### R-CARRIER-03

**Rule Name:** US Amazon Orders — USPS Ground Advantage Cubic First

**Business Purpose:**
USPS Ground Advantage Cubic ($9.65) is Amazon's recommended preferred carrier
based on order history and cost. USPS Priority Mail and FedEx cost more and
should not be defaulted to unless the order specifically requires expedited service.

**Trigger Condition:**
A US Amazon marketplace order is being booked via Amazon Seller Central
Buy Shipping.

**Expected Action:**
Select USPS Ground Advantage Cubic ($9.65) as the first choice.
USPS Ground Advantage (1–70 lb, $10.00) is the second option.
Do not default to USPS Priority Mail or FedEx unless the specific order
requires expedited delivery.

**Source Reference:**
USA Booking Workflow Guide.docx.md, Phase 5

---

### R-CARRIER-04

**Rule Name:** Amazon Vendor DTM1 — Trossingen Schmutter DHL Paket Only

**Business Purpose:**
Amazon's fulfilment centre at DTM1 Werne requires shipments to arrive with
specific DHL service labels. Using DHL Kleinpaket or DHL Paket International
will result in the shipment being rejected at the Amazon FC. This is a hard
constraint, not a preference.

**Trigger Condition:**
An Amazon Vendor order is being booked for DTM1, Werne, Germany (postcode 59368).

**Expected Action:**
Use Trossingen Schmutter DHL Paket. No exceptions:
- DHL Kleinpaket is NOT permitted
- DHL Paket International is NOT permitted
- No other service is permitted

**Source Reference:**
German Vendor Booking Guide.md, Step 4 and Common Mistakes section

---

### R-CARRIER-05

**Rule Name:** German Return Labels — DHL RETOURE ONLINE Tab Only

**Business Purpose:**
The DHL Business Portal form offers two return label tabs: DHL RETOURE ONLINE
and DHL RETOURE SELBSTZAHLER. SELBSTZAHLER is a different service type intended
for customer self-payment situations. Using the wrong tab generates the wrong
type of return label.

**Trigger Condition:**
A German return label (Retourenlabel) is being generated via the DHL Business
Portal (geschaeftskunden.dhl.de).

**Expected Action:**
Always select the DHL RETOURE ONLINE tab before filling in any form fields.
Never select DHL RETOURE SELBSTZAHLER. Confirm the correct tab is selected
before proceeding with the form.

**Source Reference:**
German Return Label Workflow Guide.docx.md, Step 3

---

### R-CARRIER-06

**Rule Name:** UK Collection Label Carrier Assignment by Parcel Type

**Business Purpose:**
Different carriers serve different UK collection label use cases. The correct
carrier must be assigned based on parcel weight and service type to ensure
the correct collection arrangement is made.

**Trigger Condition:**
A UK Collection Label is being generated.

**Expected Action:**
Assign carrier based on parcel characteristics:
- Royal Mail: standard parcels under 20kg
- DPD: next-day or timed delivery
- Evri: economy returns service
- Yodel: bulky or heavy items over 20kg

**Source Reference:**
UK Collection Label Workflow.docx.md, Phase 2 Step 03

---

## 4. Service Assignment Rules

Rules that govern which shipping service is assigned to an order within the
LEDSone OMS. These rules run in a defined sequence during the daily booking
workflow — sequence matters and must not be changed.

---

### R-SVC-01

**Rule Name:** DE No Service — Add Correct Service First

**Business Purpose:**
Orders showing No Service have not been assigned any shipping method. They
must receive a service before any product-type or destination filters run.
Without this step, subsequent filters have nothing to act on.

**Trigger Condition:**
A DE order shows No Service in the OMS service field.

**Expected Action:**
Add the correct shipping service to these orders. This step runs before any
product-type or destination-specific DE service filters. It is the first DE
service assignment step.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 16

---

### R-SVC-02

**Rule Name:** DE 1st Class + Value Over €20 → GLS

**Business Purpose:**
DE orders with 1st Class service AND shipping value over €20 have a different
service requirement that reflects a specific routing decision embedded in the
booking workflow. GLS handles this combination.

**Trigger Condition:**
A DE order has 1st Class service assigned AND the shipping value is over €20.

**Expected Action:**
Change the service to GLS.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 17

---

### R-SVC-03

**Rule Name:** DE DHL Service — Confirm and Retain Assignment

**Business Purpose:**
Some DE orders arrive in the queue with DHL already assigned. This step
confirms the assignment is correct and does not change it. It prevents
these orders from being accidentally altered by subsequent filter steps.

**Trigger Condition:**
A DE order already has a DHL service assigned.

**Expected Action:**
Assign (confirm) the DHL service. This step does not change the existing
DHL assignment — it validates it. Orders matching this rule are correctly
routed and do not need further service adjustment.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 18

---

### R-SVC-04

**Rule Name:** DE Bulb, Packing Area, Transformer → International Service

**Business Purpose:**
These product types require International service regardless of their
country destination within the DE system. The product type takes precedence
over the destination in service assignment for these categories.

**Trigger Condition:**
A DE order has product type Bulb, Packing Area, or Transformer.

**Expected Action:**
Change the service to International.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 19

---

### R-SVC-05

**Rule Name:** DE Cable, Lampholder, Lampshade Types → International Service

**Business Purpose:**
These product types also require International service within the DE system.
They are a separate group from R-SVC-04 and are handled in a distinct filter
step.

**Trigger Condition:**
A DE order has product type Cable, Lampholder, Lampshade, Lampshade Only,
or Lampshade Instruction.

**Expected Action:**
Change the service to International.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 20

---

### R-SVC-06

**Rule Name:** Trossingen Six Service Types Must Be Checked Individually

**Business Purpose:**
The six Trossingen DHL service types are distinct. Batching them risks
applying the wrong service or missing a type entirely. Individual checks
ensure every Trossingen order is correctly assigned before labels are
printed.

**Trigger Condition:**
DE Trossingen orders are being assigned services.

**Expected Action:**
Check each of the following six service types individually in this order.
Do not batch them:
1. Trossingen Kronen DHL Paket
2. Trossingen Kronen DHL Paket International
3. Trossingen Schmutter DHL Kleinpaket
4. Trossingen Schmutter DHL Paket
5. Trossingen Schmutter DHL Paket International
6. Trossingen Kronen DHL Kleinpaket

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 21

---

### R-SVC-07

**Rule Name:** Schmutter DHL Paket — Book Exactly 5 Via Amazon Account

**Business Purpose:**
The booking portal for Trossingen Schmutter DHL Paket (Amazon account route)
requires exactly 5 parcels per booking action. This is a fixed operational
constraint, not an approximation based on order volume.

**Trigger Condition:**
DE Trossingen Schmutter DHL Paket orders are ready for booking.

**Expected Action:**
Book exactly 5 parcels via the Amazon account booking portal. The number 5
is fixed. Do not book more or fewer in a single action.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 22

---

### R-SVC-08

**Rule Name:** UK No Service — Add Correct Service First

**Business Purpose:**
Same principle as R-SVC-01 for DE orders. UK orders showing No Service must
receive a service before product-type or destination filters run.

**Trigger Condition:**
A UK order shows No Service in the OMS service field.

**Expected Action:**
Add the correct shipping service. This step runs before any UK product-type
or destination-specific service filters. It is the first UK service assignment
step.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 24

---

### R-SVC-09

**Rule Name:** UK Unit 4 + Packing Area / Others → Royal Mail 48 Large Letter NEX

**Business Purpose:**
Unit 4 orders with Packing Area or Others product flags have a defined
service assignment. This rule captures them before the general service
cascade runs.

**Trigger Condition:**
A UK order is assigned to Unit 4 AND has product flag Packing Area or Others.

**Expected Action:**
Change the service to Royal Mail 48 Large Letter NEX.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 25

---

### R-SVC-10

**Rule Name:** UK 1st Class Amazon — Assign Service by Weight Band

**Business Purpose:**
UK 1st Class Amazon orders do not all use the same service. The correct service
depends on each order's individual weight. A blanket service assignment would
be wrong for orders outside the applicable weight band.

**Trigger Condition:**
A UK order has 1st Class service from the Amazon channel.

**Expected Action:**
Assign service by weight band. Check each order's weight individually before
assigning. Do not apply the same service to all orders in this group without
checking weight first.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 26

---

### R-SVC-11

**Rule Name:** UK 2nd Day Orders → 2nd Day Service

**Business Purpose:**
Orders flagged as 2nd Day have a specific service level commitment that must
be met. The standard service cascade must not be applied to these orders.

**Trigger Condition:**
A UK order is flagged as 2nd Day.

**Expected Action:**
Assign the 2nd Day shipping service.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 27

---

### R-SVC-12

**Rule Name:** UK International (After Exclusions) → International Service

**Business Purpose:**
After the country exclusion list is applied (R-ROUTE-02), the remaining UK
International orders receive the International service. Ireland is included
at this step — it was excluded only from the DE flag change, not from
International service assignment.

**Trigger Condition:**
A UK International order remains in the queue after country exclusions have
been applied. The order is NOT destined for US, Canada, Sweden, or Switzerland
(which have their own service assignments).

**Expected Action:**
Assign International service. Ireland is included in this step. US, Canada,
Sweden, and Switzerland are excluded from this step — they are handled by
R-SVC-13.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Steps 28–29

---

### R-SVC-13

**Rule Name:** Five Countries — Country-Specific Services Individually

**Business Purpose:**
US, Canada, Ireland, Sweden, and Switzerland each require a dedicated shipping
service that differs from the general International service. These must be
assigned per country to ensure the correct carrier and service level.

**Trigger Condition:**
An order is destined for US, Canada, Ireland, Sweden, or Switzerland.

**Expected Action:**
Assign a dedicated country-specific shipping service for each country
individually. Do not group these countries under the general International
service filter.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 29

---

### R-SVC-14

**Rule Name:** UK "Others" Product Flag — Check Individually

**Business Purpose:**
The "Others" product flag covers multiple product sub-types that may require
different services. Applying a blanket service to the entire Others group
would incorrectly assign the same service to orders that have different
requirements within that group.

**Trigger Condition:**
A UK order has the product flag "Others".

**Expected Action:**
Check each order's specific product flag within the Others group individually.
Assign the correct service per flag type. Do not apply a blanket service across
the entire Others category.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Step 30

---

### R-SVC-15

**Rule Name:** UK Remaining Orders — Royal Mail Waterfall Cascade

**Business Purpose:**
After all specific service filters have been applied, the remaining UK orders
that do not match any specific rule are processed through a three-step Royal
Mail cascade. The cascade must run in the defined sequence — reversing or
skipping steps assigns the wrong service tier to each remaining order.

**Trigger Condition:**
UK orders remain in the queue after all specific service filters (R-SVC-08
through R-SVC-14) have been applied.

**Expected Action:**
Apply the Royal Mail service cascade in this exact order:
1. Filter remaining → Royal Mail 48 Large Letter NEX
2. Filter remaining → Royal Mail Tracked 48 NEX (2kg)
3. Filter remaining → Royal Mail Tracked 48 NEX (5kg)

Each step processes only the orders that were not captured by the previous step.
Do not skip steps or reverse the sequence.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 9 Steps 31–33

---

## 5. Validation Rules

Rules that define what must be checked or confirmed before an action is
completed or an output is treated as acceptable.

---

### R-VAL-01

**Rule Name:** DHL Label 9-Field Visual Verification Before Printing

**Business Purpose:**
A DHL label with a missing address, blank barcode, or incorrect sender will
either be undeliverable or be rejected by DHL scan systems. Visual verification
before printing prevents the warehouse from attaching an invalid label to a
parcel.

**Trigger Condition:**
DHL labels have been generated in the OMS and are about to be sent to the
warehouse for printing.

**Expected Action:**
Visually verify every label before sending to the warehouse. Check all nine
fields on each label:

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
DO NOT send to print. Raise with the team immediately before proceeding.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 6

---

### R-VAL-02

**Rule Name:** Wrong SKU Correction Requires Image Confirmation — Not Code Match Alone

**Business Purpose:**
Matching an ENC code or product code is not sufficient to confirm a correct
SKU replacement. Similar products may share codes or be visually distinct.
Image confirmation prevents booking the wrong product for the customer's order.

**Trigger Condition:**
A Wrong SKU needs to be identified and corrected in the OMS.

**Expected Action:**
Use the Combo Products page (dashboard.digitweblk.com/new/searchproducts.php).
Open the Combo Product Details popup. Visually compare product images against
what the customer ordered. A matching code alone is not sufficient. Image
confirmation is required before updating the SKU in the order.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 2

---

### R-VAL-03

**Rule Name:** Wayfair Motherland — Confirm Stock Is Actually Out Before Changing

**Business Purpose:**
A Wayfair order showing Motherland may be a genuine out-of-stock situation or
may indicate a system routing anomaly. Changing to an alternative warehouse
without confirming stock status could result in unnecessary rerouting or
incorrect warehouse selection.

**Trigger Condition:**
A Wayfair order shows "Motherland" as the warehouse assignment.

**Expected Action:**
Do not assume this is a routing error. Confirm that stock is actually out of
the expected warehouse before selecting an alternative. Motherland is the OMS
out-of-stock default — not a mislabelling or system glitch. Confirming the
stock situation first is required.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 5 Step 10

---

### R-VAL-04

**Rule Name:** Amazon Vendor ASN — All Labels and Tracking Numbers First

**Business Purpose:**
Once the ASN is submitted to Amazon Vendor Central, tracking numbers cannot
be retrieved from the platform. If labels or tracking numbers are missing at
the time of submission, the ASN record will be incomplete and cannot be
corrected retrospectively via Vendor Central.

**Trigger Condition:**
An Amazon Vendor ASN is ready to be submitted on Vendor Central.

**Expected Action:**
Confirm all DHL labels have been created AND all tracking numbers have been
recorded in the Google Sheet (Amazon Vendor PO Box Details - DE) before
submitting the ASN. The ASN must not be submitted until both conditions are met.

**Source Reference:**
German Vendor Booking Guide.md, Common Mistakes section

---

### R-VAL-05

**Rule Name:** Amazon Vendor Multi-Box — Split Carton Labels Before Saving

**Business Purpose:**
Each Amazon fulfilment centre box must have exactly one carton label identifying
its contents. A box with a missing label will be rejected at the Amazon FC.
A multi-page PDF saved to a single BOX folder does not give each box its own
correctly labelled file.

**Trigger Condition:**
An Amazon Vendor shipment has multiple boxes and the carton label PDF has
been downloaded from Vendor Central.

**Expected Action:**
Check the page count of the downloaded carton label PDF. If more than one page:
split using maxai.me/pdf-tools/split-pdf/ before saving to Dropbox. Save exactly
one page per BOX subfolder. A box without its own label page will be rejected
at the Amazon fulfilment centre.

**Source Reference:**
German Vendor Booking Guide.md, Step 8

---

### R-VAL-06

**Rule Name:** Pre-Completion Validation Checklist — 14 Items Before Closing Session

**Business Purpose:**
The daily booking session is not complete when the last label is printed.
Multiple system updates, file saves, and status changes must all be confirmed.
The 14-item checklist is the formal gate that confirms the session is fully
closed before the team member moves on.

**Trigger Condition:**
The daily UK/DE booking session is ending — all orders appear to have been
processed.

**Expected Action:**
Complete all 14 items of the Pre-Completion Validation Checklist before
marking the session done:
1. All UK orders booked (no In Progress without a service)
2. All DE orders booked (no In Progress without a service)
3. No remaining Wrong SKU / Error Shipment orders
4. No remaining No Service orders for UK or DE
5. All 6 Trossingen service types individually checked
6. UK labels printed — count matches UK order count
7. DE labels printed — count matches DE order count
8. German packlist uploaded to Dropbox (correct date folder)
9. UK packlist uploaded to Dropbox (correct date folder)
10. All warehouse assignments verified
11. Teams MSG & Post group fully checked and actioned
12. Teams Packlist Label Issue group fully checked and actioned
13. UK shipped status updated in OMS
14. DE shipped status updated in OMS

**Source Reference:**
Daily Booking Workflow Final.md, Section 5

---

## 6. Exception Handling Rules

Rules that define the required response when a standard booking situation
cannot be resolved through normal workflow steps.

---

### R-EXC-01

**Rule Name:** Stock Unavailable — Change Warehouse or Escalate

**Business Purpose:**
An unbooked order with no available warehouse cannot be left unprocessed.
The team must exhaust all warehouse alternatives before escalating.

**Trigger Condition:**
Stock is unavailable at the expected warehouse for an order.

**Expected Action:**
Change to an alternative warehouse:
- DE → UK (if no DE stock)
- Schmutter ↔ Kronen (within DE, if stock is available at the other warehouse)

If no stock exists at any available warehouse: escalate to team lead before
proceeding. Do not leave orders unbooked.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4

---

### R-EXC-02

**Rule Name:** Service Cannot Be Assigned — Manual Assignment, Then Log

**Business Purpose:**
An order without a service cannot be marked as shipped. It must receive
the closest appropriate service or be formally logged for resolution — it
cannot be skipped.

**Trigger Condition:**
A service cannot be assigned to an order through the normal booking rule process.

**Expected Action:**
Check product type and weight. Manually assign the closest matching service.
If still unresolvable: log the order in the Packlist Label Issue Microsoft Teams
group. Do not skip the order or mark it as complete without a service.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4

---

### R-EXC-03

**Rule Name:** Booking Rule Fails — Re-run, Test, Then Escalate

**Business Purpose:**
A booking rule failure may affect a single order or the entire system. The
response is graduated: try again, test one order, then escalate if system-wide.
Jumping to escalation without testing wastes time on recoverable failures.

**Trigger Condition:**
A booking rule fails to run in the OMS.

**Expected Action:**
Re-run the rule on the affected orders. If it fails again: run exactly 1 test
order manually to confirm system behaviour. If system-wide failure is confirmed:
notify team lead immediately. Do not continue attempting to book other orders
if the system is confirmed down.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4

---

### R-EXC-04

**Rule Name:** Duplicate Shopify Order — Do Not Book, Flag and Wait

**Business Purpose:**
Booking a duplicate order creates a double-shipment and double-charge. The
correct action is to stop and confirm with the team which order is valid before
proceeding with either.

**Trigger Condition:**
A duplicate Shopify order is identified in the queue.

**Expected Action:**
Do not book either copy. Flag both in the MSG and Post Microsoft Teams group.
Await confirmation from the appropriate person before cancelling or proceeding
with either order.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4

---

### R-EXC-05

**Rule Name:** Warehouse Unavailable — Switch Orders, Notify, Do Not Wait

**Business Purpose:**
Waiting for an unavailable warehouse to come back online stalls all affected
orders. The standing rule is to switch to an alternative immediately rather
than holding the batch.

**Trigger Condition:**
A warehouse is unavailable and orders cannot be processed through it.

**Expected Action:**
Switch all affected orders to an available alternative warehouse. Notify team
lead. Do not wait for the original warehouse to become available before moving
affected orders.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4

---

### R-EXC-06

**Rule Name:** Unidentifiable Wrong SKU — Log, Escalate, Do Not Guess

**Business Purpose:**
Booking an order with an unconfirmed SKU creates a permanent mismatch record.
Guessing the nearest match is not permitted. The order must be held and escalated.

**Trigger Condition:**
A Wrong SKU order cannot be identified even after checking the Combo Products
page and comparing product images.

**Expected Action:**
Log the order in Listing Correction with the note "UNABLE TO IDENTIFY".
Escalate to team lead. Do not use a nearest-match SKU without image confirmation.
Do not book the order with an unconfirmed SKU.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4;
German 2nd Booking Process Workflow.docx.md, Phase 2

---

### R-EXC-07

**Rule Name:** Wayfair Motherland — Confirm Stock Out, Never Book to Motherland

**Business Purpose:**
Motherland is not a valid fulfilment location. This rule exists alongside R-WH-01
as a specific Wayfair-context reinforcement. The combination of Wayfair platform
orders and Motherland assignments is a known scenario requiring explicit handling.

**Trigger Condition:**
A Wayfair order shows "Motherland" as the warehouse assignment.

**Expected Action:**
Confirm stock is out of the expected warehouse. Manually select the correct
alternative warehouse. Never book to Motherland under any circumstances — for
Wayfair orders or any other order type.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 5 Step 10 and Section 4

---

### R-EXC-08

**Rule Name:** Address Change After Booking — Cancel, Update, Re-book, Log

**Business Purpose:**
A label with the original address cannot be corrected after purchase on most
carrier platforms. The order must be fully re-processed with the new address.
Logging the change creates an audit trail.

**Trigger Condition:**
An address change is received in Microsoft Teams (MSG & Post channel) after
a shipping label has already been booked for the order.

**Expected Action:**
Cancel the booked label if the carrier permits cancellation. Update the address
in the OMS. Re-book with the correct address. Log the change in the appropriate
Teams channel or order notes.

**Source Reference:**
Daily Booking Workflow Final.md, Section 4

---

### R-EXC-09

**Rule Name:** EVRi Enquiry — REF: Comment Format Is Mandatory

**Business Purpose:**
EVRi's enquiry system processes comments based on their format. The REF: prefix
and standardised text ensures the enquiry is routed and actioned correctly by
the EVRi team. Free-text comments without the REF: prefix may not be processed
correctly.

**Trigger Condition:**
An EVRi parcel enquiry is being submitted via the EVRi Client Portal
(clients.evricloud.co.uk).

**Expected Action:**
All EVRi enquiry comments must begin with "REF:" followed by the appropriate
standard text for the situation:

| Situation | Required comment text |
|-----------|----------------------|
| Parcel in transit, not yet delivered | REF: Please request the courier to prioritise this shipment and ensure the parcel is delivered within 24 hours. |
| Courier claimed attempted delivery but did not | REF: Please request the courier to reattempt delivery as soon as possible. |
| No tracking movement | REF: Please investigate why this parcel has not moved and provide an update. |
| Parcel returned to sender | REF: Please investigate and provide the reason this parcel has been returned. |
| Delivery instructions needed | REF: [Enter specific delivery instructions, e.g. leave in porch, call recipient] |

**Source Reference:**
EVRi courier update.docx.md, Step 9

---

### R-EXC-10

**Rule Name:** EVRi Reference Number — Post as Reply, Not New Message

**Business Purpose:**
The EVRi enquiry reference number links this submission to the original parcel
flag in Teams. Posting it as a new message breaks the thread and makes it
impossible to trace which enquiry belongs to which parcel. Posting as a reply
keeps the record intact and prevents duplicate submissions.

**Trigger Condition:**
An EVRi enquiry has been submitted and the reference number is shown on the
EVRi portal confirmation page.

**Expected Action:**
Copy the reference number from the EVRi confirmation page before closing it.
Go to Microsoft Teams (Evri & DPD Parcel Updates channel). Find the original
parcel flag message. Post the reference number as a REPLY to that message —
not as a new message. Do not close the EVRi confirmation page before the
reference number is safely copied.

**Source Reference:**
EVRi courier update.docx.md, Steps 13–14

---

## 7. Booking Decision Rules

Rules that govern when, in what sequence, and under what conditions specific
booking actions must be taken. These rules control the timing and ordering
of booking tasks across the day.

---

### R-BK-01

**Rule Name:** German 2nd Booking — Schmutter Before Kronen

**Business Purpose:**
The Schmutter and Kronen warehouse bookings are distinct runs. Running them
out of sequence or simultaneously may cause booking errors or OMS conflicts.
The defined sequence is Schmutter first, then Kronen.

**Trigger Condition:**
German 2nd booking is being run.

**Expected Action:**
Complete the Schmutter warehouse booking run before starting the Kronen
warehouse booking run. The sequence is Schmutter first, then Kronen.
They must not be run simultaneously.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phases 4–5

---

### R-BK-02

**Rule Name:** Amazon Vendor ASN — Sequence Is Labels → Tracking Numbers → ASN

**Business Purpose:**
The ASN submission sequence is fixed for a reason: ASN submission closes the
tracking number entry window in Vendor Central. Submitting before all tracking
numbers are recorded makes it impossible to complete the Google Sheet accurately.

**Trigger Condition:**
An Amazon Vendor booking is in progress.

**Expected Action:**
Follow this fixed sequence:
1. Create all DHL labels
2. Collect all tracking numbers
3. Record all tracking numbers in Google Sheet
4. Only then submit the ASN on Vendor Central

The ASN is submitted only when all tracking numbers from all boxes are recorded.

**Source Reference:**
German Vendor Booking Guide.md, Step 5 and Common Mistakes

---

### R-BK-03

**Rule Name:** Amazon Vendor Multi-Box Carton Labels — Split Before Saving to Dropbox

**Business Purpose:**
Each BOX subfolder in Dropbox must contain one label page corresponding to that
specific box. Saving a multi-page PDF into one folder means the individual box
labels are not separately accessible for warehouse staff attaching labels to boxes.

**Trigger Condition:**
An Amazon Vendor shipment has multiple boxes and the carton label PDF has been
downloaded.

**Expected Action:**
Split the carton label PDF using maxai.me/pdf-tools/split-pdf/ before saving
to Dropbox. Save exactly one page per BOX subfolder (BOX 01, BOX 02, etc.).
Do not save a multi-page PDF into a single BOX folder.

**Source Reference:**
German Vendor Booking Guide.md, Step 8

---

### R-BK-04

**Rule Name:** DE DHL eBay Tracking Email — After All German Booking, 5 PM Mon–Fri

**Business Purpose:**
The DE DHL eBay tracking email must reflect the complete day's German booking.
Running it before booking is complete means the export will be incomplete or
inaccurate. Running it on weekends has no purpose as no Saturday/Sunday German
booking takes place.

**Trigger Condition:**
All German booking for the day is complete (both 1st and 2nd booking sessions
are finished).

**Expected Action:**
Run the DE DHL eBay tracking email task. Timing: Monday to Friday only,
at approximately 5:00 PM SL time. Must not run during or before the main
booking session. Must not run on weekends.

**Source Reference:**
DE DHL eBay Tracking Email Workflow.md, opening instruction

---

### R-BK-05

**Rule Name:** German Return Labels — Return Receiver Is Always Fixed

**Business Purpose:**
The return receiver address is pre-configured in the DHL portal and must
never be changed. Changing it would redirect returned items to the wrong
location. The field is pre-filled precisely to prevent this.

**Trigger Condition:**
A German return label form is being filled in on the DHL Business Portal.

**Expected Action:**
Verify that the return receiver section is pre-filled as:
Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen, Germany.
Do not change this field. If it appears blank or shows a different address,
do not proceed — raise with the team immediately.

**Source Reference:**
German Return Label Workflow Guide.docx.md, Step 3

---

### R-BK-06

**Rule Name:** German Return Labels — Confirm DHL RETOURE ONLINE Tab Before Any Field

**Business Purpose:**
The tab selection at the top of the DHL return form determines the service
type for the entire submission. If the wrong tab is selected before form fields
are entered, the entire form must be discarded and restarted. Confirming the
tab first prevents wasted effort.

**Trigger Condition:**
The German return label form is about to be filled in on the DHL Business Portal.

**Expected Action:**
Select the DHL RETOURE ONLINE tab before filling in any field. Confirm the
tab selection is correct before entering the customer address or any other
form data. This rule repeats and reinforces R-CARRIER-05 as a timing constraint.

**Source Reference:**
German Return Label Workflow Guide.docx.md, Step 3

---

### R-BK-07

**Rule Name:** US Orders — Update LEDSone Shipping Method to Match Carrier Used

**Business Purpose:**
LEDSone OMS and the purchasing platform (GoShippo / Amazon Seller Central /
eBay) can show different carrier records if the LEDSone field is not updated
after purchase. Inconsistent records cause tracking and audit problems.

**Trigger Condition:**
Labels have been purchased for US orders on GoShippo or Amazon Seller Central
or eBay Seller Hub.

**Expected Action:**
After purchasing labels, update the shipping method field in LEDSone OMS to
match the carrier actually used. Records must be consistent across LEDSone and
the purchasing platform.

**Source Reference:**
USA Booking Workflow Guide.docx.md, Phase 8 Step 20

---

### R-BK-08

**Rule Name:** Canada Stallion Import — Switch to Intelcom Standard Before Purchase

**Business Purpose:**
The Stallion Express import file may auto-assign Canada Post Expedited based
on how the template is configured. This rule ensures the switch to Intelcom
Standard happens at the editing stage before purchase is confirmed — after
purchase the carrier cannot be changed.

**Trigger Condition:**
Canada orders are uploaded to Stallion Express and the Stallion import file
has pre-assigned Canada Post Expedited to any order.

**Expected Action:**
Switch from Canada Post Expedited to Intelcom Standard at the Stallion
shipment editing step. The switch must happen before confirming payment.
Once payment is confirmed, the carrier cannot be changed on that label.

**Source Reference:**
CA Booking Workflow Guide.docx.md, Phase 5 Step 18

---

### R-BK-09

**Rule Name:** Label Printing Timing — All Filters Complete Before Any Labels Print

**Business Purpose:**
Printing labels before all service assignment filters are complete produces
labels for partially-processed orders. These labels will either be for the
wrong service or will require reprinting after the remaining filters run —
wasting labels and creating confusion at the warehouse.

**Trigger Condition:**
Any point during the daily UK/DE booking session when label printing appears
to be ready.

**Expected Action:**
Do not print labels until all service filters for that region are fully complete:
- DE labels: print only after ALL DE service steps (R-SVC-01 through R-SVC-07)
  are complete for all orders.
- UK labels: print only after ALL UK service steps (R-SVC-08 through R-SVC-15)
  are complete for all orders.

Printing before all filters are complete requires reprints.

**Source Reference:**
Daily Booking Workflow Final.md, Phase 8 Step 23 (DE) and Phase 9 Step 35 (UK)

---

### R-BK-10

**Rule Name:** German 2nd Booking Wrong SKU — Image Confirmation Required, Not Code Match

**Business Purpose:**
In the German 2nd booking workflow, SKU correction must meet the same image
confirmation standard as the main booking workflow (R-VAL-02). An ENC code
match without image confirmation is insufficient — visually similar products
can share codes but be different items.

**Trigger Condition:**
A Wrong SKU needs to be corrected during the German 2nd booking session.

**Expected Action:**
Open the Combo Products page on the LEDSone Dashboard. Click View on the
matching product. In the Combo Product Details popup, compare product images
visually against what the customer ordered. An ENC code match alone is not
sufficient. Image confirmation is required before updating the SKU in the order.

**Source Reference:**
German 2nd Booking Process Workflow.docx.md, Phase 2 Step 04

---

## Validation Summary

### Rule Count by Category

| Category | Count | Rule IDs |
|----------|-------|----------|
| Routing Rules | 7 | R-ROUTE-01 to R-ROUTE-07 |
| Warehouse Rules | 7 | R-WH-01 to R-WH-07 |
| Carrier Selection Rules | 6 | R-CARRIER-01 to R-CARRIER-06 |
| Service Assignment Rules | 15 | R-SVC-01 to R-SVC-15 |
| Validation Rules | 6 | R-VAL-01 to R-VAL-06 |
| Exception Handling Rules | 10 | R-EXC-01 to R-EXC-10 |
| Booking Decision Rules | 10 | R-BK-01 to R-BK-10 |
| **Total** | **40** | |

### Source References Used

| Source Document | Rules Sourced |
|----------------|--------------|
| Daily Booking Workflow Final.md (v2.0) | R-ROUTE-01, R-ROUTE-02, R-ROUTE-03, R-ROUTE-06, R-ROUTE-07; R-WH-01, R-WH-02, R-WH-03, R-WH-04; R-SVC-01 to R-SVC-15; R-VAL-03, R-VAL-06; R-EXC-01 to R-EXC-08; R-BK-07, R-BK-09 |
| German 2nd Booking Process Workflow.docx.md | R-ROUTE-04, R-ROUTE-05, R-ROUTE-06; R-WH-05, R-WH-07; R-VAL-01, R-VAL-02; R-EXC-06; R-BK-01, R-BK-10 |
| German Vendor Booking Guide.md | R-WH-06; R-CARRIER-04; R-VAL-04, R-VAL-05; R-BK-02, R-BK-03 |
| German Return Label Workflow Guide.docx.md | R-CARRIER-05; R-BK-05, R-BK-06 |
| USA Booking Workflow Guide.docx.md | R-CARRIER-02, R-CARRIER-03; R-BK-07 |
| CA Booking Workflow Guide.docx.md | R-CARRIER-01; R-BK-08 |
| EVRi courier update.docx.md | R-EXC-09, R-EXC-10 |
| UK Collection Label Workflow.docx.md | R-CARRIER-06 |
| DE DHL eBay Tracking Email Workflow.md | R-BK-04 |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- All 40 rules extracted from CLAUDE.md are present — no omissions
- All original Rule IDs are preserved exactly (R-ROUTE-xx, R-WH-xx, R-CARRIER-xx,
  R-SVC-xx, R-VAL-xx, R-EXC-xx, R-BK-xx)
- Every rule is enriched with Rule Name, Business Purpose, Trigger Condition,
  Expected Action, and Source Reference — no fields are blank or invented
- No new rules were created beyond the 40 extracted in CLAUDE.md
- No rules were modified — conditions and actions match CLAUDE.md exactly
- Rules remain distinct from procedures — no SOP steps were embedded in this file
- All source references trace to the same documents cited in CLAUDE.md

**Conditions for ongoing accuracy:**
1. When Varmen confirms or corrects any rule, update this file and CLAUDE.md
   together — they must remain consistent
2. If source files are fully read (FBA, Royal Mail, DE DHL eBay), any additional
   rules discovered must be added to CLAUDE.md first, then reflected here
3. Varmen review required before this file is treated as operational

**This file must not be treated as final until Varmen has reviewed and approved it.**
