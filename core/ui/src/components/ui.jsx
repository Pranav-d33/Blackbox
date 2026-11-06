// Primitives: one button family, one segmented control, status dots and list rows. No nested cards.

const TONE = { ok: "bg-ok", bad: "bg-bad", wait: "bg-wait", hold: "bg-hold", warn: "bg-hold", idle: "bg-white/40", tint: "bg-tint" };
const TONE_TEXT = { ok: "text-ok", bad: "text-bad", wait: "text-wait", hold: "text-hold", warn: "text-hold", idle: "text-white/60", tint: "text-tint" };
export const toneText = (t) => TONE_TEXT[t] ?? "text-white/60";

export function Dot({ tone = "idle", pulse = false, className = "" }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${TONE[tone] ?? "bg-white/40"} ${pulse ? "pulse" : ""} ${className}`} />;
}

const VARIANT = {
  glass: "bg-white/10 hover:bg-white/[0.16] text-white",
  prominent: "bg-white text-black hover:bg-white/90 font-semibold",
  destructive: "bg-white/10 hover:bg-bad/20 text-bad",
  danger: "bg-bad text-white",
  plain: "bg-transparent hover:bg-white/10 text-white/80",
};
const SIZE = {
  sm: "h-8 px-3.5 text-[13px] tracking-[-0.006em]",
  md: "h-10 px-5 text-[15px] tracking-[-0.009em]",
  lg: "h-12 px-6 text-[17px] tracking-[-0.022em]",
};

export function Button({ variant = "glass", size = "sm", className = "", children, ...rest }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented({ options, value, onChange, disabled = false, className = "", size = "sm" }) {
  const pad = size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-9 px-4 text-[14px]";
  return (
    <div className={`inline-flex items-center rounded-full bg-black/25 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`${pad} rounded-full font-medium tracking-[-0.006em] whitespace-nowrap transition-[background-color,color] duration-200 ease-[var(--ease-sheet)] disabled:cursor-default ${
            o.value === value ? "bg-white/[0.22] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]" : "text-white/60 hover:text-white"
          }`}
        >
          {o.label}
          {o.badge ? <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[11px] font-semibold tabular-nums">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A list row: content separated by hairlines, never boxed. */
export function Row({ children, className = "", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`relative flex w-full items-center gap-3 py-3 text-left after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/[0.08] last:after:hidden ${onClick ? "rounded-xl transition-colors hover:bg-white/[0.06] -mx-2 px-2 w-[calc(100%+1rem)]" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div className="mb-1 flex items-baseline justify-between">
      <h3 className="font-display text-[15px] font-semibold tracking-[-0.009em] text-white/90">{children}</h3>
      {aside ? <span className="text-[12px] text-white/45">{aside}</span> : null}
    </div>
  );
}
