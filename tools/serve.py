#!/usr/bin/env python3
"""
AIOS — Local Dashboard Server
==============================
Serves submission-html/ as a static site on http://127.0.0.1:8000
and exposes one import endpoint used by the Add Latest Issues button.

Usage:
    python3 tools/serve.py          # start server (default port 8000)
    python3 tools/serve.py 8080     # start server on a custom port

The import endpoint:
    POST /api/import-issues

    Response JSON:
    {
        "success": true,
        "imported": ["ISSUE-018"],
        "skipped":  ["ISSUE-001", ..., "ISSUE-017"],
        "rejected": [],
        "message":  "1 issue(s) imported."
    }

    Or when nothing is new:
    {
        "success": true,
        "imported": [],
        "skipped":  [...],
        "rejected": [],
        "message":  "Dashboard is already up to date. No new issues found."
    }

Security:
    - Binds ONLY to 127.0.0.1 — not accessible from the network.
    - The /api/import-issues endpoint accepts no input; it operates on
      fixed local paths defined in import-issues.py.
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
        if urlparse(self.path).path == "/api/import-issues":
            self.send_response(204)
            self._send_cors_headers()
            self.end_headers()
        else:
            self.send_error(405)

    # ── POST /api/import-issues ────────────────────────────────────────────
    def do_POST(self):
        path = urlparse(self.path).path

        if path != "/api/import-issues":
            self.send_error(404, "Not found")
            return

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
