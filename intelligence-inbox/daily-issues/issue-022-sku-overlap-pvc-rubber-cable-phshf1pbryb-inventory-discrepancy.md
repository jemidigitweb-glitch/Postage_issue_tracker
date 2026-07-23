# Issue 022 – SKU Overlap: PVC and Rubber Cable Descriptions Sharing PHSHF1PBRYB with Negative Inventory in UK Unit3

**Issue ID:** ISSUE-022
**Date Logged:** 2026-07-12
**Logged By:** Vishnusri
**Domain:** listing
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** PHSHF1PBRYB
**Document Gap:** None

---

## Purpose

Capture, bound, and preserve the confirmed and reported evidence for a SKU overlap
discrepancy in the LEDSone OMS picking interface (order.vintageinterior.co.uk), where
warehouse location 1-F-05-D shows two different product descriptions —
"1m PVC Cable" and "1m Rubber Cable full set" — appearing under the same or closely
similar SKU identifier, with a confirmed negative stock value (-5) for UK Unit3 on
the Rubber Cable full set entry.

---

## Business / Operational Question Supported

When a warehouse picker at location 1-F-05-D encounters two pick cards for Yellow Brass
pendant fittings with different cable descriptions and the same location, which product
should be picked for a given order? Is the SKU the same or different for each description?
If the same SKU is in use for two materially different products, what is the authoritative
product identity for each? How is negative stock possible and what does it mean?

These questions require business investigation and OMS data review. They are not resolved
by this issue asset.

---

## Issue Summary

The warehouse picking interface (order.vintageinterior.co.uk) shows two pick cards at
warehouse location 1-F-05-D for Yellow Brass pendant light fittings:

- **Card A** (confirmed in `2026_07_12_p1.png`): labelled "1m PVC Cable", SKU text reads
  PHSHF1PBRYB, stock UK Unit18: 500 / UK Unit3: 136 / UK Unit4: 0, button shows "Picked".

- **Card B** (confirmed in `2026_07_12_p2.png`): labelled "1m Rubber Cable full set",
  SKU text appears as PHSF1PBRYB (see Note below), stock UK Unit18: 0 / UK Unit3: **-5** /
  UK Unit4: 0, button shows "Pick" (not yet actioned).

**Note — SKU text discrepancy between images:** Card A (p1) reads PHSHF1PBRYB; Card B (p2)
reads PHSF1PBRYB. At 720px image resolution, the rendering of adjacent identical characters
can cause visual merging. Whether these are the same SKU or two distinct identifiers requires
direct OMS system query. This observation is recorded exactly as seen — no resolution is
applied here.

Both cards appear on the same picking session (timestamps 7:51 and 7:52, same 83% battery
level), both show Yellow Brass colour and warehouse location 1-F-05-D.

The confirmed negative stock (UK Unit3: -5) for the Rubber Cable full set entry is
operationally significant: a negative system quantity means the system believes more units
have been picked than were available, which is an inventory data integrity problem requiring
investigation.

---

## Current Operational Process

Warehouse staff use a mobile browser interface at order.vintageinterior.co.uk to pick items
during fulfilment. The pick list displays cards with: a product image, a product description
label, a quantity, a SKU, a colour, a warehouse location, per-unit stock levels, and a Pick
or Picked button.

Confirmed from image evidence: a picker viewing location 1-F-05-D during a picking session
on 2026-07-12 saw both a "Picked" card (Card A, PVC Cable, 4 units) and a "Pick" card
(Card B, Rubber Cable full set, 1 unit) in the same session. The picking interface does
not currently surface any warning or disambiguation note to help the picker distinguish
between PVC and Rubber cable types when both appear at the same location under the same
or closely similar SKU identifier.

---

## Business Problem

### 1 — SKU Identity Ambiguity

The SKU text displayed for the "1m PVC Cable" and "1m Rubber Cable full set" cards is the
same or very similar (PHSHF1PBRYB vs PHSF1PBRYB). If these are indeed the same OMS SKU
assigned to two materially different product descriptions, the system cannot distinguish them.
If they are different but closely similar SKUs, the picking interface does not make the
difference visually clear to pickers.

In either case, a picker relying on SKU alone would not be able to determine from the system
display which physical product to pick.

### 2 — Negative Stock in UK Unit3

Card B shows UK Unit3: -5. A negative inventory value means the system records that 5 more
units were dispatched from Unit3 than were held there. Possible causes include:
- Units were picked and dispatched against Card B's SKU entry when no physical Rubber Cable
  full set stock existed, consuming a negative balance.
- Inventory was adjusted or transferred without a corresponding system update.
- The SKU overlap caused incorrect picks to be credited to this entry, depleting a count
  that was never properly stocked.

Which of these occurred has not been confirmed.

### 3 — Full-Set vs Component Representation

The BI report states that items arriving as full sets are reportedly being processed or listed
as separate components. This is a reported concern. The image evidence does not directly
confirm whether any specific physical unit was received as a full set and listed differently —
it only confirms that "1m Rubber Cable full set" and "1m PVC Cable" appear as separate pick
cards at the same location.

---

## Root Cause / Claim Boundary

### Confirmed from Evidence

| Observation | Source | Status |
|-------------|--------|--------|
| A pick card labelled "1m PVC Cable" with SKU text PHSHF1PBRYB, Location 1-F-05-D, UK Unit18: 500, UK Unit3: 136, UK Unit4: 0, button "Picked" | `2026_07_12_p1.png` | CONFIRMED — directly readable |
| A pick card labelled "1m Rubber Cable full set" with SKU text PHSF1PBRYB (see Note), Location 1-F-05-D, UK Unit18: 0, UK Unit3: -5, UK Unit4: 0, button "Pick" | `2026_07_12_p2.png` | CONFIRMED — directly readable |
| Both cards show Yellow Brass colour and location 1-F-05-D | both images | CONFIRMED |
| Both cards appear in the same picking session (7:51 and 7:52, 83% battery) | both images | CONFIRMED |
| The picking interface is order.vintageinterior.co.uk | `2026_07_12_p2.png` (URL bar partial) | CONFIRMED — "...tageinterior.co.uk" directly visible |
| UK Unit3 stock is -5 for the Rubber Cable full set entry | `2026_07_12_p2.png` | CONFIRMED — directly readable |
| A partial third card beginning with "1m PVC Cable" label and same product image type is visible at the bottom of p2 | `2026_07_12_p2.png` | CONFIRMED — visible; content not fully readable |

### Reported from BI / Operational Source

| Claim | Status |
|-------|--------|
| PHSHF1PBRYB is a single SKU mapped to both "1m PVC Cable" and "1m Rubber Cable full set" | REPORTED — BI report; not confirmed from OMS system query or image evidence independently |
| Both product descriptions share warehouse location 1-F-05-D | CONFIRMED from images for both cards individually; whether this reflects a system routing rule or a coincidence requires OMS query |
| Items arriving as full sets are being processed as individual components | REPORTED — BI report; not directly confirmed from image evidence |
| Warehouse staff flag the issue through operational or audio reports | REPORTED — BI report; audio recordings exist but content not independently transcribed |
| Inventory inaccuracy extends to multiple stock records | REPORTED — only UK Unit3: -5 for Rubber Cable entry is confirmed; other values are confirmed per card but their accuracy is not independently audited |

### Assumptions / Unproven

| Assumption | Status |
|------------|--------|
| The cause is old-stock listings or legacy SKU registration | UNPROVEN — stated in BI report as possible; no evidence chain confirmed |
| Quality or price differences were not reconciled during system updates | UNPROVEN |
| Pick-list preparation staff caused the discrepancy | UNPROVEN |
| The issue originated from initial SKU registration | UNPROVEN |
| Both cards represent the same physical product space at 1-F-05-D | UNPROVEN — location is the same per display; physical reality requires audit |

### Proposed Decision or Action

| Proposed Action | Status |
|-----------------|--------|
| PHSHF1PBRYB should be split into two separate canonical SKUs | PROPOSED — not an approved business decision |
| PVC and Rubber cable products must universally use different SKU conventions | PROPOSED — not an approved business rule |
| Full-set items must always be represented as one pick-list line | PROPOSED — not an approved business rule |
| Negative inventory values must be reconciled before the next picking session | PROPOSED — not a confirmed operational requirement |

---

## Business Impact

**Reported / potential — not confirmed incidents:**

| Potential Impact | Status |
|-----------------|--------|
| Picker ambiguity — when two cards at the same location share the same or very similar SKU, a picker cannot determine from the system display which physical product to select | REPORTED — the picking interface condition shown in images supports this risk |
| Incorrect item dispatch — if a picker selects PVC Cable when Rubber Cable full set was required, or vice versa, the wrong product reaches the customer | RISK — no confirmed incorrect shipment or customer complaint in repository |
| Returns or customer complaints from wrong cable type received | RISK — no confirmed complaint or return record in repository |
| Inventory count drift — negative stock (-5) suggests historical picks have already affected inventory accuracy; any further unresolved picks on this entry will worsen the count | RISK — confirmed only in the sense that a negative value already exists; further drift is a risk |
| Picking delays — a picker who notices the discrepancy may pause to seek guidance, slowing the session | REPORTED — consistent with BI report; no delay records in repository |
| Manual picker interpretation risk | CONFIRMED RISK — the interface shown in evidence does not provide disambiguation cues; each picker must interpret the two cards individually |

Do not state that an incorrect shipment or customer complaint occurred. No repository evidence confirms either.

---

## Operational Risks

| Risk | Description |
|------|-------------|
| Undiscovered additional negative inventory | UK Unit3: -5 is confirmed for the Rubber Cable full set entry. Other warehouse units or inventory records for this SKU have not been audited. Additional negative or incorrect values may exist. |
| Repeat negative picks | If the Rubber Cable full set entry continues to receive picks without stock replenishment or SKU correction, the negative balance will grow further. |
| Cross-contamination with other PHSHF1PBRYB orders | If other active orders reference PHSHF1PBRYB and the system resolves it against either card, order-level fulfilment accuracy may be affected. |
| Legacy record persistence | If the duplication originated from old-stock records that were not cleaned up during system updates, the same pattern may exist for other SKUs in the same product range. |
| Investigation delay impact | The longer the OMS reflects two descriptions for one SKU, the more picks will occur against potentially incorrect records. |

---

## Existing Workaround

No formal workaround is confirmed in the repository or from image evidence.

The BI report states warehouse staff reportedly flag the issue through operational or audio
reports. The audio recordings in the evidence folder may contain picker-reported descriptions
of the problem, but their content has not been independently transcribed.

The "Picked" status on Card A (PVC Cable, 4 units) indicates that some picking has been
completed — but whether this was correctly actioned or whether the picker consulted anyone
before confirming cannot be determined from the image evidence alone.

---

## Fix and Action Required

The following actions are recommended based on the BI report. They are not approved
operational procedures. Management and business validation is required before any action
is treated as a confirmed operational step.

1. **Determine canonical SKU mapping** — directly query the OMS to confirm whether PHSHF1PBRYB
   and PHSF1PBRYB are the same record or two distinct records. If the same: document which
   product description is correct. If different: determine whether the visual similarity is
   causing pick confusion.

2. **Determine the correct product identity for each physical item at 1-F-05-D** — the
   business must confirm whether "1m PVC Cable" and "1m Rubber Cable full set" are:
   (a) two separate products that currently share a SKU (requiring separate canonical SKUs);
   (b) the same product with an incorrectly duplicated or variant listing; or
   (c) a legacy listing that should be archived.

3. **Physically audit stock at 1-F-05-D** — count the physical units present for each
   cable type, compare against system values, and reconcile the -5 negative balance in UK Unit3.

4. **Resolve negative inventory** — after the physical audit, adjust the OMS inventory
   record to reflect actual stock. Do not simply zero the negative balance without confirming
   the physical count.

5. **Confirm full-set handling requirement** — if items arrive from suppliers as full sets,
   determine whether the pick list must represent them as one line (full set) or whether
   component-level listing is acceptable. This is a business decision, not a picking decision.

6. **Review legacy/old-stock records** — identify whether the overlap originated from
   system records that were not updated during a product refresh or SKU revision.

7. **Listen to audio recordings** — the three audio recording pairs in the evidence folder
   may contain additional operational context about the discrepancy. Human review is required.

8. **Confirm whether PHSHF1PBRYB requires one or two canonical SKUs** — this is the key
   business decision that unlocks all downstream corrections. It must be made by a business
   authority, not by the warehouse team or AIOS independently.

---

## AIOS Classification

**Classification: Daily Issue**

The BI report proposes "Decision Required" as a classification. However, "Decision Required"
is not an established AIOS classification category — no existing Daily Issue in the repository
uses this classification, and the importer does not recognise it as a distinct type.

The issue is classified as a Daily Issue: an active operational concern raised on a specific
date, requiring investigation and business decision before it can be resolved. The requirement
for a business decision is recorded in the Fix and Action Required section above. A Daily Issue
remains open until investigation is complete and authorised action is recorded. "Decision Required"
is retained as a descriptive status within the issue body, not as the AIOS classification field.

---

## Knowledge Capture Boundary

The following must NOT be promoted as confirmed AIOS business truth without validation:

| Proposed Rule / Claim | Status |
|----------------------|--------|
| PHSHF1PBRYB must be split into two separate SKUs | PROPOSED — requires business authority decision |
| PVC and Rubber cable products must always use different SKU conventions in the OMS | PROPOSED — no confirmed company-wide policy; not derivable from available evidence |
| Full-set items must universally be represented as a single pick-list line | PROPOSED — no confirmed universal rule; depends on product, supplier, and fulfilment model |
| Old stock caused this discrepancy | UNPROVEN — stated as a possible cause in the BI report only |
| Pick-list preparation staff caused the issue | UNPROVEN — no evidence chain |
| The negative stock (-5) means an incorrect dispatch definitely occurred | UNPROVEN — negative stock is confirmed; the cause is not |
| Both SKU texts (PHSHF1PBRYB and PHSF1PBRYB) are the same OMS record | UNPROVEN — character rendering at image resolution creates ambiguity; requires OMS query |

---

## Duplicate Check

| Comparison | Result |
|------------|--------|
| ISSUE-007 (Phantom Inventory, Metal Cord Clips CGSRBM, Unit4) | GREEN — separate incident. Both involve inventory discrepancy. ISSUE-007 concerns a phantom stock count for a single product at a single location (system says stock exists, physical stock absent). ISSUE-022 concerns two different product descriptions sharing a location under the same or similar SKU, with confirmed negative stock. Different product, different mechanism, different SKU. |
| ISSUE-008 (Picking Image Mismatch, Wire Connectors) | GREEN — closest semantic parallel. Both concern the picking interface presenting ambiguous product information. ISSUE-008 involves the wrong product image appearing for a wire connector variant (with/without hole). ISSUE-022 involves two different product descriptions (PVC vs Rubber Cable) sharing a SKU at the same location. Different product, different mechanism (image mismatch vs SKU/description duplication), different SKU. |
| ISSUE-017 (Pendant Light Fixture Brand and Socket Variation) | GREEN — separate incident. ISSUE-017 concerns two differently branded pendant fixture boxes (Ledsone vs DC Voltage) appearing on the same warehouse shelf with variant identification ambiguity. ISSUE-022 concerns two product descriptions under the same SKU in the OMS pick interface. ISSUE-017 notes (line 237) that Phase2-inputs/issues 22 shows negative inventory for a pendant fixture SKU — this confirms ISSUE-017 already flagged ISSUE-022's evidence as a separate item requiring investigation. |
| ISSUE-013 (Supplier Assembly Delay, SPUPBM, Dependent Component Pairing) | GREEN — separate incident. Both involve component vs full-set handling. ISSUE-013 concerns a specific supplier pausing pre-assembled kit delivery, requiring manual pairing. ISSUE-022 concerns OMS description duplication under one SKU. Different product, different root cause. |
| All other issues (ISSUE-001 through ISSUE-021) | GREEN — no match on PHSHF1PBRYB, PVC Cable, Rubber Cable, 1-F-05-D, negative inventory at this location, or this specific picking discrepancy pattern. |

**Duplicate check result: GREEN. ISSUE-022 is a new and distinct Daily Issue.**

Note: ISSUE-017 (line 237) cross-references the Phase2-inputs/issues 22 evidence folder, confirming it was observed but treated as a separate concern at the time ISSUE-017 was created. This is not a duplicate — it is a forward reference from ISSUE-017 to a not-yet-created ISSUE-022.

---

## Document Gap Decision

**Not created for this issue.**

**Rationale:** The BI report explicitly instructs: do NOT create a Document Gap because
the issue is an operational data misalignment rather than a lack of documentation.

This instruction is consistent with review of the six existing Document Gaps (GAP-001
through GAP-006). None of the existing gaps covers OMS SKU master data management,
product description duplication policies, or negative inventory reconciliation procedures.
These absences could theoretically be structured as document gaps, but the core problem
visible in the evidence is a data integrity issue in the OMS (one SKU record associated
with two descriptions and resulting in negative stock), not the absence of a reusable
documented process.

A Document Gap requires confirmed evidence of a missing reusable documented control that
would be needed repeatedly across multiple products or operations. The current evidence
confirms a specific data misalignment for one SKU. Whether a general SKU naming convention
or a duplicate-description detection policy should exist as a reusable documented control
is a business/process decision that cannot be made from the available evidence alone —
it requires confirmation that the underlying data problem is systemic rather than isolated.

Applying the Document Gap decision rule: the BI instruction is supported by the evidence.
No new gap is created. If investigation reveals this is a systemic pattern across multiple
SKUs, a gap review may be appropriate at that stage.

---

## Evidence

### Evidence Mapping

| File | Repository Path | Dimensions | Size | Non-zero | Mappable |
|------|----------------|-----------|------|---------|---------|
| `2026_07_12_p1.png` | `submission-html/Phase2-inputs/issues 22/2026_07_12_p1.png` | 720×1600px, 8-bit RGB | 281,929 B | YES | YES |
| `2026_07_12_p2.png` | `submission-html/Phase2-inputs/issues 22/2026_07_12_p2.png` | 720×1600px, 8-bit RGB | 384,654 B | YES | YES |

**Evidence paths (URL-encoded for HTML):**
- `Nanthini akka issues/issues%2022/2026_07_12_p1.png`
- `Nanthini akka issues/issues%2022/2026_07_12_p2.png`

---

### Confirmed Visual Observations — p1.png (2026_07_12_p1.png)

| Observation | Confidence |
|-------------|-----------|
| Mobile device picking interface screenshot | HIGH |
| Device time: 7:51, battery: 83% | HIGH — directly readable |
| A product pick card is visible | HIGH |
| Product image on card shows: ceiling rose (black, circular), pendant lamp holder (yellow brass, knurled), black cable (smooth, consistent diameter — consistent with PVC appearance), and an accessory hardware kit (wall plugs, screws, rubber grommets, L-bracket) | HIGH — visually confirmed |
| Label text on product image: "1m PVC Cable" | HIGH — text directly readable |
| Quantity below image: "4" | HIGH — directly readable |
| SKU text: PHSHF1PBRYB | HIGH — directly readable |
| Colour: Yellow Brass | HIGH — directly readable |
| Location: 1-F-05-D | HIGH — directly readable |
| UK Unit18: 500 | HIGH — directly readable |
| UK Unit3: 136 | HIGH — directly readable |
| UK Unit4: 0 | HIGH — directly readable |
| Action button: "Picked" (yellow/gold background) | HIGH — directly readable; indicates this card was already actioned |
| A second partial pick card is visible below, showing a different product (appears to be a wall-mounted bracket arm — not relevant to this issue) | MEDIUM — partially visible |

---

### Confirmed Visual Observations — p2.png (2026_07_12_p2.png)

| Observation | Confidence |
|-------------|-----------|
| Mobile browser screenshot (Chrome on Android) | HIGH |
| Device time: 7:52, battery: 83% (same session as p1, one minute later) | HIGH — directly readable |
| URL bar shows partial domain: "...tageinterior.co.uk" | HIGH — text directly readable; full URL is order.vintageinterior.co.uk based on AIOS CLAUDE.md |
| A partial pick card is visible at the top showing "UK Unit4: 88" and a red "Pick" button (a different product — not related to PHSHF1PBRYB) | MEDIUM — partially visible only |
| A main product pick card is visible in the centre of the screen | HIGH |
| Product image on card shows: ceiling rose (black, circular), pendant lamp holder (yellow brass), cable (darker, appears thicker and more rigid in appearance compared to p1 — consistent with rubber cable appearance) | HIGH — visually confirmed; material type inference is noted as visual appearance only, not a confirmed material specification |
| Label text on product image: "1m Rubber Cable full set" (in italic/cursive font) | HIGH — text directly readable |
| Quantity below image: "1" | HIGH — directly readable |
| SKU text: PHSF1PBRYB | HIGH — text directly readable at this resolution; see SKU Note below |
| Colour: Yellow Brass | HIGH — directly readable |
| Location: 1-F-05-D | HIGH — directly readable |
| UK Unit18: 0 | HIGH — directly readable |
| **UK Unit3: -5** | HIGH — directly readable; negative stock confirmed |
| UK Unit4: 0 | HIGH — directly readable |
| Action button: "Pick" (red background) | HIGH — directly readable; not yet actioned |
| A third pick card is partially visible at the bottom showing "1m PVC Cable" label and the same product image type | HIGH — label text directly readable; card content partially cut off |

**SKU Note — p1 vs p2 character discrepancy:**
p1 reads PHSHF1PBRYB; p2 reads PHSF1PBRYB. The difference is one character (an "H" between "S" and "F"). At 720px image width, closely adjacent identical uppercase letters may visually merge in rendered text. Whether these represent the same OMS record or two distinct SKU identifiers cannot be determined from the images alone. This must be verified by direct OMS database query. Neither reading is assumed to be the correct canonical form in this document.

---

### Audio Recordings (present but not independently transcribed)

| File | Size | Status |
|------|------|--------|
| `recording_2026-07-12_r1.mp3` | 157,869 B | NON-ZERO — available for human review |
| `recording_2026-07-12_r1.ogg` | 45,125 B | NON-ZERO — available for human review |
| `recording_2026-07-12_r2.mp3` | 67,437 B | NON-ZERO — available for human review |
| `recording_2026-07-12_r2.ogg` | 19,502 B | NON-ZERO — available for human review |
| `recording_2026-07-12_r3.mp3` | 76,269 B | NON-ZERO — available for human review |
| `recording_2026-07-12_r3.ogg` | 19,167 B | NON-ZERO — available for human review |

Three recording pairs (r1, r2, r3). All non-zero. Content not independently transcribed.
All claims derived from audio are classified as REPORTED until a human reviewer listens
and transcribes the content. Audio is available in the evidence folder for review.

---

## Required Data

The following data points are needed to resolve this issue. None of these are invented values.

| Data Point | Required Value | Current Status |
|------------|---------------|---------------|
| Canonical OMS SKU for "1m PVC Cable" (Yellow Brass) | From OMS direct query | UNKNOWN |
| Canonical OMS SKU for "1m Rubber Cable full set" (Yellow Brass) | From OMS direct query | UNKNOWN |
| Are PHSHF1PBRYB and PHSF1PBRYB the same or different OMS records? | Requires OMS SKU lookup | UNKNOWN |
| Material type A | PVC (reported/displayed) | REPORTED — image label |
| Material type B | Rubber (reported/displayed) | REPORTED — image label |
| Is each a component-only or full set? | PVC = possibly component; Rubber = labelled "full set" | REPORTED — image labels; physical product definition not confirmed |
| Physical stock count at 1-F-05-D for each cable type | Requires warehouse physical audit | UNKNOWN |
| System stock for "1m PVC Cable" entry by unit | UK Unit18: 500, UK Unit3: 136, UK Unit4: 0 | CONFIRMED from p1 — accuracy subject to audit |
| System stock for "1m Rubber Cable full set" entry by unit | UK Unit18: 0, UK Unit3: -5, UK Unit4: 0 | CONFIRMED from p2 — -5 confirmed negative |
| Source system for SKU records | LEDSone OMS (order.vintageinterior.co.uk) | CONFIRMED from URL in p2 |
| Old-stock / legacy record status | Unknown — requires system history review | UNKNOWN |
| Pick-list line representation (one line or separate) | Unknown — system currently shows two separate pick cards | OBSERVED from images; desired state not confirmed |
| Business validator decision on canonical SKU allocation | Required from SKU/listing authority | PENDING |
| Proposed corrected SKU mapping (if split is approved) | To be determined by business authority | PENDING |

---

## Data Enrichment Block

The following structured record supports future querying, pattern detection, and LLM retrieval.
Values are bounded by confidence level. UNKNOWN / REPORTED / PROPOSED indicate unconfirmed values.

```
issue_id:                   ISSUE-022
sku_primary:                PHSHF1PBRYB
sku_variant_observed:       PHSF1PBRYB (p2 image; character ambiguity noted)
product_description_a:      1m PVC Cable
product_description_b:      1m Rubber Cable full set
material_type_a:            PVC (REPORTED — from pick card label)
material_type_b:            Rubber (REPORTED — from pick card label)
full_set_flag_a:            UNKNOWN (label does not say "full set")
full_set_flag_b:            TRUE (REPORTED — label explicitly says "full set")
colour:                     Yellow Brass (CONFIRMED — both cards)
warehouse_location:         1-F-05-D (CONFIRMED — both cards)
inventory_unit18_a:         500 (CONFIRMED — p1)
inventory_unit3_a:          136 (CONFIRMED — p1)
inventory_unit4_a:          0 (CONFIRMED — p1)
inventory_unit18_b:         0 (CONFIRMED — p2)
inventory_unit3_b:          -5 (CONFIRMED — p2)
inventory_unit4_b:          0 (CONFIRMED — p2)
inventory_value_negative_flag: TRUE (UK Unit3: -5 for description B)
legacy_stock_flag:          UNKNOWN
source_system:              order.vintageinterior.co.uk (LEDSone OMS)
evidence_count:             2 images + 6 audio files (images mapped; audio unverified)
evidence_paths:
  - Phase2-inputs/issues%2022/2026_07_12_p1.png
  - Phase2-inputs/issues%2022/2026_07_12_p2.png
claim_status:
  sku_overlap:              REPORTED (visible in images; OMS record identity unconfirmed)
  negative_stock:           CONFIRMED (UK Unit3: -5 directly readable)
  full_set_misrepresentation: REPORTED (BI report; not confirmed from image evidence alone)
duplicate_check_status:     GREEN — no duplicate in ISSUE-001 through ISSUE-021
document_gap:               None
validation_status:          Open — Under Investigation
business_validator:         PENDING — SKU/listing authority required
classification:             Daily Issue
domain:                     listing
owner:                      SL Listing Team
date_logged:                2026-07-12
next_action:                OMS SKU query to confirm PHSHF1PBRYB vs PHSF1PBRYB record identity
```

---

## Business Logic Block

The following proposed validations are NOT active business rules. They are proposed logic
for future consideration by the appropriate business authority. Each is explicitly marked
PROPOSED / NOT ACTIVE BUSINESS RULE.

```
PROPOSED VALIDATION (not active business rule):
If one system location shows two separate pick cards with different product descriptions
but the same or visually identical SKU identifier, flag for listing team review.
Purpose: detect SKU description duplication before it creates picking ambiguity.

PROPOSED VALIDATION (not active business rule):
If an inventory quantity for any warehouse unit is negative (< 0) for an active SKU,
flag for immediate investigation.
Rationale: a negative inventory value cannot reflect a physical reality; it indicates
a counting error, an over-pick, a missing receipt, or a data migration error.

PROPOSED VALIDATION (not active business rule):
If a product description includes the term "full set" and another pick card at the same
location for the same SKU does not include "full set", flag for product identity review.
Purpose: ensure full-set and component-only listings do not share a SKU.

PROPOSED VALIDATION (not active business rule):
If two OMS pick cards at the same warehouse location share the same SKU but have different
stock levels across multiple warehouse units, flag for inventory audit.
Purpose: stock levels for the same SKU across the same location should be consistent
unless each description is a genuinely separate inventory record.
```

---

## Known Limits

- The SKU character discrepancy between p1 (PHSHF1PBRYB) and p2 (PHSF1PBRYB) cannot be
  resolved from the images alone. An OMS database query is the only authoritative source.
- Image evidence confirms what was displayed in the picking interface on 2026-07-12 at
  approximately 7:51–7:52. It does not confirm the current system state.
- The product images in each pick card visually show cables with different appearances
  (one thinner/smooth, one darker/thicker), which is consistent with PVC vs rubber — but
  image appearance alone does not constitute a confirmed material specification.
- The audio recordings (3 pairs, r1/r2/r3) have not been independently transcribed.
  They may contain additional operational context. Their content remains REPORTED.
- No OMS system export, SKU master data record, purchase order, or product specification
  document has been reviewed. All system-state claims rest on the picking interface screenshots.
- ISSUE-017 line 237 cross-references this evidence folder as a forward observation;
  this does not mean ISSUE-017 covers ISSUE-022's content.
- The third partial card visible at the bottom of p2 shows another "1m PVC Cable" entry,
  suggesting the same product description appears more than once in the pick session.
  This additional card is not fully visible and has not been mapped as evidence.

---

## Owner / Review

| Role | Required Action | Status |
|------|----------------|--------|
| Business Validator / SKU Authority | Confirm canonical SKU identity for "1m PVC Cable" vs "1m Rubber Cable full set" Yellow Brass; authorise SKU correction if split is required | PENDING |
| SL Listing Team | Review OMS SKU record; confirm whether PHSHF1PBRYB and PHSF1PBRYB are the same or different records; correct product descriptions if duplication is confirmed | PENDING |
| Warehouse / Inventory | Physical audit at 1-F-05-D; count actual cable units by type; reconcile negative stock in UK Unit3 | PENDING |
| Audio Reviewer | Listen to all three recording pairs; transcribe any confirmed operational detail about the discrepancy | PENDING |
| Queryability Reviewer | Confirm this asset is self-contained and queryable without verbal context; confirm Data Enrichment Block is complete | PENDING |

No personal approver name is invented. Role-based review is the correct form at this stage.

---

## Pass / Fail Rule

PASS only if all of the following are true:

| Check | Expected |
|-------|---------|
| Exactly one ISSUE-022 MD file exists | Yes — this file only |
| No exact or semantic duplicate Daily Issue exists for PHSHF1PBRYB or this picking discrepancy | Yes — duplicate check is GREEN |
| Document Gap decision is evidence-backed (no new gap created; BI instruction consistent with evidence) | Yes |
| No duplicate Document Gap is created | Yes |
| PHSHF1PBRYB is not invented — it is directly readable in p1.png | Yes |
| Confirmed observations in each image are separated from reported claims | Yes |
| Root cause assumptions remain labelled UNPROVEN / REPORTED | Yes |
| Proposed SKU segregation is not promoted as approved business truth | Yes |
| Full-set handling rule is not promoted as approved universal business rule | Yes |
| Both canonical evidence paths match actual files in evidence folder | Yes — verified in Stage 2 |
| parse_issue_md() returns evidence_paths count == 2 | Expected |
| validate_issue() returns 0 errors | Expected |
| build_evidence_html() returns 2 evidence-link and 2 img tags | Expected |
| ISSUE-022 is not manually inserted into dashboard | Yes — no dashboard modification |
| No dashboard/importer/server file is modified | Yes |
| The asset is queryable without verbal explanation | Yes — Data Enrichment Block and Business Logic Block included |

---

## Next Step

Query the OMS (order.vintageinterior.co.uk) directly to confirm whether PHSHF1PBRYB and
PHSF1PBRYB are the same or different SKU records, and retrieve the canonical product
description, stock history, and pick-list representation for each — this is the single
most important data point needed to define all downstream actions.

---

*Issue logged: 2026-07-12 | Logged by: Vishnusri | OMS SKU query and physical stock audit at 1-F-05-D required before root cause and corrective action can be confirmed*
