import { createRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Database,
  Download,
  FlaskConical,
  Gauge as GaugeIcon,
  Info,
  Layers,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useToast } from "../components/Toast";
import { Panel, StatusBadge } from "../components/ui";
import { DOCS_FILENAME, DOCS_MARKDOWN } from "../lib/docs/docsContent";
import { rootRoute } from "./root";

function downloadMarkdown() {
  const blob = new Blob([DOCS_MARKDOWN], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = DOCS_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-3 text-sm leading-relaxed text-slate-300">{children}</div>;
}

function DocTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-slate-800/60 align-top">
              {cells.map((c, j) => (
                <td key={j} className="px-3 py-2 text-slate-300">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-cyan-200">{children}</code>
  );
}

const TOC = [
  { id: "what", label: "What the application is" },
  { id: "glossary", label: "Key concepts glossary" },
  { id: "screens", label: "The four screens" },
  { id: "simulation", label: "How the simulation works" },
  { id: "stack", label: "Tech stack" },
  { id: "data-model", label: "Data model" },
  { id: "api", label: "API reference" },
];

function DocsPage() {
  const toast = useToast();

  const onDownload = () => {
    downloadMarkdown();
    toast("Documentation downloaded as Markdown.", "success");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BookOpen className="h-5 w-5 text-cyan-400" aria-hidden />
            System Documentation
          </h1>
          <p className="text-sm text-slate-400">
            How the digital twin, surrogate model, optimizer, and control loop fit together
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/50 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download as Markdown
        </button>
      </div>

      <nav aria-label="Documentation sections" className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Contents</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {TOC.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* What the application is */}
      <div id="what" className="scroll-mt-6">
        <Panel
          title="What the application is"
          action={<Info className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <Prose>
            <p>
              The Data Center Liquid Cooling Optimizer is a{" "}
              <strong className="text-slate-100">monitoring and optimization dashboard</strong> — a
              physics-guided digital twin — for high-density liquid-cooled data centers. It balances{" "}
              <strong className="text-slate-100">thermal safety</strong>,{" "}
              <strong className="text-cyan-300">PUE</strong> (energy efficiency), and{" "}
              <strong className="text-emerald-300">WUE</strong> (water efficiency) in real time.
            </p>
            <p>It continuously answers three questions:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-slate-100">Are we safe?</strong> Chip die temperatures, loop
                differential pressure, and flow are checked against hard guardrails on every reading
                and every candidate setpoint change.
              </li>
              <li>
                <strong className="text-slate-100">Are we efficient?</strong> A
                monotonicity-constrained surrogate model predicts facility accessory cooling power,
                PUE, and WUE for any operating point.
              </li>
              <li>
                <strong className="text-slate-100">Could we do better?</strong> A counterfactual
                what-if engine searches thousands of setpoint permutations and ranks them by a
                configurable energy/water objective, and a phased control loop can write winning
                setpoints back to the plant.
              </li>
            </ul>
            <p className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-slate-400">
              All telemetry is <strong className="text-slate-200">simulated</strong>: a seeded,
              deterministic digital twin stands in for physical BMS/CDU hardware that would
              otherwise be integrated over BACnet/IP, Modbus TCP, or MQTT. Live telemetry, surrogate
              predictions, what-if optimization, and closed-loop control all run against that
              simulation, with persistence in a Cloudflare D1 (SQLite) database.
            </p>
          </Prose>
        </Panel>
      </div>

      {/* Glossary */}
      <div id="glossary" className="scroll-mt-6">
        <Panel title="Key concepts glossary">
          <DocTable
            head={["Term", "Meaning"]}
            rows={[
              [
                <strong key="t" className="text-cyan-300">PUE</strong>,
                <>
                  Power Usage Effectiveness = (IT power + accessory cooling power) / IT power. Lower
                  is better; the dashboard target is <strong>&lt; 1.12</strong>.
                </>,
              ],
              [
                <strong key="t" className="text-emerald-300">WUE</strong>,
                "Water Usage Effectiveness in L/kWh — site water intensity of cooling. Lower is better.",
              ],
              [
                <strong key="t" className="text-slate-100">CDU</strong>,
                "Coolant Distribution Unit — circulates the secondary (technology cooling system) loop between the facility water system and the cold plates.",
              ],
              [
                <strong key="t" className="text-slate-100">ΔP</strong>,
                "Differential pressure across the secondary loop, in kPa.",
              ],
              [
                <strong key="t" className="text-slate-100">FWS</strong>,
                "Facility Water System — the primary loop that rejects heat to atmosphere (dry coolers / cooling towers).",
              ],
              [
                <strong key="t" className="text-slate-100">Thermal margin</strong>,
                "Headroom between the current worst chip temperature (GPU die) and the 85°C limit, in °C. The UI warns below 5°C and alarms below 3°C.",
              ],
              [
                <strong key="t" className="text-slate-100">Guardrails</strong>,
                <>
                  Hard safety bounds every candidate must satisfy:{" "}
                  <StatusBadge tone="warn">T_chip ≤ 85°C</StatusBadge>{" "}
                  <StatusBadge tone="warn">ΔP 60–240 kPa</StatusBadge>{" "}
                  <StatusBadge tone="warn">Flow 400–1600 L/min</StatusBadge>. Violating candidates
                  are ranked infeasible and never applied.
                </>,
              ],
              [
                <strong key="t" className="text-slate-100">Monotonic surrogate</strong>,
                "A physics-guided gradient-boosting surrogate (LightGBM-style, exported to ONNX) predicting accessory cooling power. Structural constraints: higher IT load → non-decreasing cooling power; higher coolant supply temperature → non-increasing chiller demand; higher wet-bulb → non-decreasing facility power.",
              ],
              [
                <strong key="t" className="text-slate-100">Accuracy targets</strong>,
                "MAE ≤ 0.026 MW on accessory power; PUE within ±0.01 for ≥ 98.7% of test samples. Current model card: MAE 0.024 MW, PUE coverage 99.1%, p50 inference latency 3.8 ms.",
              ],
              [
                <strong key="t" className="text-slate-100">Objective J</strong>,
                "J = α·PUE + β·WUE, each term min–max normalized across the feasible envelope. α is the grid-carbon (energy) weight; β is the water-scarcity weight.",
              ],
              [
                <strong key="t" className="text-slate-100">Shadow (Phase A)</strong>,
                "30-day validation period where optimizer actions are logged as would-be actions with no writeback.",
              ],
              [
                <strong key="t" className="text-slate-100">Closed-loop (Phase B)</strong>,
                "Live mode where setpoints are written back, starting off-peak and expanding to 24/7, with slew-rate limits and a watchdog fail-safe.",
              ],
              [
                <strong key="t" className="text-slate-100">Slew-rate limits</strong>,
                "Maximum change per adjustment: ±3°C on coolant supply, ±10% on pump speed, ±15% on valve position.",
              ],
              [
                <strong key="t" className="text-slate-100">Watchdog fail-safe</strong>,
                "If the control heartbeat is lost for more than 30 seconds, the system reverts to factory setpoints (22°C supply, 70% pump, 80% valve, 24°C CDU) and logs a fail-safe action.",
              ],
            ]}
          />
        </Panel>
      </div>

      {/* Four screens */}
      <div id="screens" className="scroll-mt-6 space-y-4">
        <Panel
          title="1 · Overview — live facility view"
          action={<GaugeIcon className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <Prose>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                KPI cards: PUE, WUE, IT load (MW), accessory power (MW), and thermal margin (°C),
                each with status coloring.
              </li>
              <li>
                Trend charts: PUE &amp; WUE over recent intervals, and CPU/GPU die temperatures
                plotted against the 85°C limit line.
              </li>
              <li>
                Loop panels: CDU secondary loop (supply/return, ΔP, flow, active setpoints) and
                facility water/ambient conditions (FWS supply and flow, wet-bulb, dry-bulb).
              </li>
              <li>
                Data-quality pipeline panel: running totals of outliers removed, sensor-drift flags,
                and imputed values, with drift toasts.
              </li>
              <li>Pause/Resume stream freezes the 5-second polling loop without losing state.</li>
            </ul>
            <p>
              <Link to="/" className="text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
                Open Overview →
              </Link>
            </p>
          </Prose>
        </Panel>

        <Panel
          title="2 · What-If Engine — counterfactual analysis"
          action={<FlaskConical className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <Prose>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Sliders set the objective weights α (grid carbon / PUE priority) and β (water
                scarcity / WUE priority).
              </li>
              <li>
                A scenario builder sets IT load (2–12 MW) and an ambient preset (Cool 10°C, Mild
                18°C, Hot &amp; humid 26°C wet-bulb).
              </li>
              <li>
                Run What-If executes a grid search over{" "}
                <strong className="text-slate-100">1,560 setpoint permutations</strong> (15 coolant
                supply temperatures × 13 pump speeds × 8 valve positions), predicting PUE/WUE for
                each and evaluating the hard guardrails.
              </li>
              <li>
                Results are ranked feasible-first by cost J, with best PUE/WUE, feasible count, and
                a full candidate table marking infeasible rows and their violations.
              </li>
              <li>
                Apply best setpoints sends the winner to the control loop (subject to mode and slew
                limits); in shadow mode it is logged as a would-be action.
              </li>
              <li>
                Every run is persisted with its candidates and can be reopened via a shareable link
                at <Code>/whatif/&lt;runId&gt;</Code>.
              </li>
            </ul>
            <p>
              <Link to="/whatif" className="text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
                Open What-If Engine →
              </Link>
            </p>
          </Prose>
        </Panel>

        <Panel
          title="3 · Control Loop — phased closed-loop control"
          action={<Activity className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <Prose>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Rollout status shows Phase A (30-day shadow validation) vs Phase B (closed-loop
                release) with a progress bar.
              </li>
              <li>
                Operating mode can be switched between shadow and closed-loop behind a confirmation
                dialog.
              </li>
              <li>
                Heartbeat watchdog: the page sends a heartbeat every 4 seconds; if heartbeats stop
                for more than 30 seconds the fail-safe trips, reverts to factory setpoints, and logs
                it. A comms-loss toggle demonstrates this.
              </li>
              <li>
                Setpoint sliders adjust coolant supply, pump speed, and valve position. Applying a
                change first validates it against the hard guardrails (infeasible requests are
                rejected), then enforces slew-rate limits (±3°C, ±10% pump, ±15% valve per step).
              </li>
              <li>An action log lists the 30 most recent applied / would-be / fail-safe actions.</li>
            </ul>
            <p>
              <Link to="/control" className="text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
                Open Control Loop →
              </Link>
            </p>
          </Prose>
        </Panel>

        <Panel
          title="4 · Surrogate Model — model card & verification"
          action={<BrainCircuit className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <Prose>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Model metadata: LightGBM monotonicity-constrained gradient boosting, ONNX 1.17
                (opset 18) serving format, 70/15/15 chronological train/val/test split with a 14-day
                embargo, version dc-cooling-surrogate v1.4.2.
              </li>
              <li>
                Metric gauges vs targets: MAE 0.024 MW (target ≤ 0.026), PUE ±0.01 coverage 99.1%
                (target ≥ 98.7%), inference latency 3.8 ms (target &lt; 10 ms), latest KL divergence
                (warn at 0.08).
              </li>
              <li>
                Model drift chart: hourly KL divergence of the feature distribution against the
                training baseline for the last 48 hours, with the 0.08 warning threshold and a 0.15
                retrain trigger.
              </li>
              <li>
                Monotonicity proof chart: accessory power vs IT load at fixed setpoints,
                structurally non-decreasing as required by the constraints.
              </li>
            </ul>
            <p>
              <Link to="/model" className="text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
                Open Surrogate Model →
              </Link>
            </p>
          </Prose>
        </Panel>
      </div>

      {/* Simulation */}
      <div id="simulation" className="scroll-mt-6">
        <Panel
          title="How the simulation works"
          action={<Workflow className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <Prose>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <strong className="text-slate-100">Seeded deterministic telemetry.</strong> A
                mulberry32 PRNG seeded per tick generates reproducible plant behavior: a time-of-day
                IT load cycle (~4.2–7.8 MW), a diurnal wet-bulb wave, coolant-loop physics from the
                active setpoints, and heat-balance return temperatures.
              </li>
              <li>
                <strong className="text-slate-100">10-minute ticks every 5 seconds.</strong> Each
                tick represents a 10-minute aggregation interval (the streaming aggregation cadence
                of a real deployment); the dashboard polls a new tick every 5 seconds so a full day
                of plant behavior plays back quickly.
              </li>
              <li>
                <strong className="text-slate-100">Data-quality layer.</strong> Roughly 4% of ticks
                inject an outlier (removed and replaced by a model estimate), ~4% flag sensor drift
                (z-score recalibration), and ~3% require imputation — all surfaced in the Overview
                data-quality panel.
              </li>
              <li>
                <strong className="text-slate-100">Surrogate prediction.</strong> Each tick and each
                what-if candidate is scored by the physics-guided surrogate: pump power follows the
                affinity law (cubic in speed), chiller power is linear in IT load with a wet-bulb
                penalty and free-cooling credit at warmer supply temperatures, and PUE/WUE are
                derived from those terms.
              </li>
              <li>
                <strong className="text-slate-100">Guardrail evaluation.</strong> Every prediction is
                checked against the hard bounds (T_chip ≤ 85°C, ΔP 60–240 kPa, flow 400–1600
                L/min); violations make a candidate infeasible and block application.
              </li>
              <li>
                <strong className="text-slate-100">Persistence in D1.</strong> Telemetry samples
                (bounded to the latest ~200 ticks), what-if runs with their candidates, control
                state, control actions, and model metric snapshots are all stored in a Cloudflare D1
                (SQLite) database via Drizzle ORM.
              </li>
            </ol>
          </Prose>
        </Panel>
      </div>

      {/* Tech stack */}
      <div id="stack" className="scroll-mt-6">
        <Panel
          title="Tech stack"
          action={<Layers className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <DocTable
            head={["Layer", "Technology"]}
            rows={[
              ["Client framework", "React 19 + Vite + TypeScript"],
              ["Routing & data", "TanStack Router; typed fetch API client with polling"],
              ["Styling", "Tailwind CSS v4 with shadcn-style UI primitives"],
              ["Charts", "Custom SVG line charts"],
              ["Icons", "lucide-react"],
              ["Server API", "Cloudflare Worker (TypeScript) exposing /api/* JSON endpoints"],
              ["Database", "Cloudflare D1 (SQLite) via Drizzle ORM"],
              [
                "Simulation & surrogate",
                "In-process TypeScript twin: seeded telemetry generator, physics-guided surrogate, grid-search optimizer",
              ],
              ["Deployment", "Cloudflare Workers (static assets + Worker API)"],
            ]}
          />
        </Panel>
      </div>

      {/* Data model */}
      <div id="data-model" className="scroll-mt-6">
        <Panel
          title="Data model"
          action={<Database className="h-4 w-4 text-slate-500" aria-hidden />}
        >
          <DocTable
            head={["Table", "Purpose", "Key fields"]}
            rows={[
              [
                <Code key="t">telemetry_samples</Code>,
                "One row per simulated 10-minute tick",
                <Code key="f">tick · payload (telemetry JSON) · pue · wue · created_at</Code>,
              ],
              [
                <Code key="t">whatif_runs</Code>,
                "One row per what-if grid search",
                <Code key="f">alpha · beta · base_setpoints · best_setpoints · best_cost · best_pue · best_wue · candidates_evaluated · feasible_count · status</Code>,
              ],
              [
                <Code key="t">whatif_candidates</Code>,
                "Every evaluated permutation of a run",
                <Code key="f">run_id · setpoints · pue · wue · cost · chip_temp_c · feasible · violations</Code>,
              ],
              [
                <Code key="t">control_actions</Code>,
                "Audit log of control decisions",
                <Code key="f">mode · kind (would_be / applied / fail_safe) · setpoints · note · created_at</Code>,
              ],
              [
                <Code key="t">control_state</Code>,
                "Singleton row for the control loop",
                <Code key="f">mode (shadow / closed_loop) · comms_ok · last_heartbeat · slew_limited · fail_safe_active · current_setpoints</Code>,
              ],
              [
                <Code key="t">model_metrics</Code>,
                "Model quality snapshots",
                <Code key="f">mae_mw · pue_coverage · kl_divergence · inference_latency_ms · created_at</Code>,
              ],
            ]}
          />
        </Panel>
      </div>

      {/* API reference */}
      <div id="api" className="scroll-mt-6">
        <Panel title="API reference">
          <Prose>
            <p>All endpoints are served by the Cloudflare Worker under <Code>/api</Code>:</p>
          </Prose>
          <div className="mt-2">
            <DocTable
              head={["Method & path", "Description"]}
              rows={[
                [<Code key="p">GET /api/health</Code>, "Liveness check."],
                [
                  <Code key="p">GET /api/telemetry/current</Code>,
                  "Latest telemetry with surrogate prediction, setpoints, and guardrail status.",
                ],
                [
                  <Code key="p">POST /api/telemetry/tick</Code>,
                  "Advances the simulation one 10-minute tick; persists the sample and returns data-quality flags.",
                ],
                [
                  <Code key="p">GET /api/telemetry/history?limit=N</Code>,
                  "Up to 200 recent samples, oldest first.",
                ],
                [
                  <Code key="p">POST /api/whatif</Code>,
                  "Runs the 1,560-permutation grid search for given α/β and scenario; persists run + candidates.",
                ],
                [
                  <Code key="p">GET /api/whatif</Code>,
                  "Lists recent what-if runs; ?id=N returns one run with its ranked candidates.",
                ],
                [
                  <Code key="p">GET /api/control</Code>,
                  "Control state snapshot plus the 30 most recent actions; trips the watchdog if the heartbeat is stale.",
                ],
                [
                  <Code key="p">POST /api/control/mode</Code>,
                  "Switches between shadow and closed_loop.",
                ],
                [
                  <Code key="p">POST /api/control/apply</Code>,
                  "Applies setpoints with guardrail checks and slew-rate clamping; logged as applied or would-be depending on mode.",
                ],
                [
                  <Code key="p">POST /api/control/heartbeat</Code>,
                  "Feeds the watchdog; clears the fail-safe when comms return.",
                ],
                [
                  <Code key="p">GET /api/model/metrics</Code>,
                  "Model card, latest metric snapshot, and the 48-hour KL-divergence drift series.",
                ],
              ]}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs",
  component: DocsPage,
});
