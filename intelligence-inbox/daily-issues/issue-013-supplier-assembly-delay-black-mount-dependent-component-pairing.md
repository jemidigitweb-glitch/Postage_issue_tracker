# Issue 013 – Supplier Assembly Delay: Black Metal Mount and Dependent Component Manual Pairing

**Date Logged:** 2026-07-07
**Logged By:** Vishnusri
**Status:** Open — Under Investigation
**Classification:** Daily Issue

---

## Issue Summary

For approximately one month, the warehouse has been receiving black metal base plate mounts
(SKU: SPUPBM, Location: 1-E-12) and their associated 2-metre cable components as separate
items rather than as pre-assembled kits from the supplier. Because these components are
operationally dependent — the mount must be paired with the 2-metre item before dispatch —
warehouse staff are manually combining them for every order during fulfilment.

A short cable variant has also been received from the supplier but is currently not selling.

The manual pairing process is the current operational practice but has not been documented
as a formal SOP. No interim BOM or kitting procedure exists to govern how the pairing is
performed or verified. The root cause of the continued supplier assembly delay has not been
confirmed and requires investigation.

---

## Business Problem

The core problem is that two operationally dependent components are arriving separately when
they should arrive pre-assembled, creating an unplanned manual workload at the fulfilment stage:

- **Pre-assembled kits have not arrived from the supplier for approximately one month.**
  The supplier is expected to deliver SPUPBM mounts assembled with the 2-metre cable component.
  Instead, both items are arriving separately, requiring warehouse staff to combine them before
  every order can be dispatched.
- **No documented procedure exists for the manual pairing process.** The manual combining of
  mounts and 2-metre cables is being performed as an operational workaround, but no SOP, kitting
  instruction, or interim procedure has been created to standardise how this is done or to ensure
  it is applied consistently across all staff.
- **A short cable variant has been received but is not selling.** This introduces a slow-moving
  stock risk for the short cable variant while the 2-metre pairing issue remains unresolved.
- **Inventory is imbalanced across warehouse units.** SKU SPUPBM has significant stock in
  UK Unit 3 and UK Unit 4 but zero stock in UK Unit 18, creating a potential fulfilment
  constraint if demand is required from Unit 18.
- **The procurement process for dependent components is not documented.** There is no confirmed
  process that identifies SPUPBM and the 2-metre item as a dependent pair and ensures they are
  ordered, received, and tracked together through procurement and inventory management.

---

## Current Operational Process

The current warehouse fulfilment process for orders requiring the black metal mount is as follows:

1. **Order received** — an order arrives requiring the black metal base plate mount (SPUPBM)
   paired with a 2-metre cable component for customer dispatch.
2. **Mount is located and picked** — warehouse staff locate SKU SPUPBM at Location 1-E-12
   and pick the required quantity from the available stock in UK Unit 3 or UK Unit 4.
3. **2-metre cable component is picked separately** — the 2-metre cable is picked as a
   separate item because pre-assembled kits are not currently arriving from the supplier.
4. **Manual pairing is performed** — warehouse staff manually combine the mount with the
   2-metre cable before packing. This step is performed without a documented procedure or
   kitting instruction.
5. **Combined unit is dispatched** — the manually paired assembly is packed and dispatched
   to the customer.

**Failure point:** Step 4 represents the unplanned manual intervention introduced by the
supplier assembly delay. This step is performed without a documented standard, meaning the
method of pairing, the verification that pairing has been completed correctly, and the
consistency of the output across different staff members are all uncontrolled. The process
has continued in this state for approximately one month.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **Product** | Black Metal Base Plate Mount |
| **SKU** | SPUPBM |
| **Location** | 1-E-12 |
| **Stock Distribution** | UK Unit 3: significant stock; UK Unit 4: significant stock; UK Unit 18: 0 |
| **Dependent Component** | 2-metre cable item — must be paired with SPUPBM before dispatch |
| **Short Cable Variant** | Received from supplier; currently not selling |
| **Issue Duration** | Approximately one month |
| **Supplier Delivery Status** | Pre-assembled kits not arriving — components delivered separately |
| **Manual Pairing in Use** | Yes — warehouse staff manually combine mount and 2m cable per order |
| **Manual Pairing Documented** | No — no SOP, kitting instruction, or interim procedure exists |
| **Procurement Dependency Documented** | No — no confirmed process identifies SPUPBM and 2m item as a dependent pair |
| **Root Cause Status** | Not Yet Confirmed — investigation required |
| **Evidence Available** | YES — approved BI report and warehouse operational recording and screenshot |

---

## Root Cause

**Not Yet Confirmed.**

The available evidence confirms that the supplier is delivering SPUPBM mounts and 2-metre
cable components separately instead of as pre-assembled kits, and that this has been occurring
for approximately one month. However, the reason for the continued supplier assembly delay has
not been confirmed and requires investigation.

The following possibilities exist but none have been confirmed:

- The supplier may have encountered a manufacturing or assembly capacity issue that has
  prevented pre-assembled kit production
- A procurement instruction may have inadvertently ordered components separately rather than
  as assembled kits
- A supplier communication breakdown may have resulted in the assembly specification not being
  followed for recent deliveries

No assumption in this list should be treated as fact. Investigation is required before any
procurement or supplier corrective action is implemented.

---

## Business Impact

| Area | Impact |
|------|--------|
| **Warehouse Labour** | Every order requiring SPUPBM must receive manual pairing before dispatch. This adds an unplanned manual assembly step to the fulfilment workflow for this product, increasing the labour time per order and reducing overall picking efficiency for this SKU. |
| **Labour Cost** | The manual pairing effort represents an additional fulfilment cost per unit that was not intended to be part of the standard warehouse process. If the supplier delay continues, this cost accumulates across every order dispatched during the affected period. |
| **Consistency** | Because no documented pairing procedure exists, the manual combining process depends on individual staff knowledge and practice. Different staff members may perform the pairing differently, producing inconsistent output quality across orders. |
| **Inventory Imbalance** | SPUPBM stock is concentrated in UK Unit 3 and UK Unit 4 with zero stock in UK Unit 18. If orders require fulfilment from Unit 18, stock will need to be transferred or the order will be unable to be fulfilled from that unit. |
| **Slow-Moving Stock Risk** | The short cable variant received from the supplier is currently not selling. This stock occupies warehouse space and represents a financial risk if it remains unsold. A review of whether this variant will be listed, repriced, or returned is required. |
| **Procurement Visibility** | The absence of a documented dependency between SPUPBM and the 2-metre cable means procurement may not be managing these items as a paired requirement. If one component is reordered without the other, the pairing problem will recur or worsen. |

---

## Operational Risks

| Risk | Description |
|------|-------------|
| **Continued uncontrolled manual pairing** | Until the supplier resumes delivering pre-assembled kits and a documented interim procedure is created, the manual pairing process will continue without a standard or verification step for each order fulfilled. |
| **Pairing omission** | Without a documented procedure or checklist, there is a risk that the 2-metre cable component is omitted from an order — meaning a customer receives only the mount without the required cable. This would generate a customer complaint and return. |
| **Inconsistent pairing quality** | Different staff performing the manual pairing without a standard may produce inconsistent results, affecting the presentation or functionality of the dispatched unit. |
| **Inventory desynchronisation** | If SPUPBM mounts and 2-metre cables are not tracked as a dependent pair in the inventory system, stock counts for each may diverge. One component may run low without triggering a reorder because the system does not recognise the dependency. |
| **Slow-moving short cable variant accumulation** | If the short cable variant continues not to sell and no action is taken, unsold stock will accumulate, occupying warehouse space and representing a growing financial exposure. |
| **Supplier relationship** | If the cause of the supplier delay is not identified and addressed, the manual pairing workaround may continue indefinitely, normalising an inefficient process that should be temporary. |

---

## Existing Workaround

Warehouse staff are currently manually pairing the SPUPBM black metal mount with the 2-metre
cable component for every order during the fulfilment process. This allows customers to receive
a complete product despite the supplier not delivering pre-assembled kits.

This is the current operational practice adopted in response to the supplier assembly delay.
It is not a formally documented or approved workaround — no SOP, kitting instruction, or
interim procedure exists to define how the pairing should be performed, how it should be
verified, or who is responsible for the step within the warehouse workflow.

The effectiveness and consistency of this practice depend on individual staff awareness and
cannot be relied upon to produce uniform results until a documented procedure is in place.

---

## Recommended Next Actions

1. **Coordinate with the supplier** — contact the supplier to confirm the cause of the assembly
   delay, obtain an estimated timeline for resumption of pre-assembled kit delivery, and
   confirm whether a procurement instruction error contributed to the separate component
   delivery.
2. **Document the interim manual pairing procedure** — create a temporary SOP for the manual
   pairing of SPUPBM mounts with 2-metre cables during the period when pre-assembled kits are
   not available, to ensure all staff perform the pairing consistently.
3. **Review inventory synchronisation** — audit the inventory records for SPUPBM and the
   2-metre cable component to confirm that stock counts are aligned and that the dependency
   between the two items is visible in the procurement and fulfilment workflow.
4. **Review sales performance of the short cable variant** — assess whether the short cable
   variant that has been received is expected to sell, should be listed differently, or should
   be returned to the supplier or written off.
5. **Review procurement and assembly planning** — confirm whether the procurement process
   treats SPUPBM and the 2-metre cable as a dependent pair, and whether a BOM or kitting
   process should be introduced to prevent recurrence of this type of synchronisation problem.
6. **Monitor Unit 18 stock levels** — given that UK Unit 18 currently holds zero SPUPBM stock,
   confirm whether this is expected and whether transfers from Unit 3 or Unit 4 are required
   to support fulfilment from Unit 18 if demand arises.

---

## AIOS Classification

| Field | Value |
|-------|-------|
| **Classification** | Daily Issue |
| **Reason** | Active supplier assembly delay causing unplanned manual component pairing for approximately one month — no documented interim procedure; investigation and supplier coordination required |

This issue is classified as a Daily Issue because it is an active, unresolved operational
problem that is directly affecting warehouse fulfilment efficiency for SPUPBM orders. The
manual pairing requirement is confirmed. The absence of a documented procedure is confirmed.
The business impact on labour time and consistency is ongoing.

**Document Gap: Created — see gap-005-dependent-component-pairing-and-kitting-procedure.md.**
The evidence confirms that no documented procedure exists for the manual pairing of dependent
components when pre-assembled kits are not available from the supplier, and that no procurement
process currently identifies SPUPBM and the 2-metre cable as a dependent pair. This absence
of documentation is confirmed by repository evidence and is contributing directly to the
operational risk of inconsistent and unverified pairing. A Document Gap has been raised to
record this missing documentation. The gap does not assume the root cause — it records what
is demonstrably absent from the current operational record.

---

## Evidence

Supporting evidence for this issue includes:

- **Approved Business Intelligence Report** — formal BI report prepared from operational review
  materials, confirming the supplier assembly delay, the approximately one-month duration of
  manual pairing, the operational dependency between SPUPBM and the 2-metre cable, the
  slow-moving short cable variant, and the classification of this issue as a Daily Issue
  requiring investigation and supplier coordination
- **Warehouse operational recording** — audio recording from the operational review session
  (recording-013.mp3 / recording-013.ogg) in which the supplier delay and manual pairing
  practice were described; content confirmed through the approved BI report
- **Warehouse OMS screenshot** — screenshot from the LEDSone OMS showing the product catalog
  for lamp components in the same operational environment as the SPUPBM fulfilment workflow,
  including wire cage component WCSLBM (circled) providing visual context for the product
  family and warehouse system in use

Evidence is available for review when the supplier investigation and inventory audit are initiated.

---

## Related AIOS Documents

This issue is separate from all previously logged issues on distinct operational problems:

| Document | Relationship |
|----------|-------------|
| [issue-001-return-parcel-accumulation.md](issue-001-return-parcel-accumulation.md) | Separate — concerns returned parcel handling, not supplier component delivery |
| [issue-002-website-order-collected-status.md](issue-002-website-order-collected-status.md) | Separate — concerns OMS order status, not fulfilment component pairing |
| [issue-003-high-return-rate-crystal-lighting-fixtures.md](issue-003-high-return-rate-crystal-lighting-fixtures.md) | Separate — concerns product return rates, not supplier delivery and component pairing |
| [issue-004-labor-cost-and-assembly-pricing-discrepancy.md](issue-004-labor-cost-and-assembly-pricing-discrepancy.md) | Related area — both involve unplanned manual assembly adding labour cost. Issue-004 concerns multi-component assembly not reflected in pricing. Issue-013 concerns supplier-driven manual pairing not covered by a documented SOP. Different causes, different resolutions. |
| [issue-005-inaccurate-courier-parcel-counting-and-sorting.md](issue-005-inaccurate-courier-parcel-counting-and-sorting.md) | Separate — concerns courier dispatch sorting, not warehouse component assembly |
| [issue-006-inconsistent-return-addresses-on-postage-labels.md](issue-006-inconsistent-return-addresses-on-postage-labels.md) | Separate — concerns postage label return addresses, not component delivery |
| [issue-007-phantom-inventory-metal-cord-clips-unit4.md](issue-007-phantom-inventory-metal-cord-clips-unit4.md) | Separate — concerns phantom inventory for a different SKU, not supplier delay and pairing |
| [issue-008-picking-image-mismatch-wire-connectors.md](issue-008-picking-image-mismatch-wire-connectors.md) | Separate — concerns picking image data for a different SKU, not component delivery |
| [issue-009-incorrect-packaging-white-light-socket-lhrue27wh.md](issue-009-incorrect-packaging-white-light-socket-lhrue27wh.md) | Separate — concerns packaging execution for a different product, not supplier assembly |
| [issue-010-missing-twisted-and-hook-lamp-holder-variants.md](issue-010-missing-twisted-and-hook-lamp-holder-variants.md) | Separate — concerns missing stock receipt for lamp holder variants, not component pairing |
| [issue-011-assembly-hardware-mismatch-small-diamond-cage-wc-slbm.md](issue-011-assembly-hardware-mismatch-small-diamond-cage-wc-slbm.md) | Separate — concerns hardware incompatibility for WC SLBM cage, not supplier component delivery |
| [issue-012-cable-crowding-ceiling-rose-four-plus-outlets-grey-range.md](issue-012-cable-crowding-ceiling-rose-four-plus-outlets-grey-range.md) | Separate — concerns assembly configuration for ceiling roses, not supplier delivery and component pairing |

This issue concerns supplier-driven dependent component separation and the absence of a
documented manual pairing procedure. It is not a duplicate of any existing issue.

---

## Important — Classification Boundary

> **Do NOT create at this stage:**
> - Skill document
> - Context document
>
> **Already created:**
> - Document Gap 005 — gap-005-dependent-component-pairing-and-kitting-procedure.md
>
> **Reason for Document Gap creation:** Repository evidence confirms that no SOP, kitting
> procedure, or procurement dependency record exists for the SPUPBM and 2-metre cable
> pairing. This absence is directly contributing to the operational risk of inconsistent
> and unverified manual pairing. The gap records what is demonstrably absent from current
> documentation, independent of the unconfirmed root cause.
>
> **Reason for not creating Skill or Context documents:** The root cause of the supplier
> delay has not been confirmed. Skill and Context documents should only be created after
> the investigation establishes the cause and the correct resolution is known.

---

## Final Note

| Field | Status |
|-------|--------|
| **Supplier Assembly Delay** | Confirmed — pre-assembled kits not arriving for approximately one month |
| **Manual Pairing in Use** | Confirmed — warehouse staff combining mount and 2m cable per order |
| **Manual Pairing Documented** | No — no SOP or kitting procedure exists |
| **Short Cable Variant** | Received; not currently selling |
| **Root Cause** | Not Yet Confirmed |
| **Investigation Required** | YES |
| **Evidence Status** | Available |
| **Document Gap** | Created — gap-005-dependent-component-pairing-and-kitting-procedure.md |

---

*Issue logged: 2026-07-07 | Logged by: Vishnusri | Supplier coordination and interim pairing procedure documentation required before this issue can be resolved*
