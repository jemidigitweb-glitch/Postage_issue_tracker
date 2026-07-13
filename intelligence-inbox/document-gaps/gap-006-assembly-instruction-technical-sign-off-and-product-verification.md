# Gap 006 – Assembly Instruction Technical Sign-Off and Product-to-Manual Verification

**Date Logged:** 2026-07-08
**Logged By:** Vishnusri
**Status:** Open
**Classification:** Document Gap
**Linked Issue:** ISSUE-016 (issue-016-assembly-instruction-component-quantity-discrepancy-dwc112025.md)

---

## Gap Summary

No documented technical sign-off or physical-product-to-instruction verification process
currently exists before assembly instructions are approved for supplier mass printing and
customer distribution. This absence means a component quantity listed in an instruction
manual can be inaccurate without any internal check catching it before the instructions
reach customers at scale.

This gap was identified through ISSUE-016 (Assembly Instruction Component Quantity
Discrepancy: DWC112025 3-Head Diamond Pendant Lamp), in which the printed instruction
manual lists Component G (nuts) as "x5Pcs" for a product whose correct component quantity
has not been confirmed. Customers are contacting the business believing hardware is missing,
generating avoidable replacement activity.

---

## Current Situation

Assembly instructions for LEDSone products are created and submitted to suppliers for
inclusion in physical product packaging. Based on the evidence from ISSUE-016, the
instructions for SKU DWC112025 were reportedly not re-checked for accuracy against the
physical product before being approved for mass printing.

No process currently exists to:

- Compare the component list and quantities in a draft instruction manual against a
  physical unit of the product before printing is authorised.
- Confirm that instruction content has been updated when product configuration changes
  (such as a head-count change from a multi-head variant to another).
- Obtain a named sign-off confirming that the instruction is technically accurate before
  supplier submission.
- Record which version of an instruction was approved, by whom, and when.

The absence of this process means instruction errors can enter mass printing and reach
customers without any internal detection step.

---

## Missing Documentation

The AIOS currently lacks documented guidance for the following:

| Missing Document | Description |
|-----------------|-------------|
| **Assembly instruction approval checklist** | No checklist exists requiring a physical product-to-manual comparison before printing is authorised. Component types, quantities, and assembly sequence must be verified against a physical unit. |
| **Technical sign-off record** | No sign-off record exists to capture: who reviewed the instruction, which product was used for verification, the date of review, and the version approved for printing. |
| **Instruction version control** | No versioning system or change log exists to record when an instruction was last updated, what changed, and why. |
| **Configuration-change update trigger** | No documented trigger exists requiring instruction review when a product's configuration changes (e.g., head count, component count, or accessory variant). |
| **Post-print customer feedback loop** | No documented process exists for routing customer reports of instruction discrepancies back to the listing team for investigation and correction. |

---

## Business Impact of This Gap

| Impact Area | Effect |
|-------------|--------|
| **Customer experience** | Customers receive instructions stating a quantity that does not match their expectation of the product, creating a perception of missing hardware |
| **Replacement cost** | Each replacement request generates avoidable cost — staff time to process, stock consumed, and logistics overhead |
| **Brand confidence** | Repeated instruction errors, if not caught, reduce customer confidence in product quality and packaging accuracy |
| **Operational workload** | Replacement requests and customer contacts create recurring workload that would not exist if instructions were verified before printing |
| **Scalability risk** | Without a sign-off process, any product with a changed configuration or a reused template can generate the same type of error without internal detection |

---

## Recommended Control (Not Yet Business-Approved)

> **The following controls are proposed recommendations only.**
> They have not been reviewed or approved as company operational policy.
> They should not be treated as confirmed business rules until reviewed by the
> relevant team lead and confirmed by Varmen or equivalent authority.

### Proposed: Assembly Instruction Verification and Sign-Off Process

Before any assembly instruction is submitted to a supplier for mass printing, the
following verification steps are recommended:

1. **Physical product sampling.** A physical unit of the product is obtained and all
   components are counted and identified against the draft instruction manual.
2. **Component-by-component comparison.** Each listed component (type, label, quantity)
   is confirmed against the physical unit. Discrepancies are flagged before sign-off.
3. **Assembly sequence check.** The instruction steps are followed with the physical
   product to confirm completeness and logical order.
4. **Named sign-off.** A named member of the listing team confirms in writing:
   - Product SKU reviewed
   - Physical unit used for verification
   - Date of review
   - Version of instruction approved
5. **Version recording.** The approved instruction version is recorded in the product
   record with the sign-off date and reviewer name.
6. **Change trigger rule.** Any change to product configuration (head count, component
   variant, accessory type) triggers a mandatory instruction review and re-sign-off
   before the updated instruction is submitted for printing.

---

## Gap Classification Boundary

> **Created at this stage:**
> - This gap document (gap-006)
>
> **NOT created at this stage:**
> - Skill document (proposed control not yet approved)
> - Context document (root cause of ISSUE-016 not yet confirmed)
>
> **Reason:** The gap records an absent process that is demonstrably missing from current
> operations, independent of the specific root cause of ISSUE-016. The recommended controls
> above are proposals only and must not be treated as business-approved rules until reviewed
> by the appropriate authority.

---

## Related Documents

| Document | Relationship |
|----------|-------------|
| [issue-016-assembly-instruction-component-quantity-discrepancy-dwc112025.md](../daily-issues/issue-016-assembly-instruction-component-quantity-discrepancy-dwc112025.md) | Source issue that identified this gap |
| [gap-005-dependent-component-pairing-and-kitting-procedure.md](gap-005-dependent-component-pairing-and-kitting-procedure.md) | Related gap in a different domain: concerns the absence of warehouse pairing procedures for dependent components, not assembly instruction sign-off |

---

## Status

| Field | Status |
|-------|--------|
| **Gap confirmed** | Yes — no sign-off or verification process exists for assembly instructions before mass printing |
| **Proposed control documented** | Yes — above, marked as proposed/not approved |
| **Business approval obtained** | No — pending review |
| **Linked issue** | ISSUE-016 |
| **Next action** | Listing team lead to review proposed control and confirm or modify before operational implementation |

---

*Gap logged: 2026-07-08 | Logged by: Vishnusri | Proposed controls require business review before operational use*
