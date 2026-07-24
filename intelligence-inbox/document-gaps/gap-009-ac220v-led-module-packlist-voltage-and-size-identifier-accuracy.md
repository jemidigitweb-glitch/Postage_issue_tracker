# Gap 009 — Incorrect Voltage and Missing Size Identifiers in AC220V LED Module Picking Documentation

**Gap ID:** GAP-009
**Date Logged:** 2026-07-22
**Logged By:** Vishnusri
**Status:** Open
**Severity:** High
**Classification:** Document Gap
**Source Issue:** ISSUE-051 — AC220V LED Module Packlist Identifier and Voltage Discrepancy
**Escalate To:** Varmen

---

## Gap Summary

The picking documentation for AC220V LED modules (size variants 7714-3LED and
9820-3LED) does not accurately or consistently present the information required
for reliable warehouse identification and picking.

**Two specific documentation failures are confirmed from physical and digital
evidence:**

1. **Incorrect voltage in the product title.** The Packlist.htm entry for both
   AC220V LED module variants displays the product title:

   > "200 * LED Modul **12V** Wasserdicht 1.5W für Lichtwerbung ~3742 - Kaltweiß"

   The physical product labels clearly state **Voltage: AC220V**. The packlist
   title states "12V" — a direct contradiction. A manual red-text workaround
   ("SEND 220V") is currently added to the packlist entry for the 7714 variant
   to override the incorrect title. This is not a formally designed picking
   instruction — it is a manual corrective annotation.

2. **Physical size identifiers 7714 and 9820 are not presented as standalone
   picking references.** While the size codes are embedded in the SKU strings
   (IMAC7714CWNPK and IMAC9820CWNPK), they are not displayed as prominent,
   standalone identifiers in the picking description. Physical product bags are
   labelled with "Size: 7714-3LED" and "Size: 9820-3LED" as the primary
   identification — but this information is not reflected as a prominent,
   readable reference in the Packlist.htm entry.

---

## Repository Evidence

Evidence is confirmed from ISSUE-051 physical and digital evidence:

| Evidence | Source | Status |
|----------|--------|--------|
| Physical label — 7714: "Size: 7714-3LED, Voltage: AC220V, Power: 2W, Color: WHITE(6000K), QTY: 200 PCS" | `Nanthini akka issues/issues 51/2026_07_22_p2.png` | VERIFIED — directly readable |
| Physical label — 9820: "Size: 9820-3LED, Voltage: AC220V, Power: 2W, Color: 6000K, QTY: 100 PCS" | `Nanthini akka issues/issues 51/2026_07_22_p2.png` | VERIFIED — directly readable |
| Packlist product title: "200 * LED Modul 12V Wasserdicht 1.5W…" (12V stated) | `Nanthini akka issues/issues 51/2026_07_22_p1.png` | VERIFIED — directly readable |
| "SEND 220V" override in red text on packlist entry | `Nanthini akka issues/issues 51/2026_07_22_p1.png` | VERIFIED — directly readable |
| SKU IMAC7714CWNPK in packlist | `Nanthini akka issues/issues 51/2026_07_22_p1.png` | VERIFIED — directly readable |
| SKU IMAC9820CWNPK in packlist | `Nanthini akka issues/issues 51/2026_07_22_p1.png` | VERIFIED — directly readable |

The gap is confirmed from independent evidence: the physical packaging and the
digital packlist directly contradict each other on voltage, and neither source
presents 7714 / 9820 as a clear, prominent picking descriptor.

---

## Missing Documentation / Corrective Requirement

The following correction is required and is not currently documented as a
formal approved standard or procedure:

### 1. Correct Voltage in Product Picking Description

The product title for AC220V LED modules used in Packlist.htm must state
the correct voltage (AC220V), not the incorrect voltage (12V).

**Currently:** The title states "12V" for an AC220V product.
**Required:** The title should state "AC220V" or equivalent accurate voltage.
**Workaround in use (not approved):** Red-text manual annotation "SEND 220V".

The "SEND 220V" manual annotation is not a formal picking instruction or
approved SOP — it is an informal workaround that depends on the annotator
being present and correct. It creates a voltage-conflict situation on the
same packlist entry (title says 12V; manual annotation says 220V).

### 2. Prominent Size Identifier in Picking Description

Physical identification of the two AC220V LED module variants (7714 and 9820)
relies on the "Size:" label printed on the physical product bag. This
identifier must also appear as a prominent, clear picking reference in the
digital packlist or product picking description so that pickers can match
the digital instruction to the physical bag without relying solely on the
SKU string.

**Currently:** 7714 / 9820 are embedded in SKU strings (IMAC7714CWNPK /
IMAC9820CWNPK) but are not presented as a standalone readable picking label.
**Required:** The picking description or product title should clearly state
the size code so pickers can match it directly to the physical bag label.

---

## Contributing Cause Analysis

| Missing requirement | How absence contributes |
|--------------------|------------------------|
| Correct voltage in product title | The "12V" title creates immediate confusion — a picker reading the entry has no reliable voltage reference unless they notice and trust the red-text manual annotation, which is not an approved SOP |
| Manual "SEND 220V" workaround | Requires the annotating person to be present, correct, and consistent each time the packlist is generated — it is a single-person-dependent correction, not a documented system-level fix |
| Prominent 7714/9820 in picking description | Pickers must decode the SKU string or know from memory which physical bag corresponds to which SKU — there is no human-readable size label in the digital description matching the physical bag label |

---

## Business Impact

- Picking staff face a direct conflict between the 12V product title and the
  "SEND 220V" manual annotation on the same packlist entry.
- The size variant difference between 7714 (200 PCS/bag) and 9820 (100 PCS/bag)
  is not surfaced in picking descriptions, requiring pickers to rely on the
  physical bag label without a confirming digital reference.
- If the red-text "SEND 220V" annotation is absent or overlooked, a picker
  relying on the product title would look for a 12V product when the physical
  product is AC220V — creating a voltage identification failure.
- A voltage mismatch in a picking context carries potential operational and
  safety risk. No actual incorrect-voltage shipment or safety incident is
  confirmed from current evidence — this is a risk arising from the
  documentation gap.

---

## Corrective Action Required

The following corrections are documented as required. They must be approved
and validated before implementation.

1. **Update the product title for AC220V LED modules to correctly state the
   voltage (AC220V).** Remove the "12V" reference from the title. This change
   must be validated against the physical product and approved by the
   appropriate master-data authority before execution.

2. **Include a prominent, human-readable size identifier in the picking
   description.** The size codes 7714 and 9820 should appear clearly in the
   product description used in Packlist.htm so that pickers can match the
   digital instruction to the physical bag label without decoding the SKU
   string.

3. **Remove or formalise the "SEND 220V" workaround.** Once the product title
   is corrected to show AC220V, the manual annotation becomes redundant and
   should be removed. If a transition period requires it to remain, it should
   be formalised as an approved interim instruction — not left as an informal
   annotation.

**None of these corrections has been executed in this task. Execution requires
appropriate business and technical approval and validation.**

---

## AIOS Recommendation

These corrections, once implemented and confirmed, would produce packlist
entries where:

- The voltage displayed matches the physical product (AC220V);
- The size code (7714 or 9820) is prominently visible as a picking reference;
- The "SEND 220V" manual annotation is no longer required because the title
  is correct.

A broader future consideration: if the product description template used for
Packlist.htm can be reviewed systematically for voltage accuracy across other
LED module SKUs, similar voltage discrepancies may be identified and corrected
proactively. This is a recommendation only.

---

## Governance

This gap was identified through ISSUE-051 (AC220V LED Module Packlist
Identifier and Voltage Discrepancy), logged 2026-07-22.

The gap is categorised as **confirmed** because:

1. The physical labels are directly readable and confirm AC220V, 7714-3LED,
   and 9820-3LED as the correct identifiers.
2. The packlist screenshot is directly readable and confirms the "12V" title
   discrepancy and the "SEND 220V" manual workaround.
3. The mismatch between the physical labels and the picking documentation is
   independently evident without relying on audio or unverified reporting.

**Escalation path:** Varmen → relevant listing/product data owner or Laksika
as directed → approval to correct product titles and picking descriptions →
Decision Log entry → correction implemented and verified.

---

## Linked Records

- **Source Issue:** `intelligence-inbox/daily-issues/issue-051-ac220v-led-module-packlist-identifier-voltage-discrepancy.md`

---

*Gap logged: 2026-07-22 | Logged by: Vishnusri | Confirmed by direct image evidence — AC220V physical labels vs 12V packlist title; 7714/9820 physical identifiers absent from picking descriptions | Awaiting Varmen review*
