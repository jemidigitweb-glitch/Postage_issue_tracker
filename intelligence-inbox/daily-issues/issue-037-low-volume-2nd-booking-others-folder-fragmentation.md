# Issue 037 — Low-Volume 2nd Booking Others Sub-folder Fragmentation

**Issue ID:** ISSUE-037
**Date Logged:** 2026-07-20
**Logged By:** Vishnusri
**Domain:** postage
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**Document Gap:** None

---

## Issue Summary

On 2026-07-20, a management directive was issued stating that when the
"Others" category within a 2nd Booking contains only a small number of orders,
those orders should be consolidated into a single location rather than separated
into individual sub-folders.

The current folder structure within:

`Dropbox > Unit - 03 Postage Folder > 2026 > July > 20.07.2026 > 2nd Booking > Others`

contains multiple sub-folders — Cable, Others (nested), Replacement, and
Transformer — alongside an "Order Management - LEDSone" shortcut file.

The directive indicates that where order volume is low, this level of
sub-folder separation is not required and should be avoided.

---

## Business Problem

- **Unnecessary fragmentation of low-volume entries.** When only a small
  number of orders fall into the "Others" category, separating them into
  component-type sub-folders (Cable, Transformer, Replacement) increases
  the navigation burden without meaningful benefit.
- **Administrative overhead.** Each sub-folder requires staff to locate,
  open, and process a subset of files rather than consulting a single
  consolidated list. For low-volume days this overhead is disproportionate.
- **Process inconsistency risk.** If some 2nd Booking sessions consolidate
  Others orders and others fragment them, the inconsistency makes the folder
  structure unpredictable and harder to audit.

---

## Known Facts

| Field | Detail |
|-------|--------|
| **Date of operational event** | 2026-07-20 |
| **Affected Dropbox path** | `Dropbox/Unit-03 Postage Folder/2026/July/20.07.2026/2nd Booking/Others/` |
| **Sub-folders observed** | Cable, Others (nested), Replacement, Transformer |
| **Other file observed** | "Order Management — LEDSone" shortcut in the root of the Others folder |
| **Management directive** | Confirmed: low-volume Others orders must be consolidated rather than separated into sub-folders |
| **Classification** | Daily Issue — operational adjustment for a specific workday |

---

## Assumptions — Not Confirmed Facts

The following are inferred from the operational context but have not been
independently confirmed:

- That the sub-folders (Cable, Replacement, Transformer) were created before
  the consolidation directive was issued on this date, rather than after.
- That each of these sub-folders contains a small number of order entries
  (exact counts not verified — investigation required).
- That the "Order Management — LEDSone" shortcut file was placed in the
  Others root as an ad-hoc centralisation measure in response to the directive.
- That this fragmentation pattern has not recurred on other dates (this
  appears to be a single-day event; no evidence of recurrence has been
  supplied or found in the repository).

> **Do not treat these assumptions as confirmed facts in any downstream
> document, SOP, or operational rule.**

---

## Numeric Threshold — Not Approved

The supplied Business Intelligence report references fewer than five (< 5)
orders as an example threshold for triggering consolidation.

**This threshold has NOT been approved by a business owner or validator.**

It must NOT be encoded as:
- a confirmed business rule
- a validation rule
- a UI rule or automation trigger
- a booking operations rule
- company truth

Any numeric consolidation threshold requires separate business-owner approval
before it can be adopted as an operational standard.

---

## Document Gap

**Document Gap Created:** None

Repository inspection found no existing SOP or documentation that defines
when sub-folders should or should not be created within the 2nd Booking >
Others directory. However, the BI source explicitly classifies this event as
a Daily Issue — a routine, single-day operational adjustment — and not as
evidence of a fundamental documentation gap.

The Future AIOS Recommendation (to incorporate a Low Volume Consolidation
rule into a digital filing SOP) requires business-owner validation of both
the threshold and the process before a gap can be formally created and
documented.

No Document Gap has been created at this stage.

---

## Fix and Action Required

1. **Verify actual order counts.** Check the number of entries in the Cable,
   Replacement, and Transformer sub-folders for the 20.07.2026 session to
   confirm whether the volume is genuinely low.

2. **Consolidate if volume is low.** If the volume confirms that sub-folder
   separation is not warranted, move all entries into a single consolidated
   location within the Others directory as per the management directive.

3. **Confirm with management.** Confirm with the relevant manager whether
   the consolidation action has been completed satisfactorily for the
   2026-07-20 date.

4. **Threshold validation (pending).** If a recurring consolidation guideline
   is needed, raise the numeric threshold (e.g. the < 5 example from the BI
   report) with the business owner for approval before it is written into any
   SOP or AIOS operating rule.

5. **Do not pre-empt SOP creation.** Do not write a permanent digital filing
   rule or Document Gap based solely on this single-day event until the
   threshold and process have been validated and approved.

---

## Evidence

No evidence files (images, audio, screenshots) were supplied with this issue.

If screenshots of the folder structure or the management directive are
captured, they should be saved to:

`submission-html/Nanthini akka issues/issues 37/`

and the Evidence section of this file updated accordingly.

---

## Classification Rationale

This issue is classified as a **Daily Issue** consistent with the supplied BI
report. It represents an operational directive applicable to a specific
workday (2026-07-20) rather than a fundamental gap in permanent documentation
or training.

The core operational knowledge captured is:

> For 2nd Booking "Others" entries, when order volume is low, orders must
> be consolidated into a single location rather than separated into
> component-type sub-folders. The precise threshold for "low volume" requires
> business-owner approval before it becomes an operational standard.
