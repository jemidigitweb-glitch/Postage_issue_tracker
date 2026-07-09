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
let activeSearch = "";

function applyIssueFilters() {
  const rows = document.querySelectorAll("#issues-tbody tr");
  let visible = 0;

  rows.forEach((row) => {
    const classification = row.dataset.classification || "";
    const priority       = row.dataset.priority       || "";
    const status         = row.dataset.status         || "";
    const domain         = row.dataset.domain         || "";
    const text           = row.textContent.toLowerCase();

    /* ---- Domain match ---- */
    const domainMatch = activeDomain === "all" || domain === activeDomain;

    /* ---- Status / priority match ---- */
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

    /* ---- Search match ---- */
    const searchMatch = activeSearch === "" || text.includes(activeSearch);

    const show = domainMatch && statusMatch && searchMatch;
    row.classList.toggle("issue-row-hidden", !show);
    if (show) visible++;
  });

  /* Update count line */
  const total = rows.length;
  const countEl = document.getElementById("issues-count");
  if (countEl) {
    countEl.textContent = visible === total
      ? `Showing all ${total} issues`
      : `Showing ${visible} of ${total} issues`;
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
   RESOLUTION TOGGLE — two-option manual field per issue
   localStorage key : issue-resolution-ISSUE-001 … ISSUE-013
   Stored values    : "solved" | "not-solved" | (absent = empty)
   Rules:
     - Only one option selected at a time (radio behaviour)
     - Clicking selected option again clears both (deselect)
     - Solved  → green  (aria-pressed="true" on res-solved btn)
     - Not Solved → red (aria-pressed="true" on res-not btn)
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

/* ---- Boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  renderDate();
  initNav();
  initIssueFilters();
  initResolutionToggles();
});
