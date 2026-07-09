# Issue 004 – Labor Cost and Assembly Pricing Discrepancy

**Date Logged:** 30-06-2026
**Logged By:** Vishnusri
**Status:** Open — Under Investigation
**Classification:** Daily Issue

---

## Issue Summary

Certain products in the LEDSone range require excessive picking time and manual assembly compared to their selling price. Warehouse staff are spending significantly more time fulfilling these products than would be expected given their price point, and the labour required to pick, assemble, pack, and dispatch them does not appear to be reflected in current pricing decisions.

The warehouse team believes that fulfilment labour is being excluded from the pricing model, resulting in products being sold at prices that do not cover the true cost of their fulfilment.

---

## Business Problem

Warehouse staff are spending excessive time picking multiple individual components and manually assembling products before they can be packed and dispatched. Some products require four to five separate components to be located, picked, and assembled by hand before the order is ready to ship.

Despite the additional time and effort required to fulfil these products, their selling prices appear to have been set without input from warehouse operations. Pricing decisions appear to be made independently of fulfilment labour costs, meaning that the more labour-intensive a product is to fulfil, the greater the gap between its actual fulfilment cost and its selling price. This results in the business underpricing its most labour-intensive products.

---

## Current Operational Process

Orders containing affected products currently follow this process:

1. **Orders received** — orders are received in the OMS and allocated to the warehouse for picking
2. **Multiple component picking** — warehouse staff must locate and pick four to five individual components per product from across the warehouse
3. **Manual assembly** — components are manually assembled by warehouse staff before the item can be packed
4. **Packing** — the assembled product is then packed appropriately for dispatch
5. **Dispatch** — the packed order is labelled and handed over to the courier

No process currently exists to record the time taken per product, flag high-labour SKUs for pricing review, or ensure that fulfilment effort is communicated to the teams responsible for pricing.

---

## Known Facts

| Fact | Detail |
|------|--------|
| Component count | Some SKUs require 4–5 individual components to be picked separately |
| Assembly requirement | Manual assembly by warehouse staff is required before packing can begin |
| Reporting history | Warehouse staff have reported the issue multiple times to management |
| Pricing model | Current selling prices may not include warehouse labour cost as an input |

---

## Business Impact

| Area | Impact |
|------|--------|
| **Warehouse efficiency** | High component counts and manual assembly slow down the overall picking and packing workflow, reducing throughput per shift |
| **Picking time** | Staff spend a disproportionate amount of time on a small number of SKUs, reducing the number of orders that can be processed in a given period |
| **Dispatch** | Slower picking and assembly times for affected products reduce daily dispatch capacity when order volumes are high |
| **Labour utilisation** | Warehouse labour hours are being consumed by assembly tasks that were not planned for or costed into the product price |
| **Financial performance** | If selling prices do not include fulfilment labour, the business is absorbing a cost that is not being recovered through the sale, reducing margin on every unit dispatched |
| **Customer service** | Delays caused by labour-intensive products risk impacting overall dispatch timelines, which may affect customer delivery expectations |

---

## Operational Risks

| Risk | Description |
|------|-------------|
| **Increasing labour cost** | As order volumes grow, the unrecovered labour cost from high-assembly products will scale proportionally, increasing the financial impact |
| **Reduced warehouse productivity** | Continued manual assembly without process improvement will constrain the warehouse's ability to scale throughput |
| **Pricing inaccuracies** | Without a formal mechanism to feed warehouse labour data into pricing decisions, the disconnect between fulfilment cost and selling price will persist |
| **Financial loss** | Products that cost more to fulfil than their price accounts for represent a direct financial loss on every unit sold |
| **Staff frustration** | Warehouse staff who have repeatedly raised this concern without resolution risk disengagement if the issue continues to be unaddressed |

---

## Existing Workaround

Warehouse staff continue to manually pick all required components and assemble affected products as part of the standard fulfilment process. They have repeatedly reported the concern to management through available channels.

No alternative process has been implemented. The workaround — completing the assembly as required — ensures orders are fulfilled but does nothing to reduce the labour involved or ensure that the cost is reflected in pricing. The concern remains unresolved despite repeated reporting.

---

## Recommended Next Actions

The following actions are recommended before any documentation or procedure decisions are made:

1. **Conduct fulfilment time study** — measure the actual time required to pick, assemble, pack, and dispatch the most labour-intensive SKUs to produce accurate data on fulfilment labour per unit
2. **Review labour cost** — calculate the actual warehouse labour cost per unit for affected products based on time study findings and current labour rates
3. **Review selling prices** — compare the calculated fulfilment labour cost per unit against the current selling price of each affected product to quantify the gap
4. **Evaluate pre-assembly** — assess whether affected products could be pre-assembled in bulk during quiet periods to reduce picking and assembly time during peak order fulfilment
5. **Consider supplier kitting** — explore whether suppliers could provide affected products as pre-kitted units rather than as individual components, eliminating the warehouse assembly step entirely

---

## AIOS Classification

| Field | Value |
|-------|-------|
| **Classification** | Daily Issue |
| **Reason** | Recurring operational issue affecting warehouse productivity and business profitability |

This issue is classified as a Daily Issue because it is an active, repeating operational problem that is consuming warehouse labour on every affected order. A related Document Gap (Gap 003) has been raised separately to capture the absence of documented guidance on labour-inclusive pricing and assembly assessment.

---

## Evidence

Supporting evidence for this issue includes:

- **Operational photographs** — photographic evidence from the warehouse showing the component picking and manual assembly process for affected products
- **Audio explanation from Postage Team** — verbal explanation provided by the Postage Team describing the assembly requirement, the time involved, and the history of reporting the concern to management

Evidence is held by the Postage Team and is available for review if investigation is initiated.

---

## Related AIOS Documents

| Document | Relationship |
|----------|-------------|
| [issue-001-return-parcel-accumulation.md](issue-001-return-parcel-accumulation.md) | Related — also a warehouse operational issue, but concerns parcel accumulation rather than fulfilment labour |
| [issue-002-website-order-collected-status.md](issue-002-website-order-collected-status.md) | Related — also an open daily issue, but concerns order status visibility rather than warehouse labour |
| [issue-003-high-return-rate-crystal-lighting-fixtures.md](issue-003-high-return-rate-crystal-lighting-fixtures.md) | Related — also concerns product-level operational impact, but covers return rates rather than assembly labour |

This is a separate operational issue concerning fulfilment labour and pricing. It is not a duplicate of any existing issue.

**See also:** [gap-003-labor-inclusive-pricing-and-assembly-guidelines.md](../document-gaps/gap-003-labor-inclusive-pricing-and-assembly-guidelines.md)

---

*Issue logged: 30-06-2026 | Logged by: Vishnusri | Awaiting investigation assignment*
