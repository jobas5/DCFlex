import { useEffect } from "react";

/**
 * Interval poll that skips its ticks while the tab is hidden and refreshes
 * immediately on return. D1 bills every polled query, so background tabs must
 * not keep polling; heavy endpoints also take a longer interval here than the
 * cheap live-telemetry poll.
 */
export function usePoll(
  effect: (isStale: () => boolean) => void | Promise<void>,
  intervalMs: number,
  deps: readonly unknown[],
) {
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) void effect(() => !alive);
    };
    void run();
    const id = setInterval(() => {
      if (!document.hidden) run();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Call sites pass the same deps they would pass to useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
