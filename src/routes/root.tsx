import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { ToastProvider } from "../components/Toast";
import { LogoMark, Topbar } from "../components/Topbar";
import { cx } from "../components/ui";
import { AuthProvider, useAuth } from "../lib/auth";
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "../lib/nav";
import { SimProvider } from "../lib/simContext";
import { ThemeProvider } from "../lib/theme";
import { Login } from "./login";

function useActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (to: NavItem["to"]) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
}

function Sidebar() {
  const { logout } = useAuth();
  const isActive = useActive();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface/60 backdrop-blur-xl md:flex">
      <Link
        to="/"
        className="flex h-14 items-center gap-2.5 border-b border-line px-5 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <LogoMark />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-fg">DCFlex</p>
          <p className="text-[11px] text-fg-subtle">Cooling digital twin</p>
        </div>
      </Link>

      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map(({ to, label, icon: Icon }) => {
                const active = isActive(to);
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                        active ? "bg-surface-2 text-fg ring-1 ring-inset ring-line" : "text-fg-subtle hover:bg-surface-2/60 hover:text-fg",
                      )}
                    >
                      {active ? <span className="absolute inset-y-2 -left-3 w-0.5 rounded-full bg-accent" aria-hidden /> : null}
                      <Icon className={cx("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-faint group-hover:text-fg-subtle")} aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line">
          <p className="text-xs font-medium text-fg">Simulated telemetry</p>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
            A seeded digital twin stands in for physical BMS/CDU hardware.
          </p>
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg-muted ring-1 ring-inset ring-line">
            OP
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-fg">Operator</p>
            <p className="truncate text-[11px] text-fg-faint">Single-account session</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Log out"
            title="Log out"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-line bg-surface/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {NAV_ITEMS.map(({ to, short, icon: Icon }) => {
        const active = isActive(to);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex flex-col items-center gap-1 py-2 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-accent",
              active ? "text-accent" : "text-fg-subtle",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {short}
          </Link>
        );
      })}
    </nav>
  );
}

function Layout() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-sm text-fg-subtle">
        <LogoMark className="h-7 w-7 animate-pulse" />
        Loading…
      </div>
    );
  }

  if (status === "anonymous") {
    return <Login />;
  }

  return (
    <div className="relative min-h-dvh">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background:
            "radial-gradient(60rem 30rem at 20% -10%, var(--glow), transparent 70%), radial-gradient(40rem 24rem at 100% 0%, var(--glow), transparent 70%)",
        }}
      />
      <Sidebar />
      <div className="md:pl-64">
        <Topbar />
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

export function AppShell() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SimProvider>
            <Layout />
          </SimProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export const rootRoute = createRootRoute({ component: AppShell });
