#!/usr/bin/env bash
# ============================================================
# AIOS Dashboard Launcher
# LEDSone — Postage Department
#
# HOW TO USE:
#   Double-click this file in the file manager, OR
#   run: bash start-dashboard.sh
#
# WHAT IT DOES:
#   1. Starts the local dashboard server (tools/serve.py)
#   2. Opens the dashboard in your default browser
#   3. Keeps the server running until you close this window
#
# STOP THE SERVER:
#   Close the terminal window, or press Ctrl+C
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8000
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}/"
SERVER_SCRIPT="${SCRIPT_DIR}/tools/serve.py"

# ── Sanity checks ────────────────────────────────────────────
if [ ! -f "${SERVER_SCRIPT}" ]; then
    echo "ERROR: Server script not found: ${SERVER_SCRIPT}"
    echo "Please run this script from the postage-aios directory."
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 is not installed or not in PATH."
    exit 1
fi

# ── Check for an already-running server on this port ─────────
if ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then
    echo "Dashboard server is already running on port ${PORT}."
    echo "Opening browser: ${URL}"
    xdg-open "${URL}" 2>/dev/null &
    echo ""
    echo "If the browser does not open, navigate to: ${URL}"
    exit 0
fi

# ── Start server in background, then open browser ────────────
cd "${SCRIPT_DIR}"

echo "============================================================"
echo "  AIOS Dashboard — Starting"
echo "============================================================"
echo "  URL:  ${URL}"
echo "  Stop: press Ctrl+C or close this window"
echo "============================================================"
echo ""

python3 "${SERVER_SCRIPT}" "${PORT}" &
SERVER_PID=$!

# Wait briefly for the server to bind
sleep 1

# Verify the server actually started
if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "ERROR: Server failed to start. Check for port conflicts on ${PORT}."
    exit 1
fi

# Open the default browser
xdg-open "${URL}" 2>/dev/null &

echo "Dashboard is open in your browser."
echo "Press Ctrl+C in this window to stop the server."
echo ""

# Keep the script alive so the server runs; clean up on exit
trap "echo ''; echo 'Stopping server...'; kill ${SERVER_PID} 2>/dev/null; exit 0" INT TERM

wait "${SERVER_PID}"
