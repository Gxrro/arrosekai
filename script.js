const sectionLinks = document.querySelectorAll("[data-section-link]");
const sections = document.querySelectorAll("[data-section]");
const gxroGate = document.getElementById("gxroGate");
const gxroPassword = document.getElementById("gxroPassword");
const gxroGateMessage = document.getElementById("gxroGateMessage");

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

if (gxroGate) {
  gxroGate.addEventListener("submit", (event) => {
    event.preventDefault();

    if (gxroPassword.value.trim().toLowerCase() === "december") {
      sessionStorage.setItem("projectGXROUnlocked", "true");
      window.location.href = "ProjectGXRO/index.html?tab=gxro-home";
      return;
    }

    gxroGateMessage.textContent = "Incorrect password. Try december.";
    gxroPassword.select();
  });
}
