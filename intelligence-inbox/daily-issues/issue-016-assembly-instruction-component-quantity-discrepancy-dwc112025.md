# Issue 016 – Assembly Instruction Component Quantity Discrepancy: DWC112025 3-Head Diamond Pendant Lamp

**Issue ID:** ISSUE-016
**Date Logged:** 2026-07-08
**Logged By:** Vishnusri
**Domain:** listing
**Priority:** Medium
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**Document Gap:** gap-006-assembly-instruction-technical-sign-off-and-product-verification.md
**SKU:** DWC112025

---

## Issue Summary

The printed assembly instructions for the LEDSone 3-head diamond pendant lamp (SKU: DWC112025)
list Component G (nuts) as "x5Pcs". Customers receive the product, refer to the instruction
manual, count fewer nuts than stated, and contact the business believing hardware is missing.
This generates avoidable replacement requests and operational cost.

The instructions were reportedly not re-checked for accuracy against the physical product
before mass printing and distribution. Whether the quantity listed is incorrect or the
product configuration changed without a corresponding instruction update has not been
confirmed.

---

## Business Problem

- **Customer-reported hardware discrepancy.** Customers believe they have received a product
  with missing nuts because the printed instruction manual states "G — x5Pcs". The customer
  experience is one of a defective product.
- **Avoidable replacement activity.** Each replacement request consumes staff time and
  material cost. Because the instruction manual is the trigger, fixing the product is not
  the resolution — the instruction content must be corrected.
- **Root cause not confirmed.** It has been reported (but not independently confirmed) that
  a 5-head product template may have been reused for the 3-head product without updating
  the component quantities. This remains an assumption requiring investigation.
- **No sign-off process.** No documented technical sign-off or physical-product-to-instruction
  verification step exists before assembly instructions are approved for supplier mass printing.
  This absence means instruction errors can reach customers without any internal detection step.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **SKU** | DWC112025 |
| **Product** | LEDSone 3-head diamond pendant lamp |
| **Component in dispute** | Component G — nuts |
| **Printed quantity** | x5Pcs (as stated in instruction manual) |
| **Correct quantity** | Not yet confirmed — investigation required |
| **Trigger** | Customers contact business believing nuts are missing |
| **Impact** | Avoidable replacement requests and operational cost |
| **Instructions reviewed before mass print?** | Reportedly no — not independently confirmed |

---

## Assumptions — Not Confirmed Facts

The following were reported but require investigation to confirm:

- That a 5-head product template was reused without updating component quantities for
  the 3-head configuration.
- The exact correct number of nuts for the 3-head pendant lamp.
- Exact number of affected customers.
- Exact financial loss from replacement activity.
- Exact quantity of affected stock in circulation.

> **Do not treat these assumptions as confirmed facts in any downstream document.**

---

## Document Gap

**Gap Created:** gap-006-assembly-instruction-technical-sign-off-and-product-verification.md

No documented technical sign-off or product-to-manual verification process exists before
assembly instructions are approved for supplier mass printing. This is the structural gap
that allowed a potentially inaccurate component quantity to reach customers unchallenged.

The gap does not assume the root cause. It records what is demonstrably absent from current
operational process.

---

## Fix and Action Required

1. **Physical product check — DWC112025:** Confirm the correct quantity of Component G (nuts)
   for the 3-head diamond pendant lamp by counting the nuts included in a physical unit.
2. **Compare to printed instructions:** Verify whether the printed "x5Pcs" matches the actual
   quantity or is incorrect.
3. **If instructions are wrong:** Request corrected instructions from the supplier. Update the
   product listing with the corrected assembly guide before further units are dispatched.
4. **Customer communication:** Identify whether any currently open replacement requests were
   triggered by this instruction discrepancy and resolve accordingly.
5. **Introduce sign-off step:** Implement the assembly instruction verification control described
   in gap-006 for all future instruction approvals before mass printing.

---

## Evidence

### Evidence Mapping — ISSUE-016 (User-Confirmed, HIGH Confidence)

Both images in `submission-html/Phase2-inputs/issues 16/` have been confirmed by the user
as belonging to ISSUE-016: Assembly Instruction Component Quantity Discrepancy — DWC112025
3-Head Diamond Pendant Lamp. Mapping authority: direct user confirmation (2026-07-13).

| File | Repository Path | Confidence | Status |
|------|----------------|-----------|--------|
| `warehouse-image-016_1.png` | `submission-html/Phase2-inputs/issues 16/warehouse-image-016_1.png` | HIGH — user-confirmed | **Mapped** |
| `warehouse-image-016_2.png` | `submission-html/Phase2-inputs/issues 16/warehouse-image-016_2.png` | HIGH — user-confirmed | **Mapped** |

Audio files present in the same folder (`recording-016.mp3`, `recording-016.ogg`) are
NOT mapped as evidence images.

**Evidence paths (URL-encoded for HTML):**
- `Nanthini akka issues/issues%2016/warehouse-image-016_1.png`
- `Nanthini akka issues/issues%2016/warehouse-image-016_2.png`

### Verified Business Intelligence Source

The confirmed facts in this issue derive from the Business Intelligence report provided
on 2026-07-08 describing the DWC112025 pendant lamp Component G quantity discrepancy.
The BI report is the primary source.

---

## Related AIOS Documents

| Document | Relationship |
|----------|-------------|
| gap-006-assembly-instruction-technical-sign-off-and-product-verification.md | Document Gap raised by this issue — describes the missing sign-off/verification control |
| issue-011-assembly-hardware-mismatch-small-diamond-cage-wc-slbm.md | Related product family (diamond pendant cage hardware) but different issue: ISSUE-011 concerns hardware incompatibility during assembly, not instruction quantity discrepancy |
| issue-013-supplier-assembly-delay-black-mount-dependent-component-pairing.md | Different issue: concerns supplier delivery delay, not instruction accuracy |
| issue-004-labor-cost-and-assembly-pricing-discrepancy.md | Different issue: concerns labour cost in pricing, not instruction content |

---

## Domain Boundary

**Domain: listing**

This issue concerns the accuracy of product assembly instruction content — a Listing AIOS
responsibility. It does not concern postage, dispatch, courier selection, or warehouse
routing. It must not be added to the Postage AIOS Open Issues dataset.

---

## Classification Boundary

> **Created at this stage:**
> - ISSUE-016 daily issue asset (this file)
> - gap-006-assembly-instruction-technical-sign-off-and-product-verification.md
>
> **NOT created at this stage:**
> - Skill document (root cause not confirmed)
> - Context document (resolution not yet known)
>
> **Reason:** Root cause (whether instruction error originated from template reuse or
> another source) has not been confirmed. The gap records the absent control independently
> of root cause — it is demonstrably absent regardless of how the error was introduced.

---

## Pass / Fail Rule

| Check | Status |
|-------|--------|
| ISSUE-016 free before creation | ✅ Confirmed |
| No semantic duplicate | ✅ Confirmed |
| SKU DWC112025 present | ✅ |
| Date 2026-07-08 | ✅ |
| Domain: listing | ✅ |
| Correct nut quantity not invented | ✅ — marked unknown |
| Template reuse not stated as fact | ✅ — marked assumption |
| Evidence mapped only if HIGH-confidence | ✅ — both images mapped via user confirmation (2026-07-13) |
| Gap-006 created (no existing equivalent) | ✅ |
| Listing domain boundary enforced | ✅ |

---

*Issue logged: 2026-07-08 | Logged by: Vishnusri | Physical product-to-instruction verification required before this issue can be resolved*
