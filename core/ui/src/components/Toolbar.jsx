import { engine } from "../engine.js";
import { Button, Dot, Segmented } from "./ui.jsx";

/** One beat of the demo: its number, its name and its controls. The next beat is lit. */
function Beat({ id, n, name, next, done, children }) {
  const lit = next === id;
  return (
    <div className={`relative flex items-center gap-2 rounded-full py-1 pr-1 pl-3 transition-[background-color,box-shadow] duration-300 ${lit ? "bg-tint/[0.14] shadow-[inset_0_0_0_1px_rgb(100_210_255/0.55)]" : ""}`}>
      <span className={`grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums ${done ? "bg-ok text-black" : lit ? "bg-tint text-black" : "bg-white/[0.12] text-white/70"}`}>{done ? "✓" : n}</span>
      <span className={`hidden text-[13px] font-semibold whitespace-nowrap min-[1500px]:inline ${lit ? "text-white" : "text-white/70"}`}>{name}</span>
      <div className="flex items-center gap-1">{children}</div>
      {lit ? <span className="absolute -top-2 left-3 rounded-full bg-tint px-1.5 text-[10px] leading-4 font-bold tracking-wide text-black">NEXT</span> : null}
    </div>
  );
}

export default function Toolbar() {
  const S = engine.S;
  const flying = engine.flying();
  const hasMission = !!engine.mission();
  const demo = S.status?.demo ?? {};
  const next = engine.next().beat;
  const d = S.done;

  return (
    <header className="relative z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#0b0b0c] px-4">
      <a href="/" className="flex items-center gap-2 pr-1" title="Back to the launch page">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        </svg>
        <span className="font-display text-[17px] font-semibold tracking-[-0.022em]">Blackbox</span>
      </a>
      <Segmented
        value={S.scenario?.id}
        disabled={flying}
        onChange={(id) => engine.guard(engine.selectScenario)(id)}
        options={S.scenarios.map((p) => ({ value: p.id, label: p.title.replace(/ (crack |O&M )?survey$/i, "").replace(/^Bridge-deck$/, "Bridge deck") }))}
      />

      <div className="mx-auto flex items-center gap-1.5">
        <Beat id="fly" n={1} name="Fly" next={next} done={d.fly}>
          <Button variant={next === "fly" ? "prominent" : "glass"} disabled={flying || S.starting} onClick={engine.start}>
            {flying ? "In flight" : "Start mission"}
          </Button>
        </Beat>
        <Beat id="proof" n={2} name="Proof" next={next} done={d.proof}>
          <Button variant={next === "proof" ? "prominent" : "glass"} disabled={!hasMission} onClick={engine.split} title="Same seed and world, every 0G answer forced to continue">
            Replay without 0G
          </Button>
        </Beat>
        <Beat id="attack" n={3} name="Attack" next={next} done={d.attack}>
          <Button variant="destructive" onClick={engine.forge} title="The operator signs a fake continue with its own key">{demo.forgeArmed ? "Armed…" : "Forge"}</Button>
          <Button variant="destructive" onClick={engine.tamperAnswer} title="The core flips 0G's answer but keeps 0G's signature">{demo.tamperArmed ? "Armed…" : "Flip"}</Button>
          <Button variant="destructive" disabled={!hasMission} onClick={engine.tamperLog} title="Lower a severity in a local copy of the log">Edit log</Button>
        </Beat>
        <Beat id="kill" n={4} name="Kill" next={next} done={d.kill}>
          <Button variant={demo.linkDown ? "danger" : "destructive"} onClick={engine.toggleLink}>{demo.linkDown ? "Restore 0G" : "Cut 0G"}</Button>
          <Button variant="destructive" onClick={engine.estop}>E-stop</Button>
        </Beat>
        <Beat id="verify" n={5} name="Verify" next={next} done={d.verify}>
          <Button variant={next === "verify" ? "prominent" : "glass"} disabled={!hasMission} onClick={engine.verify}>Verify on 0G</Button>
          <Button disabled={!hasMission} onClick={engine.qr}>QR</Button>
        </Beat>
      </div>

      {S.cfg?.zg?.mode === "mock" ? (
        <span className="flex items-center gap-1.5 rounded-full bg-hold/15 px-3 py-1 text-[12px] font-semibold whitespace-nowrap text-hold" title="A local stand-in signs answers. Set ZG_MODE=router for the sealed model.">
          <Dot tone="hold" />
          Mock 0G
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap text-white/60">
          <Dot tone="ok" />
          Sealed 0G
        </span>
      )}
    </header>
  );
}
