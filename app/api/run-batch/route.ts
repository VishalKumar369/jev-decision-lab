import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { loadDataset } from "@/lib/datasets";
import { isRunnable, runExample } from "@/lib/experiments";
import { summarise } from "@/lib/metrics";
import { checkRateLimit } from "@/lib/policy-engine";
import { resolveProvider } from "@/lib/providers";
import { saveBenchmark } from "@/lib/results-store";
import type { MetricRecord, PipelineTrace } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/run-batch  body: { experiment, provider?, limit?, concurrency? }
 *
 * Runs a whole dataset from the UI (the Calibration Lab uses this) and writes
 * the same results/benchmark-*.json file the CLI benchmark would, so the two
 * paths are interchangeable.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  // A batch counts as 10 runs against the per-minute budget.
  for (let i = 0; i < 10; i++) {
    const rl = checkRateLimit(`run:${ip}`, config.lab.uiRateLimitPerMinute());
    if (!rl.allowed) return NextResponse.json({ error: "rate limit: too many runs this minute" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { experiment?: string; provider?: string; limit?: number; concurrency?: number };
  const { experiment, provider } = body;
  if (!experiment || !isRunnable(experiment)) return NextResponse.json({ error: "bad experiment" }, { status: 400 });

  const prov = resolveProvider(provider);
  const info = prov.info();
  const dataset = loadDataset(experiment).slice(0, body.limit ?? Infinity);
  const concurrency = Math.max(1, Math.min(8, body.concurrency ?? 4));

  const traces: PipelineTrace[] = [];
  const errors: { exampleId: string; error: string }[] = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, dataset.length) }, async () => {
      while (next < dataset.length) {
        const ex = dataset[next++];
        try {
          traces.push(await runExample(experiment, ex, prov));
        } catch (e) {
          errors.push({ exampleId: (ex as { id: string }).id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }),
  );
  const records: MetricRecord[] = traces.flatMap((t) => t.metrics);
  const summary = summarise(records);
  const file = saveBenchmark(experiment, info.name, {
    meta: { experiment, provider: info.name, model: info.model, kind: info.kind, n: traces.length, wallMs: Math.round(performance.now() - t0), errors, createdAt: new Date().toISOString(), source: "ui" },
    summary,
    records,
    traces,
  });
  return NextResponse.json({ file, summary, errors, n: traces.length, records });
}
