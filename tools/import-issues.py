#!/usr/bin/env python3
"""
AIOS — Daily Issue Importer
============================
Modes:
  python3 tools/import-issues.py                        → report only, no files changed
  python3 tools/import-issues.py --generate             → report + generate issues-data.js
  python3 tools/import-issues.py --apply                → generate + patch index.html with new rows
  python3 tools/import-issues.py --repair-evidence NNN  → repair evidence for an already-imported issue
  python3 tools/import-issues.py --refresh-issue NNN   → refresh all source fields for an already-imported issue

Safety rules enforced:
  - Duplicate checking by Issue ID (ISSUE-NNN pattern in filename)
  - Required field validation before any issue is accepted
  - Evidence path existence verified before mapping
  - Document Gap file existence verified if declared
  - No invented values — missing fields are left blank/unverified
  - Idempotent: running twice produces the same result

Run from the project root (postage-aios/).
"""

import json
import os
import re
import sys
import tempfile
import html as html_module
from urllib.parse import unquote

# ── Paths ─────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX_DIR    = os.path.join(PROJECT_ROOT, "intelligence-inbox", "daily-issues")
GAPS_DIR     = os.path.join(PROJECT_ROOT, "intelligence-inbox", "document-gaps")
DASHBOARD    = os.path.join(PROJECT_ROOT, "submission-html", "index.html")
DATA_JS      = os.path.join(PROJECT_ROOT, "submission-html", "js", "issues-data.js")
PHASE2_DIR   = os.path.join(PROJECT_ROOT, "submission-html", "Phase2-inputs")

# ── Structured field keys to extract from ** Field:** value lines ──────────
FIELD_KEYS = {
    "issue id":       "id",
    "date logged":    "date",
    "domain":         "domain",
    "priority":       "priority",
    "status":         "status",
    "owner":          "owner",
    "sku":            "sku",
    "document gap":   "gap_file",
}

# ── Required fields for an issue to be accepted ───────────────────────────
REQUIRED = ["id", "date", "domain"]

# ── Accepted Markdown heading aliases for parsed dashboard content fields ──
# Centralised here so parse_issue_md() and warn_issue_content() share one truth.
# Adding a new alias here automatically expands both parsing and warning output.
WHAT_HEADINGS = [
    "## Issue Summary",
    "## What is Happening",
    "## What Is Happening",
]

FIX_HEADINGS = [
    "## Fix and Action Required",
    "## Fix & Action Required",
    "## Fix / Action Required",
    "## Proposed Fix",
    "## Recommended Next Actions",
    "## Recommended Investigation / Actions",
]


# ── Helpers ───────────────────────────────────────────────────────────────

def extract_issue_number(filename):
    """Return zero-padded 3-digit number from 'issue-NNN-*.md', or None."""
    m = re.match(r"issue-(\d+)-", filename)
    return m.group(1).zfill(3) if m else None


def parse_issue_md(path):
    """
    Parse structured fields from a daily issue Markdown file.
    Returns a dict with at minimum: id, title, what, fix, date, domain.
    Missing fields are set to "".
    """
    with open(path, encoding="utf-8") as f:
        content = f.read()
        lines   = content.splitlines()

    issue = {
        "id": "", "date": "", "domain": "", "priority": "",
        "status": "", "owner": "", "sku": "", "gap_file": "",
        "title": "", "what": "", "fix": "",
        "evidence_paths": [],
    }

    # Extract **Field:** value pairs
    for line in lines:
        m = re.match(r"\*\*([^*]+)\*\*\s*(.+)", line)
        if m:
            key_raw = m.group(1).strip().rstrip(":").lower()
            val     = m.group(2).strip()
            mapped  = FIELD_KEYS.get(key_raw)
            if mapped:
                issue[mapped] = val

    # Extract title from H1
    for line in lines:
        if line.startswith("# "):
            issue["title"] = line[2:].strip()
            break

    # Extract "What is happening" / Issue Summary section
    issue["what"] = _extract_section(content, WHAT_HEADINGS)

    # Extract Fix section
    issue["fix"] = _extract_section(content, FIX_HEADINGS)

    # Parse evidence paths from the ## Evidence section.
    # Targets lines of the form:  - `Phase2-inputs/path/to/file.ext`
    # Paths are URL-encoded in the MD; unquote() restores the filesystem name.
    evidence_block = _extract_raw_section(content, ["## Evidence"])
    for line in evidence_block.splitlines():
        m = re.match(r"\s*-\s+`(Phase2-inputs/[^`]+)`", line)
        if m:
            url_path = m.group(1)
            fs_rel   = unquote(url_path)
            abs_path = os.path.join(PROJECT_ROOT, "submission-html", fs_rel)
            issue["evidence_paths"].append(abs_path)

    # Normalise priority to lowercase, remove TBD as a real priority level
    p = issue["priority"].lower()
    if p in ("tbd", "unknown", ""):
        issue["priority"] = ""
    else:
        issue["priority"] = p.split()[0]  # "High" → "high", "Critical — ..." → "critical"

    # Normalise status
    s = issue["status"].lower()
    if "investigation" in s:
        issue["status"] = "investigation"
    elif "resolved" in s:
        issue["status"] = "resolved"
    else:
        issue["status"] = "investigation"  # safe default for open issues

    # Normalise domain to lowercase, first word
    issue["domain"] = issue["domain"].lower().split()[0] if issue["domain"] else ""

    return issue


def _extract_section(content, headings):
    """Extract paragraph text under the first matching heading."""
    for heading in headings:
        idx = content.find(heading)
        if idx == -1:
            continue
        # Take text up to the next ## heading or end of file
        rest = content[idx + len(heading):]
        m = re.search(r"\n## ", rest)
        block = rest[:m.start()] if m else rest
        # Clean up: remove Markdown formatting, collapse whitespace
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", block)  # bold
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # links
        text = re.sub(r"^[-*>#|]+", "", text, flags=re.MULTILINE).strip()
        # Take first meaningful paragraph
        paras = [p.strip() for p in text.split("\n\n") if p.strip() and not p.strip().startswith("|")]
        return paras[0][:600] if paras else ""
    return ""


def _extract_raw_section(content, headings):
    """Return raw (unprocessed) text block under the first matching heading, or ''."""
    for heading in headings:
        idx = content.find(heading)
        if idx == -1:
            continue
        rest = content[idx + len(heading):]
        m = re.search(r"\n## ", rest)
        return rest[:m.start()] if m else rest
    return ""


def validate_issue(issue, fname, gaps_dir):
    """Return list of validation errors. Empty list = valid."""
    errors = []
    for f in REQUIRED:
        if not issue.get(f):
            errors.append(f"Missing required field: {f}")

    # Validate domain is a known value
    allowed_domains = {"postage", "listing", "purchase", "pricing"}
    if issue.get("domain") and issue["domain"] not in allowed_domains:
        errors.append(f"Unknown domain: '{issue['domain']}' (allowed: {', '.join(sorted(allowed_domains))})")

    # Validate gap file exists if declared
    gap_file = issue.get("gap_file", "")
    if gap_file and gap_file.lower() not in ("", "none", "—", "-"):
        gap_path = os.path.join(gaps_dir, gap_file)
        if not os.path.exists(gap_path):
            errors.append(f"Declared gap file not found: {gap_file}")

    # Validate evidence paths exist
    for ep in issue.get("evidence_paths", []):
        if not os.path.exists(ep):
            errors.append(f"Evidence path not found: {ep}")

    return errors


def warn_issue_content(issue, filename, content):
    """
    Emit non-blocking content-completeness warnings when important dashboard
    fields are empty after parsing.

    A warning indicates a likely heading mismatch: the source MD may contain
    the content under a heading not in the accepted alias list (WHAT_HEADINGS
    or FIX_HEADINGS). The warning reports which field is empty, the accepted
    aliases, and all H2 headings found in the source for diagnosis.

    Does NOT parse field content independently.
    Does NOT populate any issue field.
    Does NOT block import (validate_issue() remains the blocking validator).
    Returns a list of warning strings (also printed to stdout).
    """
    issue_label = issue.get("id") or filename
    warnings    = []

    # Discover H2 headings in source — diagnostic only, not used for parsing
    h2_in_md = [ln.strip() for ln in content.splitlines() if ln.startswith("## ")]

    checks = [
        ("what", WHAT_HEADINGS),
        ("fix",  FIX_HEADINGS),
    ]

    for field, accepted in checks:
        if not issue.get(field):
            unmatched = [h for h in h2_in_md if h not in accepted]
            lines = [
                f"  WARN [{issue_label}] '{field}' field is empty after parsing.",
                f"    Accepted headings for '{field}':",
            ]
            for alias in accepted:
                lines.append(f"      {alias}")
            lines.append(f"    H2 headings found in source MD ({len(h2_in_md)}):")
            for h in h2_in_md:
                marker = "  ← not in accepted list" if h not in accepted else ""
                lines.append(f"      {h}{marker}")
            if unmatched:
                lines.append(
                    f"    Action: rename the relevant heading to a canonical alias, "
                    f"or add a new alias to FIX_HEADINGS / WHAT_HEADINGS."
                )
            msg = "\n".join(lines)
            warnings.append(msg)
            print(msg)

    return warnings


def get_dashboard_issue_ids():
    """Return set of zero-padded 3-digit issue numbers already in index.html."""
    if not os.path.isfile(DASHBOARD):
        return set()
    html = open(DASHBOARD, encoding="utf-8").read()
    found = re.findall(r"ISSUE-(\d+)", html, re.IGNORECASE)
    return {n.zfill(3) for n in found}


def build_gap_display(gap_file):
    """Return (gap_label, gap_class) for dashboard rendering."""
    if not gap_file or gap_file.lower() in ("", "none", "—", "-"):
        return ("—", "gap-none")
    m = re.search(r"gap-(\d+)", gap_file, re.IGNORECASE)
    if m:
        label = f"Gap-{m.group(1).zfill(3)}"
        return (label, "gap-ref")
    return ("—", "gap-none")


def build_priority_badge(priority):
    """Return HTML badge string for priority."""
    p = (priority or "").lower()
    if p == "critical":
        return '<span class="badge badge-critical">Critical</span>'
    if p == "high":
        return '<span class="badge badge-high">High</span>'
    if p == "medium":
        return '<span class="badge badge-medium">Medium</span>'
    return '<span class="badge badge-tbd">TBD</span>'


def build_evidence_html(evidence_paths):
    """Return HTML for the evidence column."""
    if not evidence_paths:
        return '<span class="evidence-none">No Evidence Available</span>'
    imgs = []
    for ep in evidence_paths:
        # Convert absolute path to relative src from submission-html/
        rel = os.path.relpath(ep, os.path.join(PROJECT_ROOT, "submission-html"))
        # URL-encode spaces
        url = rel.replace(" ", "%20")
        issue_id = "ISSUE-???"  # placeholder — caller should pass
        imgs.append(
            f'<a href="{url}" target="_blank" class="evidence-link">'
            f'<img src="{url}" class="evidence-thumb" alt="evidence image" loading="lazy">'
            f'</a>'
        )
    return '<div class="evidence-gallery">' + "".join(imgs) + "</div>"


def build_row_html(issue):
    """Build the complete <tr> HTML for an issue."""
    esc = html_module.escape
    issue_id = "ISSUE-" + issue["id"].lstrip("ISSUE-").lstrip("-")
    if not issue_id.startswith("ISSUE-"):
        issue_id = issue["id"]  # use as-is if already formatted

    gap_label, gap_class = build_gap_display(issue.get("gap_file", ""))
    priority_badge       = build_priority_badge(issue.get("priority", ""))
    evidence_html        = build_evidence_html(issue.get("evidence_paths", []))

    # Normalise data-priority attribute (empty string if TBD)
    data_priority = (issue.get("priority") or "").lower()
    if data_priority in ("tbd", "unknown"):
        data_priority = ""

    data_domain = esc(issue.get("domain", ""))
    data_status = esc(issue.get("status", "investigation"))
    title       = esc(issue.get("title", issue_id))
    what        = esc(issue.get("what", ""))
    fix         = esc(issue.get("fix", ""))
    owner       = esc(issue.get("owner", "—"))
    date_val    = esc(issue.get("date", "—"))

    res_html = (
        f'<div class="resolution-group" data-issue="{issue_id}">'
        f'<button class="res-btn res-solved" data-value="solved" aria-pressed="false">'
        f'<span class="res-icon">&#x2610;</span> Solved</button>'
        f'<button class="res-btn res-not" data-value="not-solved" aria-pressed="false">'
        f'<span class="res-icon">&#x2610;</span> Not Solved</button>'
        f'</div>'
    )

    return (
        f'\n                <!-- {issue_id} -->\n'
        f'                <tr data-classification="daily-issue" data-domain="{data_domain}"'
        f' data-priority="{data_priority}" data-status="{data_status}">\n'
        f'                  <td class="col-date">{date_val}</td>\n'
        f'                  <td class="col-id"><span class="issue-id-badge">{issue_id}</span></td>\n'
        f'                  <td class="col-priority">{priority_badge}</td>\n'
        f'                  <td class="col-issue"><strong>{issue_id} — {title}</strong></td>\n'
        f'                  <td class="col-what">{what}</td>\n'
        f'                  <td class="col-gap"><span class="{gap_class}">{gap_label}</span></td>\n'
        f'                  <td class="col-fix"><p class="fix-text">{fix}</p></td>\n'
        f'                  <td class="col-owner"><span class="owner-tag">&#128100; {owner}</span></td>\n'
        f'                  <td class="col-solved">{res_html}</td>\n'
        f'                  <td class="col-evidence">{evidence_html}</td>\n'
        f'                </tr>'
    )


def build_js_entry(issue):
    """Return a JS object literal string for issues-data.js."""
    issue_id = "ISSUE-" + re.sub(r"^ISSUE-?", "", issue["id"], flags=re.IGNORECASE).zfill(3)

    gap_label, _ = build_gap_display(issue.get("gap_file", ""))
    priority_b    = build_priority_badge(issue.get("priority", ""))
    evidence_html = build_evidence_html(issue.get("evidence_paths", []))
    data_priority = (issue.get("priority") or "").lower()
    if data_priority in ("tbd", "unknown"):
        data_priority = ""

    def jstr(s):
        return json.dumps(s or "")

    lines = [
        "  {",
        f"    id:            {jstr(issue_id)},",
        f"    date:          {jstr(issue.get('date', '—'))},",
        f"    domain:        {jstr(issue.get('domain', ''))},",
        f"    priority:      {jstr(data_priority)},",
        f"    status:        {jstr(issue.get('status', 'investigation'))},",
        f"    title:         {jstr(issue.get('title', ''))},",
        f"    what:          {jstr(issue.get('what', ''))},",
        f"    gapLabel:      {jstr(gap_label)},",
        f"    gapClass:      {jstr(('gap-ref' if gap_label != '—' else 'gap-none'))},",
        f"    fix:           {jstr(issue.get('fix', ''))},",
        f"    owner:         {jstr(issue.get('owner', '—'))},",
        f"    priorityBadge: {jstr(priority_b)},",
        f"    evidenceHtml:  {jstr(evidence_html)},",
        "  }",
    ]
    return "\n".join(lines)


def generate_data_js(new_issues):
    """Write submission-html/js/issues-data.js from a list of parsed issue dicts."""
    entries = [build_js_entry(i) for i in new_issues]
    content = (
        "/* AIOS Issues Data — generated by tools/import-issues.py */\n"
        "/* Source: intelligence-inbox/daily-issues/               */\n"
        "/* DO NOT EDIT MANUALLY — re-run tools/import-issues.py   */\n"
        "window.AIOS_ISSUES_DATA = [\n"
        + ",\n".join(entries) + "\n"
        "];\n"
    )
    os.makedirs(os.path.dirname(DATA_JS), exist_ok=True)
    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✓  Generated: {os.path.relpath(DATA_JS, PROJECT_ROOT)}")


def patch_index_html(new_issues):
    """Inject validated <tr> rows into the issues tbody of index.html."""
    with open(DASHBOARD, encoding="utf-8") as f:
        html = f.read()

    # Find the issues tbody closing tag — use the unique pattern
    TBODY_CLOSE = "              </tbody>\n            </table>"
    if TBODY_CLOSE not in html:
        print("  ERROR: Cannot find issues tbody — index.html structure may have changed.", file=sys.stderr)
        return False

    inserted = []
    for issue in new_issues:
        row_html = build_row_html(issue)
        html = html.replace(TBODY_CLOSE, row_html + "\n" + TBODY_CLOSE, 1)
        issue_id = "ISSUE-" + re.sub(r"^ISSUE-?", "", issue["id"], flags=re.IGNORECASE).zfill(3)
        inserted.append(issue_id)
        print(f"  ✓  Patched index.html: inserted {issue_id}")

    with open(DASHBOARD, "w", encoding="utf-8") as f:
        f.write(html)

    return True


def get_inbox_issues():
    """Return sorted list of (num, filename, path) from the inbox."""
    issues = []
    for fname in sorted(os.listdir(INBOX_DIR)):
        if not fname.endswith(".md"):
            continue
        num = extract_issue_number(fname)
        if num is None:
            print(f"  SKIP (no issue number in filename): {fname}")
            continue
        issues.append((num, fname, os.path.join(INBOX_DIR, fname)))
    return issues


# ── Evidence repair ───────────────────────────────────────────────────────

def repair_evidence(issue_ref):
    """
    Repair the evidence display for an already-imported issue.

    Accepts: ISSUE-019 | issue-019 | 019 | 19
    Uses existing parse_issue_md(), validate_issue(), build_evidence_html().
    Writes are atomic (tempfile + os.replace()). Idempotent.
    Exits with code 1 on any safety check failure.
    """
    # Normalize to 3-digit zero-padded number
    digits = re.sub(r"\D", "", str(issue_ref))
    if not digits:
        print(f"ERROR: Cannot parse issue number from '{issue_ref}'.", file=sys.stderr)
        sys.exit(1)
    num      = digits.zfill(3)
    issue_id = f"ISSUE-{num}"

    print("=" * 62)
    print(f"AIOS — Evidence Repair: {issue_id}")
    print("=" * 62)

    # 1. Find exactly one MD file for this issue number
    matches = [
        os.path.join(INBOX_DIR, fname)
        for fname in sorted(os.listdir(INBOX_DIR))
        if fname.endswith(".md") and extract_issue_number(fname) == num
    ]
    if len(matches) == 0:
        print(f"ERROR: No MD file found for {issue_id} in intelligence-inbox/daily-issues/.", file=sys.stderr)
        sys.exit(1)
    if len(matches) > 1:
        print(f"ERROR: Multiple MD files found for {issue_id}: {matches}", file=sys.stderr)
        sys.exit(1)

    md_path = matches[0]
    print(f"  Source MD: {os.path.relpath(md_path, PROJECT_ROOT)}")

    # 2. Parse and validate — no second parser, no invented values
    issue  = parse_issue_md(md_path)
    errors = validate_issue(issue, os.path.basename(md_path), GAPS_DIR)
    if errors:
        print(f"ERROR: {issue_id} failed validation:", file=sys.stderr)
        for e in errors:
            print(f"  ✗  {e}", file=sys.stderr)
        sys.exit(1)

    # 3. Confirm the parsed Issue ID matches what was requested
    parsed_num = re.sub(r"^ISSUE-?", "", issue.get("id", ""), flags=re.IGNORECASE).zfill(3)
    if parsed_num != num:
        print(
            f"ERROR: MD file declares Issue ID '{issue.get('id')}' "
            f"but '{issue_id}' was requested.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"  Evidence paths found: {len(issue['evidence_paths'])}")
    for ep in issue["evidence_paths"]:
        print(f"    {os.path.relpath(ep, PROJECT_ROOT)}")

    # 4. Build new evidence HTML — no second gallery builder
    new_ev_html = build_evidence_html(issue["evidence_paths"])

    # ── Repair index.html ───────────────────────────────────────────
    with open(DASHBOARD, encoding="utf-8") as f:
        html_content = f.read()

    comment_marker = f"<!-- {issue_id} -->"
    count = html_content.count(comment_marker)
    if count == 0:
        print(
            f"ERROR: '{comment_marker}' not found in index.html. "
            f"Is {issue_id} imported?",
            file=sys.stderr,
        )
        sys.exit(1)
    if count > 1:
        print(
            f"ERROR: '{comment_marker}' appears {count} times in index.html (expected 1).",
            file=sys.stderr,
        )
        sys.exit(1)

    # Scope to the row block only — from the comment to the closing </tr>
    comment_pos = html_content.index(comment_marker)
    tr_end_pos  = html_content.index("</tr>", comment_pos)
    row_block   = html_content[comment_pos : tr_end_pos + 5]

    ev_td_m = re.search(r'(<td class="col-evidence">)(.*?)(</td>)', row_block, re.DOTALL)
    if not ev_td_m:
        print(f"ERROR: col-evidence td not found in {issue_id} row.", file=sys.stderr)
        sys.exit(1)

    html_changed = False
    if ev_td_m.group(2) == new_ev_html:
        print(f"  index.html: {issue_id} evidence already correct — no change.")
    else:
        new_row  = row_block[: ev_td_m.start(2)] + new_ev_html + row_block[ev_td_m.end(2) :]
        new_html = html_content[:comment_pos] + new_row + html_content[comment_pos + len(row_block) :]
        html_dir = os.path.dirname(DASHBOARD)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=html_dir, suffix=".tmp", delete=False) as tf:
            tf.write(new_html)
            tmp_path = tf.name
        os.replace(tmp_path, DASHBOARD)
        print(f"  ✓  index.html: {issue_id} col-evidence updated.")
        html_changed = True

    # ── Repair issues-data.js if entry exists ───────────────────────
    with open(DATA_JS, encoding="utf-8") as f:
        js_content = f.read()

    # Locate this issue's entry block by its id: "ISSUE-NNN" key
    id_pattern  = r"id:\s+" + re.escape(json.dumps(issue_id))
    id_match    = re.search(id_pattern, js_content)
    js_changed  = False

    if not id_match:
        print(f"  issues-data.js: no entry for {issue_id} — skipping.")
    else:
        entry_slice = js_content[id_match.start():]
        ev_js_m = re.search(
            r"(evidenceHtml:\s+)(\"(?:[^\"\\]|\\.)*\")(,?\s*\n)",
            entry_slice,
        )
        if not ev_js_m:
            print(
                f"  WARNING: evidenceHtml field not found in issues-data.js entry for {issue_id}.",
                file=sys.stderr,
            )
        else:
            # Absolute positions in js_content
            g2_start  = id_match.start() + ev_js_m.start(2)
            g2_end    = id_match.start() + ev_js_m.end(2)
            new_ev_js = json.dumps(new_ev_html)

            if js_content[g2_start:g2_end] == new_ev_js:
                print(f"  issues-data.js: {issue_id} evidenceHtml already correct — no change.")
            else:
                new_js = js_content[:g2_start] + new_ev_js + js_content[g2_end:]
                js_dir = os.path.dirname(DATA_JS)
                with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=js_dir, suffix=".tmp", delete=False) as tf:
                    tf.write(new_js)
                    tmp_js_path = tf.name
                os.replace(tmp_js_path, DATA_JS)
                print(f"  ✓  issues-data.js: {issue_id} evidenceHtml updated.")
                js_changed = True

    print()
    if html_changed or js_changed:
        changed = []
        if html_changed:
            changed.append("index.html")
        if js_changed:
            changed.append("issues-data.js")
        print(f"Repair complete. Files modified: {', '.join(changed)}")
    else:
        print(f"Repair complete. {issue_id} evidence was already correct — no files modified.")

    print("=" * 62)


def refresh_issue(issue_ref):
    """
    Refresh all source fields for an already-imported issue.

    Accepts: ISSUE-023 | issue-023 | 023 | 23
    Replaces the complete existing row in index.html and the complete
    existing entry in issues-data.js with the canonical output of
    build_row_html() and build_js_entry(), both driven by parse_issue_md().
    Writes are atomic (tempfile + os.replace()). Idempotent.
    Exits with code 1 on any safety check failure.
    """
    # Normalise to 3-digit zero-padded number — reuse repair_evidence pattern
    digits = re.sub(r"\D", "", str(issue_ref))
    if not digits:
        print(f"ERROR: Cannot parse issue number from '{issue_ref}'.", file=sys.stderr)
        sys.exit(1)
    num      = digits.zfill(3)
    issue_id = f"ISSUE-{num}"

    print("=" * 62)
    print(f"AIOS — Issue Refresh: {issue_id}")
    print("=" * 62)

    # 1. Find exactly one MD file for this issue number
    matches = [
        os.path.join(INBOX_DIR, fname)
        for fname in sorted(os.listdir(INBOX_DIR))
        if fname.endswith(".md") and extract_issue_number(fname) == num
    ]
    if len(matches) == 0:
        print(f"ERROR: No MD file found for {issue_id} in intelligence-inbox/daily-issues/.", file=sys.stderr)
        sys.exit(1)
    if len(matches) > 1:
        print(f"ERROR: Multiple MD files found for {issue_id}: {matches}", file=sys.stderr)
        sys.exit(1)

    md_path = matches[0]
    print(f"  Source MD: {os.path.relpath(md_path, PROJECT_ROOT)}")

    # 2. Parse using existing parser — no second parser
    issue = parse_issue_md(md_path)

    # 3. Confirm parsed ID matches requested ID
    parsed_num = re.sub(r"^ISSUE-?", "", issue.get("id", ""), flags=re.IGNORECASE).zfill(3)
    if parsed_num != num:
        print(
            f"ERROR: MD file declares Issue ID '{issue.get('id')}' "
            f"but '{issue_id}' was requested.",
            file=sys.stderr,
        )
        sys.exit(1)

    # 4. Validate using existing validator — fail hard on any error
    errors = validate_issue(issue, os.path.basename(md_path), GAPS_DIR)
    if errors:
        print(f"ERROR: {issue_id} failed validation:", file=sys.stderr)
        for e in errors:
            print(f"  ✗  {e}", file=sys.stderr)
        sys.exit(1)
    print(f"  Validation: 0 errors")
    print(f"  Evidence paths: {len(issue['evidence_paths'])}")

    # 4b. Content-completeness warnings — non-blocking, emitted before any write
    with open(md_path, encoding="utf-8") as _f:
        _md_content = _f.read()
    warn_issue_content(issue, os.path.basename(md_path), _md_content)

    # 5. Build canonical row and JS entry using existing builders — no second builders
    new_row   = build_row_html(issue)    # complete <tr> block
    new_entry = build_js_entry(issue)    # complete JS object literal

    # ── Refresh index.html ─────────────────────────────────────────────
    with open(DASHBOARD, encoding="utf-8") as f:
        html_content = f.read()

    comment_marker = f"<!-- {issue_id} -->"
    count = html_content.count(comment_marker)
    if count == 0:
        print(
            f"ERROR: '{comment_marker}' not found in index.html. "
            f"Is {issue_id} imported?",
            file=sys.stderr,
        )
        sys.exit(1)
    if count > 1:
        print(
            f"ERROR: '{comment_marker}' appears {count} times in index.html (expected 1).",
            file=sys.stderr,
        )
        sys.exit(1)

    comment_pos = html_content.index(comment_marker)
    # Walk back to the \n immediately before the comment's leading spaces
    block_start = html_content.rindex('\n', 0, comment_pos)
    tr_end_pos  = html_content.index("</tr>", comment_pos) + 5
    old_row     = html_content[block_start:tr_end_pos]

    html_changed = False
    if old_row == new_row:
        print(f"  index.html: {issue_id} row already current — no change.")
    else:
        new_html = html_content[:block_start] + new_row + html_content[tr_end_pos:]
        html_dir = os.path.dirname(DASHBOARD)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=html_dir, suffix=".tmp", delete=False) as tf:
            tf.write(new_html)
            tmp_html_path = tf.name
        os.replace(tmp_html_path, DASHBOARD)
        print(f"  ✓  index.html: {issue_id} row refreshed.")
        html_changed = True

    # ── Refresh issues-data.js if entry exists ─────────────────────────
    with open(DATA_JS, encoding="utf-8") as f:
        js_content = f.read()

    id_pattern = r"id:\s+" + re.escape(json.dumps(issue_id))
    all_matches = list(re.finditer(id_pattern, js_content))
    js_changed  = False

    if len(all_matches) == 0:
        print(f"  issues-data.js: no entry for {issue_id} — skipping.")
    elif len(all_matches) > 1:
        print(
            f"ERROR: {issue_id} appears {len(all_matches)} times in issues-data.js (expected 1).",
            file=sys.stderr,
        )
        sys.exit(1)
    else:
        id_match    = all_matches[0]
        entry_start = js_content.rindex("  {", 0, id_match.start())
        entry_end   = js_content.index("  }", id_match.start()) + 3
        old_entry   = js_content[entry_start:entry_end]

        if old_entry == new_entry:
            print(f"  issues-data.js: {issue_id} entry already current — no change.")
        else:
            new_js  = js_content[:entry_start] + new_entry + js_content[entry_end:]
            js_dir  = os.path.dirname(DATA_JS)
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=js_dir, suffix=".tmp", delete=False) as tf:
                tf.write(new_js)
                tmp_js_path = tf.name
            os.replace(tmp_js_path, DATA_JS)
            print(f"  ✓  issues-data.js: {issue_id} entry refreshed.")
            js_changed = True

    print()
    if html_changed or js_changed:
        changed = []
        if html_changed:
            changed.append("index.html")
        if js_changed:
            changed.append("issues-data.js")
        print(f"Refresh complete. Files modified: {', '.join(changed)}")
    else:
        print(f"Refresh complete. {issue_id} was already current — no files modified.")

    print("=" * 62)


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    mode_generate = "--generate" in sys.argv or "--apply" in sys.argv
    mode_apply    = "--apply"    in sys.argv

    print("=" * 62)
    print("AIOS — Daily Issue Importer")
    print("=" * 62)
    if mode_apply:
        print("Mode: APPLY (generate issues-data.js + patch index.html)")
    elif mode_generate:
        print("Mode: GENERATE (generate issues-data.js only)")
    else:
        print("Mode: REPORT ONLY (no files modified)")
    print()

    inbox_issues  = get_inbox_issues()
    dashboard_ids = get_dashboard_issue_ids()

    print(f"Inbox:     {len(inbox_issues)} issue file(s) found")
    print(f"Dashboard: {len(dashboard_ids)} issue ID(s) already present")
    print()

    already_present = []
    new_issues_raw  = []

    for num, fname, path in inbox_issues:
        if num in dashboard_ids:
            already_present.append((num, fname))
        else:
            new_issues_raw.append((num, fname, path))

    # ── Already present ─────────────────────────────────────────────
    print(f"Already in dashboard ({len(already_present)}):")
    for num, fname in already_present:
        print(f"  ✓  ISSUE-{num}  {fname}")
    if not already_present:
        print("  (none)")
    print()

    # ── New issues — parse and validate ─────────────────────────────
    print(f"New issues found ({len(new_issues_raw)}):")
    validated = []
    rejected  = []

    for num, fname, path in new_issues_raw:
        issue  = parse_issue_md(path)
        errors = validate_issue(issue, fname, GAPS_DIR)

        if not issue["id"]:
            issue["id"] = f"ISSUE-{num}"  # fallback to filename number

        print(f"\n  + ISSUE-{num}  {fname}")
        print(f"    Title:    {issue.get('title', '(not found)')[:80]}")
        print(f"    Date:     {issue.get('date', '—')}")
        print(f"    Domain:   {issue.get('domain', '—')}")
        print(f"    Priority: {issue.get('priority') or 'TBD'}")
        print(f"    Owner:    {issue.get('owner', '—')}")
        print(f"    Gap file: {issue.get('gap_file', '—')}")
        print(f"    Evidence: {issue.get('evidence_paths', [])}")

        if errors:
            print(f"    VALIDATION ERRORS:")
            for e in errors:
                print(f"      ✗  {e}")
            rejected.append((num, fname, errors))
        else:
            print(f"    Validation: PASS")
            # Content-completeness warnings — non-blocking, before any write
            with open(path, encoding="utf-8") as _f:
                _md_content = _f.read()
            warn_issue_content(issue, fname, _md_content)
            validated.append(issue)

    if not new_issues_raw:
        print("  (none — dashboard is up to date)")

    print()

    # ── Summary ─────────────────────────────────────────────────────
    print(f"Validated:  {len(validated)} new issue(s) ready")
    print(f"Rejected:   {len(rejected)} issue(s) failed validation")
    if rejected:
        for num, fname, errs in rejected:
            print(f"  ✗  ISSUE-{num}: {'; '.join(errs)}")
    print()

    # ── Generate / Apply ────────────────────────────────────────────
    if not validated:
        print("Nothing to generate or apply.")
    elif mode_generate or mode_apply:
        print("Generating issues-data.js ...")
        generate_data_js(validated)

        if mode_apply:
            print("Patching index.html ...")
            patch_index_html(validated)
    else:
        print("ACTION REQUIRED:")
        print("  To generate browser data:     python3 tools/import-issues.py --generate")
        print("  To also patch index.html:     python3 tools/import-issues.py --apply")
        print()
        print("  Manual option: review each new issue .md, verify evidence,")
        print("  then add the <tr> row to submission-html/index.html.")
        print("  Do NOT map evidence images based on folder number alone.")

    print()
    print("=" * 62)
    print(f"Run complete.")
    if not (mode_generate or mode_apply):
        print("No files were modified.")
    print("=" * 62)


if __name__ == "__main__":
    if "--repair-evidence" in sys.argv:
        idx = sys.argv.index("--repair-evidence")
        if idx + 1 >= len(sys.argv):
            print(
                "ERROR: --repair-evidence requires an issue reference argument "
                "(e.g. ISSUE-019, 019, 19).",
                file=sys.stderr,
            )
            sys.exit(1)
        repair_evidence(sys.argv[idx + 1])
    elif "--refresh-issue" in sys.argv:
        idx = sys.argv.index("--refresh-issue")
        if idx + 1 >= len(sys.argv):
            print(
                "ERROR: --refresh-issue requires an issue reference argument "
                "(e.g. ISSUE-023, 023, 23).",
                file=sys.stderr,
            )
            sys.exit(1)
        refresh_issue(sys.argv[idx + 1])
    else:
        main()
