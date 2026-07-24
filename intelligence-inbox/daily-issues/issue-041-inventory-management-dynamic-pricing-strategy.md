# Issue 041 — Inventory Management and Dynamic Pricing Strategy

**Issue ID:** ISSUE-041
**Date Logged:** 2026-07-21
**Logged By:** Vishnusri
**Domain:** pricing
**Priority:** TBD
**Status:** Open — Decision Required
**Classification:** Decision Required
**Owner:** Nanthini
**Document Gap:** None

---

## Issue Summary

A strategy has been proposed for managing inventory for fast-selling items by
using price adjustments to control the rate of sales when stock is nearing
depletion before the next scheduled delivery.

The current instruction is to monitor fast-selling items and manually adjust
prices to control remaining inventory until replenishment arrives. However,
the parameters required for consistent execution have not been established.
The specific SKUs, stock-level triggers, direction of adjustment, magnitude of
change, and replenishment-ETA input are currently undefined.

The BI report attributes a version of this strategy to a prior discussion
attributed to "Dana". No existing canonical AIOS asset representing that prior
discussion was found in the repository during discovery. If such a discussion
was captured elsewhere, it should be located and cross-referenced before this
issue is actioned.

---

## Business Problem

- **Fast-selling items may deplete before replenishment arrives.** When
  high-demand stock runs out before the next scheduled delivery, an
  availability gap results that cannot be covered during the replenishment
  lead time.
- **No consistent decision framework exists.** The proposed strategy
  involves price monitoring and adjustment, but the conditions, triggers,
  scope, and approval process for that adjustment have not been defined or
  approved.
- **Manual monitoring is the only current approach.** Without established
  parameters, execution depends on individual judgment rather than a
  repeatable process.

---

## Known Facts — Confirmed

| Field | Detail |
|-------|--------|
| **Date of operational review** | 2026-07-21 |
| **Issue type** | Decision Required — business approval is needed before parameters can be implemented |
| **Confirmed operational fact** | Fast-selling items are depleting faster than the replenishment cycle, creating imminent stock-out risk for those SKUs |
| **Current instruction** | Monitor fast-selling items and manually adjust prices to control remaining inventory until the next delivery arrives |
| **Decision status** | Parameters required for execution (SKU scope, trigger stock level, adjustment direction and magnitude, replenishment ETA input) are not yet defined or approved |

---

## Assumptions — Not Confirmed Facts

The following are derived from the supplied BI report but have not been
confirmed as approved business decisions. They must not be treated as
operational instructions or rules.

1. **Adjustment direction is an assumption.** The supplied source uses terms
   such as "adjust", "control", and "watch the prices". The BI report
   acknowledges that this may mean increasing prices to slow sales velocity.
   This interpretation has NOT been confirmed as a business instruction.

2. **Potential margin improvement is expected impact only.** The BI report
   suggests dynamic pricing may improve margins on remaining units. This is
   a potential expected impact, not a proven financial outcome.

> **Do not treat either assumption as a confirmed approved instruction. Do
> not encode any pricing direction, percentage, or threshold as a rule
> without separate written business-owner approval.**

---

## Root Cause

**Confirmed:**

Fast-selling items are depleting faster than the replenishment cycle, creating
a risk of complete stock-out before the next scheduled delivery.

**Unconfirmed:**

The mechanism (pricing direction, trigger level, SKU scope) by which
management intends to address this has not been confirmed in the supplied
evidence.

---

## Business Impact

- **Inventory depletion risk.** Failure to manage sales velocity for
  fast-moving items may result in complete stock-out before replenishment
  arrives.
- **Potential margin impact.** The BI report suggests that if pricing is used
  as a control mechanism, the remaining units may achieve a higher margin
  during low-stock conditions. This is a potential outcome only, not a
  confirmed financial result.
- **Execution risk.** Without defined parameters, manual price adjustment
  depends on individual timing and judgment, creating inconsistency and risk
  of acting too late to meaningfully control depletion.

Do not infer specific monetary values, exact SKUs, or confirmed percentage
outcomes from the above.

---

## Operational Risks

- **Customer dissatisfaction.** Frequent or significant price changes for
  fast-selling items may create negative customer experience if changes are
  perceived as excessive or inconsistent.
- **Execution lag.** If price adjustment occurs too late in the depletion
  cycle, the intervention may not meaningfully slow sales before stock runs
  out.

---

## Existing Workaround

Manual monitoring of prices and manual adjustment based on expected
next-delivery timing. No automated mechanism or defined decision process is
currently in place.

---

## Fix and Action Required — Decisions Needed

The following are required before this strategy can be consistently executed.
None of the below have been decided or approved at time of logging:

1. **Identify the specific fast-selling SKUs** in scope for this strategy.
   Without a defined SKU list, the strategy cannot be applied consistently.

2. **Determine appropriate stock-level decision parameters.** Establish what
   stock level (volume, days of cover, or other measure) triggers a pricing
   review for a given SKU. This requires explicit business approval — no
   threshold has been approved or should be assumed.

3. **Obtain reliable incoming-delivery ETAs.** The adjustment logic depends
   on knowing when the next replenishment will arrive. ETAs must be
   confirmed before any pricing decision is made.

4. **Obtain business approval for any pricing-control rules before
   implementation.** The direction of adjustment (and whether "adjust" means
   increase, decrease, or another change) must be explicitly approved by a
   business owner before it is treated as an instruction or implemented in
   any system.

5. **Verify the prior "Dana" discussion.** The BI report attributes a version
   of this strategy to a prior discussion with or directed by "Dana". If that
   discussion was captured in any format, it should be located and linked
   here before this issue is closed.

These are open decision requirements, not completed actions. Do not mark any
as resolved without separate confirmation.

---

## Document Gap

**Document Gap Created:** None

The supplied BI report classifies ISSUE-041 as Decision Required. The
unresolved element is a set of business decisions (scope, triggers,
direction, approval) — not a missing document or SOP that is known to exist
but is absent from the repository.

A missing business decision is not automatically a Document Gap. If and when
a pricing-control strategy is approved, the resulting approved parameters
would need to be documented. At that point a gap record may be appropriate.
No gap has been created here because the required decision has not yet been made.

---

## Knowledge Capture

From the supplied BI report:

- Pricing can be used as an inventory-control mechanism for fast-moving SKUs
  where depletion is faster than replenishment. This is a proposal, not an
  approved rule.
- Historical slow movement is not a reliable predictor of future behaviour
  for every SKU; fast-selling behaviour may emerge and require a different
  management approach.
- Manual price monitoring creates dependency on individual timing and judgment.
  A defined decision framework improves consistency.

This is knowledge captured from the supplied BI report. None of it is an
independently approved business rule, pricing formula, or threshold.

---

## Future AIOS Recommendation

**Recommendation: Consider future automated logic linking fast-selling stock
levels, replenishment timing, and pricing.**

This is a future recommendation only. It is NOT an approved business rule.

Such logic would surface fast-moving SKUs where stock is approaching a
defined depletion threshold relative to the next replenishment ETA, and
prompt a pricing review rather than requiring manual monitoring. No
threshold, formula, percentage, or automation has been approved for
implementation.

This recommendation requires explicit business-owner review and approval
before it is treated as an operational requirement or implemented in any
system.

---

## Importer Compatibility Note

**Classification compatibility gap (known):**

The current tools/import-issues.py importer hardcodes
`data-classification="daily-issue"` in every generated dashboard row
(line 717 of build_row_html). The `**Classification:**` field in the source
MD is not a parsed FIELD_KEY and is never read by the importer.

If ISSUE-041 is imported via "+ Add Latest Issues" in its current form:
- The dashboard row will carry `data-classification="daily-issue"`
- This misrepresents the actual classification of "Decision Required"
- The `**Status:** Open — Decision Required` field normalises to
  "investigation" (importer else-branch default) — an acceptable
  approximation but not exact

This gap requires a separate importer enhancement before "Decision Required"
issues can be accurately represented in the dashboard. No importer changes
have been made in this task.

---

*Issue logged: 2026-07-21 | Logged by: Vishnusri | Status: Decision Required — business approval needed before pricing parameters can be defined or implemented*
