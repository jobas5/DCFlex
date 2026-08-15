import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeftRight,
  BrainCircuit,
  Database,
  Gauge as GaugeIcon,
  Snowflake,
} from "lucide-react";
import { ToastProvider } from "../components/Toast";

const NAV = [
  { to: "/", label: "Overview", icon: GaugeIcon },
  { to: "/whatif", label: "Control Loop", icon: Activity },
  { to: "/transfer", label: "Cooling Transfer", icon: ArrowLeftRight },
  { to: "/model", label: "Surrogate Model", icon: BrainCircuit },
  { to: "/master", label: "Master Data", icon: Database },
] as const;

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 max-md:flex-col max-md:gap-1 max-md:px-2 max-md:py-1.5 max-md:text-[11px] ${
              active
                ? "bg-cyan-500/15 text-cyan-300 max-md:bg-transparent"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 max-md:hover:bg-transparent"
            }`}
          >
            <Icon className="h-5 w-5 max-md:h-5 max-md:w-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </>
  );
}

function Layout() {
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-slate-950 text-slate-100">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-800 bg-slate-900/60 p-4 md:flex">
          <Link to="/" className="flex items-center gap-2.5 px-2 py-1 focus-visible:outline-2 focus-visible:outline-cyan-400">
            <Snowflake className="h-6 w-6 text-cyan-400" aria-hidden />
            <div>
              <p className="text-sm font-semibold leading-tight">DC Liquid Cooling</p>
              <p className="text-xs text-slate-400">Optimizer · Digital Twin</p>
            </div>
          </Link>
          <nav aria-label="Primary" className="mt-8 flex flex-col gap-1">
            <NavItems />
          </nav>
          <div className="mt-auto rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-300">Simulated telemetry</p>
            <p className="mt-1">Digital twin stands in for physical BMS/CDU hardware (BACnet · Modbus · MQTT).</p>
          </div>
        </aside>

        {/* Main */}
        <div className="md:pl-60">
          <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-slate-800 bg-slate-950/85 px-4 py-3 backdrop-blur md:hidden">
            <Snowflake className="h-5 w-5 text-cyan-400" aria-hidden />
            <p className="text-sm font-semibold">DC Liquid Cooling Optimizer</p>
          </header>
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-10">
            <Outlet />
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-slate-800 bg-slate-900/95 px-2 py-2 backdrop-blur md:hidden"
        >
          <NavItems />
        </nav>
      </div>
    </ToastProvider>
  );
}

export const rootRoute = createRootRoute({ component: Layout });
