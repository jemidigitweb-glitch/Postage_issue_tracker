# Issue 008 – Picking Image Mismatch for Wire Connectors

**Date Logged:** 2026-07-06
**Logged By:** Vishnusri
**Status:** Open — Under Investigation
**Classification:** Daily Issue

---

## Issue Summary

The warehouse picking image associated with SKU CODL632AGYAPK does not match the actual product listing. The picking image currently displayed to warehouse staff shows the "with hole" variant of the wire connector, while the product listing describes and sells the standard "without hole" variant.

Warehouse staff rely on the picking image displayed on the picking screen to identify and select the correct product during order fulfilment. Because the image shows the wrong variant, there is a high risk that staff are selecting and dispatching the "with hole" variant — which is the more expensive product — instead of the standard "without hole" variant that the customer ordered and the listing describes.

The mismatch was identified by warehouse staff during the picking process. The issue is active and unresolved, and every picking operation for this SKU carries the same risk of incorrect fulfilment until the image is corrected.

---

## Business Problem

The core problem is that incorrect system data — a wrong picking image linked to a SKU — is directing warehouse staff to pick the wrong product variant during order fulfilment:

- **Incorrect picking image linked to SKU** — the system has the "with hole" variant image mapped to SKU CODL632AGYAPK, which should display the "without hole" standard variant. The image is the primary visual reference staff use to identify the correct product at the picking stage.
- **Warehouse staff rely on incorrect visual information** — because the picking process is image-guided, staff follow the displayed image in good faith. There is no other visual check built into the current process that would alert a picker to the mismatch before the product is selected.
- **Expensive product variants may be dispatched instead of standard variants** — the "with hole" variant is more expensive than the standard "without hole" variant. If the wrong variant is dispatched, the business absorbs the cost difference on every incorrectly fulfilled order without recovering it through the sale.
- **Inventory accuracy becomes unreliable** — if the wrong variant is being systematically picked and dispatched, the inventory count for both the "with hole" and "without hole" variants will diverge from the actual physical stock at different rates, producing inventory records that cannot be trusted for either SKU.
- **Direct financial loss may occur** — the combination of dispatching a more expensive product at the price of a cheaper one, and the potential for customer complaints or returns if the wrong variant is noticed, creates compounding financial exposure for each order affected.

---

## Current Operational Process

The current warehouse picking workflow for this product is as follows:

1. **Customer places an order** — a customer places an order for the wire connector listed under SKU CODL632AGYAPK (the "without hole" standard variant)
2. **Warehouse picker opens the picking screen** — the warehouse picker opens the picking task in the system and navigates to the order line for SKU CODL632AGYAPK
3. **System displays the picking image** — the system displays the picking image associated with the SKU, which currently shows the "with hole" variant rather than the correct "without hole" variant
4. **Staff identify the product using the image** — the picker uses the displayed image as the primary reference to locate and identify the correct product in the warehouse
5. **Product is picked** — following the incorrect image, the picker selects the "with hole" variant from the shelf, believing it to be the correct product for the order
6. **Product is packed and dispatched** — the incorrectly picked product is packed and dispatched to the customer

The incorrect picking image creates a decision error at step 3 that propagates through every subsequent step without any system-level check or alert to catch it before dispatch.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **Product** | Wire Connector |
| **SKU** | CODL632AGYAPK |
| **Listing Variant** | Without hole (standard variant — this is what the listing describes and what customers order) |
| **Picking Image Variant** | With hole (incorrect — this is what the system currently displays to warehouse pickers) |
| **Root Cause Status** | Not yet confirmed — the reason the incorrect image is linked to the SKU has not been established |
| **Operational Status** | Active — the incorrect image remains in place and every picking operation for this SKU carries the risk of incorrect fulfilment |
| **Evidence Available** | YES — warehouse system screenshot and audio explanation from warehouse staff |

---

## Business Impact

| Area | Impact |
|------|--------|
| **Warehouse Operations** | Pickers are working from incorrect visual information. Every pick for SKU CODL632AGYAPK is potentially incorrect until the image is corrected. The picking process for this SKU cannot be trusted in its current state. |
| **Inventory Accuracy** | If the wrong variant has been picked on multiple orders, the physical stock counts for both the "with hole" and "without hole" variants will be incorrect. A stock reconciliation is required to re-establish accurate counts. |
| **Dispatch Accuracy** | Orders for the standard "without hole" variant may have been dispatched with the "with hole" variant. Dispatch records will not reflect the discrepancy because the system records the SKU correctly — only the physical product selected was wrong. |
| **Customer Experience** | Customers receiving the "with hole" variant when they ordered the "without hole" variant may notice the difference and raise complaints, request returns, or lose confidence in the business. |
| **Financial Cost** | The "with hole" variant is more expensive than the standard variant. Dispatching it at the price of the standard variant represents a direct financial loss on every affected order. If returns are raised, additional return processing costs apply. |
| **Daily Productivity** | Once the issue is known, warehouse staff cannot rely on the picking image for this SKU. Either additional manual verification is needed for each pick, slowing throughput, or the risk of incorrect fulfilment continues. Both outcomes reduce daily productivity. |
| **Product Integrity** | Systematic incorrect picking will deplete the "with hole" variant inventory faster than expected while the "without hole" variant may accumulate, creating imbalances that take time to correct. |

---

## Operational Risks

| Risk | Description |
|------|-------------|
| **Incorrect fulfilment** | Every picking operation for SKU CODL632AGYAPK while the incorrect image remains in place carries a high risk of the wrong product variant being dispatched |
| **Financial loss** | Dispatching the more expensive "with hole" variant at the price of the standard "without hole" variant results in a margin loss on every affected order |
| **Inventory discrepancies** | If incorrect picking has already occurred on multiple orders, the current inventory counts for both variants are likely inaccurate and require reconciliation |
| **Customer complaints** | Customers who receive the wrong variant and notice the difference may raise complaints, request returns, or dispute the order |
| **Depletion of expensive inventory** — | The "with hole" variant stock may be depleted faster than planned if it has been incorrectly dispatched in place of the standard variant, creating an unplanned stockout of the more expensive product |
| **Increased manual corrections** | Once the error is known, additional manual checking steps must be inserted into the picking process to compensate for the incorrect image, adding time and complexity to each pick |

---

## Existing Workaround

No formal workaround currently exists.

The issue was identified manually by warehouse staff during the picking process. A staff member noticed that the picking image did not match the expected product and raised the concern. No system-level alert, picking confirmation step, or image verification process exists that would have caught this mismatch automatically.

Until the correct picking image is restored, warehouse staff will need to rely on individual knowledge of the product variants to avoid selecting the wrong item — an informal and unreliable control that depends on each individual picker being aware of the issue at the time of picking.

---

## Recommended Next Actions

The following actions are recommended to resolve the image mismatch and assess the extent of the impact:

1. **Replace the incorrect picking image immediately** — update the picking image linked to SKU CODL632AGYAPK to display the correct "without hole" standard variant. This is the highest priority action and should be completed before any further orders for this SKU are picked.
2. **Verify the SKU-to-image mapping** — after replacing the image, confirm that the updated image is correctly linked to the SKU in the system and that the correct variant is displayed on the picking screen before resuming normal picking operations.
3. **Audit similar wire connector SKUs** — review the picking images for all other wire connector SKUs to confirm that no other products have a similar image mismatch. This audit should confirm that the correct variant image is displayed for each SKU.
4. **Perform an inventory reconciliation of both product variants** — conduct a physical count of both the "with hole" and "without hole" variants and compare against system records to identify the extent of any inventory discrepancy caused by incorrect picking.
5. **Verify product images before future listing updates** — confirm that any future update to product listings, SKU configurations, or picking images includes a verification step to check that the image displayed matches the variant described in the listing.

---

## AIOS Classification

| Field | Value |
|-------|-------|
| **Classification** | Daily Issue |
| **Reason** | Active operational system-data issue affecting daily warehouse picking accuracy |

This issue is classified as a Daily Issue because it is an active, unresolved problem that is directly affecting the picking process on every order for SKU CODL632AGYAPK. The image mismatch is confirmed. The operational risk is immediate.

**Document Gap: Not created.**
The issue is caused by incorrect system data — a wrong picking image linked to the SKU — not by missing documentation or missing operational procedures. There is no evidence that the root cause is the absence of a documented process. A Document Gap would only be appropriate if the investigation confirmed that missing documentation contributed to the incorrect image being applied or to the absence of a check that would have caught it. Creating a gap record before that is confirmed would be premature.

---

## Evidence

Supporting evidence for this issue includes:

- **Warehouse system screenshot** — a screenshot from the warehouse picking system showing SKU CODL632AGYAPK with the incorrect "with hole" variant image displayed in the picking interface
- **Audio explanation from warehouse staff** — verbal explanation provided by warehouse staff describing how the mismatch was identified, the difference between the two product variants, and the risk of incorrect fulfilment

Evidence is held by the warehouse team and is available for review when the investigation and image correction are initiated.

---

## Related AIOS Documents

This issue is separate from all previously logged issues:

| Document | Relationship |
|----------|-------------|
| [issue-001-return-parcel-accumulation.md](issue-001-return-parcel-accumulation.md) | Separate — concerns physical accumulation of returned parcels, not SKU image data |
| [issue-002-website-order-collected-status.md](issue-002-website-order-collected-status.md) | Separate — concerns order status visibility, not picking system image accuracy |
| [issue-003-high-return-rate-crystal-lighting-fixtures.md](issue-003-high-return-rate-crystal-lighting-fixtures.md) | Separate — concerns return rates for specific product models, not picking image configuration |
| [issue-004-labor-cost-and-assembly-pricing-discrepancy.md](issue-004-labor-cost-and-assembly-pricing-discrepancy.md) | Separate — concerns fulfilment labour and pricing, not product image mapping |
| [issue-005-inaccurate-courier-parcel-counting-and-sorting.md](issue-005-inaccurate-courier-parcel-counting-and-sorting.md) | Separate — concerns dispatch courier segregation, not picking system data |
| [issue-006-inconsistent-return-addresses-on-postage-labels.md](issue-006-inconsistent-return-addresses-on-postage-labels.md) | Separate — concerns return address accuracy on postage labels, not product variant images |
| [issue-007-phantom-inventory-metal-cord-clips-unit4.md](issue-007-phantom-inventory-metal-cord-clips-unit4.md) | Separate — concerns missing physical stock for a different SKU, not image mapping errors |

This issue concerns incorrect SKU image mapping for wire connectors. It is not a duplicate of any existing issue.

---

## Important — Classification Boundary

> **Do NOT create at this stage:**
> - Document Gap
> - Skill document
> - Context document
>
> **Reason:** The available evidence confirms that an incorrect picking image is associated with SKU CODL632AGYAPK. The image mismatch is a confirmed system-data error.
>
> However, the underlying reason for the incorrect image mapping has not yet been established. The investigation should determine whether the issue resulted from an incorrect image being uploaded during a listing setup, a SKU mapping error, an incorrect update during listing maintenance, or another cause before any determination is made about whether documentation or training changes are required.
>
> No additional AIOS assets should be created until the investigation identifies the root cause and the immediate image correction has been completed.

---

## Final Note

| Field | Status |
|-------|--------|
| **Image Mapping Error** | Confirmed |
| **Underlying Cause** | Under Investigation |
| **Investigation Required** | YES |
| **Evidence Status** | Available |

---

*Issue logged: 2026-07-06 | Logged by: Vishnusri | Immediate image correction recommended before further picking operations for SKU CODL632AGYAPK*
