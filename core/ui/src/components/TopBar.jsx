import { engine } from "../engine.js";
import { Button, Dot, Segmented } from "./ui.jsx";

/** Brand, the scenario, what this core is wired to (0G Compute, Storage, Chain), the camera and the full record. */
export default function TopBar() {
  const S = engine.S;
  const flying = engine.flying();
  const chips = engine.chips();
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-4">
      <div className="panel pointer-events-auto flex h-12 items-center gap-3 rounded-2xl pr-1.5 pl-4">
        <a href="/" className="flex items-center gap-2" title="Back to the launch page">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="3.2" fill="currentColor" />
          </svg>
          <span className="font-display text-[16px] font-semibold tracking-[-0.02em]">Blackbox</span>
        </a>
        <span className="h-5 w-px bg-white/10" />
        <Segmented
          value={S.scenario?.id}
          disabled={flying}
          onChange={(id) => engine.guard(engine.selectScenario)(id)}
          options={S.scenarios.map((p) => ({ value: p.id, label: p.id === "solar-farm" ? "Solar farm" : p.id === "bridge-deck" ? "Bridge deck" : p.title }))}
        />
      </div>

      <div className="flex-1" />

      <div className="panel pointer-events-auto flex h-12 items-center gap-1.5 rounded-2xl px-2">
        {chips.map((c) => (
          <span key={c.text} className="chip" title={c.text}>
            <Dot tone={c.tone} />
            <span className="max-w-[180px] truncate">{c.text}</span>
          </span>
        ))}
      </div>

      <div className="panel pointer-events-auto flex h-12 items-center gap-1.5 rounded-2xl px-1.5">
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
          Record
        </Button>
      </div>
    </header>
  );
}
