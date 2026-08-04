# Issue 071 — Delayed Profitability Feedback Loop Causing Reactive Mispricing and Ranking Loss

**Issue ID:** ISSUE-071
**Date Logged:** 2026-07-29
**Logged By:** Sathis
**Domain:** pricing
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Decision Required
**Owner:** Sathis
**SKU:** —
**Document Gap:** —

---

## Issue Summary

Finance's profitability review is delivered roughly 6 months after a price is set, with no live or near-live feedback loop. By the time a price is found unprofitable, the market has moved and competitors have repriced, forcing a reactive price correction that pushes listings out of competitive search ranking.

---

## Current Operational Process

Prices are set against a ceiling/floor at one point in time. Finance's review of the resulting sales — including any "negative net sales" flag — is delivered approximately 6 months later, as a separate, disconnected event from the original pricing decision.

---

## Business Problem

Once Finance's delayed review flags a price as unprofitable, Sales must revise the price upward. Because this happens months after the original pricing decision, the revised price is often above current competitor prices on Amazon and eBay, pushing listings down to page 3–4 in search rankings on both platforms — effectively removing them from buyer visibility regardless of product quality or ad spend. During this affected period, ACOS ran at approximately 24%, still within Amazon's own "acceptable" band, yet the sales were still flagged as generating negative net sales.

---

## Root Cause

**Status: Not Yet Confirmed**

### Confirmed Facts

There is no live or near-live feedback loop between pricing decisions and Finance's profitability assessment; the review cadence is roughly 6-monthly rather than continuous or near-real-time. By the time a price is confirmed unprofitable, competitors have already repriced and the resulting correction damages search ranking and visibility.

### Assumptions

Not Available in the Evidence.

---

## Business Impact

Sharp sales volume decline each time a reactive price correction pushes listings off the first two search result pages on Amazon and eBay; the damage to ranking and visibility compounds over the months before the next Finance review, and recovery after a correction takes further months.

---

## Operational Risks

Continued repeat cycles of delayed detection, reactive correction, and ranking loss every pricing period until review cadence is shortened.

---

## Existing Workaround

Not Available in the Evidence.

---

## Recommended Next Actions

Move from a static "fixed price" model to a live-updatable cost floor and margin formula (unit cost, fulfilment cost, average return rate, minimum acceptable margin), so Sales can adjust pricing in real time as competitors move while staying within an agreed profitability boundary. Establish a monthly (not 6-monthly) reconciliation cadence between the prices Sales has set and Finance's net sales tracking, so any miscalculation, formula error, or drift is caught within weeks — before it compounds into a visible sales decline.

---

## AIOS Classification

Decision Required.

Changing the review cadence and moving to a live cost-floor model requires a joint Finance/Sales process decision.

---

## Knowledge Capture

A ~6-month gap between pricing decisions and Finance's profitability review is the specific mechanism by which mispricing turns into a visible, compounding sales decline: the correction always arrives after competitors have already moved.

---

## Duplicate Check

New Issue, split out from a combined escalation email from Sathis (on behalf of the Amazon/eBay/Shopify/PH/Wayfair Sales teams). Related to issue-070 (no documented net sales formula) — that issue covers the missing calculation standard; this issue covers the separate problem of review timing/cadence. See also issue-072 through issue-075 (logged the same day from the same email) for the related accountability, overdue-request, innovation, and refund/return facets of the same escalation.

---

## Future AIOS Recommendation

Once a monthly reconciliation cadence is in place, track the time-to-correction for any future mispricing flag as a leading indicator, rather than waiting for a full sales-decline signal to appear.

---

## Executive Summary

Finance's profitability review currently arrives roughly 6 months after pricing decisions are made, with no interim feedback. By the time a price is corrected, competitors have already repriced and the correction itself pushes listings out of competitive visibility. A live-updatable cost floor/margin formula and a monthly reconciliation cadence are requested to close this gap.

---

## Evidence Source

Source: Email escalation from Sathis, on behalf of the Amazon, eBay, Shopify, PH, and Wayfair Sales teams, addressed to management regarding the pricing / net-sales calculation process (second, repeat escalation of a request first raised approximately 3 months prior). This issue covers the "delayed feedback loop / reconciliation cadence" facet of that email.
Received date: 2026-07-29
