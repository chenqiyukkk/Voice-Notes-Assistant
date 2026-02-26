"use strict";

(() => {
  const scrollProgress = document.getElementById("scrollProgress");
  const revealEls = Array.from(document.querySelectorAll(".reveal"));
  const statEls = Array.from(document.querySelectorAll(".stat-num[data-count]"));
  const switchButtons = Array.from(document.querySelectorAll(".screen-btn"));
  const shots = Array.from(document.querySelectorAll(".screen-shot"));
  const orbs = Array.from(document.querySelectorAll(".orb"));
  const body = document.body;

  function updateScrollProgress() {
    if (!scrollProgress) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    scrollProgress.style.width = `${ratio * 100}%`;
  }

  function updateParallax() {
    const depth = window.scrollY * 0.08;
    body.style.setProperty("--scroll-depth", `${depth}px`);
    orbs.forEach((orb, index) => {
      const factor = index % 2 === 0 ? 0.12 : -0.1;
      const translateY = window.scrollY * factor;
      orb.style.transform = `translate3d(0, ${translateY}px, 0)`;
    });
  }

  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    revealEls.forEach((el) => observer.observe(el));
  }

  function animateCount(el, target) {
    const start = performance.now();
    const duration = 920;
    const initial = 0;

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(initial + (target - initial) * eased);
      el.textContent = String(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  function initCounters() {
    if (!statEls.length) return;
    if (!("IntersectionObserver" in window)) {
      statEls.forEach((el) => {
        const target = Number(el.dataset.count || "0");
        el.textContent = String(target);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = Number(el.dataset.count || "0");
          animateCount(el, target);
          observer.unobserve(el);
        });
      },
      { threshold: 0.5 },
    );

    statEls.forEach((el) => observer.observe(el));
  }

  function switchShot(target) {
    shots.forEach((shot) => {
      shot.classList.toggle("is-active", shot.dataset.shot === target);
    });
    switchButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.target === target);
      btn.setAttribute("aria-selected", btn.dataset.target === target ? "true" : "false");
    });
  }

  function initShotSwitcher() {
    if (!switchButtons.length || !shots.length) return;
    switchButtons.forEach((btn) => {
      btn.setAttribute("aria-selected", btn.classList.contains("is-active") ? "true" : "false");
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (!target) return;
        switchShot(target);
      });
    });
  }

  function onScroll() {
    updateScrollProgress();
    updateParallax();
  }

  initReveal();
  initCounters();
  initShotSwitcher();
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", updateScrollProgress);
})();
