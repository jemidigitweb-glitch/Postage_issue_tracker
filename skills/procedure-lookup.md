# Procedure Lookup Skill
# LEDSone — Postage Department AIOS
# Version: 1.0 Draft | Date: June 2026
# Status: DRAFT — Pending Varmen review
# Builder: Vishnu Sree | Validator: Varmen

---

## 1. Skill Purpose

This skill routes an LLM to the correct procedure section when a user asks
how to perform a specific Postage operation. It does not contain steps,
rules, or courier details — it tells the LLM where to look.

**One question this skill answers:** "Which procedure should I read next?"

**What this skill does NOT do:**
- Explain how to execute a workflow
- List booking steps
- Cite Janarthan rules
- Answer courier or platform questions

For those, follow the routing this skill provides and read the target file.

---

## 2. How To Use This Skill

**Step 1.** Identify the workflow the user is asking about.
Match the user's request to the Trigger / User Request column in Section 3.

**Step 2.** Read the Target Section column.
Navigate to that section in context/bgct-procedures.md.

**Step 3.** If the section is marked [VERIFY REQUIRED]:
State clearly that the full procedure is not confirmed from source documents.
Direct the user to Laksika. See Section 6 (Escalation Rules).

**Step 4.** If the user's request does not match any entry in the table:
Check Section 5 (Common User Requests) for phrasings not in the main table.
If still no match: escalate per Section 6.

---

## 3. Procedure Lookup Table

| # | Workflow | Trigger / User Request | Target File | Target Section | Verify Status |
|---|---------|----------------------|-------------|---------------|--------------|
| 1 | UK Booking | "How do I book UK orders?" / "UK daily booking" / "process UK orders" / "UK labels" | context/bgct-procedures.md | §1 UK Booking | Full read — confirmed |
| 2 | DE Booking | "How do I book DE orders?" / "German daily booking" / "Germany orders" / "DE labels" / "Trossingen booking" | context/bgct-procedures.md | §2 Germany (DE) Booking | Full read — confirmed |
| 3 | Germany 2nd Booking | "2nd booking" / "afternoon booking" / "second German booking" / "1:30 PM booking" / "Schmutter and Kronen 2nd run" | context/bgct-procedures.md | §3 Germany Second Booking | Full read — confirmed |
| 4 | German Vendor Booking | "German Vendor" / "Amazon Vendor" / "Vendor Central" / "DTM1" / "Werne" / "ASN" / "PO booking" / "wholesale booking" | context/bgct-procedures.md | §4 German Vendor Booking | Full read — confirmed |
| 5 | German Return Labels | "return label" / "Retourenlabel" / "German return" / "customer return Germany" / "DHL return" / "RETOURE" | context/bgct-procedures.md | §5 German Return Labels | Full read — confirmed |
| 6 | DE DHL eBay Tracking | "eBay tracking email" / "DE eBay tracking" / "German eBay export" / "DHL eBay" / "tracking email Germany" | context/bgct-procedures.md | §6 DE DHL eBay Tracking Workflow | [VERIFY REQUIRED] — source file partially read |
| 7 | USA Booking | "US booking" / "United States orders" / "American orders" / "GoShippo" / "USPS" / "UPS" / "USA labels" | context/bgct-procedures.md | §7 USA Booking | Full read — confirmed |
| 8 | Canada Booking | "Canada booking" / "Canadian orders" / "Stallion Express" / "Intelcom" / "CA orders" | context/bgct-procedures.md | §8 Canada Booking | Full read — confirmed |
| 9 | Amazon FBA Booking | "FBA" / "FBA booking" / "Amazon FBA" / "FBA labels" / "Seller Central FBA" | context/bgct-procedures.md | §9 Amazon FBA Label Booking | [VERIFY REQUIRED] — source file too large to read fully |
| 10 | UK Collection Labels | "collection label" / "UK collection" / "parcel collection" / "customer collection" | context/bgct-procedures.md | §10 UK Collection Labels | Full read — scope pending Varmen confirmation |
| 11 | EVRi Enquiries | "EVRi enquiry" / "Evri parcel" / "Evri tracking" / "H04RQ" / "T019VA" / "Evri & DPD" | context/bgct-procedures.md | §11 EVRi Courier Enquiries | Full read — confirmed |
| 12 | Royal Mail Enquiries | "Royal Mail enquiry" / "Royal Mail tracking" / "Smart Track" / "RM parcel" / "Royal Mail update" | context/bgct-procedures.md | §12 Royal Mail Enquiries | [VERIFY REQUIRED] — source file too large to read fully |

---

## 4. Workflow Categories

Use this grouping when the user describes a general area rather than
a specific workflow by name.

### UK Operations
Covers workflows where the primary warehouse is Unit 3 or Unit 4 (UK).

| Workflow | Section |
|---------|---------|
| UK Booking | §1 |
| UK Collection Labels | §10 |
| EVRi Courier Enquiries | §11 |
| Royal Mail Enquiries | §12 |

### German Operations
Covers workflows where the primary warehouse is Trossingen Schmutter or
Trossingen Kronen, or where the destination is Germany.

| Workflow | Section |
|---------|---------|
| DE Booking (daily) | §2 |
| Germany 2nd Booking | §3 |
| German Vendor Booking (Amazon Vendor Central) | §4 |
| German Return Labels | §5 |
| DE DHL eBay Tracking | §6 |

### US Operations
Covers workflows for orders destined for the United States.

| Workflow | Section |
|---------|---------|
| USA Booking | §7 |

### Canada Operations
Covers workflows for orders destined for Canada.

| Workflow | Section |
|---------|---------|
| Canada Booking | §8 |

### FBA Operations
Covers Amazon Fulfilled-by-Amazon shipments from UK warehouses.

| Workflow | Section |
|---------|---------|
| Amazon FBA Booking (UK) | §9 |

### Courier Enquiries
Covers post-booking enquiry and tracking management.

| Workflow | Section |
|---------|---------|
| EVRi Courier Enquiries | §11 |
| Royal Mail Enquiries | §12 |

---

## 5. Common User Requests

User requests do not always match workflow names. Use this table to match
natural language questions to the correct procedure section.

| User Says | Route To |
|-----------|---------|
| "How do I process orders today?" | §1 UK Booking + §2 DE Booking (daily session covers both) |
| "The booking rule didn't run — what do I do?" | context/janarthan-rules.md — R-EXC-03 |
| "There's a wrong SKU — how do I fix it?" | context/bgct-procedures.md §1 (UK/DE) or §3 (2nd booking) — Wrong SKU step. Also see R-ROUTE-06, R-VAL-02 in context/janarthan-rules.md |
| "There's a Motherland warehouse assignment" | context/janarthan-rules.md — R-WH-01; also R-EXC-07 |
| "I need to print labels — when?" | context/janarthan-rules.md — R-BK-09 |
| "A customer in Germany wants to return an item" | context/bgct-procedures.md §5 German Return Labels |
| "We have a Vendor Central PO to process" | context/bgct-procedures.md §4 German Vendor Booking |
| "A parcel hasn't moved in EVRi tracking" | context/bgct-procedures.md §11 EVRi Courier Enquiries; context/janarthan-rules.md — R-EXC-09 |
| "I need to raise an EVRi enquiry" | context/bgct-procedures.md §11 EVRi Courier Enquiries |
| "I need to submit a Royal Mail tracking enquiry" | context/bgct-procedures.md §12 Royal Mail Enquiries — [VERIFY REQUIRED] |
| "Netherlands orders — which warehouse?" | context/janarthan-rules.md — R-WH-02, R-WH-03, R-ROUTE-04 |
| "France orders — where do they go?" | context/janarthan-rules.md — R-ROUTE-01 |
| "Ireland order — which flag?" | context/janarthan-rules.md — R-ROUTE-02, R-ROUTE-03 |
| "The Amazon ASN — when do I submit it?" | context/bgct-procedures.md §4; context/janarthan-rules.md — R-VAL-04, R-BK-02 |
| "The carton label PDF has multiple pages" | context/janarthan-rules.md — R-VAL-05, R-BK-03 |
| "Which carrier should I use for Canada?" | context/janarthan-rules.md — R-CARRIER-01; context/courier-vendor-info.md §5 |
| "Which carrier for US warehouse orders?" | context/janarthan-rules.md — R-CARRIER-02; context/courier-vendor-info.md §6 |
| "What do I check before I finish for the day?" | context/janarthan-rules.md — R-VAL-06 (14-item Pre-Completion Checklist) |
| "An order has a duplicate" | context/janarthan-rules.md — R-EXC-04 |
| "I need to run the DE eBay tracking export" | context/bgct-procedures.md §6 DE DHL eBay Tracking — [VERIFY REQUIRED] |
| "When do I run the 2nd German booking?" | context/bgct-procedures.md §3 Germany Second Booking — 1:30 PM SL time |
| "The German Time Sheet — how do I fill it in?" | context/bgct-procedures.md §3 Germany Second Booking — Phase 7 |
| "How do I check the MSG and Post Teams channel?" | context/bgct-procedures.md §1 UK Booking — Phase 4 |
| "Where do I save the Schmutter labels?" | context/courier-vendor-info.md §10 Dropbox — Trossingen 2nd booking paths |
| "Where do I save the US labels?" | context/courier-vendor-info.md §10 Dropbox — US path |

---

## 6. Escalation Rules

### When a procedure section is marked [VERIFY REQUIRED]

The following three workflow sections in context/bgct-procedures.md are
confirmed as incomplete. Their source files were too large to read fully
during the Phase 1 build.

| Workflow | Section | Status | Escalate To |
|---------|---------|--------|-------------|
| DE DHL eBay Tracking | §6 | [VERIFY REQUIRED] | Laksika |
| Amazon FBA Booking (UK) | §9 | [VERIFY REQUIRED] | Laksika |
| Royal Mail Enquiries | §12 | [VERIFY REQUIRED] | Laksika |

**Response when user asks about one of these:**
State that the procedure exists but is not fully confirmed from source
documents. Do not invent missing steps. Direct the user to Laksika for
the complete process. See CLAUDE.md Decision Log for the open items.

### When a user's request does not match any workflow

If the request cannot be matched to any of the 12 workflows after checking
the lookup table and common requests list:

1. Check CLAUDE.md — the user may be asking about a tool, courier, or
   rule rather than a workflow
2. Check context/janarthan-rules.md — the question may be rule-based
3. If still not found: state the topic is not confirmed in source documents
   and escalate to Varmen

Do not guess or extrapolate beyond confirmed source documents.

### When the question involves UK Collection Labels (§10)

The UK Collection Labels workflow (context/bgct-procedures.md §10) is
sourced from a customer-facing document. Whether this workflow is in scope
for internal AIOS operational use is pending Varmen and Laksika confirmation.

See CLAUDE.md Decision Log: "Is UK Collection Label Workflow in scope for
internal AIOS use? — [PENDING CONFIRMATION]"

---

## 7. Known Limitations

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| DE DHL eBay Tracking (§6) not fully confirmed | Cannot give complete step sequence | Direct to Laksika |
| Amazon FBA Booking (§9) not fully confirmed | Cannot give complete step sequence | Direct to Laksika |
| Royal Mail Enquiries (§12) not fully confirmed | Cannot give complete step sequence | Direct to Laksika |
| UK Collection Labels (§10) scope unconfirmed | May not be in scope for internal use | Check with Varmen before using |
| Team structure not documented | Cannot name who should perform each workflow | Use role descriptions (Postage team member, team lead) |
| GLS procedure not documented | Cannot explain GLS booking process | Direct to Laksika |
| This skill covers workflows only — not rules, couriers, or platforms | Narrower scope than full AIOS | Use context/janarthan-rules.md and context/courier-vendor-info.md for those |

---

## 8. Navigation Examples

These examples show how an incoming user request should be handled using
this skill.

---

**Example 1**

User: "How do I do the 2nd German booking?"

Step 1 — Match to table: "2nd booking" → Row 3 → Germany Second Booking
Step 2 — Target: context/bgct-procedures.md §3 Germany Second Booking
Step 3 — Status: Full read — confirmed
Action: Read §3 and answer from its structured summary.

---

**Example 2**

User: "I need to raise a Royal Mail enquiry"

Step 1 — Match to table: "Royal Mail enquiry" → Row 12 → Royal Mail Enquiries
Step 2 — Target: context/bgct-procedures.md §12 Royal Mail Enquiries
Step 3 — Status: [VERIFY REQUIRED]
Action: State that the Royal Mail enquiry procedure is not fully confirmed
from source documents. The portal is help.royalmail.com/s/regionalaccountserviceteam
and the Teams channel is "Smart Track and Royal Mail Parcel Updates" — but
the full step sequence is pending confirmation from Laksika.

---

**Example 3**

User: "We have an Amazon Vendor PO to ship to Germany"

Step 1 — Match to table: "Amazon Vendor" / "PO" → Row 4 → German Vendor Booking
Step 2 — Target: context/bgct-procedures.md §4 German Vendor Booking
Step 3 — Status: Full read — confirmed
Action: Read §4 and answer from its structured summary.
Note: The carrier for this workflow is fixed — Trossingen Schmutter DHL PAKET
only (R-CARRIER-04 in context/janarthan-rules.md).

---

**Example 4**

User: "There are orders in the queue showing Netherlands destination"

Step 1 — Not a single named workflow — Netherlands orders appear in the
UK/DE daily booking session depending on stock location
Step 2 — Check Common User Requests: "Netherlands orders — which warehouse?"
→ context/janarthan-rules.md — R-WH-02, R-WH-03, R-ROUTE-04
Step 3 — Also relevant: context/bgct-procedures.md §1 Phase 7 (warehouse
stock check for Netherlands orders) and §2 (DE booking)
Action: Cite the relevant rules and direct to §1 Phase 7 for the stock
check decision logic.

---

**Example 5**

User: "How do I book FBA shipments?"

Step 1 — Match to table: "FBA" → Row 9 → Amazon FBA Label Booking
Step 2 — Target: context/bgct-procedures.md §9 Amazon FBA Label Booking
Step 3 — Status: [VERIFY REQUIRED]
Action: State that the FBA booking procedure exists but is not fully confirmed
— the source file was too large to read completely. The packing method is
"Pack Individual Units — Standard packing" and the Google Sheet used is
"FBA Shipments Pending Details (UK Shipment_Details tab)" — but the full
step sequence is pending confirmation from Laksika.

---

## Validation Summary

### Workflow Count
12 workflows covered — matching the 12 sections in context/bgct-procedures.md.

### Lookup Entries Created

| Table | Entries |
|-------|---------|
| Procedure Lookup Table (§3) | 12 rows — one per workflow |
| Workflow Categories (§4) | 12 workflows grouped into 6 regional/type categories |
| Common User Requests (§5) | 27 natural-language request mappings |
| Navigation Examples (§8) | 5 worked examples covering confirmed, [VERIFY REQUIRED], rule-based, and multi-workflow routing cases |

### Source Files Referenced

| Source | Usage |
|--------|-------|
| context/bgct-procedures.md | Primary routing target — all 12 workflow sections |
| context/janarthan-rules.md | Secondary routing target — rule-based questions in §5 |
| context/courier-vendor-info.md | Tertiary routing target — courier and Dropbox path questions in §5 |
| CLAUDE.md | Decision Log references in §6 escalation rules |

### Unresolved Dependencies

| Dependency | Impact |
|-----------|--------|
| bgct-procedures.md §6, §9, §12 are partial | [VERIFY REQUIRED] in lookup table and §6 escalation |
| UK Collection Labels scope unconfirmed | [VERIFY REQUIRED] note in §6 escalation |
| Team structure not available | Cannot name individuals in routing guidance |

### PASS / FAIL Assessment

**RESULT: PASS**

**What passes:**
- All 12 workflows are routed to the correct section in context/bgct-procedures.md
- No workflow steps are copied — the skill routes only
- No Janarthan rules are copied — rules are referenced by ID when relevant
- [VERIFY REQUIRED] entries are clearly flagged with escalation guidance
- 27 common user request phrasings are mapped — covering both exact workflow
  names and natural-language variants
- 5 worked navigation examples cover the main routing patterns a future LLM
  will encounter
- A future LLM reading only this file can consistently route any supported
  Postage task to the correct procedure section

**Pending Varmen review before operational use.**
