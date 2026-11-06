// Primitives: one button family, one segmented control, status dots, list rows, asset ids.
import { useLayoutEffect, useRef, useState } from "react";

const TONE = { ok: "bg-ok", bad: "bg-bad", wait: "bg-wait", hold: "bg-hold", warn: "bg-hold", idle: "bg-white/35", tint: "bg-tint", zg: "bg-zg", asset: "bg-asset" };
const TONE_TEXT = { ok: "text-ok", bad: "text-bad", wait: "text-wait", hold: "text-hold", warn: "text-hold", idle: "text-white/55", tint: "text-tint", zg: "text-zg", asset: "text-asset" };
export const toneText = (t) => TONE_TEXT[t] ?? "text-white/55";

export function Dot({ tone = "idle", pulse = false, className = "" }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${TONE[tone] ?? "bg-white/35"} ${pulse ? "pulse ping" : ""} ${className}`} />;
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

/** Segmented control with a pill that slides between options (measured, so any label width works). */
export function Segmented({ options, value, onChange, disabled = false, className = "" }) {
  const root = useRef(null);
  const [pill, setPill] = useState(null);
  const [armed, setArmed] = useState(false);
  const sig = options.map((o) => o.label).join("|");

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector('[aria-pressed="true"]');
      setPill(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // no slide on first placement, only on later changes
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => (ro.disconnect(), cancelAnimationFrame(raf));
  }, [value, sig]);

  return (
    <div ref={root} role="group" className={`relative inline-flex items-center gap-0.5 rounded-xl bg-white/[0.05] p-0.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] ${className}`}>
      {pill ? (
        <span
          aria-hidden="true"
          className={`absolute top-0.5 bottom-0.5 left-0 rounded-[14px] bg-white/[0.14] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] ${armed ? "transition-[transform,width] duration-[260ms] ease-[var(--ease-out-strong)]" : ""}`}
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
        />
      ) : null}
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 h-7 rounded-[14px] px-3 text-[12.5px] font-medium whitespace-nowrap transition-[color,transform] duration-200 active:scale-[0.97] disabled:cursor-default ${
            o.value === value ? "text-white" : "text-white/55 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The robot-signed label of an inspected asset (r2m13 = row 2, module 13; x12y03 = the 1 m² deck square at 12 m, 3 m). */
export function AssetId({ name, className = "" }) {
  if (!name) return null;
  return <span className={`asset-id truncate ${className}`}>{name}</span>;
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
    <Tag onClick={onClick} className={`relative flex w-full items-center gap-3 py-2.5 text-left after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.06] last:after:hidden ${onClick ? "-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 pressable hover:bg-white/[0.05]" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
