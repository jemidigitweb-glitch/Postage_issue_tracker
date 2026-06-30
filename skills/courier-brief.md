# Courier Brief Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Builder: Vishnu Sree | Validator: Varmen

---

## 1. Skill Purpose

This skill is a quick-identification reference for couriers, shipping platforms,
marketplaces, and internal systems used by the Postage team. It tells an LLM
which system handles which region or task, and routes detailed questions to the
correct section of context/courier-vendor-info.md.

**One question this skill answers:** "Which courier or system is used for this?"

**What this skill does NOT do:**
- Explain how to use a platform step by step → see context/bgct-procedures.md
- List booking rules → see context/janarthan-rules.md
- Provide account credentials or contact details → not documented in source files
- Provide SLAs, rate cards, or contracts → not documented in any source file

---

## 2. Courier Quick Reference

### DHL

| Field | Value |
|-------|-------|
| Region | Germany only |
| Portal | geschaeftskunden.dhl.de |
| Account name | [VERIFY REQUIRED — see courier-vendor-info.md §1] |
| Billing account | 63748818590101 [VERIFY REQUIRED — confirm still current] |
| Sender address | Hüttenlampen / Schmutter Str 16 / 78647 Trossingen / GERMANY |
| Tracking format | 18-digit Sendungsnummer starting with 003404... |
| Used for | All DE outbound (PAKET, KLEINPAKET, PAKET INTERNATIONAL) + German return labels (RETOURE ONLINE) |
| NOT used for | Amazon Vendor DTM1 Werne → PAKET only, never KLEINPAKET or INTERNATIONAL |
| Label generation | LEDSone OMS (outbound); DHL Business Portal (return labels only) |
| Full details | context/courier-vendor-info.md §1 |

**DHL service selection at a glance:**

| Service | When |
|---------|------|
| DHL PAKET | Standard German domestic parcels |
| DHL KLEINPAKET | Smaller/lighter items — transformers, bulbs |
| DHL PAKET INTERNATIONAL | International from DE warehouse (France, Netherlands, etc.) |
| DHL RETOURE ONLINE | German customer return labels — portal only, never OMS |

---

### Royal Mail

| Field | Value |
|-------|-------|
| Region | UK domestic only |
| Enquiry portal | help.royalmail.com/s/regionalaccountserviceteam |
| Teams channel | Smart Track and Royal Mail Parcel Updates |
| Used for | UK outbound orders — waterfall cascade of three services |
| NOT used for | DE, US, Canada, return labels, or international shipments |
| Full details | context/courier-vendor-info.md §2 |

**Royal Mail services at a glance:**

| Service | When |
|---------|------|
| Royal Mail 48 Large Letter NEX | Cascade step 1 (also Unit 4 + Packing Area/Others) |
| Royal Mail Tracked 48 NEX (2kg) | Cascade step 2 |
| Royal Mail Tracked 48 NEX (5kg) | Cascade step 3 |

Enquiry process: [VERIFY REQUIRED] — source file partially read. Portal confirmed;
full step sequence not confirmed. See context/courier-vendor-info.md §2.

---

### EVRi

| Field | Value |
|-------|-------|
| Region | UK domestic |
| Portal | clients.evricloud.co.uk |
| Account name | Ledsone |
| Contact email | postage@ledsone.co.uk |
| Tracking prefix | H04RQ or T019VA |
| Response email | IONOS inbox — mailbusiness.ionos.co.uk |
| Teams channel | Evri & DPD Parcel Updates |
| Used for | UK domestic delivery + parcel enquiry management |
| Full details | context/courier-vendor-info.md §3 |

**How to identify EVRi tracking numbers:** prefix must be H04RQ or T019VA.
If the prefix does not match, the parcel may belong to DPD — check before
submitting an EVRi enquiry.

EVRi enquiry process: confirmed — see context/bgct-procedures.md §11.

---

### GLS

| Field | Value |
|-------|-------|
| Region | Germany |
| Used for | DE orders with 1st Class service AND shipping value over €20 |
| Portal | [VERIFY REQUIRED — not documented] |
| Account details | [VERIFY REQUIRED — not documented] |
| Enquiry process | [VERIFY REQUIRED — not documented] |
| Full details | context/courier-vendor-info.md §4 |

GLS is the least-documented courier in the AIOS. The rule that triggers GLS
is confirmed (R-SVC-02 in context/janarthan-rules.md). Everything else about
GLS — portal, account, tracking format, enquiry process — is not in any
source document. Direct GLS operational questions to Laksika.

---

## 3. Shipping Platform Quick Reference

### GoShippo

| Field | Value |
|-------|-------|
| URL | apps.goshippo.com/orders |
| Region | United States (warehouse orders) |
| Default carrier | UPS Ground |
| Alternative carrier | USPS Ground Advantage |
| Label format | 4x6 in PDF |
| Used for | US warehouse orders only — not Amazon or eBay US orders |
| Standard dimensions | 9x6x6 in (lampshades); 5x5x5 in (cables) |
| Full details | context/courier-vendor-info.md §6 |

---

### Stallion Express

| Field | Value |
|-------|-------|
| URL | ship.stallionexpress.ca |
| Account name | Cottage Lighting Ltd |
| Region | Canada (all Canada marketplace orders) |
| Default carrier | Intelcom Standard (~$10.03 / 2–4 business days) |
| Fallback carrier | Canada Post Expedited (~$19.88 / 7–11 business days) |
| Import method | Stallion Import Template CSV (exported from LEDSone OMS) |
| Label filename | StallionLabels.pdf |
| Tracking prefix | SE-prefixed (e.g. SE260225TEJ0) |
| Full details | context/courier-vendor-info.md §5 |

**Key point:** If the Stallion import pre-assigns Canada Post Expedited, switch
to Intelcom Standard before purchase. See R-CARRIER-01 in context/janarthan-rules.md.

---

## 4. Marketplace Quick Reference

### Amazon Seller Central

| Field | Value |
|-------|-------|
| URL | sellercentral.amazon.com |
| Used for (US) | US Amazon marketplace Buy Shipping — USPS Ground Advantage Cubic |
| Used for (UK FBA) | UK FBA shipment booking and label generation |
| US account | Neighbour Market United States |
| UK FBA accounts | Ledsone / DCVoltage / SRM [VERIFY REQUIRED — may not be complete] |
| Preferred US carrier | USPS Ground Advantage Cubic ($9.65) |
| UK FBA packing | Pack Individual Units — Standard packing |
| Full details | context/courier-vendor-info.md §7 |

**Do not confuse with Amazon Vendor Central** — Seller Central (US Buy Shipping
and UK FBA) and Vendor Central (DE wholesale POs) are separate platforms with
separate logins and separate purposes.

---

### Amazon Vendor Central

| Field | Value |
|-------|-------|
| URL | vendorcentral.amazon.eu |
| Account name | DE – Ledsone UK Limited – DE |
| Region | Germany only |
| Used for | DE wholesale purchase orders (POs) to DTM1 Werne; ASN submission |
| Destination | DTM1, Amazon Logistik Werne GmbH, Raiffeisenstrasse 7, Werne, 59368 |
| Fixed carrier | DHL PAKET — Trossingen Schmutter only. No exceptions. |
| Label creation | LEDSone OMS (search postcode 59368) — NOT on Vendor Central itself |
| Google Sheet | Amazon Vendor PO Box Details - DE |
| Full details | context/courier-vendor-info.md §8 |

**Critical constraint:** ASN must be submitted ONLY after ALL DHL labels are created
AND ALL tracking numbers are recorded in the Google Sheet. Tracking numbers cannot
be retrieved from Vendor Central after ASN submission.

---

### eBay Seller Hub

| Field | Value |
|-------|-------|
| Region | United States (US eBay orders) |
| Used for | US eBay marketplace Buy Shipping |
| LEDSone channel names | EBAY - electricalsone; US1 |
| Carriers available | USPS; FedEx |
| Account name | [VERIFY REQUIRED — not documented] |
| Full details | context/courier-vendor-info.md §9 |

eBay Seller Hub is used only for US eBay orders. DE eBay tracking is handled
separately via the DE DHL eBay Tracking Email workflow — it does not use Seller
Hub. See context/bgct-procedures.md §6 for DE eBay tracking (partial read).

---

## 5. Internal Systems Quick Reference

### Dropbox

| Field | Value |
|-------|-------|
| Type | Shared team folder |
| Used for | All label PDF and Packlist.htm storage across every region |
| Full details | context/courier-vendor-info.md §10 |

**Dropbox folder paths by region (quick reference):**

| Region | Path |
|--------|------|
| DE daily booking | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/ |
| DE 2nd booking — Schmutter | .../2nd Booking/schmutter |
| DE 2nd booking — Kronen | .../2nd Booking/kronen |
| DE Amazon Vendor labels | Dropbox/German Postage Label/Amazon Vendor/YYYY/Month/DD.MM.YYYY/ |
| DE Amazon Vendor carton labels | .../BOX 01, BOX 02 |
| UK daily booking | Dropbox/UK Postage Label/YYYY/Month/DD.MM.YYYY |
| US | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY |
| Canada | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY |
| Canada packlist (Unit 3) | Dropbox/Unit-03 Postage Folder/YYYY/Month/Date/4TH BOOKING/LAMPSHADE |

**Standard filenames:**

| File | Workflow |
|------|---------|
| Packlist.htm | UK/DE/2nd booking packlists |
| Labels-[N].pdf | German 2nd booking labels |
| LABELS.pdf | US booking consolidated labels |
| StallionLabels.pdf | Canada booking labels |

---

### Microsoft Teams

| Field | Value |
|-------|-------|
| Type | Internal shared workspace |
| Used for | Receiving task triggers, posting responses, booking updates, inter-team coordination |
| Full details | context/courier-vendor-info.md §11 |

**Teams channels at a glance:**

| Channel | Purpose | Who Uses It |
|---------|---------|-------------|
| MSG and Post | Cancellations, address changes, alt delivery instructions | Postage team — checked at session start |
| Packlist Label Issue | Warehouse change requests, rebooking | Postage team — checked at session start |
| German postage / Replacements | German return label requests | CST → Postage team |
| Evri & DPD Parcel Updates | EVRi/DPD tracking enquiry triggers | Postage team posts reference number reply |
| Smart Track and Royal Mail Parcel Updates | Royal Mail tracking enquiries | Postage team posts response |
| US Marketplace | US booking updates, wrong SKU coordination | Postage team |

**Note:** German Vendor picklist photos come via WhatsApp (web.whatsapp.com),
not Teams. The German Vendor WhatsApp group is a separate channel.

**DPD in Teams:** DPD parcels appear in the Evri & DPD Parcel Updates channel,
but the DPD enquiry process is not documented in any source file.
[VERIFY REQUIRED] — see context/courier-vendor-info.md §11.

---

## 6. Common Questions and Routing

| User Question | Answer | Detailed Source |
|--------------|--------|----------------|
| "Which courier handles Germany?" | DHL (outbound); DHL RETOURE ONLINE (returns) | context/courier-vendor-info.md §1 |
| "Which courier handles UK?" | Royal Mail (outbound); EVRi (domestic parcels) | context/courier-vendor-info.md §2, §3 |
| "Which courier for 1st Class DE orders over €20?" | GLS | context/courier-vendor-info.md §4; R-SVC-02 |
| "Which platform for Canada?" | Stallion Express (ship.stallionexpress.ca) | context/courier-vendor-info.md §5 |
| "Which platform for US warehouse orders?" | GoShippo (apps.goshippo.com/orders) | context/courier-vendor-info.md §6 |
| "Which platform for US Amazon orders?" | Amazon Seller Central Buy Shipping | context/courier-vendor-info.md §7 |
| "Which platform for German Vendor POs?" | Amazon Vendor Central (vendorcentral.amazon.eu) | context/courier-vendor-info.md §8 |
| "Which platform for US eBay orders?" | eBay Seller Hub Buy Shipping | context/courier-vendor-info.md §9 |
| "Where do I save German labels?" | Dropbox/German Postage Label/YYYY/Month/DD.MM.YYYY/ | context/courier-vendor-info.md §10 |
| "Where do I save US labels?" | Dropbox/US Postage/YYYY/Month/DD.MM.YYYY/LABELS.pdf | context/courier-vendor-info.md §10 |
| "Where do I save Canada labels?" | Dropbox/Canada Postage/YYYY/Month/DD.MM.YYYY/StallionLabels.pdf | context/courier-vendor-info.md §10 |
| "Which Teams channel for EVRi issues?" | Evri & DPD Parcel Updates | context/courier-vendor-info.md §11 |
| "Which Teams channel for Royal Mail?" | Smart Track and Royal Mail Parcel Updates | context/courier-vendor-info.md §11 |
| "Which Teams channel for German return labels?" | German postage / Replacements | context/courier-vendor-info.md §11 |
| "What tracking number format does DHL use?" | 18-digit Sendungsnummer starting with 003404... | context/courier-vendor-info.md §1 |
| "What tracking prefix does EVRi use?" | H04RQ or T019VA | context/courier-vendor-info.md §3 |
| "What tracking prefix does Stallion use?" | SE-prefixed (e.g. SE260225TEJ0) | context/courier-vendor-info.md §5 |
| "What carrier should I use for Canada instead of Canada Post?" | Intelcom Standard — see R-CARRIER-01 | context/courier-vendor-info.md §5; context/janarthan-rules.md R-CARRIER-01 |
| "What carrier should I book for Amazon Vendor Werne?" | DHL PAKET (Trossingen Schmutter only) — see R-CARRIER-04 | context/courier-vendor-info.md §8; context/janarthan-rules.md R-CARRIER-04 |
| "GLS account — where do I find it?" | Not documented — direct to Laksika | context/courier-vendor-info.md §4 |
| "What email receives EVRi responses?" | postage@ledsone.co.uk via IONOS (mailbusiness.ionos.co.uk) | context/courier-vendor-info.md §3 |
| "What is the DHL return receiver address?" | Hüttenlampe e.K., Schmutter Str. 16, 78647 Trossingen — R-BK-05 | context/courier-vendor-info.md §1; context/janarthan-rules.md R-BK-05 |

---

## 7. Escalation Guidance

### Escalate to Laksika when:
- Any question about GLS (portal, account, tracking, enquiry process)
- Full DHL billing account confirmation (63748818590101 — [VERIFY REQUIRED])
- Full Royal Mail enquiry process (source file only partially read)
- Full Amazon FBA UK workflow and account list
- DPD enquiry process (appears in Teams channel but not documented)
- Any Stallion or GoShippo rate pricing that needs current confirmation

### Escalate to Varmen when:
- The question involves whether Postage or Purchasing owns vendor booking
  → see context/vendor-booking-boundary.md
- A courier or platform is being added or changed
- A decision is needed that is not covered by source documents

### Do not escalate:
- Questions fully answered by context/courier-vendor-info.md §1–§9 (DHL,
  Royal Mail, EVRi, Stallion, GoShippo, Amazon Seller Central, Amazon Vendor
  Central, eBay Seller Hub)
- Dropbox folder paths — all confirmed paths are in context/courier-vendor-info.md §10
- Teams channel purposes — confirmed in context/courier-vendor-info.md §11

---

## 8. Known Limitations

| Limitation | Impact |
|-----------|--------|
| GLS account details not documented | Cannot answer any GLS operational question beyond which orders trigger GLS |
| Royal Mail enquiry process partially confirmed | Can confirm portal URL and Teams channel; cannot give full step sequence |
| DPD enquiry process not documented | Cannot answer DPD-specific enquiry questions despite DPD appearing in Teams |
| Amazon FBA UK account list may be incomplete | Ledsone, DCVoltage, SRM confirmed — others may exist |
| Courier SLAs, rate cards, and contacts not documented | Cannot answer questions about service commitments or account escalation paths |
| DHL billing account needs confirmation | Account number 63748818590101 seen in source label — may have changed |
| Dropbox account owner and access management not documented | Cannot answer who manages Dropbox access |
| This skill does not contain procedure steps | For booking process, route to context/bgct-procedures.md |
| This skill does not contain rules | For carrier selection rules, route to context/janarthan-rules.md |

---

## 9. Quick Navigation Guide

| I need to know... | Go to |
|-------------------|-------|
| Which courier handles [region]? | §2 (DHL), §2 (Royal Mail), §2 (EVRi), §2 (GLS) above |
| Which platform to use for [country/order type]? | §3 (GoShippo, Stallion) or §4 (Amazon, eBay) above |
| Where a file is saved in Dropbox | §5 Dropbox folder paths above |
| Which Teams channel to use | §5 Teams channels above |
| Full courier account details | context/courier-vendor-info.md |
| How to use a courier or platform step by step | context/bgct-procedures.md |
| Why a specific carrier must be used | context/janarthan-rules.md (R-CARRIER prefix) |
| GLS details | Laksika — not yet documented |
| Royal Mail full enquiry steps | Laksika — source partially read |
| DPD enquiry process | Laksika — not documented |

---

## Validation Summary

### Courier Count: 4
DHL — Royal Mail — EVRi — GLS

### Shipping Platform Count: 2
GoShippo — Stallion Express

### Marketplace Count: 3
Amazon Seller Central — Amazon Vendor Central — eBay Seller Hub

### Internal System Count: 2
Dropbox — Microsoft Teams

### Source Files Used

| Source | Usage |
|--------|-------|
| context/courier-vendor-info.md | Primary source — all courier, platform, marketplace, and system details |
| CLAUDE.md | Supporting reference — Permanent Context / Courier Ecosystem section |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- All 4 couriers, 2 shipping platforms, 3 marketplaces, and 2 internal systems
  are present and identifiable from this file
- No workflow steps copied — context/bgct-procedures.md is referenced for those
- No Janarthan rules copied — context/janarthan-rules.md is referenced by rule ID
  where a carrier rule is relevant
- [VERIFY REQUIRED] items are correctly identified: GLS account, Royal Mail full
  process, DPD enquiry, Amazon FBA account list, DHL billing account
- A future LLM can identify which courier or system is relevant to any supported
  Postage task and knows exactly where to find the detailed information

**Pending Varmen review before operational use.**
