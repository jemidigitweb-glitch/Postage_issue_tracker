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
PHASE2_DIR   = os.path.join(PROJECT_ROOT, "submission-html", "Nanthini akka issues")
# URL-relative prefix used in MD evidence path list lines (- `<prefix>/issues N/file`)
# Derived from PHASE2_DIR so a future folder rename only requires one change above.
EVIDENCE_URL_PREFIX = os.path.basename(PHASE2_DIR)

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
    "## Recommended Actions",
    "## Recommended Next Actions",
    "## Recommended Investigation / Actions",
]

# ── Evidence file-type sets ───────────────────────────────────────────────
IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"})
AUDIO_EXTS = frozenset({".mp3", ".ogg", ".wav", ".aac", ".flac", ".m4a"})
VIDEO_EXTS = frozenset({".mp4", ".webm", ".mov", ".avi", ".mkv"})
DOC_EXTS   = frozenset({".pdf", ".docx", ".xlsx", ".txt"})

# Owner values that mean "no owner assigned"
OWNER_NULLS = frozenset({"tbd", "unknown", "n/a", "none", "—", "-", ""})

# Domain → responsible team fallback (used when **Owner:** is TBD or absent)
DOMAIN_OWNER_MAP = {
    "purchase": "Purchase Team",
    "postage":  "Postage Team",
    "listing":  "Listing Team",
    "pricing":  "Pricing Team",
}

# Owner name → data-person attribute value for dashboard rows.
# Keys are lowercase-stripped owner names as they appear in **Owner:** fields.
# Unknown owners are NOT silently assigned to any person — they receive an
# empty string so the row appears under "All" but not under any named person.
# This prevents silent misassignment when new people are added in the future.
PERSON_MAP = {
    "nanthini": "nanthini",
    "sasi":     "sasi",
    "nivarnan": "nivarnan",
    "atisraj":  "atisraj",
}


def _derive_person(owner_raw):
    """Return the data-person value for a given owner name.

    Matches case-insensitively and trims whitespace.
    Returns '' for unrecognised owners — those rows appear only under 'All'.
    """
    key = (owner_raw or "").strip().lower()
    return PERSON_MAP.get(key, "")


# Date pattern in evidence filenames: 2026_07_16 or 2026-07-16
_DATE_FROM_FILENAME = re.compile(r"(\d{4})[_\-](\d{2})[_\-](\d{2})")

# ── Dashboard column completeness spec ────────────────────────────────────
# Each entry: (field_key, display_label, required, approved_fallbacks)
#   field_key:          key in the parsed issue dict.
#                         "_solved"  → auto-generated col; always passes; omitted from report.
#                         "_evidence"→ checked via issue["evidence_paths"]; always passes;
#                                      shown in report as ✓ (resolved or approved fallback).
#   display_label:      name shown in the validation report.
#   required:           True → empty/fallback-only value BLOCKS new-issue insertion.
#   approved_fallbacks: set of lowercased values that satisfy the column without real content.
#                         None → special handling (see field_key notes above).
DASHBOARD_COLUMN_SPECS = [
    ("date",      "Date",                 False, {"", "—"}),
    ("id",        "Issue ID",             True,  set()),
    ("priority",  "Priority",             False, {"", "tbd"}),
    ("title",     "Title",                True,  set()),
    ("what",      "Summary",              True,  set()),
    ("fix",       "Requirement Concern",  True,  set()),
    ("gap_file",  "Document Gap",         False, {"", "none", "—", "-", "n/a"}),
    ("owner",     "Owner",                False, {"", "—"}),
    ("_solved",   "Status Controls",      False, None),   # auto-generated; omitted from report
    ("_evidence", "Evidence",             False, None),   # always passes; shown in report
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
    Evidence is populated from both MD-declared paths and PHASE2_DIR auto-discovery.
    """
    fname = os.path.basename(path)
    num   = extract_issue_number(fname)   # e.g. "025" — used for evidence auto-discovery

    with open(path, encoding="utf-8") as f:
        content = f.read()
        lines   = content.splitlines()

    issue = {
        "id": "", "date": "", "domain": "", "priority": "",
        "status": "", "owner": "", "sku": "", "gap_file": "",
        "title": "", "what": "", "fix": "",
        "evidence_paths": [],
        "_has_id_field": False,  # True only when **Issue ID:** is explicit in MD
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
                if mapped == "id":
                    issue["_has_id_field"] = True

    # Extract title from H1
    for line in lines:
        if line.startswith("# "):
            issue["title"] = line[2:].strip()
            break

    # Extract "What is happening" / Issue Summary section
    issue["what"] = _extract_section(content, WHAT_HEADINGS)

    # Extract Fix section
    issue["fix"] = _extract_section(content, FIX_HEADINGS)

    # ── Evidence Step 1: MD-declared paths ────────────────────────────────
    # Targets lines of the form:  - `<EVIDENCE_URL_PREFIX>/path/to/file.ext`
    # Paths are URL-encoded in the MD; unquote() restores the filesystem name.
    _ev_prefix_re = re.escape(EVIDENCE_URL_PREFIX)
    md_ev_paths = []
    evidence_block = _extract_raw_section(content, ["## Evidence"])
    for line in evidence_block.splitlines():
        m = re.match(r"\s*-\s+`(" + _ev_prefix_re + r"/[^`]+)`", line)
        if m:
            url_path = m.group(1)
            fs_rel   = unquote(url_path)
            abs_path = os.path.join(PROJECT_ROOT, "submission-html", fs_rel)
            md_ev_paths.append(abs_path)

    # ── Evidence Step 2: auto-discover from PHASE2_DIR/issues N/ ──────────
    # Finds images, audio, video, and documents not explicitly listed in the MD.
    discovered = (
        _discover_evidence_files(num) if num
        else {"images": [], "audio": [], "video": [], "docs": []}
    )

    # ── Evidence Step 3: categorise MD paths by type then merge ───────────
    md_set     = set(md_ev_paths)
    md_by_type = {"images": [], "audio": [], "video": [], "docs": []}
    for p in md_ev_paths:
        ext = os.path.splitext(p)[1].lower()
        if ext in IMAGE_EXTS:
            md_by_type["images"].append(p)
        elif ext in AUDIO_EXTS:
            md_by_type["audio"].append(p)
        elif ext in VIDEO_EXTS:
            md_by_type["video"].append(p)
        elif ext in DOC_EXTS:
            md_by_type["docs"].append(p)

    ev_files = {}
    for kind in ("images", "audio", "video", "docs"):
        merged = list(md_by_type[kind])
        for p in discovered[kind]:
            if p not in md_set:
                merged.append(p)
        ev_files[kind] = sorted(set(merged), key=os.path.basename)

    issue["evidence_files"] = ev_files
    # Flat list retained for validation and legacy callers
    issue["evidence_paths"] = (
        ev_files["images"] + ev_files["audio"] +
        ev_files["video"] + ev_files["docs"]
    )

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

    # ── Date priority chain ────────────────────────────────────────────────
    # 1. Earliest date across all evidence filenames (e.g. 2026_07_16_p1.png).
    #    Evidence date takes priority — it is the operational event date.
    # 2. Explicit **Date Logged:** from MD — used only when no evidence date found.
    # 3. Leave as "" (shown as "—") — never silently use today's import date.
    if issue["evidence_paths"]:
        ev_date = _derive_earliest_date_from_files(issue["evidence_paths"])
        if ev_date:
            issue["date"] = ev_date
    # else: keep MD date already parsed (may be "" if not present)

    # ── Owner resolution ───────────────────────────────────────────────────
    # Step 1: normalise explicit **Owner:** value — TBD/blank/unknown → "".
    # Step 2: if still empty, derive from domain via DOMAIN_OWNER_MAP.
    # Step 3: leave as "" (shown as "—") when neither source resolves it.
    issue["owner"] = _normalise_owner(issue.get("owner", ""))
    if not issue["owner"]:
        issue["owner"] = DOMAIN_OWNER_MAP.get(issue.get("domain", ""), "")

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
        # Join all meaningful paragraphs — sections with bold sub-headers
        # (e.g. "## Recommended Actions") split into many small paragraphs;
        # returning only paras[0] discards all action items after the first header.
        paras = [p.strip() for p in text.split("\n\n") if p.strip() and not p.strip().startswith("|")]
        return " ".join(paras)[:600] if paras else ""
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


def _discover_evidence_files(issue_num_str):
    """
    Auto-scan PHASE2_DIR/issues N/ for evidence files categorised by type.
    issue_num_str: zero-padded string, e.g. "025" or "001".
    Returns {"images": [...], "audio": [...], "video": [...], "docs": [...]}
    All paths are absolute. Returns empty lists when the folder does not exist.
    This supplements MD-declared paths — it never replaces them.
    """
    folder_name = f"issues {int(issue_num_str)}"   # "issues 25", not "issues 025"
    folder_path = os.path.join(PHASE2_DIR, folder_name)
    result = {"images": [], "audio": [], "video": [], "docs": []}
    if not os.path.isdir(folder_path):
        return result
    for fname in sorted(os.listdir(folder_path)):
        abs_path = os.path.join(folder_path, fname)
        if not os.path.isfile(abs_path):
            continue
        ext = os.path.splitext(fname)[1].lower()
        if ext in IMAGE_EXTS:
            result["images"].append(abs_path)
        elif ext in AUDIO_EXTS:
            result["audio"].append(abs_path)
        elif ext in VIDEO_EXTS:
            result["video"].append(abs_path)
        elif ext in DOC_EXTS:
            result["docs"].append(abs_path)
    return result


def _derive_earliest_date_from_files(abs_paths):
    """
    Extract YYYY-MM-DD dates from all evidence filenames and return the earliest.
    Recognises patterns: 2026_07_16_... or 2026-07-16_... anywhere in the filename.
    Returns the earliest date found across all files, or '' if none match.
    Evidence date takes priority over **Date Logged:** — never returns today's date.
    """
    dates = []
    for path in abs_paths:
        fname = os.path.basename(path)
        m = _DATE_FROM_FILENAME.search(fname)
        if m:
            dates.append(f"{m.group(1)}-{m.group(2)}-{m.group(3)}")
    return min(dates) if dates else ""


def _normalise_owner(raw):
    """Return '' when owner is TBD / blank / unknown; else return stripped value."""
    return "" if raw.strip().lower() in OWNER_NULLS else raw.strip()


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


def _summarise_field_resolution(issues, label=""):
    """
    Print a pre-write field-resolution report for a list of parsed issue dicts.
    Reports which issues have unresolved date / owner / evidence.
    Non-blocking: prints warnings; does NOT prevent writing.
    Called before any disk write so operators can see what will render as '—'.
    """
    unresolved = []
    for issue in issues:
        issue_id = issue.get("id") or "ISSUE-???"
        warns = []
        if not issue.get("date"):
            warns.append("date")
        if not issue.get("owner"):
            warns.append("owner")
        if not issue.get("evidence_paths"):
            warns.append("evidence")
        if warns:
            unresolved.append((issue_id, warns))

    if not unresolved:
        prefix = f"[{label}] " if label else ""
        print(f"  {prefix}All fields resolved — date, owner, evidence present for all issues.")
        return

    prefix = f" ({label})" if label else ""
    print(f"Field resolution report{prefix}:")
    for issue_id, warns in unresolved:
        print(f"  WARN [{issue_id}]: {', '.join(warns)} not resolved — will show '—' in dashboard")


def validate_row_completeness(issue):
    """
    Validate every dashboard column for a single parsed issue dict.

    Returns (overall_pass, column_results).
      overall_pass:    True only when every required column has a non-empty,
                       non-fallback value.
      column_results:  list of {"label": str, "pass": bool, "reason": str}

    Approved fallbacks are column-specific (see DASHBOARD_COLUMN_SPECS).
    Auto-generated columns (Status Controls, Evidence) always pass.
    Does not modify any field. Does not write any file.
    """
    overall_pass   = True
    column_results = []

    for field_key, display_label, required, fallbacks in DASHBOARD_COLUMN_SPECS:
        # _solved: auto-generated column — always passes; omitted from report entirely.
        if field_key == "_solved":
            column_results.append({
                "label":  display_label,
                "pass":   True,
                "reason": "_auto",   # sentinel: suppressed in print_row_validation_report
            })
            continue

        # _evidence: always passes; shown in report as ✓ with resolved/approved fallback.
        if field_key == "_evidence":
            has_evidence = bool(issue.get("evidence_paths"))
            column_results.append({
                "label":  display_label,
                "pass":   True,
                "reason": "resolved" if has_evidence else "approved fallback",
            })
            continue

        raw        = (issue.get(field_key) or "").strip()
        normalised = raw.lower()
        is_empty_or_fallback = (not raw) or (normalised in fallbacks)

        if not required:
            # Non-required: approved fallback is always valid — always passes.
            column_results.append({
                "label":  display_label,
                "pass":   True,
                "reason": "resolved" if (raw and normalised not in fallbacks) else "approved fallback",
            })
        elif not is_empty_or_fallback:
            # Required and has a real, non-fallback value.
            column_results.append({
                "label":  display_label,
                "pass":   True,
                "reason": "resolved",
            })
        else:
            # Required field is missing — provide the most actionable reason.
            if field_key == "id":
                reason = "Issue ID absent — check filename or **Issue ID:** field"
            elif field_key == "title":
                reason = "No H1 heading found in source MD"
            elif field_key in ("what", "fix"):
                reason = "No matching heading in source MD — check heading aliases"
            else:
                reason = "empty"
            column_results.append({
                "label":  display_label,
                "pass":   False,
                "reason": reason,
            })
            overall_pass = False

    return overall_pass, column_results


def print_row_validation_report(issue_id, overall_pass, column_results, blocking=True):
    """
    Print a per-column validation report for one issue in the format:

      ISSUE-025
        Date ............... ✓
        Issue ID ........... ✓
        ...
        Requirement Concern  ✗  [No matching heading in source MD]
        ──────────────────────────────
        PASS  /  FAIL — row will NOT be written  (new issues, blocking=True)
              /  FAIL — correct source MD         (existing rows, blocking=False)

    Status Controls column is suppressed (auto-generated, always passes, not user-visible).
    All other columns — including approved-fallback columns — are shown.
    blocking=True  → FAIL label says row is blocked from being written (new issues).
    blocking=False → FAIL label says correction is needed but row exists (existing rows).
    """
    print(f"\n    {issue_id}")
    for col in column_results:
        if col["reason"] == "_auto":   # suppressed column (Status Controls)
            continue
        tick = "✓" if col["pass"] else "✗"
        label_padded = f"{col['label']} ".ljust(24, ".")
        if col["pass"]:
            print(f"      {label_padded} {tick}")
        else:
            print(f"      {label_padded} {tick}  [{col['reason']}]")
    print(f"      {'─' * 30}")
    if overall_pass:
        print(f"      PASS")
    elif blocking:
        print(f"      FAIL — row will NOT be written")
    else:
        print(f"      FAIL — correct source MD heading aliases to resolve")


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


def build_evidence_html(evidence_files):
    """
    Return HTML for the evidence column.
    Accepts a dict {"images": [...], "audio": [...], "video": [...], "docs": [...]}.
    Legacy: also accepts a flat list (all treated as images) for backward compat.
    Only returns "No Evidence Available" when all categories are empty.
    """
    # Legacy compat — flat list callers receive image-only treatment
    if isinstance(evidence_files, list):
        evidence_files = {"images": evidence_files, "audio": [], "video": [], "docs": []}

    images = evidence_files.get("images", [])
    audio  = evidence_files.get("audio",  [])
    video  = evidence_files.get("video",  [])
    docs   = evidence_files.get("docs",   [])

    if not images and not audio and not video and not docs:
        return '<span class="evidence-none">No Evidence Available</span>'

    parts = []

    # Image thumbnails
    if images:
        thumbs = []
        for ep in images:
            rel = os.path.relpath(ep, os.path.join(PROJECT_ROOT, "submission-html"))
            url = rel.replace(" ", "%20")
            thumbs.append(
                f'<a href="{url}" target="_blank" class="evidence-link">'
                f'<img src="{url}" class="evidence-thumb" alt="evidence image" loading="lazy">'
                f'</a>'
            )
        parts.append('<div class="evidence-gallery">' + "".join(thumbs) + "</div>")

    # Audio indicator (🎵)
    if audio:
        n     = len(audio)
        label = "audio file" if n == 1 else "audio files"
        parts.append(f'<span class="evidence-audio">&#127925; {n} {label}</span>')

    # Video indicator (🎬)
    if video:
        n     = len(video)
        label = "video" if n == 1 else "videos"
        parts.append(f'<span class="evidence-video">&#127910; {n} {label}</span>')

    # Document indicator (📄)
    if docs:
        n     = len(docs)
        label = "document" if n == 1 else "documents"
        parts.append(f'<span class="evidence-doc">&#128196; {n} {label}</span>')

    return '<div class="evidence-cell">' + "".join(parts) + "</div>"


def build_row_html(issue):
    """Build the complete <tr> HTML for an issue."""
    esc = html_module.escape
    issue_id = "ISSUE-" + issue["id"].lstrip("ISSUE-").lstrip("-")
    if not issue_id.startswith("ISSUE-"):
        issue_id = issue["id"]  # use as-is if already formatted

    gap_label, gap_class = build_gap_display(issue.get("gap_file", ""))
    priority_badge       = build_priority_badge(issue.get("priority", ""))
    evidence_html        = build_evidence_html(issue.get("evidence_files", {}))

    # Normalise data-priority attribute (empty string if TBD)
    data_priority = (issue.get("priority") or "").lower()
    if data_priority in ("tbd", "unknown"):
        data_priority = ""

    data_domain  = esc(issue.get("domain", ""))
    data_status  = esc(issue.get("status", "investigation"))
    data_person  = _derive_person(issue.get("owner", ""))
    title        = esc(issue.get("title", issue_id))
    what         = esc(issue.get("what", ""))
    fix          = esc(issue.get("fix", ""))
    owner        = esc(issue.get("owner", "") or "—")
    date_val     = esc(issue.get("date", "—"))

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
        f'                <tr data-classification="daily-issue" data-person="{data_person}" data-domain="{data_domain}"'
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
    evidence_html = build_evidence_html(issue.get("evidence_files", {}))
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


def refresh_html_rows(issues, html_content):
    """
    Compare each issue's canonical row HTML against what is currently in
    html_content and replace any rows that differ.

    Accepts a list of parsed issue dicts and the full index.html string.
    Returns (updated_html_content, refreshed_ids, errors).
    Does NOT write to disk — caller handles the atomic write so that a single
    pass over all issues produces exactly one file write.

    Safety invariants:
    - Never inserts a new row (use patch_index_html for that).
    - Skips rows that are already current (idempotent).
    - Returns an error string (no sys.exit) for any issue whose marker is
      absent or appears more than once, so batch processing continues.
    """
    refreshed = []
    errors    = []

    for issue in issues:
        issue_id = "ISSUE-" + re.sub(r"^ISSUE-?", "", issue["id"], flags=re.IGNORECASE).zfill(3)

        # Guard: only refresh rows that were originally generated by the importer.
        # Legacy issues (pre-importer, no explicit **Issue ID:** field in MD) have
        # hand-crafted dashboard rows. Refreshing them overwrites curated content
        # with raw parser output. Identified by absence of _has_id_field flag.
        if not issue.get("_has_id_field"):
            continue  # Legacy row — preserve as-is, no message needed

        # Secondary guard: if the parser still cannot populate required fields
        # for a new-format issue, don't overwrite existing content with blanks.
        row_ok, _ = validate_row_completeness(issue)
        if not row_ok:
            print(f"  SKIP refresh {issue_id} — parser output incomplete, existing row preserved")
            continue

        new_row  = build_row_html(issue)

        comment_marker = f"<!-- {issue_id} -->"
        count = html_content.count(comment_marker)
        if count == 0:
            errors.append(f"{issue_id}: comment anchor not found — skipping")
            continue
        if count > 1:
            errors.append(f"{issue_id}: anchor appears {count}× (expected 1) — skipping")
            continue

        comment_pos = html_content.index(comment_marker)
        block_start = html_content.rindex('\n', 0, comment_pos)
        tr_end_pos  = html_content.index("</tr>", comment_pos) + 5
        old_row     = html_content[block_start:tr_end_pos]

        # If the refreshed row would clear data-person (owner not in PERSON_MAP),
        # preserve the person assignment already in the HTML rather than regressing
        # rows that were explicitly assigned to a person in a prior import pass.
        if 'data-person=""' in new_row:
            existing_match = re.search(r'data-person="([^"]+)"', old_row)
            if existing_match and existing_match.group(1):
                new_row = new_row.replace(
                    'data-person=""',
                    f'data-person="{existing_match.group(1)}"',
                    1,
                )

        if old_row == new_row:
            continue  # Already current — nothing to do

        html_content = html_content[:block_start] + new_row + html_content[tr_end_pos:]
        refreshed.append(issue_id)

    return html_content, refreshed, errors


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
    new_ev_html = build_evidence_html(issue["evidence_files"])

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
            already_present.append((num, fname, path))   # path kept for row refresh
        else:
            new_issues_raw.append((num, fname, path))

    # ── Already present ─────────────────────────────────────────────
    print(f"Already in dashboard ({len(already_present)}):")
    for num, fname, _ in already_present:
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
            print(f"    Validation: FAIL")
            for e in errors:
                print(f"      ✗  {e}")
            rejected.append((num, fname, errors))
        else:
            print(f"    Validation: PASS")
            # Content-completeness warnings — non-blocking, informational only
            with open(path, encoding="utf-8") as _f:
                _md_content = _f.read()
            warn_issue_content(issue, fname, _md_content)

            # ── Dashboard row completeness — BLOCKING for new issues ──────
            # Every required column must have a resolved value before any row
            # is written to index.html. Issues that fail are added to rejected;
            # they are NOT inserted until the source MD is corrected.
            row_ok, row_results = validate_row_completeness(issue)
            print(f"    Row completeness:")
            print_row_validation_report(f"ISSUE-{num}", row_ok, row_results)
            if row_ok:
                validated.append(issue)
            else:
                rejected.append((num, fname, ["Row completeness FAIL — required dashboard fields unresolved"]))

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
    if mode_generate or mode_apply:
        # Regenerate issues-data.js from ALL inbox issues, not only the newly
        # discovered ones. This keeps the JS data file complete when running
        # incrementally. Older issues that legitimately lack domain/date fields
        # (they use an earlier format) are included with empty fallback values —
        # strict validation only gates new HTML rows, not JS data inclusion.
        print("Generating issues-data.js (all issues) ...")
        all_for_js = []
        for num2, fname2, path2 in inbox_issues:
            iss2 = parse_issue_md(path2)
            if not iss2["id"]:
                iss2["id"] = f"ISSUE-{num2}"
            # Include if we can determine an ID; empty domain/date are acceptable
            # for legacy issues and render as blank in the dashboard.
            if iss2.get("id"):
                all_for_js.append(iss2)
        generate_data_js(all_for_js)

        if mode_apply:
            if validated:
                # New issues already passed per-column validation above.
                print("Patching index.html — new issues ...")
                patch_index_html(validated)

            # Refresh existing rows whose canonical content has changed.
            # Runs on every --apply so that importer improvements (evidence,
            # owner normalisation, date fixes) propagate to already-imported rows
            # without manual intervention and without creating duplicates.
            if already_present:
                print("Refreshing existing rows in index.html ...")
                already_parsed = []
                for num2, fname2, path2 in already_present:
                    iss2 = parse_issue_md(path2)
                    if not iss2["id"]:
                        iss2["id"] = f"ISSUE-{num2}"
                    already_parsed.append(iss2)

                # Row completeness report for existing issues — WARNING only.
                # Existing rows cannot be removed from the dashboard, so validation
                # is informational: it surfaces which rows still have unresolved
                # fields so operators can correct the source MD and re-run.
                # The refresh itself is NOT blocked by this report.
                print("  Row completeness (existing issues):")
                for iss2 in already_parsed:
                    iid2 = "ISSUE-" + re.sub(
                        r"^ISSUE-?", "", iss2["id"], flags=re.IGNORECASE
                    ).zfill(3)
                    row_ok2, row_results2 = validate_row_completeness(iss2)
                    if not row_ok2:
                        print_row_validation_report(iid2, row_ok2, row_results2, blocking=False)

                with open(DASHBOARD, encoding="utf-8") as _f:
                    html_now = _f.read()

                html_now, refreshed_ids, refresh_errors = refresh_html_rows(already_parsed, html_now)

                if refreshed_ids:
                    html_dir = os.path.dirname(DASHBOARD)
                    with tempfile.NamedTemporaryFile(
                        "w", encoding="utf-8", dir=html_dir, suffix=".tmp", delete=False
                    ) as tf:
                        tf.write(html_now)
                        tmp_path = tf.name
                    os.replace(tmp_path, DASHBOARD)
                    for iid in refreshed_ids:
                        print(f"  ✓  Refreshed index.html row: {iid}")
                else:
                    print("  All existing rows are current — no refresh needed.")

                for err in refresh_errors:
                    print(f"  WARN: {err}", file=sys.stderr)

            if not validated and not already_present:
                print("Dashboard is up to date — no new rows to add.")
    elif not validated:
        print("Nothing to generate or apply.")
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
