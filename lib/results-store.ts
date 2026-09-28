/**
 * lib/results-store.ts
 *
 * Reads and writes the results/ directory so the UI and the CLI scripts share
 * one source of truth:
 *
 *   results/benchmark-<experiment>-<provider>-<stamp>.json   full runs (CLI or UI batch)
 *   results/ui-runs.jsonl                                    every single click in the UI
 *
 * Calibration in the UI reads both.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetricRecord } from "./types";

const DIR = join(process.cwd(), "results");

function ensure() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

export function appendUiRecords(records: MetricRecord[]): void {
  ensure();
  appendFileSync(join(DIR, "ui-runs.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

export function saveBenchmark(experiment: string, provider: string, payload: unknown): string {
  ensure();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `benchmark-${experiment}-${provider}-${stamp}.json`;
  writeFileSync(join(DIR, name), JSON.stringify(payload, null, 2));
  return `results/${name}`;
}

export interface LoadedResults {
  records: MetricRecord[];
  files: { name: string; n: number; provider: string; experiment: string; createdAt: string }[];
}

export function loadAllResults(): LoadedResults {
  ensure();
  const records: MetricRecord[] = [];
  const files: LoadedResults["files"] = [];
  for (const f of readdirSync(DIR).sort()) {
    const p = join(DIR, f);
    if (f.startsWith("benchmark-") && f.endsWith(".json")) {
      try {
        const parsed = JSON.parse(readFileSync(p, "utf8")) as { records?: MetricRecord[]; meta?: { provider: string; experiment: string; createdAt: string } };
        if (Array.isArray(parsed.records)) {
          records.push(...parsed.records);
          files.push({ name: f, n: parsed.records.length, provider: parsed.meta?.provider ?? "?", experiment: parsed.meta?.experiment ?? "?", createdAt: parsed.meta?.createdAt ?? "" });
        }
      } catch {
        /* skip */
      }
    } else if (f === "ui-runs.jsonl") {
      const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
      let n = 0;
      for (const line of lines) {
        try {
          records.push(JSON.parse(line) as MetricRecord);
          n++;
        } catch {
          /* skip */
        }
      }
      files.push({ name: f, n, provider: "mixed", experiment: "mixed", createdAt: "" });
    }
  }
  return { records, files };
}
