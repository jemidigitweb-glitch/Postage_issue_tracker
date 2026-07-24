# Issue 039 — Inventory Coordination: Color-Matched Accessory Procurement Failure (PCBSM2FSN)

**Issue ID:** ISSUE-039
**Date Logged:** 2026-07-21
**Logged By:** Vishnusri
**Domain:** purchase
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** PCBSM2FSN
**Document Gap:** None

---

## Issue Summary

On 2026-07-21 a critical stockout was identified for the 10mm Satin Nickel
connector (Product Code: PCBSM2FSN), an essential accessory for conduit pipe
sets.

Stock for PCBSM2FSN in UK Unit 3 dropped from 20 to 0 on 2026-07-21.
Primary conduit pipes are in stock, but the absence of matching connectors
prevents sale of complete color-coordinated sets. The connector was not
included in the same procurement cycle as the conduit pipe delivery that
preceded the stockout.

The operational effect is that approximately 80% of potential sales for these
coordinated conduit sets cannot be fulfilled without the matching Satin Nickel
connectors.

---

## Business Problem

- **Imbalanced accessory inventory.** Primary conduit pipes are available
  while the required matching Satin Nickel connector is out of stock. The
  two items are sold as a coordinated color-matched set; neither is
  independently substitutable for the other.
- **Lost sales on complete sets.** Approximately 80% of potential sales for
  these coordinated conduit products are blocked until the connector is
  restocked.
- **Procurement cycle misalignment.** Connectors were not included in the
  procurement order that replenished the primary conduit pipes, creating a
  dependency gap that the system did not surface before the stockout occurred.
- **Overstock risk in other accessory variants.** While the Satin Nickel
  connector is depleted, other accessory color variants may be overstocked
  because they do not correspond to the current in-stock pipe range.
- **Customer and revenue risk.** If complete sets cannot be dispatched,
  customer orders for coordinated conduit sets cannot be fulfilled, with
  potential for cancelled orders or negative customer feedback.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **Date of operational event** | 2026-07-21 |
| **Product Code** | PCBSM2FSN |
| **Product name** | 10mm Satin Nickel connector |
| **Product role** | Accessory for conduit pipe sets; required to complete color-matched sets |
| **Stock location affected** | UK Unit 3 |
| **Stock level change** | 20 → 0 (reached zero on 2026-07-21) |
| **Previous movement** | Product had previously been slow-moving; stock recently cleared out |
| **Primary conduit pipe status** | In stock — available for dispatch |
| **Matching connector status** | Out of stock (PCBSM2FSN = 0) |
| **Procurement event** | Primary conduit pipes were delivered; matching connectors were not included in the same procurement cycle |
| **Sales impact** | Approximately 80% of potential sales for coordinated conduit sets cannot be fulfilled without the connector |
| **Existing workaround** | None documented. A staff member acknowledged the oversight and stated that color coordination would be monitored more closely during the next ordering cycle |

---

## Assumptions — Not Confirmed Facts

The following is inferred from the operational context but has not been
independently confirmed and must not be treated as a fact in any downstream
document, SOP, or business rule:

- The procurement logic may have overlooked the connector because it was
  historically a slow mover and may not have accounted for its role in
  completing coordinated sets when stock reached a critical level.

> **Do not treat this assumption as a confirmed fact. Do not encode it as a
> business rule or system requirement without separate confirmation.**

---

## Root Cause

**Confirmed:**

- PCBSM2FSN stock in UK Unit 3 reached zero on 2026-07-21.
- The connector had previously been slow-moving and recently cleared out.
- Primary conduit pipes were procured and delivered without the corresponding
  matching connectors being included in the same order.

**Unconfirmed (assumption):**

- The mechanism by which the connector was excluded from the procurement
  cycle — whether this was a manual oversight, a system omission, or a
  historical classification of the SKU as low-priority — has not been
  independently confirmed.

---

## Business Impact

- Complete color-matched conduit sets cannot be sold while PCBSM2FSN is out
  of stock.
- Approximately 80% of potential sales for coordinated conduit products are
  blocked.
- Primary conduit pipe stock accumulates without a matching accessor to
  complete the set offering.
- Procurement lag will prolong the Out of Stock status if replenishment is
  not initiated promptly.
- Revenue loss on coordinated sets until PCBSM2FSN is restocked.

---

## Fix and Action Required

1. **Initiate procurement for PCBSM2FSN.** Place an order for the 10mm Satin
   Nickel connectors immediately to restore stock in UK Unit 3.

2. **Cross-check conduit pipe stock against matching accessories.** Identify
   all conduit pipe SKUs currently in stock and verify that their corresponding
   matching color accessory SKUs (connectors, fittings) are also in stock at
   adequate levels.

3. **Review connected products together during ordering.** When procuring
   primary conduit pipe products, the corresponding accessory SKUs (connectors
   and color-matched components) must be reviewed at the same time rather than
   treated as independent items.

4. **Confirm staff follow-through.** A staff member stated that color
   coordination would be monitored more closely during the next ordering cycle.
   Confirm whether this was recorded as a formal action or remained an
   informal acknowledgement.

---

## Document Gap

**Document Gap Created:** None

The BI report classifies this issue as a Daily Issue — a specific operational
stockout on 2026-07-21 requiring procurement action.

A repository inspection would be required to confirm whether a procurement
coordination SOP or connected-product review process is documented. However,
the BI report does not establish a Document Gap as the primary classification,
and a gap must not be created by inference from a procurement recommendation
alone. If a subsequent repository search confirms that no connected-product
procurement review process is documented anywhere in the AIOS, a formal gap
should be raised and logged separately.

No Document Gap has been created at this stage.

---

## Knowledge Capture

Procurement for connected products must be synchronised. A matching accessory
such as a conduit connector should be reviewed alongside the primary item it
supports whenever the primary item is being restocked. Historical slow movement
of an accessory should not by itself cause it to be excluded from an ordering
cycle when the primary item it completes is being replenished.

---

## Future AIOS Recommendation

**Recommendation: Consider a Set Consistency alert that identifies Out of Stock
or Low Stock matching accessories when a primary conduit product is restocked.**

This is a recommendation only. It is NOT an approved business rule.

A Set Consistency alert would surface cases where a primary item is
replenished but its required colour-matched accessories are at zero or low
stock, so that the procurement review can include both the primary and
accessory items in a single ordering cycle.

This recommendation requires business-owner review and approval before it is
treated as an operational requirement or implemented in any system.

---

*Issue logged: 2026-07-21 | Logged by: Vishnusri | Root cause confirmed — procurement action required*
