import { engine } from "../engine.js";
import { Button, Segmented } from "./ui.jsx";

/** Brand, the scenario, the camera and the full log. What the core is wired to sits at the foot of the left panel. */
export default function TopBar() {
  const S = engine.S;
  const flying = engine.flying();
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-4">
      <div className="panel enter enter-down pointer-events-auto flex h-12 items-center gap-3 rounded-2xl pr-1.5 pl-4">
        <a href="/" className="pressable flex items-center gap-2" title="Back to the landing page">
          <span className="size-3.5 rounded-[2px] bg-zg shadow-[inset_0_0_0_3px_#000,0_0_0_1px_var(--color-zg)]" aria-hidden="true" />
          <span className="font-display text-[15px] font-extrabold tracking-[0.06em] uppercase">Blackbox</span>
        </a>
        <span className="h-5 w-px bg-white/10" />
        <Segmented
          value={S.scenario?.id}
          disabled={flying}
          onChange={(id) => engine.guard(engine.selectScenario)(id)}
          options={[...S.scenarios]
            .sort((a, b) => (a.id === "solar-farm" ? -1 : b.id === "solar-farm" ? 1 : 0))
            .map((p) => ({ value: p.id, label: p.id === "solar-farm" ? "Solar farm" : p.id === "bridge-deck" ? "Bridge deck" : p.title }))}
        />
      </div>

      <div className="flex-1" />

      <div className="panel enter enter-down pointer-events-auto flex h-12 items-center gap-1.5 rounded-2xl px-1.5" style={{ "--i": 2 }}>
        <Segmented
          value={S.cam}
          onChange={(m) => engine.setCam(m)}
          options={[
            { value: "orbit", label: "Orbit" },
            { value: "chase", label: "Chase" },
            { value: "top", label: "Top" },
          ]}
        />
        {engine.arkiv() ? (
          <Button variant="plain" onClick={engine.analytics} title="Site analytics, queried live from Arkiv">
            Analytics
          </Button>
        ) : null}
        <Button variant="plain" disabled={!engine.mission()} onClick={() => engine.openRecord()}>
          Full log
        </Button>
      </div>
    </header>
  );
}
