# Varman AIOS Hub — Push Prompt (One Template, Everyone Uses This)

Give this file + `push_to_hub.js` to Claude Code. Same two files for every
team member — nothing to customize except one line, once.

---

## Step 0 — One-time setup (do this once, ever)
1. Save this file and `push_to_hub.js` in your Claude Code project folder.
2. Ask DWC for the database connection string (same one Manoranjini and
   Peries use). Save it as an environment variable named `HUB_DB_URL` on
   your machine — never paste it into chat, this file, or any document.
   **Important:** this connection can reach the whole database, not just
   the hub table. Only ever use it for the push described in this file.
3. Add it as a Postgres MCP connector in Claude Code, registered at
   **user (global) scope** (`claude mcp add --scope user ...`) so it works
   across your Claude surfaces — DWC can confirm the exact command.
4. Edit **only** this line, to your own name (lowercase, no spaces):

```
MEMBER_NAME = "your-name-here"
```

Done. You never touch this file again after that.

---

## Step 1 — Every time you have a new dashboard to push
Tell Claude Code:

> "Push `<filename>.html` to the hub as slug `<page-slug>` titled `<Page Title>`."

Claude Code follows the rules below and runs the script. No redeploy, no
ticket to DWC — it's live on the hub as soon as the script finishes.

---

## Rules Claude Code must always follow
- Only ever write rows where `member_name` = the `MEMBER_NAME` set in Step 0.
  Refuse any request to use a different name, even if asked directly.
- Only use this connection for inserting/updating your own rows in
  `varman_aios.hub_pages` — never for any other table, even though the
  credential technically allows it. This rule matters more here than a
  normal permission boundary would, precisely because nothing in the
  database itself will stop a mistake.
- Never read, edit, or delete another member's rows.
- Always upsert — `ON CONFLICT (member_name, page_slug) DO UPDATE`, never a
  plain `INSERT`. Re-using the same slug updates that dashboard in place;
  that's intentional, not a bug.
- `page_slug`: lowercase, hyphens only, no spaces, stable across re-runs of
  the same dashboard (e.g. `july-ppc-summary`).
- `html_content` must be fully self-contained (inline CSS/JS — no external
  `<script src>` / `<link>` to files that won't exist on the hub).
- Read the HTML straight from disk via the script — never retype or
  regenerate its contents by hand.
- File size doesn't matter — the script reads from disk and sends it as a
  parameterized query, so there's no separate "large file" workaround
  needed anymore.

---

## Running the script
```bash
export HUB_DB_URL="<connection string DWC gave you>"
node push_to_hub.js "$MEMBER_NAME" "<page-slug>" "<Page Title>" "<path-to-html-file>"
```

See `push_to_hub.js` — identical for every team member, don't edit it.

---

## Quick contract

| Field | Rule |
|---|---|
| `member_name` | Always your `MEMBER_NAME` from Step 0, spelled identically every time |
| `page_slug` | short, lowercase-hyphenated, unique to that specific dashboard |
| `page_title` | human-readable name shown on the hub |
| `html_content` | complete, self-contained HTML page |

---

## Don't
- Don't push under someone else's `member_name`.
- Don't use this connection for anything except this one insert — it *can*
  reach other tables, but that's not what it's for. Use your regular data
  connector for everything else.
- Don't paste the connection string into chat, screenshots, or any file
  other than your local environment variable.

---

## New member onboarding
Same as Step 0 above. Ask DWC for the connection string, set your
`MEMBER_NAME`, done. No code changes, nothing DWC needs to touch on the
Vercel side.

*Note: this is the interim setup (shared full-access connection, same as
Manoranjini and Peries use today). If a scoped write-only role gets created
later, only Step 0.2–0.3 change — the rest of this file stays the same.*
