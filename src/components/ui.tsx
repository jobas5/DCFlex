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
  good: "border-emerald-500/40 text-emerald-300",
  warn: "border-amber-500/50 text-amber-300",
  bad: "border-red-500/60 text-red-300",
};

export function KpiCard({ label, value, unit, icon: Icon, tone = "default", hint }: KpiCardProps) {
  return (
    <div className={`rounded-xl border bg-slate-900/70 p-4 ${toneStyles[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <Icon aria-hidden className="h-4 w-4 shrink-0 opacity-80" />
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
    <section id={id} className={`rounded-xl border border-slate-700/60 bg-slate-900/70 p-4 ${className}`}>
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
    good: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    bad: "bg-red-500/15 text-red-300 border-red-500/40",
    info: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
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
