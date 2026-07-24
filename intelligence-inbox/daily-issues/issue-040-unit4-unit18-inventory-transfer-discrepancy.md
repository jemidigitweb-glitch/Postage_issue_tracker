# Issue 040 — Unit 4 / Unit 18 Inventory Transfer Discrepancy and Held Labels

**Issue ID:** ISSUE-040
**Date Logged:** 2026-07-21
**Logged By:** Vishnusri
**Domain:** purchase
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**Document Gap:** None

---

## Issue Summary

A significant failure in the stock update and transfer process between Unit 4
and Unit 18 has resulted in a backlog of held shipping labels and inaccurate
inventory records.

Stock intended for Unit 4 is not arriving or being updated in the system.
Items from Unit 18 are not being dispatched or recorded correctly. The
immediate operational consequence is that shipping labels are being held:
orders have reached the labelling stage but cannot be shipped because the
physical whereabouts or availability of the stock cannot be confirmed.

A key contributing factor is that stock was removed from the warehouse during
a specific staff member's leave period without notification or documentation
being provided to the inventory lead. Despite requests in the communication
group, information regarding the removed products was not shared.

---

## Business Problem

- **Inventory records are inaccurate.** The system records for Unit 4 and
  Unit 18 do not reflect the physical stock position. Neither the system nor
  the physical warehouse can currently be treated as fully reliable without
  reconciliation.
- **Shipping labels are held.** Orders have progressed to the labelling stage
  but cannot be dispatched because the physical items are missing or their
  locations are unconfirmed. This directly delays fulfilment.
- **Staff resource is consumed by repeated physical checks.** Daily physical
  checks at Unit 18 are being performed to locate missing items, consuming
  staff time without resolving the underlying discrepancy.
- **Informal communication is the only transfer record.** Stock movements are
  reportedly communicated via a group messaging platform. This creates a
  retrospective, informal record that cannot substitute for a formal
  transfer/checkout process.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **Date of operational event** | 2026-07-21 |
| **Warehouses affected** | Unit 4 and Unit 18 |
| **System status** | Inventory updates for Unit 4 and Unit 18 are currently inaccurate |
| **Fulfilment impact** | Shipping labels are being held pending resolution; affected orders cannot be dispatched |
| **Root cause — removal** | Items were removed from the warehouse during a specific staff member's ("Sudhan-akka") leave period without notification or documentation being provided to the inventory lead |
| **Root cause — communication** | Despite requests in the communication group, information regarding the removed products was not shared |
| **Workaround in use** | Printed labels are held; staff conduct physical checks at Unit 18; group-chat messages are used retrospectively to request information about missing items |
| **Staff responsible for investigation** | Mithisha and Manoranjani are identified in the supplied report as responsible for investigating and managing these stock flows |
| **Current check regime** | Daily physical checks at Unit 18 are being performed but items have not yet been located |

---

## Assumptions — Not Confirmed Facts

The following are inferred from the operational context but have not been
independently confirmed and must not be treated as facts in any downstream
document, SOP, or business rule:

1. The discrepancies may be isolated only to products taken during the
   referenced leave period. Whether other items or periods are also affected
   has not been confirmed.

2. The physical stock may still exist and may simply be lost or unaccounted
   for within the transfer process between units, rather than permanently
   absent.

> **Do not treat either assumption as a confirmed fact. Do not encode them
> as business rules or system requirements without separate confirmation.**

---

## Root Cause

**Confirmed:**

1. Inventory updates for Unit 4 and Unit 18 are currently inaccurate.
2. Items were removed from the warehouse during a specific staff member's
   ("Sudhan-akka") leave period without notification or documentation being
   provided to the inventory lead.
3. Despite requests in the communication group, information regarding the
   removed products was not shared.

**Unconfirmed (see Assumptions above):**

- Whether the discrepancy is limited to the leave period or extends further.
- Whether the physical stock is still present within the warehouse system in
  an untracked location, or is permanently unaccounted for.

---

## Business Impact

- **Operational delay.** A volume of shipping labels is being held, preventing
  timely dispatch of affected orders.
- **Financial inaccuracy.** Stock discrepancies create inaccuracies in
  recorded stock value and reported availability. Extent of financial impact
  has not been quantified in the supplied report.
- **Resource wastage.** Staff are required to perform repeated physical
  checks at Unit 18 to attempt to locate missing items, displacing productive
  work.

Do not infer specific monetary values, exact order counts, or a confirmed
number of held labels from the above — none were stated in the supplied
report.

---

## Operational Risks

- **Customer dissatisfaction.** Shipping delays caused by held labels may
  lead to customer dissatisfaction or order cancellation if fulfilment is
  not restored promptly.
- **Inventory shrinkage risk.** Unrecorded warehouse removal creates a risk
  that stock cannot be properly traced within the system. This is a risk, not
  a confirmed outcome — the supplied report does not establish that stock has
  been permanently lost or cannot be traced.
- **Process breakdown.** The current transfer workflow relies on informal
  group communication rather than a consistently recorded
  transfer/checkout process. When a key person is absent, the informal
  process breaks down and no formal fallback exists.

---

## Fix and Action Required

1. **Conduct a physical stock reconciliation at Unit 4 and Unit 18.** Locate
   and count all stock physically present at both locations and reconcile
   against system records.

2. **Identify what was moved during the referenced leave period.** Determine
   which items were removed, when, and to where, and update the inventory
   records accordingly.

3. **Establish a formal notification and recording process for warehouse
   transfers.** Rather than relying solely on retrospective group-chat
   messages, introduce a formal step requiring that warehouse removals are
   recorded and confirmed with the inventory lead at the time of transfer.

These are recommended actions from the supplied BI report. Their completion
status is unknown at time of logging. Do not mark any as completed without
separate confirmation.

---

## Document Gap

**Document Gap Created:** None

The supplied BI report classifies ISSUE-040 as a Daily Issue — an active
operational breakdown requiring stock reconciliation and process correction.

A repository inspection found no existing SOP, rule, or documented process
covering inter-unit warehouse transfers or stock removal recording for
Unit 4 / Unit 18. The BI report recommends a formal transfer recording
process and a digital warehouse sign-out system.

However, the conditions for creating a Document Gap are not independently met:

- The requirement for such a document has not been confirmed to exist as an
  expected and approved part of the AIOS operational framework.
- The BI report's recommendation is a Future AIOS Recommendation, not
  evidence of a confirmed missing required document.

No Document Gap has been created at this stage. If a repository review
independently confirms that a warehouse transfer recording SOP is required
and expected, a separate gap should be raised at that time.

---

## Knowledge Capture

From the supplied BI report:

- Inventory leads should be notified when stock is removed from a warehouse
  location, regardless of who performs the removal.
- Retrospective reporting via group messaging creates inventory-data gaps
  that cannot be reliably closed after the fact.
- Inter-unit transfers require received confirmation to close the transfer
  loop. A transfer is not complete until it is recorded and acknowledged by
  the receiving party.

This is knowledge captured from the supplied BI report. It is not an
independently approved business rule or SOP.

---

## Future AIOS Recommendation

**Recommendation: Consider a digital warehouse sign-out system that records
item removed, responsible user, purpose, and timing for all warehouse stock
movements.**

This is a recommendation only. It is NOT an approved business rule.

Such a system would ensure stock movement is not dependent on a specific
person's presence or on informal retrospective group messages. It would
provide a closed transfer record that the inventory lead can verify without
requiring physical checks.

This recommendation requires business-owner review and approval before it is
treated as an operational requirement or implemented in any system or process.

---

*Issue logged: 2026-07-21 | Logged by: Vishnusri | Root cause confirmed — stock reconciliation and formal transfer recording required*
