# Postage AIOS

Status: Structure Initialized

Purpose: Folder structure created from Postage_AIOS_Architecture.md.

Content Population: Pending future phases.

## Start the Dashboard

The canonical way to open the Postage AIOS dashboard is to use **`start-dashboard.sh`**
at the repository root.

**Option 1 — double-click:**
Double-click `start-dashboard.sh` in the file manager.

**Option 2 — terminal:**
```bash
bash start-dashboard.sh
```

The launcher starts the local dashboard server (`tools/serve.py`) and opens the
dashboard automatically in your default browser.

**Dashboard URL:** `http://127.0.0.1:8000/`

**Canonical port:** 8000. Do not manually choose alternate ports for normal dashboard
use — the launcher and the frontend both expect port 8000.

**Why use the launcher:**
Priority assignment (setting Critical / High / Medium on TBD issues) and Add Latest
Issues persistence both require the dashboard to be opened through this
launcher/server flow. Without the server, these actions cannot be saved permanently.

**If port 8000 is already in use:**
The launcher detects the occupied port and opens the browser to the existing service
on port 8000 without starting a second server process on that port.

**Localhost only:**
The server binds to `127.0.0.1` and is not accessible from the network.
