# Issue 020 – T185 Bulb Product Listing Image Discrepancy (LDMT185B224)

**Issue ID:** ISSUE-020
**Date Logged:** 2026-07-12
**Logged By:** Vishnusri
**Domain:** listing
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** LDMT185B224
**Document Gap:** None

---

## Executive Summary

A Shopify packlist screenshot captured on 2026-07-12 shows two visually different thumbnail images
displayed for the same SKU (LDMT185B224, T185 4W) on a single picking line. The left thumbnail
shows a tall tubular bulb with a predominantly straight/linear filament. The right thumbnail —
highlighted with a blue handwritten circle and the annotation "B22, 4W" — shows the same
tube-shaped bulb with a different filament pattern. Both thumbnails appear on the same packlist
row for the same order line.

The supplied Business Intelligence Report states that this discrepancy creates picking ambiguity
and identifies this as a recurring issue, reportedly raised approximately ten times over the past
two to three months. The individual prior reports were not independently located during this task.

The immediate operational question is whether warehouse staff picking order LED57730 (8x T185 4W
for Paula Gardner) had access to unambiguous visual guidance to identify the correct product
variant. The listing image discrepancy means the answer is: not from the thumbnails alone.

The supplied BI report also proposes that straight filament = dimmable and cross/spiral filament
= non-dimmable. This relationship is treated as REPORTED — TO BE VERIFIED, not confirmed AIOS
knowledge. See Knowledge Capture Boundary below.

---

## Issue Summary

The Shopify picking interface for SKU LDMT185B224 (T185 4W bayonet filament bulb) displays two
different thumbnail images on the same packlist line. The thumbnails appear side-by-side in the
packlist view and show different filament patterns, creating ambiguity about which physical
product variant the picker should select.

Warehouse staff rely on packlist thumbnails as the primary visual reference when picking
multi-line orders. When the same SKU shows two conflicting thumbnails, staff cannot determine
from the listing alone which variant is the correct one for the order.

The discrepancy was captured in a packlist screenshot for order LED57730 (2026-07-11, SHOPIFY
ledsone, UK Unit3). The order contains 8 units of T185 4W under SKU LDMT185B224.

---

## Confirmed Visual Observations

The following were directly observed in the photographic evidence (`2026_07_12_p1.png`):

| Observation | Evidence Source | Status |
|-------------|----------------|--------|
| The Shopify packlist shows order LED57730, dated 2026-07-11 15:22:34 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| The order channel is SHOPIFY - ledsone | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| The order is tagged "multi_line" and "zzzmerge_order" | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| The fulfilment location is UK Unit3 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Courier designation: DPD Packlist L u3 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Order total: £85.58 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Customer: Paula Gardner, 26B Skelmorlie Castle Road, Scotland, Skelmorlie, PA17 5AL, United Kingdom | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 1 product name: "Vintage style b22 bayonet filament bulb~2318 - T185 4W" | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 1 SKU: LDMT185B224 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 1 variant_title: T185 4W | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 1 quantity: 8 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 1 left thumbnail (blue-bordered box): shows a tall tubular/cylindrical vintage bulb with a predominantly vertical/straight filament arrangement | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — directly visible in image |
| Line 1 right thumbnail (yellow-bordered box): shows a tall tubular bulb that appears to have a different filament arrangement compared to the left thumbnail | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — two visually distinct thumbnails are present |
| The right thumbnail has a blue handwritten circle drawn around it | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — annotation directly visible |
| A handwritten blue annotation "B22, 4W" appears beneath the right thumbnail of line 1 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Two different images are displayed for the same SKU LDMT185B224 on a single packlist line | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — directly observable from the image layout |
| Line 2 product name: "Vintage style b22 bayonet filament bulb~2318 - T45 4W" | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 2 SKU: LDMT45B224 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 2 variant_title: T45 4W | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 2 quantity: 14 | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — text directly readable |
| Line 2 right thumbnail has a handwritten blue circle annotation with "D" inside it and "B22, 4W" written beneath | `Phase2-inputs/issues 20/2026_07_12_p1.png` | CONFIRMED — annotation directly visible |

**Confirmed image dimensions and integrity:**
- File: `2026_07_12_p1.png`
- Dimensions: 1600 × 382 pixels, 8-bit/colour RGB, non-interlaced
- File size: 207 KB — non-zero, valid image

**Limits on visual observation:**

The two T185 thumbnails are small within the 1600×382 image. While both filament patterns
are visible and clearly differ from each other, the precise classification of each pattern
(whether definitively "straight" vs "cross/spiral") cannot be stated with complete certainty
from the thumbnail resolution alone. The confirmed fact is that the two thumbnails show
visually distinct filament patterns. The classification of those patterns aligns with the
BI report's description but is not independently confirmed at the level of a technical
product specification.

---

## Reported / Source-Supplied Claims

The following claims are drawn from the supplied Business Intelligence Report. They have
not been independently confirmed from repository evidence and must not be treated as
confirmed operational facts until verified.

| Reported Claim | Source | Verification Status |
|----------------|--------|---------------------|
| The Shopify listing for SKU LDMT185B224 shows conflicting straight vs spiral/cross filament images | Supplied BI Report | REPORTED — left thumbnail appears consistent with this; right thumbnail annotation visible; full description consistent with image evidence but the filament classification depends on BI report characterisation |
| The discrepancy has been raised approximately ten times over the past two to three months | Supplied BI Report | REPORTED — individual prior reports not independently located during this task |
| The listing has remained uncorrected despite repeated reports | Supplied BI Report | REPORTED — cannot be confirmed from the single screenshot |
| Operational staff have identified the issue during the picking process | Supplied BI Report | REPORTED — supported indirectly by the handwritten annotations in the screenshot, but the origin of the screenshot is not independently confirmed |
| The audio recording describes the T185 listing discrepancy | Audio file (recording_2026-07-12_r1.mp3, recording_2026-07-12_r1.ogg) | REPORTED — audio files exist; content not independently transcribed or verified |
| The "D" annotation on the T45 line 2 right thumbnail refers to "Dimmable" | Supplied BI Report (implied) | REPORTED — "D" is visible but its meaning is not confirmed from the image alone |

**Audio recordings present (available for human review — NOT independently transcribed):**
- `submission-html/Phase2-inputs/issues 20/recording_2026-07-12_r1.mp3`
- `submission-html/Phase2-inputs/issues 20/recording_2026-07-12_r1.ogg`

Audio content has not been independently verified. All claims derived from the audio remain
REPORTED until a human reviewer listens to and transcribes the recordings.

---

## Unproven Assumptions

The following must not be recorded as confirmed facts or operational rules without further
investigation and reviewer confirmation:

- That the left thumbnail is the correct image for the LDMT185B224 variant that should be picked
- That the right thumbnail is the incorrect image that should be removed or replaced
- That the straight filament = dimmable relationship is a universal rule for all LEDSone T185 products
- That the cross/spiral filament = non-dimmable relationship is a universal rule for all LEDSone T185 products
- That the administrative team responsible for Shopify listing maintenance has been informed and has chosen not to act
- That any incorrect items have actually been shipped to any customers as a result of this discrepancy
- That the "D" on the T45 line 2 annotation stands for "Dimmable"
- That the T45 line in the same screenshot is subject to the same type of discrepancy
- That the ten previously reported instances are documented anywhere in the AIOS inbox
- That the listing error is specific to the Shopify channel and does not appear on other platforms

---

## Current Operational Process

Warehouse staff use the Shopify packlist and associated product thumbnail images to identify,
pick, and verify items for customer orders. The process relies on visual cues — including
filament shape — to distinguish between product variants during multi-line picking.

When a packlist displays two conflicting thumbnails for the same SKU and picking line, staff
must choose which image to follow, or rely on product knowledge that is not captured in the
picking system.

For order LED57730 (8 units of T185 4W), the picking screen showed two different thumbnails
for LDMT185B224 with no system-level indication of which was correct.

---

## Business Problem

The Shopify product listing for SKU LDMT185B224 (T185 4W) displays two conflicting thumbnail
images on the same packlist line. This creates ambiguity at the point of picking: warehouse
staff cannot determine from the listing alone which physical product variant to select.

- **Listing image inconsistency** — the same picking line for LDMT185B224 shows two thumbnails
  with visually different filament arrangements, creating an unresolvable visual signal without
  additional product knowledge.
- **Picking guidance is compromised** — the packlist is the primary operational reference for
  identifying the correct product. When the primary reference is self-contradictory, the picking
  process depends on informal knowledge rather than system data.
- **Variant ambiguity** — if LDMT185B224 represents one specific product variant (e.g., one
  filament type), the listing should show a single consistent image for that variant. Two
  different images suggest either the listing data is incorrect or that the SKU is mapped to
  multiple variant images inappropriately.

---

## Root Cause / Current Root Cause Status

Root cause: **NOT YET CONFIRMED.**

The immediate observation is that the Shopify packlist for SKU LDMT185B224 shows two different
thumbnail images for a single order line. The reason this discrepancy exists has not been
independently established.

Possible explanations (REPORTED or INFERRED — none confirmed):

| Possible Cause | Status |
|----------------|--------|
| The SKU is incorrectly mapped to two different variant images in the Shopify listing | INFERRED — consistent with the screenshot evidence |
| The Shopify listing was incorrectly configured during a product setup or listing update | INFERRED — not confirmed; no change history available |
| The administrative team has been informed but the correction has not been applied | REPORTED — stated in BI report; not independently confirmed |
| LDMT185B224 represents two product variants that were inadvertently merged into one SKU | INFERRED — possible but not supported by any direct evidence |
| The T185 range includes both dimmable and non-dimmable variants and the SKU-to-image mapping has not been correctly maintained | REPORTED — consistent with BI report; the dimmable/non-dimmable relationship is not independently confirmed |

---

## Business Impact

**REPORTED / POTENTIAL — not confirmed as having already occurred:**

The supplied BI report identifies the following potential business impacts. These are treated as
risks until direct evidence of actual incidents is provided:

| Potential Impact | Status |
|-----------------|--------|
| Incorrect variant shipment (wrong filament type dispatched) | RISK — not confirmed as having occurred |
| Customer dissatisfaction and negative reviews | RISK — no customer feedback evidence in repository |
| Return shipping cost arising from incorrect items | RISK — no return records linked to this issue |
| Repeated operational effort from multiple reports of the same issue | REPORTED — BI report states approximately ten prior reports; not independently confirmed |
| Warehouse staff repeatedly flagging the same listing issue without resolution | REPORTED — supported by the annotation style in the screenshot (annotated images suggest escalation); not confirmed as ten separate incidents |

---

## Operational Risks

The following risks arise from the confirmed observation (two conflicting thumbnails for the
same SKU on a live Shopify picking screen):

| Risk | Description |
|------|-------------|
| Picking ambiguity at point of selection | Staff cannot use the listing thumbnails alone to identify the correct product variant; each pick depends on informal product knowledge |
| Incorrect variant dispatch | If the wrong filament variant is picked, customers receive a product that may not match their intended selection (e.g., dimmable vs non-dimmable, if the dimmable/non-dimmable distinction applies — REPORTED, NOT CONFIRMED) |
| Staff frustration and informal workaround dependency | Repeated exposure to a known inaccurate listing may cause staff to develop informal workarounds that are not documented and may not be applied consistently |
| Reduction in trust of listing data | If staff know the listing is inaccurate for one SKU, confidence in other listing data may be affected |
| Risk of quality control decline | Repeated tolerance of known inaccurate data in the picking system normalises the use of informal knowledge as a substitute for system accuracy |

---

## Existing Workaround

**REPORTED — not independently confirmed as a formal process:**

Warehouse staff reportedly rely on internal product knowledge, manual visual comparison, or
memory to distinguish the T185 variants despite the listing discrepancy. No formal or
documented workaround exists. The adequacy and consistency of this informal approach across
all staff members is unknown.

---

## Recommended Next Actions

The following steps are recommended pending reviewer approval. They are not confirmed
operational rules.

1. **Verify the live Shopify listing for SKU LDMT185B224** — confirm which images are
   currently mapped to this SKU in the Shopify listing admin panel. Establish whether two
   separate variant images exist and, if so, which is assigned to which product record.

2. **Physically verify the T185 product variants** — obtain physical samples of the T185
   4W variants available in stock and identify their filament types against the Shopify
   images. Confirm whether "straight" and "cross/spiral" accurately describe the physical
   distinction between variants.

3. **Confirm the dimmable/non-dimmable relationship before recording it as AIOS knowledge**
   — check product specifications, packaging, or supplier documentation. Do not promote
   straight=dimmable / cross=non-dimmable as a confirmed operational rule until product
   evidence supports it.

4. **Correct the Shopify listing image only after verification** — once the correct variant
   image for LDMT185B224 is confirmed, update the listing. Do not guess which image is correct
   based on the screenshot alone.

5. **Check related T-series listings** — consider auditing T45 and any other T-series bulb
   SKUs for similar image inconsistencies, given that the T45 line in the same screenshot
   also has annotations suggesting possible discrepancy.

6. **Confirm whether an image verification step exists for listing updates** — determine
   whether any documented process currently requires image accuracy to be checked before or
   after a listing goes live. If no such process exists, flag for future review (this task
   does not create a Document Gap; see Document Gap section).

---

## AIOS Classification

| Field | Value |
|-------|-------|
| **Classification** | Daily Issue |
| **Reason** | Active listing data inaccuracy directly affecting picking operations on a live Shopify order |

**Why NOT "Decision Required":**

The supplied BI report proposes "Decision Required" as the classification, reasoning that
the issue has been raised repeatedly without resolution and may require an owner/resource
decision to correct the listing.

This classification is not adopted. Comparable issues in the AIOS — including ISSUE-008
(picking image mismatch, wire connectors), ISSUE-016 (assembly instruction component
quantity), ISSUE-017 (brand and socket variation), and ISSUE-019 (technical specifications
discrepancy) — are all classified as Daily Issue regardless of recurrence or escalation
history. "Decision Required" is not an established status convention in the current AIOS
issue taxonomy.

The operational requirement for escalation and a listing correction decision is captured in
the Fix and Action Required section. The classification remains Daily Issue.

---

## Knowledge Capture Boundary

**PROPOSED PRODUCT RULE — NOT YET VALIDATED:**

The supplied BI report proposes the following product knowledge:

| Proposed Rule | Source | Status |
|---------------|--------|--------|
| T185 Dimmable Bulbs have a straight filament | Supplied BI Report | PROPOSED — NOT YET VALIDATED against physical product or product specification documentation |
| T185 Non-Dimmable Bulbs have a cross/spiral filament | Supplied BI Report | PROPOSED — NOT YET VALIDATED against physical product or product specification documentation |
| Picking interface images for T185 variants should be distinct and consistent | Supplied BI Report | PROPOSED — operationally sensible but the specific image correction required has not been confirmed |

Do NOT promote the straight=dimmable and cross/spiral=non-dimmable relationship as confirmed
AIOS truth. These must be validated against physical product samples, packaging specifications,
or authoritative product documentation before being recorded as reusable operational knowledge.

Until validated:
- All references to dimmable/non-dimmable variants in this document are labelled as REPORTED
  or PROPOSED, not confirmed.
- Staff should not use this document as the basis for SKU-to-variant identification without
  independent confirmation.

**Future AIOS Recommendation (not approved):**

The supplied BI report suggests implementing a Listing Accuracy Audit during product onboarding
or variant updates — a secondary check to verify that thumbnail images and technical/product
attributes match physical stock before a listing goes live. This is a recommendation only.
It is not an approved operational rule and must not be treated as AIOS-confirmed process.

---

## Duplicate Check

| Comparison | Result |
|------------|--------|
| ISSUE-008 (Picking Image Mismatch, Wire Connectors, CODL632AGYAPK) | GREEN — separate incident. Different product (wire connectors vs T185 bulbs), different SKU. Structurally related class of problem (picking image inaccuracy) but distinct. No T185 or LDMT185B224 reference in ISSUE-008. |
| ISSUE-009 (Incorrect Packaging, White Light Socket, LHRUE27WH) | GREEN — separate incident. Different product, different failure mode (packaging vs listing images). |
| ISSUE-010 (Missing Twisted and Hook Lamp Holder Variants) | GREEN — separate incident. Concerns variant range gaps, not conflicting listing images. |
| ISSUE-011 (Assembly Hardware Mismatch, WC SLBM) | GREEN — separate incident. Assembly hardware, not bulb listing images. |
| ISSUE-012 (Cable Crowding, Ceiling Rose) | GREEN — separate incident. Different product and failure mode. |
| ISSUE-013 (Supplier Assembly Delay, Black Mount) | GREEN — separate incident. Different product and failure mode. |
| ISSUE-016 (Assembly Instruction Quantity Discrepancy, DWC112025) | GREEN — separate incident. Assembly instruction content, not Shopify listing images. |
| ISSUE-017 (Pendant Light Fixture Brand and Socket Variation) | GREEN — separate incident. Brand/socket identification, not bulb listing image mismatch. |
| ISSUE-018 (Universal Bracket Instruction Manual Hardware Mismatch) | GREEN — separate incident. Assembly instruction applicability, not listing images. |
| ISSUE-019 (Technical Specifications Discrepancy, CRFF2404BM) | GREEN — separate incident. Measurement specification error, not Shopify listing image discrepancy. |
| T185, LDMT185B224, filament, dimmable, non-dimmable across all existing issues and gaps | NO MATCH — none of these terms appear in any existing Daily Issue or Document Gap |
| Shopify, picking image, thumbnail, listing image across all existing issues and gaps | Only ISSUE-008 matches (picking image mismatch) — different product and SKU; not a duplicate |

**Duplicate check result: GREEN. ISSUE-020 is a new and distinct Daily Issue.**

The supplied BI report states the discrepancy has been raised approximately ten times over the
past two to three months. The individual ten prior reports were not independently located during
this task. No existing AIOS Daily Issue records a prior report of LDMT185B224 image discrepancy.
ISSUE-020 is the first AIOS record of this specific listing issue.

---

## Document Gap

**Not created for this issue.**

The supplied BI report explicitly states: "Do NOT create a Document Gap; the issue is an
unexecuted update to the digital listing, not a lack of procedural documentation."

Repository gap check: all six existing Document Gaps were searched. No existing gap covers
Shopify listing image accuracy, variant thumbnail consistency, or picking interface image
verification. GAP-006 (Assembly Instruction Technical Sign-Off and Product-to-Manual
Verification) is the closest structurally, but it concerns physical product-to-printed-manual
verification before mass printing — not digital Shopify listing image maintenance.

**Gap decision:** The immediate root cause appears to be an unexecuted digital listing
correction — a specific image linked to SKU LDMT185B224 needs to be updated. This is not,
on current evidence, the result of an absent documented process. A Document Gap would only
be appropriate if investigation confirms that a missing or absent process contributed to the
image error being applied or to the absence of a check that would have caught it before the
listing went live. That determination requires investigation.

**No new Document Gap is created at this stage.**

If investigation establishes that no image verification step exists for listing updates and
that this absence is a reusable structural control gap (not covered by any existing gap),
a new Document Gap may be raised at that stage. That assessment is deferred to the reviewer.

---

## Fix and Action Required

DECISION REQUIRED before action is confirmed. The following steps are recommended pending
reviewer approval. They are not approved operational rules.

1. **Verify the Shopify listing for LDMT185B224** — confirm which images are mapped to this
   SKU and identify the source of the conflicting thumbnails.
2. **Physically verify the T185 variants** — confirm filament types against physical product
   samples. Do not correct the listing based on the screenshot alone.
3. **Confirm dimmable/non-dimmable mapping** — obtain product specification confirmation
   before recording as AIOS knowledge.
4. **Correct the listing after confirmation** — update only the image(s) that are confirmed
   as incorrect after physical verification.
5. **Check T45 and related T-series listings** — review LDMT45B224 and similar SKUs for the
   same type of image inconsistency, given that the T45 line in the same screenshot also
   shows annotations.
6. **Review whether a Document Gap is warranted** — once the root cause of the image
   discrepancy is established, determine whether the absence of a listing image verification
   process should be recorded as a new Document Gap.

---

## Domain Boundary

**Domain: listing**

The issue directly concerns product listing data accuracy on the Shopify platform. The
LDMT185B224 listing shows conflicting thumbnail images, creating picking ambiguity. The
domain assignment is consistent with ISSUE-016, ISSUE-018, and ISSUE-019.

---

## Pass / Fail Rule

| Check | Status |
|-------|--------|
| ISSUE-020 ID free (no duplicate in dashboard or inbox) | ✅ Confirmed before creation |
| No semantic duplicate in ISSUE-001 through ISSUE-019 | ✅ Confirmed |
| Evidence image exists on disk | ✅ Confirmed (2026_07_12_p1.png, 207 KB, non-zero) |
| Confirmed observations and unproven/reported claims separated | ✅ |
| SKU LDMT185B224 confirmed from image evidence (readable directly) | ✅ |
| Two conflicting thumbnails confirmed from image p1 | ✅ |
| Audio content classified as REPORTED, not independently confirmed | ✅ |
| Straight=dimmable / cross=non-dimmable NOT promoted as confirmed AIOS truth | ✅ |
| Document Gap decision evidence-backed (no new gap; reasoning documented) | ✅ |
| No Document Gap created | ✅ |
| Priority not invented — marked TBD | ✅ |
| Classification chosen from repository evidence (Daily Issue, not "Decision Required") | ✅ |
| Evidence paths use canonical importer-compatible format | ✅ |
| Audio files noted separately; not in canonical image evidence list | ✅ |

---

## Known Limitations

- The audio recordings have not been independently transcribed. All claims about what the audio
  states regarding the T185 listing discrepancy depend on the supplied BI Report and must be
  treated as REPORTED, not confirmed.
- The filament pattern classification ("straight" vs "cross/spiral") is drawn from the BI
  report's characterisation. The thumbnails in the image are small and the precise filament
  classification cannot be stated with absolute certainty from thumbnail resolution alone.
  However, the two thumbnails are visually distinct from each other — this difference is
  confirmed.
- The dimmable/non-dimmable relationship has NOT been confirmed from any repository evidence
  or direct product inspection. It remains a proposed product rule.
- The ten prior reports are not independently located. No prior AIOS Daily Issue records this
  specific discrepancy.
- The correct image (which thumbnail should be used for LDMT185B224) has not been determined.
  This requires physical product verification.
- The T45 line annotations in the same screenshot are noted as observed but the T45 issue
  (LDMT45B224) has not been independently diagnosed and is not the subject of this ISSUE-020.

---

## Evidence

### Evidence Mapping — ISSUE-020 (Photographic)

| File | Repository Path | Content | Confidence |
|------|----------------|---------|-----------|
| `2026_07_12_p1.png` | `submission-html/Phase2-inputs/issues 20/2026_07_12_p1.png` | Shopify packlist for order LED57730 showing SKU LDMT185B224 (T185 4W, Qty 8) with two conflicting thumbnails; left in blue box, right in yellow box with blue handwritten circle and "B22, 4W" annotation | HIGH — order number, SKU, variant title, and conflicting thumbnails directly readable |

**Evidence paths (URL-encoded for HTML):**
- `Nanthini akka issues/issues%2020/2026_07_12_p1.png`

Audio recordings present (available for human review — NOT independently transcribed):
- `submission-html/Phase2-inputs/issues 20/recording_2026-07-12_r1.mp3`
- `submission-html/Phase2-inputs/issues 20/recording_2026-07-12_r1.ogg`

Audio files have not been independently transcribed and are not mapped as confirmed evidence.
They are available for human review. All audio-derived claims remain REPORTED until
independently verified.

---

## Next Step

This issue is ready for dashboard import via the Add Latest Issues button once this file is
saved. The dashboard automation (tools/serve.py / Add Latest Issues flow) will detect ISSUE-020
as a new inbox issue and make it available for import.

After dashboard import, the following reviewer actions are required before this issue can move
beyond investigation status:

1. Listen to the audio recordings and confirm what they describe regarding the T185 image
   discrepancy.
2. Physically verify the T185 4W product variants and confirm their filament types.
3. Confirm or deny the straight=dimmable / cross=non-dimmable relationship against product
   specifications or packaging.
4. Check and correct the Shopify listing for LDMT185B224 based on confirmed product evidence.
5. Review the T45 (LDMT45B224) line from the same screenshot to determine whether a separate
   Daily Issue should be created.
6. Determine whether the absence of a listing image verification process warrants a new
   Document Gap.
7. Update this issue status once the listing is corrected and verified.

---

*Issue logged: 2026-07-12 | Logged by: Vishnusri | Listing correction and physical product verification required before this issue can be resolved*
