# Getting Started: Pushing Your Dashboard to the Varman AIOS Hub
*A complete walkthrough — no assumed knowledge. Follow it top to bottom, once.*

---

## Part 1 — What is this, actually?

The **Varman AIOS Hub** is one website where every team member's dashboards
live, each under their own name. You build a dashboard (an HTML file) using
Claude Code as you already do. The last step — "publishing" it — means
adding one row to a shared database table. The website reads that table and
shows your dashboard automatically. No one has to touch the website itself.

You'll be doing that last step yourself, using a small script, so you don't
need to wait on anyone once you're set up.

**A few words explained up front**, since you'll see them below:

| Term | What it means here |
|---|---|
| **Terminal** | The black text-based window where you type commands (also called "command prompt" on Windows). Claude Code runs inside it. |
| **Claude Code** | The tool you already use to build your dashboards. It can also run scripts and talk to databases when you connect it to them. |
| **MCP connector** | A saved connection that lets Claude Code talk to something outside itself — in this case, the project's database. Think of it as Claude Code's address book entry for "how to reach the database." |
| **Environment variable** | A named piece of information (like a password) stored on your computer, not typed into chat or saved in a file — so it can be used without being visible or shared by accident. |
| **`member_name`** | Your name, exactly as it appears in the database — this decides which section of the hub your dashboards show up under. |
| **`page_slug`** | A short web-friendly ID for one specific dashboard, e.g. `july-ppc-summary`. |
| **Upsert** | A database term for "update if it already exists, otherwise create it." This is why re-pushing the same dashboard updates it instead of duplicating it. |

---

## Part 2 — What you need before starting

- A computer with a terminal you can type into.
- **Node.js version 18 or newer** installed (Claude Code and the push
  script both need it). Check by typing:
  ```bash
  node --version
  ```
  If that fails or shows a number below 18, install Node.js from
  [nodejs.org](https://nodejs.org) first (choose the LTS version).
- **Claude Code** installed and logged in (see Part 3 if you don't have it
  yet — skip to Part 4 if you already use it daily).
- The **database connection string** from DWC — the same one Manoranjini
  and Peries use. Ask for it directly; never accept it typed into a group
  chat or screenshot, and never forward it on.
- Your **finished HTML dashboard file** saved somewhere on your computer.

---

## Part 3 — Installing Claude Code (skip if you already have it)

Pick the command for your operating system and paste it into your terminal:

**macOS / Linux / WSL:**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://claude.ai/install.ps1 | iex
```

Then confirm it installed:
```bash
claude --version
```
You should see a version number. If you don't, see
[claude.com's install troubleshooting](https://code.claude.com/docs/en/troubleshoot-install)
or ask DWC.

**Log in** by just starting it — it'll prompt you the first time:
```bash
claude
```
Follow the on-screen instructions to sign in through your browser. Once
done, you won't need to log in again.

---

## Part 4 — Connect Claude Code to the hub database (one time only)

This step tells Claude Code how to reach the database. You'll do this once,
ever.

1. **Save the connection string as an environment variable**, so it's never
   typed into chat or written into a file. In your terminal:

   **macOS / Linux:**
   ```bash
   export HUB_DB_URL="paste-the-connection-string-DWC-gave-you-here"
   ```
   **Windows PowerShell:**
   ```powershell
   $env:HUB_DB_URL="paste-the-connection-string-DWC-gave-you-here"
   ```
   *(This only lasts for your current terminal session — you'll set it
   again next time you open a new terminal to push a dashboard. If you'd
   rather not retype it every time, ask DWC about saving it more
   permanently — don't improvise this part yourself.)*

2. **Register the connector with Claude Code**, so Claude Code itself knows
   how to use it. Ask DWC to confirm the exact command already used for
   Manoranjini and Peries (so everyone's set up identically) — it will look
   like this:
   ```bash
   claude mcp add --transport stdio hub-db --scope user \
     -- npx -y <the-postgres-mcp-package-DWC-specifies> --dsn "$HUB_DB_URL"
   ```
   The important part is `--scope user` — that makes the connector
   available in every project on your machine, not just one folder.

3. **Verify it connected:**
   ```bash
   claude mcp list
   ```
   You should see `hub-db` listed as connected. If it shows an error, don't
   guess — send DWC the exact error text.

---

## Part 5 — Set up the two hub files (one time only)

Get **`team_hub_push_prompt.md`** and **`push_to_hub.js`** from DWC (already
prepared and shared with you). Put them both in a folder on your computer —
any folder is fine, as long as they're together.

1. Open **`team_hub_push_prompt.md`** in any text editor.
2. Find this line near the top:
   ```
   MEMBER_NAME = "your-name-here"
   ```
3. Replace `your-name-here` with your own name exactly as DWC told you to
   spell it (lowercase, no spaces) — for example `apirame`.
4. Save the file. **Don't change anything else in it, and don't edit this
   line again after today.**

5. **Install the one small tool the script needs** (`pg`, which lets it
   talk to the database). In your terminal, inside that same folder:
   ```bash
   npm install pg
   ```
   You'll see a `node_modules` folder appear — that's normal, leave it.

---

## Part 6 — Push your first dashboard

You're fully set up. From here on, this is *all* you'll ever do.

1. Open a terminal in the folder with your two files.
2. Make sure your connection is set for this session (Part 4, step 1) if
   you're in a fresh terminal:
   ```bash
   export HUB_DB_URL="paste-the-connection-string-here"
   ```
3. Run the push, filling in your own details:
   ```bash
   node push_to_hub.js "your-member-name" "your-page-slug" "Your Page Title" "/full/path/to/your/dashboard.html"
   ```
   Example:
   ```bash
   node push_to_hub.js "apirame" "july-inventory-report" "July Inventory Report" "/Users/apirame/Desktop/dashboard.html"
   ```
4. You should see:
   ```
   Pushed successfully: { id: ..., member_name: 'apirame', page_slug: 'july-inventory-report', updated_at: ... }
   ```
   That's it — it's live.
5. Check it: go to
   [varman-aios-hub-varmens.vercel.app](https://varman-aios-hub-varmens.vercel.app),
   click your name, and you'll see it there.

**Prefer to just tell Claude Code what you want, instead of typing the
command yourself?** That's what `team_hub_push_prompt.md` is for — hand
Claude Code both files and say:

> "Push `dashboard.html` to the hub as slug `july-inventory-report` titled
> 'July Inventory Report'."

Claude Code will read the rules in that file and run the same command for
you.

---

## Part 7 — Every time after this

Every future dashboard is just Part 6 again:
1. Build your dashboard as usual.
2. Open a terminal, set `HUB_DB_URL` if it's a new session.
3. Run `node push_to_hub.js ...` (or ask Claude Code, using the prompt
   file) with your name, a slug, a title, and the file path.
4. Check the hub.

Re-using the same `page_slug` for a dashboard you're updating replaces it
in place — that's expected, not an error.

---

## Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| `Missing HUB_DB_URL environment variable` | You didn't set the connection string in this terminal session | Re-run the `export`/`$env:` command from Part 4/6 |
| `File not found: ...` | The path to your HTML file is wrong | Double-check the full path; drag the file into the terminal to auto-fill its path |
| `permission denied` or a login/auth error | The connection string is wrong or expired | Ask DWC to confirm it — don't guess or modify it yourself |
| `Cannot find module 'pg'` | You skipped `npm install pg`, or ran the command from a different folder | Run `npm install pg` again inside the folder with `push_to_hub.js` |
| Dashboard doesn't appear on the hub | The push likely didn't actually succeed | Scroll up and re-check the terminal output for an error message before assuming it worked |
| Anything else | — | Send DWC the exact text from your terminal — don't paraphrase it |

---

## The two hard rules, one more time

- **Always your own `member_name`.** Never anyone else's, even by accident.
- **Never share the connection string** outside your own terminal — not in
  chat, not in a screenshot, not in a file you send anyone.

That's the whole system. Once Part 4 and Part 5 are done, publishing a
dashboard takes under a minute.
