import { AlertTriangle, Check, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export type Tone = "ok" | "warn" | "crit" | "info" | "accent" | "violet" | "neutral";

// Literal class maps so Tailwind can see every tone variant.
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-crit",
  info: "text-info",
  accent: "text-accent",
  violet: "text-violet",
  neutral: "text-fg-muted",
};

const TONE_SOFT: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok ring-ok/25",
  warn: "bg-warn/10 text-warn ring-warn/25",
  crit: "bg-crit/10 text-crit ring-crit/25",
  info: "bg-info/10 text-info ring-info/25",
  accent: "bg-accent/10 text-accent ring-accent/25",
  violet: "bg-violet/10 text-violet ring-violet/25",
  neutral: "bg-surface-3 text-fg-muted ring-line-strong",
};

export const TONE_BG: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  crit: "bg-crit",
  info: "bg-info",
  accent: "bg-accent",
  violet: "bg-violet",
  neutral: "bg-fg-faint",
};

/** Zone status (thermal margin tier) → tone + labels, shared by every page. */
export const STATUS_TONE = { green: "ok", yellow: "warn", red: "crit" } as const satisfies Record<string, Tone>;
export const STATUS_LABEL = { green: "Normal", yellow: "Warning", red: "Critical" } as const;

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-medium text-fg-subtle">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = "",
  bodyClassName = "",
  id,
  padded = true,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  padded?: boolean;
}) {
  const hasHeader = title != null || action != null;
  return (
    <section
      id={id}
      className={cx("rounded-2xl border border-line bg-surface shadow-card", className)}
    >
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? (
              <span className="mt-0.5 rounded-md bg-surface-2 p-1 text-fg-subtle ring-1 ring-inset ring-line">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0">
              {title != null ? <h2 className="text-sm font-semibold text-fg">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-xs text-fg-subtle">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cx(padded && (hasHeader ? "px-5 pb-5 pt-4" : "p-5"), bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{children}</h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges & indicators                                                 */
/* ------------------------------------------------------------------ */

export function Badge({
  tone = "neutral",
  children,
  dot = false,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TONE_SOFT[tone],
        className,
      )}
    >
      {dot ? <span className={cx("h-1.5 w-1.5 rounded-full", TONE_BG[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function LiveDot({ tone = "ok", pulse = true }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden>
      {pulse ? (
        <span
          className={cx("absolute inset-0 rounded-full", TONE_BG[tone])}
          style={{ animation: "live-ping 1.8s cubic-bezier(0,0,0.2,1) infinite" }}
        />
      ) : null}
      <span className={cx("relative inline-flex h-2 w-2 rounded-full", TONE_BG[tone])} />
    </span>
  );
}

export function IconChip({ icon: Icon, tone = "neutral", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
        TONE_SOFT[tone],
        size === "sm" ? "h-6 w-6" : "h-8 w-8",
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
    </span>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return kind === "applied" ? (
    <Badge tone="ok">applied</Badge>
  ) : kind === "fail_safe" ? (
    <Badge tone="crit">fail-safe</Badge>
  ) : (
    <Badge tone="info">would-be</Badge>
  );
}

/** Signed change chip. `goodWhen` sets which direction reads as an improvement. */
export function Delta({
  value,
  unit = "%",
  goodWhen = "down",
  digits = 1,
  suffix,
  className = "",
}: {
  value: number | null;
  unit?: string;
  goodWhen?: "up" | "down" | "neutral";
  digits?: number;
  suffix?: string;
  className?: string;
}) {
  if (value === null || !Number.isFinite(value)) return null;
  const flat = Math.abs(value) < 0.5 * 10 ** -digits;
  const up = value > 0;
  const tone: Tone =
    flat || goodWhen === "neutral" ? "neutral" : (up && goodWhen === "up") || (!up && goodWhen === "down") ? "ok" : "warn";
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-medium tabular-nums", TONE_TEXT[tone], className)}>
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(value).toFixed(digits)}
      {unit}
      {suffix ? <span className="font-normal text-fg-faint">{suffix}</span> : null}
    </span>
  );
}

export function Meter({
  value,
  tone = "accent",
  className = "",
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <div className={cx("h-full rounded-full transition-[width] duration-500", TONE_BG[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Budget-usage tone: comfortable → watch → over. */
export const usageTone = (pct: number): Tone => (pct > 100 ? "crit" : pct >= 90 ? "warn" : "accent");

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  className = "",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <p className="truncate text-xs text-fg-subtle">{label}</p>
      <p
        className={cx(
          "mt-1 font-semibold tabular-nums tracking-tight",
          size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-lg",
          tone ? TONE_TEXT[tone] : "text-fg",
        )}
      >
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-fg-subtle">{unit}</span> : null}
      </p>
      {sub ? <div className="mt-0.5 text-xs text-fg-faint">{sub}</div> : null}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  unit,
  icon,
  iconTone = "neutral",
  delta,
  footer,
  chart,
  alert,
  className = "",
}: {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  iconTone?: Tone;
  delta?: ReactNode;
  footer?: ReactNode;
  chart?: ReactNode;
  alert?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface p-4 shadow-card",
        alert === "crit" ? "border-crit/40" : alert === "warn" ? "border-warn/40" : "border-line",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-fg-subtle">{label}</p>
        <IconChip icon={icon} tone={iconTone} size="sm" />
      </div>
      <p className="mt-2 text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-fg">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-fg-subtle">{unit}</span> : null}
      </p>
      <div className="mt-1.5 min-h-4">{delta}</div>
      {chart ? <div className="-mx-1 mt-2">{chart}</div> : null}
      {footer ? <div className="mt-auto pt-2 text-xs text-fg-faint">{footer}</div> : null}
    </div>
  );
}

export function Setpoints({
  sp,
  className = "",
}: {
  sp: { coolantSupplyC: number; pumpSpeedPct: number; valvePosPct: number; cduSetpointC: number };
  className?: string;
}) {
  const items = [
    ["Supply", `${sp.coolantSupplyC}°C`],
    ["Pump", `${sp.pumpSpeedPct}%`],
    ["Valve", `${sp.valvePosPct}%`],
    ["CDU", `${sp.cduSetpointC}°C`],
  ];
  return (
    <div className={cx("flex flex-wrap gap-1.5", className)}>
      {items.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-baseline gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs ring-1 ring-inset ring-line"
        >
          <span className="text-fg-subtle">{k}</span>
          <span className="font-mono font-medium text-fg">{v}</span>
        </span>
      ))}
    </div>
  );
}

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, right, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th
      className={cx(
        "whitespace-nowrap border-b border-line px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-fg-faint first:pl-0 last:pr-0",
        right && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, right, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <td
      className={cx(
        "border-b border-line px-3 py-2.5 align-middle text-fg-muted first:pl-0 last:pr-0",
        right && "text-right font-mono tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-crit/30 bg-crit/5 px-6 py-10 text-center">
      <IconChip icon={AlertTriangle} tone="crit" />
      <p className="mt-3 text-sm text-fg">{message}</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon = Inbox,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <IconChip icon={icon} tone="neutral" />
      <p className="mt-3 text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-fg-subtle">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_16px_-6px_var(--accent)] hover:bg-accent-strong",
  secondary: "bg-surface-2 text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-3",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-crit text-white hover:brightness-110",
  success: "bg-ok text-on-accent hover:brightness-110",
  outline: "text-accent ring-1 ring-inset ring-accent/40 hover:bg-accent/10",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-sm",
};

export const buttonStyles = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", className = "") =>
  cx(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,box-shadow,filter,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45",
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    className,
  );

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonStyles(variant, size, className)} {...rest} />;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
}: {
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx("inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-2 p-0.5 ring-1 ring-inset ring-line", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active ? "bg-surface text-fg shadow-card ring-1 ring-inset ring-line-strong" : "text-fg-subtle hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  tone = "accent",
  disabled,
  id,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  tone?: Tone;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const span = max - min || 1;
  const fill = `${(Math.max(0, Math.min(1, (value - min) / span)) * 100).toFixed(2)}%`;
  const color = tone === "neutral" ? "var(--fg-subtle)" : `var(--${tone})`;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className="range"
      style={{ "--fill": fill, "--range-color": color } as CSSProperties}
    />
  );
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-9 w-full appearance-none rounded-lg bg-surface-2 bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pl-3 pr-8 text-sm text-fg ring-1 ring-inset ring-line-strong focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237c8896' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  error,
  suffix,
  dirty,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  suffix?: string;
  dirty?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-xs text-fg-subtle"}>
        {label}
      </label>
      <div
        className={cx(
          "flex h-9 items-center rounded-lg bg-surface-2 ring-1 ring-inset focus-within:ring-2 focus-within:ring-accent",
          !hideLabel && "mt-1",
          error ? "ring-crit/60" : dirty ? "ring-accent/50" : "ring-line-strong",
        )}
      >
        <input
          id={id}
          // Text + decimal keypad: type=number renders locale separators (e.g. "1,11").
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error != null}
          className="h-full w-full min-w-0 bg-transparent px-3 font-mono text-sm tabular-nums text-fg outline-none"
        />
        {suffix ? <span className="pr-3 text-xs text-fg-faint">{suffix}</span> : null}
      </div>
      {error ? <p className="mt-1 text-[11px] text-crit">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog & stepper                                                    */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "warn",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "warn" | "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden />
      <div className="animate-fade-up relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <IconChip icon={AlertTriangle} tone={tone === "danger" ? "crit" : tone === "primary" ? "accent" : "warn"} />
        <h2 className="mt-4 text-base font-semibold text-fg">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={buttonStyles(tone === "danger" ? "danger" : "primary")}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Stepper({ steps }: { steps: { label: string; detail?: string; state: "done" | "active" | "pending" }[] }) {
  return (
    <ol className="grid gap-3 sm:flex sm:items-center sm:gap-0" aria-label="Workflow steps">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center sm:flex-1" aria-current={s.state === "active" ? "step" : undefined}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset",
                s.state === "done"
                  ? "bg-ok text-on-accent ring-ok"
                  : s.state === "active"
                    ? "bg-accent/15 text-accent ring-accent/50"
                    : "bg-surface-2 text-fg-faint ring-line-strong",
              )}
            >
              {s.state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cx("text-sm font-medium", s.state === "pending" ? "text-fg-subtle" : "text-fg")}>{s.label}</p>
              {s.detail ? <p className="truncate text-xs text-fg-faint">{s.detail}</p> : null}
            </div>
          </div>
          {i < steps.length - 1 ? (
            <span
              className={cx("mx-4 hidden h-px flex-1 sm:block", s.state === "done" ? "bg-ok/50" : "bg-line-strong")}
              aria-hidden
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
