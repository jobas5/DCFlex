// CSS-variable colors for SVG strokes/fills, so charts follow the active theme.
// Values mirror the semantic tokens in styles.css.
export const SEVERITY = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
  info: "var(--info)",
} as const;

export const CHART = {
  cyan: "var(--accent)",
  emerald: "var(--ok)",
  amber: "var(--warn)",
  pink: "var(--pink)",
  purple: "var(--violet)",
  rose: "var(--crit)",
  slate: "var(--fg-subtle)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
} as const;
