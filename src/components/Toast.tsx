import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  tone: "info" | "success" | "warning" | "error";
}

const ToastContext = createContext<(message: string, tone?: ToastItem["tone"]) => void>(() => {});

export const useToast = () => useContext(ToastContext);

let nextId = 1;

const TONE = {
  info: { icon: Info, cls: "text-info" },
  success: { icon: CheckCircle2, cls: "text-ok" },
  warning: { icon: AlertTriangle, cls: "text-warn" },
  error: { icon: XCircle, cls: "text-crit" },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, tone: ToastItem["tone"] = "info") => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:w-96 md:bottom-5"
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = TONE[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="animate-fade-up pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 text-sm text-fg shadow-pop backdrop-blur"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} aria-hidden />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-mr-1 rounded p-0.5 text-fg-faint hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
