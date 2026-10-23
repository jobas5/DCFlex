import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type TelemetryCurrentResponse } from "./api";
import { useAuth } from "./auth";
import { usePoll } from "./poll";

interface SimContextValue {
  data: TelemetryCurrentResponse | null;
  running: boolean;
  toggle: () => void;
  refresh: () => Promise<void>;
  lastUpdatedAt: number | null;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const authed = status === "authed";
  const [data, setData] = useState<TelemetryCurrentResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.telemetryCurrent();
      setData(d);
      setLastUpdatedAt(Date.now());
    } catch {
      /* keep last good data */
    }
  }, []);

  // Poll only while signed in: polling the login screen would just 401 every 5s.
  // While Run mode is active the tick interval below refreshes the same payload
  // every 3s, so the cheaper 5s poll stands down.
  useEffect(() => {
    if (!authed) {
      setData(null);
      setRunning(false);
    }
  }, [authed]);

  usePoll(
    async () => {
      if (!authed || running) return;
      await refresh();
    },
    5000,
    [authed, refresh, running],
  );

  usePoll(
    async () => {
      if (!authed || !running) return;
      try {
        const d = await api.telemetryTick();
        setData(d);
        setLastUpdatedAt(Date.now());
      } catch {
        /* ignore */
      }
    },
    3000,
    [authed, running],
  );

  const toggle = useCallback(() => setRunning((v) => !v), []);

  return (
    <SimContext.Provider value={{ data, running, toggle, refresh, lastUpdatedAt }}>
      {children}
    </SimContext.Provider>
  );
}

export function useSim(): SimContextValue {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within SimProvider");
  return ctx;
}
