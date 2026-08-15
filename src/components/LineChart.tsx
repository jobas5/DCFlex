import { useMemo, useState } from "react";

export interface Series {
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  series: Series[];
  labels?: string[];
  height?: number;
  yFormat?: (v: number) => string;
  threshold?: { value: number; label: string; color: string };
  band?: { lo: number; hi: number; color: string };
  ariaLabel: string;
  /** Compact mode: no axes/legend/labels, just the line + optional threshold. For in-card charts. */
  compact?: boolean;
}

const W = 640;
const PAD = { top: 12, right: 12, bottom: 26, left: 46 };
const PAD_COMPACT = { top: 6, right: 6, bottom: 6, left: 6 };

export function LineChart({
  series,
  labels,
  height = 220,
  yFormat = (v) => v.toFixed(2),
  threshold,
  band,
  ariaLabel,
  compact = false,
}: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const H = height;
  const pad = compact ? PAD_COMPACT : PAD;

  const toggleSeries = (i: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const { minY, maxY, paths } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
    let lo = all.length ? Math.min(...all) : 0;
    let hi = all.length ? Math.max(...all) : 1;
    if (threshold) {
      lo = Math.min(lo, threshold.value);
      hi = Math.max(hi, threshold.value);
    }
    if (band) {
      lo = Math.min(lo, band.lo);
      hi = Math.max(hi, band.hi);
    }
    const span = hi - lo || 1;
    lo -= span * 0.08;
    hi += span * 0.08;
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;
    const paths = series.map((s) => {
      const n = s.values.length;
      if (n < 2) return "";
      return s.values
        .map((v, i) => {
          const x = pad.left + (i / (n - 1)) * innerW;
          const y = pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    });
    return { minY: lo, maxY: hi, paths };
  }, [series, threshold, band, H, compact]);

  const toY = (v: number) =>
    pad.top + (H - pad.top - pad.bottom) - ((v - minY) / (maxY - minY)) * (H - pad.top - pad.bottom);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => minY + f * (maxY - minY));
  const n = series[0]?.values.length ?? 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const frac = (x - pad.left) / (W - pad.left - pad.right);
          setHover(n > 1 ? Math.round(Math.min(1, Math.max(0, frac)) * (n - 1)) : null);
        }}
      >
        {compact
          ? null
          : ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={toY(t)}
                  y2={toY(t)}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? "" : "3 4"}
                />
                <text x={pad.left - 6} y={toY(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {yFormat(t)}
                </text>
              </g>
            ))}
        {band ? (
          <rect
            x={pad.left}
            width={W - pad.left - pad.right}
            y={toY(band.hi)}
            height={Math.max(0, toY(band.lo) - toY(band.hi))}
            fill={band.color}
            opacity="0.15"
          />
        ) : null}
        {threshold ? (
          <g>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={toY(threshold.value)}
              y2={toY(threshold.value)}
              stroke={threshold.color}
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={W - pad.right}
              y={toY(threshold.value) - 4}
              textAnchor="end"
              fontSize="10"
              fill={threshold.color}
            >
              {threshold.label}
            </text>
          </g>
        ) : null}
        {paths.map((d, i) =>
          !hidden.has(i) ? (
            <path key={i} d={d} fill="none" stroke={series[i].color} strokeWidth="2" />
          ) : null,
        )}
        {!compact && labels && n > 1
          ? [0, Math.floor((n - 1) / 2), n - 1].map((idx) => (
              <text
                key={idx}
                x={pad.left + (idx / (n - 1)) * (W - pad.left - pad.right)}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {labels[idx]}
              </text>
            ))
          : null}
        {hover !== null && n > 1 ? (
          <line
            x1={pad.left + (hover / (n - 1)) * (W - pad.left - pad.right)}
            x2={pad.left + (hover / (n - 1)) * (W - pad.left - pad.right)}
            y1={pad.top}
            y2={H - pad.bottom}
            stroke="#64748b"
            strokeWidth="1"
          />
        ) : null}
      </svg>
      {hover !== null && n > 1 ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs shadow-lg">
          {labels?.[hover] ? <p className="mb-0.5 text-slate-400">{labels[hover]}</p> : null}
          {series.map((s, i) =>
            !hidden.has(i) ? (
              <p key={i} className="font-mono" style={{ color: s.color }}>
                {s.label}: {yFormat(s.values[hover])}
              </p>
            ) : null,
          )}
        </div>
      ) : null}
      {compact ? null : (
        <div className="mt-1 flex flex-wrap gap-3">
          {series.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleSeries(i)}
              aria-pressed={!hidden.has(i)}
              className={`flex items-center gap-1.5 text-xs text-slate-400 focus-visible:outline-2 focus-visible:outline-cyan-400 ${hidden.has(i) ? "opacity-40" : ""}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
