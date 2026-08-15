import type { Setpoints } from "../lib/twin/types";

interface SliderSpec {
  key: keyof Setpoints;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export const SETPOINT_SPECS: SliderSpec[] = [
  { key: "coolantSupplyC", label: "Coolant supply setpoint", min: 18, max: 32, step: 0.5, unit: "°C" },
  { key: "pumpSpeedPct", label: "Secondary pump speed", min: 40, max: 100, step: 1, unit: "%" },
  { key: "valvePosPct", label: "Bypass valve position", min: 30, max: 100, step: 1, unit: "%" },
  { key: "cduSetpointC", label: "CDU supply setpoint", min: 18, max: 34, step: 0.5, unit: "°C" },
];

export function SetpointSliders({
  value,
  onChange,
  disabled = false,
}: {
  value: Setpoints;
  onChange: (next: Setpoints) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SETPOINT_SPECS.map((spec) => (
        <div key={spec.key}>
          <label
            htmlFor={`sp-${spec.key}`}
            className="flex items-center justify-between text-xs font-medium text-slate-300"
          >
            <span>{spec.label}</span>
            <span className="font-mono text-cyan-300">
              {value[spec.key]}
              {spec.unit}
            </span>
          </label>
          <input
            id={`sp-${spec.key}`}
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value[spec.key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [spec.key]: Number(e.target.value) })}
            className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-40"
          />
        </div>
      ))}
    </div>
  );
}
