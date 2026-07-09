# Issue 007 – Phantom Inventory for Metal Cord Clips in Unit 4

**Date Logged:** 2026-07-06
**Logged By:** Vishnusri
**Status:** Open — Under Investigation
**Classification:** Daily Issue

---

## Issue Summary

Warehouse staff cannot physically locate approximately 1,495 Metal Cord Clips (SKU: CGSRBM) in Unit 4, despite the inventory system recording that stock exists at that location. The system shows the items as available and assigned to Unit 4, but when staff attempt to pick against orders, the physical stock is not present.

The discrepancy between system inventory and physical inventory is preventing normal warehouse operations. Staff are unable to fulfil orders relying on this stock, and the time spent searching for items that cannot be located is disrupting daily workflow. The issue requires immediate investigation to determine whether the stock was ever received, has been misplaced within the warehouse, or has been incorrectly recorded in the system.

---

## Business Problem

The core problem is phantom inventory — a situation where the inventory management system records stock as available when no corresponding physical stock exists in the warehouse. This creates a series of downstream problems:

- **System stock differs from physical stock** — the inventory record for SKU CGSRBM shows approximately 1,495 units in Unit 4, but no physical units can be located. The system and the warehouse are out of agreement, and neither can currently be treated as reliable without verification.
- **Staff waste time searching** — warehouse staff are spending working time conducting manual searches for stock the system says should be present. This time is unproductive and displaces other picking and packing tasks.
- **Orders may be accepted for unavailable stock** — if the system continues to show the items as available, orders for Metal Cord Clips may be accepted by the business when there is no physical stock to fulfil them. This sets up fulfilment failures before they are identified.
- **Inventory reliability is reduced** — a confirmed phantom inventory event reduces confidence in the overall accuracy of the inventory system. If one SKU shows phantom stock, the reliability of other SKU records may also be questioned until an audit confirms them.

---

## Current Operational Process

The operational process that led to the current state is as follows:

1. **Goods received into system** — when stock is delivered to the warehouse, a goods received record is created in the inventory system, increasing the stock count for the relevant SKU
2. **Inventory updated** — the system updates the available quantity for SKU CGSRBM and records Unit 4 as the assigned warehouse location
3. **Stock assigned to Unit 4** — the system directs picking operations to Unit 4 on the basis that 1,495 units are recorded as available there
4. **Staff attempt picking** — when an order requiring Metal Cord Clips is processed, warehouse staff go to Unit 4 to pick the required quantity
5. **Physical stock missing** — staff are unable to locate any physical units of SKU CGSRBM at the recorded location in Unit 4
6. **Manual search begins** — staff conduct a broader search of the warehouse to determine whether the stock has been stored in a different location than the system records
7. **Staff verify receiving history** — staff review receiving records and delivery notes to determine whether the stock was ever physically received into the warehouse

No formal process currently exists to reconcile system inventory against physical stock on a periodic basis for this SKU. The discrepancy was identified through the failure to locate stock during a picking operation.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **Product** | Metal Cord Clips |
| **SKU** | CGSRBM |
| **Quantity discrepancy** | Approximately 1,495 units recorded in system — zero units located physically |
| **Warehouse location (system)** | Unit 4 |
| **System status** | Available — inventory system shows 1,495 units at Unit 4 |
| **Physical status** | Not located — no physical units found during warehouse search |
| **Root cause status** | Not yet confirmed — investigation required |

---

## Business Impact

| Area | Impact |
|------|--------|
| **Warehouse Operations** | Staff cannot complete picking tasks for orders containing SKU CGSRBM. Manual searching is disrupting the normal warehouse workflow and diverting staff from other tasks. |
| **Inventory Accuracy** | The inventory record for SKU CGSRBM cannot be trusted until a physical count and reconciliation are completed. The current system figure of 1,495 units is unverified. |
| **Order Fulfilment** | Any open or incoming orders that include Metal Cord Clips cannot be fulfilled until physical stock is located or the inventory record is corrected to reflect actual availability. |
| **Dispatch** | Orders containing SKU CGSRBM may be held at the picking stage, causing delays to dispatch for affected shipments. |
| **Customer Service** | Customers who have placed orders containing Metal Cord Clips face potential delays. If orders cannot be fulfilled, customer communication and potential order amendments will be required. |
| **Finance** | If stock was recorded as received but was never physically present, this may represent a financial discrepancy — either a supplier has not delivered goods that were invoiced, or an internal recording error has occurred. |
| **Daily Productivity** | The time spent by warehouse staff searching for missing stock and investigating the discrepancy reduces the overall productivity of the warehouse during the investigation period. |

---

## Operational Risks

| Risk | Description |
|------|-------------|
| **Phantom inventory** | If the root cause is not identified and corrected, the inventory system will continue to show stock that does not exist, and the same issue will recur on every picking attempt for this SKU |
| **Order fulfilment failures** | Orders for Metal Cord Clips may be confirmed by the business and then fail at the picking stage when no physical stock is available to dispatch |
| **Financial leakage** | If goods were invoiced by a supplier but never physically received, the business has paid for stock it does not have. Conversely, if stock was received but has been lost or misplaced, it represents unrecovered asset value. |
| **Inventory inaccuracies** | A phantom inventory event for one SKU raises the question of whether other SKUs in the system are also subject to similar discrepancies. Without a broader audit, this risk cannot be quantified. |
| **Labour waste** | Continued searching for stock that may not be present wastes warehouse labour. Until the root cause is confirmed, the searching will continue to consume staff time without resolution. |
| **Incorrect purchasing decisions** | If the system continues to show 1,495 units as available, procurement may delay reordering Metal Cord Clips. If the physical stock does not exist, this will result in a stockout without a replenishment order being placed. |

---

## Existing Workaround

The current workaround is a combination of manual warehouse searching, verbal investigation among warehouse staff, and review of receiving records.

- **Manual warehouse searching** — staff are physically searching Unit 4 and other warehouse areas to determine whether the Metal Cord Clips have been stored in a location other than the system-recorded position
- **Verbal investigation** — warehouse staff are informally asking colleagues whether they have knowledge of the stock being moved, received, or stored elsewhere
- **Checking receiving records** — staff are reviewing goods received records and delivery notes to establish whether the 1,495 units were ever physically received into the warehouse

This workaround is temporary only. It does not correct the inventory record, does not identify the root cause, and does not prevent the same discrepancy from affecting future operations. The manual search has not yet produced a resolution.

---

## Recommended Next Actions

The following actions are recommended to investigate and resolve the discrepancy:

1. **Immediate physical stock audit** — conduct a full physical count of all Metal Cord Clips (SKU: CGSRBM) across Unit 4 and all other warehouse locations to establish the actual physical quantity on hand
2. **Purchase Order reconciliation** — review all purchase orders for SKU CGSRBM to confirm which orders were placed, which were acknowledged by the supplier, and which quantities were invoiced
3. **Goods Received verification** — cross-reference the system goods received records against the physical delivery notes for all recent SKU CGSRBM deliveries to confirm whether the 1,495 units were recorded as received in the system with corresponding physical delivery documentation
4. **Delivery note verification** — locate and review the original delivery notes for the goods received entries that account for the 1,495 units. Confirm that the delivery notes show the same quantity as the system record.
5. **Receiving user audit** — identify which user created the goods received entries in the system for SKU CGSRBM and confirm whether those entries correspond to actual physical receipts or were entered in error
6. **Warehouse location verification** — confirm whether stock has been physically relocated within the warehouse to a location other than Unit 4 without the system being updated to reflect the move

---

## AIOS Classification

| Field | Value |
|-------|-------|
| **Classification** | Daily Issue |
| **Reason** | Active operational warehouse issue affecting daily inventory operations and order fulfilment |

This issue is classified as a Daily Issue because it is an active, unresolved operational problem that is directly affecting warehouse picking operations and inventory management on a daily basis.

**Document Gap: Not created.**
The available evidence indicates an operational inventory discrepancy — phantom inventory — rather than missing documentation. There is no evidence at this stage that the root cause is the absence of a documented process. A Document Gap should only be created if the investigation confirms that missing documentation or missing operational procedures contributed to the discrepancy. Creating a gap record before the investigation is complete would be premature.

---

## Evidence

Supporting evidence for this issue includes:

- **Warehouse screenshot** — a screenshot from the inventory or warehouse management system showing SKU CGSRBM with approximately 1,495 units recorded as available in Unit 4
- **Audio explanation from warehouse staff** — verbal explanation provided by warehouse staff describing the inability to locate physical stock, the searches conducted, and the current state of the investigation

Evidence is held by the warehouse team and is available for review when the investigation is initiated.

---

## Related AIOS Documents

This issue is separate from all previously logged issues:

| Document | Relationship |
|----------|-------------|
| [issue-001-return-parcel-accumulation.md](issue-001-return-parcel-accumulation.md) | Separate — concerns physical accumulation of returned parcels, not inventory discrepancy |
| [issue-002-website-order-collected-status.md](issue-002-website-order-collected-status.md) | Separate — concerns order status visibility, not warehouse inventory |
| [issue-003-high-return-rate-crystal-lighting-fixtures.md](issue-003-high-return-rate-crystal-lighting-fixtures.md) | Separate — concerns product return rates for specific models, not phantom inventory |
| [issue-004-labor-cost-and-assembly-pricing-discrepancy.md](issue-004-labor-cost-and-assembly-pricing-discrepancy.md) | Separate — concerns fulfilment labour and pricing, not inventory records |
| [issue-005-inaccurate-courier-parcel-counting-and-sorting.md](issue-005-inaccurate-courier-parcel-counting-and-sorting.md) | Separate — concerns dispatch courier segregation, not inventory management |
| [issue-006-inconsistent-return-addresses-on-postage-labels.md](issue-006-inconsistent-return-addresses-on-postage-labels.md) | Separate — concerns return address accuracy on labels, not physical stock discrepancy |

This issue concerns phantom inventory for a specific SKU in Unit 4. It is not a duplicate of any existing issue.

---

## Important — Classification Boundary

> **Do NOT create at this stage:**
> - Document Gap
> - Skill document
> - Context document
>
> **Reason:** The root cause of the phantom inventory discrepancy has not yet been confirmed. The investigation recommended above must be completed before any determination can be made about whether documentation, training, or operational procedures contributed to the issue.
>
> If the investigation reveals that a documented receiving process, stock movement procedure, or inventory reconciliation process is absent and that absence contributed to the discrepancy, a Document Gap should be raised at that point. Creating documentation before the root cause is confirmed risks documenting the wrong solution to an undiagnosed problem.
>
> No additional AIOS assets should be created until the investigation is complete and findings are available.

---

## Final Note

| Field | Status |
|-------|--------|
| **Root Cause Status** | Not Yet Confirmed |
| **Investigation Required** | YES |
| **Evidence Status** | Available |

---

*Issue logged: 2026-07-06 | Logged by: Vishnusri | Investigation must be completed before any further AIOS assets are created*
