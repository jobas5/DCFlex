import { useState, type FormEvent } from "react";
import { Snowflake } from "lucide-react";
import { useAuth } from "../lib/auth";

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
    <div className="relative flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: "radial-gradient(60rem 40rem at 50% -10%, rgba(34,211,238,0.08), transparent)" }}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Snowflake className="h-6 w-6 text-cyan-400" aria-hidden />
          <div>
            <p className="text-sm font-semibold leading-tight">DCFlex</p>
            <p className="text-xs text-slate-400">Cooling Optimizer · Digital Twin</p>
          </div>
        </div>

        <h1 className="mt-6 text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Enter your operator credentials to continue.</p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-xs">
            <span className="text-slate-400">Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-400">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
