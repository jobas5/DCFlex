import { Activity, Droplets, ShieldCheck, Zap } from "lucide-react";
import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { LogoMark } from "../components/Topbar";
import { Button, cx } from "../components/ui";
import { useAuth } from "../lib/auth";

const FEATURES = [
  { icon: Zap, title: "PUE & WUE in balance", body: "Grid-search 1,560 setpoint permutations against a weighted objective." },
  { icon: ShieldCheck, title: "Safe by construction", body: "Hard guardrails, slew limits and a watchdog on every write." },
  { icon: Activity, title: "Shadow before closed-loop", body: "Validate recommendations on live telemetry first." },
  { icon: Droplets, title: "Cooling transfer", body: "Move water and chiller power to the zones that need it." },
];

function Input({ label, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <input
        {...rest}
        className={cx(
          "mt-1.5 h-10 w-full rounded-lg bg-surface-2 px-3 text-sm text-fg ring-1 ring-inset ring-line-strong placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent",
          className,
        )}
      />
    </label>
  );
}

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(40rem 28rem at 0% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%), radial-gradient(36rem 26rem at 100% 100%, color-mix(in oklab, var(--ok) 12%, transparent), transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          aria-hidden
          style={{
            backgroundImage: "radial-gradient(var(--line-strong) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight text-fg">DCFlex</p>
            <p className="text-xs text-fg-subtle">Cooling digital twin</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight text-fg">
            Keep chips cool.
            <br />
            <span className="bg-gradient-to-r from-accent to-ok bg-clip-text text-transparent">Spend less energy and water.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-fg-subtle">
            A physics-guided digital twin for high-density liquid-cooled data centers. Simulate, verify, and safely apply
            cooling decisions.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border border-line bg-surface-2/60 p-4 backdrop-blur">
                <f.icon className="h-4 w-4 text-accent" aria-hidden />
                <p className="mt-2 text-sm font-medium text-fg">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-fg-faint">All telemetry is simulated by a seeded, deterministic generator.</p>
      </div>

      {/* Form */}
      <div className="relative flex items-center justify-center px-4 py-12">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{ background: "radial-gradient(36rem 24rem at 50% 0%, var(--glow), transparent 70%)" }}
        />
        <div className="relative w-full max-w-sm rounded-3xl border border-line bg-surface/80 p-8 shadow-pop backdrop-blur-2xl">
          <div className="flex items-center gap-3 lg:hidden">
            <LogoMark className="h-9 w-9" />
            <div className="leading-tight">
              <p className="font-semibold tracking-tight text-fg">DCFlex</p>
              <p className="text-xs text-fg-subtle">Cooling digital twin</p>
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-fg lg:mt-0">Sign in</h1>
          <p className="mt-1.5 text-sm text-fg-subtle">Enter your operator credentials to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Input
              label="Username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? (
              <p className="rounded-lg bg-crit/10 px-3 py-2 text-xs text-crit ring-1 ring-inset ring-crit/25" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-fg-faint">Sessions last 12 hours. Access is single-account.</p>
        </div>
      </div>
    </div>
  );
}
