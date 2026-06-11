const sectionLinks = document.querySelectorAll("[data-section-link]");
const sections = document.querySelectorAll("[data-section]");

function setActiveSection(sectionId) {
  sectionLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.sectionLink === sectionId);
  });
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

  if (visible) {
    setActiveSection(visible.target.dataset.section);
  }
}, {
  root: null,
  threshold: [0.28, 0.45, 0.62]
});

sections.forEach((section) => observer.observe(section));
