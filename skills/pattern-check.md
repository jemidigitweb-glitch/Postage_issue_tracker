# Pattern Check Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Builder: Vishnu Sree | Validator: Varmen

---

## 1. Skill Purpose

This skill helps an LLM identify repeated operational issues, recurring workflow
failures, repeated courier problems, and improvement opportunities by analysing
the daily issue log over time.

**What this skill does:**
- Defines how to detect patterns across daily issue log entries
- Identifies which rule, procedure, or courier is most likely connected to a
  recurring issue
- Determines when a pattern has become significant enough to require escalation
- Surfaces improvement opportunities for rules and procedures

**What this skill does NOT do:**
- Contain historical patterns or statistics — it defines the framework only
- Resolve issues — use skills/issue-router.md for issue routing
- Update rules or procedures directly — all changes require Varmen approval
  and a Decision Log entry
- Operate without a populated intelligence-inbox/daily-issues/ folder — pattern
  detection requires actual issue log entries to analyse

**Where issue data comes from:**
All analysis is performed on files in: `intelligence-inbox/daily-issues/`
Naming format: `YYYY-MM-DD-issues.md`
Each file uses the structure defined in skills/daily-issue-log.md.

**Minimum data requirement:**
Pattern detection is unreliable with fewer than 5 issue log entries.
With fewer than 10 entries across a time window, treat findings as
observations rather than confirmed patterns. Confirm with Varmen before
acting on observations.

---

## 2. Why Pattern Detection Matters

The daily issue log is the raw data layer. Pattern detection converts that
raw data into actionable intelligence.

**What patterns can reveal:**
- A Janarthan rule that is repeatedly triggered as an exception — meaning the
  rule may be too narrow, too broad, or misapplied
- A workflow step that consistently fails — meaning the procedure may need
  clarification or the system may have a configuration problem
- A courier that repeatedly causes enquiry submissions — meaning a service level
  issue may need to be raised at account level
- A missing information issue that recurs with the same team — meaning a
  handover or template problem exists upstream
- A validation step that is repeatedly skipped — meaning the Pre-Completion
  Checklist may need reinforcement

**What patterns cannot do:**
A pattern cannot confirm a root cause on its own. Two issues in the same category
may have the same surface symptom but different causes. Pattern detection narrows
the investigation — it does not replace it.

**Connection to the AIOS intelligence loop:**
CLAUDE.md and the AIOS architecture describe an intelligence loop where daily
issues feed into pattern recognition, which feeds into rule and procedure
improvements, which feed back into better daily operations. This skill is
the middle layer of that loop.

**Source:** CLAUDE.md — PURPOSE section; Postage_AIOS_Architecture.md — Intelligence
Layer (C3/C4 capabilities); skills/daily-issue-log.md §2 Why Daily Issue Logging Matters

---

## 3. Pattern Detection Workflow

Follow this sequence when performing a pattern check.

**Step 1 — Collect the issue log files.**
Read all daily issue log files in intelligence-inbox/daily-issues/ for the
time window being analysed. Standard windows: 5-day (1 working week), 10-day
(2 weeks), 20-day (1 month).

**Step 2 — Group issues by category.**
Using the Category field (CAT-01 through CAT-09) from each issue entry,
group all issues. Do not recategorise — use the category recorded at logging time.
If an entry has no category or shows CAT-REVIEW, note it separately.

**Step 3 — Count issues per category per window.**
Produce a frequency count:
- How many issues per category in the window?
- Which category has the highest count?
- Are any categories at or above the escalation threshold? (See Section 7)

**Step 4 — Identify the specific workflows, couriers, or rules involved.**
Within each category, examine the Workflow Affected and Courier/Platform
Affected fields. Are the same workflow, courier, or platform appearing
repeatedly within a single category?

**Step 5 — Examine the Lessons Learned fields.**
Across all entries in a repeated category, do the Lessons Learned fields
point to the same root cause? If yes, that is a strong signal. If Lessons
Learned vary across entries, the pattern may have multiple contributing factors.

**Step 6 — Cross-reference against the relevant rule or procedure.**
Identify which Janarthan rule (context/janarthan-rules.md) or procedure
section (context/bgct-procedures.md) is most associated with the pattern.
Read that rule or procedure section in full before drawing conclusions.

**Step 7 — Determine whether the threshold for escalation is met.**
Apply the escalation triggers in Section 7. If a trigger is met, escalate
to the appropriate recipient (Section 7). If not, log the observation in
intelligence-inbox/document-gaps/ for ongoing monitoring.

**Step 8 — Document the finding.**
Record the pattern observation in intelligence-inbox/document-gaps/ with:
- Time window analysed
- Category and issue count
- Workflows, couriers, or rules involved
- Lessons Learned summary across entries
- Whether escalation threshold was met
- Recommended action (escalate / monitor / no action)

---

## 4. Pattern Categories

Nine pattern categories, aligned with the issue categories in
skills/daily-issue-log.md and skills/issue-router.md.

---

### PAT-01 — Repeated Booking Issues

**Category code:** CAT-01 in issue logs
**Detection indicators:**
- Multiple entries with booking rule not running or service not assigning
  across more than 2 days in the same time window
- Same workflow (UK Booking or DE Booking) appearing in 3 or more entries
- Same phase (e.g. Phase 5 Booking Rules, Phase 8 DE Service Assignment)
  appearing in the Description field across multiple entries

**Review targets:**
- context/bgct-procedures.md §1 (UK Booking), §2 (DE Booking)
- context/janarthan-rules.md — R-ROUTE-07, R-SVC-01 to R-SVC-15
- LEDSone OMS system behaviour (booking rule execution)

**Related workflows:** UK Booking (bgct-procedures.md §1), DE Booking (§2)

**Related rule categories:** R-ROUTE, R-SVC, R-EXC

**Escalation triggers:**
- Same booking rule fails 3 or more times in 5 days → escalate to team lead
- Two or more distinct booking rules fail in the same session → escalate to team lead
- Booking rule failure confirmed as system-wide (R-EXC-03) → escalate immediately

---

### PAT-02 — Repeated Vendor Booking Issues

**Category code:** CAT-02 in issue logs
**Detection indicators:**
- Two or more entries within 10 days involving Amazon Vendor PO mismatch,
  ASN submission error, or wrong DHL service selection
- Same step (e.g. Step 4 label creation, Step 7 ASN submission) appearing
  in Description across multiple entries
- Carton label PDF splitting errors appearing more than once in a month

**Review targets:**
- context/bgct-procedures.md §4 (German Vendor Booking)
- context/janarthan-rules.md — R-CARRIER-04, R-VAL-04, R-VAL-05, R-BK-02, R-BK-03
- Amazon Vendor Central account behaviour
- WhatsApp picklist accuracy from warehouse team

**Related workflows:** German Vendor Booking (bgct-procedures.md §4)

**Related rule categories:** R-WH, R-CARRIER, R-VAL, R-BK

**Escalation triggers:**
- ASN submitted without tracking numbers more than once → escalate to Laksika +
  Varmen immediately (R-VAL-04 breach; potential Amazon account risk)
- Same DHL service error (Kleinpaket or International instead of Paket) appears
  more than twice → escalate to Laksika; R-CARRIER-04 may need reinforcement

---

### PAT-03 — Repeated Return Label Issues

**Category code:** CAT-03 in issue logs
**Detection indicators:**
- Same return label step (e.g. wrong tab selected, IONOS email not received)
  appearing in 2 or more entries within a 10-day window
- Multiple entries where the return receiver field was blank or incorrect
- CST address requests that are consistently incomplete

**Review targets:**
- context/bgct-procedures.md §5 (German Return Labels)
- context/janarthan-rules.md — R-CARRIER-05, R-BK-05, R-BK-06
- DHL Business Portal (geschaeftskunden.dhl.de) — system stability
- CST team address request template (if one exists)

**Related workflows:** German Return Labels (bgct-procedures.md §5)

**Related rule categories:** R-CARRIER, R-BK

**Escalation triggers:**
- Wrong tab selected (SELBSTZAHLER instead of ONLINE) 3 or more times →
  escalate to team lead; reinforcement of R-BK-06 may be needed
- Return receiver field consistently wrong or blank → escalate to Laksika;
  DHL portal configuration may have changed
- CST address requests consistently missing fields → flag to team lead;
  upstream template or handover may need to change

---

### PAT-04 — Repeated Tracking Issues

**Category code:** CAT-04 in issue logs
**Detection indicators:**
- EVRi enquiries submitted 5 or more times in a 10-day window (suggesting
  a service level issue, not isolated incidents)
- Royal Mail enquiries appearing consistently for the same destination type
  or postcode area
- Tracking numbers recorded as unrecognised or in wrong format more than once

**Review targets:**
- context/bgct-procedures.md §11 (EVRi Courier Enquiries), §12 (Royal Mail Enquiries)
- context/janarthan-rules.md — R-EXC-09, R-EXC-10
- context/courier-vendor-info.md §2 (Royal Mail), §3 (EVRi)
- Teams channels: Evri & DPD Parcel Updates; Smart Track and Royal Mail Parcel Updates

**Related workflows:** EVRi Enquiries (§11), Royal Mail Enquiries (§12)

**Related rule categories:** R-EXC

**Escalation triggers:**
- EVRi enquiry count exceeds 5 in a 5-day window → escalate to team lead;
  may indicate a courier service level problem requiring account-level contact
- Same delivery area appearing in 3 or more EVRi non-delivery entries →
  escalate to team lead; area-specific pattern may require formal EVRi report
- Tracking number format errors appearing in multiple entries → escalate to
  Laksika; prefix change or carrier switch may have occurred

---

### PAT-05 — Repeated Courier Issues

**Category code:** CAT-05 in issue logs
**Detection indicators:**
- DHL label field errors (missing address, blank barcode) appearing more than
  once in a 10-day window
- EVRi REF: comment format errors appearing in more than one entry
- GLS service needed but process unknown appearing repeatedly — indicates
  the gap is operationally active, not theoretical

**Review targets:**
- context/courier-vendor-info.md §1 (DHL), §2 (Royal Mail), §3 (EVRi), §4 (GLS)
- context/janarthan-rules.md — R-VAL-01, R-EXC-09, R-EXC-10
- CLAUDE.md Known Gap 5 (GLS not documented) — if GLS issues recur, gap is urgent

**Related workflows:** DE Booking (§2), German 2nd Booking (§3), German Vendor Booking (§4), EVRi Enquiries (§11)

**Related rule categories:** R-VAL, R-EXC, R-CARRIER

**Escalation triggers:**
- DHL label field error appears more than twice in 10 days → escalate to team lead;
  may indicate a label template or OMS configuration problem
- EVRi REF: comment format error appears more than twice → escalate to team lead;
  R-EXC-09 may need to be surfaced more prominently in the workflow
- GLS issues appear more than twice in any window → escalate to Laksika;
  Known Gap 5 becomes operationally critical and must be resolved

---

### PAT-06 — Repeated Marketplace Issues

**Category code:** CAT-06 in issue logs
**Detection indicators:**
- Same marketplace (Amazon, eBay, Shopify, Wayfair) appearing in 3 or more
  entries within a 10-day window
- Same error type (Vendor Central login issue, Stallion CSV format failure,
  Wayfair Motherland assignment) appearing more than once
- Duplicate Shopify orders flagged in more than one entry within a week

**Review targets:**
- context/bgct-procedures.md §7 (USA Booking), §8 (Canada Booking), §4 (German Vendor), §9 (Amazon FBA)
- context/courier-vendor-info.md §7 (Amazon Seller Central), §8 (Amazon Vendor Central), §9 (eBay Seller Hub)
- context/janarthan-rules.md — R-WH-01, R-EXC-04, R-EXC-07
- LEDSone OMS export configuration (for Stallion CSV failures)

**Related workflows:** USA Booking (§7), Canada Booking (§8), German Vendor Booking (§4), Amazon FBA (§9)

**Related rule categories:** R-WH, R-EXC, R-CARRIER

**Escalation triggers:**
- Duplicate Shopify orders appearing in 2 or more entries in 5 days → escalate
  to team lead; may indicate an upstream order sync issue
- Wayfair Motherland assignment appearing in 3 or more entries → escalate to
  team lead; may indicate a persistent stock or warehouse configuration problem
- Stallion CSV format failure appearing more than twice → escalate to Laksika;
  OMS export template may have changed

---

### PAT-07 — Repeated Validation Failures

**Category code:** CAT-07 in issue logs
**Detection indicators:**
- Pre-Completion Checklist items repeatedly incomplete (same checklist item
  appearing in multiple entries)
- Label count mismatches appearing more than once in a 10-day window
- DHL label visual verification failing repeatedly for the same field type
  (e.g. blank barcode consistently, or wrong sender address consistently)

**Review targets:**
- context/janarthan-rules.md — R-VAL-01, R-VAL-02, R-VAL-03, R-VAL-04, R-VAL-05, R-VAL-06
- context/bgct-procedures.md §1 Phase 10 (UK labels), §2 Phase 10 (DE labels), §3 Phase 6 (DHL label check)
- LEDSone OMS label generation settings

**Related workflows:** UK Booking (§1), DE Booking (§2), Germany 2nd Booking (§3), German Vendor Booking (§4)

**Related rule categories:** R-VAL, R-BK

**Escalation triggers:**
- Same checklist item (R-VAL-06) repeatedly incomplete across 3 or more days →
  escalate to team lead; may indicate a step being consistently skipped
- DHL label barcode blank appearing more than twice → escalate to team lead;
  may indicate a printer configuration or OMS label template problem
- Packlist consistently not saved to Dropbox → escalate to team lead;
  may indicate a habit gap or Dropbox access issue

---

### PAT-08 — Repeated Missing Information Issues

**Category code:** CAT-08 in issue logs
**Detection indicators:**
- Wrong SKU entries appearing more than twice in a 5-day window for the same
  product group or marketplace
- Incomplete customer address requests from CST appearing repeatedly
- Motherland warehouse appearing for the same product type or channel repeatedly

**Review targets:**
- context/janarthan-rules.md — R-ROUTE-06, R-VAL-02, R-WH-01, R-EXC-06
- context/bgct-procedures.md §1 Phase 3 (Wrong SKU correction), §3 Phase 2 (2nd booking Wrong SKU)
- LEDSone Dashboard Combo Products page (dashboard.digitweblk.com/new/searchproducts.php)
- CLAUDE.md Known Gap 1 (team structure) — if wrong SKU escalation is consistently
  delayed because the right person cannot be reached

**Related workflows:** UK Booking (§1), DE Booking (§2), Germany 2nd Booking (§3)

**Related rule categories:** R-ROUTE, R-WH, R-VAL, R-EXC

**Escalation triggers:**
- Same SKU appearing as Wrong SKU in 3 or more entries → escalate to Laksika;
  the SKU may have a systemic listing error
- Wrong SKU cannot be identified (R-EXC-06) appearing more than twice for same
  product category → escalate to Laksika; Combo Products data may be incomplete
- Motherland assignment for the same channel or product type in 3 or more entries →
  escalate to team lead; may indicate a persistent stock replenishment or
  warehouse configuration issue

---

### PAT-09 — Repeated Workflow Exceptions

**Category code:** CAT-09 in issue logs
**Detection indicators:**
- Same exception type (R-EXC-01 to R-EXC-10) appearing in 3 or more entries
  across a 10-day window
- Warehouse unavailable (R-EXC-05) or stock out (R-EXC-01) appearing for the
  same warehouse on multiple days
- Address change after booking (R-EXC-08) appearing more than once in a week
  for the same marketplace

**Review targets:**
- context/janarthan-rules.md — R-EXC-01 through R-EXC-10
- context/bgct-procedures.md §1 Section 4 (Exception Handling), §3 Phase 2 (2nd booking exceptions)
- CLAUDE.md Section: Exception Handling Rules

**Related workflows:** UK Booking (§1), DE Booking (§2), Germany 2nd Booking (§3)

**Related rule categories:** R-EXC, R-WH

**Escalation triggers:**
- Same exception type appearing in 3 or more entries in 5 days → escalate to team lead;
  a systematic rather than random cause is likely
- Warehouse unavailability for the same location across 2 or more days → escalate to
  team lead; may indicate a logistics partner issue, not a one-off
- Address change after booking (R-EXC-08) appearing for the same marketplace twice
  in a week → escalate to team lead; may indicate a data quality issue in the
  marketplace feed

---

## 5. Frequency Analysis Guidance

Frequency alone does not define a pattern. This section defines how to assess
frequency in context.

### 5a. Standard Time Windows

| Window | Days | Use When |
|--------|------|---------|
| Short | 5 working days | Detecting acute failures; useful for fast-moving issues like booking rule failures |
| Medium | 10 working days | Detecting emerging trends; most common analysis window |
| Extended | 20 working days | Detecting slow-moving patterns; useful for courier or marketplace issues that are infrequent but cumulative |

Always state the time window when reporting a pattern finding. A "3 in 5 days"
finding and a "3 in 20 days" finding are very different signals.

### 5b. Frequency Thresholds

These thresholds define when an observation becomes a pattern worth investigating.
They are guidance, not fixed rules — context matters.

| Threshold Name | Definition | Response |
|---------------|-----------|---------|
| Observation | 2 issues in the same category within any window | Note and monitor; do not escalate yet |
| Pattern | 3 issues in the same category within a 10-day window | Investigate root cause per Section 6; apply escalation trigger if met |
| Acute Pattern | 3 issues in the same category within a 5-day window | Escalate to team lead immediately; investigation must happen in parallel |
| Persistent Pattern | Same category at Observation or Pattern level for 3 consecutive weekly cycles | Escalate to Laksika; the issue is systemic, not random |

### 5c. Adjusting for Volume

If daily order volumes are unusually high (e.g. peak season), a higher issue
count may be expected without indicating a worsening pattern. If issue counts
rise proportionally with order volume, the rate (issues per 100 orders) matters
more than the raw count. Note volume context when reporting.

If daily order volumes are not recorded in the issue log, note this limitation
in the pattern finding.

### 5d. Distinguishing True Patterns from Coincidence

Two issues in the same category are not automatically a pattern. Before
classifying as a pattern:

- Do both issues involve the same workflow step, courier, or rule?
- Do both issues have similar Lessons Learned entries?
- Were both issues on consecutive days, or spread across the window?

If the answer to all three is yes: likely a pattern.
If the issues differ in workflow, courier, and lesson: may be coincidence.
State your reasoning explicitly when reporting a pattern finding.

---

## 6. Root Cause Investigation Guidance

When a pattern is identified, the next step is to investigate whether a
root cause can be determined from existing AIOS documents.

**This is not a resolution step.** Root cause investigation using this skill
produces a hypothesis — not a confirmed answer. Confirmed answers require
human verification by Laksika or Varmen.

### 6a. Investigation Sequence

**Step 1 — Read the relevant rule.**
Find the rule most associated with the pattern in context/janarthan-rules.md.
Read the full rule entry: Business Purpose, Trigger Condition, Expected Action,
and Source Reference. Is the rule clear and unambiguous? If not, ambiguity
in the rule may be contributing to repeated failures.

**Step 2 — Read the relevant procedure section.**
Find the procedure section in context/bgct-procedures.md that covers the
affected workflow. Is the step where failures occur described clearly? Are
validation checks or evidence requirements specified?

**Step 3 — Compare the Lessons Learned entries.**
Across all issue entries in the pattern, are the Lessons Learned fields
pointing to the same action? If yes, the lesson is not being retained.
This suggests a training or process documentation gap.

**Step 4 — Check for a known gap.**
Does CLAUDE.md Known Gaps or the Decision Log already identify a gap related
to this pattern? If yes, the pattern may be evidence that a known gap has
become operationally critical.

**Step 5 — Form a hypothesis.**
State the probable root cause as a hypothesis in this format:
"Probable cause: [rule / procedure / training / system / upstream gap].
Evidence: [summary of issue entries and Lessons Learned]. Confidence: HIGH /
MEDIUM / LOW based on [why]."

### 6b. Root Cause Categories

| Root Cause Type | Indicators | Recommended Action |
|----------------|-----------|-------------------|
| Rule ambiguity | Same rule ID appearing across entries; different resolutions applied to same trigger | Flag to Varmen; rule may need clarification in context/janarthan-rules.md |
| Procedure gap | Procedure step is missing or unclear in bgct-procedures.md | Flag to Laksika; procedure section may need expansion |
| Known gap now active | Issue matches a [VERIFY REQUIRED] or CLAUDE.md Known Gap item | Escalate to Laksika; gap must be resolved before the pattern can be addressed |
| Training or habit gap | Rule and procedure are clear; Lessons Learned shows the same lesson not being retained | Flag to team lead; reinforcement or onboarding gap may exist |
| System or configuration problem | Issue is in the OMS, DHL portal, or marketplace platform — not in the rule or procedure | Flag to team lead; may require IT or vendor contact |
| Upstream data quality | Missing information or wrong SKU originating from another team or platform | Flag to team lead; upstream handover or template may need to change |

---

## 7. Escalation Triggers

Escalation triggers define when a pattern requires action beyond monitoring.
These are the conditions from Section 4 consolidated into a single reference table.

### 7a. Escalate to Team Lead

| Trigger | Pattern Category | Why |
|---------|-----------------|-----|
| Same booking rule fails 3+ times in 5 days | PAT-01 | System-wide failure or configuration problem likely |
| DHL label field error 3+ times in 10 days | PAT-05, PAT-07 | Label template or printer configuration problem |
| Same checklist item incomplete 3+ days | PAT-07 | Habit or process gap |
| Duplicate Shopify orders 2+ times in 5 days | PAT-06 | Upstream order sync issue |
| Warehouse unavailable 2+ consecutive days | PAT-09 | Logistics partner issue, not isolated event |
| Same exception type 3+ times in 5 days | PAT-09 | Systematic cause likely |
| EVRi enquiry count exceeds 5 in 5 days | PAT-04 | Courier service level issue |
| Wrong tab / return receiver errors 3+ times | PAT-03 | Reinforcement of R-BK-06 needed |
| Packlist consistently not saved to Dropbox | PAT-07 | Access or habit gap |

### 7b. Escalate to Laksika

| Trigger | Pattern Category | Why |
|---------|-----------------|-----|
| Same SKU in Wrong SKU entries 3+ times | PAT-08 | Systemic listing error; Combo Products data may be incomplete |
| Stallion CSV format failure 2+ times | PAT-06 | OMS export template may have changed |
| DHL return receiver field wrong 2+ times | PAT-03 | DHL portal configuration may have changed |
| GLS issue appearing 2+ times | PAT-05 | Known Gap 5 is now operationally critical |
| Tracking format errors in multiple entries | PAT-04 | Carrier or prefix change may have occurred |
| Pattern matches a [VERIFY REQUIRED] workflow | Any | Gap must be resolved before the pattern can be addressed |
| Procedure gap hypothesis (from §6) | Any | Procedure section in bgct-procedures.md may need expansion |

### 7c. Escalate to Varmen

| Trigger | Pattern Category | Why |
|---------|-----------------|-----|
| ASN submitted without tracking numbers 2+ times | PAT-02 | Potential Amazon account risk; cross-AIOS implications |
| Pattern linked to vendor booking boundary | PAT-02 | Cross-AIOS boundary question; context/vendor-booking-boundary.md applies |
| Persistent pattern (3 consecutive weekly cycles) | Any | Systemic; requires formal Decision Log entry to address |
| Pattern confirms a CLAUDE.md Known Gap is active | Any | Gap must move to Decision Log resolution path |
| Rule ambiguity hypothesis cannot be resolved by team lead | Any | Rule change requires Varmen approval; context/janarthan-rules.md cannot be updated without Decision Log entry |

### 7d. No Escalation Required When

- Issue count is at Observation level (2 in any window) and there is no
  acute pattern or matching escalation trigger
- Pattern appears to be coincidence (different workflows, couriers, lessons
  across entries — see §5d)
- Pattern was observed but the last occurrence was more than 10 days ago
  with no recurrence

In these cases: log the observation in intelligence-inbox/document-gaps/ and
continue monitoring.

---

## 8. Improvement Opportunity Identification

A pattern that reaches escalation level may point to an improvement in a
rule, procedure, or operational practice. This section defines how to identify
and propose improvements — without making changes directly.

### 8a. What Qualifies as an Improvement Opportunity

An improvement opportunity exists when:
- A rule is correctly defined but is being misapplied repeatedly → the rule
  may need clearer trigger wording or a worked example
- A procedure step is correctly defined but consistently skipped → the step
  may need to be elevated, highlighted, or moved earlier in the sequence
- A validation check is in the rules but not visible in the procedure → the
  procedure may need to explicitly reference the rule
- A gap ([VERIFY REQUIRED] or Known Gap) is causing repeated operational
  issues → the gap has become high priority for resolution
- An upstream input (CST address, warehouse picklist, marketplace data) is
  consistently incomplete → an upstream fix may be needed outside Postage

### 8b. How to Propose an Improvement

**Step 1 — Write the observation.**
"Pattern [PAT-XX] detected: [category], [count] entries in [window]. Affected
workflow: [name]. Affected rule or procedure: [ID or section reference]."

**Step 2 — State the hypothesis.**
"Probable cause: [root cause category from §6b]. Evidence: [summary]."

**Step 3 — State the improvement proposal.**
Format: "Proposed improvement: [specific change to rule / procedure / training /
upstream process]. Expected outcome: [what would no longer recur if the change
is made]."

Do not write the improved rule or procedure text. The proposal describes what
should change — the actual change is made only after Varmen approves it via
a Decision Log entry.

**Step 4 — Save to intelligence-inbox/document-gaps/.**
File naming format: `YYYY-MM-DD-pattern-[PAT-XX]-finding.md`
Include: observation, hypothesis, proposed improvement, and escalation status.

**Step 5 — Flag to Varmen or Laksika per escalation trigger.**
The finding is not acted on until a decision is recorded in the CLAUDE.md
Decision Log. The file in document-gaps/ is the input to that decision — not
the decision itself.

### 8c. Improvement Scope Limits

Improvements identified through this skill can only affect:
- context/janarthan-rules.md — rule wording, trigger conditions, or expected actions
- context/bgct-procedures.md — procedure step clarity, validation references, or evidence requirements
- skills/ files — if a skill is routing issues incorrectly or missing a routing path
- intelligence-inbox/document-gaps/ — where gap findings are formally recorded

Improvements cannot:
- Add new rules not found in source documents
- Remove existing rules without Varmen approval
- Change the AIOS governance structure
- Alter the CLAUDE.md Decision Log directly — Varmen enters confirmed decisions

---

## 9. Known Limitations

| Limitation | Impact |
|-----------|--------|
| intelligence-inbox/daily-issues/ is currently empty | No data exists for pattern detection until daily logging begins |
| Minimum 5–10 issue entries required for reliable detection | Pattern detection cannot function until enough entries are logged |
| Historical issue backlog not yet transferred (CLAUDE.md Known Gap 6) | Historical patterns may exist but are invisible until the backlog is imported |
| GLS, Royal Mail full process, FBA, and DE DHL eBay Tracking are [VERIFY REQUIRED] | Patterns involving these workflows cannot be fully investigated using confirmed source material |
| Order volume data is not captured in the issue log | Cannot distinguish proportional volume increases from genuine worsening |
| Team structure not documented | Cannot identify whether patterns are linked to specific operators or shifts |
| Courier SLAs not documented | Cannot assess whether EVRi or Royal Mail patterns breach formal service commitments |
| All pattern findings are hypotheses | Human verification by Laksika or Varmen is always required before acting on a pattern |
| This skill defines the framework only | Pattern detection requires populated issue log files and human judgment |

---

## 10. Quick Navigation Guide

| I need to... | Go To |
|-------------|-------|
| Start a pattern check analysis | Section 3 Pattern Detection Workflow |
| Identify the category of a repeated issue | Section 4 Pattern Categories |
| Understand detection indicators for a specific category | Section 4 — find the relevant PAT-XX category |
| Decide how many occurrences make a pattern | Section 5 Frequency Analysis Guidance |
| Determine whether a pattern is real or coincidence | Section 5d Distinguishing True Patterns from Coincidence |
| Investigate the root cause of a pattern | Section 6 Root Cause Investigation Guidance |
| Determine what type of root cause applies | Section 6b Root Cause Categories |
| Know when to escalate to team lead | Section 7a |
| Know when to escalate to Laksika | Section 7b |
| Know when to escalate to Varmen | Section 7c |
| Know when NOT to escalate | Section 7d |
| Propose an improvement based on a pattern | Section 8 Improvement Opportunity Identification |
| Understand what improvements can be made through this skill | Section 8c Improvement Scope Limits |
| Find the rule connected to a pattern | context/janarthan-rules.md |
| Find the procedure section connected to a pattern | context/bgct-procedures.md |
| Check whether the pattern matches a known gap | CLAUDE.md Known Gaps; CLAUDE.md Decision Log |
| Log an issue to build the pattern dataset | skills/daily-issue-log.md |
| Route an issue when it first occurs | skills/issue-router.md |
| Check booking readiness before an issue becomes a pattern | skills/booking-check.md |

---

## Validation Summary

### Pattern Categories Covered: 9
PAT-01 Repeated Booking Issues —
PAT-02 Repeated Vendor Booking Issues —
PAT-03 Repeated Return Label Issues —
PAT-04 Repeated Tracking Issues —
PAT-05 Repeated Courier Issues —
PAT-06 Repeated Marketplace Issues —
PAT-07 Repeated Validation Failures —
PAT-08 Repeated Missing Information Issues —
PAT-09 Repeated Workflow Exceptions

Aligned with CAT-01 through CAT-09 in skills/daily-issue-log.md and
skills/issue-router.md.

### Detection Methods Defined

| Method | Where Defined |
|--------|--------------|
| Category grouping by CAT code | Section 3 Step 2 |
| Frequency counting per window | Section 3 Step 3; Section 5 |
| Workflow, courier, rule cross-reference | Section 3 Steps 4–6 |
| Lessons Learned comparison | Section 3 Step 5; Section 6a Step 3 |
| Time window analysis (5/10/20 day) | Section 5a |
| Frequency thresholds (Observation / Pattern / Acute / Persistent) | Section 5b |
| Coincidence vs. pattern test | Section 5d |

### Escalation Triggers Defined

| Escalation Recipient | Trigger Count |
|--------------------|--------------|
| Team lead | 9 triggers |
| Laksika | 7 triggers |
| Varmen | 5 triggers |
| No escalation required | 3 conditions |

All escalation triggers are specific: they name the pattern category, the
frequency threshold, and the reason for escalation.

### Source Files Used

| Source | Usage |
|--------|-------|
| skills/daily-issue-log.md | Category codes (CAT-01 to CAT-09); issue entry structure; Lessons Learned field definition; intelligence-inbox/daily-issues/ data source |
| skills/issue-router.md | 9 issue categories aligned exactly; issue routing model |
| context/bgct-procedures.md | Procedure section references in all 9 pattern categories and §6 investigation guidance |
| context/janarthan-rules.md | Rule ID references in all 9 pattern categories, escalation triggers, and §6 root cause investigation |
| CLAUDE.md | Intelligence loop framing (§2); Known Gap 6 (data backlog); Known Gaps 1–5 as escalation context; governance / escalation path; Decision Log integration |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- All 9 pattern categories are defined with detection indicators, review targets,
  related workflows, related rule categories, and escalation triggers
- No historical patterns or statistics are invented — the framework only
- Frequency analysis guidance (Section 5) gives a future LLM clear thresholds
  without requiring historical data to apply them
- Root cause investigation guidance (Section 6) gives a structured hypothesis
  method that leads to Laksika or Varmen — not to invented conclusions
- Escalation triggers (Section 7) are specific, named by recipient, and explain
  the reason for escalation — not vague "escalate if needed" instructions
- Improvement opportunity identification (Section 8) defines how to propose
  changes without making them — correctly preserving the governance requirement
  that all changes go through Varmen and the Decision Log
- A future LLM can consistently identify repeated issues, determine investigation
  targets, and recommend review actions without requiring historical knowledge

**Pending Varmen review before operational use.**
