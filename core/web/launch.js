import { Scene3D } from "/scene3d.js";

const $ = (id) => document.getElementById(id);
const short = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "–");
const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// ------------------------------------------------------------- reveals
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { rootMargin: "0px 0px -4% 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---------------------------------------------------------------- hero
const hero = new Scene3D($("hero3d"));
hero.controls.enableZoom = false;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
hero.controls.autoRotate = !still;
hero.controls.autoRotateSpeed = 0.45;
hero.renderer.domElement.addEventListener("pointerdown", () => (hero.controls.autoRotate = false), { once: true });

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
    $("liveCap").innerHTML = `<span class="dot"></span>Solar farm, ready for its first mission`;
  }
  if (!m) return;

  // proof frame: the first decision of the last mission
  const d = decisions[0]?.body;
  if (d) {
    const lab = m.profile?.ui?.labels?.[d.answer?.label]?.name ?? d.answer?.label;
    const li = (t) => `<li><span>${t}</span></li>`;
    $("proofSteps").innerHTML = [
      li(`Robot holds at checkpoint ${d.checkpoint} · nonce echoed`),
      li(`Sealed call · <code>${m.policy?.vision_model ?? "0G"}</code>${d.latency_ms ? ` · ${d.latency_ms} ms` : ""}`),
      li(`0G answer · <b>${lab}</b> · severity ${d.answer?.severity} · ${d.answer?.action}`),
      li(`TEE signer <code>${short(d.signer, 8)}</code> on the manifest allowlist`),
      li(`Signature covers these exact response bytes (${d.binding})`),
      li(`Robot acts · ${d.action_applied} · entry #${decisions[0].seq} → 0G Storage`),
    ].join("");
    $("proofCap").textContent = `From mission ${short(m.id, 10)} on this machine${mock ? ", on mock 0G" : ""}. request_id ${d.request_id ?? "–"}.`;
  }
  $("vsReal").textContent = decisions.filter((e) => e.body.action_applied === (m.policy?.actions?.[0] ?? "descend")).length;

  // receipt
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
      $("rVer").innerHTML = r.ok ? `<span class="ok">✓ verified · ${pass} checks</span>` : `<span style="color:var(--bad)">✕ ${r.firstFailure ?? "failed"}</span>`;
    } else $("rVer").textContent = "unavailable";
  } else $("rVer").textContent = m.status;
}
boot();
