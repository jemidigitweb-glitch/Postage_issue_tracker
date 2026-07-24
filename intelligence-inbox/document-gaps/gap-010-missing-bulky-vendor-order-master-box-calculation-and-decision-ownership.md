# Gap 010 — Missing Bulky Vendor Order Master Box Calculation and Decision Ownership Guidance

**Gap ID:** GAP-010
**Date Logged:** 2026-07-23
**Logged By:** Vishnusri
**Status:** Open
**Severity:** High
**Classification:** Document Gap
**Source Issue:** ISSUE-052 — Amazon Bulky Vendor PO Processing Failure
**Escalate To:** Varmen

---

## Gap Summary

The Amazon Vendor Central Guidelines (the operational document governing
LEDSone's vendor PO processing, shipping, and packing standards) are confirmed
to contain two specific documentation gaps that caused an operational processing
failure on 2026-07-23.

**Gap A — Missing Master Box Quantity Calculation Methodology:**

Step 8 of the guidelines (Master Boxes Order — Postage Team / Lakshika) directs
the Postage Team to "order master/outer boxes for the complete shipment". The
guidelines do not contain a methodology, formula, or calculation rule for
determining how many master boxes are required for a given PO quantity or product
type. This is confirmed from review of all three pages of the verified guidelines
document.

For bulky (large) vendor orders, the calculation is not derivable from experience
with standard orders. Without a documented methodology, the step cannot be
executed reliably by any Postage Team member who does not hold informal knowledge
of an undocumented calculation convention.

**Gap B — Ambiguous Pallet/Box Decision Ownership (Step 6 vs Step 9):**

Step 6 (Picking List Generation — Inventory Team) includes the instruction to
"decide boxes or pallet shipping method."

Step 9 (Pallet or Box Send Decide — Packing Team / Sevanthi Akka) includes the
instruction to "decide whether the shipment goes out as pallet or as individual
boxes."

Both steps use equivalent decision language for the pallet/box determination.
The guidelines do not:
- State which step is authoritative for the final shipping method decision
- Define criteria that distinguish a Step 6 preliminary decision from a Step 9
  final decision (if that is the intended distinction)
- Specify what happens if Step 6 and Step 9 arrive at different conclusions

This ambiguity creates accountability uncertainty and creates a risk of the
decision being made inconsistently, delayed, or contested between teams.

---

## Repository Evidence

Both gaps are confirmed from direct review of the verified guidelines document:

| Evidence | Source | Status |
|----------|--------|--------|
| Step 6: "Provide confirmed orders to picking team - decide boxes or pallet shipping method" (Inventory Team) | `Nanthini akka issues/issues 52/2026_07_23_p1.png` and `Amazon_Vendor_Central_Guidelines (3).pdf` page 1 | VERIFIED — directly readable |
| Step 8: "Overall box - order master/outer boxes for the complete shipment" (Postage Team / Lakshika) | `Nanthini akka issues/issues 52/2026_07_23_p1.png` and `Amazon_Vendor_Central_Guidelines (3).pdf` page 1 | VERIFIED — directly readable |
| Step 9: "Decide whether the shipment goes out as pallet or as individual boxes" (Packing Team / Sevanthi Akka) | `Nanthini akka issues/issues 52/2026_07_23_p1.png` and `Amazon_Vendor_Central_Guidelines (3).pdf` page 1 | VERIFIED — directly readable |
| Absence of master-box quantity calculation method across all 3 guideline pages | `Amazon_Vendor_Central_Guidelines (3).pdf` pages 1-3 | VERIFIED — confirmed by absence on full review |
| Individual box dimension standards present (Max 60×45×45 cm, ≤13.5 kg standard / ≤30 kg heavy) | `Amazon_Vendor_Central_Guidelines (3).pdf` page 2 | VERIFIED — directly readable |
| Amazon non-compliance warning: "Non-compliance with these standards may result in shipment rejection by Amazon" | `Amazon_Vendor_Central_Guidelines (3).pdf` page 3 | VERIFIED — directly readable |

Note: The guidelines DO contain individual box dimension standards (page 2) and
pallet dimension/wrap standards (page 2). The gap is not the absence of box
standards — it is the absence of a methodology for calculating the NUMBER of
master boxes required for a given vendor PO.

---

## Missing Documentation / Corrective Requirement

### Gap A — Master Box Quantity Calculation Methodology

The Amazon Vendor Central Guidelines must be supplemented with a documented
method for calculating how many master/outer boxes are required for a vendor PO,
specifically including guidance for:

1. **Standard orders:** How to calculate master box quantities for normal-sized
   product units within the confirmed individual box standards (max 60×45×45 cm,
   ≤13.5 kg standard / ≤30 kg heavy).

2. **Bulky orders:** How to calculate master box quantities for bulky or large
   product units that may require different box dimensions or pallet shipping.
   The threshold for "bulky" must be defined.

**What exists in the guidelines:** Individual box dimension and weight standards.
**What is absent:** A methodology for calculating how many master boxes are needed
for a PO of a given quantity and product type.

The methodology, once confirmed by the appropriate authority (Lakshika / Postage
Team Lead / Varmen), must be incorporated into or alongside the guidelines so
that any Postage Team member can execute Step 8 without relying on informal
knowledge.

### Gap B — Pallet/Box Decision Ownership Clarification

The Amazon Vendor Central Guidelines must be updated to clarify:

1. Whether the "decide boxes or pallet" instruction in Step 6 and the equivalent
   decision in Step 9 represent the same decision, a sequential two-stage decision,
   or distinct decisions at different stages of the workflow.

2. If they are distinct: what criteria distinguish the Step 6 preliminary decision
   from the Step 9 final decision, and how any change between the two decisions
   should be handled.

3. Which team is the final authority on the pallet/box shipping method decision
   when Step 6 (Inventory Team) and Step 9 (Packing Team / Sevanthi Akka) do not
   agree.

**Currently:** Both steps claim the pallet/box decision without differentiation.
**Required:** One step (or both steps with clearly distinguished roles and criteria)
should be the confirmed authority, with those criteria stated explicitly in the
guidelines.

---

## Contributing Cause Analysis

| Missing requirement | How absence contributes |
|--------------------|------------------------|
| Master-box quantity calculation methodology | The Postage Team member executing Step 8 has no documented basis for calculating how many boxes to order — especially for bulky products whose quantities are not derivable from standard-order experience |
| Bulky-order threshold definition | Without a defined threshold for what constitutes a "bulky" order, staff cannot determine when a different calculation approach is required |
| Step 6 vs Step 9 decision ownership | When both steps claim the same decision without criteria, either or both teams may make the decision, creating inconsistency, delay, or conflict |
| Calculation methodology documented (not informal only) | Informal knowledge held by experienced staff is not scalable and is lost on turnover — it cannot be used to train new Postage Team members reliably |

---

## Business Impact

- **Operational failure for bulky vendor POs.** Any Postage Team member without
  informal knowledge of a box calculation convention will encounter the same
  processing failure on future bulky vendor orders.
- **Emergency workaround required.** The confirmed workaround (sourcing boxes from
  Unit 4) is unplanned and uncontrolled — it may not be available or appropriate
  for future events.
- **Amazon rejection risk.** Incorrect master box quantities or incorrect
  pallet/box selection may cause Amazon to reject the shipment at the fulfilment
  centre. The verified guidelines explicitly warn: "Non-compliance with these
  standards may result in shipment rejection by Amazon."
- **Inconsistent pallet/box decisions.** Ambiguous Step 6/Step 9 ownership may
  result in different teams making the shipping method decision inconsistently
  across orders.

---

## Corrective Action Required

1. **Confirm and document a master-box quantity calculation methodology** for
   Amazon Vendor POs, including a specific definition of when an order qualifies
   as "bulky" and how the calculation differs for bulky vs standard orders.
   Approver: Lakshika / Postage Team Lead / Varmen.

2. **Clarify Step 6 vs Step 9 pallet/box decision ownership** and update the
   Amazon Vendor Central Guidelines to reflect this clarification. Both teams
   (Inventory Team and Packing Team / Sevanthi Akka) must be clear on their
   respective roles.

3. **Update the Amazon Vendor Central Guidelines** to incorporate the approved
   calculation methodology (Gap A) and the clarified decision ownership (Gap B).
   This closes GAP-010.

4. **Confirm whether Unit 4 box sourcing is either (a) an approved interim
   procedure** (with stock management coordination) or **(b) not a repeatable
   approach** so that future processing failures are not resolved through the
   same unplanned workaround.

**None of these corrections has been executed in this task. Execution requires
appropriate business approval and guideline review authority (Lakshika / Varmen).**

---

## AIOS Recommendation

Once the calculation methodology and decision ownership are confirmed and
documented, the Amazon Vendor Central Guidelines should contain:

- A Step 8 supplementary instruction or reference table providing a clear master-box
  quantity calculation method (or reference to an approved calculation table
  alongside the guidelines);
- A clarifying note distinguishing when Step 6 sets the preliminary shipping method
  and when Step 9 finalises or confirms it, with criteria stated explicitly.

These additions would prevent recurrence of the processing failure for any Postage
Team member executing Step 8 on future bulky vendor orders.

---

## Governance

This gap was identified through ISSUE-052 (Amazon Bulky Vendor PO Processing
Failure), logged 2026-07-23.

The gap is categorised as **confirmed** because:

1. Step 8 is directly readable in the verified guidelines and directs ordering of
   master boxes without a calculation method — the absence is confirmed by reviewing
   all three pages of the document.
2. Steps 6 and 9 both contain equivalent "decide pallet or boxes" language — the
   overlap is directly readable and unambiguous in the verified guidelines.
3. Both gaps are confirmed from the verified guidelines document (image 2026_07_23_p1.png
   and PDF pages 1-3), not inferred from audio or unverified reporting.

**Escalation path:** Varmen → Lakshika (Postage Team Lead / guidelines owner)
→ approved calculation methodology and decision ownership clarification →
updated guidelines → Decision Log entry → gap closed.

---

## Linked Records

- **Source Issue:** `intelligence-inbox/daily-issues/issue-052-amazon-bulky-vendor-po-processing-failure.md`

---

*Gap logged: 2026-07-23 | Logged by: Vishnusri | Both gaps confirmed from direct review of verified Amazon Vendor Central Guidelines — master-box calculation methodology absent from all 3 pages; Step 6/Step 9 pallet/box decision overlap confirmed from page 1 | Awaiting Varmen review*
