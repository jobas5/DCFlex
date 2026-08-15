import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type TelemetryCurrentResponse } from "./api";

interface SimContextValue {
  data: TelemetryCurrentResponse | null;
  running: boolean;
  toggle: () => void;
  lastUpdatedAt: number | null;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TelemetryCurrentResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.telemetryCurrent();
      setData(d);
      setLastUpdatedAt(Date.now());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      try {
        await api.telemetryTick();
        await refresh();
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [running, refresh]);

  const toggle = useCallback(() => setRunning((v) => !v), []);

  return (
    <SimContext.Provider value={{ data, running, toggle, lastUpdatedAt }}>
      {children}
    </SimContext.Provider>
  );
}

export function useSim(): SimContextValue {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within SimProvider");
  return ctx;
}
