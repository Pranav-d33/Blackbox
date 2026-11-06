import { useEffect, useRef, useSyncExternalStore } from "react";
import { engine } from "./engine.js";
import { Button, Dot, Segmented } from "./components/ui.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Dock from "./components/Dock.jsx";
import Sheet from "./components/Sheet.jsx";

function Scene() {
  const ref = useRef(null);
  useEffect(() => engine.attach(ref.current), []);
  return <div ref={ref} className="absolute inset-0 [&_canvas]:block [&_canvas]:!h-full [&_canvas]:!w-full" />;
}

/** Top-left of the scene: what a click on the field places. */
function PlacePicker() {
  const S = engine.S;
  const kinds = S.scenario?.world?.kinds ?? [];
  if (S.comparing || !kinds.length) return null;
  return (
    <div className="glass-dim pointer-events-auto flex items-center gap-1 rounded-full py-1 pr-1 pl-4">
      <span className="mr-1 text-[12px] font-medium text-white/55">Click to place</span>
      {kinds.map((k) => {
        const ki = engine.kindInfo(k.kind);
        const on = S.kind === k.kind;
        return (
          <button
            key={k.kind}
            onClick={() => engine.setKind(k.kind)}
            className={`flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors ${on ? "bg-white/20 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" : "text-white/60 hover:text-white"}`}
          >
            <span className="size-2 rounded-full" style={{ background: ki.color }} />
            {ki.name}
          </button>
        );
      })}
    </div>
  );
}

/** Top-right of the scene: what the pins mean, and the camera. */
function ViewControls() {
  const p = engine.profile();
  const labels = p ? Object.values(p.ui.labels) : [];
  return (
    <div className="flex flex-col items-end gap-2">
      <Segmented
        className="glass-dim pointer-events-auto"
        value={engine.S.cam}
        onChange={(m) => engine.setCam(m)}
        options={[
          { value: "orbit", label: "Orbit" },
          { value: "chase", label: "Chase" },
          { value: "top", label: "Top" },
        ]}
      />
      <div className="glass-dim pointer-events-auto flex flex-col gap-1.5 rounded-2xl px-3.5 py-2.5">
        {labels.map((l) => (
          <span key={l.name} className="flex items-center gap-2 text-[12px] whitespace-nowrap text-white/70">
            <span className="size-2 rounded-full" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
        <span className="flex items-center gap-2 text-[12px] whitespace-nowrap text-white/70">
          <Dot tone="bad" />
          Safe stop or refused
        </span>
      </div>
    </div>
  );
}

export default function App() {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const S = engine.S;

  return (
    <div className="flex h-full w-full flex-col bg-black">
      <Toolbar />

      <main className="relative min-h-0 flex-1">
        <Scene />
        <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-4">
          <PlacePicker />
          <div className="flex-1" />
          <ViewControls />
        </div>

        {S.comparing ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
            <div className="glass pointer-events-auto flex items-center gap-4 rounded-full py-1.5 pr-1.5 pl-5 text-[13px]">
              <span className="font-semibold">Same seed. Only 0G's answers differ.</span>
              <span className="flex items-center gap-1.5 text-white/70"><Dot tone="tint" />0G decided</span>
              <span className="flex items-center gap-1.5 text-white/70"><Dot tone="bad" />Forced to continue</span>
              <Button onClick={engine.exitCompare}>Done</Button>
            </div>
          </div>
        ) : null}

        {S.toast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div key={S.toast.id} className="glass pointer-events-auto max-w-[620px] animate-[toast-in_450ms_var(--ease-sheet)] rounded-2xl px-5 py-3 text-center text-[14px] leading-snug">
              {S.toast.msg}
            </div>
          </div>
        ) : null}
      </main>

      <Dock />
      <Sheet />
    </div>
  );
}
