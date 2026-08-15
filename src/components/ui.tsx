import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad";
  hint?: string;
}

const toneStyles = {
  default: "border-slate-700/60 text-slate-100",
  good: "border-sev-ok/40 text-sev-ok",
  warn: "border-sev-warn/50 text-sev-warn",
  bad: "border-sev-crit/60 text-sev-crit",
};

export function KpiCard({ label, value, unit, icon: Icon, tone = "default", hint }: KpiCardProps) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-4 shadow-sm transition-colors ${toneStyles[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <span className="rounded-lg bg-slate-800/60 p-1.5">
          <Icon aria-hidden className="h-4 w-4 shrink-0 opacity-80" />
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  children,
  action,
  className = "",
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "info" | "muted";
  children: ReactNode;
}) {
  const styles = {
    good: "bg-sev-ok/15 text-sev-ok border-sev-ok/40",
    warn: "bg-sev-warn/15 text-sev-warn border-sev-warn/40",
    bad: "bg-sev-crit/15 text-sev-crit border-sev-crit/40",
    info: "bg-sev-info/15 text-sev-info border-sev-info/40",
    muted: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-6 text-center">
      <p className="text-sm text-red-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-red-400/50 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        Retry
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-8 text-center">
      <p className="font-medium text-slate-200">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatusDot({ tone, className = "" }: { tone: "good" | "warn" | "bad" | "info" | "muted"; className?: string }) {
  const color = {
    good: "bg-sev-ok",
    warn: "bg-sev-warn",
    bad: "bg-sev-crit",
    info: "bg-sev-info",
    muted: "bg-slate-400",
  }[tone];
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${className}`} aria-hidden />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-800 ${className}`} />;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-400 ${
        right ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

export function Td({ children, right, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <td
      className={`border-b border-slate-800/60 px-3 py-2 align-top ${right ? "text-right font-mono tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return kind === "applied" ? (
    <StatusBadge tone="good">applied</StatusBadge>
  ) : kind === "fail_safe" ? (
    <StatusBadge tone="bad">fail-safe</StatusBadge>
  ) : (
    <StatusBadge tone="info">would-be</StatusBadge>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "warn",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "warn" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/70" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        <div className="mt-2 text-sm text-slate-300">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-950 focus-visible:outline-2 ${
              tone === "danger"
                ? "bg-red-500 hover:bg-red-400 focus-visible:outline-red-300"
                : "bg-amber-500 hover:bg-amber-400 focus-visible:outline-amber-300"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Stepper({ steps }: { steps: { label: string; state: "done" | "active" | "pending" }[] }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Workflow steps">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          {i > 0 ? <span className="text-slate-600" aria-hidden>→</span> : null}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${
              s.state === "done"
                ? "border-sev-ok/40 bg-sev-ok/10 text-sev-ok"
                : s.state === "active"
                  ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 text-slate-500"
            }`}
            aria-current={s.state === "active" ? "step" : undefined}
          >
            {s.state === "done" ? "✓ " : ""}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
