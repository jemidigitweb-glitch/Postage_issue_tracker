# Daily Issue Log Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Builder: Vishnu Sree | Validator: Varmen

---

## 1. Skill Purpose

This skill defines how daily operational issues are recorded, classified,
tracked, and reused as organisational memory. It is a learning-capture
framework — not a list of issues, and not a procedure for resolving issues.

**What this skill does:**
- Defines the logging structure every issue entry must follow
- Classifies issues into 9 confirmed categories aligned with the AIOS
- Defines how resolution and lessons learned are captured for future use
- Defines how escalated issues are tracked until formally closed
- Enables pattern detection over time (see skills/pattern-check.md)

**What this skill does NOT do:**
- Contain any actual issue records — those go in intelligence-inbox/daily-issues/
- Resolve issues — that is the role of skills/issue-router.md
- Replace Varmen's approval for Decision Log entries — confirmed resolutions
  are a separate step after logging

**Where issue files are saved:**
All issue log entries are saved in:
`intelligence-inbox/daily-issues/`
using the naming format: `YYYY-MM-DD-issues.md`
One file per operational day. Multiple issues within one file for the same day.

---

## 2. Why Daily Issue Logging Matters

The AIOS is designed to improve over time as real operational knowledge feeds
in. Without structured issue logging, knowledge of what went wrong, why, and
how it was fixed lives only in people's memories — and is lost when staff change.

**Confirmed problem in current state:**
CLAUDE.md Known Gap 6 confirms that an existing daily issue collection process
(run by Vishnu Sree via Atis Raj) has not been transferred into this AIOS.
No historical issue log was provided during the Phase 1 build. The intelligence-inbox/
daily-issues/ folder is empty.

**Source:** CLAUDE.md Known Gap 6

**What structured logging enables:**
- Pattern detection: recurring issues become visible across days and weeks
- Rule refinement: a Janarthan rule that keeps triggering exceptions may
  need clarification — only a log reveals this
- Handover readiness: new staff can see what has gone wrong before and how
  it was handled — without relying on verbal knowledge transfer
- AIOS improvement: confirmed resolutions feed into the Decision Log and
  eventually into updated procedures or rules

**Source:** Postage_AIOS_Architecture.md — Intelligence Layer (C3/C4 capabilities)

---

## 3. Issue Logging Workflow

Follow this sequence when an issue occurs during an operational session.

**Step 1 — Identify the issue type.**
Use skills/issue-router.md to classify the issue into one of the 9 categories
(Section 4). Do not log as "other" or "unknown" — identify the closest category.

**Step 2 — Record the issue immediately.**
Open or create today's issue file:
`intelligence-inbox/daily-issues/YYYY-MM-DD-issues.md`
Complete all required fields from Section 5. Do not defer logging to end of day
— context is lost if the issue is not recorded when it occurs.

**Step 3 — Record the resolution (or escalation).**
Once the issue is resolved (or escalated), complete the Resolution and Lessons
Learned fields. If escalated, complete Section 8 (Escalation Tracking) fields.

**Step 4 — Update status.**
Mark the issue as RESOLVED, ESCALATED, or PENDING depending on outcome.
Do not leave issues at OPEN status at end of day without explanation.

**Step 5 — Flag for pattern review.**
At end of day, note if any issue category has appeared more than once.
If a category repeats across 3 or more days, flag for pattern-check.md review.

---

## 4. Recommended Issue Categories

These 9 categories align with the issue types in skills/issue-router.md.
Every issue must be assigned exactly one category.

| Category Code | Category Name | Typical Trigger |
|--------------|--------------|----------------|
| CAT-01 | Booking Issues | Service not assigning; booking rule not running; label not generating |
| CAT-02 | Vendor Booking Issues | Amazon Vendor PO mismatch; ASN error; DHL service wrong; carton label problem |
| CAT-03 | Return Label Issues | German return label not generated; wrong tab; IONOS email not received |
| CAT-04 | Tracking Issues | Parcel not moving; EVRi enquiry; Royal Mail enquiry; tracking number unrecognised |
| CAT-05 | Courier Issues | DHL label field error; GLS service needed but undocumented; EVRi REF: format error |
| CAT-06 | Marketplace Issues | Amazon, eBay, Shopify, Wayfair platform error; Vendor Central login; Stallion CSV error |
| CAT-07 | Validation Failures | Pre-Completion Checklist failed; label count mismatch; barcode blank; carton label unsplit |
| CAT-08 | Missing Information Issues | Wrong SKU; incomplete address; Motherland warehouse; unresolvable data gap |
| CAT-09 | Workflow Exception Issues | Duplicate order; booking rule failure; warehouse unavailable; stock out |

**Do not use "CAT-00" or "Unknown"** — if the category is genuinely unclear,
note it as "CAT-REVIEW" with a note requesting Varmen classification. Even an
imperfect category is more useful than no category for pattern detection.

---

## 5. Required Issue Fields

Every issue entry must contain all 11 fields. Use [BLANK] only if a field is
genuinely not applicable — do not leave fields empty.

---

### Field Definitions

**Issue ID**
Format: `ISSUE-YYYY-MM-DD-NNN` where NNN is a sequential number starting at 001
per day. First issue on a day: ISSUE-2026-06-23-001. Second: ISSUE-2026-06-23-002.
Purpose: unique identifier for cross-referencing in Decision Log, Teams, or
pattern-check.md.

**Date**
Format: YYYY-MM-DD. Use the date the issue occurred — not the date it was logged
if logging was deferred.

**Category**
One of the 9 category codes from Section 4 (CAT-01 through CAT-09, or CAT-REVIEW).

**Description**
What happened. Written in plain operational language. Include:
- What was being done when the issue occurred
- What the system or output showed
- What was expected vs. what actually happened
Keep to 3–5 sentences. Do not include the resolution here.

**Workflow Affected**
The workflow where the issue occurred. Use the exact workflow name from
context/bgct-procedures.md (e.g. UK Booking, Germany 2nd Booking, German Return Labels).

**Courier / Platform Affected**
Which courier or platform was involved. Use the exact name from context/courier-vendor-info.md
(e.g. DHL, Royal Mail, EVRi, GoShippo, Stallion Express, Amazon Vendor Central).
Write [BLANK] if no specific courier or platform was involved.

**Evidence**
What evidence was saved or exists. Include:
- Screenshot filename or Dropbox path if applicable
- Teams thread link or channel and date if applicable
- Google Sheet entry if applicable
- Write [BLANK] if no evidence was captured (and note why if possible)

**Resolution**
What was done to fix the issue. Write [ESCALATED] if not yet resolved.
Write [PENDING] if resolution is in progress. Include the rule or procedure
reference that guided the resolution (e.g. "Resolved per R-EXC-03 — re-ran
booking rule; confirmed order processed correctly on second attempt").

**Escalation Required**
YES or NO. If YES: who was it escalated to, when, and by what method (Teams
message, verbal, email). Include the response received if known.

**Status**
One of: RESOLVED | ESCALATED | PENDING | OPEN
- RESOLVED: issue fully closed; resolution recorded
- ESCALATED: raised to team lead, Laksika, or Varmen; awaiting response
- PENDING: resolution in progress; not yet closed
- OPEN: issue identified but not yet actioned — should not remain OPEN at end of day

**Lessons Learned**
The most important takeaway. Written as a single sentence starting with an action verb.
Examples:
- "Always confirm all tracking numbers are in Google Sheet before opening Vendor Central ASN."
- "Check EVRi tracking number prefix before submitting enquiry — H04RQ or T019VA only."
- "Run Motherland confirmation check before switching warehouse — stock may still be available."
Write [BLANK] only if the issue was a one-off with no reusable lesson.

---

### Issue Entry Template

Use this template in `intelligence-inbox/daily-issues/YYYY-MM-DD-issues.md`:

```markdown
---

## Issue ID: ISSUE-YYYY-MM-DD-NNN

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Category | CAT-XX — [Category Name] |
| Workflow Affected | [Workflow name from bgct-procedures.md] |
| Courier / Platform Affected | [Name from courier-vendor-info.md, or BLANK] |
| Status | OPEN / RESOLVED / ESCALATED / PENDING |

### Description
[What happened — 3–5 sentences. What was being done, what the system showed,
what was expected vs. what occurred.]

### Evidence
[Screenshot filename / Dropbox path / Teams channel and date / Google Sheet
entry — or BLANK with reason]

### Resolution
[What was done to fix it. Rule ID or procedure reference if applicable.
Or: ESCALATED / PENDING]

### Escalation
[YES or NO. If YES: who, when, how, and response received.]

### Lessons Learned
[One sentence starting with an action verb. Or BLANK.]

---
```

---

## 6. Evidence Requirements

Evidence makes an issue log entry verifiable and reusable. The following
evidence types are accepted for Postage issue entries.

| Evidence Type | When Required | Where Saved |
|--------------|--------------|------------|
| Screenshot — OMS state | When a booking error or service failure is logged | evidence/ folder or Dropbox evidence subfolder |
| Screenshot — DHL label with error | When a DHL label validation failure is logged | evidence/ folder |
| Screenshot — Teams message | When a Teams-triggered issue (return label, address change, EVRi) is logged | evidence/ folder or Teams thread itself |
| Dropbox file path | When a file was saved incorrectly or is missing | Note exact path and filename in Evidence field |
| Google Sheet entry | When Amazon Vendor tracking numbers or FBA sheet data is involved | Note sheet name and tab |
| EVRi reference number | When an EVRi enquiry submission is logged | evidence/ folder or Teams reply thread |
| Teams thread link or description | When an issue was raised or resolved via Teams | Note channel, date, and message context |

**Minimum evidence standard:**
Every RESOLVED issue must have at least one piece of evidence recorded in the
Evidence field. An issue with no evidence and no explanation is incomplete.

**When no evidence is available:**
Write: `[BLANK — no screenshot taken; issue resolved verbally / issue occurred
in system with no exportable evidence]` — do not leave the field empty.

---

## 7. Resolution Capture Rules

How resolutions are recorded matters as much as recording the issue itself.
A resolution that cannot be replicated is not a resolution.

**Rule 1 — Cite the rule or procedure that guided the resolution.**
If the issue was resolved by following a Janarthan rule, cite the Rule ID
(e.g. "Resolved per R-EXC-03"). If it followed a procedure section, cite
the section (e.g. "Resolved per bgct-procedures.md §3 Phase 4").

**Rule 2 — Write the resolution in the past tense.**
"Re-ran booking rule — order processed correctly on second attempt."
Not: "Re-run booking rule and check if it works."

**Rule 3 — Distinguish between a resolved issue and a worked-around issue.**
- RESOLVED: root cause fixed; same issue should not recur
- WORKED AROUND: issue not fixed at root; a temporary solution was applied —
  mark as PENDING and flag for pattern monitoring

**Rule 4 — If escalated, record both the escalation and the outcome.**
An escalation entry is not complete until the response is received and recorded.
If the response has not arrived by end of day, set status to ESCALATED and
update the next day when the response is received.

**Rule 5 — If a resolution leads to a potential rule or procedure change:**
Note in the Lessons Learned field: "This may require an update to [rule ID /
procedure section] — flag to Varmen." Do not update rules or procedures
directly from an issue log entry. A Decision Log entry by Varmen is required
first.

---

## 8. Escalation Tracking

When an issue is escalated, additional tracking fields are required beyond
the standard 11 fields. Add these as a sub-section to the issue entry.

| Escalation Field | Required Content |
|-----------------|-----------------|
| Escalated To | Team lead / Laksika / Varmen — name the specific role |
| Escalated At | Time and date of escalation (YYYY-MM-DD HH:MM SL time) |
| Escalation Method | Teams message / verbal / email — specify which |
| Teams Channel or Thread | If via Teams: channel name and date of message |
| Response Received | YES / NO / AWAITING |
| Response Summary | What was confirmed, decided, or directed |
| Resolution After Escalation | What action was taken after the response was received |
| Decision Log Update Required | YES / NO — if YES: which CLAUDE.md Decision Log item is affected |

**Escalation tracking template addition:**

```markdown
### Escalation Detail
| Escalation Field | Value |
|-----------------|-------|
| Escalated To | [Team lead / Laksika / Varmen] |
| Escalated At | [YYYY-MM-DD HH:MM SL] |
| Escalation Method | [Teams / verbal / email] |
| Teams Channel or Thread | [Channel name and date, or BLANK] |
| Response Received | [YES / NO / AWAITING] |
| Response Summary | [What was confirmed, decided, or directed] |
| Resolution After Escalation | [What action followed the response] |
| Decision Log Update Required | [YES → which item / NO] |
```

**When escalation requires a Decision Log update:**
If the escalation response resolves a confirmed gap (see CLAUDE.md Decision Log),
the resolution must be recorded in CLAUDE.md Decision Log by Varmen before it is
treated as an operational fact. The issue log entry is not sufficient on its own.

---

## 9. Reuse and Learning Capture

The daily issue log is an input to the intelligence loop. It becomes useful
only if lessons are extracted and reused. This section defines how.

### 9a. Single-Issue Learning

The Lessons Learned field on every issue entry captures the immediate takeaway.
These are not reviewed across entries — they are reference points for the person
who experienced the issue and anyone reading the same day's log in future.

**Format rule for Lessons Learned:**
Start with an action verb. Be specific. Make it directly actionable.

Good: "Always split carton label PDF using maxai.me before saving any BOX folder —
even if it looks like one page, check the page count first."

Not useful: "Be more careful with carton labels."

### 9b. Cross-Issue Pattern Detection

When 3 or more issues in the same category occur within a 5-day window, flag
for pattern-check.md review. See skills/pattern-check.md.

The pattern-check skill operates on the intelligence-inbox/daily-issues/ folder.
For it to work, issue categories and Lessons Learned fields must be consistently
filled in — inconsistent categorisation produces false patterns or misses real ones.

### 9c. Confirmed Pattern → Rule or Procedure Review

If pattern-check.md identifies a recurring issue linked to a specific rule or
procedure section, the finding should be:
1. Noted in intelligence-inbox/document-gaps/ with a gap description
2. Raised with Varmen for a Decision Log entry
3. Applied to the relevant rule in context/janarthan-rules.md or procedure in
   context/bgct-procedures.md only after Varmen confirms the change

**What must NOT happen:**
A recurring issue does not automatically change a rule. Every rule change
requires Varmen to confirm it in the Decision Log. The issue log identifies
candidates for review — it does not authorise changes.

### 9d. Transferring Existing Issues Into This Log

CLAUDE.md Known Gap 6 notes that existing daily issues collected by Vishnu Sree
via Atis Raj have not been transferred to this AIOS. When this transfer occurs:

- Each historical issue should be logged using the template in Section 5
- Historical issues that do not have all required fields: fill in what is known;
  mark missing fields [HISTORICAL — DATA NOT AVAILABLE]
- Historical issues should be backdated using the actual incident date (not the
  transfer date) so pattern detection works accurately

---

## 10. Known Limitations

| Limitation | Impact |
|-----------|--------|
| intelligence-inbox/daily-issues/ is currently empty | No issue history exists for pattern detection |
| Historical issues from existing Atis Raj collection not transferred | Known Gap 6 in CLAUDE.md — backlog exists but is outside this AIOS |
| Team structure not documented | Cannot name specific individuals in escalation fields — use role titles |
| No automated issue capture | All logging is manual; depends on the Postage team member taking the time to log |
| Escalation responses may not be received on the same day | ESCALATED status may persist across multiple days' log files |
| GLS, Royal Mail full process, FBA, and DE DHL eBay Tracking are partially confirmed | Issues in these workflows may have resolution steps that cannot be fully cited |
| This skill defines the framework only | Actual issue entries live in intelligence-inbox/daily-issues/ |
| Pattern detection requires consistent categorisation | If categories are used inconsistently, pattern-check.md produces unreliable results |

---

## 11. Quick Navigation Guide

| I need to... | Go To |
|-------------|-------|
| Classify an issue type | Section 4 Issue Categories (or skills/issue-router.md for detailed matching) |
| Create a new issue log entry | Section 5 — use the issue entry template |
| Know what evidence to save | Section 6 Evidence Requirements |
| Record how an issue was resolved | Section 7 Resolution Capture Rules |
| Track an escalated issue | Section 8 Escalation Tracking |
| Extract a lesson from an issue | Section 9a Single-Issue Learning |
| Flag a pattern for review | Section 9b and skills/pattern-check.md |
| Transfer historical issues into this AIOS | Section 9d |
| Find existing issue entries | intelligence-inbox/daily-issues/ |
| Route an issue to the right workflow or courier | skills/issue-router.md |
| Check if a booking was ready before the issue occurred | skills/booking-check.md |
| Find the rule that should have prevented this issue | context/janarthan-rules.md |
| Confirm an escalated resolution in the Decision Log | CLAUDE.md Decision Log (Varmen required) |

---

## Validation Summary

### Issue Categories Covered: 9
CAT-01 Booking Issues — CAT-02 Vendor Booking Issues — CAT-03 Return Label Issues —
CAT-04 Tracking Issues — CAT-05 Courier Issues — CAT-06 Marketplace Issues —
CAT-07 Validation Failures — CAT-08 Missing Information Issues —
CAT-09 Workflow Exception Issues

### Required Fields Defined: 11
Issue ID — Date — Category — Description — Workflow Affected —
Courier/Platform Affected — Evidence — Resolution — Escalation Required —
Status — Lessons Learned

### Escalation Tracking Model
8 additional escalation fields defined (Section 8) with a template extension
that integrates with the standard issue entry. Escalation pathway covers:
team lead → Laksika → Varmen, with Decision Log update trigger where applicable.

### Source Files Used

| Source | Usage |
|--------|-------|
| CLAUDE.md | Known Gap 6 (existing issue backlog); Purpose; intelligence loop framing; escalation path; Decision Log integration |
| skills/issue-router.md | 9 issue categories aligned exactly with issue-router.md category structure |
| context/bgct-procedures.md | Workflow name references for Workflow Affected field |
| context/janarthan-rules.md | Rule ID citation model for Resolution Capture Rules (Section 7) |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- All 9 issue categories are defined and aligned with skills/issue-router.md
- All 11 required fields are defined with format rules, content requirements,
  and acceptable values — no field is vague
- The issue entry template is complete and immediately usable
- Resolution Capture Rules (Section 7) ensure resolutions are reusable, not
  just descriptive
- Escalation Tracking (Section 8) creates a closed loop from issue → escalation
  → response → Decision Log update
- Lessons Learned field is defined with a format rule that makes it actionable
- No actual issues are invented — the framework is defined only
- A future LLM can consistently record, classify, and reuse issue knowledge
  without requiring verbal explanation

**Pending Varmen review before operational use.**
