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

let activeFilter = "all";
let activeSearch = "";

function applyIssueFilters() {
  const rows = document.querySelectorAll("#issues-tbody tr");
  let visible = 0;

  rows.forEach((row) => {
    const classification = row.dataset.classification || "";
    const priority       = row.dataset.priority       || "";
    const status         = row.dataset.status         || "";
    const text           = row.textContent.toLowerCase();

    /* ---- Filter match ---- */
    let filterMatch = false;
    switch (activeFilter) {
      case "all":          filterMatch = true;                         break;
      case "daily-issue":  filterMatch = classification === "daily-issue"; break;
      case "critical":     filterMatch = priority === "critical";      break;
      case "high":         filterMatch = priority === "high";          break;
      case "medium":       filterMatch = priority === "medium";        break;
      case "investigation":filterMatch = status === "investigation";   break;
      case "resolved":     filterMatch = status === "resolved";        break;
      default:             filterMatch = true;
    }

    /* ---- Search match ---- */
    const searchMatch = activeSearch === "" || text.includes(activeSearch);

    const show = filterMatch && searchMatch;
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
  /* Filter pills */
  document.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
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

/* ---- Boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  renderDate();
  initNav();
  initIssueFilters();
});
