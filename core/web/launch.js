import { Scene3D } from "/scene3d.js";

const $ = (id) => document.getElementById(id);
const short = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "–");
const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) document.documentElement.classList.add("reduced");

// ------------------------------------------------------------- reveals
let pending = [...document.querySelectorAll(".reveal")];
function reveal() {
  pending = pending.filter((el) => {
    if (el.getBoundingClientRect().top > innerHeight * 0.9) return true;
    el.classList.add("in");
    return false;
  });
}

// ---------------------------------------------------- statement words
const statement = $("statementText");
statement.innerHTML = statement.textContent
  .trim()
  .split(/\s+/)
  .map((w) => `<span class="w">${w}</span>`)
  .join(" ");
const words = [...statement.querySelectorAll(".w")];

// ------------------------------------------------------ scroll engine
/** 0 when the section's top reaches the viewport top, 1 when its pinned run is over. */
function progress(el) {
  const r = el.getBoundingClientRect();
  const run = r.height - innerHeight;
  return run > 0 ? clamp(-r.top / run) : clamp(1 - r.top / innerHeight);
}

const nav = $("localnav");
const bands = [...document.querySelectorAll("main > header, main > section, body > footer")];
const heroStage = $("heroStage");
const story = $("checkpoint");
const device = $("device");
const chapters = [...document.querySelectorAll("#chapters li")];
const dots = [...document.querySelectorAll(".progress i")];
const kill = $("kill");
const STATES = [
  ["holding", "orange"],
  ["asking 0G", "blue"],
  ["answer signed", "blue"],
  ["verifying", "yellow"],
  ["descend · recorded", "green"],
];
let step = -1;

function setStep(n) {
  if (n === step) return;
  step = n;
  device.dataset.step = String(n);
  chapters.forEach((li, i) => {
    li.classList.toggle("on", i === n);
    li.classList.toggle("past", i < n);
  });
  dots.forEach((d, i) => d.classList.toggle("on", i === n));
  const [text, tone] = STATES[n];
  const cap = $("devState");
  cap.textContent = text;
  cap.className = `capsule ${tone}`;
}

function frame() {
  reveal();
  nav.classList.toggle("stuck", scrollY > 8);
  // the nav takes the material of whatever section sits under it
  const under = bands.find((b) => {
    const r = b.getBoundingClientRect();
    return r.top <= 26 && r.bottom > 26;
  });
  nav.classList.toggle("light", !!under?.classList.contains("light"));
  if (reduced) return;

  // hero: the stage grows to full bleed over the first screen of scroll
  const hr = heroStage.getBoundingClientRect();
  heroStage.style.setProperty("--p", clamp((innerHeight - hr.top) / (innerHeight * 1.1) - 0.35).toFixed(3));

  // statement: words light up in reading order
  const sp = progress($("statement"));
  const lit = Math.round(clamp((sp - 0.08) / 0.75) * words.length);
  words.forEach((w, i) => w.classList.toggle("lit", i < lit));

  // checkpoint: five steps across the pinned run
  setStep(Math.min(4, Math.floor(progress(story) * 5.2)));

  // kill switch: the lease drains, then the verdict flips
  const kp = clamp((progress(kill) - 0.1) / 0.7);
  kill.style.setProperty("--p", kp.toFixed(3));
  kill.classList.toggle("out", kp >= 0.999);
  $("leaseMs").textContent = `${Math.round(6000 * (1 - kp))} ms`;
}

let queued = false;
const onScroll = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    frame();
  });
};
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
if (reduced) {
  setStep(3);
  words.forEach((w) => w.classList.add("lit"));
  kill.classList.add("out");
} else setStep(0);
frame();

// ---------------------------------------------------------- counters
function countUp(el, to) {
  if (reduced || !to) return void (el.textContent = to);
  const t0 = performance.now();
  const tick = (t) => {
    const k = clamp((t - t0) / 900);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- hero
const hero = new Scene3D($("hero3d"));
hero.controls.enableZoom = false;
hero.controls.enableRotate = false;
hero.controls.autoRotate = !reduced;
hero.controls.autoRotateSpeed = 0.35;

function verdicts(sim, mission) {
  const labels = mission?.profile?.ui?.labels ?? {};
  const byK = new Map();
  for (const e of mission?.entries ?? []) if (e.kind === "decision") byK.set(e.body.checkpoint, e.body);
  return (sim.checkpoints ?? []).map((cp) => {
    const d = byK.get(cp.k);
    const lab = d?.answer?.label;
    const u = labels[lab] ?? {};
    const stop = cp.outcome === "safe_stop";
    return {
      k: cp.k, x_mm: cp.target_mm[0], y_mm: cp.target_mm[1], state: cp.outcome ?? "waiting",
      color: stop ? "#ff453a" : u.color ?? "#ffd60a",
      title: stop ? `#${cp.k} safe stop` : `#${cp.k} ${u.name ?? lab ?? "asking 0G"}`,
      sub: stop ? "no decision made" : d ? `0G → ${d.action_applied}` : "",
    };
  });
}

/** Loop the last mission's flown path: real samples, 10 Hz, played at 4x. */
function replay(sim, samples) {
  if (!samples.length) return hero.update(sim, []);
  const pts = samples.map((r) => [r[1] / 1000, r[2] / 1000, r[3] / 1000]);
  let i = 0, hold = 0;
  const tick = () => {
    if (hold > 0) hold--;
    else i += 4;
    if (i >= pts.length) {
      i = 0;
      hold = 60;
      hero.resetPose();
    }
    const s = samples[Math.min(i, samples.length - 1)];
    if (i % 8 === 0 || hold) hero.update({ ...sim, pose_mm: [s[1], s[2], s[3]], attitude: null, phase: s[3] > 1500 ? "SURVEY" : "INSPECT" }, pts.slice(0, i + 1));
    requestAnimationFrame(tick);
  };
  tick();
}

async function boot() {
  const [cfg, status, robot] = await Promise.all([get("/api/config"), get("/api/status"), get("/api/robot/state?since=0")]);
  const m = status?.mission ?? null;
  const mock = cfg?.zg?.mode === "mock";
  const unsealed = cfg?.zg?.attestation === "none";
  if (unsealed) $("mockNote").textContent = "This machine is running an unsealed fallback model on 0G's Router: the decisions are real 0G calls, but the answers carry no TEE signature, so they are not enclave-attested.";
  if (mock) $("mockNote").textContent = "This machine is running the development mock of 0G right now, so its answers are signed by a local test key, not a 0G TEE.";

  const decisions = (m?.entries ?? []).filter((e) => e.kind === "decision");
  if (robot?.sim && robot.world && m && robot.mission_id === m.id) {
    hero.setWorld(robot.world, `/api/robot/world/texture.jpg?m=${m.id}&n=${robot.sim.defects.length}`);
    hero.setMarkers(verdicts(robot.sim, m));
    replay(robot.sim, robot.samples ?? []);
    $("liveCap").innerHTML = `<span class="dot"></span>Live from this machine · ${m.profile?.title ?? "mission"} · ${robot.sim.backend === "mujoco" ? "MuJoCo Skydio X2" : robot.sim.backend} · ${decisions.length} decisions${mock ? " · mock 0G" : ""}`;
  } else {
    const pv = await get("/api/scenarios/solar-farm/preview");
    if (pv) {
      hero.setWorld(pv.world, "/api/scenarios/solar-farm/preview.jpg");
      hero.update({ pose_mm: [...pv.home_mm, 0], home_mm: pv.home_mm, waypoints_mm: pv.waypoints_mm, phase: "READY" }, []);
    }
    $("liveCap").innerHTML = `<span class="dot"></span>Solar farm · ready for its first mission`;
  }

  const real = m ? decisions.filter((e) => e.body.action_applied === (m.policy?.actions?.[0] ?? "descend")).length : 2;
  const vs = $("vsReal");
  const watch = () => {
    if (vs.getBoundingClientRect().top > innerHeight * 0.8) return;
    removeEventListener("scroll", watch);
    countUp(vs, real);
  };
  addEventListener("scroll", watch, { passive: true });
  watch();
  if (!m) return;

  const d = decisions[0]?.body;
  $("rId").textContent = short(m.id, 14);
  $("rProfile").textContent = m.profile?.title ?? "–";
  $("rDec").textContent = decisions.length;
  $("rRef").textContent = (m.entries ?? []).filter((e) => e.kind === "rejected").length;
  $("rAnc").textContent = m.anchors?.length ?? 0;
  $("rReq").textContent = d?.request_id ?? "–";
  const q = new URLSearchParams({ mission: m.id });
  if (cfg?.chain) {
    q.set("network", cfg.chain.network);
    q.set("registry", cfg.chain.registry);
  }
  if (!cfg?.publicVerifierUrl || cfg?.storage?.kind !== "0g") q.set("api", location.origin);
  $("lnkVerify").href = `${cfg?.publicVerifierUrl || "/verify.html"}?${q}`;
  if (m.status === "closed") {
    $("rVer").textContent = "checking…";
    const r = await get(`/api/missions/${m.id}/verify?source=${cfg?.chain ? "storage" : "local"}`);
    if (r) {
      const pass = r.checks.filter((c) => c.status === "pass").length;
      $("rVer").innerHTML = r.ok ? `<span class="ok">Verified · ${pass} checks</span>` : `<span class="bad">${r.firstFailure ?? "failed"}</span>`;
    } else $("rVer").textContent = "unavailable";
  } else $("rVer").textContent = m.status;
}
boot();
