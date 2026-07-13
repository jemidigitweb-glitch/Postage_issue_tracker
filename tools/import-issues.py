#!/usr/bin/env python3
"""
Postage AIOS — Daily Issue Importer
====================================
Reads intelligence-inbox/daily-issues/*.md, checks which issue IDs are already
present in submission-html/index.html, and reports what would be added.

SAFE-ONLY MODE (default):
  The script does NOT modify index.html automatically.
  It prints a detailed report of what is already present and what is new.
  Manual review is required before any HTML changes are made.

WHY:
  - Dashboard is static HTML; evidence image paths must be verified by a human.
  - Duplicate checking is by Issue ID extracted from the filename (issue-NNN-*).
  - No data is invented, guessed, or mapped by file-number proximity.

Usage:
  python3 tools/import-issues.py

Run from the project root (postage-aios/).
"""

import os
import re
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX_DIR    = os.path.join(PROJECT_ROOT, "intelligence-inbox", "daily-issues")
DASHBOARD    = os.path.join(PROJECT_ROOT, "submission-html", "index.html")


def extract_issue_number(filename):
    """Return zero-padded 3-digit number from 'issue-NNN-*.md', or None."""
    m = re.match(r"issue-(\d+)-", filename)
    return m.group(1).zfill(3) if m else None


def get_inbox_issues():
    """Return sorted list of (num, filename, path) from the inbox."""
    if not os.path.isdir(INBOX_DIR):
        print(f"ERROR: inbox directory not found: {INBOX_DIR}", file=sys.stderr)
        sys.exit(1)

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


def get_dashboard_issue_ids():
    """Return set of issue ID strings already in the dashboard (e.g. {'001', '002'}).
    Scans for 'ISSUE-NNN' anywhere in the HTML (cell text, data-issue, resolution keys).
    """
    if not os.path.isfile(DASHBOARD):
        print(f"ERROR: dashboard not found: {DASHBOARD}", file=sys.stderr)
        sys.exit(1)

    html = open(DASHBOARD, encoding="utf-8").read()
    # Match ISSUE-NNN anywhere: in cell text, data-issue="ISSUE-NNN", etc.
    found = re.findall(r"ISSUE-(\d+)", html, re.IGNORECASE)
    return {n.zfill(3) for n in found}


def read_issue_summary(path):
    """Read first non-empty line after the H1 heading as a summary."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
        for i, line in enumerate(lines):
            if line.startswith("# "):
                # Look for a summary or description within next 10 lines
                for later in lines[i+1 : i+11]:
                    stripped = later.strip()
                    if stripped and not stripped.startswith("#"):
                        return stripped[:120]
        return "(no summary found)"
    except Exception as e:
        return f"(could not read: {e})"


def main():
    print("=" * 60)
    print("Postage AIOS — Daily Issue Import Check")
    print("=" * 60)
    print()

    inbox_issues    = get_inbox_issues()
    dashboard_ids   = get_dashboard_issue_ids()

    print(f"Inbox:     {len(inbox_issues)} issue file(s) found")
    print(f"Dashboard: {len(dashboard_ids)} issue ID(s) already present")
    print()

    already_present = []
    new_issues      = []

    for num, fname, path in inbox_issues:
        if num in dashboard_ids:
            already_present.append((num, fname))
        else:
            summary = read_issue_summary(path)
            new_issues.append((num, fname, summary))

    # ── Report: already present ─────────────────────────────────
    print(f"Already in dashboard ({len(already_present)}):")
    if already_present:
        for num, fname in already_present:
            print(f"  ✓  ISSUE-{num}  {fname}")
    else:
        print("  (none)")
    print()

    # ── Report: new issues ───────────────────────────────────────
    print(f"New issues not yet in dashboard ({len(new_issues)}):")
    if new_issues:
        for num, fname, summary in new_issues:
            print(f"  +  ISSUE-{num}  {fname}")
            print(f"          {summary}")
        print()
        print("ACTION REQUIRED:")
        print("  These issues exist in the inbox but are NOT in the dashboard.")
        print("  To add them, a human must:")
        print("  1. Review the .md file content.")
        print("  2. Verify which evidence images (if any) belong to this issue.")
        print("     Do NOT map images based on folder number alone.")
        print("  3. Manually add the <tr> row to submission-html/index.html.")
        print("  4. Reload the dashboard and verify.")
    else:
        print("  (none — dashboard is up to date)")

    print()
    print("=" * 60)
    print("Run complete. No files were modified.")
    print("=" * 60)


if __name__ == "__main__":
    main()
