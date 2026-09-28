/**
 * experiments/benchmark.ts
 *
 * Run a labelled dataset through a pipeline with one or more providers and
 * write results/benchmark-<experiment>-<provider>-<stamp>.{json,csv}.
 *
 *   npm run bench -- --experiment support --provider jev
 *   npm run bench -- --experiment all --provider mock,jev,openai --concurrency 8
 *   npm run bench -- --experiment agent-firewall --provider mock --limit 5
 *
 * Flags:
 *   --experiment  support | agent-firewall | model-router | all   (default: all)
 *   --provider    comma-separated provider names                  (default: DEFAULT_PROVIDER)
 *   --concurrency parallel requests per provider                  (default: 4)
 *   --limit       only the first N examples                       (default: all)
 *   --repeat      run each example N times (for latency variance) (default: 1)
 *
 * Output JSON shape: { meta, summary, records: MetricRecord[], traces: PipelineTrace[] }
 * The CSV contains only `records`, one row per (example, question).
 */

import { loadDataset } from "../lib/datasets";
import { isRunnable, runExample, type RunnableExperiment } from "../lib/experiments";
import { summarise, toCsv } from "../lib/metrics";
import { getProvider, isProviderName, providerInfo } from "../lib/providers";
import type { MetricRecord, PipelineTrace, ProviderName } from "../lib/types";
import { fmtUsd, loadEnv, parseArgs, pct, stamp, table, writeResult } from "./_shared";

loadEnv();

async function mapWithConcurrency<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expArg = String(args.experiment ?? "all");
  const experiments: RunnableExperiment[] = expArg === "all" ? ["support", "agent-firewall", "model-router"] : expArg.split(",").filter(isRunnable);
  if (!experiments.length) throw new Error(`Unknown experiment "${expArg}"`);

  const providerArg = String(args.provider ?? process.env.DEFAULT_PROVIDER ?? "mock");
  const providers = providerArg.split(",").map((s) => s.trim());
  for (const p of providers) if (!isProviderName(p)) throw new Error(`Unknown provider "${p}"`);

  const concurrency = Number(args.concurrency ?? 4);
  const limit = args.limit ? Number(args.limit) : Infinity;
  const repeat = Number(args.repeat ?? 1);
  const runStamp = stamp();

  for (const providerName of providers as ProviderName[]) {
    const info = providerInfo(providerName);
    if (!info.configured) {
      console.warn(`\n⚠  skipping ${providerName}: not configured (see .env.example)`);
      continue;
    }
    const provider = getProvider(providerName);

    for (const experiment of experiments) {
      const dataset = loadDataset(experiment).slice(0, limit);
      const jobs = dataset.flatMap((ex) => Array.from({ length: repeat }, () => ex));
      console.log(`\n▶ ${experiment} × ${providerName} (${info.model}) — ${jobs.length} runs, concurrency ${concurrency}`);

      const started = performance.now();
      const errors: { exampleId: string; error: string }[] = [];
      const traces = (
        await mapWithConcurrency(jobs, concurrency, async (ex) => {
          const id = (ex as { id: string }).id;
          try {
            const t = await runExample(experiment, ex, provider);
            process.stdout.write(t.outcome.correct === false ? "✗" : t.outcome.correct ? "✓" : "·");
            return t;
          } catch (e) {
            process.stdout.write("!");
            errors.push({ exampleId: id, error: e instanceof Error ? e.message : String(e) });
            return null;
          }
        })
      ).filter((t): t is PipelineTrace => t !== null);
      const wallMs = performance.now() - started;

      const records: MetricRecord[] = traces.flatMap((t) => t.metrics);
      const summary = summarise(records);
      const pipelineAccuracy = traces.filter((t) => t.outcome.correct !== null).length
        ? traces.filter((t) => t.outcome.correct).length / traces.filter((t) => t.outcome.correct !== null).length
        : null;

      console.log(`\n  wall ${Math.round(wallMs)} ms · ${errors.length} errors`);
      console.log(
        table([
          ["metric", "value"],
          ["pipeline outcome accuracy", pct(pipelineAccuracy)],
          ["per-question accuracy", pct(summary.accuracy)],
          ["accuracy on auto-routed", pct(summary.autoAccuracy)],
          ["auto rate", pct(summary.autoRate)],
          ["latency p50 / p95", `${summary.latency.p50} / ${summary.latency.p95} ms`],
          ["tokens in / out", `${summary.tokens.input} / ${summary.tokens.output}`],
          ["est. cost total", fmtUsd(summary.costUsd)],
          ["est. cost / 1k decisions", fmtUsd(summary.costPerThousandDecisionsUsd)],
          ["routes", JSON.stringify(summary.routes)],
        ]),
      );
      if (errors.length) console.log("  errors:", errors.slice(0, 5));

      const base = `benchmark-${experiment}-${providerName}-${runStamp}`;
      const json = writeResult(
        `${base}.json`,
        JSON.stringify(
          {
            meta: { experiment, provider: providerName, model: info.model, kind: info.kind, n: traces.length, repeat, concurrency, wallMs: Math.round(wallMs), errors, createdAt: new Date().toISOString() },
            summary: { ...summary, pipelineAccuracy },
            records,
            traces,
          },
          null,
          2,
        ),
      );
      const csv = writeResult(`${base}.csv`, toCsv(records));
      console.log(`  wrote ${json}\n  wrote ${csv}`);
    }
  }
  console.log("\nNext: npm run calibration");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
