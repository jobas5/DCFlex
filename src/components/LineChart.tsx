import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CHART } from "../lib/tokens";
import { cx } from "./ui";

export interface Series {
  label: string;
  color: string;
  values: number[];
  /** Fill the area under the line with a fading gradient. */
  area?: boolean;
  dashed?: boolean;
}

interface Threshold {
  value: number;
  label?: string;
  color: string;
}

interface Band {
  lo: number;
  hi: number;
  color: string;
}

interface LineChartProps {
  series: Series[];
  labels?: string[];
  height?: number;
  yFormat?: (v: number) => string;
  thresholds?: Threshold[];
  bands?: Band[];
  /** Force the y-domain to include these values (e.g. 0 or a limit). */
  include?: number[];
  ariaLabel: string;
  /** Sparkline mode: no axes, legend or labels. */
  compact?: boolean;
  className?: string;
}

const PAD = { top: 10, right: 12, bottom: 24, left: 44 };
const PAD_COMPACT = { top: 4, right: 2, bottom: 2, left: 2 };

/** Monotone cubic interpolation (Fritsch–Carlson): smooth without overshoot. */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 2) return "";
  const f = (v: number) => v.toFixed(1);
  if (n === 2) return `M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0] || 1e-6);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  }
  t.push(m[n - 2]);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)},${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)},${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

export function LineChart({
  series,
  labels,
  height = 220,
  yFormat = (v) => v.toFixed(2),
  thresholds = [],
  bands = [],
  include = [],
  ariaLabel,
  compact = false,
  className = "",
}: LineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const gid = useId().replace(/:/g, "");
  const pad = compact ? PAD_COMPACT : PAD;
  const H = height;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(120, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = series[0]?.values.length ?? 0;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const { lo, hi } = useMemo(() => {
    const all = series
      .filter((_, i) => !hidden.has(i))
      .flatMap((s) => s.values)
      .concat(include)
      .filter((v) => Number.isFinite(v));
    for (const t of thresholds) all.push(t.value);
    let lo = all.length ? Math.min(...all) : 0;
    let hi = all.length ? Math.max(...all) : 1;
    const span = hi - lo || Math.abs(hi) * 0.1 || 1;
    lo -= span * 0.12;
    hi += span * 0.12;
    return { lo, hi };
  }, [series, hidden, thresholds, include]);

  const x = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
        const line = monotonePath(pts);
        const area = pts.length > 1 ? `${line}L${x(pts.length - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)}L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)}Z` : "";
        return { line, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, lo, hi, W, H, compact],
  );

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const hx = hover !== null ? x(hover) : 0;

  const toggleSeries = (i: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div ref={ref} className={cx("relative w-full", className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto max-w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left - pad.left) / innerW;
          setHover(n > 1 ? Math.round(Math.min(1, Math.max(0, frac)) * (n - 1)) : null);
        }}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={compact ? 0.28 : 0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {!compact
          ? ticks.map((t, i) => (
              <g key={i}>
                <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth="1" />
                <text x={pad.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill={CHART.axis} className="tabular-nums">
                  {yFormat(t)}
                </text>
              </g>
            ))
          : null}

        {bands.map((b, i) => (
          <rect
            key={i}
            x={pad.left}
            width={innerW}
            y={y(Math.min(hi, b.hi))}
            height={Math.max(0, y(Math.max(lo, b.lo)) - y(Math.min(hi, b.hi)))}
            fill={b.color}
            opacity="0.08"
          />
        ))}

        {thresholds.map((t, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(t.value)}
              y2={y(t.value)}
              stroke={t.color}
              strokeWidth="1.25"
              strokeDasharray="5 4"
              opacity="0.85"
            />
            {t.label && !compact ? (
              <text x={W - pad.right} y={y(t.value) - 5} textAnchor="end" fontSize="10.5" fontWeight="500" fill={t.color}>
                {t.label}
              </text>
            ) : null}
          </g>
        ))}

        {paths.map((p, i) =>
          hidden.has(i) ? null : (
            <g key={i}>
              {series[i].area ? <path d={p.area} fill={`url(#${gid}-g${i})`} /> : null}
              <path
                d={p.line}
                fill="none"
                stroke={series[i].color}
                strokeWidth={compact ? 1.75 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={series[i].dashed ? "4 4" : undefined}
              />
            </g>
          ),
        )}

        {!compact && labels && n > 1
          ? [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((idx) => (
              <text
                key={idx}
                x={x(idx)}
                y={H - 6}
                textAnchor={idx === 0 ? "start" : idx === n - 1 ? "end" : "middle"}
                fontSize="10.5"
                fill={CHART.axis}
              >
                {labels[idx]}
              </text>
            ))
          : null}

        {hover !== null && n > 1 ? (
          <g>
            <line x1={hx} x2={hx} y1={pad.top} y2={pad.top + innerH} stroke="var(--line-strong)" strokeWidth="1" />
            {series.map((s, i) =>
              hidden.has(i) || !Number.isFinite(s.values[hover]) ? null : (
                <circle key={i} cx={hx} cy={y(s.values[hover])} r="3.5" fill="var(--surface)" stroke={s.color} strokeWidth="2" />
              ),
            )}
          </g>
        ) : null}
      </svg>

      {hover !== null && n > 1 ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-28 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-xs shadow-pop backdrop-blur"
          style={hx > W / 2 ? { right: W - hx + 10 } : { left: hx + 10 }}
        >
          {labels?.[hover] ? <p className="mb-1 text-fg-faint">{labels[hover]}</p> : null}
          {series.map((s, i) =>
            hidden.has(i) ? null : (
              <p key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-fg-subtle">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-mono font-medium tabular-nums text-fg">{yFormat(s.values[hover])}</span>
              </p>
            ),
          )}
        </div>
      ) : null}

      {!compact && series.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleSeries(i)}
              aria-pressed={!hidden.has(i)}
              className={cx(
                "flex items-center gap-1.5 text-xs text-fg-subtle transition-opacity hover:text-fg focus-visible:outline-2 focus-visible:outline-accent",
                hidden.has(i) && "opacity-40",
              )}
            >
              <span
                className="h-[3px] w-3 rounded-full"
                style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }}
                aria-hidden
              />
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Compact area sparkline for KPI tiles. */
export function Sparkline({
  values,
  color,
  height = 40,
  label,
  format,
  labels,
}: {
  values: number[];
  color: string;
  height?: number;
  label: string;
  format?: (v: number) => string;
  labels?: string[];
}) {
  return (
    <LineChart
      compact
      height={height}
      ariaLabel={`${label} trend`}
      labels={labels}
      yFormat={format}
      series={[{ label, color, values, area: true }]}
    />
  );
}
