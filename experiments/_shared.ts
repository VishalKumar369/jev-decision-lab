/**
 * experiments/_shared.ts
 *
 * Helpers shared by the CLI scripts: env loading, arg parsing, results I/O.
 * Scripts run with `tsx` (see package.json) and use the same lib/ code as the UI.
 */

import { config as loadDotenv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetricRecord } from "../lib/types";

export function loadEnv(): void {
  // Same precedence as Next.js: .env.local wins over .env
  for (const f of [".env.local", ".env"]) {
    const p = join(process.cwd(), f);
    if (existsSync(p)) loadDotenv({ path: p, override: false });
  }
}

/** `--key value` and `--flag` parsing; nothing fancy. */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

export const RESULTS_DIR = join(process.cwd(), "results");

export function ensureResultsDir(): void {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
}

export function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function writeResult(name: string, content: string): string {
  ensureResultsDir();
  const p = join(RESULTS_DIR, name);
  writeFileSync(p, content);
  return p;
}

/** Load every *.json results file that contains MetricRecord[] (benchmark output). */
export function loadAllRecords(filter?: (file: string) => boolean): MetricRecord[] {
  ensureResultsDir();
  const rows: MetricRecord[] = [];
  for (const f of readdirSync(RESULTS_DIR)) {
    if (!f.endsWith(".json") || !f.startsWith("benchmark-")) continue;
    if (filter && !filter(f)) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")) as { records?: MetricRecord[] };
      if (Array.isArray(parsed.records)) rows.push(...parsed.records);
    } catch {
      /* skip malformed */
    }
  }
  return rows;
}

export function fmtUsd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0";
  if (n < 0.001) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(4)}`;
}

export function pct(n: number | null): string {
  return n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
}

/** Minimal fixed-width table printer for terminal output. */
export function table(rows: (string | number)[][]): string {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i] ?? "").length)));
  return rows.map((r, ri) => r.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ") + (ri === 0 ? "\n" + widths.map((w) => "-".repeat(w)).join("  ") : "")).join("\n");
}
