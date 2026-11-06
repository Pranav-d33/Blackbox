// Landing page: replays a real mission (web/demo/mission.json, exported by blackbox_robot.snapshot) in 3D
// and lists its 0G decisions with links to 0G Chain. Static: works with no backend (e.g. on Vercel).
import { Scene3D } from "/scene3d.js";

const $ = (id) => document.getElementById(id);
const short = (h, n = 8) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "–");
const EXPLORER = { 16602: "https://chainscan-galileo.0g.ai", 16661: "https://chainscan.0g.ai" };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The console needs a live core. Next to one (same origin) it opens in place; on a static host (e.g. Vercel) it
// opens the backend named by <meta name="live-console">; with neither, the buttons are hidden instead of dead.
const LIVE = document.querySelector('meta[name="live-console"]')?.content?.replace(/\/$/, "");
fetch("/api/config")
  .then((r) => r.ok)
  .catch(() => false)
  .then((local) =>
    document.querySelectorAll("[data-console]").forEach((a) => {
      if (local) a.href = "/console.html";
      else if (LIVE) Object.assign(a, { href: `${LIVE}/console.html`, target: "_blank", rel: "noopener" });
      else a.hidden = true;
    }),
  );

const m = await (await fetch("/demo/mission.json")).json();
const ex = EXPLORER[m.chain.chain_id];
const net = m.chain.chain_id === 16661 ? "mainnet" : "galileo";
const verifyUrl = `/verify.html?${new URLSearchParams({ mission: m.mission_id, network: net, registry: m.chain.registry })}`;
for (const id of ["hero-verify", "m-verify", "final-verify"]) $(id).href = verifyUrl;

const labelOf = (l) => m.profile.ui.labels[l] ?? { name: l ?? "safe stop", color: "#f87171" };
const sealed = m.attestation !== "none";

// ---- the decisions table and the on-chain proof
const day = new Date(m.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
$("m-sub").textContent = `${m.profile.title}, flown ${day} on 0G Galileo. ${m.checkpoints.length} checkpoints, each decided by ${m.model} through 0G's Router${sealed ? ", sealed in a TEE" : " (unsealed fallback: the verifier labels it)"}. ${m.entries} robot-signed log entries; replaying the flight from its seed reproduces the trajectory hash closed on chain.`;
$("m-rows").innerHTML = m.checkpoints
  .map((c) => {
    const l = labelOf(c.label);
    return `<tr><td class="asset"><code class="asset">${c.asset ?? "#" + c.k}</code></td>
      <td><span class="tag" style="--c:${l.color}">${l.name}${c.severity != null ? `, severity ${c.severity}` : ""}</span></td>
      <td>${c.outcome === "descend" ? "Went closer" : c.outcome === "continue" ? "Moved on" : "Safe stop"}</td>
      <td><code>${c.request_id ?? "–"}</code></td><td><code>#${c.seq ?? "–"}</code></td></tr>`;
  })
  .join("");
const link = (k, tx) => (tx && ex ? `<a href="${ex}/tx/${tx}" target="_blank" rel="noreferrer">${k}<span>${tx}</span></a>` : "");
$("m-proof").innerHTML =
  link("Registered on 0G Chain", m.chain.register_tx) +
  m.chain.anchors.map((t, i) => link(i === m.chain.anchors.length - 1 ? "Anchored and closed" : `Anchor ${i + 1}`, t)).join("") +
  (ex ? `<a href="${ex}/address/${m.chain.registry}" target="_blank" rel="noreferrer">BlackboxRegistry<span>${m.chain.registry}</span></a>` : "");

// ---- hero card
$("hc-title").textContent = `${m.profile.title.replace(/ survey$/, "")} · ${short(m.mission_id, 10)}`;
$("hc-link").href = ex ? `${ex}/tx/${m.chain.close_tx ?? m.chain.register_tx}` : verifyUrl;
$("hc-rows").innerHTML = m.checkpoints
  .map((c) => `<div data-k="${c.k}"><span class="dot" style="background:${labelOf(c.label).color}"></span><code>${c.asset}</code>${labelOf(c.label).name}<em>${c.outcome}</em></div>`)
  .join("");

// ---- 3D replay of the real flight
const s3 = new Scene3D($("scene"), {});
s3.controls.enableZoom = false;
s3.controls.enableRotate = false;
s3.controls.autoRotate = !reduced;
s3.controls.autoRotateSpeed = 0.25;
s3.setWorld(m.world, "/demo/texture.jpg");
const pts = m.samples.map((s) => [s[1] / 1000, s[2] / 1000, s[3] / 1000]);
// when the replay reaches each checkpoint: the sample closest to its target while the drone is low
const at = m.checkpoints.map((c) => {
  let best = 0, d = Infinity;
  m.samples.forEach((s, i) => {
    const dd = Math.hypot(s[1] - c.target_mm[0], s[2] - c.target_mm[1]);
    if (dd < d) [best, d] = [i, dd];
  });
  return best;
});
const sim = (i) => ({ pose_mm: m.samples[i].slice(1, 4), home_mm: m.home_mm, waypoints_mm: m.waypoints_mm, phase: "SURVEY", crop_mm: 1000, attitude: null });
let i = reduced ? pts.length - 1 : 0;
function tick() {
  const seen = m.checkpoints.filter((_, j) => at[j] <= i);
  s3.update(sim(i), pts.slice(0, i + 1));
  s3.setMarkers(
    seen.map((c) => {
      const l = labelOf(c.label);
      return { k: c.k, x_mm: c.target_mm[0], y_mm: c.target_mm[1], state: c.outcome, color: l.color, title: `${c.asset} · ${l.name}`, sub: `0G → ${c.outcome}` };
    }),
  );
  document.querySelectorAll("#hc-rows div").forEach((el) => el.classList.toggle("on", seen.some((c) => String(c.k) === el.dataset.k)));
  $("hc-status").textContent = i >= pts.length - 1 ? `Landed · ${m.checkpoints.length} decisions by 0G` : `Replaying a real mission · ${seen.length}/${m.checkpoints.length} decisions`;
  if (reduced) return;
  i = i >= pts.length - 1 ? 0 : i + 1;
  if (i === 0) s3.resetPose();
  setTimeout(tick, i === 0 ? 2500 : 45);
}
tick();
