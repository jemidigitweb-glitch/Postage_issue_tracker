# Migration Audit Report — Staff Issue Data → PostgreSQL

Generated from a full repository scan and direct extraction/analysis of the source data.
No database writes have occurred. This report documents every transformation the
migration applies — nothing described here is a silent correction.

---

## 1. Source Files

**File used for migration:** `postage-daily-issues.html` — the `const ISSUES = [...]` array
inline in its `<script>` tag (92 records).

**Files found during the repository scan but NOT used** (different ID scheme, no
staff-code+per-staff-numbering structure — confirmed by grep, not assumed):

| File(s) | ID scheme | Why excluded |
|---|---|---|
| `intelligence-inbox/daily-issues/*.md` (69 files) | `ISSUE-001`…`ISSUE-075` | No staff-code prefix |
| `intelligence-inbox/daily-issues/atisraj issues/*.md` (20 files) | `A001`…`A020` | Single continuous sequence, not per-staff |
| `intelligence-inbox/document-gaps/gap-*.md` (10 files) | `gap-001`…`gap-010` | Document gaps, not issues |
| `submission-html/js/issues-data.js`, `submission-html/index.html` | `ISSUE-NNN` | Generated copy of the intelligence-inbox set |
| `submission-html/Sasi anna issue/SASI-ISSUE-00[1-6].md` | `SASI-ISSUE-001`…`006` | Different scheme, separate sub-folder |

Confirmed by direct grep: **no `SB-` prefix exists anywhere in the repository.** Per your
confirmation, this was an earlier example and is not being added.

---

## 2. Totals

- **Total staff count: 4**
- **Total issue count: 92**

| Staff Code | Staff Name | Issue Count | First Issue ID | Last Issue ID |
|---|---|---|---|---|
| ND | Nandhi | 45 | ND-001 | ND-045 |
| SA | Sasi | 27 | SA-001 | SA-027 |
| ST | Sathis | 6 | ST-001 | ST-006 |
| NV | Nivarnan | 14 | NV-001 | NV-014 |

(45 + 27 + 6 + 14 = 92 ✓)

---

## 3. Data Quality Findings

- **Duplicate issue IDs:** none. Checked with a synthetic bad-data test (deliberately
  duplicating `ND-001`) to confirm the detection logic actually catches duplicates
  rather than passing vacuously — it does.
- **Missing required fields:** none. All 92 records have `ticketId`, `raisedBy`,
  `dateRaised`, `domain`, `status`, `title`, and `description` populated.
- **Issue ID prefix mismatches:** none. Every `ticketId` prefix maps to exactly one
  staff name, consistently across all records with that prefix.
- **Invalid records (malformed `ticketId`):** none. All 92 IDs match `^[A-Z]{2,3}-\d{3}$`.
- **No gaps in numbering:** ND 1–45, SA 1–27, ST 1–6, NV 1–14 are each fully sequential.
- **Staff name casing:** consistent — exactly 4 distinct names, no case/whitespace variants.

The detection logic for all of the above was stress-tested against a synthetic dataset
containing a deliberate duplicate ID, a prefix mismatch, a malformed ID, and missing
required fields — all four were correctly caught, confirming the checks are real, not
placebo.

---

## 4. Priority Values — Original vs. Normalized

**Original values found in source** (raw strings, with counts):

| Raw value | Count |
|---|---|
| `""` (empty) | 75 |
| `"critical"` | 7 |
| `"medium"` | 5 |
| `"high"` | 2 |
| `"HIGH"` | 1 |
| `"High"` | 1 |
| `"Medium"` | 1 |

**Normalization rule:** trim whitespace, lowercase, empty string → `NULL`.

**Normalized values that will be stored in `issues.priority`:** `critical`, `high`,
`medium`, or `NULL` — never mixed case.

**Records where the normalized value differs from the source (original preserved
in `extra_data.originalPriority`):**

| Issue ID | Raw source value | Normalized value | Preserved as `extra_data.originalPriority` |
|---|---|---|---|
| ND-002 | `"HIGH"` | `high` | `"HIGH"` |
| ND-014 | `"Medium"` | `medium` | `"Medium"` |
| ND-022 | `"High"` | `high` | `"High"` |

All other records either already had lowercase priority or an empty string — in both
cases the normalized value is identical to (or a `NULL`-mapping of) the source, so
**no `originalPriority` is stored for those rows** (storing an identical value would
be redundant, not informative).

---

## 5. Every Transformation Made

| # | Transformation | Applies to | Result differs from source? |
|---|---|---|---|
| 1 | `ticketId` → `issue_id` | all 92 | No — copied verbatim, never renumbered |
| 2 | `ticketId` prefix → `staff_code` | all 92 | No — mechanical split on `-`, e.g. `"ND-001"` → `"ND"` |
| 3 | `raisedBy` → `staff_name` (via `issue_staff`) | all 92 | No — trimmed only; no record's name had leading/trailing whitespace, so this is a no-op on the current data (mechanism verified separately, see below) |
| 4 | `title` → `issue_title` | all 92 | No — direct rename, no value change |
| 5 | `description` → `issue_description` | all 92 | No — direct rename, no value change |
| 6 | `domain` → `category` | all 92 | No — direct rename, no value change |
| 7 | `fix` → `resolution`; empty string → `NULL` | all 92 | Only for the 19 records where `fix` was empty |
| 8 | `priority` → normalized (trim, lowercase, empty → `NULL`) | all 92 | Yes, for the 3 records listed in section 4 |
| 9 | `status` → trimmed, uppercased | all 92 | No — source is already `"RED"` uppercase on every record; mechanism verified separately (see below), no-op on current data |
| 10 | `dateRaised` → `created_date` (validated as `YYYY-MM-DD`) | all 92 | No — every source date already matches that exact format |
| 11 | `member`, `rootCause`, `whatIsHappening`, `documentGap`, `dataLink` → moved into `extra_data` JSONB, key omitted if the source value was empty | all 92 | These fields have no corresponding column in the target schema — this is where they live so no information is lost |
| 12 | `completed_date` | all 92 | No source field exists for this — always `NULL` |

**On items 3 and 9 (no-op transformations):** the migration script implements
generic normalization for staff-name and status specifically because you asked for
this to be handled "where appropriate," even though the *current* source data never
actually triggers a change for either field. I verified the mechanism itself works
(not just that it's silent on clean data) by unit-testing it directly — see the
"transformation mechanism verification" note below. If a future re-import of this
file ever introduces a stray space or a lowercase `"red"`, the original value would
be captured in `extra_data.originalStaffName` / `extra_data.originalStatus`
automatically, the same way `originalPriority` is captured today.

**Fields moved into `extra_data` (complete list, with source presence counts):**

| Source field | Present in | Moves to `extra_data` key |
|---|---|---|
| `member` | 92/92 | `member` |
| `rootCause` | 78/92 | `rootCause` |
| `whatIsHappening` | 64/92 | `whatIsHappening` |
| `documentGap` | 13/92 | `documentGap` |
| `dataLink` | 6/92 | `dataLink` |
| *(conditional)* | 3/92 | `originalPriority` (see section 4) |

---

## 6. Sample Transformed Records

**One issue from each staff member** (first issue in their sequence):

**ND-001** (Nandhi):
```json
{
  "issue_id": "ND-001", "staff_code": "ND",
  "issue_title": "Return Parcel Accumulation Investigation",
  "issue_description": "The following facts are confirmed from the warehouse voice recording, supporting Royal Mail shipping label image, and NotebookLM extraction. No facts have been inferred or added beyond what the source materials confirm. Customers return parcels they no longer want. Returned parcels are sent to the documented return address.",
  "category": "postage", "status": "RED", "priority": null,
  "resolution": "1. Identify the process owner for returned parcel handling. 2. Document the current handling workflow (if one exists informally). 3. Verify what warehouse responsibilities apply to returned parcels. 4. Verify what courier responsibilities apply once a parcel has been returned. 5. Recommend process improvements after investigation is complete. No AIOS update to be made until investigation actions above are completed and findings are confirmed by Varmen or Laksika.",
  "created_date": "2026-06-26", "completed_date": null,
  "extra_data": {
    "member": "vishnusri",
    "rootCause": "The following facts are confirmed from the warehouse voice recording, supporting Royal Mail shipping label image, and NotebookLM extraction. No facts have been inferred or added beyond what the source materials confirm. Customers return parcels they no longer want.",
    "whatIsHappening": "Source: Warehouse voice recording and supporting Royal Mail shipping label image, extracted and summarised via NotebookLM. Summary of NotebookLM findings: The recording and image confirm that returned parcels are physically present in the warehouse in significant volume — approximately three pallets. The return address on the Royal Mail label is consistent with the documented return address used in Postage operations.",
    "documentGap": "gap-001-return-parcel-handling-process.md"
  }
}
```

**SA-001** (Sasi):
```json
{
  "issue_id": "SA-001", "staff_code": "SA",
  "issue_title": "Low Sales Volume for O-Garden Products Imported from Italy",
  "issue_description": "Low sales volume for \"O-Garden\" products imported from Italy despite a 30–40% pricing advantage over Amazon listings.",
  "category": "listing", "status": "RED", "priority": null,
  "resolution": "Investigate the specific account settings for these items, evaluate the listing's \"attractiveness,\" and analyze competitor advertising spend.",
  "created_date": "2026-07-09", "completed_date": null,
  "extra_data": {
    "member": "vishnusri",
    "rootCause": "Pricing is significantly lower than Amazon. Sales volume is less than 10 units in three months.",
    "whatIsHappening": "Products are listed at prices 30–40% lower than those found on Amazon to encourage sales."
  }
}
```

**ST-001** (Sathis):
```json
{
  "issue_id": "ST-001", "staff_code": "ST",
  "issue_title": "No Documented Net Sales Calculation Formula or Cost Component Visibility at Pricing Time",
  "issue_description": "Sales (Amazon, eBay, Shopify, PH, Wayfair) prices listings against a ceiling and floor set by management, using competitor benchmarking data and cost/margin data supplied by the INV team. There is no shared or documented formula for how Finance calculates \"net sales\" or \"negative revenue,\" and Sales does not know, at the time of pricing, which cost components are included or how they are weighted.",
  "category": "pricing", "status": "RED", "priority": null,
  "resolution": "Establish a documented Net Sales Calculation Standard — a fixed formula and full list of cost components (COGS, postage, packaging, platform/referral fees, ad spend, refund/return provision) that Finance, Postage/Packing, and Sales all use consistently, so \"net sales\" means the same thing to everyone. This should be agreed and signed off jointly by Finance, Postage/Packing, and Sales team leaders.",
  "created_date": "2026-07-29", "completed_date": null,
  "extra_data": {
    "member": "vishnusri",
    "rootCause": "There is no shared or documented formula for how \"net sales\" or \"negative revenue\" is calculated at the point a price is set. Sales has full visibility into external, platform-side data (Amazon/eBay/Shopify platform-level cost data, ads data, competitor pricing, search ranking position, Amazon's and eBay's own validated ACOS benchmarks, buyer-facing market movement) but no visibility into internal cost data held outside those platforms — Finance's cost calculations, postage/packaging cost allocation, and how \"net sales\" is derived internally.",
    "whatIsHappening": "Sales prices listings using two inputs provided by management: competitor benchmarking data and cost/margin data from the INV team. Pricing is managed against Amazon's validated ACOS standard of 25–30%, and Sales has held actual ACOS at 19–23% — below that ceiling, by design, to protect margin.",
    "dataLink": "https://varman-aios-hub-varmens.vercel.app/view/hub_pages/sathis-issue-fixes#st-001"
  }
}
```

**NV-001** (Nivarnan):
```json
{
  "issue_id": "NV-001", "staff_code": "NV",
  "issue_title": "FBA cannot send some products because of the parcel cost. If we increase the product price, can FBA send those products? Especially if the full hemp set is out of stock, would it be possible to send the separate combo instead?",
  "issue_description": "FBA cannot send some products because of the parcel cost. If we increase the product price, can FBA send those products? Especially if the full hemp set is out of stock, would it be possible to send the separate combo instead?",
  "category": "ph", "status": "RED", "priority": "high",
  "resolution": null,
  "created_date": "2026-07-08", "completed_date": null,
  "extra_data": { "member": "vishnusri" }
}
```

### Complete transformed record for SA-007

```json
{
  "issue_id": "SA-007",
  "staff_code": "SA",
  "issue_title": "Product Allocation Communication Gap with Mano",
  "issue_description": "Communication between Mano and the team regarding the allocation and sharing of new products needs improvement.",
  "category": "listing",
  "status": "RED",
  "priority": null,
  "resolution": "Establish a clear, consistent channel or process for Mano to communicate new product allocation and sharing to the team as soon as it is confirmed.",
  "created_date": "2026-07-29",
  "completed_date": null,
  "extra_data": {
    "member": "vishnusri",
    "rootCause": "The team has flagged a recurring communication gap specifically between Mano and the team on new product allocation and sharing.",
    "whatIsHappening": "Not Available in the Evidence — the current handover process between Mano and the team for new product allocation is not described in detail."
  }
}
```

No passwords, credentials, or confidential data appear in any of the above — this
project's source data does not contain any.

---

## 7. Conflict Handling Model (implemented in `migrate-issues.js`)

`ON CONFLICT DO NOTHING` was deliberately **not used**, because it would silently
accept whatever is already in the database even if it's a *different* record under
the same ID. Instead, every `staff_code` / `issue_id` is checked individually against
any existing row before any write happens:

- **No existing row** → queued for `INSERT`.
- **Existing row's fields are identical to the transformed local record** → treated
  as "already migrated," skipped (not re-inserted, not an error).
- **Existing row differs in any field** → treated as a **conflict**. Nothing is
  inserted or overwritten for that record, and — critically — **the entire
  transaction is rolled back**, not just that one row skipped.

This was verified with isolated unit tests (no database involved) covering all three
outcomes for both `issue_staff` and `issues`, including the edge case that
PostgreSQL returns `DATE` columns as JS `Date` objects rather than strings (the
comparison logic normalizes this correctly rather than producing a false conflict).

Since `issue_tracking.issue_staff` / `issue_tracking.issues` do not currently exist in
the target database (confirmed via read-only schema inspection), every record is
expected to classify as `insert` on the first real run — there is nothing to conflict
with yet.
