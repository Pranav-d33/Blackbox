import { engine } from "../engine.js";
import { Button, Dot, AssetId, toneText } from "./ui.jsx";

/** One card per inspected asset: what 0G decided there and what it means for the crew. */
export default function Findings() {
  const rows = engine.findings();
  const m = engine.mission();
  if (!m || engine.S.view !== "mission") return null;
  return (
    <aside className="panel enter enter-right pointer-events-auto flex max-h-full w-[340px] flex-col overflow-hidden rounded-3xl">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">Findings</h2>
        <span className="text-[12px] text-white/40">{rows.length ? `${rows.length} checked` : "none yet"}</span>
      </div>
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!rows.length ? (
          <p className="px-2 py-8 text-center text-[13px] leading-relaxed text-white/40">The drone holds and asks 0G each time its camera flags a mark. Findings appear here.</p>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.k}
              role="button"
              tabIndex={0}
              onClick={() => engine.openCheckpoint(r.k)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), engine.openCheckpoint(r.k))}
              style={{ "--i": Math.min(i, 5) }}
              className="pressable enter group mb-1.5 flex cursor-pointer gap-3 rounded-2xl p-2.5 hover:bg-white/[0.05]"
            >
              <img src={r.crop} alt="" className="size-12 shrink-0 rounded-xl bg-white/10 object-cover transition-transform duration-300 ease-[var(--ease-out-strong)] group-hover:scale-[1.06]" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              <div className="min-w-0 flex-1">
                <AssetId name={r.name} className="block max-w-full" />
                <div className="mt-0.5 flex items-center gap-1.5 text-[13px]">
                  {r.label ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: r.label.color }} /> : <Dot tone={r.tone} pulse={r.tone === "wait"} />}
                  <span className="font-medium text-white/90">{r.label ? r.label.name : r.status}</span>
                  {r.answer ? <span className="text-white/40">· sev {r.answer.severity}</span> : null}
                </div>
                <div className={`mt-0.5 truncate text-[12px] ${r.tone === "bad" ? "text-bad" : "text-white/55"}`}>{r.outcome}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${toneText(r.tone)}`}>{r.tone === "ok" ? `${r.status} · TEE-signed` : r.status}</span>
                  {engine.arkiv() && r.asset ? (
                    <button onClick={(e) => (e.stopPropagation(), engine.history(r.asset))} className="text-[11px] text-asset hover:underline" title="Every inspection of this asset, from Arkiv">
                      History
                    </button>
                  ) : null}
                </div>
                {r.askHuman ? (
                  <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {(m.policy?.actions ?? ["descend", "continue"]).map((a) => (
                      <Button key={a} size="xs" onClick={() => engine.human(r.k, a)}>
                        {a}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
