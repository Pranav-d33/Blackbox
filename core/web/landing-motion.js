// Landing page motion. Progressive enhancement: with no JS or with reduced motion everything is simply visible.
//  - the nav gains a hairline and a reading-progress bar once you scroll
//  - the nav link for the section you are in is underlined
//  - sections fade up as they enter the viewport, siblings staggered (70 ms apart, capped)
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const nav = document.querySelector(".nav");

// ---- nav state + progress (one rAF per scroll burst, transform only)
const bar = Object.assign(document.createElement("div"), { className: "progress" });
nav?.append(bar);
let queued = false;
const onScroll = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    const max = root.scrollHeight - innerHeight;
    nav?.classList.toggle("scrolled", scrollY > 8);
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    queued = false;
  });
};
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll, { passive: true });
onScroll();

// ---- which section are we in
const links = new Map([...document.querySelectorAll(".nav-links a[href^='#']")].map((a) => [a.getAttribute("href").slice(1), a]));
if ("IntersectionObserver" in window && links.size) {
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a, id) => a.toggleAttribute("aria-current", id === e.target.id));
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  links.forEach((_, id) => document.getElementById(id) && spy.observe(document.getElementById(id)));
}

// ---- scroll reveal
if (!reduced && "IntersectionObserver" in window) {
  const targets = document.querySelectorAll(
    ".band .eyebrow, .band h2, .band .sub, .band .note, .card, .layer, .attack, .steps li, .table-wrap, .proof, .code, .band .hero-cta",
  );
  const used = new Map();
  targets.forEach((el) => {
    const n = used.get(el.parentElement) ?? 0;
    used.set(el.parentElement, n + 1);
    el.style.setProperty("--i", Math.min(n, 5));
    el.classList.add("rv");
  });
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }),
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  targets.forEach((el) => io.observe(el));
  // never leave content hidden if the observer is somehow starved (e.g. print, background tab)
  setTimeout(() => targets.forEach((el) => el.classList.add("in")), 8000);
} else {
  root.classList.remove("js");
}
