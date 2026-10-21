import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Pause, Play, Snowflake, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useSim } from "../lib/simContext";
import { useTheme } from "../lib/theme";
import { fmtTime, TZ_LABEL } from "../lib/time";
import { NAV_ITEMS } from "../lib/nav";
import { cx, LiveDot } from "./ui";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-ok text-on-accent shadow-[0_4px_14px_-4px_var(--accent)]",
        className,
      )}
    >
      <Snowflake className="h-[55%] w-[55%]" strokeWidth={2.25} aria-hidden />
    </span>
  );
}

export function Topbar() {
  const { data, running, toggle, lastUpdatedAt } = useSim();
  const { theme, toggle: toggleTheme } = useTheme();
  const now = useNow(1000);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const zones = data?.zones ?? [];
  const simTime = zones[0]?.telemetry.timestamp;
  const crit = zones.filter((z) => z.status === "red").length;
  const warn = zones.filter((z) => z.status === "yellow").length;
  const age = lastUpdatedAt ? Math.max(0, Math.round((now - lastUpdatedAt) / 1000)) : null;
  const stale = age !== null && age > 15;

  const current =
    NAV_ITEMS.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to))) ?? null;

  const status =
    crit > 0
      ? { tone: "crit" as const, text: `${crit} critical` }
      : warn > 0
        ? { tone: "warn" as const, text: `${warn} warning` }
        : { tone: "ok" as const, text: "All nominal" };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 md:hidden" aria-label="DCFlex home">
          <LogoMark className="h-7 w-7" />
        </Link>
        <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
          <ol className="flex items-center gap-1.5">
            <li className="hidden text-fg-faint sm:block">DCFlex</li>
            <li className="hidden text-fg-faint sm:block" aria-hidden>
              /
            </li>
            <li className="truncate font-medium text-fg">{current?.label ?? "Not found"}</li>
          </ol>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/"
            className={cx(
              "hidden items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset sm:inline-flex",
              status.tone === "crit"
                ? "bg-crit/10 text-crit ring-crit/25"
                : status.tone === "warn"
                  ? "bg-warn/10 text-warn ring-warn/25"
                  : "bg-ok/10 text-ok ring-ok/25",
            )}
          >
            <LiveDot tone={status.tone} pulse={status.tone !== "ok"} />
            {status.text}
          </Link>

          <div className="flex items-center rounded-full bg-surface py-0.5 pl-2.5 pr-0.5 ring-1 ring-inset ring-line">
            <span className="flex items-center gap-2 text-xs">
              <LiveDot tone={stale ? "warn" : running ? "accent" : "ok"} pulse={running} />
              <span className="font-mono tabular-nums text-fg">
                {simTime ? fmtTime(simTime).slice(0, 5) : "--:--"}
                <span className="ml-1 text-fg-faint">{TZ_LABEL}</span>
              </span>
              <span className="hidden tabular-nums text-fg-faint lg:inline">
                {age === null ? "connecting…" : stale ? `stale · ${age}s` : `${age}s ago`}
              </span>
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-pressed={running}
              aria-label={running ? "Pause simulation" : "Run simulation"}
              title={running ? "Pause simulation" : "Run simulation (advance a tick every 3s)"}
              className={cx(
                "ml-2 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                running ? "bg-accent text-on-accent" : "bg-surface-3 text-fg hover:bg-line-strong",
              )}
            >
              {running ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
              <span className="hidden sm:inline">{running ? "Running" : "Run"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle ring-1 ring-inset ring-line hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </header>
  );
}
