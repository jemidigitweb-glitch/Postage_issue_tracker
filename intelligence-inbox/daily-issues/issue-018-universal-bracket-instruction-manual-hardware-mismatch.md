# Issue 018 – Universal Light Fixture Mounting Bracket: Instruction Manual Does Not Match Physical Hardware

**Issue ID:** ISSUE-018
**Date Logged:** 2026-07-09
**Logged By:** Vishnusri
**Domain:** listing
**Priority:** TBD
**Status:** Open — Under Investigation
**Classification:** Daily Issue
**Owner:** Nanthini
**SKU:** UNKNOWN — TO BE CONFIRMED
**Document Gap:** gap-006-assembly-instruction-technical-sign-off-and-product-verification.md

---

## Issue Summary

A universal light fixture mounting bracket is accompanied by an instruction manual that
reportedly does not match the physical hardware supplied with the product. The manual is
reported to include elements — referred to as "those five" — that are unnecessary or not
applicable to the actual hardware configuration. A directive has reportedly been issued to
stop including or distributing the incorrect manual with the product.

The SKU and exact product identifier have not been confirmed from repository evidence and
must be established before this issue can be fully classified or resolved.

---

## Confirmed Visual Observations

The following were directly observed in the photographic evidence:

| Observation | Evidence Source | Status |
|-------------|----------------|--------|
| One slim slotted metal mounting bracket is present | `Phase2-inputs/issues 18/2026_07_09_p1.png` | CONFIRMED — direct visual observation |
| Five elongated oval slots are visible along the bracket body | `Phase2-inputs/issues 18/2026_07_09_p1.png` | CONFIRMED — direct visual observation |
| Two countersunk gold screws are present at each end of the bracket | `Phase2-inputs/issues 18/2026_07_09_p1.png` | CONFIRMED — direct visual observation |
| One black knurled thumb nut is present at each end of the bracket | `Phase2-inputs/issues 18/2026_07_09_p1.png` | CONFIRMED — direct visual observation |
| Bracket finish is silver/chrome | `Phase2-inputs/issues 18/2026_07_09_p1.png` | CONFIRMED — direct visual observation |
| No text, labels, SKU, or manual pages are visible in the photograph | `Phase2-inputs/issues 18/2026_07_09_p1.png` | CONFIRMED — absence confirmed by inspection |

The photograph does not show an instruction manual, product packaging, or any written
annotation. All claims about manual content, "those five" elements, and the stop-distribution
directive derive from the NotebookLM Business Intelligence Report and associated audio
recordings, not from the image.

---

## Reported Issue

The following is drawn from the NotebookLM Business Intelligence Report. These claims have
not been independently confirmed from the photographic evidence or any written repository
record. They are recorded here as reported and must not be treated as confirmed operational
facts until independently verified.

| Reported Claim | Source | Verification Status |
|----------------|--------|---------------------|
| The instruction manual for this bracket does not match the physical hardware | NotebookLM BI Report | REPORTED — not confirmed from image |
| The manual includes elements referred to as "those five" that are unnecessary or inapplicable | NotebookLM BI Report | REPORTED — "those five" is ambiguous and unconfirmed |
| A directive has been issued to stop including or distributing the incorrect manual | NotebookLM BI Report | REPORTED — no written record confirmed in repository |
| The product is classified as a universal light fixture | NotebookLM BI Report | REPORTED — not confirmed from image |
| The product itself is functional despite the manual mismatch | NotebookLM BI Report | REPORTED — not independently verified |

Audio recordings are present in `submission-html/Phase2-inputs/issues 18/` but were not
independently transcribed during discovery. They are noted as additional evidence available
for human review.

---

## Unproven Assumptions

The following must not be recorded as confirmed facts or operational rules without further
investigation and reviewer confirmation:

- That the SKU of the affected bracket product is known (SKU is unconfirmed)
- That "those five" refers to a specific identifiable set of hardware components or manual steps
- That the stop-distribution directive has been formally communicated to all suppliers
- That all relevant suppliers have received and acted on the stop-distribution directive
- That no customers have received the incorrect manual since the directive was issued
- That customer complaints or returns have already occurred as a result of this manual mismatch
- That customer complaints or returns have NOT occurred (absence not confirmed)
- That the root cause is definitively a generic, reused, or outdated manual shared across product types
- That the "universal" classification means the bracket ships with multiple different products

---

## Operational Risk

The following risks arise from the confirmed and reported observations, pending investigation:

| Risk | Description |
|------|-------------|
| Customer confusion during installation | If a manual includes hardware steps or elements that do not correspond to the physical components supplied, customers attempting to follow the manual will encounter mismatches, potentially leading to incorrect installation or a perception of missing hardware. |
| Return and complaint risk | Customers unable to reconcile the manual with the physical hardware may contact the business or initiate a return, generating avoidable operational cost. |
| Ongoing incorrect manual distribution | If the stop-distribution directive has not reached all suppliers or fulfilment points, the incorrect manual may still be included with new stock, extending the scope of the problem. |
| Absence of a confirmed correct manual | It is not confirmed that a correct, updated manual has been produced and is ready to replace the incorrect one. Until a verified replacement is confirmed, there is no safe alternative to distribute. |
| Generic manual risk | If the bracket is a universal product whose manual is shared across multiple SKUs or product types, the mismatch may affect more than one product listing. |

These are risks arising from confirmed and reported observations. They are NOT confirmed as
having caused fulfilment failures, returns, or customer complaints.

---

## Existing Workaround / Directive

**REPORTED — not independently evidenced.**

A directive to stop including or distributing the incorrect manual has reportedly been issued.
This is recorded here as reported information, not as a confirmed and documented operational
procedure. No written record of this directive has been identified in the repository.

If this directive is confirmed, its scope, recipient list, effective date, and enforcement
mechanism are all currently unknown.

---

## Fix and Action Required

DECISION REQUIRED before action is confirmed. The following steps are recommended pending
reviewer approval. They are not approved operational rules.

1. **Confirm the SKU** — identify the exact product identifier for the affected mounting
   bracket before any further action is taken. This is required before this issue can be
   resolved or linked to a product listing.
2. **Identify and document "those five"** — establish precisely what elements in the manual
   are described as unnecessary or inapplicable, and confirm this against the physical hardware.
3. **Confirm the stop-distribution directive** — verify that a formal directive exists, identify
   who issued it, when it was issued, and which suppliers or fulfilment points were notified.
4. **Verify supplier compliance** — confirm whether all relevant suppliers have received and
   are acting on the directive.
5. **Source the correct manual** — confirm whether a correct, product-accurate instruction
   manual exists, and if so, ensure it is ready for distribution before the incorrect manual
   is fully withdrawn.
6. **Review linked gap** — the structural control gap identified in GAP-006 (no pre-print
   verification or sign-off for assembly instructions) applies to this issue. No new Document
   Gap is required. Review the status of GAP-006 controls with the relevant team lead.

---

## Document Gap

**Linked to existing:** gap-006-assembly-instruction-technical-sign-off-and-product-verification.md

A new Document Gap has **NOT been created** for this issue.

GAP-006 already records the absence of a documented technical sign-off and product-to-manual
verification process before assembly instructions are approved for supplier distribution. That
gap explicitly notes its applicability to *any product with a changed configuration or a
reused template*. The reported failure mode for ISSUE-018 — a manual that does not match the
physical hardware — falls within the scope of GAP-006.

Creating a new gap for ISSUE-018 would duplicate the same structural absence already
documented in GAP-006. The correct action is to treat ISSUE-018 as a second incident
evidencing the same systemic gap.

**Potential gap extension (to be reviewed):** If the reported stop-distribution directive
reveals an absent process for recalling or updating manuals already in circulation with
suppliers, this may represent a control not currently covered by GAP-006. This determination
requires the reported directive to be confirmed and its scope understood first.

---

## Evidence

### Evidence Mapping — ISSUE-018 (Photographic)

| File | Repository Path | Content | Confidence |
|------|----------------|---------|-----------|
| `2026_07_09_p1.png` | `submission-html/Phase2-inputs/issues 18/2026_07_09_p1.png` | Slotted metal mounting bracket with screws and knurled nuts; five slots visible | HIGH — direct visual observation |

**Evidence path (URL-encoded for HTML):**
- `Nanthini akka issues/issues%2018/2026_07_09_p1.png`

Audio recordings present:
- `submission-html/Phase2-inputs/issues 18/recording_2026-07-09_r1.mp3`
- `submission-html/Phase2-inputs/issues 18/recording_2026-07-09_r1.ogg`

Audio files have not been independently transcribed and are not mapped as confirmed evidence.
They are available for human review.

---

## Domain Boundary

**Domain: listing** (stated; uncertainty noted below)

The core failure — an instruction manual whose content does not match the physical hardware —
is a listing and documentation accuracy concern, consistent with the classification of
ISSUE-016 (domain: listing, owner: SL Listing Team).

The reported stop-distribution directive involves an operational action affecting supplier and
warehouse behaviour. If investigation establishes that the primary failure is in the
warehouse/operations domain (e.g., warehouse receiving and distributing a known-incorrect
manual without escalation), reclassification to the postage or operations domain may be
appropriate.

This determination requires the unresolved questions below to be answered first.

---

## Duplicate Check

| Comparison | Result |
|------------|--------|
| ISSUE-016 (Assembly Instruction Component Quantity Discrepancy — DWC112025) | **GREEN — separate incident.** Different product, different manual, different hardware component, different failure mode (applicability vs. quantity), different operational trigger. Structural class of problem is similar but the incidents are distinct. |
| GAP-006 (Assembly Instruction Technical Sign-Off and Product-to-Manual Verification) | **Document Gap NOT created.** GAP-006 already covers the structural control gap applicable to this issue. ISSUE-018 is linked to GAP-006 as a second incident evidencing the same absent control. |
| ISSUE-001 through ISSUE-017 (all) | No existing daily issue describes a mounting bracket instruction manual mismatch or a stop-distribution directive for an incorrect manual. No semantic duplicate identified. |

**Duplicate check result: GREEN for daily issue. Document Gap linked to GAP-006, not created.**

---

## Open Questions — Decision Required

| Question | Status |
|----------|--------|
| What is the SKU of the affected mounting bracket? | **OPEN — must confirm before issue can be resolved** |
| What are "those five" elements in the manual that are inapplicable? | **OPEN — requires manual inspection or reviewer clarification** |
| Has the stop-distribution directive been formally issued? By whom, when, and to which recipients? | **OPEN — reported, not confirmed** |
| Have all relevant suppliers received and complied with the directive? | **OPEN — unknown** |
| Does a correct, verified replacement manual exist? | **OPEN — unknown** |
| Has this manual mismatch resulted in customer contacts, returns, or complaints? | **OPEN — not confirmed** |
| Is this bracket a universal product whose manual applies to multiple SKUs? If so, which? | **OPEN — not confirmed** |
| Does GAP-006 need to be extended to cover a manual recall/update process for instructions already in supplier circulation? | **OPEN — requires reviewer determination after confirming the directive** |

---

## Pass / Fail Rule

| Check | Status |
|-------|--------|
| ISSUE-018 ID free (no duplicate) | ✅ Confirmed before creation |
| No semantic duplicate in ISSUE-001 through ISSUE-017 | ✅ Confirmed |
| Evidence image exists on disk | ✅ Confirmed |
| Confirmed observations and unproven/reported claims separated | ✅ |
| SKU recorded as UNKNOWN — TO BE CONFIRMED (not invented) | ✅ |
| Domain recorded with uncertainty noted | ✅ |
| Document Gap linked to GAP-006 — no new gap created | ✅ |
| Priority not invented — marked TBD | ✅ |
| Audio recordings noted as unverified | ✅ |
| Stop-distribution directive recorded as reported, not confirmed | ✅ |

---

## Known Limitations

- Audio recordings in `issues 18/` were not independently transcribed. All claims about the
  manual content, "those five" elements, and the stop-distribution directive depend on the
  NotebookLM Business Intelligence Report as their source.
- The SKU is unknown. This is the most critical unresolved field — no product-specific
  investigation, listing check, or supplier contact can be targeted without it.
- The meaning of "those five" cannot be confirmed from the image alone. The five slots in
  the bracket are confirmed visually, but whether "those five" refers to the slots, five
  hardware components, five manual steps, or another set of five elements is not determinable
  without reviewing the manual or the audio.
- The scope of the stop-distribution directive is unknown. Whether it was verbal, written,
  issued to all suppliers, or only to some is not confirmed.

---

## Next Step

This issue is ready for dashboard import via the Add Latest Issues button once this file
is saved. The dashboard automation (tools/serve.py / initAddIssuesPanel) will detect
ISSUE-018 as a new inbox issue and make it available for import.

After dashboard import, the following reviewer actions are required before this issue can
move beyond investigation status:

1. Confirm the SKU with Laksika.
2. Confirm the content of "those five" with Laksika.
3. Confirm the stop-distribution directive details with Varmen or Laksika.
4. Determine whether GAP-006 requires extension.

---

*Issue logged: 2026-07-09 | Logged by: Vishnusri | SKU confirmation and reviewer decision required before this issue can be resolved*
