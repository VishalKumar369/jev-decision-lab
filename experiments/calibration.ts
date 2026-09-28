/**
 * experiments/calibration.ts
 *
 * Read every benchmark-*.json in results/, group rows by provider (and
 * optionally experiment), bucket predictions by confidence, and compare
 * predicted probability with empirical accuracy.
 *
 *   npm run calibration
 *   npm run calibration -- --bins 5 --by provider,experiment
 *
 * Writes results/calibration-<stamp>.{json,csv} and prints a reliability
 * table per group. Reading the table:
 *
 *   bucket      n   mean conf   accuracy   gap
 *   0.9–1.0    41       0.95       0.93   0.02   ← well calibrated
 *   0.6–0.7    12       0.64       0.33   0.31   ← over-confident here
 *
 * ECE (expected calibration error) is the size-weighted mean gap. Lower is
 * better; ~0.02–0.05 is very good, >0.15 means the confidence number is not
 * something you should be gating on.
 */

import { calibration, calibrationToCsv, type CalibrationReport } from "../lib/metrics";
import type { MetricRecord } from "../lib/types";
import { loadAllRecords, loadEnv, parseArgs, stamp, table, writeResult } from "./_shared";

loadEnv();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bins = Number(args.bins ?? 10);
  const by = String(args.by ?? "provider").split(",");
  const rows = loadAllRecords();
  if (!rows.length) {
    console.error("No benchmark results found in results/. Run `npm run bench` first.");
    process.exit(1);
  }

  const groups = new Map<string, MetricRecord[]>();
  for (const r of rows) {
    const key = by.map((k) => (k === "experiment" ? r.experiment : k === "question" ? r.question : r.provider)).join(" / ");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const reports: (CalibrationReport & { group: string })[] = [];
  for (const [group, rs] of groups) {
    const rep = calibration(rs, bins);
    reports.push({ ...rep, group, provider: group });
    console.log(`\n=== ${group} — n=${rep.n} labelled, ECE=${rep.ece}, MCE=${rep.mce}, Brier=${rep.brier}, ambiguous=${rep.ambiguousCount}`);
    console.log(
      table([
        ["bucket", "n", "mean conf", "accuracy", "gap", ""],
        ...rep.buckets
          .filter((b) => b.n > 0)
          .map((b) => [
            `${b.lo.toFixed(1)}–${b.hi.toFixed(1)}`,
            b.n,
            b.meanConfidence.toFixed(3),
            b.empiricalAccuracy.toFixed(3),
            b.gap.toFixed(3),
            bar(b.meanConfidence, b.empiricalAccuracy),
          ]),
      ]),
    );
  }

  const s = stamp();
  const json = writeResult(`calibration-${s}.json`, JSON.stringify({ bins, by, reports }, null, 2));
  const csv = writeResult(`calibration-${s}.csv`, calibrationToCsv(reports));
  console.log(`\nwrote ${json}\nwrote ${csv}`);
}

/** Tiny ASCII reliability bar: | is predicted, # is empirical. */
function bar(conf: number, acc: number): string {
  const w = 30;
  const chars = Array.from({ length: w + 1 }, () => " ");
  chars[Math.round(acc * w)] = "#";
  chars[Math.round(conf * w)] = chars[Math.round(conf * w)] === "#" ? "X" : "|";
  return `[${chars.join("")}]`;
}

main();
