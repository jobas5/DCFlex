export type AlertAction = "send" | "skip" | "clear" | "noop";

/** Edge-trigger decision: "ok" clears/ignores; otherwise send on change only. */
export function alertTransition(prev: string | undefined, state: string): AlertAction {
  if (state === "ok") return prev === undefined ? "noop" : "clear";
  if (prev === state) return "skip";
  return "send";
}
