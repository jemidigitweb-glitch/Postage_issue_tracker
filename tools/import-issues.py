#!/usr/bin/env python3
"""
AIOS — Daily Issue Importer
============================
Modes:
  python3 tools/import-issues.py            → report only, no files changed
  python3 tools/import-issues.py --generate → report + generate issues-data.js
  python3 tools/import-issues.py --apply    → generate + patch index.html with new rows

Safety rules enforced:
  - Duplicate checking by Issue ID (ISSUE-NNN pattern in filename)
  - Required field validation before any issue is accepted
  - Evidence path existence verified before mapping
  - Document Gap file existence verified if declared
  - No invented values — missing fields are left blank/unverified
  - Idempotent: running twice produces the same result

Run from the project root (postage-aios/).
"""

import os
import re
import sys
import html as html_module

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
    issue["what"] = _extract_section(content,
        ["## Issue Summary", "## What is Happening", "## What Is Happening"])

    # Extract Fix section
    issue["fix"] = _extract_section(content,
        ["## Fix and Action Required", "## Fix & Action Required",
         "## Fix / Action Required", "## Proposed Fix"])

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
    import json

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
    main()
