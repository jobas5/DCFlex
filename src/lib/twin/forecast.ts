import { tickTelemetry } from "./simulator";
import { predict } from "./surrogate";
import type {
  ForecastHorizon,
  Setpoints,
  Telemetry,
  ZoneForecast,
  ZoneSpec,
} from "./types";

const HORIZON_TICKS: Record<ForecastHorizon, number> = {
  "15m": 2,
  "1h": 6,
  "4h": 24,
  "24h": 144,
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Forward-simulates the deterministic twin for up to 24h (144 ten-minute
 * ticks) holding setpoints constant ("if we do nothing"). One pass yields a
 * chip-temp / thermal-margin series; each horizon's summary is the running
 * peak over its slice of that series.
 *
 * ponytail: setpoints held constant; a "with optimal control" forecast is out
 * of scope until the controller is coupled to the forecast.
 */
export function forecastZone(
  spec: ZoneSpec,
  telemetry: Telemetry,
  setpoints: Setpoints,
): ZoneForecast {
  const chips: number[] = [];
  const margins: number[] = [];
  let prev = telemetry;
  for (let i = 1; i <= HORIZON_TICKS["24h"]; i++) {
    const { telemetry: t } = tickTelemetry(prev, telemetry.tick + i, setpoints, spec);
    const p = predict(t, setpoints);
    chips.push(p.chipTempC);
    margins.push(p.thermalMarginC);
    prev = t;
  }

  const slice = (n: number) => {
    const c = chips.slice(0, n);
    const m = margins.slice(0, n);
    let peak = -Infinity;
    let peakAt = 0;
    let worst = Infinity;
    for (let i = 0; i < c.length; i++) {
      if (c[i] > peak) {
        peak = c[i];
        peakAt = i + 1;
      }
      if (m[i] < worst) worst = m[i];
    }
    const half = Math.max(1, Math.floor(c.length / 2));
    const rising = avg(c.slice(half)) > avg(c.slice(0, half));
    return {
      peakChipTempC: round1(peak),
      peakAtTicks: peakAt,
      worstMargin: round1(worst),
      rising,
    };
  };

  return {
    "15m": slice(HORIZON_TICKS["15m"]),
    "1h": slice(HORIZON_TICKS["1h"]),
    "4h": slice(HORIZON_TICKS["4h"]),
    "24h": slice(HORIZON_TICKS["24h"]),
  };
}
