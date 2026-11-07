import { engine, short } from "../engine.js";
import { Dot } from "./ui.jsx";

/**
 * What is happening on 0G right now, in one place: the sealed model answering (Compute), the signed log landing
 * (Storage) and the mission being registered, anchored and closed (Chain). Everything here is read from the mission
 * the core already reports; nothing is simulated. Each lane counts up as it happens and the feed below lists the
 * newest events with a link to the explorer where there is one.
 */
const LANES = {
  compute: { name: "0G Compute", tone: "zg" },
  storage: { name: "0G Storage", tone: "tint" },
  chain: { name: "0G Chain", tone: "ok" },
};

const WHAT = { decision: "decision", safe_stop: "safe stop", rejected: "refusal", human: "human answer", mission_end: "mission end" };

function feed(m) {
  const ev = [];
  const sealed = m.policy?.attestation !== "none"; // say "TEE-signed" only when the mission really ran sealed
  if (m.manifestRoot) ev.push({ id: "manifest", lane: "storage", text: "Mission manifest stored", ref: short(m.manifestRoot, 8), href: m.manifestTxUrl ?? m.manifestUrl, done: !!m.manifestTxUrl });
  if (m.registerTx) ev.push({ id: "register", lane: "chain", text: "Mission registered on BlackboxRegistry", ref: short(m.registerTx, 8), href: m.registerTxUrl, done: true });
  const anchorAt = new Map((m.anchors ?? []).map((a) => [a.count, a]));
  (m.entries ?? []).forEach((e, i) => {
    const b = e.body ?? {};
    if (e.kind === "decision" && b.answer) {
      const li = engine.labelInfo(b.answer.label);
      ev.push({ id: `a${e.seq}`, lane: "compute", text: `0G answered: ${li.name}, severity ${b.answer.severity}`, sub: `${b.latency_ms ? `${b.latency_ms} ms · ` : ""}${sealed ? "TEE-signed" : "signed, unsealed"}, checked by the robot, then ${b.action_applied ?? b.answer.action}`, color: li.color, done: true });
    } else if (e.kind === "safe_stop") {
      ev.push({ id: `a${e.seq}`, lane: "compute", text: "No signed answer: safe stop", sub: b.reason, bad: true, done: true });
    } else if (e.kind === "rejected") {
      ev.push({ id: `a${e.seq}`, lane: "compute", text: "Answer refused by the robot", sub: b.reason, bad: true, done: true });
    }
    if (WHAT[e.kind]) ev.push({ id: `s${e.seq}`, lane: "storage", text: `Log entry #${e.seq} (${WHAT[e.kind]}) stored`, ref: e.root ? short(e.root, 8) : null, href: e.txUrl ?? e.rootUrl, done: !!e.txUrl });
    const a = anchorAt.get(i + 1);
    if (a) ev.push({ id: `c${a.count}`, lane: "chain", text: `Anchor: ${a.count} entries pinned on chain`, ref: a.tx ? short(a.tx, 8) : null, href: a.txUrl, done: !!a.tx });
  });
  if (m.closeTx) ev.push({ id: "close", lane: "chain", text: "Mission closed with its trajectory hash", ref: short(m.closeTx, 8), href: m.closeTxUrl, done: true });
  return ev;
}

function Lane({ lane, value, sub, bump }) {
  const L = LANES[lane];
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-caption font-semibold tracking-[0.06em] text-white/50 uppercase">
        <Dot tone={L.tone} />
        <span className="truncate">{L.name}</span>
      </div>
      <div key={bump} className="pop font-display mt-1 text-metric leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-caption text-white/40">{sub}</div>
    </div>
  );
}

export default function Live0G() {
  const S = engine.S;
  const m = engine.mission();
  if (!m || S.view !== "mission" || S.comparing) return null;

  const entries = m.entries ?? [];
  const answers = entries.filter((e) => e.kind === "decision").length;
  const refused = entries.filter((e) => e.kind === "rejected" || e.kind === "safe_stop").length;
  const stored = entries.filter((e) => e.txUrl).length;
  const anchors = (m.anchors ?? []).length;
  const busy = m.status === "preparing" || m.status === "flying";
  const closing = m.status === "ended";
  const err = m.status === "error";
  const head = err ? ["bad", "Error"] : busy ? ["tint", "Live on 0G"] : closing ? ["wait", "Closing on chain"] : ["ok", "Recorded on 0G"];
  const events = feed(m).reverse().slice(0, 5);
  const chainValue = m.closeTx ? "Closed" : m.registerTx ? `${anchors} anchor${anchors === 1 ? "" : "s"}` : "…";
  const chainSub = m.closeTx ? `${anchors} anchors · hash pinned` : m.registerTx ? "registered" : S.cfg?.chain ? "registering…" : "chain off";

  return (
    <div data-pane="live" className="panel enter enter-up pointer-events-auto w-full max-w-[620px] rounded-3xl p-3.5" role="region" aria-label="Live activity on 0G">
      <div className="flex items-center gap-2.5 px-1 pb-2.5">
        <Dot tone={head[0]} pulse={busy || closing} />
        <span className="font-display text-body font-bold tracking-[0.04em] uppercase">{head[1]}</span>
        {m.stage ? (
          <span className="flex min-w-0 items-center gap-2 text-meta text-white/55">
            <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            <span className="truncate">{m.stage}</span>
          </span>
        ) : null}
        <span className="ml-auto font-mono text-caption text-white/35">{short(m.id, 8)}</span>
      </div>

      <div className="flex gap-2">
        <Lane lane="compute" value={answers} bump={`c${answers}`} sub={refused ? `${refused} refused` : "sealed answers"} />
        <Lane lane="storage" value={`${stored}/${entries.length}`} bump={`s${stored}`} sub={stored < entries.length ? "uploading…" : "all stored"} />
        <Lane lane="chain" value={chainValue} bump={`h${anchors}${!!m.closeTx}`} sub={chainSub} />
      </div>

      {/* always rendered at full height, so the panel never grows and the camera is not re-framed mid-launch */}
      <>
        <ul className="mt-2.5 min-h-[165px]" aria-live="polite">
          {events.map((e, i) => (
            <li key={e.id} className="enter flex items-center gap-2.5 py-1.5 text-body" style={{ "--i": 0, opacity: 1 - i * 0.14 }}>
              <span className="w-[74px] shrink-0 text-caption font-semibold tracking-[0.05em] text-white/40 uppercase">{LANES[e.lane].name.replace("0G ", "")}</span>
              {e.color ? <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} /> : null}
              <span className={`min-w-0 flex-1 truncate ${e.bad ? "text-bad" : "text-white/85"}`} title={e.sub ?? e.text}>
                {e.text}
                {e.sub ? <span className="text-white/40"> · {e.sub}</span> : null}
              </span>
              {!e.done ? <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-white/60" title="in flight" /> : null}
              {e.href && e.ref ? (
                <a href={e.href} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-caption text-asset hover:underline" title="Open on the explorer">
                  {e.ref} ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    </div>
  );
}
