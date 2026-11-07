import { engine } from "../engine.js";
import { SectionTitle } from "./ui.jsx";

const DOES = { descend: "Goes closer for a close-up", continue: "Moves on to the next mark" };

/**
 * The right-hand pane before a flight. Findings only exist after a mission starts, which left the right side of the
 * console empty (and the 3D view off-centre) on first load. This fills it with what a visitor needs to know first:
 * what the site is, and what 0G can decide here and what the drone does about it.
 */
export default function Site() {
  const S = engine.S;
  const p = engine.profile();
  if (!p || (S.view === "mission" && engine.mission())) return null;

  const w = S.preview?.world;
  const rows = w?.rows_mm;
  const units = rows ? rows.reduce((n, r) => n + (r[4] ?? 0), 0) : null;
  const [dw, dh] = w?.deck_mm ?? [];
  const facts = [
    rows ? [rows.length, rows.length === 1 ? "row" : "rows"] : null,
    units ? [units, `${engine.unitName()}s`] : null,
    dw ? [`${Math.round(dw / 1000)}×${Math.round(dh / 1000)}`, "metres"] : null,
  ].filter(Boolean);

  const labels = Object.keys(p.ui.labels).map((key) => [key, engine.labelInfo(key)]);

  return (
    <aside data-pane="right" className="panel enter enter-right pointer-events-auto flex max-h-full w-[304px] flex-col overflow-hidden rounded-3xl">
      <div className="px-5 pt-5 pb-3">
        <h2 className="font-display text-[13px] font-bold tracking-[0.04em] uppercase">The site</h2>
        <p className="mt-1 text-[13px] leading-snug text-white/50">{p.summary}</p>
      </div>

      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {facts.length ? (
          <div className="grid grid-cols-3 gap-2">
            {facts.map(([v, l], i) => (
              <div key={l} className="enter rounded-2xl bg-white/[0.04] px-3 py-2.5" style={{ "--i": i }}>
                <div className="font-display text-[19px] leading-none font-semibold tabular-nums">{v}</div>
                <div className="mt-1 text-[11px] text-white/40">{l}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5">
          <SectionTitle>What 0G can decide</SectionTitle>
          <ul>
            {labels.map(([key, l], i) => {
              const action = p.decision?.label_actions?.[key];
              return (
                <li key={key} className="enter relative flex items-start gap-3 py-2.5 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.06] last:after:hidden" style={{ "--i": i + 2 }}>
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: l.color }} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-white/90">{l.name}</div>
                    <div className="text-[12px] text-white/50">{DOES[action] ?? action ?? ""}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

      </div>
    </aside>
  );
}
