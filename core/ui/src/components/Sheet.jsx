import { engine, short } from "../engine.js";
import { Button, Dot, toneText } from "./ui.jsx";

const STATUS = { pass: "ok", fail: "bad", warn: "hold", skip: "idle" };

function Report({ r }) {
  return (
    <div>
      <div className="flex items-center gap-4 rounded-3xl bg-white/[0.06] p-5">
        <span className={`grid size-11 shrink-0 place-items-center rounded-full text-[20px] font-bold ${r.ok ? "bg-ok text-black" : "bg-bad text-white"}`}>{r.ok ? "✓" : "!"}</span>
        <div className="min-w-0">
          <div className="font-display text-[22px] font-semibold tracking-[0.012em]">{r.ok ? "Verified. Every check passed." : "Tampering detected."}</div>
          {r.firstFailure ? <p className="mt-1 text-[13px] leading-snug text-bad">{r.firstFailure}</p> : <p className="mt-1 font-mono text-[11px] text-white/45">robot {short(r.robot, 10)}</p>}
        </div>
      </div>
      <ul className="mt-4">
        {r.checks.map((c) => (
          <li key={c.id} className="relative flex gap-3 py-2.5 after:absolute after:inset-x-0 after:bottom-0 after:left-6 after:h-px after:bg-white/[0.07] last:after:hidden">
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
  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center p-6 transition-[background-color,visibility] duration-500 ${open ? "visible bg-black/55" : "invisible bg-black/0"}`}
      onClick={(e) => e.target === e.currentTarget && engine.closeModal()}
    >
      <div
        className={`flex max-h-[calc(100vh-48px)] w-[min(820px,100%)] flex-col overflow-hidden rounded-[32px] bg-[rgb(36_36_40/0.82)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_40px_100px_rgb(0_0_0/0.6)] backdrop-blur-[40px] transition-[transform,opacity] duration-500 ease-[var(--ease-sheet)] ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-5 scale-[0.97] opacity-0"
        }`}
      >
        {m ? (
          <>
            <header className="flex items-center gap-3 px-7 pt-6 pb-4">
              <h2 className="font-display text-[22px] font-semibold tracking-[0.012em]">{m.title}</h2>
              <span className="flex-1" />
              {m.link ? (
                <a className="text-[13px] font-medium text-tint hover:underline" href={m.link} target="_blank" rel="noreferrer">
                  Public verifier ↗
                </a>
              ) : null}
              <Button onClick={engine.closeModal}>Done</Button>
            </header>
            <div className="scroll-soft min-h-0 overflow-y-auto px-7 pb-7">
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
                      {m.rows.map(([k, v]) => (
                        <div key={k} className="relative flex gap-4 py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.07] last:after:hidden">
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

              {m.type === "qr" ? (
                <div className="flex flex-col items-center gap-4 pb-2">
                  {m.svg ? <div className="rounded-3xl bg-white p-4 [&_svg]:block" dangerouslySetInnerHTML={{ __html: m.svg }} /> : null}
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
