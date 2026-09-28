/**
 * experiments/cost.ts
 *
 * Cost analysis over existing benchmark results: per provider, what did a
 * decision cost, what would 1M decisions/month cost, and how much of the bill
 * was output tokens (the part a decision model doesn't have).
 *
 *   npm run cost
 *
 * Prints the pricing table entries used so stale prices are visible.
 */

import { priceFor } from "../lib/pricing";
import type { MetricRecord } from "../lib/types";
import { fmtUsd, loadAllRecords, loadEnv, parseArgs, stamp, table, writeResult } from "./_shared";

loadEnv();

function main() {
  parseArgs(process.argv.slice(2));
  const rows = loadAllRecords();
  if (!rows.length) {
    console.error("No benchmark results found in results/. Run `npm run bench` first.");
    process.exit(1);
  }

  // One request produces several rows; dedupe on (example, provider, timestamp).
  const requests = new Map<string, MetricRecord>();
  for (const r of rows) requests.set(`${r.experiment}:${r.exampleId}:${r.provider}:${r.timestamp}`, r);

  const byProvider = new Map<string, MetricRecord[]>();
  for (const r of requests.values()) byProvider.set(r.provider, [...(byProvider.get(r.provider) ?? []), r]);

  const out: (string | number)[][] = [["provider", "model", "requests", "avg in tok", "avg out tok", "avg $/decision", "$ per 1M decisions", "output share of cost", "price source"]];
  const report: Record<string, unknown>[] = [];

  for (const [provider, rs] of byProvider) {
    const model = rs[0].model;
    const price = priceFor(model);
    const withCost = rs.filter((r) => r.estimatedCostUsd !== null);
    const avgIn = rs.reduce((a, r) => a + (r.inputTokens ?? 0), 0) / rs.length;
    const avgOut = rs.reduce((a, r) => a + (r.outputTokens ?? 0), 0) / rs.length;
    const avgCost = withCost.length ? withCost.reduce((a, r) => a + (r.estimatedCostUsd ?? 0), 0) / withCost.length : null;
    const outputShare = price && avgCost ? (avgOut * price.outputPerMillion) / 1_000_000 / avgCost : null;
    out.push([
      provider,
      model,
      rs.length,
      Math.round(avgIn),
      Math.round(avgOut),
      fmtUsd(avgCost),
      avgCost === null ? "n/a" : `$${(avgCost * 1_000_000).toFixed(2)}`,
      outputShare === null ? "n/a" : `${(outputShare * 100).toFixed(0)}%`,
      price?.source ?? "unknown model — add to lib/pricing.ts",
    ]);
    report.push({ provider, model, requests: rs.length, avgInputTokens: avgIn, avgOutputTokens: avgOut, avgCostUsd: avgCost, perMillionDecisionsUsd: avgCost === null ? null : avgCost * 1_000_000, outputShare, price });
  }

  console.log(table(out));
  const file = writeResult(`cost-${stamp()}.json`, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${file}`);
}

main();
