# Gap 004 – Return Address Selection and Verification Protocol

**Date Logged:** 30-06-2026
**Logged By:** Vishnusri
**Status:** Open
**Classification:** Document Gap

---

## Gap Summary

There is currently no documented business standard defining which return address should be used when creating postage labels across LEDSone's carrier bookings. The absence of this standard means that different return addresses are being used on labels generated through the postage booking workflow, and staff have no authoritative reference to consult when selecting or verifying a return address. The correct return address has not been formally documented, confirmed, or communicated as an operational requirement.

---

## Current Situation

Multiple return addresses are currently in use across postage labels generated through the booking workflow. Staff rely on manual checking before printing labels to verify that the return address appears correct, but this process depends on individual knowledge and attention rather than a documented standard.

The correct selection process — which return address to use, under what circumstances, and for which carriers — has not been formally documented anywhere within the AIOS or in any operational guidance available to postage staff. There is no reference document staff can consult to confirm the correct address, no system-level enforcement of a standard address, and no documented procedure for verifying label content before printing.

---

## Missing Documentation

The AIOS currently lacks documented guidance for the following:

| Missing Document | Description |
|-----------------|-------------|
| **Standard return address** | No document defines the single approved return address that should appear on all standard postage labels |
| **Approved alternative return addresses** | No document defines whether any alternative return addresses are permitted for specific carriers, destinations, or order types, and if so, under what conditions |
| **Return address selection rules** | No documented rules exist to guide staff in selecting the correct return address during the booking process |
| **Return address verification procedure** | No documented procedure exists for staff to verify that the return address on a label is correct before printing is confirmed |
| **Ownership of return address maintenance** | No document defines who is responsible for maintaining correct return address configuration in the booking system and ensuring it remains accurate |
| **Booking quality checks** | No documented checklist or quality control step exists covering the verification of label content — including return address — before labels are printed and applied |

---

## Business Impact

The absence of return address documentation results in the following consequences:

| Impact | Description |
|--------|-------------|
| **Incorrect return destinations** | Without a documented standard, labels continue to be generated with different return addresses, directing returned parcels to different and potentially unmonitored locations |
| **Lost returned parcels** | Returned parcels directed to incorrect or unmonitored addresses risk not being received, processed, or reported, effectively representing lost stock |
| **Reduced operational visibility** | The absence of a consistent return address prevents the business from maintaining a reliable, centralised view of returned parcel volumes, reasons, and values |
| **Financial loss** | Unrecovered returned stock and the inability to quantify return losses accurately represent compounding financial risk |
| **Inconsistent booking practices** | Without documented rules, different staff members will continue to apply their own judgement when selecting return addresses, perpetuating the inconsistency |

---

## Required Documentation

The following documentation is recommended for creation once the booking system audit and return address confirmation described in Issue 006 have been completed:

| Document | Purpose |
|----------|---------|
| **Standard return address policy** | Define the single approved return address for all standard outbound postage labels, confirmed by Varmen or Laksika |
| **Return address selection rules** | Define the rules for selecting a return address during the booking process, including any carrier-specific or order-type-specific variations that are approved |
| **Carrier-specific exceptions** | Document any cases where a different return address is required for a specific carrier or service type, with the approved address for each exception clearly stated |
| **Booking verification checklist** | Define the steps staff must complete to verify label content — including return address — before printing is confirmed |
| **Return address ownership and maintenance responsibilities** | Define which role is responsible for maintaining the return address configuration in the booking system and for reviewing it periodically |
| **Periodic validation process** — | Define a recurring process for checking that the return address configured in the booking system continues to match the approved standard |

> **Note:** Documentation should not be created until the booking system audit has been completed and the approved return address has been confirmed by the relevant authority. Creating documentation before the correct address is confirmed risks embedding an incorrect standard.

---

## Recommended AIOS Assets

Once the audit and address confirmation process from Issue 006 are complete, the following AIOS assets are recommended for future creation:

| Asset | Type | Purpose |
|-------|------|---------|
| **Return Address Master Register** | Reference document | A maintained record of all approved return addresses, the carriers and order types they apply to, and the date each was last verified |
| **Postage Booking Verification Checklist** | Skill document | A step-by-step checklist for staff to complete before confirming and printing any postage label, covering return address, carrier, service type, and recipient address |
| **Return Address Validation Guide** | Reference document | A guide for supervisors to use when auditing label outputs to confirm that the correct return address is being applied consistently |
| **Booking Quality Control Checklist** | Skill document | A broader quality control checklist covering all postage booking steps where errors have been identified, including return address verification as one of the required checks |

---

## Evidence

This gap was identified through the following evidence:

- **Audio explanation from Postage Team** — verbal explanation describing the return address variation and the current reliance on manual checking
- **Label screenshots** — screenshots of postage labels showing different return addresses across label generations, confirming the inconsistency
- **Issue 006** — the related daily issue record documenting the operational problem that revealed this gap

---

## Related Issue

| Document | Relationship |
|----------|-------------|
| [issue-006-inconsistent-return-addresses-on-postage-labels.md](../daily-issues/issue-006-inconsistent-return-addresses-on-postage-labels.md) | Source issue — this gap was identified as a direct result of the operational problem described in Issue 006 |

---

## Gap Status

| Field | Value |
|-------|-------|
| **Status** | Open |
| **Reason** | Business rules and documentation for return address selection and verification have not yet been created |
| **Dependency** | The booking system audit described in Issue 006 must be completed and the approved return address confirmed before documentation can be finalised |
| **Next step** | Complete the booking system audit → confirm approved return address with Varmen or Laksika → create Standard Return Address Policy as the first required document |
| **Owner** | To be assigned |

---

*Gap logged: 30-06-2026 | Logged by: Vishnusri | Pending booking system audit and address confirmation before documentation work begins*
