// Landing + workflows motion. Progressive enhancement: with no JS or with reduced motion everything is simply visible.
//  - Lenis smooth scroll, anchor links glide
//  - h1/h2: each word rises out of a clipped line; <em> accent words get a hand-drawn underline
//  - blocks blur up as they enter, siblings staggered
//  - one rAF scroll loop: nav state, reading progress, parallax, hero copy drift, the steps' progress bar
//  - figures count up, cards get a pointer spotlight
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const nav = document.querySelector(".nav");
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ---- smooth scroll
let lenis = null;
if (!reduced && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
  const raf = (t) => (lenis.raf(t), requestAnimationFrame(raf));
  requestAnimationFrame(raf);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || a.hash.length < 2) return;
  const t = document.querySelector(a.hash);
  if (!t) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(t, { offset: -56, duration: 1.4 });
  else t.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  history.replaceState(null, "", a.hash);
});

// ---- split headings into masked words
const UNDERLINE = "M3 13 C 50 5, 112 3, 162 9 S 252 17, 297 6";
function splitWords(el) {
  let n = 0;
  const wrapText = (node) => {
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) return frag.append(" ");
      const w = document.createElement("span");
      w.className = "w";
      const inner = document.createElement("span");
      inner.textContent = part;
      inner.style.setProperty("--d", n++);
      w.append(inner);
      frag.append(w);
    });
    node.replaceWith(frag);
  };
  const walk = (parent) =>
    [...parent.childNodes].forEach((c) => {
      if (c.nodeType === 3) wrapText(c);
      else if (c.nodeType === 1 && !c.classList.contains("w")) walk(c);
    });
  walk(el);
  el.querySelectorAll("em").forEach((em) => {
    em.insertAdjacentHTML("beforeend", `<svg class="ul" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="${UNDERLINE}"/></svg>`);
    em.style.setProperty("--ud", `${n * 38 + 420}ms`);
  });
  el.setAttribute("aria-label", el.textContent.trim());
  el.classList.add("split-words");
}

const heads = $$("h1, .band h2");
if (!reduced) heads.forEach(splitWords);
else root.classList.remove("js");

// ---- reveal on scroll
const blocks = reduced
  ? []
  : $$(".band .eyebrow, .band .sub, .band .note, .card, .layer, .attack, .steps li, .ledger li, .table-wrap, .proof, .code, .figure, .band .hero-cta, .band > .wrap > .grid3");
const used = new Map();
blocks.forEach((el) => {
  const n = used.get(el.parentElement) ?? 0;
  used.set(el.parentElement, n + 1);
  el.style.setProperty("--i", Math.min(n, 6));
  el.classList.add("rv");
});
if (!reduced && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        if (e.target.dataset.count !== undefined || e.target.querySelector?.("[data-count]")) countUp(e.target);
        io.unobserve(e.target);
      }),
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
  );
  heads.filter((h) => h.tagName === "H2").forEach((h) => io.observe(h));
  blocks.forEach((el) => io.observe(el));
  // the hero headline plays on load
  const h1 = document.querySelector("h1.split-words");
  if (h1) requestAnimationFrame(() => setTimeout(() => h1.classList.add("in"), 180));
  // never leave content hidden if the observer is starved (print, background tab)
  setTimeout(() => [...heads, ...blocks].forEach((el) => el.classList.add("in")), 9000);
}

// ---- count-up figures
function countUp(scope) {
  $$("[data-count]", scope).forEach((el) => {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const to = Number(el.dataset.count);
    const dp = Number(el.dataset.dp ?? 0);
    const t0 = performance.now();
    const dur = 1700;
    const step = (t) => {
      const p = clamp((t - t0) / dur);
      const e = 1 - Math.pow(2, -10 * p);
      el.textContent = (to * (p === 1 ? 1 : e)).toFixed(dp);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---- nav, progress, parallax, hero drift, steps bar: one rAF per scroll burst, transforms only
const bar = Object.assign(document.createElement("div"), { className: "progress" });
nav?.append(bar);
const par = $$("[data-parallax]").map((el) => ({ el, f: Number(el.dataset.parallax) }));
const heroCopy = document.querySelector(".hero-copy");
const steps = $$(".steps");
let queued = false;
const frame = () => {
  queued = false;
  const y = lenis ? lenis.scroll : scrollY;
  const max = root.scrollHeight - innerHeight;
  nav?.classList.toggle("scrolled", y > 8);
  bar.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
  if (reduced) return;
  for (const { el, f } of par) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) continue;
    el.style.transform = `translate3d(0, ${((r.top + r.height / 2 - innerHeight / 2) * -f).toFixed(1)}px, 0)`;
  }
  if (heroCopy && y < innerHeight) {
    heroCopy.style.transform = `translate3d(0, ${(y * 0.22).toFixed(1)}px, 0)`;
    heroCopy.style.opacity = String(clamp(1 - y / (innerHeight * 0.7)));
  }
  for (const s of steps) {
    const r = s.getBoundingClientRect();
    s.style.setProperty("--p", clamp((innerHeight * 0.9 - r.top) / (r.height + innerHeight * 0.45)).toFixed(3));
  }
};
const onScroll = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(frame);
};
if (lenis) lenis.on("scroll", onScroll);
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll, { passive: true });
frame();

// ---- which section are we in
const links = new Map($$(".nav-links a[href^='#']").map((a) => [a.getAttribute("href").slice(1), a]));
if ("IntersectionObserver" in window && links.size) {
  const spy = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && links.forEach((a, id) => a.toggleAttribute("aria-current", id === e.target.id))),
    { rootMargin: "-45% 0px -50% 0px" },
  );
  links.forEach((_, id) => document.getElementById(id) && spy.observe(document.getElementById(id)));
}

// ---- pointer spotlight on cards
if (!reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest?.(".card, .layer, .attack, .steps li");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}
