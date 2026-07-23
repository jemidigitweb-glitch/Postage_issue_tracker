/* =========================================================
   LEDSone Postage Workspace — Submission Script
   Vanilla JS only — no frameworks
   ========================================================= */

/* ---- Live date in header ---- */
function renderDate() {
  const el = document.getElementById("header-date");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ---- Active nav link ---- */
function setActiveNav() {
  const links = document.querySelectorAll(".sidebar-nav a");
  const current = window.location.hash || "#dashboard";
  links.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === current);
  });
}

/* ---- SPA-style hash navigation ---- */
const SECTIONS = {
  "#dashboard": "section-dashboard",
  "#booking":   "section-booking",
  "#couriers":  "section-couriers",
  "#issues":    "section-issues",
  "#reports":   "section-reports",
};

function showSection(hash) {
  const target = SECTIONS[hash] || SECTIONS["#dashboard"];
  Object.values(SECTIONS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = el.id !== target;
  });
}

function navigate(hash) {
  window.location.hash = hash;
  showSection(hash);
  setActiveNav();
  window.scrollTo(0, 0);
}

/* ---- Wire sidebar links ---- */
function initNav() {
  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(link.getAttribute("href"));
    });
  });

  window.addEventListener("hashchange", () => {
    showSection(window.location.hash);
    setActiveNav();
  });

  showSection(window.location.hash || "#dashboard");
  setActiveNav();
}

/* ================================================================
   OPEN ISSUES — filter + search
   ================================================================ */

let activeDomain = "all";
let activeStatus = "all";
let activePerson = "all";
let activeSearch = "";

function applyIssueFilters() {
  const countEl = document.getElementById("issues-count");

  /* ---- Daily Issues rows ---- */
  const legacyRows = document.querySelectorAll("#issues-tbody tr");
  let legacyVisible = 0;

  legacyRows.forEach((row) => {
    const priority = row.dataset.priority || "";
    const status   = row.dataset.status   || "";
    const domain   = row.dataset.domain   || "";
    const text     = row.textContent.toLowerCase();

    /* Domain match */
    const domainMatch = activeDomain === "all" || domain === activeDomain;

    /* Status / priority match */
    let statusMatch = false;
    switch (activeStatus) {
      case "all":           statusMatch = true;                        break;
      case "critical":      statusMatch = priority === "critical";     break;
      case "high":          statusMatch = priority === "high";         break;
      case "medium":        statusMatch = priority === "medium";       break;
      case "investigation": statusMatch = status === "investigation";  break;
      case "resolved":      statusMatch = status === "resolved";       break;
      default:              statusMatch = true;
    }

    /* Person match */
    const person      = (row.dataset.person || "").toLowerCase();
    const personMatch = activePerson === "all" || person === activePerson;

    /* Search match */
    const searchMatch = activeSearch === "" || text.includes(activeSearch);

    const show = domainMatch && statusMatch && personMatch && searchMatch;
    row.classList.toggle("issue-row-hidden", !show);
    if (show) legacyVisible++;
  });

  if (countEl) {
    const total = legacyRows.length;
    countEl.textContent = legacyVisible === total
      ? `Showing all ${total} issues`
      : `Showing ${legacyVisible} of ${total} issues`;
  }
}

function initIssueFilters() {
  /* Domain filter pills */
  document.querySelectorAll(".domain-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".domain-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeDomain = btn.dataset.domainFilter;
      applyIssueFilters();
    });
  });

  /* Status / priority filter pills */
  document.querySelectorAll(".status-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".status-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeStatus = btn.dataset.statusFilter;
      applyIssueFilters();
    });
  });

  /* Person filter pills */
  document.querySelectorAll(".person-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".person-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activePerson = btn.dataset.personFilter;
      applyIssueFilters();
    });
  });

  /* Search box */
  const searchInput = document.getElementById("issues-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      activeSearch = searchInput.value.trim().toLowerCase();
      applyIssueFilters();
    });
  }
}

/* ================================================================
   STATISTICS — recalculate from all rows after import
   ================================================================ */
function recalculateStats() {
  const rows = document.querySelectorAll("#issues-tbody tr");
  let total = 0, critical = 0, high = 0, medium = 0, resolved = 0;

  rows.forEach((row) => {
    total++;
    const p = (row.dataset.priority || "").toLowerCase();
    const s = (row.dataset.status   || "").toLowerCase();
    if (p === "critical") critical++;
    if (p === "high")     high++;
    if (p === "medium")   medium++;
    if (s === "resolved") resolved++;
  });

  const set = (cls, val) => {
    const el = document.querySelector("." + cls);
    if (el) el.textContent = val;
  };
  set("num-total",    total);
  set("num-open",     critical);
  set("num-invest",   high);
  set("num-monitor",  medium);
  set("num-resolved", resolved);
}

/* ================================================================
   ADD LATEST ISSUES
   Primary path : POST /api/import-issues → local server (persistent)
   Fallback path: window.AIOS_ISSUES_DATA  → in-session only
   ================================================================ */

const IMPORT_ENDPOINT       = "/api/import-issues";
const SET_PRIORITY_ENDPOINT = "/api/set-priority";

function getDomIssueIds() {
  const ids = new Set();
  document.querySelectorAll("#issues-tbody tr").forEach((row) => {
    const badge = row.querySelector(".issue-id-badge");
    if (badge) ids.add(badge.textContent.trim());
  });
  return ids;
}

function buildIssueRow(issue) {
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const id   = issue.id;
  const date = issue.date || "—";
  const dom  = esc(issue.domain  || "");
  const pri  = esc(issue.priority || "");
  const sts  = esc(issue.status   || "investigation");

  const resHtml =
    `<div class="resolution-group" data-issue="${id}">` +
    `<button class="res-btn res-not" data-value="not-solved" aria-pressed="false">` +
    `<span class="res-icon">&#x2610;</span> Not Solved</button>` +
    `<button class="res-btn res-half" data-value="half-solved" aria-pressed="false">` +
    `<span class="res-icon">&#x2610;</span> Half Solved</button>` +
    `<button class="res-btn res-solved" data-value="solved" aria-pressed="false">` +
    `<span class="res-icon">&#x2610;</span> Solved</button></div>`;

  const tr = document.createElement("tr");
  tr.dataset.classification = "daily-issue";
  tr.dataset.domain   = dom;
  tr.dataset.priority = pri;
  tr.dataset.status   = sts;

  tr.innerHTML =
    `<td class="col-date">${esc(date)}</td>` +
    `<td class="col-id"><span class="issue-id-badge">${esc(id)}</span></td>` +
    `<td class="col-priority">${issue.priorityBadge || "<span class='badge badge-tbd'>TBD</span>"}</td>` +
    `<td class="col-issue"><strong>${esc(id)} — ${esc(issue.title || "")}</strong></td>` +
    `<td class="col-what">${esc(issue.what || "")}</td>` +
    `<td class="col-gap"><span class="${esc(issue.gapClass || "gap-none")}">${esc(issue.gapLabel || "—")}</span></td>` +
    `<td class="col-fix"><p class="fix-text">${esc(issue.fix || "")}</p></td>` +
    `<td class="col-owner"><span class="owner-tag">&#128100; ${esc(issue.owner || "—")}</span></td>` +
    `<td class="col-solved">${resHtml}</td>` +
    `<td class="col-evidence">${issue.evidenceHtml || '<span class="evidence-none">No Evidence Available</span>'}</td>`;

  return tr;
}

function wireNewRow(tr) {
  const group   = tr.querySelector(".resolution-group");
  if (!group) return;
  const issueId = group.dataset.issue;
  const lsKey   = "issue-resolution-" + issueId;
  const stored  = localStorage.getItem(lsKey) || "";
  applyResolution(group, stored);
  group.querySelectorAll(".res-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const already = btn.getAttribute("aria-pressed") === "true";
      if (already) {
        applyResolution(group, "");
        localStorage.removeItem(lsKey);
      } else {
        applyResolution(group, btn.dataset.value);
        localStorage.setItem(lsKey, btn.dataset.value);
      }
    });
  });
}

function showPanelMessage(bodyEl, html) {
  bodyEl.innerHTML = html;
}

function initAddIssuesPanel() {
  const btn   = document.getElementById("btn-add-latest");
  const panel = document.getElementById("add-issues-panel");
  const close = document.getElementById("add-issues-close");
  const body  = document.getElementById("add-issues-body");
  if (!btn || !panel || !close || !body) return;

  let importInFlight = false;

  /* ── Primary path: call local server ──────────────────────────── */
  function runServerImport() {
    if (importInFlight) return;
    importInFlight = true;

    showPanelMessage(body, `<p class="add-issues-checking">&#8987; Checking for new issues&hellip;</p>`);

    fetch(IMPORT_ENDPOINT, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((result) => {
        importInFlight = false;
        handleServerResult(result);
      })
      .catch(() => {
        /* Server not running — fall back to in-memory (issues-data.js) */
        importInFlight = false;
        runFallbackImport();
      });
  }

  /* ── Handle a successful server response ──────────────────────── */
  function handleServerResult(result) {
    if (!result.success) {
      const rejHtml = result.rejected && result.rejected.length
        ? "<ul>" + result.rejected.map((r) =>
            `<li><strong>${r.id}</strong>: ${(r.errors || []).join("; ")}</li>`
          ).join("") + "</ul>"
        : "";
      showPanelMessage(body,
        `<p class="add-issues-error">&#10005; Import failed.</p>
         <p>${result.message || "Unknown error."}</p>
         ${rejHtml}`
      );
      return;
    }

    if (result.imported && result.imported.length > 0) {
      const list = result.imported.map((id) => `<li>${id}</li>`).join("");
      showPanelMessage(body,
        `<p class="add-issues-success">&#10003; ${result.imported.length} issue(s) imported successfully.</p>
         <ul>${list}</ul>
         <p class="add-issues-note">Reloading dashboard&hellip;</p>`
      );
      /* Reload so the patched index.html rows are visible */
      setTimeout(() => { window.location.reload(); }, 1200);
      return;
    }

    /* No new issues */
    const skipList = result.skipped && result.skipped.length
      ? `<details class="add-issues-skip-details">
           <summary>${result.skipped.length} issue(s) already present</summary>
           <ul>${result.skipped.map((id) => `<li>${id}</li>`).join("")}</ul>
         </details>`
      : "";
    showPanelMessage(body,
      `<p class="add-issues-success">&#10003; Dashboard is already up to date. No new issues found.</p>
       ${skipList}`
    );
  }

  /* ── Fallback path: in-memory from window.AIOS_ISSUES_DATA ───── */
  function runFallbackImport() {
    const data = window.AIOS_ISSUES_DATA;

    if (!data || !Array.isArray(data) || data.length === 0) {
      showPanelMessage(body,
        `<p class="add-issues-error">&#10005; Local server is not running and no import data is available.</p>
         <p>Start the dashboard server with:</p>
         <code class="add-issues-cmd">python3 tools/serve.py</code>
         <p class="add-issues-note">Or open the dashboard via <code>./start-dashboard.sh</code></p>`
      );
      return;
    }

    const domIds   = getDomIssueIds();
    const toImport = data.filter((issue) => !domIds.has(issue.id));

    if (toImport.length === 0) {
      showPanelMessage(body,
        `<p class="add-issues-success">&#10003; Dashboard is already up to date. No new issues found.</p>
         <p class="add-issues-note">&#9432; Running in offline mode (local server not detected).
         Start the server for permanent importing.</p>`
      );
      return;
    }

    const listHtml = toImport.map((i) =>
      `<li><strong>${i.id}</strong> — ${i.domain} — ${i.date || "no date"}</li>`
    ).join("");

    showPanelMessage(body,
      `<p><strong>${toImport.length} new issue(s) available (offline / session-only mode):</strong></p>
       <ul>${listHtml}</ul>
       <button class="btn-do-import" id="btn-do-import">&#43; Import for this session</button>
       <p class="add-issues-note">&#9888; Local server not running. These rows will be added to
       the current page only and will not persist after a browser refresh.<br>
       For permanent importing, start the server: <code>./start-dashboard.sh</code></p>`
    );

    const doBtn = document.getElementById("btn-do-import");
    if (doBtn) {
      doBtn.addEventListener("click", () => {
        const tbody = document.getElementById("issues-tbody");
        if (!tbody) return;

        const alreadyNow = getDomIssueIds();
        const stillNew   = toImport.filter((issue) => !alreadyNow.has(issue.id));

        stillNew.forEach((issue) => {
          const tr = buildIssueRow(issue);
          tbody.appendChild(tr);
          wireNewRow(tr);
        });

        recalculateStats();
        applyIssueFilters();

        const imported = stillNew.map((i) => `<li>${i.id}</li>`).join("");
        showPanelMessage(body,
          `<p class="add-issues-success">&#10003; ${stillNew.length} issue(s) added to this session.</p>
           <ul>${imported}</ul>
           <p class="add-issues-note">&#9888; Session-only. Start the server for permanent imports.</p>`
        );
      });
    }
  }

  /* ── Panel open/close wiring ──────────────────────────────────── */
  btn.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden  = !panel.hidden;
    if (opening) {
      showPanelMessage(body, `<p class="add-issues-checking">&#8987; Checking for new issues&hellip;</p>`);
      runServerImport();
    }
  });

  close.addEventListener("click", () => { panel.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") panel.hidden = true;
  });
}

/* ================================================================
   RESOLUTION TOGGLE — three-option manual field per issue
   localStorage key : issue-resolution-ISSUE-001 … PH-NIV-014 … A001 …
   Stored values    : "solved" | "half-solved" | "not-solved" | (absent = empty)
   Rules:
     - Only one option selected at a time (radio behaviour)
     - Clicking selected option again clears selection (deselect)
     - Not Solved  → red    (aria-pressed="true" on res-not btn)
     - Half Solved → yellow (aria-pressed="true" on res-half btn)
     - Solved      → green  (aria-pressed="true" on res-solved btn)
   ================================================================ */

const RES_ICON_OFF = "&#x2610;"; // ☐
const RES_ICON_ON  = "&#x2611;"; // ☑

function applyResolution(group, value) {
  group.querySelectorAll(".res-btn").forEach((btn) => {
    const isSelected = btn.dataset.value === value;
    btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    btn.querySelector(".res-icon").innerHTML = isSelected ? RES_ICON_ON : RES_ICON_OFF;
  });
}

function initResolutionToggles() {
  document.querySelectorAll(".resolution-group").forEach((group) => {
    const issueId = group.dataset.issue;
    const lsKey   = "issue-resolution-" + issueId;

    // Restore persisted selection
    const stored = localStorage.getItem(lsKey) || "";
    applyResolution(group, stored);

    // Wire each button
    group.querySelectorAll(".res-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isAlreadySelected = btn.getAttribute("aria-pressed") === "true";

        if (isAlreadySelected) {
          // Click on already-selected → clear both
          applyResolution(group, "");
          localStorage.removeItem(lsKey);
        } else {
          // Select clicked, deselect the other
          applyResolution(group, btn.dataset.value);
          localStorage.setItem(lsKey, btn.dataset.value);
        }
      });
    });
  });
}

/* ================================================================
   TBD PRIORITY SELECTOR
   Only Daily Issue rows (in #issues-tbody) whose current canonical
   data-priority is "" (TBD) receive a selector.
   Already-assigned rows (including PH-NIV-* with explicit priorities) are skipped.
   ================================================================ */

function renderPriorityDropdowns() {
  const rows = document.querySelectorAll("#issues-tbody tr");
  rows.forEach((row) => {
    /* Only rows with empty data-priority (TBD) are eligible */
    if ((row.dataset.priority || "") !== "") return;

    const cell = row.querySelector(".col-priority");
    if (!cell) return;

    /* Idempotent — skip if selector already rendered in this cell */
    if (cell.querySelector(".priority-select")) return;

    /* Resolve issue ID from the badge in this row */
    const badge = row.querySelector(".issue-id-badge");
    if (!badge) return;
    const issueId = badge.textContent.trim();
    const isIssueNNN = /^ISSUE-\d+$/.test(issueId);
    const isAtisraj  = /^A\d{3}$/.test(issueId);
    if (!isIssueNNN && !isAtisraj) return;

    const sel = document.createElement("select");
    sel.className = "priority-select";
    sel.innerHTML =
      '<option value="" selected disabled>Set priority…</option>' +
      '<option value="critical">Critical</option>' +
      '<option value="high">High</option>' +
      '<option value="medium">Medium</option>';

    sel.addEventListener("change", () => {
      if (!sel.value) return;
      if (isAtisraj) {
        localStorage.setItem("issue-priority-" + issueId, sel.value);
        row.dataset.priority = sel.value;
        const cap = sel.value.charAt(0).toUpperCase() + sel.value.slice(1);
        cell.innerHTML = `<span class="badge badge-${sel.value}">${cap}</span>`;
        recalculateStats();
        applyIssueFilters();
      } else {
        setPriority(issueId, sel.value, sel);
      }
    });

    cell.innerHTML = "";
    cell.appendChild(sel);
  });
}

function restoreAtisrajPriorities() {
  document.querySelectorAll('#issues-tbody tr[data-person="atisraj"]').forEach((row) => {
    const badge = row.querySelector(".issue-id-badge");
    if (!badge) return;
    const issueId = badge.textContent.trim();
    if (!/^A\d{3}$/.test(issueId)) return;
    const stored = localStorage.getItem("issue-priority-" + issueId);
    if (!stored) return;
    row.dataset.priority = stored;
    const cell = row.querySelector(".col-priority");
    if (!cell) return;
    const cap = stored.charAt(0).toUpperCase() + stored.slice(1);
    cell.innerHTML = `<span class="badge badge-${stored}">${cap}</span>`;
  });
}

function setPriority(issueId, priority, sel) {
  if (!issueId || !priority) return;

  /* Prevent duplicate submission while request is in flight */
  sel.disabled = true;

  fetch(SET_PRIORITY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueId, priority }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (result.success) {
        /* Optimistic visual: replace selector with the correct badge while
           the page reload loads (avoids a flash of TBD on reload start) */
        const cap = priority.charAt(0).toUpperCase() + priority.slice(1);
        const cell = sel.parentElement;
        if (cell) {
          cell.innerHTML =
            `<span class="badge badge-${priority}">${cap}</span>` +
            `<span class="priority-set-ok">✓ Saving…</span>`;
        }
        setTimeout(() => { window.location.reload(); }, 1200);
      } else {
        /* Failure: re-enable selector, keep selected value visible, show error */
        sel.disabled = false;
        const cell = sel.closest("td");
        if (cell) {
          const err = document.createElement("div");
          err.className = "priority-set-error";
          err.textContent = result.message || "Failed to set priority. Please try again.";
          cell.appendChild(err);
          setTimeout(() => { err.remove(); }, 6000);
        }
      }
    })
    .catch(() => {
      /* Network error or server unavailable — keep selected value visible, show error */
      sel.disabled = false;
      const cell = sel.closest("td");
      if (cell) {
        const err = document.createElement("div");
        err.className = "priority-set-error";
        err.textContent = "Could not reach server. Priority not saved. Please try again.";
        cell.appendChild(err);
        setTimeout(() => { err.remove(); }, 6000);
      }
    });
}

/* ---- Boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  renderDate();
  initNav();
  initIssueFilters();
  initResolutionToggles();
  initAddIssuesPanel();
  restoreAtisrajPriorities(); /* restore localStorage-persisted priorities for A001–A023 before stats run */
  recalculateStats();   /* counters reflect actual DOM rows, not hardcoded HTML values */
  applyIssueFilters();  /* count-line and section-count-label correct on initial load */
  renderPriorityDropdowns(); /* TBD-only priority selectors for Daily Issues + A001–A023 */
});
