import { useEffect, useState } from "react";
import { engine, short } from "../engine.js";
import { AssetId, Button, Dot, Segmented, toneText } from "./ui.jsx";
import { Log, OnZeroG, Sdk } from "./Record.jsx";

const when = (t) => (t ? new Date(t * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "–");
const ArkivQuery = ({ q }) => (
  <div className="mt-5 rounded-2xl bg-black/30 p-3.5">
    <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-white/40 uppercase">Arkiv query (Rabdi, read from your browser)</p>
    <code className="block font-mono text-[11.5px] leading-relaxed break-all text-white/75">{q}</code>
  </div>
);
const Loading = () => (
  <div role="status" aria-live="polite">
    <p className="mb-4 flex items-center gap-3 text-[14px] text-white/60">
      <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      Querying Arkiv…
    </p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[58px] rounded-xl" style={{ animationDelay: `${i * 120}ms` }} />)}
    </div>
    <div className="skeleton mt-5 h-3 w-1/3 rounded-full" />
    <div className="skeleton mt-3 h-3 w-2/3 rounded-full" />
    <div className="skeleton mt-3 h-3 w-1/2 rounded-full" />
  </div>
);

/** One asset over time: every inspection by any inspector, and the owner's register entry. */
function History({ m }) {
  if (m.loading) return <Loading />;
  const reg = m.register;
  const li = (l) => (l === "safe_stop" ? { name: "Safe stop", color: "#f87171" } : engine.labelInfo(l));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Maker", reg?.maker],
          ["Model", reg?.model],
          ["Batch", reg?.batch],
          ["Warranty until", reg?.warranty_until],
        ].map(([k, v], i) => (
          <div key={k} className="enter rounded-xl bg-white/[0.05] px-3 py-2" style={{ "--i": i }}>
            <div className="text-[11px] text-white/40">{k}</div>
            <div className="truncate text-[13px] font-medium">{v ?? "not registered"}</div>
          </div>
        ))}
      </div>
      {reg ? <p className="mt-2 font-mono text-[11px] text-white/35">register owned by the site owner {short(reg.owner, 8)}</p> : null}
      <h3 className="mt-5 mb-1 text-[12px] font-semibold tracking-[0.04em] text-white/50 uppercase">{m.findings.length} inspection{m.findings.length === 1 ? "" : "s"}</h3>
      <ol className="relative ml-2 border-l border-white/10">
        {m.findings.map((f, idx) => {
          const l = li(f.label);
          return (
            <li key={f.key} className="enter relative py-2.5 pl-5" style={{ "--i": Math.min(idx, 8) }}>
              <span className="absolute top-4 -left-[5px] size-2.5 rounded-full" style={{ background: l.color }} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[14px] font-semibold">{l.name}</span>
                {f.severity >= 0 ? <span className="text-[12px] text-white/45">severity {f.severity}</span> : null}
                <span className="text-[12px] text-white/45">→ {f.action}</span>
                <span className="ml-auto text-[12px] text-white/40">{when(f.at)}</span>
              </div>
              <p className="text-[12px] text-white/60">{f.detail?.outcome ?? ""}</p>
              <p className="mt-0.5 font-mono text-[11px] text-white/35">
                mission {short(f.mission, 8)} · entry #{f.seq} · {f.source === "0g" ? `TEE ${short(f.detail?.tee_signer, 6)}` : f.source} · by {short(f.owner, 6)}
              </p>
            </li>
          );
        })}
      </ol>
      {!m.findings.length ? <p className="text-[13px] text-white/45">No inspection of this asset on Arkiv yet.</p> : null}
      <ArkivQuery q={m.query} />
    </div>
  );
}

const Bars = ({ title, rows, color = "var(--color-zg)" }) => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-white/50 uppercase">{title}</h3>
      {rows.length ? (
        rows.slice(0, 6).map(([k, n], i) => (
          <div key={k} className="enter mb-1.5 flex items-center gap-3 text-[13px]" style={{ "--i": i }}>
            <span className="w-48 shrink-0 truncate text-white/75" title={k}>{k}</span>
            <span className="grow-x h-2 rounded-full" style={{ width: `${(n / max) * 60}%`, background: color, "--i": i }} />
            <span className="tabular-nums text-white/55">{n}</span>
          </div>
        ))
      ) : (
        <p className="text-[13px] text-white/40">None yet.</p>
      )}
    </section>
  );
};

/** The site across every mission: what is broken, which maker and batch, which inspectors wrote it. */
function Analytics({ m }) {
  if (m.loading) return <Loading />;
  const label = (l) => (l === "safe_stop" ? "Safe stop" : engine.labelInfo(l).name);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [m.total, "findings"],
          [m.missions, "missions"],
          [m.open.length, "open defects"],
          [m.registered, `${engine.unitName()}s in the register`],
        ].map(([v, l], i) => (
          <div key={l} className="enter rounded-xl bg-white/[0.05] px-3 py-2.5" style={{ "--i": i }}>
            <div className="font-display text-[22px] leading-none font-semibold tabular-nums">{v}</div>
            <div className="mt-1 text-[11px] text-white/45">{l}</div>
          </div>
        ))}
      </div>
      <Bars title="Findings by label" rows={m.byLabel.map(([k, n]) => [label(k), n])} />
      <Bars title="Defects by maker and model" rows={m.defectsByMaker} color="var(--color-hold)" />
      <Bars title="Defects by batch" rows={m.defectsByBatch} color="var(--color-hold)" />
      <section className="mt-5">
        <h3 className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-white/50 uppercase">Open: the latest inspection found a defect</h3>
        {m.open.length ? (
          m.open.slice(0, 8).map((f, i) => (
            <button key={f.key} onClick={() => engine.history(f.asset)} style={{ "--i": i }} className="pressable enter flex w-full items-center gap-3 rounded-lg py-1.5 text-left text-[13px] hover:bg-white/[0.04]">
              <AssetId name={f.asset} className="w-16" />
              <span className="text-white/80">{label(f.label)} · severity {f.severity}</span>
              <span className="truncate text-white/40">{f.maker} {f.batch}</span>
              <span className="ml-auto shrink-0 text-[12px] text-white/35">{when(f.at)}</span>
            </button>
          ))
        ) : (
          <p className="text-[13px] text-white/40">Nothing open.</p>
        )}
      </section>
      <Bars title="Written by (inspector wallets)" rows={m.inspectors.map(([k, n]) => [short(k, 8), n])} color="var(--color-asset)" />
      <ArkivQuery q={m.query} />
    </div>
  );
}

function RecordSheet({ m }) {
  const [tab, setTab] = useState(m.tab ?? "chain");
  return (
    <div>
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5"
        options={[
          { value: "chain", label: "On 0G" },
          { value: "sdk", label: "Mission profile" },
          { value: "log", label: "Robot log" },
        ]}
      />
      <div className="-mx-5">{tab === "chain" ? <OnZeroG /> : tab === "sdk" ? <Sdk /> : <Log />}</div>
    </div>
  );
}

const STATUS = { pass: "ok", fail: "bad", warn: "hold", skip: "idle" };

function Report({ r }) {
  return (
    <div>
      <div className="enter enter-pop flex items-center gap-4 rounded-3xl bg-white/[0.06] p-5">
        <span className={`pop grid size-11 shrink-0 place-items-center rounded-full text-[20px] font-bold ${r.ok ? "bg-ok text-black" : "bg-bad text-white"}`}>{r.ok ? "✓" : "!"}</span>
        <div className="min-w-0">
          <div className="font-display text-[22px] font-semibold tracking-[0.012em]">{r.ok ? "Verified. Every check passed." : "Tampering detected."}</div>
          {r.firstFailure ? <p className="mt-1 text-[13px] leading-snug text-bad">{r.firstFailure}</p> : <p className="mt-1 font-mono text-[11px] text-white/45">robot {short(r.robot, 10)}</p>}
        </div>
      </div>
      <ul className="mt-4">
        {r.checks.map((c, i) => (
          <li key={c.id} style={{ "--i": Math.min(i, 12) + 3 }} className="enter relative flex gap-3 py-2.5 after:absolute after:inset-x-0 after:bottom-0 after:left-6 after:h-px after:bg-white/[0.07] last:after:hidden">
            <Dot tone={STATUS[c.status]} className="mt-1.5" />
            <div className="min-w-0">
              <div className="text-[14px] leading-snug">{c.title}</div>
              <div className={`mt-0.5 text-[12px] leading-snug break-words ${c.status === "fail" ? "text-bad" : "text-white/45"}`}>{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Proof({ p }) {
  if (!p) return null;
  const Line = ({ r }) => (
    <li className="relative flex items-baseline gap-4 py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.07] last:after:hidden">
      <span className="w-52 shrink-0 text-[13px] text-white/55">{r.k}</span>
      <span className="min-w-0 flex-1">
        {r.href ? (
          <a className="block truncate font-mono text-[12px] text-tint hover:underline" href={r.href} target="_blank" rel="noreferrer" title={r.v}>{r.v} ↗</a>
        ) : (
          <span className="block truncate font-mono text-[12px] text-white/85" title={r.v}>{r.v}</span>
        )}
        {r.sub ? <span className="block font-mono text-[11px] text-white/40">{r.sub}</span> : null}
      </span>
    </li>
  );
  return (
    <section className="mb-6">
      <h3 className="mb-1 text-[13px] font-semibold tracking-wide text-white/55 uppercase">On-chain proof</h3>
      <ul>{p.rows.map((r, i) => <Line key={i} r={r} />)}</ul>
      {p.entries.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] text-white/55 hover:text-white/80">{p.entries.length} log entries on 0G Storage</summary>
          <ul className="mt-1">{p.entries.map((r, i) => <Line key={i} r={r} />)}</ul>
        </details>
      ) : null}
    </section>
  );
}

export default function Sheet() {
  const m = engine.S.modal;
  const open = !!m;
  // Escape closes the sheet; a keyboard action gets no animation of its own beyond the normal close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && engine.closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div
      data-open={open}
      className={`sheet-scrim fixed inset-0 z-50 grid place-items-center p-6 ${open ? "visible bg-black/55" : "invisible bg-black/0"}`}
      onClick={(e) => e.target === e.currentTarget && engine.closeModal()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={m?.title ?? "Details"}
        className={`flex max-h-[calc(100vh-48px)] w-[min(820px,100%)] flex-col overflow-hidden rounded-[28px] bg-[rgb(16_17_21/0.94)] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_40px_100px_rgb(0_0_0/0.6)] backdrop-blur-[30px] transition-[transform,opacity] duration-[420ms] ease-[var(--ease-sheet)] ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-5 scale-[0.97] opacity-0"
        }`}
      >
        {m ? (
          <>
            <header className="flex items-center gap-3 px-7 pt-6 pb-4">
              <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em]">{m.title}</h2>
              <span className="flex-1" />
              {m.link ? (
                <a className="text-[13px] font-medium text-tint hover:underline" href={m.link} target="_blank" rel="noreferrer">
                  Public verifier ↗
                </a>
              ) : null}
              <Button onClick={engine.closeModal}>Done</Button>
            </header>
            <div key={m.type} className="scroll-soft enter min-h-0 overflow-y-auto px-7 pb-7" style={{ "--dy": "6px" }}>
              {m.type === "loading" ? (
                <>
                  <p className="mb-5 flex items-center gap-3 text-[14px] text-white/65">
                    <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                    {m.note}
                  </p>
                  <Proof p={m.proof} />
                </>
              ) : null}

              {m.type === "report" ? (
                <>
                  {m.note ? (
                    <p className="mb-4 text-[13px] text-white/60">
                      Changed in a local copy of the log: <span className="font-mono text-white/85">{m.note}</span>. The robot's signatures and the anchors on 0G Chain expose it.
                    </p>
                  ) : null}
                  <Report r={m.report} />
                  <div className="mt-6" />
                  <Proof p={m.proof} />
                </>
              ) : null}

              {m.type === "checkpoint" ? (
                <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
                  <figure>
                    <img src={m.crop} alt="" className="aspect-square w-full rounded-3xl bg-white/10 object-cover" />
                    <figcaption className="mt-2 text-[12px] leading-snug text-white/45">Exactly the crop the robot sent to 0G. Its keccak256 is the obs_hash, and the nonce comes from it.</figcaption>
                  </figure>
                  <div className="min-w-0">
                    <dl>
                      {m.rows.map(([k, v], i) => (
                        <div key={k} style={{ "--i": Math.min(i, 10) }} className="enter relative flex gap-4 py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.07] last:after:hidden">
                          <dt className="w-32 shrink-0 text-[13px] text-white/50">{k}</dt>
                          <dd className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/90" title={v}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {m.raw ? (
                      <>
                        <p className="mt-5 mb-2 text-[13px] text-white/55">Model output, byte for byte as 0G's TEE signed it</p>
                        <pre className="overflow-x-auto rounded-2xl bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-white/85">{m.raw}</pre>
                      </>
                    ) : null}
                    {m.problems.map((p, i) => (
                      <p key={i} className={`mt-3 text-[13px] ${toneText("bad")}`}>{p}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              {m.type === "record" ? <RecordSheet m={m} /> : null}
              {m.type === "history" ? <History m={m} /> : null}
              {m.type === "analytics" ? <Analytics m={m} /> : null}

              {m.type === "qr" ? (
                <div className="flex flex-col items-center gap-4 pb-2">
                  {m.svg ? <div className="enter enter-pop rounded-3xl bg-white p-4 [&_svg]:block" dangerouslySetInnerHTML={{ __html: m.svg }} /> : null}
                  <p className="max-w-full font-mono text-[12px] break-all text-white/60">{m.url}</p>
                  {m.local ? <p className="text-[13px] text-white/45">Set PUBLIC_VERIFIER_URL to the deployed verifier so phones can open it.</p> : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
