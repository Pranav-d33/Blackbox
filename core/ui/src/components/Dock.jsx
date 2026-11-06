import { useEffect, useRef, useState } from "react";
import { engine } from "../engine.js";
import { Decisions, Log, OnZeroG, Sdk } from "./Record.jsx";
import { Dot, Segmented, toneText } from "./ui.jsx";

const MIN = 170, MAX_FRAC = 0.62, DEFAULT = 300;
const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem("bb.dock") ?? "null");
    return v && typeof v.h === "number" ? v : { h: DEFAULT, open: true };
  } catch {
    return { h: DEFAULT, open: true };
  }
};

/** Drag to resize, double-click or the chevron to collapse. Remembers its height. */
function useDock() {
  const [dock, setDock] = useState(load);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem("bb.dock", JSON.stringify(dock));
    } catch {}
  }, [dock]);
  const drag = useRef(null);
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: dock.open ? dock.h : 0 };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const max = innerHeight * MAX_FRAC;
    const raw = drag.current.h + (drag.current.y - e.clientY);
    // past the limits the dock resists instead of stopping dead
    const h = raw > max ? max + (raw - max) * 0.2 : raw < MIN ? MIN - (MIN - raw) * 0.2 : raw;
    setDock({ h: Math.max(40, h), open: true });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setDock((d) => (d.h < MIN * 0.7 ? { h: DEFAULT, open: false } : { h: Math.min(innerHeight * MAX_FRAC, Math.max(MIN, d.h)), open: true }));
  };
  const toggle = () => setDock((d) => ({ ...d, open: !d.open }));
  return { dock, dragging, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: toggle }, toggle };
}

function Stat({ value, unit, label }) {
  return (
    <div>
      <div className="font-display text-[30px] leading-none font-semibold tracking-[0.01em] tabular-nums">
        {value ?? "–"}
        {value != null && unit ? <span className="ml-0.5 text-[15px] font-medium text-white/45">{unit}</span> : null}
      </div>
      <div className="mt-1.5 text-[12px] text-white/45">{label}</div>
    </div>
  );
}

function Telemetry() {
  const p = engine.profile();
  const phase = engine.phase();
  const tel = engine.telemetry();
  const tone = phase.tone === "fly" ? "tint" : phase.tone === "hold" ? "wait" : phase.tone === "stop" ? "bad" : phase.tone === "done" ? "ok" : "idle";
  return (
    <section className="flex min-w-0 flex-col gap-4 overflow-hidden p-5">
      <div>
        <div className={`flex items-center gap-2 text-[13px] font-medium ${toneText(tone)}`}>
          <Dot tone={tone} pulse={tone === "tint" || tone === "wait"} />
          {phase.text}
        </div>
        <h2 className="font-display mt-1.5 truncate text-[20px] leading-tight font-semibold tracking-[0.019em]">{p?.title ?? "Inspection mission"}</h2>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat value={tel?.t} unit="s" label="Flight" />
        <Stat value={tel?.z} unit="m" label="Altitude" />
        <Stat value={tel?.cps} label="Checks" />
      </div>
      <ul className="mt-auto space-y-1.5 text-[12px] text-white/55">
        {engine.chips().map((c) => (
          <li key={c.text} className="flex items-center gap-2">
            <Dot tone={c.tone} />
            {c.text}
          </li>
        ))}
        {tel ? <li className="text-white/40">{tel.physics} · {tel.log} entries · {tel.anchors} {tel.anchors === 1 ? "anchor" : "anchors"}</li> : null}
      </ul>
    </section>
  );
}

const CIRCLE = { done: "bg-ok text-black", now: "bg-wait text-black pulse", fail: "bg-bad text-white", todo: "bg-white/10 text-white/35" };
const MARK = { done: "✓", now: "•", fail: "✕", todo: "" };
const FLASH = { ok: "border-ok/40 bg-ok/[0.08] text-ok", bad: "border-bad/45 bg-bad/[0.1] text-bad", tint: "border-tint/40 bg-tint/[0.08] text-tint" };

/** The middle of the cockpit: what is happening now, what just happened, and what to do next. */
function Pipeline() {
  const live = engine.live();
  const flash = engine.S.flash && Date.now() < engine.S.flash.until ? engine.S.flash : null;
  const next = engine.next();
  return (
    <section className="flex min-w-0 flex-col gap-3 overflow-hidden border-x border-white/[0.08] p-5">
      {flash ? (
        <div key={flash.id} className={`animate-[flash-in_500ms_var(--ease-sheet)] rounded-2xl border px-4 py-3 ${FLASH[flash.tone] ?? FLASH.tint}`}>
          <div className="font-display text-[17px] font-semibold tracking-[-0.01em]">{flash.title}</div>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/75">{flash.detail}</p>
        </div>
      ) : null}

      {live ? (
        <div className="flex min-h-0 cursor-pointer gap-4" onClick={() => engine.openCheckpoint(live.k)}>
          <img src={live.crop} alt="" className="size-[96px] shrink-0 rounded-2xl bg-white/10 object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[17px] font-semibold tracking-[-0.01em]">Checkpoint {live.k}</span>
              <span className={`text-[13px] font-semibold ${toneText(live.verdict[0])}`}>{live.verdict[1]}</span>
            </div>
            <ol className="mt-3 flex items-start">
              {live.steps.map((s, i) => (
                <li key={s.name} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-center">
                    <span className={`h-px flex-1 ${i === 0 ? "opacity-0" : s.state === "todo" ? "bg-white/15" : "bg-white/45"}`} />
                    <span className={`grid size-6 place-items-center rounded-full text-[11px] font-bold transition-colors duration-300 ${CIRCLE[s.state]}`}>{MARK[s.state]}</span>
                    <span className={`h-px flex-1 ${i === live.steps.length - 1 ? "opacity-0" : live.steps[i + 1].state === "todo" ? "bg-white/15" : "bg-white/45"}`} />
                  </div>
                  <span className={`text-[12px] font-medium ${s.state === "todo" ? "text-white/35" : "text-white/80"}`}>{s.name}</span>
                </li>
              ))}
            </ol>
            <p className={`mt-2 truncate text-[13px] ${live.focus?.state === "fail" ? "text-bad" : "text-white/70"}`}>{live.focus?.detail}</p>
            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-wait transition-[width] duration-200 ease-linear" style={{ width: `${Math.round(live.lease * 100)}%` }} />
            </div>
          </div>
        </div>
      ) : !flash ? (
        <div className="my-auto">
          <p className="text-[12px] font-semibold tracking-wide text-tint">NEXT</p>
          <p className="font-display mt-1 text-[20px] leading-snug font-semibold tracking-[0.019em] text-white/90">{next.hint}</p>
          <p className="mt-2 text-[13px] text-white/45">At every checkpoint the drone holds, asks 0G's sealed model, and moves only on an answer the robot itself verified.</p>
        </div>
      ) : null}
    </section>
  );
}

function Feed() {
  const [tab, setTab] = useState("decisions");
  const n = engine.decisions().length;
  return (
    <section className="flex min-h-0 min-w-0 flex-col">
      <div className="px-4 pt-3 pb-1">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "decisions", label: "Decisions", badge: n || null },
            { value: "record", label: "On 0G" },
            { value: "sdk", label: "SDK" },
            { value: "log", label: "Log" },
          ]}
        />
      </div>
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto pt-1">
        {tab === "decisions" ? <Decisions /> : tab === "record" ? <OnZeroG /> : tab === "sdk" ? <Sdk /> : <Log />}
      </div>
    </section>
  );
}

export default function Dock() {
  const { dock, dragging, handle, toggle } = useDock();
  const h = dock.open ? dock.h : 0;
  return (
    <div className="relative z-20 shrink-0 border-t border-white/[0.08] bg-[#0b0b0c]">
      {/* handle */}
      <div className="group flex h-6 cursor-row-resize touch-none items-center justify-center select-none" title="Drag to resize · double-click to collapse" {...handle}>
        <span className="h-1 w-10 rounded-full bg-white/20 transition-colors group-hover:bg-white/45" />
        <button
          onClick={toggle}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-3 flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white"
        >
          {dock.open ? "Hide" : "Show panel"}
          <svg viewBox="0 0 12 12" width="10" height="10" className={`transition-transform duration-300 ${dock.open ? "" : "rotate-180"}`}>
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={`grid overflow-hidden ${dragging ? "" : "transition-[height] duration-300 ease-[var(--ease-sheet)]"}`} style={{ height: h, gridTemplateColumns: "minmax(240px,0.9fr) minmax(360px,1.6fr) minmax(340px,1.2fr)" }}>
        <Telemetry />
        <Pipeline />
        <Feed />
      </div>
    </div>
  );
}
