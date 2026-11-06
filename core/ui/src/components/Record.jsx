import { engine, short } from "../engine.js";
import { Button, Dot, Row, Segmented, SectionTitle, toneText } from "./ui.jsx";

function Empty({ children }) {
  return <p className="px-6 py-16 text-center text-[13px] leading-relaxed text-white/45">{children}</p>;
}

function LiveChain() {
  const oc = engine.S.onchain, c = engine.S.cfg?.chain, m = engine.mission();
  if (!c || !m) return null;
  const ex = c.explorer;
  const fresh = oc && oc.id === m.id ? oc : null;
  const closed = fresh && fresh.closedAt > 0;
  const lines = fresh && !fresh.error
    ? [
        ["Chain block", fresh.block.toLocaleString(), `${c.network} · chain ${c.chainId}`],
        ["Registered on chain", fresh.registered ? "Yes" : "Not yet", null, fresh.registered ? "ok" : "wait"],
        ["Entries pinned", String(fresh.count), `${fresh.anchors} anchor${fresh.anchors === 1 ? "" : "s"} on chain`],
        ["Chain head", short(fresh.head, 14), null, null, true],
        ["Closed", closed ? "Yes · trajectory " + short(fresh.trajectoryHash, 10) : "Open", null, closed ? "ok" : "wait"],
      ]
    : [];
  return (
    <div className="mb-6 rounded-3xl bg-white/[0.06] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Dot tone={fresh && !fresh.error ? "ok" : "wait"} pulse />
        <span className="text-[13px] font-semibold tracking-[-0.006em]">Live on 0G Chain</span>
        <span className="flex-1" />
        {ex ? <a className="text-[12px] text-tint hover:underline" href={`${ex}/address/${c.registry}`} target="_blank" rel="noreferrer">registry on chainscan ↗</a> : null}
      </div>
      {fresh?.error ? <p className="text-[12px] text-bad">Could not read the chain RPC: {fresh.error}</p> : null}
      {!fresh ? <p className="text-[12px] text-white/50">Reading {c.network} from {c.rpc.replace(/^https?:\/\//, "")}…</p> : null}
      {lines.map(([k, v, sub, tone, mono]) => (
        <div key={k} className="flex items-baseline gap-3 py-1">
          <span className="w-36 shrink-0 text-[13px] text-white/50">{k}</span>
          <span className={`min-w-0 flex-1 truncate text-right text-[13px] ${mono ? "font-mono text-[12px]" : ""} ${tone ? toneText(tone) : "text-white/90"}`}>{v}</span>
          {sub ? <span className="hidden text-[11px] text-white/35 sm:block">{sub}</span> : null}
        </div>
      ))}
      {fresh && !fresh.error ? (
        <p className="mt-2 font-mono text-[10.5px] text-white/35">
          eth_call getMission() on {c.rpc.replace(/^https?:\/\//, "")} · read {new Date(fresh.readAt).toLocaleTimeString()} · from your browser, not our server
        </p>
      ) : null}
    </div>
  );
}

export function OnZeroG() {
  const rec = engine.record();
  if (!rec) return <Empty>Start a mission to see its manifest, anchors and entries on 0G.</Empty>;
  return (
    <div className="px-5 pb-4">
      <LiveChain />
      <SectionTitle>Mission on 0G</SectionTitle>
      {rec.rows.map((r) => (
        <Row key={r.k} className="py-2.5">
          <span className="w-32 shrink-0 text-[13px] text-white/50">{r.k}</span>
          <span className={`min-w-0 flex-1 truncate text-right text-[13px] ${r.mono ? "font-mono text-[12px]" : ""} ${r.tone ? toneText(r.tone) : "text-white/90"}`}>
            {r.links?.length
              ? r.links.map((l, i) => (
                  <a key={i} className="ml-2 text-tint hover:underline" href={l.href} target="_blank" rel="noreferrer">
                    {l.text}
                  </a>
                ))
              : r.href
                ? <a className="text-tint hover:underline" href={r.href} target="_blank" rel="noreferrer">{r.v}</a>
                : r.v}
          </span>
        </Row>
      ))}
      <div className="mt-6">
        <SectionTitle aside={`${rec.entries.length} entries`}>Robot-signed, hash-chained log</SectionTitle>
        {rec.entries.map((e) => (
          <Row key={e.seq} className="py-2">
            <span className="w-7 shrink-0 text-[12px] tabular-nums text-white/40">{e.seq}</span>
            <Dot tone={e.kind === "decision" ? "ok" : e.kind === "rejected" || e.kind === "safe_stop" ? "bad" : "idle"} />
            <span className="w-28 shrink-0 truncate text-[13px] text-white/85">{e.kind.replace("_", " ")}</span>
            <span className="font-mono text-[11px] text-white/40">{e.hash}</span>
            <span className="ml-auto font-mono text-[11px]">
              {e.root ? <a className="text-tint hover:underline" href={e.href} target="_blank" rel="noreferrer">{e.root}</a> : <span className="text-white/35">uploading</span>}
            </span>
          </Row>
        ))}
      </div>
    </div>
  );
}

export function Sdk() {
  const p = engine.profile();
  if (!p) return null;
  const m = engine.S.view === "mission" ? engine.mission() : null;
  return (
    <div className="space-y-6 px-5 pb-6">
      <div>
        <SectionTitle aside={p.id}>Mission profile</SectionTitle>
        <p className="text-[13px] leading-snug text-white/55">
          {m?.manifestRoot ? `Inside manifest ${short(m.manifestRoot, 10)} on 0G Storage, registered on 0G Chain.` : "Goes into the manifest at takeoff: uploaded to 0G Storage, its root registered on 0G Chain."}
        </p>
      </div>
      <div>
        <p className="mb-2 text-[13px] text-white/55">0G may answer only these labels</p>
        <div className="flex flex-wrap gap-1.5">
          {p.decision.labels.map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-[12px]">
              <span className="size-1.5 rounded-full" style={{ background: engine.labelInfo(l).color }} />
              {l}
            </span>
          ))}
        </div>
        <p className="mt-4 mb-2 text-[13px] text-white/55">and choose only these actions</p>
        <div className="flex flex-wrap gap-1.5">
          {p.decision.actions.map((a) => (
            <span key={a} className="rounded-full bg-white/10 px-3 py-1 font-mono text-[12px]">{a}</span>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-snug text-white/45">The robot's interlock reads these from the manifest. Anything else is refused, never mapped to a default.</p>
      </div>
      <div>
        <SectionTitle>Plug in your robot</SectionTitle>
        <pre className="mt-2 overflow-x-auto rounded-2xl bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-white/85">
          <span className="text-[#ff7ab2]">class</span> MyRobot(Robot):{"\n"}
          {"    "}ACTIONS = ({p.decision.actions.map((a) => `"${a}"`).join(", ")}){"\n\n"}
          {"    "}<span className="text-[#ff7ab2]">def</span> step(self):{"\n"}
          {"        "}<span className="text-white/40"># your loop; when a decision is needed</span>{"\n"}
          {"        "}<span className="text-[#ff7ab2]">return</span> {"{"}"type": "checkpoint", "png": frame{"}"}{"\n\n"}
          {"    "}<span className="text-[#ff7ab2]">def</span> resolve(self, action):{"\n"}
          {"        "}<span className="text-white/40"># only an action 0G signed, or "safe_stop"</span>
        </pre>
      </div>
    </div>
  );
}

export function Log() {
  const ev = (engine.S.robot?.events ?? []).slice().reverse();
  if (!ev.length) return <Empty>The robot adapter's log appears here.</Empty>;
  return (
    <div className="space-y-0.5 px-5 pb-4 font-mono text-[11.5px] leading-relaxed">
      {ev.map((e, i) => (
        <div key={i} className={e.level === "refuse" || e.level === "stop" || e.level === "error" ? "text-bad" : e.level === "warn" ? "text-wait" : "text-white/55"}>
          <span className="text-white/30">{new Date(e.t).toLocaleTimeString()}</span> {e.text}
        </div>
      ))}
    </div>
  );
}
