import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

type AuthStatus = "loading" | "authed" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");

  const check = useCallback(async () => {
    try {
      await api.authMe();
      setStatus("authed");
    } catch {
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    const onUnauthorized = () => setStatus("anonymous");
    window.addEventListener("dcflex:unauthorized", onUnauthorized);
    return () => window.removeEventListener("dcflex:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    await api.authLogin(username, password);
    setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.authLogout();
    } catch {
      /* ignore */
    }
    setStatus("anonymous");
  }, []);

  return <AuthContext.Provider value={{ status, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
