# Issue 030 — Yellow Brass Finish Inconsistency from Latest Supplier Batch

**Issue ID:** ISSUE-030
**Date Logged:** 2026-07-17
**Logged By:** Vishnusri
**Domain:** purchase
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** CRSF120YB / CRSF125YB
**Document Gap:** gap-007-missing-supplier-finish-consistency-validation-and-golden-sample-approval-process.md

---

## Issue Summary

The latest Yellow Brass supplier delivery contains stock with a finish that differs
significantly from previous stock. The new batch does not match the finish of
existing stock in the warehouse.

CRSF120YB is currently mapped as a substitute for CRSF125YB. This mapping assumes
finish consistency between the two components. The new batch introduces a visible
finish variation that makes the mapped components unsuitable to mix with previous
stock and potentially invalidates the current mapping.

No documented process exists for validating supplier finish consistency before
accepting a delivery or for approving a Golden Sample / Pre-Shipment Inspection
(PSI) before production. This absence contributed to the inconsistency being
discovered at the warehouse rather than at source.

---

## Current Operational Process

At time of logging, the following is understood about the current process:

- Yellow Brass components are received from the supplier as part of scheduled
  deliveries.
- Components are accepted into warehouse stock on receipt.
- CRSF120YB is currently mapped as a substitute for CRSF125YB in product
  fulfillment.
- Substitutions are applied based on SKU mapping — no finish comparison between
  the mapped SKUs is performed before substitution is made.
- No Golden Sample or PSI approval process is documented or applied to verify
  supplier finish consistency before shipment or at point of receipt.

Note: these steps reflect the current understood process. No SOP exists for
this workflow — the above is an observation, not a confirmed documented procedure.

---

## Business Problem

The new batch of Yellow Brass components cannot be mixed with existing stock
because the finish is visibly different. This creates two immediate problems:

1. **Substitution mapping may be invalid.** CRSF120YB is mapped for CRSF125YB.
   If the new batch has a different finish, the mapped substitution is no longer
   valid for any product line where finish consistency is a visible quality
   requirement.

2. **Stock cannot be freely allocated.** Mixed-finish stock reaching customers
   on a single order (or mixed across adjacent orders) will produce an inconsistent
   product. This creates a customer quality risk if the inconsistency is not
   detected before dispatch.

The absence of a finish validation step at point of receipt means the
inconsistency was not caught before the stock entered the warehouse. It is now
necessary to segregate affected stock and investigate before any order fulfillment
using new batch components proceeds.

---

## Root Cause

**Status: Partially Confirmed**

### Confirmed Facts

- The latest Yellow Brass supplier delivery has a visibly different finish compared
  to previous stock. This is confirmed.
- CRSF120YB is currently mapped as a substitute for CRSF125YB. This mapping is
  confirmed.
- The finish inconsistency makes the new batch unsuitable to mix with existing
  stock for mapped or co-picked orders. This is confirmed.
- No documented Golden Sample or PSI approval process exists in the AIOS or in
  any known operational procedure. This is confirmed — a full repository search
  found no such documentation.
- No incoming material finish inspection step is documented or applied at point
  of receipt. This is confirmed.
- The current mapping validity has not been reassessed in light of the new batch
  finish. This is confirmed.

### Assumptions

- The finish change in the new batch was not pre-approved by LEDSone before
  shipment. This is unconfirmed — supplier communication has not been completed.
- The supplier may have changed their finishing process, materials, or supplier
  themselves. Specific cause of the finish change is unconfirmed.
- The finish difference is cosmetically significant to end customers. This is a
  reasonable inference from the BI report but has not been assessed against
  actual customer feedback or product specification.
- Previous stock and the new batch cannot be visually distinguished once
  packaged. This is an operational risk assumption — not confirmed.
- The mapping CRSF120YB → CRSF125YB was established when finish consistency
  was assumed. Whether finish consistency was ever formally verified is
  unconfirmed.

---

## Business Impact

- Fulfilled orders using mixed-finish components may result in visible quality
  inconsistency for end customers.
- Existing customer orders pending CRSF120YB or CRSF125YB fulfillment may need
  to be held until the finish issue is resolved.
- The current substitution mapping may need to be suspended or removed pending
  supplier confirmation of whether the finish change is permanent.
- Return and complaint risk increases if mixed-finish units reach customers
  before the issue is resolved.
- Financial exposure: cost of potential returns, potential write-off of affected
  new batch stock if finish cannot be corrected, and cost of any required
  supplier re-delivery.
- Repeat exposure: without a Golden Sample / PSI process, this class of
  inconsistency will recur on future deliveries.

---

## Operational Risks

- No finish inspection step exists at point of receipt. New batch components
  can enter general stock without any quality gate.
- No Golden Sample or PSI process exists to prevent finish variation at source
  before a batch is shipped.
- No documented mapping validation process exists to reassess substitution
  mappings when new stock is received from a supplier.
- Mixed-finish stock from the new batch and previous stock may already be
  co-located in warehouse locations. Risk of incorrect picking exists.
- Warehouse staff have no documented guidance on how to identify, quarantine,
  or escalate finish inconsistency at point of receipt.

---

## Existing Workaround

No confirmed workaround currently exists.

The BI report notes no documented workaround. Immediate recommended actions
include physical comparison of new and existing stock, segregation of the new
batch, and supplier communication — but none of these are supported by a
documented procedure.

---

## Recommended Next Actions

**Immediate:**

- Physically segregate all new batch Yellow Brass components (CRSF120YB /
  CRSF125YB) from existing stock. Do not allow the new batch to enter general
  picking locations until finish consistency is confirmed.
- Photograph new batch components alongside previous stock to document the
  visible finish difference.
- Suspend the CRSF120YB → CRSF125YB substitution mapping until the finish
  issue is resolved or the mapping has been re-validated.
- Raise the finish inconsistency with the supplier immediately, providing
  photographic evidence. Request confirmation of whether the finish change
  is permanent, unintentional, or a process change at their end.

**Short term:**

- Conduct a physical comparison of new and previous batch components to formally
  document the extent and nature of the finish difference.
- Reassess the CRSF120YB → CRSF125YB mapping once supplier feedback is received.
  Confirm whether the mapping remains valid, needs to be updated, or should be
  suspended permanently.
- Review any active customer orders pending these SKUs and determine whether
  fulfillment should be held, substituted with existing stock only, or paused.

**Long term:**

- Implement a Golden Sample / Pre-Shipment Inspection (PSI) process for supplier
  components where finish consistency is a quality requirement.
- Establish a documented incoming material finish inspection step at point of
  receipt for affected SKU categories.
- Document a mapping validation process: when new stock is received for a mapped
  SKU, finish and specification consistency must be confirmed before the mapping
  is applied to new batch stock.
- See Document Gap GAP-007 for the formal documentation gap record associated
  with this issue.

---

## AIOS Classification

**Daily Issue**

This issue is classified as a Daily Issue because:

- It is an active operational problem consuming purchasing and warehouse team
  resource.
- The immediate impact on stock usability and substitution mapping requires
  urgent investigation and action.
- Root cause is partially confirmed — the physical inconsistency is confirmed;
  the supplier cause and full extent of impact are under investigation.

A Document Gap (GAP-007) has been created alongside this issue because:

- A repository-wide search confirmed that no supplier finish validation, Golden
  Sample approval, or incoming material inspection process is documented anywhere
  in the AIOS.
- The absence of this documentation is a confirmed contributing cause: if a
  Golden Sample or PSI process existed, the finish variation would have been
  caught before the batch was shipped or accepted.

---

## Knowledge Capture

Supplier finish consistency cannot be assumed across deliveries, even for the
same SKU. Component substitution mappings depend on finish parity between mapped
SKUs. When a new batch is received for a mapped component, the mapping must be
validated against the new stock before it is applied. A Golden Sample or PSI
process is the standard mechanism for preventing finish inconsistency from
entering the supply chain. Without one, finish variation is only discovered at
the warehouse — after the batch has been accepted.

---

## Duplicate Check

Repository search completed before creating this issue.

Search terms checked:

- Yellow Brass
- Brass Finish
- CRSF120YB
- CRSF125YB
- Supplier Finish
- Finish inconsistency
- Colour mismatch
- Supplier quality
- Golden Sample
- PSI
- Brass mapping

Results:

- ISSUE-025 (Yellow Brass Wall Sconce Packaging Label Mismatch): concerns a
  packaging label discrepancy ("2 PACK" vs Pack of 1) for SKU WSFS1YBYB.
  Different SKU, different issue type. Not a duplicate.
- ISSUE-022 (SKU Overlap PVC Rubber Cable): concerns a different product
  category and SKU. Not a duplicate.
- No other existing Daily Issue or Document Gap matches the CRSF120YB /
  CRSF125YB finish inconsistency, Golden Sample, or PSI process.

**Duplicate status: GREEN**

---

## Future AIOS Recommendation

**Recommendation: Introduce a supplier Golden Sample and Pre-Shipment Inspection
(PSI) approval process for components where finish consistency is a quality
requirement.**

This is a recommendation only. It is NOT an approved business rule.

A Golden Sample approval process would:

- Require the supplier to submit a representative sample (Golden Sample) of any
  new component batch for approval by LEDSone before mass production or shipment.
- Allow LEDSone to compare the submitted sample against the existing approved
  finish standard before accepting the batch.
- Provide a documented approval record that the batch meets the finish
  specification.

A PSI process would:

- Require a pre-shipment inspection at the supplier's facility or at the port
  of origin before the batch is shipped.
- Include a finish comparison against the Golden Sample or approved specification.
- Prevent non-conforming batches from entering the shipping pipeline.

Both processes are standard in supplier quality management for manufactured
components. This recommendation should be reviewed once the supplier has
responded to the finish inconsistency raised through ISSUE-030.

---

## Executive Summary

The latest Yellow Brass supplier delivery contains stock with a visibly different
finish from previous batches. The current CRSF120YB → CRSF125YB substitution
mapping assumes finish parity between the two SKUs and may no longer be valid.
No Golden Sample, PSI, or incoming material finish inspection process exists in
the AIOS or in any documented operational procedure.

Immediate actions required: segregate new batch stock, photograph the finish
difference, suspend the affected mapping, and raise a quality alert with the
supplier. A Document Gap (GAP-007) has been opened to formalise the missing
supplier finish validation and Golden Sample approval process.

Root cause is partially confirmed. The physical finish inconsistency is
confirmed. The supplier's reason for the finish change is under investigation.

---

## Document Gap Reference

**GAP-007:** Missing Supplier Finish Consistency Validation and Golden Sample
Approval Process

File: `intelligence-inbox/document-gaps/gap-007-missing-supplier-finish-consistency-validation-and-golden-sample-approval-process.md`

---

## Known Limits

- Supplier response not yet obtained — finish change cause unknown.
- Full batch scope not assessed — number of affected units unknown.
- Whether the mapping CRSF120YB → CRSF125YB was ever validated against a finish
  standard is unconfirmed.
- Whether any existing Golden Sample or PSI process exists informally (outside
  the AIOS) has not been confirmed with the procurement team.
- Root cause of the supplier's finish change is not yet confirmed.

---

## Evidence Status

- No photographic evidence attached at time of logging.
- Source: Business Intelligence Report (supplier batch analysis).
- Photographs of finish comparison (new batch vs. previous stock) should be
  captured immediately and attached to this issue.
- Supplier communication records to be attached when available.

---

## Next Step

Segregate new batch Yellow Brass components. Photograph finish difference.
Suspend CRSF120YB → CRSF125YB substitution mapping. Raise quality alert with
supplier. Escalate to Varmen for review of GAP-007 and for guidance on whether
a Golden Sample or PSI process should be formalised.

---

*Issue logged: 2026-07-17 | Logged by: Vishnusri | Root cause partially confirmed — supplier notification, stock segregation, and mapping review required before any fulfillment of new batch stock proceeds*
