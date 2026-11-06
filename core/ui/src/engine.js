import { readMissionOnChain } from "./chain.js";
// the Arkiv client (viem + SDK) is only needed for History and Analytics, so it loads on first use instead of with the console
const arkivRead = () => import("../../src/arkiv/read");
// a background tab does not need 150 ms polling: back off hard, snap back when it is visible again
const every = (ms) => (document.hidden ? Math.max(ms * 8, 4000) : ms);
// Console engine: the mission state, polling, demo beats and the 3D scene.
// A port of the old console.js with the DOM rendering taken out; React subscribes and renders.
import { Scene3D } from "../../web/scene3d.js";

export const short = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "–");

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const PHASE = { READY: "idle", TAKEOFF: "fly", SURVEY: "fly", INSPECT: "fly", HOLD: "hold", RTH: "fly", SAFE_RTH: "stop", LANDED: "done", STOPPED: "stop" };
const PHASE_TEXT = { READY: "Ready", TAKEOFF: "Taking off", SURVEY: "Surveying", INSPECT: "Inspecting", HOLD: "Holding · asking 0G", RTH: "Returning", SAFE_RTH: "Safe stop · returning", LANDED: "Landed", STOPPED: "Safe-stopped" };

class Engine {
  S = {
    cfg: null,
    scenarios: [],
    scenario: null,
    status: null,
    robot: null,
    robotOffline: false,
    coreOffline: false,
    samples: [],
    missionId: null,
    pending: [],
    kind: null,
    variant: {},
    preview: null,
    view: "preview",
    seenMission: null,
    live: { k: null, until: 0 },
    comparing: false,
    cam: "orbit",
    toast: null,
    modal: null,
    starting: false,
    done: {}, // demo beats already shown in this session: fly, proof, attack, kill, verify
    flash: null, // the latest consequential event, shown big in the dock
    seen: { mission: null, rejected: 0, stop: 0, decision: 0 },
  };
  s3 = null;
  listeners = new Set();
  version = 0;

  // ------------------------------------------------------------ store
  subscribe = (fn) => (this.listeners.add(fn), () => this.listeners.delete(fn));
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  toast(msg, ms = 4500) {
    this.S.toast = { msg, id: Date.now() };
    this.emit();
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => ((this.S.toast = null), this.emit()), ms);
  }
  guard = (fn) => async (...a) => {
    try {
      await fn(...a);
    } catch (e) {
      this.toast(e.message, 7000);
    }
  };

  // ---------------------------------------------------------- derived
  mission = () => this.S.status?.mission ?? null;
  flying = () => ["preparing", "flying"].includes(this.mission()?.status);
  inMission = () => this.S.view === "mission" && !!this.S.robot?.sim && this.S.robot.mission_id === this.mission()?.id;
  profile = () => (this.S.view === "mission" ? this.mission()?.profile : null) ?? this.S.scenario;
  labelInfo = (label) => {
    const u = this.profile()?.ui?.labels?.[label];
    return { name: u?.name ?? label, color: u?.color ?? "#f5f5f7" };
  };
  kindInfo = (kind) => {
    const k = (this.profile()?.world?.kinds ?? []).find((x) => x.kind === kind);
    return { name: k?.name ?? kind, defect: k?.truth === "defect", color: k?.truth === "defect" ? "#ff9f0a" : "#c7c7cc", variants: k?.variants ?? 1 };
  };
  phase() {
    const sim = this.S.robot?.sim;
    if (!this.inMission()) return { tone: "idle", text: this.S.robotOffline ? "Robot offline" : "Ready" };
    return { tone: PHASE[sim.phase] ?? "idle", text: PHASE_TEXT[sim.phase] ?? sim.phase };
  }
  telemetry() {
    const sim = this.S.robot?.sim;
    if (!this.inMission()) return null;
    return {
      t: `${(sim.t_ms / 1000).toFixed(1)}`,
      z: `${(sim.pose_mm[2] / 1000).toFixed(2)}`,
      cps: sim.checkpoints.length,
      physics: sim.backend === "mujoco" ? "MuJoCo · Skydio X2" : sim.backend,
      log: this.S.robot.log_len,
      anchors: this.mission()?.anchors?.length ?? 0,
    };
  }
  /** World geometry for the scene on screen (mission world, or the scenario preview). */
  worldMeta() {
    return (this.inMission() ? this.S.robot?.world : null) ?? this.S.preview?.world ?? null;
  }
  /** Label of the asset under a point, same rule as the robot (world.py / solar_world.py asset_at). */
  assetAt(x, y) {
    const w = this.worldMeta();
    if (!w) return null;
    if (w.kind === "solar-farm") {
      const mw = w.module_mm?.[0] ?? 1000;
      for (const [r, [x0, y0, x1, y1]] of (w.rows_mm ?? []).entries()) if (x >= x0 && x < x1 && y >= y0 && y < y1) return `r${r + 1}m${String(Math.floor((x - x0) / mw) + 1).padStart(2, "0")}`;
      return null;
    }
    const [W, H] = w.deck_mm;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return `x${String(Math.floor(x / 1000)).padStart(2, "0")}y${String(Math.floor(y / 1000)).padStart(2, "0")}`;
  }
  /** The asset's rectangle in mm, for the 3D hover outline. */
  assetRect(label) {
    const w = this.worldMeta();
    let m;
    if ((m = /^r(\d+)m(\d+)$/.exec(label ?? "")) && w?.rows_mm) {
      const [x0, y0, , y1] = w.rows_mm[Number(m[1]) - 1];
      const mw = w.module_mm?.[0] ?? 1000;
      return [x0 + (Number(m[2]) - 1) * mw, y0, x0 + Number(m[2]) * mw, y1];
    }
    if ((m = /^x(\d+)y(\d+)$/.exec(label ?? ""))) return [Number(m[1]) * 1000, Number(m[2]) * 1000, Number(m[1]) * 1000 + 1000, Number(m[2]) * 1000 + 1000];
    return null;
  }
  unitName = () => this.profile()?.assets?.unit ?? "asset";
  /** What the 3D view shows under the cursor: the asset's label and what is known about it. */
  describe(x, y) {
    const label = this.assetAt(x, y);
    if (!label) return null;
    const f = this.findings().find((r) => r.asset === label);
    const p = this.S.pending.find((d) => this.assetAt(d.x_mm, d.y_mm) === label);
    const sub = f?.label ? `${f.label.name} · ${f.outcome}` : p ? `${this.kindInfo(p.kind).name} placed · hidden from 0G` : this.S.kind && !this.flying() ? `Click to place ${this.kindInfo(this.S.kind).name.toLowerCase()}` : this.unitName();
    return { label, name: label, sub, rect: this.assetRect(label), color: f?.label?.color };
  }
  removePending(i) {
    this.S.pending.splice(i, 1);
    this.renderMarkers();
    this.emit();
  }
  clearMarks() {
    this.S.pending = [];
    this.renderMarkers();
    this.emit();
  }
  /** One click to a flyable demo: a real defect and a harmless look-alike, placed on this scenario's own geometry. */
  sampleMarks() {
    const S = this.S;
    const kinds = (S.scenario?.world?.kinds ?? []).map((k) => k.kind);
    const defect = kinds.find((k) => this.kindInfo(k).defect);
    const benign = kinds.find((k) => !this.kindInfo(k).defect);
    const w = S.preview?.world;
    let spots;
    if (w?.rows_mm?.length >= 3) {
      const at = (r, f) => [Math.round(r[0] + (r[2] - r[0]) * f), Math.round((r[1] + r[3]) / 2)];
      spots = [[defect, ...at(w.rows_mm[1], 0.3)], [benign, ...at(w.rows_mm[2], 0.7)]];
    } else {
      const [dw, dh] = w?.deck_mm ?? S.scenario?.sim?.deck_mm ?? [36000, 16000];
      spots = [[defect, Math.round(dw * 0.3), Math.round(dh * 0.35)], [benign, Math.round(dw * 0.65), Math.round(dh * 0.65)]];
    }
    S.pending = spots.filter(([k]) => k).map(([kind, x_mm, y_mm]) => ({ kind, x_mm, y_mm, variant: 0 }));
    this.renderMarkers();
    this.toast("Two sample marks added: a real defect and a look-alike. Press Fly the survey.", 5000);
    this.emit();
  }
  /** Where the demo is: mark the site, fly it, prove it. */
  step() {
    if (this.flying() || this.S.starting) return "fly";
    if (this.S.view === "mission" && this.mission()) return "prove";
    return "mark";
  }
  /** Decisions as findings on labelled assets, newest first. */
  findings() {
    const m = this.mission();
    return this.decisions().map((r) => {
      return {
        ...r,
        name: r.asset ?? `checkpoint ${r.k}`,
        outcome: r.stop ? "Safe stop, inspect again" : r.answer ? this.profile()?.ui?.outcomes?.[r.answer.label] ?? r.status : "Waiting for 0G",
      };
    });
  }

  placedHint() {
    const n = this.S.pending.length;
    if (this.flying()) return "Click the field to drop more mid-flight.";
    if (this.S.view === "mission") return "Click the field to plan the next mission.";
    return n ? `${n} placed. Click the field to add more.` : "Click the field to place.";
  }

  byCheckpoint(m = this.mission()) {
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

  /** Decision rows for the inspector, newest first. */
  decisions() {
    const m = this.mission();
    if (!m) return [];
    return [...this.byCheckpoint(m).values()]
      .sort((a, b) => b.k - a.k)
      .map((c) => {
        const d = c.decision, a = d?.answer ?? c.hold?.answer;
        let tone = "wait", status = "Verifying";
        if (d) [tone, status] = ["ok", d.action_applied];
        else if (c.stop) [tone, status] = ["bad", "Safe stop"];
        else if (c.human) [tone, status] = ["ok", `Human · ${c.human.action}`];
        else if (c.hold) [tone, status] = ["hold", "Asking a human"];
        else if (c.refusals.length) [tone, status] = ["bad", "Refused"];
        const x = d ?? c.hold;
        return {
          k: c.k,
          asset: (d ?? c.hold ?? c.stop ?? c.refusals.at(-1))?.asset ?? null,
          crop: `/api/missions/${m.id}/crop/${c.k}.png`,
          label: a ? this.labelInfo(a.label) : null,
          answer: a ?? null,
          tone,
          status,
          refusals: c.refusals,
          stop: c.stop,
          askHuman: !!(c.hold && !c.human && !c.stop),
          holdReason: c.hold?.decision_model?.reason ?? "low confidence",
          requestId: x?.request_id ?? null,
          signer: x?.signer ?? null,
          root: d?.root ?? null,
          rootUrl: d?.rootUrl ?? null,
        };
      });
  }

  /** The verify-before-actuate moment for the checkpoint in focus, as five steps. */
  live() {
    const m = this.mission(), live = this.S.robot?.checkpoint, sim = this.S.robot?.sim;
    if (this.S.live.k === null || Date.now() > this.S.live.until || !m || this.S.comparing || !this.inMission()) return null;
    const k = this.S.live.k;
    const c = this.byCheckpoint(m).get(k) ?? { refusals: [] };
    const cpState = (sim?.checkpoints ?? []).find((x) => x.k === k);
    const d = c.decision, lastRef = c.refusals.at(-1), a = d?.answer ?? lastRef?.attempted_answer ?? c.hold?.answer;
    const waiting = live?.k === k && live.status === "waiting";
    const att = (c.attempts ?? []).filter((x) => x.kind === "0g").at(-1);
    const model = m.policy?.vision_model ?? "0G";
    const li = a ? this.labelInfo(a.label) : null;
    const steps = [
      { name: "Hold", state: "done", detail: `nonce ${short(cpState?.nonce ?? live?.nonce, 8)}` },
      a
        ? { name: "Ask 0G", state: "done", detail: `${model}${att?.latency_ms ? ` · ${att.latency_ms} ms` : ""}` }
        : c.stop
          ? { name: "Ask 0G", state: "fail", detail: "No signed answer from 0G" }
          : { name: "Ask 0G", state: "now", detail: live?.last_error ? live.last_error.slice(0, 70) : `Sealed call to ${model}` },
      a ? { name: "Answer", state: "done", detail: `${li.name} · severity ${a.severity} · ${a.action}`, color: li.color } : { name: "Answer", state: c.stop ? "fail" : "todo", detail: "" },
      d
        ? { name: "Interlock", state: "done", detail: `Signer ${short(d.signer, 6)} allowlisted · covers bytes (${d.binding})` }
        : lastRef
          ? { name: "Interlock", state: "fail", detail: `Refused · ${lastRef.reason}` }
          : c.hold
            ? { name: "Interlock", state: "now", detail: "Calibrated hold · waiting for a human" }
            : { name: "Interlock", state: "todo", detail: "" },
      d ? { name: "Act", state: "done", detail: `${d.action_applied} · entry #${d.seq} → 0G Storage` } : c.stop ? { name: "Act", state: "fail", detail: `Safe stop · ${c.stop.reason}` } : { name: "Act", state: "todo", detail: "" },
    ];
    const focus = [...steps].reverse().find((s) => s.state !== "todo");
    const verdict = d ? ["ok", "Accepted"] : c.stop ? ["bad", "Safe stop"] : lastRef ? ["bad", `${c.refusals.length} refused`] : ["wait", "Verifying"];
    return {
      k,
      name: cpState?.asset ?? null,
      crop: `/api/missions/${m.id}/crop/${k}.png`,
      steps,
      focus,
      verdict,
      lease: waiting && live.lease_ms ? live.remaining_ms / live.lease_ms : 0,
    };
  }

  record() {
    const m = this.mission(), st = this.S.status;
    if (!m) return null;
    const replay = !m.replay ? { text: "After close" } : m.replay.match ? { tone: "ok", text: `Trajectory hash matches · ${short(m.replay.trajectory_hash)}` } : { tone: "bad", text: m.replay.error || (m.replay.mismatches || []).join("; ") || "Trajectory hash differs" };
    const rows = [
      { k: "Mission", v: short(m.id, 14), mono: true },
      { k: "Profile", v: m.profile?.id ?? "–" },
      { k: "Manifest root", v: m.manifestRoot ? short(m.manifestRoot, 12) : "Uploading…", href: m.manifestTxUrl || m.manifestUrl, mono: true },
      { k: "TEE allowlist", v: (m.policy.tee_signers || []).map((s) => short(s, 8)).join(", "), mono: true },
      { k: "registerMission", v: m.registerTx ? short(m.registerTx, 12) : this.S.cfg?.chain ? "Pending…" : "Chain disabled", href: m.registerTxUrl, mono: !!m.registerTx },
      { k: "Anchors", v: m.anchors.map((a) => a.count).join(" · ") || "None yet", links: m.anchors.map((a) => ({ text: `${a.count}`, href: a.txUrl })) },
      { k: "closeMission", v: m.closeTx ? short(m.closeTx, 12) : m.status, href: m.closeTxUrl, mono: !!m.closeTx },
      { k: "Replay", v: replay.text, tone: replay.tone },
      { k: "Writer queue", v: st?.queue ? `${st.queue} pending` : "Idle" },
      ...(m.privacy ? [
        { k: "Crops on 0G Storage", v: m.privacy.crops === "aes-256-gcm" ? "Encrypted (AES-256-GCM), key held by the operator" : m.privacy.crops },
        { k: "Inference", v: m.privacy.inference },
      ] : []),
    ];
    if (m.errors.length) rows.push({ k: "Error", v: m.errors.at(-1), tone: "bad" });
    const entries = m.entries.slice().reverse().map((e) => ({ seq: e.seq, kind: e.kind, hash: short(e.hash, 6), root: e.root ? short(e.root, 6) : null, href: e.txUrl || e.rootUrl }));
    return { rows, entries };
  }

  chips() {
    const c = this.S.cfg, st = this.S.status;
    if (!c) return [];
    if (this.S.coreOffline) return [{ tone: "bad", text: "Core offline" }];
    return [
      c.zg.mode === "mock"
        ? { tone: "warn", text: "Mock 0G" }
        : c.zg.attestation === "none"
          ? { tone: "warn", text: `${c.zg.model} · unsealed, not TEE-attested` }
          : { tone: "ok", text: `${c.zg.model} · sealed` },
      c.storage.kind === "0g" ? { tone: "ok", text: "0G Storage" } : { tone: "warn", text: "Local storage" },
      c.chain ? { tone: "ok", text: `0G Chain · ${c.chain.network}` } : { tone: "warn", text: "Chain off" },
      ...(c.arkiv ? [{ tone: "asset", text: "Arkiv · rabdi" }] : []),
      ...(st?.demo?.linkDown ? [{ tone: "bad", text: "0G link cut" }] : []),
      ...this.publicChip(),
    ];
  }

  /** On a shared public instance: say so, and how many flights are left today. */
  publicChip() {
    const p = this.S.status?.public ?? this.S.cfg?.public;
    if (!p?.enabled) return [];
    const left = Math.max(0, p.dailyCap - p.flightsToday);
    return [{ tone: left ? "idle" : "warn", text: left ? `Public demo · ${left} flights left today` : "Public demo · daily limit reached" }];
  }

  verifierUrl(m = this.mission()) {
    const c = this.S.cfg;
    const q = new URLSearchParams({ mission: m.id });
    if (c.chain) {
      q.set("network", c.chain.network);
      q.set("registry", c.chain.registry);
    }
    if (!c.publicVerifierUrl || c.storage.kind !== "0g") q.set("api", location.origin);
    return `${c.publicVerifierUrl || `${location.origin}/verify.html`}?${q}`;
  }

  /** The beat the demo should go to next, with one line of why. */
  next() {
    const m = this.mission(), d = this.S.done;
    if (this.flying()) {
      if (!d.attack) return { beat: "attack", hint: "While it flies, try to cheat: forge a decision or flip 0G's answer." };
      if (!d.kill) return { beat: "kill", hint: "Cut the 0G link before the next checkpoint and watch it fly home." };
      return { beat: null, hint: "Drop more marks on the field mid-flight, or wait for it to land." };
    }
    if (!m || this.S.view === "preview") return { beat: "fly", hint: this.S.pending.length ? `${this.S.pending.length} marks placed. Start the mission.` : "Click the field to place a cracked cell and some soiling, then start." };
    if (!d.proof) return { beat: "proof", hint: "Replay the same flight with every 0G answer forced to continue." };
    if (!d.verify) return { beat: "verify", hint: "Check the whole mission from 0G Chain and 0G Storage." };
    return { beat: "fly", hint: "Every beat shown. Start another mission to go again." };
  }

  flashIt(tone, title, detail, ms = 9000) {
    this.S.flash = { tone, title, detail, id: Date.now(), until: Date.now() + ms };
  }

  /** Turn new log entries into one visible consequence. */
  watchEntries() {
    const m = this.mission(), seen = this.S.seen;
    if (!m) return;
    const es = m.entries ?? [];
    const count = (k) => es.filter((e) => e.kind === k).length;
    const n = { rejected: count("rejected"), stop: count("safe_stop"), decision: count("decision") };
    if (seen.mission !== m.id) {
      Object.assign(seen, { mission: m.id, ...n });
      return;
    }
    if (n.stop > seen.stop) {
      const e = es.filter((x) => x.kind === "safe_stop").at(-1);
      this.flashIt("bad", "Safe stop", e?.body?.reason ?? "0G unreachable, no decision made");
    } else if (n.rejected > seen.rejected) {
      const e = es.filter((x) => x.kind === "rejected").at(-1);
      this.flashIt("bad", "Refused by the robot", `${e?.body?.source ?? "decision"}: ${e?.body?.reason ?? ""}`);
    } else if (n.decision > seen.decision) {
      const e = es.filter((x) => x.kind === "decision").at(-1)?.body;
      const li = e?.answer ? this.labelInfo(e.answer.label) : null;
      this.flashIt("ok", li ? `0G decided: ${li.name}` : "0G decided", e ? `Signed by the TEE, checked by the robot. It will ${e.action_applied}.` : "", 6000);
    }
    Object.assign(seen, n);
  }

  // ------------------------------------------------------------ scene
  attach(el) {
    if (this.s3) return;
    this.s3 = new Scene3D(el, {
      insetX: 640,
      onPlace: this.guard(async (x, y) => {
        const S = this.S;
        if (S.comparing || !S.kind) return;
        const k = S.kind;
        const v = (S.variant[k] = (S.variant[k] ?? -1) + 1) % this.kindInfo(k).variants;
        if (this.flying() && this.inMission() && !["LANDED", "STOPPED"].includes(S.robot.sim.phase)) {
          await api("/api/world/place", { kind: k, x_mm: x, y_mm: y, variant: v });
          this.toast(`${this.kindInfo(k).name} placed mid-flight. The detector will flag it; 0G decides what it is.`);
        } else {
          if (this.flying()) return this.toast("A mission is starting. Wait for takeoff to drop marks mid-flight.");
          if (S.view === "mission") await this.selectScenario(S.scenario.id);
          S.pending.push({ kind: k, x_mm: x, y_mm: y, variant: v });
          this.renderMarkers();
          this.emit();
        }
      }),
      onMarker: (k) => typeof k === "number" && this.openCheckpoint(k),
      describe: (x, y) => this.describe(x, y),
    });
    this.boot().catch((e) => this.toast(e.message, 10000));
  }

  setCam(mode) {
    this.S.cam = mode;
    this.s3?.setCameraMode(mode);
    this.emit();
  }
  setKind(kind) {
    this.S.kind = kind;
    this.emit();
  }

  adoptScenario(id) {
    const S = this.S;
    const changed = S.scenario?.id !== id;
    S.scenario = S.scenarios.find((p) => p.id === id) ?? S.scenarios[0];
    if (changed || !S.kind) {
      S.kind = S.scenario.world.kinds[0].kind;
      S.variant = {};
    }
    this.emit();
  }
  selectScenario = async (id) => {
    const S = this.S;
    S.view = "preview";
    S.pending = [];
    this.adoptScenario(id);
    this.s3.setMarkers([]);
    S.preview = await api(`/api/scenarios/${id}/preview`);
    if (S.view === "preview" && S.scenario.id === id) this.showPreview();
  };
  showMission(m) {
    this.S.view = "mission";
    this.S.pending = [];
    if (m.profile?.id) this.adoptScenario(m.profile.id);
  }
  showPreview() {
    const S = this.S;
    if (!S.preview) return;
    this.s3.resetPose();
    this.s3.setWorld(S.preview.world, `/api/scenarios/${S.scenario.id}/preview.jpg`);
    this.s3.update({ pose_mm: S.preview.home_mm.concat([0]), home_mm: S.preview.home_mm, waypoints_mm: S.preview.waypoints_mm, phase: "READY" }, []);
  }

  renderMarkers() {
    const S = this.S;
    if (S.comparing) return this.renderCompareMarkers();
    const list = [];
    if (this.inMission()) {
      const cps = this.byCheckpoint();
      for (const cp of S.robot.sim.checkpoints) {
        const c = cps.get(cp.k);
        const a = c?.decision?.answer ?? c?.hold?.answer;
        const tag = cp.asset ?? `#${cp.k}`;
        let state = "waiting", color = "#ffd60a", title = `${tag} · asking 0G…`, sub = "";
        if (cp.outcome === "safe_stop") [state, color, title, sub] = ["stopped", "#ff453a", `${tag} · safe stop`, "no decision made"];
        else if (a) {
          const li = this.labelInfo(a.label);
          [state, color, title, sub] = [cp.outcome ?? "waiting", li.color, `${cp.asset ?? `#${cp.k}`} · ${li.name}`, `sev ${a.severity} → ${cp.outcome ?? a.action}`];
        } else if (c?.refusals.length) [color, sub] = ["#ff453a", `${c.refusals.length} refused`];
        list.push({ k: cp.k, x_mm: cp.target_mm[0], y_mm: cp.target_mm[1], state, color, title, sub });
      }
    } else {
      S.pending.forEach((d, i) => {
        const ki = this.kindInfo(d.kind);
        list.push({ k: `p${i}`, x_mm: d.x_mm, y_mm: d.y_mm, state: "pending", color: ki.color, title: `${this.assetAt(d.x_mm, d.y_mm) ?? ""} · ${ki.name}`.replace(/^ · /, ""), sub: "hidden from 0G" });
      });
    }
    this.s3.setMarkers(list);
  }
  renderCompareMarkers() {
    const cps = this.byCheckpoint();
    const list = (this.S.robot?.sim?.checkpoints ?? [])
      .filter((cp) => cp.outcome === "descend")
      .map((cp) => {
        const a = cps.get(cp.k)?.decision?.answer;
        const li = a ? this.labelInfo(a.label) : { name: "defect" };
        return { k: cp.k, x_mm: cp.target_mm[0], y_mm: cp.target_mm[1], state: "descend", color: "#ff453a", title: `#${cp.k} ${li.name}`, sub: "0G: inspect · forced: skipped" };
      });
    this.s3.setMarkers(list);
  }

  // ---------------------------------------------------------- polling
  async pollRobot() {
    const S = this.S;
    try {
      const st = await api(`/api/robot/state?since=${S.samples.length}`);
      if (st.mission_id !== S.missionId) {
        S.missionId = st.mission_id;
        S.samples = [];
        this.s3.resetPose();
      } else S.samples.push(...st.samples);
      S.robot = st;
      S.robotOffline = false;
      if (this.inMission()) {
        if (st.world) this.s3.setWorld(st.world, `/api/robot/world/texture.jpg?m=${st.mission_id}&n=${st.sim.defects.length}`);
        if (!S.comparing) this.s3.update(st.sim, S.samples.map((r) => [r[1] / 1000, r[2] / 1000, r[3] / 1000]));
      }
      const live = st.checkpoint, sim = st.sim, last = sim?.checkpoints?.at(-1);
      if (live && (live.status === "waiting" || live.status === "await_human")) S.live = { k: live.k, until: Date.now() + 7000 };
      else if (last && sim.t_ms - last.t_ms < 6000 && this.mission()?.id === st.mission_id) S.live = { k: last.k, until: Date.now() + 1500 };
      this.renderMarkers();
    } catch {
      S.robot = null;
      S.robotOffline = true;
    }
    this.emit();
    setTimeout(() => this.pollRobot(), every(150));
  }

  async pollStatus() {
    const S = this.S;
    try {
      S.status = await api("/api/status");
      S.coreOffline = false;
      this.watchEntries();
      const m = this.mission();
      if (m && m.id !== S.seenMission) {
        const first = S.seenMission === null;
        S.seenMission = m.id;
        if (!first || S.view !== "preview" || !S.pending.length) this.showMission(m);
      }
    } catch {
      S.coreOffline = true;
    }
    this.emit();
    setTimeout(() => this.pollStatus(), every(800));
  }

  /** Read the mission from the 0G chain RPC itself every few seconds, so the console shows what the chain says, not what this server says. */
  async pollChain() {
    const S = this.S, c = S.cfg?.chain, m = this.mission();
    if (c && m) {
      try {
        S.onchain = { id: m.id, ...(await readMissionOnChain({ rpc: c.rpc, registry: c.registry, missionId: m.id })) };
      } catch (e) {
        S.onchain = { id: m.id, error: e.message };
      }
      this.emit();
    }
    setTimeout(() => this.pollChain(), every(3000));
  }

  async boot() {
    const S = this.S;
    S.cfg = await api("/api/config");
    const sc = await api("/api/scenarios");
    S.scenarios = sc.scenarios;
    S.status = await api("/api/status").catch(() => null);
    const m = this.mission();
    if (m?.profile) {
      S.seenMission = m.id;
      this.showMission(m);
    } else await this.selectScenario(sc.default ?? S.scenarios[0].id);
    this.pollStatus();
    this.pollRobot();
    this.pollChain();
  }

  // ------------------------------------------------------------ beats
  start = this.guard(() => this.launch({ scenario: this.S.scenario?.id, defects: this.S.pending }));
  /** Resume the survey a safe stop interrupted: same seed and marks, back to the stop point, ask 0G again. */
  resume = this.guard(async () => {
    const m = this.mission();
    if (this.S.status?.demo?.linkDown) throw new Error("0G is still cut. Restore 0G first, then resume.");
    await this.launch({ resume: m.id });
    this.toast(`Resuming from waypoint ${m.resumable.wp_idx}: the drone flies back to where it stopped and asks 0G again.`, 9000);
  });
  async launch(body) {
    const S = this.S;
    if (!body.scenario && !body.resume) throw new Error("Pick a scenario first.");
    S.starting = true;
    this.toast("Uploading the manifest with the mission profile to 0G Storage and registering it on 0G Chain…", 8000);
    try {
      const r = await api("/api/mission/start", body);
      S.done = { fly: true };
      S.seenMission = r.mission.id;
      this.exitCompare();
      this.showMission(r.mission);
      this.watchLaunch(r.mission.id);
    } finally {
      S.starting = false;
      this.emit();
    }
  }
  /** start returns at once; follow the real stages (Storage upload, Chain registration, takeoff) until the drone is flying or it fails. */
  async watchLaunch(id) {
    let last = "";
    for (let i = 0; i < 240; i++) {
      const m = await api(`/api/missions/${id}`).catch(() => null);
      if (!m) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      if (m.stage && m.stage !== last) {
        last = m.stage;
        const done = [m.manifestTxUrl && "manifest on 0G Storage", m.registerTx && "registered on 0G Chain"].filter(Boolean).join(" · ");
        this.toast(`${m.stage}…${done ? "  Done: " + done : ""}`, 12000);
      }
      if (m.status === "error") {
        this.flashIt("bad", "Mission did not start", (m.errors?.at(-1) ?? "start failed").toString().slice(0, 200));
        return;
      }
      if (m.status !== "preparing") {
        if (m.registerTx) this.toast("Registered on 0G Chain. The drone is flying.", 6000);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  toggleLink = this.guard(async () => {
    const down = !this.S.status?.demo?.linkDown;
    await api("/api/demo/link", { down });
    if (down) this.S.done.kill = true;
    this.toast(down ? "0G link cut. The next checkpoint gets no signed answer, the lease runs out and the robot safe-stops. Nothing is faked." : "0G link restored.");
  });
  estop = this.guard(() => api("/api/robot/estop", {}));
  forge = this.guard(async () => {
    await api("/api/demo/forge", {});
    this.S.done.attack = true;
    this.toast('Armed. At the next checkpoint the operator sends a forged "continue" signed with their own key.');
  });
  tamperAnswer = this.guard(async () => {
    await api("/api/demo/tamper-answer", {});
    this.S.done.attack = true;
    this.toast("Armed. The core will flip 0G's next answer but keep 0G's real TEE signature.");
  });
  tamperLog = this.guard(async () => {
    const m = this.mission();
    if (!m) throw new Error("Fly a mission first.");
    const t = await api(`/api/missions/${m.id}/tamper-log`, {});
    this.S.done.attack = true;
    this.flashIt("bad", "Edit caught", `The verifier names it: ${t.report.firstFailure ?? t.change}`);
    this.openModal({ type: "report", title: "Verifier on a tampered copy", note: t.change, report: t.report });
  });
  verify = this.guard(async () => {
    const m = this.mission();
    if (!m) throw new Error("Fly a mission first.");
    const proof = this.proof(m);
    this.openModal({ type: "loading", title: "Verifying on 0G…", note: "Reading the registry on 0G Chain and every entry from 0G Storage. The links below are the evidence it is checking.", proof });
    const r = await api(`/api/missions/${m.id}/verify?source=${this.S.cfg.chain ? "storage" : "local"}`);
    this.S.done.verify = true;
    const passed = r.checks.filter((c) => c.status === "pass").length;
    this.S.lastVerify = { id: m.id, ok: r.ok, summary: r.ok ? `${passed} checks passed against 0G Chain, 0G Storage` : r.firstFailure };
    this.flashIt(r.ok ? "ok" : "bad", r.ok ? "Verified" : "Verification failed", r.ok ? `${r.checks.filter((c) => c.status === "pass").length} checks passed against 0G.` : r.firstFailure);
    this.openModal({ type: "report", title: "Verifier", report: r, link: this.verifierUrl(m), proof });
  });
  /** The on-chain and on-Storage evidence for a mission, each row a link anyone can open without trusting this console. */
  proof(m) {
    const c = this.S.cfg?.chain;
    if (!c) return null;
    const ex = c.explorer;
    const rows = [
      { k: "Network", v: `${c.network} · chain ${c.chainId}` },
      { k: "BlackboxRegistry contract", v: c.registry, href: ex ? `${ex}/address/${c.registry}` : null },
      { k: "Mission registered", v: m.registerTx, href: m.registerTxUrl },
      ...m.anchors.map((a, i) => ({ k: `Anchor ${i + 1} · pins ${a.count} entries`, v: a.tx, href: a.txUrl, sub: `chain head ${short(a.head, 14)}` })),
      { k: "Mission closed", v: m.closeTx, href: m.closeTxUrl },
      { k: "Manifest on 0G Storage", v: m.manifestRoot, href: m.manifestUrl },
    ].filter((r) => r.v || !r.href);
    const entries = m.entries.filter((e) => e.root).map((e) => ({ k: `Entry #${e.seq} ${e.kind}`, v: e.root, href: e.rootUrl }));
    return { rows, entries };
  }
  qr = this.guard(async () => {
    const m = this.mission();
    if (!m) throw new Error("Fly a mission first.");
    const url = this.verifierUrl(m);
    let svg = "";
    if (window.qrcode) {
      const q = window.qrcode(0, "M");
      q.addData(url);
      q.make();
      svg = q.createSvgTag({ cellSize: 6, margin: 2 });
    }
    this.openModal({ type: "qr", title: "Verify on your phone", url, svg, local: ["127.0.0.1", "localhost"].includes(location.hostname) });
  });
  human = this.guard((k, action) => api("/api/robot/human", { checkpoint: k, action }));
  split = this.guard(async () => {
    if (!this.S.robot?.sim) throw new Error("Fly a mission first.");
    const cf = await api("/api/counterfactual", { force: "continue" });
    this.S.comparing = true;
    this.S.done.proof = true;
    this.flashIt("tint", "Without 0G it flies past the damage", "Red drone: every answer forced to continue. Same seed, same world.", 12000);
    this.renderCompareMarkers();
    this.s3.playCompare(cf.actual, cf.counterfactual, 5);
    this.emit();
  });
  exitCompare = () => {
    if (!this.S.comparing) return;
    this.S.comparing = false;
    this.s3.stopCompare();
    this.renderMarkers();
    this.emit();
  };

  openCheckpoint = this.guard(async (k) => {
    const m = this.mission();
    if (!m) return;
    const full = await api(`/api/missions/${m.id}/entries`).catch(() => ({ entries: [] }));
    const mine = full.entries.filter((e) => e.body?.checkpoint === k);
    const pick = mine.find((e) => e.kind === "decision") ?? mine.find((e) => e.kind === "hold") ?? mine.at(-1);
    if (!pick) return;
    const x = pick.body, z = x.zg ?? {};
    const summary = m.entries.find((e) => e.seq === pick.seq);
    const rows = [
      ["Entry", `#${pick.seq} ${pick.kind}`],
      ["Asset", x.asset],
      ["obs_hash", x.obs_hash],
      ["nonce", x.nonce],
      ["Model", z.model],
      ["request_id", z.request_id],
      ["Chat id", z.chat_id],
      ["Provider", z.provider],
      ["TEE signer", x.interlock?.signer ?? x.signer],
      ["Signed text", z.tee?.text],
      ["Binding", x.interlock?.binding],
      ["Entry hash", pick.hash],
      ["0G Storage root", summary?.root],
    ].filter(([, v]) => v);
    let raw = "";
    try {
      raw = JSON.parse(z.raw_response).choices[0].message.content;
    } catch {}
    const problems = mine.filter((e) => e.kind === "rejected" || e.kind === "safe_stop").map((e) => (e.kind === "rejected" ? `${e.body.source}: ${e.body.reason}` : e.body.reason));
    this.openModal({ type: "checkpoint", title: x.asset ? `Checkpoint ${k} · ${x.asset}` : `Checkpoint ${k}`, crop: `/api/missions/${m.id}/crop/${k}.png`, rows, raw, problems });
  });

  openRecord = (tab = "chain") => this.openModal({ type: "record", title: "Mission record", tab });

  // ------------------------------------------------------------------ Arkiv (read in the browser)
  arkiv = () => this.S.cfg?.arkiv ?? null;
  async arkivClient() {
    const { arkivPublic } = await arkivRead();
    return (this._ak ??= arkivPublic(this.arkiv()?.accessKey ?? ""));
  }
  defectLabels() {
    const p = this.profile();
    return (p?.decision?.labels ?? []).filter((l) => p.decision.label_actions?.[l] === "descend" && l !== "unsure");
  }
  /** Every inspection of one asset, across missions and inspectors, plus the owner's register entry. */
  history = this.guard(async (asset) => {
    const site = this.profile()?.id;
    this.openModal({ type: "history", title: `${asset} · history`, loading: true });
    const { assetHistory } = await arkivRead();
    const h = await assetHistory(await this.arkivClient(), site, asset);
    if (this.S.modal?.type === "history") this.openModal({ type: "history", title: `${asset} · history`, asset, ...h });
  });
  analytics = this.guard(async () => {
    const p = this.profile();
    this.openModal({ type: "analytics", title: `${p.title.replace(/ survey$/, "")} · analytics`, loading: true });
    const { siteSummary } = await arkivRead();
    const a = await siteSummary(await this.arkivClient(), p.id, this.defectLabels());
    if (this.S.modal?.type === "analytics") this.openModal({ type: "analytics", title: `${p.title.replace(/ survey$/, "")} · analytics`, ...a });
  });

  openModal(modal) {
    this.S.modal = modal;
    this.emit();
  }
  closeModal = () => {
    this.S.modal = null;
    this.emit();
  };
}

export const engine = new Engine();
addEventListener("keydown", (e) => e.key === "Escape" && (engine.closeModal(), engine.exitCompare()));
