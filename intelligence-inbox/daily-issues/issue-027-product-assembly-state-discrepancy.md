# Issue 027 — Product Assembly State Discrepancy

**Issue ID:** ISSUE-027
**Date Logged:** 2026-07-17
**Logged By:** Vishnusri
**Domain:** listing
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** LHBPE27BM
**Document Gap:** None

---

## Issue Summary

SKU LHBPE27BM (lamp holder) is being shipped as components only — assembly is
required by the customer. The Shopify product presentation does not clearly
communicate this. A customer complaint was received via Help Desk ticket 31186,
indicating that the customer expected a ready-to-use assembled product and
received unassembled components instead.

There is a confirmed mismatch between the physical delivery state of this product
and how it is presented on Shopify. The root cause — whether the listing is
incorrect or the fulfilment method has changed from the original product design
intent — has not been fully confirmed.

---

## Classification

Daily Issue

---

## Confirmed Facts

- SKU: LHBPE27BM
- Product type: lamp holder
- Physical delivery state: components only (assembly required by customer)
- Shopify presentation: does not clearly indicate assembly is required or that the
  product is supplied as components only
- Customer complaint received: Help Desk ticket 31186
- The customer expected a product in an assembled or ready-to-use state
- A confirmed mismatch exists between the physical product state and the digital
  presentation

---

## Assumptions

- The customer who raised Help Desk 31186 was misled by the Shopify listing into
  believing the product was supplied assembled.
- Other customers who have ordered LHBPE27BM may have the same expectation.
- No other SKUs with the same assembly state mismatch have been confirmed at this
  time — this assumption is unverified.

Assumptions above are unconfirmed. Supplier product specification and original
listing intent have not been reviewed at time of logging.

---

## Business Impact

- Customer dissatisfaction when a product requiring assembly arrives without
  clear prior notice.
- Increased return rate risk if customers expect an assembled product and receive
  components.
- Reputational risk on Shopify if customers leave negative reviews citing
  unexpected assembly requirements.
- Potential repeat Help Desk volume if the listing remains unchanged and other
  customers place orders for LHBPE27BM.

---

## Operational Risks

- No confirmed process for identifying all SKUs where the physical delivery state
  differs from the Shopify presentation.
- Risk that the listing has never been updated to reflect the actual product
  state, meaning other similar SKUs may have the same problem.
- Without a resolution decision from management, this issue will recur for every
  LHBPE27BM order.

---

## Existing Workaround

No confirmed workaround currently exists.

Help Desk 31186 has been logged. No corrective action has been taken on the
Shopify listing or the fulfilment method pending a management decision.

---

## Recommended Actions

**Immediate:**

- Retrieve and review Help Desk ticket 31186 to confirm the exact customer
  complaint and the product state received.
- Confirm the current physical delivery state of LHBPE27BM by checking the
  product specification with the supplier or warehouse.
- Escalate to management for a binary business decision — see Management Decision
  Required section below.

**Short term:**

- Once the management decision is confirmed, implement either the fulfilment
  change or the listing change — not both in isolation.
- Audit other lamp holder SKUs for the same assembly state mismatch before
  further orders are affected.

**Long term:**

- Evaluate introducing a mandatory Delivery State product attribute across all
  SKUs — see Future AIOS Recommendation section below.

---

## Management Decision Required

**This issue cannot be resolved at the operational level. A management decision
is required before any corrective action is taken.**

Management must choose ONE of the following options:

**Option 1 — Change fulfilment**

Ship LHBPE27BM in an assembled or partially assembled state so that the product
matches the current Shopify presentation. This requires a supplier change, a
warehouse assembly step, or a product sourcing change.

**Option 2 — Change digital presentation**

Update the Shopify listing for LHBPE27BM to clearly state that the product is
supplied as components only and that customer assembly is required. This does not
change the physical product but removes the expectation mismatch.

**Do not choose a default option.** Both options have cost, fulfilment, and
customer experience implications. This decision belongs to management, not to the
operational team.

Escalate to: Varmen

---

## Root Cause

**Status: Partially Confirmed**

The mismatch between the physical delivery state and the Shopify presentation is
confirmed. The underlying cause of the mismatch — whether the listing was created
incorrectly, the supplier changed the product state without notification, or the
fulfilment method was changed without updating the listing — has not been
confirmed at time of logging.

No root cause investigation has been completed beyond confirming the mismatch
and the customer complaint in Help Desk 31186.

---

## Knowledge Capture

Products that require customer assembly must have their assembly state clearly
communicated at the point of sale. When physical delivery state and digital
presentation diverge, customer complaints and returns follow. This issue
highlights the absence of a structured product attribute that distinguishes
between Assembled, Partial Assembly, and Components Only delivery states.

---

## Future AIOS Recommendation

**Recommendation: Introduce a mandatory Delivery State product attribute.**

This is a recommendation only. It is NOT an approved business rule.

A Delivery State attribute, applied to all product listings, would prevent
assembly state mismatches by making the expected customer experience explicit
at the listing level.

Proposed values:

| Value | Meaning |
|-------|---------|
| Assembled | Product arrives fully assembled and ready to use |
| Partial Assembly | Product arrives mostly assembled; minor steps required |
| Components Only | Product arrives as separate components; full assembly required |

This attribute would be populated at product creation and verified at supplier
onboarding. It would be visible to customers on the Shopify listing and available
to the warehouse team as a packing and labelling reference.

This recommendation should be reviewed once the management decision on
LHBPE27BM is confirmed.

---

## Duplicate Check

Repository search completed before creating this issue.

Search terms checked:

- LHBPE27BM
- assembly required
- components only
- lamp holder
- Help Desk 31186
- Shopify
- product assembly state
- assembly state discrepancy

No existing canonical Daily Issue found matching this operational failure.

**Duplicate status: GREEN**

---

## Document Gap Review

**Decision: NO DOCUMENT-GAP CHANGE**

**Reason:** Root cause has not been fully confirmed. The mismatch is confirmed,
but whether the missing process is a listing creation standard, a supplier
onboarding standard, or a fulfilment specification is not yet established. A
Document Gap must not be created before root cause is confirmed (per
`skills/rules/aios-rules.md`). This issue is recorded as a Daily Issue only.

---

## Known Limits

- Root cause not fully confirmed — only the mismatch is confirmed.
- Physical delivery state confirmed from Help Desk 31186 only — warehouse
  confirmation not yet obtained.
- Shopify listing content not reviewed at time of logging — exact wording of
  current listing unknown.
- Scope of affected orders (how many customers received LHBPE27BM expecting an
  assembled product) not assessed.
- No other SKUs have been audited for the same mismatch.

---

## Evidence Status

- Help Desk ticket 31186 references this issue.
- No photographic or documentary evidence attached at time of logging.
- Evidence to be attached when the Shopify listing screenshot and supplier
  product specification are obtained.

---

## Next Step

Retrieve Help Desk ticket 31186. Confirm physical delivery state of LHBPE27BM
with warehouse or supplier. Escalate to Varmen for the management decision on
Option 1 (change fulfilment) or Option 2 (change digital presentation) before
any corrective action is taken.

---

*Issue logged: 2026-07-17 | Logged by: Vishnusri | Root cause partially confirmed — management decision required before any corrective action*
