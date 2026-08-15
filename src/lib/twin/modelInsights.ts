export type ModelHealthStatus = "good" | "watch" | "retrain";

export interface ModelHealth {
  status: ModelHealthStatus;
  summary: string;
  recommendation: string;
  action: { label: string; to: "/optimize" } | null;
}

interface ModelInsightsInput {
  latest: {
    maeMw: number;
    pueCoverage: number;
    klDivergence: number;
    inferenceLatencyMs: number;
  };
  card: {
    targets: { maeMw: number; pueCoveragePct: number };
    drift: { warnThreshold: number; criticalThreshold: number };
  };
}

/**
 * Plain-language verdict for the surrogate model: how trustworthy it is and
 * what to do next.
 */
export function modelInsights({ latest, card }: ModelInsightsInput): ModelHealth {
  const maeFail = latest.maeMw > card.targets.maeMw;
  const coverageFail = latest.pueCoverage < card.targets.pueCoveragePct;
  const fails = [maeFail, coverageFail].filter(Boolean).length;
  const kl = latest.klDivergence;

  if (kl >= card.drift.criticalThreshold) {
    return {
      status: "retrain",
      summary:
        "The model has drifted past the retrain threshold — the facility no longer behaves the way the model was trained on.",
      recommendation:
        "Retrain the model on recent data before trusting any what-if or per-zone suggestions. Until then, verify control actions against live telemetry.",
      action: { label: "Re-check control state", to: "/optimize" },
    };
  }

  if (kl >= card.drift.warnThreshold || fails > 0) {
    return {
      status: "watch",
      summary:
        fails > 0
        ? "One or more accuracy targets are being missed — predictions are less reliable than usual."
        : "Model drift is rising — the facility is slowly changing and the model is aging.",
      recommendation:
        "Keep using the model but double-check its suggestions. Plan a retraining run in the next maintenance cycle.",
      action: { label: "Review what-if results", to: "/optimize" },
    };
  }

  return {
    status: "good",
    summary:
      "The model is accurate and still matches the facility — its predictions track reality closely.",
    recommendation:
      "No action needed. You can trust the what-if engine and per-zone recommendations.",
    action: { label: "Explore what-if scenarios", to: "/optimize" },
  };
}
