# Gap 005 – Dependent Component Pairing and Kitting Procedure

**Date Logged:** 2026-07-07
**Logged By:** Vishnusri
**Status:** Open
**Classification:** Document Gap

---

## Gap Summary

No documented procedure currently exists within the Postage AIOS or wider LEDSone operational
documentation for the manual pairing of dependent components when pre-assembled kits are not
available from the supplier. Warehouse staff have been manually combining black metal base plate
mounts (SKU: SPUPBM) with 2-metre cable components for approximately one month without a
defined SOP, kitting instruction, or verification step. Additionally, no procurement process
currently identifies SPUPBM and the 2-metre cable as a dependent component pair, meaning
the dependency is not formally managed through ordering, receiving, or inventory tracking.

This gap was identified through Issue 013 (Supplier Assembly Delay: Black Metal Mount and
Dependent Component Manual Pairing).

---

## Current Situation

The warehouse is currently receiving SPUPBM black metal base plate mounts and their associated
2-metre cable components as separate items from the supplier, rather than as pre-assembled kits.
Because the mount and cable are operationally dependent — they must be paired before customer
dispatch — warehouse staff are manually combining them during the fulfilment process for every
order that includes this product.

This manual pairing practice has been in operation for approximately one month. It is performed
without:

- A documented step-by-step procedure for how the pairing is performed
- A verification step confirming that pairing has been completed correctly before dispatch
- A defined responsibility for who performs the pairing within the warehouse workflow
- A kitting or BOM record that formally identifies the two components as a dependent pair
- A procurement dependency record that ensures both items are ordered, received, and tracked
  together

The absence of this documentation means the pairing process is dependent on individual staff
knowledge and informal practice, with no mechanism to ensure it is performed consistently
across all orders and all staff members.

---

## Missing Documentation

The AIOS currently lacks documented guidance for the following:

| Missing Document | Description |
|-----------------|-------------|
| **Interim manual pairing SOP** | No documented procedure exists for manually combining the SPUPBM mount with the 2-metre cable component when pre-assembled kits are not available from the supplier |
| **Component dependency record** | No record formally identifies SPUPBM and the 2-metre cable as a dependent pair that must be managed together through procurement, receiving, and inventory tracking |
| **Kitting/BOM procedure** | No BOM or kitting procedure exists that defines which components must be paired for SPUPBM-based products and what the correct configuration is for each product variant |
| **Pairing verification step** | No documented check or verification step exists to confirm that manual pairing has been completed correctly before a unit is packed and dispatched |
| **Slow-moving variant review process** | No documented process exists for reviewing and actioning slow-moving component variants (such as the short cable variant currently received but not selling) within the context of a supplier delivery change |

---

## Business Impact

| Impact | Description |
|--------|-------------|
| **Uncontrolled manual process** | The absence of a documented pairing procedure means the manual combining step has no standard, no verification, and no defined ownership — creating a risk of inconsistent output quality and undetected omission errors across orders |
| **Pairing omission risk** | Without a checklist or verification step, there is a direct risk that the 2-metre cable is omitted from a dispatched order, resulting in a customer receiving only the mount without the required cable component |
| **Procurement desynchronisation** | Without a formal dependency record, the two components may be reordered independently, leading to stock imbalances where one component runs out while the other accumulates — or to repeat occurrences of the same pairing problem after future supplier deliveries |
| **Ongoing labour inefficiency** | Without a documented interim SOP, the manual pairing process cannot be optimised, timed, or reviewed for efficiency — meaning the labour impact of the supplier delay cannot be measured or managed |

---

## Required Documentation

The following documentation is recommended for creation once the supplier investigation
under Issue 013 has established the root cause and the timeline for resumption of
pre-assembled kit delivery:

| Document | Purpose |
|----------|---------|
| **Interim manual pairing SOP** | Define the step-by-step procedure for manually combining SPUPBM mounts with 2-metre cables, including who performs the step, how it is verified, and how it is recorded before dispatch |
| **Component dependency register** | A register identifying which SKUs have mandatory dependent components that must be paired before dispatch, what the correct pairing is for each, and where each component is located in the warehouse |
| **BOM/Kitting procedure guidance** | Define the process for creating and maintaining BOM or kitting records for products that consist of multiple operationally dependent components, to prevent inventory and procurement desynchronisation |
| **Slow-moving variant review process** | Define the process for identifying, escalating, and resolving slow-moving stock that arises from supplier delivery changes — including criteria for repricing, relisting, or returning unsold variants |

> **Note:** The interim manual pairing SOP should be created as soon as possible to
> reduce operational risk, regardless of whether the root cause investigation has been
> completed. The broader BOM/Kitting procedure and dependency register should not be
> finalised until the root cause and the expected long-term supplier arrangement are confirmed.

---

## Evidence

This gap was identified through the following evidence:

- **Approved Business Intelligence Report (Issue 013)** — confirms that the manual pairing
  practice has been in operation for approximately one month without a documented procedure,
  and that no procurement process currently manages the SPUPBM and 2-metre cable dependency
- **Warehouse operational recording** — audio recording (recording-013.mp3 / recording-013.ogg)
  from the operational review session in which the absence of a documented pairing procedure
  was described; content confirmed through the approved BI report
- **AIOS repository review** — the CLAUDE.md and existing context, skills, and gap documents
  do not contain any BOM, kitting, or dependent component pairing procedure for SPUPBM or
  equivalent products, confirming that no such documentation currently exists within the AIOS

---

## Related Issue

| Document | Relationship |
|----------|-------------|
| [issue-013-supplier-assembly-delay-black-mount-dependent-component-pairing.md](../daily-issues/issue-013-supplier-assembly-delay-black-mount-dependent-component-pairing.md) | Source issue — this gap was identified as a direct result of the operational problem described in Issue 013 |
