# Issue 051 — AC220V LED Module Packlist Identifier and Voltage Discrepancy

**Issue ID:** ISSUE-051
**Date Logged:** 2026-07-22
**Logged By:** Vishnusri
**Domain:** listing
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** IMAC7714CWNPK / IMAC9820CWNPK
**Document Gap:** gap-009-ac220v-led-module-packlist-voltage-and-size-identifier-accuracy.md

---

> **BI Report Classification: Document Gap.**
> The supplied Business Intelligence Report classifies this issue as a
> Document Gap because the picking documentation does not clearly or
> accurately present the required voltage (AC220V) or physical size
> identifiers (7714/9820). A linked Document Gap asset — GAP-009 — has
> been created to represent the specific missing documentation requirement.
> The ISSUE-051 canonical asset uses Classification: Daily Issue for
> importer pipeline compatibility. The "Document Gap" classification and
> the full documentation requirement are captured in GAP-009.

---

## Issue Summary

Warehouse staff have identified a discrepancy between the physical labelling
of AC220V LED modules and the information displayed in the digital picking
document (Packlist.htm).

Two distinct AC220V LED module variants are in use:

- **7714-3LED** — Size: 7714-3LED, Voltage: AC220V, Power: 2W, Color:
  WHITE(6000K), QTY: 200 PCS per bag (SKU: IMAC7714CWNPK)
- **9820-3LED** — Size: 9820-3LED, Voltage: AC220V, Power: 2W, Color:
  6000K, QTY: 100 PCS per bag (SKU: IMAC9820CWNPK)

The Packlist.htm product title for both variants states **"12V"**, while
the physical product labels clearly state **AC220V**. A manual red-text
annotation "SEND 220V" has been added to the 7714 variant's packlist entry
as an unofficial override, but this creates a conflicting-instruction
situation (title says 12V; annotation says 220V) and is not a formal
picking SOP.

The physical size identifiers 7714 and 9820 — which are printed clearly on
the physical product bags — are embedded only in the SKU string
(IMAC7714CWNPK, IMAC9820CWNPK) in the packlist, not presented as
standalone, human-readable picking identifiers.

**No product titles, packlist entries, master data, or physical labels have
been modified in this task.**

**Linked Document Gap: GAP-009**
`intelligence-inbox/document-gaps/gap-009-ac220v-led-module-packlist-voltage-and-size-identifier-accuracy.md`

---

## Classification

Daily Issue (BI report classification: Document Gap — see GAP-009)

---

## Current Operational Process

**Confirmed from evidence (images p1 and p2) and BI report:**

- Warehouse staff use Packlist.htm to fulfil international orders. The
  packlist is loaded from the Dropbox path visible in evidence:
  `C:/Users/Ledsone/Dropbox/Unit - 3 Postage Folder/2026/July/22.07.2026/
  1st booking/Others/Others/Packlist.htm`
- The packlist lists items by product title and SKU. For both AC220V LED
  module variants, the current product title is:
  "200 * LED Modul **12V** Wasserdicht 1.5W für Lichtwerbung ~3742 - Kaltweiß"
- For SKU IMAC7714CWNPK (Typ 3 / 7714 variant), a manual red-text
  annotation "SEND 220V" appears above the product title to signal that
  the correct product is AC220V, not 12V.
- For SKU IMAC9820CWNPK (Typ 1 / 9820 variant), the same "12V" title
  appears on the packlist without a confirmed equivalent annotation visible
  in the available evidence.
- Physical product bags bear clearly printed labels identifying each
  variant by size code (7714-3LED and 9820-3LED), voltage (AC220V),
  power (2W), colour (6000K), and quantity (200 PCS for 7714; 100 PCS
  for 9820).
- Both orders are flagged as INTERNATIONAL, SHOPIFY - ledsone.de channel,
  routed through UK Unit3.

---

## Business Problem

- **The product title in the picking document states the wrong voltage.**
  The packlist title says "12V" for a product that is AC220V. Any picker
  relying on the product title for voltage identification is given
  incorrect information.
- **The manual "SEND 220V" annotation is the only voltage correction
  visible for the 7714 order, and it conflicts with the title on the same
  entry.** This is a workaround, not an approved system-level correction.
- **Physical size identifiers 7714 and 9820 are not presented as
  standalone readable picking descriptors.** They appear embedded in the
  SKU string but not as a human-readable match for the physical bag label
  (which reads "Size: 7714-3LED" or "Size: 9820-3LED").
- **Two variants with the same incorrect title can be confused during
  picking.** Both IMAC7714CWNPK and IMAC9820CWNPK share the same product
  title, making it harder to distinguish which physical bag to pick without
  decoding the SKU or relying on the physical bag label.

---

## Known Facts — Confirmed from Evidence Images

| Field | Detail | Evidence |
|-------|--------|----------|
| **Date of operational review** | 2026-07-22 | All evidence filenames |
| **Physical label — 7714 size code** | "Size: 7714-3LED" | `p2.png` — directly readable |
| **Physical label — 9820 size code** | "Size: 9820-3LED" | `p2.png` — directly readable |
| **Physical label — 7714 voltage** | AC220V | `p2.png` — directly readable |
| **Physical label — 9820 voltage** | AC220V | `p2.png` — directly readable |
| **Physical label — 7714 power** | 2W | `p2.png` — directly readable |
| **Physical label — 9820 power** | 2W | `p2.png` — directly readable |
| **Physical label — 7714 colour** | WHITE(6000K) | `p2.png` — directly readable |
| **Physical label — 9820 colour** | 6000K | `p2.png` — directly readable |
| **Physical label — 7714 quantity** | QTY: 200 PCS | `p2.png` — directly readable |
| **Physical label — 9820 quantity** | QTY: 100 PCS | `p2.png` — directly readable |
| **Packlist product title (both)** | "200 * LED Modul **12V** Wasserdicht 1.5W für Lichtwerbung ~3742 - Kaltweiß" | `p1.png` — directly readable |
| **"SEND 220V" annotation** | Shown in red above the 7714 order title | `p1.png` — directly readable |
| **SKU in packlist — 7714 variant** | IMAC7714CWNPK | `p1.png` — directly readable |
| **SKU in packlist — 9820 variant** | IMAC9820CWNPK | `p1.png` — directly readable |
| **Variant title — IMAC7714CWNPK** | Kaltweiß (Typ 3) | `p1.png` — directly readable |
| **Variant title — IMAC9820CWNPK** | Kaltweiß (Typ 1) | `p1.png` — directly readable |
| **Packlist file path** | Dropbox/Unit - 3 Postage Folder/2026/July/22.07.2026/1st booking/Others/Others/Packlist.htm | `p1.png` address bar — directly readable |
| **Storage location** | UK Unit3 | `p1.png` — directly readable |
| **Channel** | SHOPIFY - ledsone.de | `p1.png` — directly readable |
| **Conflict confirmed** | Physical labels: AC220V; Packlist title: 12V — direct contradiction | `p1.png` + `p2.png` |

---

## Evidence Strength Summary

| Claim | Status |
|-------|--------|
| Size: 7714-3LED (physical label) | VERIFIED — directly readable from `p2.png` |
| Size: 9820-3LED (physical label) | VERIFIED — directly readable from `p2.png` |
| Voltage AC220V on 7714 physical label | VERIFIED — directly readable from `p2.png` |
| Voltage AC220V on 9820 physical label | VERIFIED — directly readable from `p2.png` |
| Power 2W on both physical labels | VERIFIED — directly readable from `p2.png` |
| Color WHITE(6000K) on 7714 physical label | VERIFIED — directly readable from `p2.png` |
| Color 6000K on 9820 physical label | VERIFIED — directly readable from `p2.png` |
| QTY 200 PCS for 7714 (physical label) | VERIFIED — directly readable from `p2.png` |
| QTY 100 PCS for 9820 (physical label) | VERIFIED — directly readable from `p2.png` |
| "12V" in packlist product title | VERIFIED — directly readable from `p1.png` |
| "SEND 220V" in red on packlist | VERIFIED — directly readable from `p1.png` |
| SKU IMAC7714CWNPK | VERIFIED — directly readable from `p1.png` |
| SKU IMAC9820CWNPK | VERIFIED — directly readable from `p1.png` |
| 7714 and 9820 absent as standalone picking identifiers | VERIFIED — neither code appears as a standalone label in the packlist description; only embedded in SKU string |
| AC220V correct for both variants | VERIFIED from physical labels — consistent with "SEND 220V" annotation direction |
| 6000K applies to both 7714 and 9820 | VERIFIED — stated on both physical labels |
| 7714 and 9820 share the same product title text | VERIFIED — identical "12V" title visible for both |
| Pack quantities differ (200 vs 100) | VERIFIED — 7714: 200 PCS, 9820: 100 PCS; physical labels directly confirm |
| "1 X 200 pack" shown in packlist | VERIFIED — visible on packlist entries for both orders |

---

## Assumptions — Not Confirmed Facts

1. **The "12V" product title originated from a generic or older 12V product
   template.** This is the hypothesis proposed in the BI report. It is not
   confirmed from available evidence — the origin of the 12V title has not
   been independently established.

2. **The "SEND 220V" annotation is consistently applied across all packlist
   instances for the 7714 variant.** Only the specific packlist instance
   visible in evidence confirms this annotation. Whether it appears on every
   future or previous instance has not been confirmed.

3. **The absence of a visible "SEND 220V" annotation for the 9820 variant
   means no annotation exists for it.** Only one packlist screenshot is
   available for the 9820 order. A different annotation format, or absence
   of annotation, may exist in other instances.

4. **An incorrect-voltage product has been shipped as a result of this
   discrepancy.** This is a risk — no confirmed shipping error or customer
   complaint attributable to this discrepancy has been independently evidenced.

> **Do not treat any of the above as confirmed facts. Do not update product
> titles, packlist data, or SKU descriptions based on these assumptions
> without independent validation and approval.**

---

## Root Cause — Not Yet Confirmed

The underlying reason the product title contains "12V" for an AC220V product
has not been established from available evidence.

**Investigation hypothesis:** The product title may originate from a generic
or older 12V LED module product template that was not updated when the AC220V
variant was created or introduced. This is an assumption only — not confirmed.

Do not state the generic/template origin as the confirmed root cause.

---

## Business Impact

- **Picking staff face conflicting voltage information.** The packlist title
  states 12V and the manual annotation states 220V — two different voltages
  for the same product on the same entry. The correct voltage to act on
  is not unambiguous to a picker reading the entry without prior knowledge.
- **Size-variant identification requires decoding the SKU or reading the
  physical bag.** Without 7714/9820 appearing as standalone picking labels,
  pickers cannot reliably distinguish the two variants from the digital
  description alone.
- **The manual annotation is an informal workaround.** It depends on a
  specific person applying it correctly each time the packlist is generated.
  It is not a formally approved or documented picking instruction.

Do not infer: specific number of picking errors, financial loss, confirmed
customer complaints, or confirmed incorrect-voltage shipments. None were
independently evidenced.

---

## Operational Risks

- **Voltage picking error.** If the "SEND 220V" annotation is absent,
  overlooked, or misunderstood, a picker relying on the "12V" product title
  may select the wrong voltage product or apply incorrect voltage handling.
- **Potential operational and safety concern.** Confusing a 12V and AC220V
  product at the picking or dispatch stage carries a potential operational
  and safety risk. No actual safety incident or incorrect-voltage shipment
  has been confirmed from current evidence — this is a risk arising from the
  documentation gap.
- **Size-variant picking confusion.** Without clear 7714/9820 identifiers in
  the picking description, pickers must rely on bag-label reading or SKU
  decoding. If the wrong bag is picked, the customer receives a different
  LED module size.
- **Annotation dependency.** The "SEND 220V" workaround creates a
  single-point-of-failure: if the annotating person is unavailable or
  the annotation is omitted, there is no other voltage signal in the
  document to override the incorrect "12V" title.

---

## Existing Workaround

The current reported operational workaround is:

1. **Manual red-text "SEND 220V" annotation** added to the IMAC7714CWNPK
   packlist entry to signal the correct voltage to the picker.
2. **Staff/supervisor manual clarification** as needed.

Both are confirmed as informal practices — not formally documented SOPs or
approved operational standards. The "SEND 220V" annotation is
**VERIFIED** from `p1.png`. Its application to the 9820 variant and to
all future/previous packlist instances has not been independently confirmed.

---

## Recommended Next Actions

The following are recommended next actions from the supplied BI report. They
are recommendations only — not completed actions or approved changes. Each
requires validation and approval before implementation.

1. **Update product titles for AC220V LED module SKUs so the correct voltage
   (AC220V) is clearly stated.** Remove the incorrect "12V" reference. Verify
   the physical product specification before changing the title.

2. **Add 7714 and 9820 as explicit, prominent picking identifiers in the
   picking description.** Ensure the size code matches the physical bag label
   so pickers can make a direct visual match.

3. **Verify the 6000K colour temperature specification.** The 6000K value is
   VERIFIED from the physical labels; confirm it is also correctly represented
   in the product data before treating it as canonical system data.

4. **Remove incorrect 12V references after validation.** Once the product
   title is corrected, remove or retire the "SEND 220V" manual annotation
   as it would no longer be required.

**CRITICAL: None of these actions has been executed in this task.**
- Packlist.htm has NOT been modified.
- Product titles have NOT been changed.
- Master data has NOT been updated.
- No SKU has been changed or created.
- No picking rule has been implemented.

---

## Document Gap Assessment

**Document Gap: GAP-009**

The BI report classifies this issue as a Document Gap. GAP-009 has been
created to represent the specific missing/incorrect documentation requirement:

> Accurate voltage (AC220V) and physical size identifiers (7714/9820) are
> not consistently or correctly presented in the Packlist.htm picking
> documentation for the affected AC220V LED module variants.

No existing Document Gap (GAP-001 through GAP-008) covers product-title
voltage accuracy in picking documentation or the absence of physical size
identifiers as picking references. A full gap search confirmed no existing
gap represents this requirement.

**Existing related gaps checked and determined not to cover this requirement:**

| Gap | Why it does not cover this requirement |
|-----|----------------------------------------|
| GAP-006 — Assembly Instruction Technical Sign-off | Scoped to physical product-to-manual verification for assembly instructions — not picking documentation voltage accuracy |
| GAP-008 — Missing Click-in Assembly Instructions and Pack List Detail | Scoped to LHXSHE27BM2PK and missing assembly instructions — not to voltage or size identifier accuracy in Packlist.htm |
| GAP-007 — Supplier Finish Consistency and Golden Sample | Scoped to finish validation and Golden Sample approval — not to picking documentation accuracy |

**GAP-009 path:**
`intelligence-inbox/document-gaps/gap-009-ac220v-led-module-packlist-voltage-and-size-identifier-accuracy.md`

---

## Knowledge Capture

From physical evidence confirmed in this task:

- **7714-3LED specification (VERIFIED):** AC220V, 2W, WHITE(6000K), 200 PCS
  per bag. SKU: IMAC7714CWNPK.
- **9820-3LED specification (VERIFIED):** AC220V, 2W, 6000K, 100 PCS per
  bag. SKU: IMAC9820CWNPK.
- Both variants share the same electrical specification (AC220V, 2W, 6000K)
  but differ in size code and bag quantity.
- The physical bag label is the currently reliable source for accurate
  specification and size identification — not the digital product title.
- A manual annotation on a packlist is not a substitute for a correct
  product title. Annotations can be omitted, overlooked, or misread.
- When a product title embeds incorrect specification data (such as "12V"
  for an AC220V product), every picking document generated from that title
  will propagate the error until the source data is corrected.

These are knowledge items confirmed or reported from the supplied evidence.
None constitutes an approved company procedure, picking standard, or
operational rule.

---

## Future AIOS Recommendation

**Recommendation: Standardise LED module SKU and picking descriptions so that
physical size codes (such as 7714 and 9820) appear as prominent, standalone
identifiers matching the physical bag label, and so that voltage is accurately
stated in product titles.**

This is a future recommendation only. It is NOT an approved naming standard,
picking rule, or system change.

If a systematic review of LED module product titles reveals similar voltage
discrepancies across other SKUs, this recommendation may represent a
**Parent-AIOS Candidate** for a broader LED module description standardisation
initiative.

**Flagged as: Parent-AIOS Candidate — Requires Separate Review.**

No naming standard, picking rule, or system change has been implemented in
this task.

---

## Related Existing Issues

| Issue | Relationship |
|-------|-------------|
| ISSUE-045 — Waterproof LED Module Technical Specification Discrepancy (~3742) | Same product class: LED module specification discrepancy. ISSUE-045 concerns a conflict between listing-title voltage/wattage (12V/1.5W) and packaging image (AC 220V/2W) for a different LED module (~3742). ISSUE-051 concerns a conflict between packlist title voltage (12V) and physical product label (AC220V) for 7714/9820 LED modules. Note: the same "~3742" product reference appears in the ISSUE-051 packlist title ("…für Lichtwerbung ~3742…"), suggesting possible product family relationship — however, the specific SKUs, size codes, and failure modes documented are distinct. |
| ISSUE-009 — Incorrect Packaging: White Light Socket (LHRUE27WH) | Related category: physical product identification mismatch. ISSUE-009 involves incorrect product packaging labelling. ISSUE-051 involves incorrect product-title voltage in picking documentation. Different product, different failure mechanism, independently evidenced. |

---

## Duplicate Check

| Term Searched | Result |
|---------------|--------|
| 7714 / 9820 | Not found in any existing canonical issue or gap |
| IMAC7714 / IMAC7714CWNPK | Not found in any existing canonical issue or gap |
| AC220V / 220V LED Module | Not found as a standalone picking-documentation issue in any existing asset |
| SEND 220V | Not found in any existing canonical issue or gap |
| Packlist.htm / picking list | ISSUE-010 matched on "picking list" — not related (ISSUE-010 is about missing lamp holder stock variants) |
| Voltage discrepancy / product title discrepancy | ISSUE-045 is related but distinct (different product, different discrepancy context) |

**Duplicate check result: No duplicate. ISSUE-051 is a new, independently
evidenced operational event.**

---

## Executive Summary

Warehouse staff are experiencing picking difficulty because the digital
Packlist.htm for two AC220V LED module variants (7714-3LED and 9820-3LED)
contains an incorrect product title stating "12V" while the physical product
bags clearly state "AC220V". A manual red-text annotation ("SEND 220V") on
the 7714 variant's packlist entry partially overrides the wrong voltage
information but creates a conflicting-instruction situation and is not a
formal picking SOP.

Additionally, the physical size identifiers 7714 and 9820 — which appear
clearly on the physical bags — are not presented as standalone, readable
picking references in the digital packlist, requiring staff to decode the
SKU string or match to the physical bag label without a digital confirming
reference.

All key claims are directly verified from photographic evidence (`p2.png`
for physical labels; `p1.png` for packlist content). The required correction
— updating the product title voltage to AC220V and surfacing 7714/9820 as
explicit picking identifiers — is documented as a recommendation only and
has not been executed. A new Document Gap (GAP-009) has been created to
represent the specific missing/incorrect documentation requirement.

---

## Evidence

Evidence for ISSUE-051 is located in:
`submission-html/Nanthini akka issues/issues 51/`

| File | Type | Date in filename | Content confirmed |
|------|------|-----------------|-------------------|
| `2026_07_22_p1.png` | Image | 2026-07-22 | Packlist.htm screenshot showing "SEND 220V" annotation, "12V" product title, IMAC7714CWNPK and IMAC9820CWNPK SKUs, UK Unit3 location — directly readable |
| `2026_07_22_p2.png` | Image | 2026-07-22 | Physical product bag labels for 7714-3LED and 9820-3LED showing AC220V, 2W, 6000K, and QTY 200 / 100 PCS — directly readable |
| `recording_2026-07-22_r1.mp3` | Audio | 2026-07-22 | Content not independently transcribed |
| `recording_2026-07-22_r1.ogg` | Audio | 2026-07-22 | Content not independently transcribed |
| `recording_2026-07-22_r2.mp3` | Audio | 2026-07-22 | Content not independently transcribed |
| `recording_2026-07-22_r2.ogg` | Audio | 2026-07-22 | Content not independently transcribed |

All six evidence files contain `2026-07-22` or `2026_07_22` in their
filenames, independently establishing the operational event date as
2026-07-22. This date was not copied from ISSUE-050.

Audio recordings have not been independently transcribed. Claims derived
solely from audio content are classified as REPORTED. The confirmed
operational facts in this asset are primarily derived from the directly
readable image evidence.

---

## Known Limits

- The origin of the "12V" product title (template error, data migration,
  generic product reuse) has not been confirmed.
- Whether the "SEND 220V" annotation is applied consistently across all
  packlist instances for IMAC7714CWNPK has not been confirmed. Only the
  2026-07-22 instance is evidenced.
- Whether an equivalent annotation exists for IMAC9820CWNPK has not been
  confirmed from available evidence.
- Whether any incorrect-voltage product has been shipped as a result of this
  discrepancy has not been independently evidenced.
- The "~3742" product family reference in the packlist title may indicate a
  relationship to ISSUE-045's product — this has not been confirmed and is
  noted as a candidate for investigation.
- Audio content (r1 and r2 pairs) may contain additional operational detail.
  Human review is recommended.

---

*Issue logged: 2026-07-22 | Logged by: Vishnusri | No product title, packlist, master data, or picking rule has been changed — corrections documented as recommended actions pending validation and approval | See GAP-009 for linked documentation gap*
