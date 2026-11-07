import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { engine } from "./engine.js";
import { Button, Dot } from "./components/ui.jsx";
import TopBar from "./components/TopBar.jsx";
import Flow from "./components/Flow.jsx";
import Findings from "./components/Findings.jsx";
import Site from "./components/Site.jsx";
import Live0G from "./components/Live0G.jsx";
import StressBar from "./components/StressBar.jsx";
import Sheet from "./components/Sheet.jsx";

function Scene() {
  const ref = useRef(null);
  useEffect(() => engine.attach(ref.current), []);
  return <div ref={ref} className="absolute inset-0 [&_canvas]:block [&_canvas]:!h-full [&_canvas]:!w-full" />;
}

/** What the pins mean, bottom-right over the scene. Hidden while flying: the pins carry their own labels then. */
function Legend() {
  const p = engine.profile();
  if (!p || engine.flying() || engine.S.status?.demo?.linkDown) return null;
  return (
    <div className="panel enter enter-up pointer-events-auto flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ "--i": 2 }}>
      {Object.keys(p.ui.labels).map((key) => engine.labelInfo(key)).map((l) => (
        <span key={l.name} className="flex items-center gap-1.5 text-meta whitespace-nowrap text-white/60">
          <span className="size-2 rounded-full" style={{ background: l.color }} />
          {l.name}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-meta whitespace-nowrap text-white/60">
        <Dot tone="bad" />
        Refused / safe stop
      </span>
    </div>
  );
}

export default function App() {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const S = engine.S;
  // keep the 3D view framed between whichever panes are showing (after every render, and when the window changes)
  useLayoutEffect(() => engine.syncInsets());
  useEffect(() => {
    const f = () => engine.syncInsets();
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <Scene />
      <TopBar />

      <div data-panes className="pointer-events-none absolute inset-x-0 top-[80px] bottom-[84px] z-10 flex justify-between gap-4 px-4">
        <Flow />
        {/* the free window between the panes: what is happening on 0G right now, over the bottom of the 3D view */}
        <div className="hidden min-w-0 flex-1 items-end justify-center self-end min-[1180px]:flex">
          <Live0G />
        </div>
        <Site />
        <Findings />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex items-end justify-center gap-3 px-4">
        <StressBar />
      </div>
      <div className="pointer-events-none absolute right-4 bottom-4 z-10 hidden min-[1500px]:block">
        <Legend />
      </div>

      {S.comparing ? (
        <div className="pointer-events-none absolute inset-x-0 top-[84px] z-20 flex justify-center">
          <div className="panel enter enter-down pointer-events-auto flex items-center gap-4 rounded-2xl py-1.5 pr-1.5 pl-5 text-body">
            <span className="font-semibold">Same seed. Only 0G's answers differ.</span>
            <span className="flex items-center gap-1.5 text-white/65"><Dot tone="tint" />0G decided</span>
            <span className="flex items-center gap-1.5 text-white/65"><Dot tone="bad" />Forced to continue</span>
            <Button onClick={engine.exitCompare}>Done</Button>
          </div>
        </div>
      ) : null}

      {S.toast ? (
        <div className="pointer-events-none absolute inset-x-0 top-[84px] z-30 flex justify-center px-[380px]">
          <div key={S.toast.id} role="status" aria-live="polite" className="panel pointer-events-auto max-w-[560px] animate-[toast-in_400ms_var(--ease-sheet)] rounded-2xl px-4 py-2.5 text-center text-body leading-snug text-white/85">
            {S.toast.msg}
          </div>
        </div>
      ) : null}

      {S.coreOffline ? (
        <div role="alert" className="pointer-events-none absolute inset-x-0 top-[84px] z-40 flex justify-center">
          <div className="panel enter enter-down pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2.5 text-body">
            <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-bad" />
            <span className="text-white/85">Lost the connection to the core. Retrying automatically…</span>
          </div>
        </div>
      ) : null}

      <Sheet />
    </div>
  );
}
