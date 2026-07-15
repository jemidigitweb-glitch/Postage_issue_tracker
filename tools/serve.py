#!/usr/bin/env python3
"""
AIOS — Local Dashboard Server
==============================
Serves submission-html/ as a static site on http://127.0.0.1:8000
and exposes endpoints used by the dashboard.

Usage:
    python3 tools/serve.py          # start server (default port 8000)
    python3 tools/serve.py 8080     # start server on a custom port

Endpoints:
    POST /api/import-issues   — import new inbox issues (Add Latest Issues button)
    POST /api/set-priority    — update the priority of a single TBD issue

    /api/import-issues response JSON:
    {
        "success": true,
        "imported": ["ISSUE-018"],
        "skipped":  ["ISSUE-001", ..., "ISSUE-017"],
        "rejected": [],
        "message":  "1 issue(s) imported."
    }

    /api/set-priority request JSON:
    { "issueId": "ISSUE-016", "priority": "critical" }

    /api/set-priority response JSON (success):
    { "success": true, "issueId": "ISSUE-016", "priority": "critical",
      "message": "ISSUE-016 priority set to Critical." }

    Allowed priority values: critical | high | medium
    Only issues whose source MD currently contains **Priority:** TBD are accepted.
    The source MD is updated atomically; then refresh_issue() rebuilds the dashboard
    row.  If refresh_issue() fails the source MD is restored atomically (rollback).

Security:
    - Binds ONLY to 127.0.0.1 — not accessible from the network.
    - The /api/import-issues endpoint accepts no input; it operates on
      fixed local paths defined in import-issues.py.
    - /api/set-priority accepts only issueId + priority; all other inputs
      are rejected with 400.  Priority is validated against a server-side
      allowlist — no arbitrary values are accepted.
    - No arbitrary paths, shell commands, or code execution are accepted.
    - CORS is restricted to the same origin (127.0.0.1:PORT).

Importer reuse:
    All issue-parsing, validation, and write logic is imported directly
    from tools/import-issues.py. No duplicate logic is introduced here.
"""

import io
import json
import os
import re
import sys
import tempfile
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

# ── Locate project root and submission-html ────────────────────────────────
TOOLS_DIR    = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(TOOLS_DIR)
SERVE_DIR    = os.path.join(PROJECT_ROOT, "submission-html")

# ── Import importer functions (no duplicate logic) ─────────────────────────
# import-issues.py has a hyphen in its filename so it cannot be imported with
# a plain `import` statement.  importlib.util is the stdlib solution.
import importlib.util as _ilu

def _load_importer():
    spec = _ilu.spec_from_file_location(
        "import_issues",
        os.path.join(TOOLS_DIR, "import-issues.py"),
    )
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

# Startup validation — loads the importer once to surface syntax/import errors
# early rather than on the first request.  The result is discarded; _run_import()
# always calls _load_importer() fresh so a running server never holds a stale
# importer module after import-issues.py is edited.
_load_importer()

HOST = "127.0.0.1"

# ── Set-priority constants ─────────────────────────────────────────────────
_ALLOWED_PRIORITIES = frozenset({"critical", "high", "medium"})
_PRIORITY_DISPLAY   = {"critical": "Critical", "high": "High", "medium": "Medium"}
# Matches: **Priority:** VALUE  (colon is inside the bold markers)
_PRIORITY_LINE_RE   = re.compile(r'^(\*\*Priority:\*\*\s+)(\S+)(.*)')


# ── Request handler ────────────────────────────────────────────────────────

class DashboardHandler(SimpleHTTPRequestHandler):
    """
    Serves submission-html/ for GET requests.
    Handles POST /api/import-issues to trigger the existing importer.
    """

    def __init__(self, *args, **kwargs):
        # SimpleHTTPRequestHandler uses self.directory as the root to serve
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    # ── Suppress verbose request logging ───────────────────────────────────
    def log_message(self, fmt, *args):
        # Keep startup messages; suppress per-request noise unless debug
        pass

    # ── CORS headers (same-origin 127.0.0.1 only) ─────────────────────────
    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        # Allow only requests coming from the same local server
        if "127.0.0.1" in origin or "localhost" in origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    # ── OPTIONS preflight ──────────────────────────────────────────────────
    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if path in ("/api/import-issues", "/api/set-priority"):
            self.send_response(204)
            self._send_cors_headers()
            self.end_headers()
        else:
            self.send_error(405)

    # ── POST routing ───────────────────────────────────────────────────────
    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/import-issues":
            try:
                result = _run_import()
            except Exception as exc:
                self._send_json(500, {
                    "success": False,
                    "imported": [],
                    "skipped":  [],
                    "rejected": [],
                    "message":  f"Server error during import: {exc}",
                })
                return
            status_code = 200 if result["success"] else 500
            self._send_json(status_code, result)

        elif path == "/api/set-priority":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
            except Exception as exc:
                self._send_json(400, {"success": False, "message": f"Cannot read request body: {exc}"})
                return
            try:
                status_code, result = _run_set_priority(body)
            except Exception as exc:
                self._send_json(500, {"success": False, "message": f"Server error during set-priority: {exc}"})
                return
            self._send_json(status_code, result)

        else:
            self.send_error(404, "Not found")

    # ── JSON response helper ───────────────────────────────────────────────
    def _send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ── Override GET to serve index.html for / ─────────────────────────────
    def do_GET(self):
        # Let SimpleHTTPRequestHandler serve static files
        super().do_GET()


# ── Core import logic — reuses import-issues.py exclusively ───────────────

def _run_import():
    """
    Discover new inbox issues, validate, generate issues-data.js,
    and patch index.html.  All logic delegated to import-issues.py.

    The importer is reloaded from disk on every call so that changes to
    import-issues.py take effect immediately without a server restart.
    Returns a JSON-serialisable result dict.
    """
    imp = _load_importer()   # fresh load — always uses the current on-disk version

    inbox_issues  = imp.get_inbox_issues()
    dashboard_ids = imp.get_dashboard_issue_ids()

    skipped   = []
    new_raw   = []
    validated = []
    rejected  = []

    for num, fname, path in inbox_issues:
        if num in dashboard_ids:
            skipped.append(f"ISSUE-{num}")
        else:
            new_raw.append((num, fname, path))

    for num, fname, path in new_raw:
        issue  = imp.parse_issue_md(path)
        errors = imp.validate_issue(issue, fname, imp.GAPS_DIR)

        if not issue["id"]:
            issue["id"] = f"ISSUE-{num}"

        if errors:
            rejected.append({
                "id":     f"ISSUE-{num}",
                "errors": errors,
            })
        else:
            validated.append(issue)

    if not validated and not rejected:
        return {
            "success":  True,
            "imported": [],
            "skipped":  skipped,
            "rejected": [],
            "message":  "Dashboard is already up to date. No new issues found.",
        }

    imported_ids = []

    if validated:
        # Redirect stdout from generate/patch to avoid polluting the server log
        _captured = io.StringIO()
        _real_stdout = sys.stdout
        sys.stdout = _captured
        try:
            imp.generate_data_js(validated)
            imp.patch_index_html(validated)
        finally:
            sys.stdout = _real_stdout

        imported_ids = [
            "ISSUE-" + re.sub(r"^ISSUE-?", "", i["id"], flags=re.IGNORECASE).zfill(3)
            for i in validated
        ]

    rejected_summary = [
        {"id": r["id"], "errors": r["errors"]}
        for r in rejected
    ]

    if rejected and not imported_ids:
        return {
            "success":  False,
            "imported": [],
            "skipped":  skipped,
            "rejected": rejected_summary,
            "message":  f"Import failed — {len(rejected)} issue(s) did not pass validation.",
        }

    msg_parts = []
    if imported_ids:
        msg_parts.append(f"{len(imported_ids)} issue(s) imported: {', '.join(imported_ids)}.")
    if rejected:
        msg_parts.append(f"{len(rejected)} issue(s) rejected (validation failed).")

    return {
        "success":  True,
        "imported": imported_ids,
        "skipped":  skipped,
        "rejected": rejected_summary,
        "message":  " ".join(msg_parts),
    }


# ── Set-priority logic — reuses import-issues.py exclusively ──────────────

def _run_set_priority(body_bytes):
    """
    Validate the request, update the source MD Priority field from TBD to the
    selected value, then call the existing refresh_issue() to rebuild the
    dashboard row.  Returns (http_status_code, result_dict).

    Write stages:
      1. Atomically write updated source MD (TBD → Critical/High/Medium).
      2. Call imp.refresh_issue() — updates index.html and issues-data.js.
    If stage 2 fails, stage 1 is rolled back atomically so the source MD
    returns to TBD.  Success is never reported after a rollback.
    """
    # Parse JSON body
    try:
        data = json.loads(body_bytes.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return 400, {"success": False, "message": f"Invalid JSON body: {exc}"}

    if not isinstance(data, dict):
        return 400, {"success": False, "message": "Request body must be a JSON object."}

    issue_id_raw = data.get("issueId")
    priority_raw = data.get("priority")

    if not isinstance(issue_id_raw, str) or not issue_id_raw.strip():
        return 400, {"success": False, "message": "issueId must be a non-empty string."}
    if not isinstance(priority_raw, str) or not priority_raw.strip():
        return 400, {"success": False, "message": "priority must be a non-empty string."}

    # Normalise issueId to ISSUE-NNN (same extraction pattern as importer)
    digits = re.sub(r"\D", "", issue_id_raw.strip())
    if not digits:
        return 400, {"success": False, "message": f"Cannot parse issue number from issueId '{issue_id_raw}'."}
    issue_id = f"ISSUE-{digits.zfill(3)}"

    # Validate priority against server-side allowlist — do not trust frontend
    priority = priority_raw.strip().lower()
    if priority not in _ALLOWED_PRIORITIES:
        return 400, {
            "success": False,
            "message": (
                f"priority '{priority_raw}' is not allowed. "
                f"Must be exactly one of: critical, high, medium."
            ),
        }

    # Load importer to access INBOX_DIR and extract_issue_number
    imp = _load_importer()

    # Find exactly one source MD for this issue number
    num = digits.zfill(3)
    try:
        inbox_files = sorted(os.listdir(imp.INBOX_DIR))
    except OSError as exc:
        return 500, {"success": False, "message": f"Cannot read inbox directory: {exc}"}

    matches = [
        os.path.join(imp.INBOX_DIR, fname)
        for fname in inbox_files
        if fname.endswith(".md") and imp.extract_issue_number(fname) == num
    ]
    if len(matches) == 0:
        return 400, {"success": False, "message": f"{issue_id}: no source MD found in inbox. Cannot set priority."}
    if len(matches) > 1:
        return 400, {"success": False, "message": f"{issue_id}: {len(matches)} source MDs found (expected 1). Cannot proceed."}

    md_path = matches[0]

    # Read and preserve original source MD bytes before any write
    try:
        original_bytes = open(md_path, "rb").read()
    except OSError as exc:
        return 500, {"success": False, "message": f"Cannot read source MD for {issue_id}: {exc}"}

    try:
        original_text = original_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        return 500, {"success": False, "message": f"Source MD for {issue_id} is not valid UTF-8: {exc}"}

    # Find exactly one parser-compatible Priority field line
    lines = original_text.splitlines(keepends=True)
    priority_indices = [
        i for i, ln in enumerate(lines)
        if _PRIORITY_LINE_RE.match(ln.rstrip('\r\n'))
    ]
    if len(priority_indices) != 1:
        return 400, {
            "success": False,
            "message": (
                f"{issue_id}: expected exactly 1 Priority field line, "
                f"found {len(priority_indices)}."
            ),
        }

    idx = priority_indices[0]
    stripped_line = lines[idx].rstrip('\r\n')
    m = _PRIORITY_LINE_RE.match(stripped_line)
    current_val = m.group(2).strip()

    # Require current priority to be TBD — reject already-assigned issues
    if current_val.upper() != "TBD":
        return 400, {
            "success": False,
            "issueId": issue_id,
            "currentPriority": current_val,
            "message": (
                f"{issue_id} priority is already '{current_val}'. "
                f"Only issues with priority TBD can be updated."
            ),
        }

    # Build updated line — preserve prefix format, replace only the value
    prefix  = m.group(1)   # "**Priority:** " (with trailing space)
    suffix  = m.group(3)   # anything after value (normally empty)
    trailing = lines[idx][len(stripped_line):]   # original line ending (\n or \r\n)
    display_val = _PRIORITY_DISPLAY[priority]
    new_line = prefix + display_val + suffix + trailing
    new_text = "".join(lines[:idx] + [new_line] + lines[idx + 1:])
    new_bytes = new_text.encode("utf-8")

    # ── Stage 1: atomically write updated source MD ────────────────────────
    md_dir = os.path.dirname(os.path.abspath(md_path))
    try:
        with tempfile.NamedTemporaryFile("wb", dir=md_dir, suffix=".tmp", delete=False) as tf:
            tf.write(new_bytes)
            tmp_path = tf.name
        os.replace(tmp_path, md_path)
    except OSError as exc:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return 500, {"success": False, "message": f"Failed to write updated source MD for {issue_id}: {exc}"}

    # ── Stage 2: call existing refresh_issue() ─────────────────────────────
    # refresh_issue() uses sys.exit(1) on validation/count failures.
    # Catch SystemExit so the server process does not terminate.
    refresh_ok    = False
    refresh_error = ""
    _real_stdout  = sys.stdout
    sys.stdout    = io.StringIO()
    try:
        imp.refresh_issue(issue_id)
        refresh_ok = True
    except SystemExit as exc:
        refresh_error = f"refresh_issue() exited with code {exc.code}"
    except Exception as exc:
        refresh_error = f"refresh_issue() raised: {exc}"
    finally:
        sys.stdout = _real_stdout

    if not refresh_ok:
        # ── Rollback: restore original source MD bytes atomically ──────────
        rollback_error = ""
        try:
            with tempfile.NamedTemporaryFile("wb", dir=md_dir, suffix=".tmp", delete=False) as tf:
                tf.write(original_bytes)
                rollback_tmp = tf.name
            os.replace(rollback_tmp, md_path)
        except OSError as exc:
            rollback_error = str(exc)

        if rollback_error:
            return 500, {
                "success": False,
                "message": (
                    f"{issue_id} refresh failed: {refresh_error}. "
                    f"CRITICAL: rollback also failed: {rollback_error}. "
                    f"Source MD may be inconsistent — manual intervention required."
                ),
            }
        return 500, {
            "success": False,
            "message": (
                f"{issue_id} refresh failed: {refresh_error}. "
                f"Source MD has been restored to TBD."
            ),
        }

    return 200, {
        "success":  True,
        "issueId":  issue_id,
        "priority": priority,
        "message":  f"{issue_id} priority set to {display_val}.",
    }


# ── Server startup ─────────────────────────────────────────────────────────

def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port '{sys.argv[1]}' — using default 8000.", file=sys.stderr)

    server = HTTPServer((HOST, port), DashboardHandler)

    print(f"AIOS Dashboard — local server started")
    print(f"  URL:  http://{HOST}:{port}/")
    print(f"  Root: {SERVE_DIR}")
    print(f"  Import endpoint: POST http://{HOST}:{port}/api/import-issues")
    print(f"  Press Ctrl+C to stop.")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
