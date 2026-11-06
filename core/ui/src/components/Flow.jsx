import { engine, short } from "../engine.js";
import { Button, Dot, toneText } from "./ui.jsx";

const COPY = {
  "solar-farm": {
    mark: "Click a PV module to crack a cell or soil it. 0G is never told which is which.",
    fly: "The drone surveys every row. Where its camera sees a mark it holds, and 0G's sealed model decides: repair crew or cleaning round.",
    prove: "Every module the drone looked at has a robot-signed decision, stored on 0G and anchored on 0G Chain. Check it all yourself.",
  },
  "bridge-deck": {
    mark: "Click a 1 m square of the deck to add a crack or a harmless decoy (paint, cable, stain).",
    fly: "The drone sweeps the deck. Where it sees a mark it holds, and 0G's sealed model decides: structural crack or nothing to fix.",
    prove: "Every deck square the drone looked at has a robot-signed decision, stored on 0G and anchored on 0G Chain. Check it all yourself.",
  },
};
const copy = () => COPY[engine.profile()?.id] ?? COPY["solar-farm"];

function Step({ n, title, state, children, summary }) {
  const open = state === "now";
  return (
    <section className={`relative px-5 py-4 ${open ? "" : "opacity-90"}`}>
      <div className="flex items-center gap-3">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-300 ${
            state === "done" ? "pop bg-ok/90 text-[#062014]" : open ? "bg-white text-[#0b0b0f]" : "bg-white/[0.08] text-white/50"
          }`}
        >
          {state === "done" ? "✓" : n}
        </span>
        <h2 className={`font-display text-[15px] font-semibold tracking-[-0.015em] ${open ? "text-white" : "text-white/60"}`}>{title}</h2>
        {!open && summary ? <span className="ml-auto truncate text-[12px] text-white/40">{summary}</span> : null}
      </div>
      {open ? <div className="mt-3 animate-[rise-in_300ms_var(--ease-out-soft)] pl-9">{children}</div> : null}
    </section>
  );
}

function Mark() {
  const S = engine.S;
  const kinds = S.scenario?.world?.kinds ?? [];
  return (
    <>
      <p className="text-[13px] leading-relaxed text-white/60">{copy().mark}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {kinds.map((k) => {
          const ki = engine.kindInfo(k.kind);
          const on = S.kind === k.kind;
          return (
            <button
              key={k.kind}
              onClick={() => engine.setKind(k.kind)}
              className={`pressable flex h-8 items-center gap-2 rounded-xl px-3 text-[13px] font-medium ${on ? "bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)]" : "bg-white/[0.04] text-white/55 hover:text-white"}`}
            >
              <span className="size-2 rounded-full" style={{ background: ki.color }} />
              {ki.name}
              <span className="text-[11px] text-white/35">{ki.defect ? "defect" : "benign"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px]">
        {!S.pending.length ? (
          <button onClick={() => engine.sampleMarks()} className="pressable rounded-lg bg-zg/[0.12] px-2.5 py-1.5 font-medium text-zg hover:bg-zg/[0.2]" title="Adds one real defect and one look-alike so you can fly straight away">
            ✦ Try a sample
          </button>
        ) : (
          <button onClick={() => engine.clearMarks()} className="pressable rounded-lg px-2 py-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white">
            Clear all marks
          </button>
        )}
        <span className="text-white/35">{S.pending.length ? "Click the field to add more." : "or click the field to place your own."}</span>
      </div>
      {S.pending.length ? (
        <ul className="mt-3 space-y-0.5">
          {S.pending.map((d, i) => {
            const ki = engine.kindInfo(d.kind);
            const label = engine.assetAt(d.x_mm, d.y_mm);
            return (
              <li key={`${d.kind}-${d.x_mm}-${d.y_mm}`} className="enter enter-pop group flex items-center gap-2.5 rounded-lg py-1">
                <span className="size-2 shrink-0 rounded-full" style={{ background: ki.color }} />
                <span className="w-24 shrink-0 text-[13px] text-white/80">{ki.name}</span>
                <span className="asset-id min-w-0 flex-1 truncate">{label ?? "between rows"}</span>
                <button onClick={() => engine.removePending(i)} className="text-[13px] text-white/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white" title="Remove">
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button variant="primary" size="md" className="mt-4 w-full" disabled={engine.S.starting} onClick={engine.start} aria-busy={engine.S.starting}>
        {engine.S.starting ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-[#0b0b0f]/25 border-t-[#0b0b0f]" />
            Registering on 0G…
          </>
        ) : S.pending.length ? (
          `Fly the survey · ${S.pending.length} mark${S.pending.length > 1 ? "s" : ""}`
        ) : (
          "Fly the survey (no marks: a clean run)"
        )}
      </Button>
    </>
  );
}

const CIRCLE = { done: "bg-ok", now: "bg-wait pulse", fail: "bg-bad", todo: "bg-white/15" };

function Live() {
  const live = engine.live();
  const tel = engine.telemetry();
  const phase = engine.phase();
  const flash = engine.S.flash && Date.now() < engine.S.flash.until ? engine.S.flash : null;
  const stage = engine.mission()?.stage;
  const tone = phase.tone === "fly" ? "tint" : phase.tone === "hold" ? "wait" : phase.tone === "stop" ? "bad" : phase.tone === "done" ? "ok" : "idle";
  return (
    <>
      <div className={`flex items-center gap-2 text-[13px] font-medium ${toneText(tone)}`}>
        <Dot tone={tone} pulse={tone === "tint" || tone === "wait"} />
        {stage ?? phase.text}
      </div>
      {tel ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            [tel.t, "s", "flight"],
            [tel.z, "m", "altitude"],
            [tel.cps, "", "checks"],
          ].map(([v, u, l]) => (
            <div key={l} className="enter rounded-xl bg-white/[0.04] px-3 py-2" style={{ "--i": l === "flight" ? 0 : l === "altitude" ? 1 : 2 }}>
              <div className="font-display text-[19px] leading-none font-semibold tabular-nums">
                {v}
                <span className="ml-0.5 text-[11px] font-medium text-white/40">{u}</span>
              </div>
              <div className="mt-1 text-[11px] text-white/40">{l}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-white/55">{copy().fly}</p>
      )}

      {live ? (
        <button onClick={() => engine.openCheckpoint(live.k)} className="pressable enter enter-pop mt-3 flex w-full gap-3 rounded-2xl bg-white/[0.04] p-3 text-left hover:bg-white/[0.07]">
          <img src={live.crop} alt="" className="size-[72px] shrink-0 rounded-xl bg-white/10 object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="asset-id truncate">{live.name ?? `checkpoint ${live.k}`}</span>
              <span className={`shrink-0 text-[12px] font-semibold ${toneText(live.verdict[0])}`}>{live.verdict[1]}</span>
            </div>
            <ol className="mt-2 flex items-center gap-1">
              {live.steps.map((s) => (
                <li key={s.name} className="flex flex-1 flex-col gap-1">
                  <span className={`h-1 rounded-full transition-colors duration-300 ${CIRCLE[s.state]}`} />
                  <span className={`text-[10.5px] ${s.state === "todo" ? "text-white/30" : "text-white/70"}`}>{s.name}</span>
                </li>
              ))}
            </ol>
            <p className={`mt-1 truncate text-[12px] ${live.focus?.state === "fail" ? "text-bad" : "text-white/55"}`}>{live.focus?.detail}</p>
            {live.lease ? (
              <div className="mt-1.5 h-[2px] overflow-hidden rounded-full bg-white/10" title="Lease: no signed answer before it runs out means a safe stop">
                <div className="h-full rounded-full bg-wait transition-[width] duration-200 ease-linear" style={{ width: `${Math.round(live.lease * 100)}%` }} />
              </div>
            ) : null}
          </div>
        </button>
      ) : null}

      {flash ? (
        <div key={flash.id} className={`mt-3 animate-[rise-in_400ms_var(--ease-out-soft)] rounded-2xl px-3.5 py-2.5 ${flash.tone === "bad" ? "bg-bad/[0.12]" : flash.tone === "ok" ? "bg-ok/[0.1]" : "bg-zg/[0.12]"}`}>
          <div className={`text-[13px] font-semibold ${flash.tone === "bad" ? "text-bad" : flash.tone === "ok" ? "text-ok" : "text-zg"}`}>{flash.title}</div>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/65">{flash.detail}</p>
        </div>
      ) : null}
      {engine.flying() ? <p className="mt-3 text-[12px] text-white/40">Click the field to drop another mark mid-flight.</p> : null}
    </>
  );
}

/** After a safe stop: pick the survey up where the drone stopped, once 0G is back. */
function Resume() {
  const m = engine.mission();
  const r = m?.resumable;
  if (!r) return null;
  const down = engine.S.status?.demo?.linkDown;
  const closed = m.status === "closed";
  const at = engine.assetAt(...r.pose_mm) ?? (r.stoppedAt?.asset || null);
  const where = r.stoppedAt?.asset ?? at ?? `waypoint ${r.wp_idx}`;
  return (
    <div className="enter enter-pop mt-3 rounded-2xl bg-wait/[0.08] p-3.5 shadow-[inset_0_0_0_1px_rgb(251_191_36/0.2)]">
      <p className="text-[13px] font-semibold text-wait">Survey interrupted</p>
      <p className="mt-1 text-[12px] leading-relaxed text-white/65">
        The drone safe-stopped at <span className="asset-id">{where}</span> ({r.stoppedAt?.reason ?? "no decision made"}) and flew home. The stop point is in its signed log.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {down ? (
          <Button variant="primary" onClick={engine.toggleLink}>Restore 0G</Button>
        ) : null}
        <Button variant={down ? "glass" : "primary"} disabled={down || !closed || engine.S.starting} onClick={engine.resume} title={closed ? "Same seed and marks: fly back to where it stopped and ask 0G again" : "Waiting for the close on 0G Chain"}>
          {closed ? "Resume survey" : "Closing on chain…"}
        </Button>
      </div>
    </div>
  );
}

function Prove() {
  const f = engine.findings();
  const m = engine.mission();
  const v = engine.S.lastVerify?.id === m?.id ? engine.S.lastVerify : null;
  const closed = m?.status === "closed";
  return (
    <>
      <p className="text-[13px] leading-relaxed text-white/60">{copy().prove}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          [f.filter((x) => x.tone === "ok").length, "decided by 0G"],
          [f.filter((x) => x.tone === "bad").length, "refused or stopped"],
          [new Set(f.map((x) => x.asset).filter(Boolean)).size, `${engine.unitName()}s checked`],
        ].map(([v2, l]) => (
          <div key={l} className="enter rounded-xl bg-white/[0.04] px-2 py-2" style={{ "--i": l.startsWith("decided") ? 0 : l.startsWith("refused") ? 1 : 2 }}>
            <div className="font-display text-[19px] leading-none font-semibold tabular-nums">{v2}</div>
            <div className="mt-1 text-[11px] leading-tight text-white/40">{l}</div>
          </div>
        ))}
      </div>
      {v ? (
        <button key={`${v.id}-${v.ok}`} onClick={engine.verify} className={`pressable enter enter-pop mt-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ${v.ok ? "bg-ok/[0.1]" : "bg-bad/[0.12]"}`}>
          <span className={`pop grid size-6 place-items-center rounded-full text-[12px] font-bold ${v.ok ? "bg-ok text-[#062014]" : "bg-bad text-white"}`}>{v.ok ? "✓" : "!"}</span>
          <span className="min-w-0 text-[13px]">
            <span className={`font-semibold ${v.ok ? "text-ok" : "text-bad"}`}>{v.ok ? "Verified on 0G" : "Verification failed"}</span>
            <span className="block truncate text-[12px] text-white/55">{v.summary}</span>
          </span>
        </button>
      ) : null}
      <Resume />
      <div className="mt-3 flex flex-col gap-2">
        <Button variant="zg" size="md" onClick={engine.verify} title={closed ? "" : "Works while open too; the close transaction lands a few seconds after landing"}>
          Verify on 0G
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" onClick={engine.split} title="Same seed and world, every 0G answer forced to continue">
            Replay without 0G
          </Button>
          <Button size="md" onClick={engine.qr}>
            Phone QR
          </Button>
        </div>
        <Button variant="plain" onClick={() => engine.guard(engine.selectScenario)(engine.S.scenario.id)}>
          New mission
        </Button>
      </div>
    </>
  );
}

/** The demo in three steps: mark the site, fly it, prove it. */
export default function Flow() {
  const step = engine.step();
  const order = ["mark", "fly", "prove"];
  const at = order.indexOf(step);
  const st = (s) => (order.indexOf(s) < at ? "done" : s === step ? "now" : "todo");
  const m = engine.mission();
  const f = engine.findings();
  const p = engine.profile();
  return (
    <aside className="panel enter enter-left pointer-events-auto flex max-h-full w-[348px] flex-col overflow-hidden rounded-3xl">
      <div className="px-5 pt-5 pb-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-zg uppercase">{p?.assets?.unit ? `${p.title.replace(/ survey$/, "")}` : "Mission"}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/50">{p?.summary}</p>
        {m?.resumeOf && engine.S.view === "mission" ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-wait/[0.1] px-2 py-1 text-[11.5px] text-wait">
            Resumed from {short(m.resumeOf.parent, 8)} at waypoint {m.resumeOf.wp_idx}
          </p>
        ) : null}
      </div>
      <div className="scroll-soft min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto">
        <Step n={1} title="Mark the site" state={st("mark")} summary={engine.inMission() ? `${engine.S.robot?.sim?.defects?.length ?? 0} marks` : null}>
          <Mark />
        </Step>
        <Step n={2} title="Fly the survey" state={st("fly")} summary={step === "prove" ? `${f.length} checkpoint${f.length === 1 ? "" : "s"} · ${m?.status}` : null}>
          <Live />
        </Step>
        <Step n={3} title="Prove it" state={st("prove")}>
          <Prove />
        </Step>
      </div>
    </aside>
  );
}
