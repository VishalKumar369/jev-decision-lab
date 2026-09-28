# Architecture

## One sentence

A thin Next.js shell around a pure-TypeScript `lib/` that turns *(state, typed questions)* into *(probabilities)* through any provider, then applies deterministic policy and records everything.

## Layers

```
┌────────────────────────────────────────────────────────────────┐
│ app/                       pages + API routes                  │
│   /support /agent-firewall /model-router /calibration          │
│   /api/run  /api/run-batch  /api/results  /api/providers       │
├────────────────────────────────────────────────────────────────┤
│ components/                ExperimentShell · InputPanel ·      │
│                            ResultPanel · DecisionBars ·        │
│                            CalibrationLab · ReliabilityDiagram │
├────────────────────────────────────────────────────────────────┤
│ lib/experiments/           support · firewall · router         │
│   build request → provider.decide() → policy → PipelineTrace   │
├──────────────────┬─────────────────────┬───────────────────────┤
│ lib/providers.ts │ lib/policy-engine.ts│ lib/metrics.ts        │
│  registry        │  ALL deterministic  │  MetricRecord         │
│  jev.ts  llm.ts  │  rules: gates,      │  summarise()          │
│  mock.ts         │  refund, firewall,  │  calibration()/ECE    │
│                  │  router, rate limit │  CSV                  │
├──────────────────┴─────────────────────┴───────────────────────┤
│ lib/types.ts               the contract everything shares      │
└────────────────────────────────────────────────────────────────┘
        ▲ datasets/*.json                 ▼ results/*.json|csv
        experiments/*.ts (CLI) use the same lib/ as the UI
```

No React in `lib/`. No business logic in `app/` or `components/`.

## The decision contract

```ts
DecisionRequest  = { state, questions: Record<key, Choice | Score | Noul> }
DecisionResponse = { provider, model, answers: Record<key, Answer>, usage, estimatedCostUsd, latencyMs, raw, warnings? }
```

Three things are deliberate:

1. **Closed answer sets.** Every question enumerates its possible answers up front. There is nothing to parse and nothing to hallucinate. This is what makes the output *machine-consumed*.
2. **Distributions, not labels.** `ChoiceAnswer.probabilities` has a number for every label. Code downstream decides what to do with a 0.55/0.45 split; the model does not get to round.
3. **`raw` is preserved.** The UI can always show the unmodified wire payload.

## Providers

`lib/providers.ts` maps a `ProviderName` to `{ kind, configured(), model(), call() }`. Three kinds:

- **decision-model** — Jev through three hosts. `lib/jev.ts#fromJevBody` normalises their slightly different envelopes (OpenRouter nests under `answers`, Vercel returns the map at top level and calls nouls "boolean").
- **llm-emulator** — `lib/llm.ts` builds a system+user prompt that describes the same typed questions and asks for JSON with probabilities, then parses/repairs the response and records every repair as a warning. Transports: OpenAI-compatible chat completions (OpenAI, OpenRouter), Anthropic Messages, Gemini generateContent — all raw `fetch`.
- **heuristic** — `lib/mock.ts`, keyword rules with a seeded PRNG so the same input always yields the same soft distribution. Zero cost, offline, mediocre on purpose.

`enabled` (from `ENABLED_PROVIDERS`) is separate from `configured` (key present) so the UI can be restricted without removing keys.

## Policy engine

`lib/policy-engine.ts` is the file the project exists to point at. It contains:

| function | owns |
|---|---|
| `confidenceGate(answer, thresholds)` | auto / stronger-model / human-review from confidence; flags near-ties |
| `evaluateRefund(...)` | authorization first (can veto), then P(refund) threshold, then $ limit and date window |
| `frustrationEscalation(score)` | expected level ≥ 3 → human |
| `evaluateFirewall(...)` | allowlist → forbidden class → role → argument validation → rate limit → *then* model thresholds per risk class |
| `validateArgs(tool, args)` | path traversal, workspace root, wildcards, dangerous shell patterns, URL/recipient allowlists, environment pins |
| `evaluateRoute(...)` | complexity → tier, tools ⇒ ≥ medium, budget check, refuse to silently downgrade |
| `checkRateLimit(key, perMinute)` | fixed-window counter used by the API routes |

Every function returns a `checks[]` array with `{ name, passed, detail, owner: "code" | "model" }` so the UI can show *which* check decided and *who* owned it.

**Ordering is part of the design.** In the firewall, static checks run before the model's opinion is consulted and short-circuit on failure. In the refund path, eligibility is checked before P(refund). A confident model never overrides an authorization rule.

## Metrics and calibration

`recordsFromResponse()` fans one response out into one `MetricRecord` per question. `summarise()` gives accuracy (overall and on auto-routed rows), latency p50/p95, token totals, cost per request de-duplicated by request, and route counts.

`calibration(rows, bins)` filters to labelled rows, buckets by `confidence`, and computes per-bucket mean confidence vs empirical accuracy, ECE (size-weighted gap), MCE (max gap) and Brier. Unlabelled rows are excluded — they can't inform calibration.

Confidence per answer type: choice → `confidence` (≈ top probability); score → `confidence` (mass on the modal level); noul → `max(p, 1−p)`.

## Results on disk

```
results/benchmark-<experiment>-<provider>-<stamp>.json   { meta, summary, records, traces }
results/benchmark-<experiment>-<provider>-<stamp>.csv    records only
results/ui-runs.jsonl                                    every single click in the UI
results/calibration-<stamp>.{json,csv}
results/latency-<stamp>.json
results/cost-<stamp>.json
```

The UI's "Run whole dataset" button writes the same `benchmark-*.json` shape as the CLI, so `npm run calibration` and the Calibration Lab page read the same files.

## API routes

All routes run on the Node runtime (they read the filesystem) and are thin:

- `GET /api/providers` — adapter list with configured/enabled flags
- `GET /api/examples/:experiment` — dataset
- `POST /api/run` — `{ experiment, provider?, exampleId? | example? }` → `{ trace }`; appends to `ui-runs.jsonl`
- `POST /api/run-batch` — `{ experiment, provider?, limit?, concurrency? }` → writes a benchmark file
- `GET /api/results?bins=` — aggregated calibration + summaries + confident-wrong + ambiguous rows

Both run routes go through `checkRateLimit` — the same deterministic policy code as the experiments.

## Adding things

- **A provider:** add a `ProviderName`, write a `call(req)` returning `DecisionResponse`, register it. Done.
- **An experiment:** create `lib/experiments/<name>.ts` exporting `run<Name>(example, provider) → PipelineTrace`, add to `lib/experiments/index.ts`, add a dataset and a page that renders `<ExperimentShell experiment="...">`.
- **A policy:** add a pure function to `lib/policy-engine.ts` that returns `checks[]`; call it from the experiment; render the checks in a `policy` stage.
