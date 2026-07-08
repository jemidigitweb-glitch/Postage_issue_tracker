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
  "#dashboard":       "section-dashboard",
  "#booking":         "section-booking",
  "#couriers":        "section-couriers",
  "#issues":          "section-issues",
  "#reports":         "section-reports",
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

  /* Initial paint */
  showSection(window.location.hash || "#dashboard");
  setActiveNav();
}

/* ---- Boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  renderDate();
  initNav();
});
