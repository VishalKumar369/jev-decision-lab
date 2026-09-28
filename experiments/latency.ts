/**
 * experiments/latency.ts
 *
 * Latency micro-benchmark: fire the same decision request N times against each
 * provider and report percentiles, plus the sequential-vs-batched comparison
 * that shows why "ask all questions in one call" matters.
 *
 *   npm run latency -- --provider jev,openai --n 20 --concurrency 5
 *
 * Writes results/latency-<stamp>.json.
 */

import { buildSupportRequest } from "../lib/experiments/support";
import { loadSupportTickets } from "../lib/datasets";
import { percentile } from "../lib/metrics";
import { getProvider, isProviderName, providerInfo } from "../lib/providers";
import type { DecisionRequest, ProviderName } from "../lib/types";
import { loadEnv, parseArgs, stamp, table, writeResult } from "./_shared";

loadEnv();

async function timeN(fn: () => Promise<unknown>, n: number, concurrency: number): Promise<number[]> {
  const times: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, n) }, async () => {
      while (next < n) {
        next++;
        const t0 = performance.now();
        try {
          await fn();
          times.push(performance.now() - t0);
        } catch (e) {
          console.error("  !", e instanceof Error ? e.message : e);
        }
      }
    }),
  );
  return times.sort((a, b) => a - b);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providers = String(args.provider ?? process.env.DEFAULT_PROVIDER ?? "mock").split(",");
  const n = Number(args.n ?? 10);
  const concurrency = Number(args.concurrency ?? 4);
  const ticket = loadSupportTickets()[0];
  const batched: DecisionRequest = buildSupportRequest(ticket);
  // The same three questions, asked one per request.
  const singles: DecisionRequest[] = Object.entries(batched.questions).map(([k, q]) => ({ state: batched.state, questions: { [k]: q } }));

  const results: Record<string, unknown>[] = [];
  const out: (string | number)[][] = [["provider", "model", "n", "p50 ms", "p95 ms", "mean ms", "3 sequential calls p50 ms"]];

  for (const name of providers) {
    if (!isProviderName(name)) throw new Error(`Unknown provider "${name}"`);
    const info = providerInfo(name as ProviderName);
    if (!info.configured) {
      console.warn(`skipping ${name}: not configured`);
      continue;
    }
    const p = getProvider(name as ProviderName);
    console.log(`\n▶ ${name} (${info.model}) — ${n} batched requests`);
    const t = await timeN(() => p.decide(batched), n, concurrency);
    console.log(`▶ ${name} — ${Math.max(3, Math.floor(n / 3))} × 3 sequential single-question requests`);
    const seq = await timeN(
      async () => {
        for (const s of singles) await p.decide(s);
      },
      Math.max(3, Math.floor(n / 3)),
      concurrency,
    );
    const mean = t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
    out.push([name, info.model, t.length, percentile(t, 50), percentile(t, 95), Math.round(mean), percentile(seq, 50)]);
    results.push({ provider: name, model: info.model, n: t.length, p50: percentile(t, 50), p95: percentile(t, 95), mean, sequential3p50: percentile(seq, 50), samples: t });
  }

  console.log("\n" + table(out));
  const file = writeResult(`latency-${stamp()}.json`, JSON.stringify({ n, concurrency, results }, null, 2));
  console.log(`\nwrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
