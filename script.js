const activeNavLinks = document.querySelectorAll(".nav-item[data-section-link], .gxro-link[data-section-link], .site-name[data-section-link]");
const sectionTriggers = document.querySelectorAll("[data-section-link]");
const sections = document.querySelectorAll("[data-section]");

function setActiveSection(sectionId, updateHash = true) {
  const target = document.querySelector(`[data-section="${sectionId}"]`);
  if (!target) return;

  sections.forEach((section) => {
    section.classList.toggle("active-panel", section.dataset.section === sectionId);
  });

  activeNavLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.sectionLink === sectionId);
  });

  if (updateHash) {
    history.replaceState(null, "", `#${sectionId}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

sectionTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    const sectionId = trigger.dataset.sectionLink;
    if (!sectionId || !document.querySelector(`[data-section="${sectionId}"]`)) return;

    event.preventDefault();
    setActiveSection(sectionId);
  });
});

const initialSection = window.location.hash.replace("#", "") || "home";
setActiveSection(initialSection, false);
