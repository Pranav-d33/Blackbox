import { esc, renderReport, short } from "/report.js";
import { Scene3D } from "/scene3d.js";

const $ = (id) => document.getElementById(id);
const S = {
  cfg: null,
  scenarios: [],
  scenario: null, // selected profile (before takeoff)
  status: null,
  robot: null,
  samples: [],
  missionId: null,
  pending: [],
  kind: null,
  variant: {},
  preview: null,
  view: "preview", // "mission": show the robot's current mission; "preview": plan a new one
  seenMission: null,
  live: { k: null, until: 0 },
  comparing: false,
};

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function toast(msg, ms = 4500) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.style.display = "none"), ms);
}
const guard = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    toast(e.message, 7000);
  }
};
const linkOr = (url, text) => (url ? `<a target="_blank" href="${esc(url)}">${esc(text)}</a>` : esc(text));

// --------------------------------------------------------------- profile
const mission = () => S.status?.mission ?? null;
const flying = () => ["preparing", "flying"].includes(mission()?.status);
const inMission = () => S.view === "mission" && !!S.robot?.sim && S.robot.mission_id === mission()?.id;
const profile = () => (S.view === "mission" ? mission()?.profile : null) ?? S.scenario;
function labelInfo(label) {
  const p = profile();
  const u = p?.ui?.labels?.[label];
  return { name: u?.name ?? label, color: u?.color ?? "#f5f5f7" };
}
function kindInfo(kind) {
  const k = (profile()?.world?.kinds ?? []).find((x) => x.kind === kind);
  const color = k?.truth === "defect" ? "#ff8a3d" : "#b5b0a6";
  return { name: k?.name ?? kind, color, variants: k?.variants ?? 1 };
}

// ------------------------------------------------------------------ scene
const s3 = new Scene3D($("view"), {
  insetLeft: 340,
  onPlace: guard(async (x, y) => {
    if (S.comparing) return;
    const k = S.kind;
    if (!k) return;
    const v = (S.variant[k] = (S.variant[k] ?? -1) + 1) % kindInfo(k).variants;
    if (flying() && inMission() && !["LANDED", "STOPPED"].includes(S.robot.sim.phase)) {
      await api("/api/world/place", { kind: k, x_mm: x, y_mm: y, variant: v });
      toast(`${kindInfo(k).name} placed mid-flight. The detector will flag it; 0G decides what it is.`);
    } else {
      if (flying()) return toast("A mission is starting. Wait for takeoff to drop defects mid-flight.");
      if (S.view === "mission") await selectScenario(S.scenario.id); // plan the next mission on a fresh world
      S.pending.push({ kind: k, x_mm: x, y_mm: y, variant: v });
      renderPlaced();
    }
  }),
  onMarker: (k) => typeof k === "number" && openCheckpoint(k),
});
$("cam").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-cam]");
  if (!b) return;
  [...$("cam").children].forEach((x) => x.classList.toggle("on", x === b));
  s3.setCameraMode(b.dataset.cam);
});

// --------------------------------------------------------------- scenario
function renderScenarios() {
  const busy = flying();
  $("scenarios").innerHTML = S.scenarios
    .map((p) => `<button data-id="${esc(p.id)}" class="${p.id === S.scenario?.id ? "on" : ""}" ${busy ? "disabled" : ""}>${esc(p.title)}</button>`)
    .join("");
}
$("scenarios").addEventListener("click", guard(async (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b || flying()) return;
  await selectScenario(b.dataset.id);
}));

function adoptScenario(id) {
  const changed = S.scenario?.id !== id;
  S.scenario = S.scenarios.find((p) => p.id === id) ?? S.scenarios[0];
  if (changed || !S.kind) {
    S.kind = S.scenario.world.kinds[0].kind;
    S.variant = {};
  }
  renderScenarios();
  renderKinds();
  renderPlaced();
  renderSdk();
}

/** Planning mode: the scenario's world before takeoff, with defects placed client-side. */
async function selectScenario(id) {
  S.view = "preview";
  S.pending = [];
  adoptScenario(id);
  s3.setMarkers([]);
  S.preview = await api(`/api/scenarios/${id}/preview`);
  if (S.view === "preview" && S.scenario.id === id) showPreview();
}

/** Mission mode: follow whatever the robot is flying (or flew last). */
function showMission(m) {
  S.view = "mission";
  S.pending = [];
  if (m.profile?.id) adoptScenario(m.profile.id);
}

function showPreview() {
  if (!S.preview) return;
  s3.resetPose();
  s3.setWorld(S.preview.world, `/api/scenarios/${S.scenario.id}/preview.jpg`);
  s3.update({ pose_mm: S.preview.home_mm.concat([0]), home_mm: S.preview.home_mm, waypoints_mm: S.preview.waypoints_mm, phase: "READY" }, []);
}

function renderKinds() {
  const kinds = S.scenario?.world?.kinds ?? [];
  $("kinds").innerHTML = kinds
    .map((k) => {
      const c = k.truth === "defect" ? "#ff8a3d" : "#b5b0a6";
      return `<button class="btn kind ${k.kind === S.kind ? "sel" : ""}" style="--c:${c}" data-kind="${esc(k.kind)}"><i></i>${esc(k.name)}</button>`;
    })
    .join("");
  const p = profile();
  $("legend").innerHTML = p
    ? Object.entries(p.ui.labels).map(([, v]) => `<div><i style="background:${esc(v.color)}"></i>${esc(v.name)}</div>`).join("") +
      `<div><i style="background:var(--bad)"></i>Safe stop / refused</div>`
    : "";
}
$("kinds").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kind]");
  if (!b) return;
  S.kind = b.dataset.kind;
  renderKinds();
});
function renderPlaced() {
  const n = S.pending.length;
  $("placed").textContent = flying()
    ? "click the surface to drop more mid-flight"
    : S.view === "mission"
      ? "click the surface to plan the next mission"
      : n
        ? `${n} placed · click to add more`
        : "click the surface to place";
}

// --------------------------------------------------------------- polling
async function pollRobot() {
  try {
    const st = await api(`/api/robot/state?since=${S.samples.length}`);
    if (st.mission_id !== S.missionId) {
      S.missionId = st.mission_id;
      S.samples = [];
      s3.resetPose();
    } else S.samples.push(...st.samples);
    const firstState = !S.robot;
    S.robot = st;
    if (firstState) renderSdk();
    if (inMission()) {
      const n = st.sim.defects.length;
      if (st.world) s3.setWorld(st.world, `/api/robot/world/texture.jpg?m=${st.mission_id}&n=${n}`);
      if (!S.comparing) s3.update(st.sim, S.samples.map((r) => [r[1] / 1000, r[2] / 1000, r[3] / 1000]));
    }
    renderHud();
    renderMarkers();
    renderLive();
    renderEvents();
  } catch {
    S.robot = null;
    $("hSum").textContent = "Robot adapter offline: start it with npm run robot";
  }
  setTimeout(pollRobot, 150);
}

async function pollStatus() {
  try {
    const before = mission()?.status;
    S.status = await api("/api/status");
    const m = mission();
    if (m && m.id !== S.seenMission) {
      const first = S.seenMission === null;
      S.seenMission = m.id;
      if (!first || S.view !== "preview" || !S.pending.length) showMission(m);
    }
    if (before !== mission()?.status) {
      renderScenarios();
      renderPlaced();
      renderSdk();
    }
    renderChips();
    renderStatus();
  } catch {
    $("chips").innerHTML = `<span class="chip bad">core offline</span>`;
  }
  setTimeout(pollStatus, 800);
}

// ------------------------------------------------------------------ HUD
const PHASE = { READY: "idle", TAKEOFF: "fly", SURVEY: "fly", INSPECT: "fly", HOLD: "hold", RTH: "fly", SAFE_RTH: "stop", LANDED: "done", STOPPED: "stop" };
const PHASE_TEXT = { READY: "ready", TAKEOFF: "takeoff", SURVEY: "surveying", INSPECT: "inspecting", HOLD: "holding · asking 0G", RTH: "returning", SAFE_RTH: "safe stop · returning", LANDED: "landed", STOPPED: "safe-stopped" };
function renderHud() {
  const p = profile();
  $("hTitle").textContent = p?.title ?? "Inspection mission";
  const sim = S.robot?.sim;
  if (!inMission()) {
    $("hPhase").className = "phase idle";
    $("hPhase").textContent = "idle";
    $("hSum").textContent = p?.summary ?? "Pick a scenario.";
    for (const id of ["sT", "sZ", "sCp", "sLog", "sAnc"]) $(id).textContent = "–";
    $("sPhys").textContent = S.robot?.backends?.[0] ?? "–";
    return;
  }
  $("hPhase").className = `phase ${PHASE[sim.phase] ?? "idle"}`;
  $("hPhase").textContent = PHASE_TEXT[sim.phase] ?? sim.phase;
  $("hSum").textContent = p?.summary ?? "";
  $("sT").textContent = `${(sim.t_ms / 1000).toFixed(1)} s`;
  $("sZ").textContent = `${(sim.pose_mm[2] / 1000).toFixed(2)} m`;
  $("sCp").textContent = sim.checkpoints.length;
  $("sPhys").textContent = sim.backend === "mujoco" ? "MuJoCo X2" : sim.backend;
  $("sLog").textContent = S.robot.log_len;
  $("sAnc").textContent = mission()?.anchors?.length ?? 0;
}

function renderChips() {
  const c = S.cfg, st = S.status;
  const chips = [];
  chips.push(c.zg.mode === "mock" ? `<span class="chip warn">0G Compute · MOCK</span>` : `<span class="chip zg">0G Compute · ${esc(c.zg.model)} · sealed</span>`);
  chips.push(c.storage.kind === "0g" ? `<span class="chip ok">0G Storage</span>` : `<span class="chip warn">storage · local dev</span>`);
  chips.push(c.chain ? `<span class="chip ok">0G Chain · ${esc(c.chain.network)}</span>` : `<span class="chip warn">chain off</span>`);
  if (S.robot) chips.push(`<span class="chip">robot ${esc(short(S.robot.robot, 6))}</span>`);
  if (st?.demo?.linkDown) chips.push(`<span class="chip bad">0G LINK CUT</span>`);
  $("chips").innerHTML = chips.join("");
  $("mockbar").hidden = c.zg.mode !== "mock";
}

// ---------------------------------------------------------- checkpoints
function byCheckpoint(m) {
  const out = new Map();
  const get = (k) => out.get(k) ?? (out.set(k, { k, refusals: [] }), out.get(k));
  for (const e of m?.entries ?? []) {
    const b = e.body || {};
    if (typeof b.checkpoint !== "number") continue;
    const c = get(b.checkpoint);
    if (e.kind === "decision") c.decision = { ...b, seq: e.seq, root: e.root, rootUrl: e.txUrl || e.rootUrl };
    if (e.kind === "rejected") c.refusals.push(b);
    if (e.kind === "safe_stop") c.stop = b;
    if (e.kind === "hold") c.hold = b;
    if (e.kind === "human") c.human = b;
  }
  for (const [k, v] of Object.entries(m?.checkpoints || {})) get(Number(k)).attempts = v.attempts;
  return out;
}

function renderMarkers() {
  if (S.comparing) return renderCompareMarkers();
  const sim = S.robot?.sim;
  const list = [];
  if (inMission()) {
    const cps = byCheckpoint(mission());
    for (const cp of sim.checkpoints) {
      const c = cps.get(cp.k);
      const a = c?.decision?.answer ?? c?.hold?.answer;
      let state = "waiting", color = "#ffd60a", title = `#${cp.k} asking 0G…`, sub = "";
      if (cp.outcome === "safe_stop") [state, color, title, sub] = ["stopped", "#ff453a", `#${cp.k} safe stop`, "no decision made"];
      else if (a) {
        const li = labelInfo(a.label);
        [state, color, title, sub] = [cp.outcome ?? "waiting", li.color, `#${cp.k} ${li.name}`, `sev ${a.severity} → ${cp.outcome ?? a.action}`];
      } else if (c?.refusals.length) [color, sub] = ["#ff453a", `${c.refusals.length} refused`];
      list.push({ k: cp.k, x_mm: cp.target_mm[0], y_mm: cp.target_mm[1], state, color, title, sub });
    }
  } else {
    S.pending.forEach((d, i) => {
      const ki = kindInfo(d.kind);
      list.push({ k: `p${i}`, x_mm: d.x_mm, y_mm: d.y_mm, state: "pending", color: ki.color, title: ki.name, sub: "placed · truth hidden from 0G" });
    });
  }
  s3.setMarkers(list);
}

/** Beat 2: each checkpoint 0G sent the drone down to, and what the forced replay did there. */
function renderCompareMarkers() {
  const cps = byCheckpoint(mission());
  const list = (S.robot?.sim?.checkpoints ?? [])
    .filter((cp) => cp.outcome === "descend")
    .map((cp) => {
      const a = cps.get(cp.k)?.decision?.answer;
      const li = a ? labelInfo(a.label) : { name: "defect", color: "#ff8a3d" };
      return { k: cp.k, x_mm: cp.target_mm[0], y_mm: cp.target_mm[1], state: "descend", color: "#ff453a", title: `#${cp.k} ${li.name}`, sub: "0G: inspect · forced: skipped" };
    });
  s3.setMarkers(list);
}

// The verify-before-actuate moment, step by step.
function renderLive() {
  const m = mission(), live = S.robot?.checkpoint, sim = S.robot?.sim;
  const last = sim?.checkpoints?.at(-1);
  if (live && (live.status === "waiting" || live.status === "await_human")) S.live = { k: live.k, until: Date.now() + 7000 };
  else if (last && sim.t_ms - last.t_ms < 6000 && m?.id === S.robot.mission_id) S.live = { k: last.k, until: Date.now() + 1500 };
  const box = $("live");
  if (S.live.k === null || Date.now() > S.live.until || !m || S.comparing || !inMission()) return box.classList.add("off");
  box.classList.remove("off");
  const k = S.live.k;
  const c = byCheckpoint(m).get(k) ?? { refusals: [] };
  const cpState = (S.robot?.sim?.checkpoints ?? []).find((x) => x.k === k);
  const d = c.decision, lastRef = c.refusals.at(-1), a = d?.answer ?? lastRef?.attempted_answer ?? c.hold?.answer;
  const waiting = live?.k === k && live.status === "waiting";
  const model = m.policy?.vision_model ?? "0G";
  const st = (cls, icon, html) => `<div class="stepi ${cls}"><i>${icon}</i><div>${html}</div></div>`;
  const steps = [st("done", "✓", `Robot holds · nonce <b>${esc(short(cpState?.nonce ?? live?.nonce, 8))}</b>`)];
  const att = (c.attempts ?? []).filter((x) => x.kind === "0g").at(-1);
  if (a) steps.push(st("done", "✓", `Sealed call · <b>${esc(model)}</b>${att?.latency_ms ? ` · ${att.latency_ms} ms` : ""}`));
  else if (c.stop) steps.push(st("fail", "✕", `No signed answer from 0G`));
  else steps.push(st("now", "…", `Sealed call · <b>${esc(model)}</b>${live?.last_error ? ` · <span class="muted">${esc(live.last_error.slice(0, 60))}</span>` : ""}`));
  if (a) {
    const li = labelInfo(a.label);
    steps.push(st("done", "✓", `0G answer · <span class="lbl" style="--c:${esc(li.color)}">${esc(li.name)}</span> · sev ${esc(a.severity)} · ${esc(a.action)}`));
  }
  if (d) steps.push(st("done", "✓", `Interlock · nonce ✓ · TEE signer <b>${esc(short(d.signer, 6))}</b> ✓ · covers bytes (${esc(d.binding)}) ✓`));
  else if (lastRef) steps.push(st(waiting ? "fail" : "fail", "✕", `Refused · ${esc(lastRef.reason)}`));
  else if (c.hold) steps.push(st("now", "…", `Calibrated hold · waiting for a human`));
  if (d) steps.push(st("done", "✓", `Robot acts · <b>${esc(d.action_applied)}</b> · entry #${d.seq} → 0G Storage`));
  else if (c.stop) steps.push(st("fail", "■", `Safe stop · ${esc(c.stop.reason)}`));
  $("liveSteps").innerHTML = steps.join("");
  $("liveTitle").textContent = `Checkpoint ${k}`;
  const badge = $("liveBadge");
  if (d) [badge.className, badge.textContent] = ["badge ok", "accepted"];
  else if (c.stop) [badge.className, badge.textContent] = ["badge bad", "safe stop"];
  else if (lastRef) [badge.className, badge.textContent] = ["badge bad", `${c.refusals.length} refused`];
  else [badge.className, badge.textContent] = ["badge warn", "verifying"];
  const img = `/api/missions/${m.id}/crop/${k}.png`;
  if ($("liveImg").dataset.src !== img) {
    $("liveImg").dataset.src = img;
    $("liveImg").src = img;
  }
  $("leaseBar").style.width = waiting ? `${(100 * live.remaining_ms) / live.lease_ms}%` : "0";
}
$("liveImg").onerror = () => setTimeout(() => ($("liveImg").src = $("liveImg").dataset.src + "?r=" + Date.now()), 500);
$("live").addEventListener("click", () => S.live.k !== null && openCheckpoint(S.live.k));

function renderFeed(m) {
  const cps = [...byCheckpoint(m).values()].sort((a, b) => b.k - a.k);
  $("nCp").textContent = cps.length || "";
  if (!cps.length) return;
  $("feed").innerHTML = cps
    .map((c) => {
      const d = c.decision, a = d?.answer ?? c.hold?.answer;
      let cls = "", badge = `<span class="badge warn">verifying</span>`;
      if (d) [cls, badge] = ["accepted", `<span class="badge ok">accepted · ${esc(d.action_applied)}</span>`];
      else if (c.stop) [cls, badge] = ["stopped", `<span class="badge bad">safe stop</span>`];
      else if (c.human) [cls, badge] = ["accepted", `<span class="badge hold">human · ${esc(c.human.action)}</span>`];
      else if (c.hold) [cls, badge] = ["hold", `<span class="badge hold">calibrated hold</span>`];
      else if (c.refusals.length) cls = "refused";
      if (c.refusals.length) badge += ` <span class="badge bad">${c.refusals.length} refused</span>`;
      const li = a ? labelInfo(a.label) : null;
      const x = d ?? c.hold;
      const kv = x
        ? `<div class="kv"><span>request_id</span><b>${esc(x.request_id)}</b><span>TEE signer</span><b>${esc(short(x.signer, 8))} ✓</b>${d?.root ? `<span>0G Storage</span><b>${linkOr(d.rootUrl, short(d.root, 8))}</b>` : ""}</div>`
        : "";
      const ref = c.refusals.slice(-2).map((r) => `<div class="refusal">✕ ${esc(r.source)}: ${esc(r.reason)}</div>`).join("");
      const stop = c.stop ? `<div class="refusal">■ ${esc(c.stop.reason)}</div>` : "";
      const hold = c.hold && !c.human && !c.stop
        ? `<div class="holdbox">${esc(c.hold.decision_model?.reason ?? "low confidence")}: the robot holds and asks a human
           <div class="row" style="margin-top:6px">${(m.policy?.actions ?? ["descend", "continue"]).map((ac) => `<button class="btn" data-human="${c.k}" data-action="${esc(ac)}">Approve ${esc(ac)}</button>`).join("")}</div></div>`
        : "";
      return `<div class="cp ${cls}" data-cp="${c.k}"><img src="/api/missions/${m.id}/crop/${c.k}.png" alt="" onerror="this.style.visibility='hidden'" />
        <div><div class="head"><b>Checkpoint ${c.k}</b>${badge}</div>
        ${a ? `<div class="ans">0G: <span class="lbl" style="--c:${esc(li.color)}">${esc(li.name)}</span> · sev ${esc(a.severity)} · ${esc(a.action)}</div>` : ""}
        ${kv}${ref}${stop}${hold}</div></div>`;
    })
    .join("");
}
$("feed").addEventListener("click", guard(async (e) => {
  const h = e.target.closest("button[data-human]");
  if (h) return void (await api("/api/robot/human", { checkpoint: Number(h.dataset.human), action: h.dataset.action }));
  const c = e.target.closest("[data-cp]");
  if (c) openCheckpoint(Number(c.dataset.cp));
}));

async function openCheckpoint(k) {
  const m = mission();
  if (!m) return;
  const full = await api(`/api/missions/${m.id}/entries`).catch(() => ({ entries: [] }));
  const mine = full.entries.filter((e) => e.body?.checkpoint === k);
  const pick = mine.find((e) => e.kind === "decision") ?? mine.find((e) => e.kind === "hold") ?? mine.at(-1);
  if (!pick) return;
  const x = pick.body, z = x.zg ?? {};
  const summary = m.entries.find((e) => e.seq === pick.seq);
  const rows = [
    ["entry", `#${pick.seq} ${pick.kind}`],
    ["obs_hash", x.obs_hash],
    ["nonce", x.nonce],
    ["model", z.model],
    ["x_0g_trace.request_id", z.request_id],
    ["chat id", z.chat_id],
    ["provider", z.provider],
    ["TEE signer", x.interlock?.signer ?? x.signer],
    ["signed text", z.tee?.text],
    ["binding", x.interlock?.binding],
    ["entry hash", pick.hash],
    ["0G Storage root", summary?.root],
  ].filter(([, v]) => v);
  let raw = "";
  try {
    raw = JSON.parse(z.raw_response).choices[0].message.content;
  } catch {}
  const refusals = mine.filter((e) => e.kind === "rejected").map((e) => `<div class="refusal">✕ ${esc(e.body.source)}: ${esc(e.body.reason)}</div>`).join("");
  const stop = mine.filter((e) => e.kind === "safe_stop").map((e) => `<div class="refusal">■ ${esc(e.body.reason)}</div>`).join("");
  openModal(`<h3>Checkpoint ${k}<span class="sp"></span>${closeBtn}</h3>
    <div style="display:grid;grid-template-columns:256px minmax(0,1fr);gap:16px">
      <div><img src="/api/missions/${m.id}/crop/${k}.png" style="width:256px;height:256px;border-radius:10px;border:1px solid var(--line)" alt="" />
      <div class="muted" style="margin-top:6px;font-size:11px">Exactly the crop the robot sent to 0G. Its keccak256 is the obs_hash, and the nonce is derived from it.</div></div>
      <div><div class="kv" style="font-size:12px">${rows.map(([a, b]) => `<span>${esc(a)}</span><b title="${esc(b)}">${esc(b)}</b>`).join("")}</div>
      ${raw ? `<h3 style="margin:14px 0 6px;font-size:12px" class="muted">Model output, byte for byte as 0G's TEE signed it</h3><pre class="code">${esc(raw)}</pre>` : ""}
      ${refusals}${stop}</div></div>`);
}

// ---------------------------------------------------------------- rails
function renderStatus() {
  const st = S.status, m = st.mission;
  $("btnKill").classList.toggle("on", !!st.demo.linkDown);
  $("btnKill").textContent = st.demo.linkDown ? "Restore 0G link" : "Cut 0G link";
  $("btnForge").textContent = st.demo.forgeArmed ? "Forge armed…" : 'Forge "continue"';
  $("btnTamperAns").textContent = st.demo.tamperArmed ? "Tamper armed…" : "Tamper answer";
  $("btnStart").disabled = flying();
  if (!m) return;
  $("lnkVerifier").href = verifierUrl(m);
  renderFeed(m);
  const replay = !m.replay
    ? "after close"
    : m.replay.match
      ? `<span style="color:var(--ok)">✓ trajectory hash matches ${esc(short(m.replay.trajectory_hash))}</span>`
      : `<span style="color:var(--bad)">${esc(m.replay.error || (m.replay.mismatches || []).join("; ") || "trajectory hash differs")}</span>`;
  const kv = [
    ["mission", esc(short(m.id, 14))],
    ["profile", esc(m.profile?.id ?? "–")],
    ["manifest root", linkOr(m.manifestTxUrl || m.manifestUrl, short(m.manifestRoot, 12) ?? "uploading…")],
    ["TEE allowlist", esc((m.policy.tee_signers || []).map((s) => short(s, 8)).join(", "))],
    ["registerMission", m.registerTx ? linkOr(m.registerTxUrl, short(m.registerTx, 12)) : S.cfg.chain ? "pending…" : "chain disabled"],
    ["anchors", m.anchors.map((a) => linkOr(a.txUrl, `${a.count}`)).join(" · ") || "none yet"],
    ["closeMission", m.closeTx ? linkOr(m.closeTxUrl, short(m.closeTx, 12)) : m.status],
    ["replay", replay],
    ["writer queue", st.queue ? `${st.queue} pending` : "idle"],
  ];
  if (m.errors.length) kv.push(["error", `<span style="color:var(--bad)">${esc(m.errors.at(-1))}</span>`]);
  $("record").innerHTML = `<div class="sec"><h3>Mission on 0G</h3><div class="kv" style="font-size:12px">${kv.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join("")}</div></div>
    <div class="sec"><h3>Robot-signed, hash-chained entries <span>${m.entries.length}</span></h3>
    <table class="ledger"><tr><th>#</th><th>kind</th><th>hash</th><th>0G Storage</th></tr>${m.entries
      .slice()
      .reverse()
      .map((e) => `<tr><td>${e.seq}</td><td class="k-${esc(e.kind)}">${esc(e.kind)}</td><td>${esc(short(e.hash, 6))}</td><td>${e.root ? linkOr(e.txUrl || e.rootUrl, short(e.root, 6)) : "uploading…"}</td></tr>`)
      .join("")}</table></div>`;
}

function renderEvents() {
  $("events").innerHTML = (S.robot?.events ?? [])
    .slice()
    .reverse()
    .map((e) => `<div class="${esc(e.level)}">${new Date(e.t).toLocaleTimeString()} ${esc(e.text)}</div>`)
    .join("");
}

async function sha256(text) {
  if (!crypto.subtle) return "";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return "0x" + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function renderSdk() {
  const p = profile();
  const m = S.view === "mission" ? mission() : null;
  if (!p) return;
  const promptHash = await sha256(p.decision.prompt);
  const where = m?.manifestRoot
    ? `inside manifest ${linkOr(m.manifestTxUrl || m.manifestUrl, short(m.manifestRoot, 10))} on 0G Storage, registered by <span class="mono">registerMission</span>`
    : "goes into the manifest at takeoff: uploaded to 0G Storage, root registered on 0G Chain";
  $("sdk").innerHTML = `
    <div class="sec"><h3>Mission profile <span>${esc(p.id)}</span></h3>
      <div style="margin-bottom:6px"><b>${esc(p.title)}</b></div>
      <div class="muted" style="margin-bottom:8px">${esc(p.summary)}</div>
      <div class="kv" style="font-size:11px;margin-bottom:8px"><span>where it lives</span><b style="white-space:normal">${where}</b>
        <span>world</span><b>${esc(p.world.kind)}</b><span>robot</span><b>${esc(p.robot)} · ${esc(S.robot?.sim?.backend === "mujoco" || S.robot?.backends?.[0] === "mujoco" ? "MuJoCo · Skydio X2" : S.robot?.backends?.[0] ?? "")}</b>
        <span>prompt sha256</span><b>${esc(short(promptHash, 12))}</b></div>
      <div class="muted" style="font-size:11px;margin:6px 0 4px">0G may answer only these labels</div>
      <div class="tokens">${p.decision.labels.map((l) => `<span class="tok" style="border-color:${esc(labelInfo(l).color)}55;color:${esc(labelInfo(l).color)}">${esc(l)}</span>`).join("")}</div>
      <div class="muted" style="font-size:11px;margin:8px 0 4px">and choose only these robot actions (severity 0–${p.decision.severity_max})</div>
      <div class="tokens">${p.decision.actions.map((a) => `<span class="tok">${esc(a)}</span>`).join("")}</div>
      <div class="muted" style="font-size:11px;margin-top:8px">The robot's interlock reads this list from the manifest. Any other label or action is refused, never mapped to a default.</div>
    </div>
    <div class="sec"><h3>One checkpoint</h3><div class="flow">
      <div><b>1</b><span>The robot holds. nonce = keccak256(mission, obs_hash, k)</span></div>
      <div><b>2</b><span>Sealed call to <span class="mono">${esc(m?.policy?.vision_model ?? S.cfg?.zg?.model)}</span> with the crop and the nonce</span></div>
      <div><b>3</b><span>The core fetches the TEE signature for the chat id</span></div>
      <div><b>4</b><span>The robot checks: parses · nonce echoed · signer allowlisted · signature covers these bytes</span></div>
      <div><b>5</b><span>Acts only then. No answer before the lease: safe stop</span></div>
      <div><b>6</b><span>Robot-signed entry → 0G Storage; head anchored on 0G Chain every ${esc(m?.policy?.anchor_every ?? 2)}</span></div>
    </div></div>
    <div class="sec"><h3>Plug in your robot</h3><pre class="code"><span class="k">from</span> blackbox_robot.sdk <span class="k">import</span> Robot

<span class="k">class</span> MyRobot(Robot):
    ACTIONS = (${p.decision.actions.map((a) => `<span class="s">"${esc(a)}"</span>`).join(", ")})

    <span class="k">def</span> step(self):
        <span class="c"># your control loop; when a decision is needed:</span>
        <span class="k">return</span> {<span class="s">"type"</span>: <span class="s">"checkpoint"</span>, <span class="s">"png"</span>: frame, ...}

    <span class="k">def</span> resolve(self, action):
        <span class="c"># only ever called with an action 0G signed,</span>
        <span class="c"># or "safe_stop" when the lease runs out</span>
        ...</pre></div>
    <div class="sec"><h3>Add a scenario</h3><pre class="code"><span class="c"># scenarios/${esc(p.id)}.json</span>
{ <span class="s">"world"</span>:    { <span class="s">"kind"</span>: <span class="s">"${esc(p.world.kind)}"</span>, ... },
  <span class="s">"decision"</span>: { <span class="s">"labels"</span>: [${p.decision.labels.map((l) => `<span class="s">"${esc(l)}"</span>`).join(", ")}],
                <span class="s">"actions"</span>: [${p.decision.actions.map((l) => `<span class="s">"${esc(l)}"</span>`).join(", ")}],
                <span class="s">"prompt"</span>: <span class="s">"…"</span> } }</pre></div>`;
}

// ------------------------------------------------------------------ modal
function openModal(html) {
  $("modalBox").innerHTML = html;
  $("modal").classList.add("open");
}
const closeModal = () => $("modal").classList.remove("open");
$("modal").addEventListener("click", (e) => (e.target.id === "modal" || e.target.closest("[data-close]")) && closeModal());
document.addEventListener("keydown", (e) => e.key === "Escape" && (closeModal(), S.comparing && exitCompare()));
const closeBtn = `<button class="btn" data-close>Close</button>`;

$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  [...$("tabs").children].forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("on", p.id === `pane-${b.dataset.tab}`));
});

function verifierUrl(m) {
  const c = S.cfg;
  const q = new URLSearchParams({ mission: m.id });
  if (c.chain) {
    q.set("network", c.chain.network);
    q.set("registry", c.chain.registry);
  }
  if (!c.publicVerifierUrl || c.storage.kind !== "0g") q.set("api", location.origin);
  return `${c.publicVerifierUrl || `${location.origin}/verify.html`}?${q}`;
}

// ---------------------------------------------------------------- beats
$("btnStart").onclick = guard(async () => {
  if (!S.scenario) throw new Error("pick a scenario first");
  $("btnStart").disabled = true;
  toast("Uploading the manifest (with the mission profile) to 0G Storage and registering it on 0G Chain…", 8000);
  try {
    const r = await api("/api/mission/start", { scenario: S.scenario.id, defects: S.pending });
    S.seenMission = r.mission.id;
    exitCompare();
    showMission(r.mission);
  } finally {
    $("btnStart").disabled = false;
  }
});
$("btnKill").onclick = guard(async () => {
  const down = !S.status?.demo?.linkDown;
  await api("/api/demo/link", { down });
  toast(down ? "0G link cut. The next checkpoint gets no signed answer, the lease runs out and the robot safe-stops. Nothing is faked." : "0G link restored.");
});
$("btnEstop").onclick = guard(() => api("/api/robot/estop", {}));
$("btnForge").onclick = guard(async () => {
  await api("/api/demo/forge", {});
  toast("Armed: at the next checkpoint the operator sends a forged \"continue\" signed with their own key.");
});
$("btnTamperAns").onclick = guard(async () => {
  await api("/api/demo/tamper-answer", {});
  toast("Armed: the core will flip 0G's next answer but keep 0G's real TEE signature.");
});
$("btnTamperLog").onclick = guard(async () => {
  const m = mission();
  if (!m) throw new Error("no mission yet");
  const t = await api(`/api/missions/${m.id}/tamper-log`, {});
  openModal(`<h3>Verifier on a tampered copy<span class="sp"></span>${closeBtn}</h3>
    <div class="muted" style="margin-bottom:10px">Changed in a local copy of the log: <b class="mono">${esc(t.change)}</b>. The robot's signatures and the anchors on 0G Chain expose it.</div>${renderReport(t.report)}`);
});
$("btnVerify").onclick = guard(async () => {
  const m = mission();
  if (!m) throw new Error("no mission yet");
  openModal(`<h3>Verifying ${esc(short(m.id, 12))}…<span class="sp"></span>${closeBtn}</h3><div class="muted">Reading the registry on 0G Chain and every entry from 0G Storage.</div>`);
  const r = await api(`/api/missions/${m.id}/verify?source=${S.cfg.chain ? "storage" : "local"}`);
  openModal(`<h3>Verifier<span class="sp"></span><a class="btn" target="_blank" href="${esc(verifierUrl(m))}">Public verifier ↗</a>${closeBtn}</h3>${renderReport(r)}`);
});
$("btnQR").onclick = guard(async () => {
  const m = mission();
  if (!m) throw new Error("no mission yet");
  const url = verifierUrl(m);
  let img = "";
  if (window.qrcode) {
    const q = window.qrcode(0, "M");
    q.addData(url);
    q.make();
    img = `<div class="qr">${q.createSvgTag({ cellSize: 6, margin: 2 })}</div>`;
  }
  openModal(`<h3>Verify on your phone<span class="sp"></span>${closeBtn}</h3>${img}<p class="mono" style="overflow-wrap:anywhere;text-align:center">${esc(url)}</p>
    ${["127.0.0.1", "localhost"].includes(location.hostname) ? `<p class="muted" style="text-align:center">Set PUBLIC_VERIFIER_URL to the deployed verifier so phones can open it.</p>` : ""}`);
});

$("btnSplit").onclick = guard(async () => {
  if (!S.robot?.sim) throw new Error("fly a mission first");
  const cf = await api("/api/counterfactual", { force: "continue" });
  S.comparing = true;
  renderCompareMarkers();
  s3.playCompare(cf.actual, cf.counterfactual, 5);
  $("banner").hidden = false;
  $("live").classList.add("off");
});
function exitCompare() {
  if (!S.comparing) return;
  S.comparing = false;
  s3.stopCompare();
  $("banner").hidden = true;
  renderMarkers();
}
$("btnExitCompare").onclick = exitCompare;

// ------------------------------------------------------------------ boot
(async () => {
  S.cfg = await api("/api/config");
  renderChips();
  const sc = await api("/api/scenarios");
  S.scenarios = sc.scenarios;
  S.status = await api("/api/status").catch(() => null);
  const m = mission();
  if (m?.profile) {
    S.seenMission = m.id;
    showMission(m);
  } else await selectScenario(sc.default ?? S.scenarios[0].id);
  pollStatus();
  pollRobot();
})().catch((e) => toast(e.message, 10000));
