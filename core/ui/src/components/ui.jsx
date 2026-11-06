// Primitives: one button family, one segmented control, status dots, list rows, ENS names.
import { engine } from "../engine.js";

const TONE = { ok: "bg-ok", bad: "bg-bad", wait: "bg-wait", hold: "bg-hold", warn: "bg-hold", idle: "bg-white/35", tint: "bg-tint", zg: "bg-zg", ens: "bg-ens" };
const TONE_TEXT = { ok: "text-ok", bad: "text-bad", wait: "text-wait", hold: "text-hold", warn: "text-hold", idle: "text-white/55", tint: "text-tint", zg: "text-zg", ens: "text-ens" };
export const toneText = (t) => TONE_TEXT[t] ?? "text-white/55";

export function Dot({ tone = "idle", pulse = false, className = "" }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${TONE[tone] ?? "bg-white/35"} ${pulse ? "pulse" : ""} ${className}`} />;
}

const VARIANT = {
  glass: "bg-white/[0.07] hover:bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]",
  primary: "bg-white text-[#0b0b0f] hover:bg-white/90 font-semibold",
  zg: "bg-zg text-[#120a24] hover:bg-zg/90 font-semibold",
  destructive: "bg-white/[0.05] hover:bg-bad/15 text-bad shadow-[inset_0_0_0_1px_rgb(248_113_113/0.18)]",
  danger: "bg-bad text-white",
  plain: "bg-transparent hover:bg-white/[0.08] text-white/75",
};
const SIZE = {
  xs: "h-7 px-2.5 text-[12px]",
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-5 text-[15px]",
};

export function Button({ variant = "glass", size = "sm", className = "", children, ...rest }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented({ options, value, onChange, disabled = false, className = "" }) {
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-xl bg-white/[0.05] p-0.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-[10px] px-3 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,color] duration-200 disabled:cursor-default ${
            o.value === value ? "bg-white/[0.14] text-white" : "text-white/55 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An ENS name: opens the ENS record sheet (read through the Universal Resolver). */
export function EnsName({ name, className = "" }) {
  if (!name) return null;
  return (
    <button onClick={(e) => (e.stopPropagation(), engine.ensLookup(name))} className={`ens-name truncate text-left hover:underline ${className}`} title={`Look up ${name} on ENS`}>
      {name}
    </button>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-[12px] font-semibold tracking-[0.04em] text-white/50 uppercase">{children}</h3>
      {aside ? <span className="text-[12px] text-white/40">{aside}</span> : null}
    </div>
  );
}

/** A list row: content separated by hairlines, never boxed. */
export function Row({ children, className = "", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`relative flex w-full items-center gap-3 py-2.5 text-left after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.06] last:after:hidden ${onClick ? "-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 transition-colors hover:bg-white/[0.05]" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
