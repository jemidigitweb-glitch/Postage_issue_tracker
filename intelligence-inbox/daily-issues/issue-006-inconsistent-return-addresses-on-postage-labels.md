# Issue 006 – Inconsistent Return Addresses on Postage Labels

**Date Logged:** 30-06-2026
**Logged By:** Vishnusri
**Status:** Open — Under Investigation
**Classification:** Daily Issue

---

## Issue Summary

Postage labels are being generated with different return addresses instead of one standardised address applied consistently across all bookings. Multiple return addresses have been identified on labels produced through the postage booking workflow, meaning that returned parcels may be directed to different locations depending on which address was used at the time of booking.

This inconsistency prevents accurate tracking of returned parcels, makes it difficult to investigate failed deliveries, and increases the operational risk that returned goods arrive at an unmonitored or incorrect location.

---

## Business Problem

Inconsistent return addresses on postage labels make it difficult to monitor returned parcels effectively, investigate failed delivery events, and accurately measure the financial losses associated with returns. When a parcel is returned, the destination depends on the return address printed on the label at the time of dispatch. If different labels carry different return addresses, returned parcels will arrive at different locations — some of which may not be monitored, staffed, or prepared to receive them.

This creates a situation where the business cannot reliably know where its returned goods are going, cannot confirm receipt of returns, and cannot accurately track the volume or value of returned stock. The absence of a single standardised return address is both an operational control failure and a financial risk.

---

## Current Operational Process

The current postage label creation workflow operates as follows:

1. **Staff create postage labels** — warehouse and postage staff initiate label creation through the postage booking system for outbound orders
2. **Labels are generated for different carriers** — labels are produced for multiple carriers including Royal Mail, EVRi, and DPD depending on the service selected for each order
3. **Return address is selected or populated** — a return address is either selected from a configured option within the booking system or populated manually at the point of label creation
4. **Labels are printed** — completed labels are printed and applied to outbound parcels
5. **Manual verification relied upon** — staff are currently expected to manually check that the return address shown on the label is correct before printing is confirmed

No automated validation or system-enforced standard for return address selection currently exists. The accuracy of the return address on any given label depends entirely on the individual staff member checking it at the time of booking.

---

## Known Facts

| Fact | Detail |
|------|--------|
| Multiple return addresses | Multiple different return addresses have been identified across labels produced through the current booking workflow |
| Labels printed with different addresses | Labels have been confirmed as printed using different return address values rather than a single standardised address |
| Manual verification | Staff currently rely on manually checking the return address before printing — no automated control is in place |
| Root cause | Root cause has not yet been confirmed — it is not yet known whether the inconsistency originates from system configuration, user selection, or a combination of both |

---

## Business Impact

| Area | Impact |
|------|--------|
| **Warehouse operations** | Returned parcels arriving at different addresses create operational fragmentation — different locations must be monitored and managed rather than a single centralised return point |
| **Returned parcel tracking** | Without a consistent return address, it is not possible to reliably track the status, volume, or location of returned parcels at any given point |
| **Customer service** | If returned parcels cannot be located or are delayed in processing due to incorrect routing, customer refunds or replacements may be delayed |
| **Financial loss** | Returned parcels that arrive at unmonitored or incorrect locations risk being lost entirely, representing a direct financial loss on the value of the goods |
| **Inventory control** | Stock returned to an incorrect or unmonitored address cannot be accurately reflected in inventory records, leading to inventory discrepancies |

---

## Operational Risks

| Risk | Description |
|------|-------------|
| **Returned parcels arriving at incorrect locations** | A parcel carrying an incorrect return address will physically travel to a location that may not be equipped to receive, process, or report it |
| **Inventory shrinkage** | Goods returned to unmonitored addresses that are not recovered will effectively disappear from inventory without accounting for the loss |
| **Financial leakage** | Lost or untracked returned goods represent unrecovered stock value, compounding the cost of the original failed delivery |
| **Reduced visibility of returned goods** | Without consistent return routing, the business cannot produce an accurate picture of return volumes, return reasons, or return value at any point in time |
| **Incorrect reporting** | Return statistics and financial reconciliation reports will be unreliable if returned parcels are being routed to multiple addresses and not all returns are captured in a single location |

---

## Existing Workaround

Staff manually verify the return address shown on the label before confirming and printing. This requires each individual involved in label creation to check the return address field and confirm it matches the correct address before proceeding.

This workaround depends entirely on individual attention and consistent application by each staff member at each booking. It is not a reliable long-term control because it has no enforcement mechanism — a label with an incorrect return address can be printed if the verification step is skipped or if the correct address is not known. The workaround reduces risk on a case-by-case basis but does not eliminate the possibility of incorrect labels being produced.

---

## Recommended Next Actions

The following actions are recommended before documentation or system changes are made:

1. **Audit the postage booking system** — review the booking system configuration to identify all return addresses currently stored, configured, or accessible to users during the label creation process
2. **Review all configured return addresses** — produce a complete list of all return addresses that have appeared on labels in the recent period to understand the full extent of the inconsistency
3. **Confirm the approved business return address** — obtain confirmation from the appropriate authority (Varmen or Laksika) of the single approved return address that should be used across all standard postage labels
4. **Validate the booking workflow** — walk through the label creation process end to end to identify exactly where return address selection occurs and whether it is configurable at system level
5. **Monitor future label generation** — while the audit and confirmation process is underway, implement a temporary monitoring step in which a supervisor reviews the return address on all labels before printing

**See also:** [gap-004-return-address-selection-and-verification-protocol.md](../document-gaps/gap-004-return-address-selection-and-verification-protocol.md) — a related Document Gap has been raised to capture the absence of a documented return address standard and verification protocol.

---

## AIOS Classification

| Field | Value |
|-------|-------|
| **Classification** | Daily Issue |
| **Reason** | Recurring operational issue affecting postage booking accuracy and return parcel management |

This issue is classified as a Daily Issue because it is an active problem that is affecting label creation across daily postage operations. A related Document Gap (Gap 004) has been raised separately to capture the absence of a documented return address standard and booking verification protocol.

---

## Evidence

Supporting evidence for this issue includes:

- **Postage label screenshots** — screenshots of postage labels showing different return addresses used across label generations, confirming the inconsistency
- **Audio explanation from Postage Team** — verbal explanation provided by the Postage Team describing the return address variation, the manual verification currently relied upon, and the history of the concern

Evidence is held by the Postage Team and is available for review if the booking system audit is initiated.

---

## Related AIOS Documents

| Document | Relationship |
|----------|-------------|
| [issue-001-return-parcel-accumulation.md](issue-001-return-parcel-accumulation.md) | Related — also concerns returned parcels, but covers physical accumulation in the warehouse rather than return address accuracy |
| [issue-002-website-order-collected-status.md](issue-002-website-order-collected-status.md) | Related — also an open daily issue, but concerns order status visibility rather than postage booking configuration |
| [issue-003-high-return-rate-crystal-lighting-fixtures.md](issue-003-high-return-rate-crystal-lighting-fixtures.md) | Related — also concerns product returns, but covers return volume for specific models rather than label address accuracy |
| [issue-004-labor-cost-and-assembly-pricing-discrepancy.md](issue-004-labor-cost-and-assembly-pricing-discrepancy.md) | Related — also a postage operational issue, but concerns fulfilment labour rather than label configuration |
| [issue-005-inaccurate-courier-parcel-counting-and-sorting.md](issue-005-inaccurate-courier-parcel-counting-and-sorting.md) | Related — also concerns dispatch accuracy, but covers parcel counting and courier segregation rather than label content |

This is a separate issue focused specifically on return address accuracy during postage booking. It is not a duplicate of any existing issue.

---

*Issue logged: 30-06-2026 | Logged by: Vishnusri | Booking system audit recommended as first action*
