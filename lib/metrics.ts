/**
 * lib/metrics.ts
 *
 * Recording and analysing what every request cost and whether it was right.
 *
 *   - `recordsFromResponse()` turns one DecisionResponse into one MetricRecord
 *     per question (a ticket with 3 questions → 3 rows).
 *   - `summarise()` gives accuracy / latency percentiles / cost totals.
 *   - `calibration()` buckets predictions by confidence and compares predicted
 *     probability with empirical accuracy — the Expected Calibration Error (ECE).
 *   - CSV helpers so results/ is greppable in a spreadsheet.
 *
 * Nothing here knows which provider produced the rows.
 */

import type { Answer, DecisionResponse, ExperimentName, MetricRecord, Route } from "./types";

// ---------------------------------------------------------------------------
// Building records
// ---------------------------------------------------------------------------

export function decisionOf(answer: Answer): string {
  if (answer.type === "choice") return answer.choice;
  if (answer.type === "noul") return answer.noul >= 0.5 ? "true" : "false";
  // For scores we record the *rounded expected level* as the decision.
  return String(Math.round(answer.score));
}

export function confidenceOfAnswer(answer: Answer): number {
  if (answer.type === "noul") return Math.max(answer.noul, 1 - answer.noul);
  return answer.confidence;
}

export function probabilitiesOf(answer: Answer): Record<string, number> {
  if (answer.type === "noul") return { true: answer.noul, false: 1 - answer.noul };
  return answer.probabilities;
}

export interface Expectation {
  [question: string]: string | undefined;
}

export function recordsFromResponse(
  experiment: ExperimentName,
  exampleId: string,
  res: DecisionResponse,
  expected: Expectation,
  route: Route | null,
  flags: string[] = [],
): MetricRecord[] {
  const timestamp = new Date().toISOString();
  return Object.entries(res.answers).map(([question, answer]) => {
    const exp = expected[question] ?? null;
    const decision = decisionOf(answer);
    return {
      id: `${experiment}:${exampleId}:${question}:${res.provider}:${timestamp}`,
      timestamp,
      experiment,
      exampleId,
      provider: res.provider,
      model: res.model,
      latencyMs: round(res.latencyMs, 1),
      inputTokens: res.usage?.input_tokens ?? null,
      outputTokens: res.usage?.output_tokens ?? null,
      estimatedCostUsd: res.estimatedCostUsd,
      question,
      questionType: answer.type,
      probabilities: probabilitiesOf(answer),
      decision,
      confidence: round(confidenceOfAnswer(answer), 4),
      expected: exp,
      correct: exp === null ? null : decision === exp,
      route,
      flags: [...flags, ...(res.warnings?.length ? ["provider-warning"] : [])],
    };
  });
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

export interface Summary {
  n: number;
  labelled: number;
  accuracy: number | null;
  latency: { p50: number; p95: number; mean: number };
  tokens: { input: number; output: number };
  costUsd: number | null;
  costPerThousandDecisionsUsd: number | null;
  routes: Record<Route, number>;
  /** Accuracy restricted to rows the gate sent to "auto" — the number that matters in production. */
  autoAccuracy: number | null;
  autoRate: number;
}

export function summarise(rows: MetricRecord[]): Summary {
  const labelled = rows.filter((r) => r.correct !== null);
  const auto = labelled.filter((r) => r.route === "auto");
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const costs = rows.map((r) => r.estimatedCostUsd).filter((c): c is number => c !== null);
  const routes: Record<Route, number> = { auto: 0, "stronger-model": 0, "human-review": 0, blocked: 0 };
  for (const r of rows) if (r.route) routes[r.route] += 1;
  // Cost is per *request*, and a request yields several rows; dedupe by request id prefix.
  const perRequest = new Map<string, number>();
  for (const r of rows) if (r.estimatedCostUsd !== null) perRequest.set(`${r.exampleId}:${r.provider}:${r.timestamp}`, r.estimatedCostUsd);
  const totalCost = costs.length ? [...perRequest.values()].reduce((a, b) => a + b, 0) : null;
  return {
    n: rows.length,
    labelled: labelled.length,
    accuracy: labelled.length ? labelled.filter((r) => r.correct).length / labelled.length : null,
    latency: { p50: percentile(lat, 50), p95: percentile(lat, 95), mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0 },
    tokens: {
      input: rows.reduce((a, r) => a + (r.inputTokens ?? 0), 0),
      output: rows.reduce((a, r) => a + (r.outputTokens ?? 0), 0),
    },
    costUsd: totalCost,
    costPerThousandDecisionsUsd: totalCost !== null && perRequest.size ? (totalCost / perRequest.size) * 1000 : null,
    routes,
    autoAccuracy: auto.length ? auto.filter((r) => r.correct).length / auto.length : null,
    autoRate: rows.length ? routes.auto / rows.length : 0,
  };
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return round(sorted[idx], 1);
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export interface CalibrationBucket {
  /** Inclusive lower bound of the confidence bucket. */
  lo: number;
  hi: number;
  n: number;
  /** Mean predicted probability of the chosen answer in this bucket. */
  meanConfidence: number;
  /** Fraction of rows in the bucket whose decision matched ground truth. */
  empiricalAccuracy: number;
  /** |confidence − accuracy|, the per-bucket gap. */
  gap: number;
}

export interface CalibrationReport {
  provider: string;
  n: number;
  buckets: CalibrationBucket[];
  /** Expected Calibration Error: bucket gaps weighted by bucket size. */
  ece: number;
  /** Largest single-bucket gap. */
  mce: number;
  /** Brier score of the chosen answer's probability (lower is better). */
  brier: number;
  /** Rows where the top-two margin was small; a *feature* of the data, surfaced deliberately. */
  ambiguousCount: number;
}

/**
 * Bucket labelled predictions by confidence and compare predicted probability
 * with empirical accuracy. A perfectly calibrated provider has every bucket on
 * the diagonal (meanConfidence ≈ empiricalAccuracy).
 *
 * Only rows with ground truth participate; unlabelled rows cannot inform
 * calibration and are simply excluded (counted in `n` of the summary instead).
 */
export function calibration(rows: MetricRecord[], bins = 10): CalibrationReport {
  const labelled = rows.filter((r) => r.correct !== null);
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins;
    const hi = (i + 1) / bins;
    const inBucket = labelled.filter((r) => r.confidence >= lo && (r.confidence < hi || (i === bins - 1 && r.confidence <= hi)));
    const meanConfidence = inBucket.length ? inBucket.reduce((a, r) => a + r.confidence, 0) / inBucket.length : 0;
    const empiricalAccuracy = inBucket.length ? inBucket.filter((r) => r.correct).length / inBucket.length : 0;
    buckets.push({
      lo,
      hi,
      n: inBucket.length,
      meanConfidence: round(meanConfidence, 4),
      empiricalAccuracy: round(empiricalAccuracy, 4),
      gap: round(Math.abs(meanConfidence - empiricalAccuracy), 4),
    });
  }
  const N = labelled.length || 1;
  const ece = buckets.reduce((a, b) => a + (b.n / N) * b.gap, 0);
  const mce = Math.max(0, ...buckets.filter((b) => b.n > 0).map((b) => b.gap));
  const brier = labelled.length ? labelled.reduce((a, r) => a + Math.pow(r.confidence - (r.correct ? 1 : 0), 2), 0) / labelled.length : 0;
  const ambiguousCount = labelled.filter((r) => r.flags.includes("ambiguous")).length;
  const provider = [...new Set(rows.map((r) => r.provider))].join("+") || "none";
  return { provider, n: labelled.length, buckets, ece: round(ece, 4), mce: round(mce, 4), brier: round(brier, 4), ambiguousCount };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function toCsv(rows: MetricRecord[]): string {
  const header = [
    "id", "timestamp", "experiment", "exampleId", "provider", "model", "latencyMs", "inputTokens", "outputTokens",
    "estimatedCostUsd", "question", "questionType", "decision", "confidence", "expected", "correct", "route", "flags", "probabilities",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.id, r.timestamp, r.experiment, r.exampleId, r.provider, r.model, r.latencyMs, r.inputTokens, r.outputTokens,
      r.estimatedCostUsd, r.question, r.questionType, r.decision, r.confidence, r.expected, r.correct, r.route, r.flags.join("|"), r.probabilities,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

export function calibrationToCsv(reports: CalibrationReport[]): string {
  const lines = ["provider,bucket_lo,bucket_hi,n,mean_confidence,empirical_accuracy,gap"];
  for (const r of reports) for (const b of r.buckets) lines.push([r.provider, b.lo, b.hi, b.n, b.meanConfidence, b.empiricalAccuracy, b.gap].join(","));
  return lines.join("\n") + "\n";
}

export function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
