import { NextResponse } from "next/server";
import { calibration, summarise } from "@/lib/metrics";
import { loadAllResults } from "@/lib/results-store";

export const runtime = "nodejs";

/**
 * GET /api/results?bins=10
 * Aggregates everything in results/ into per-provider (and per-provider×experiment)
 * calibration reports + summaries, and returns the ambiguous/misrouted rows so the
 * Calibration Lab can show them.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bins = Math.max(2, Math.min(20, Number(url.searchParams.get("bins") ?? 10)));
  const { records, files } = loadAllResults();

  const byProvider = groupBy(records, (r) => r.provider);
  const byProviderExperiment = groupBy(records, (r) => `${r.provider} / ${r.experiment}`);

  const reports = [...byProvider.entries()].map(([provider, rows]) => ({ group: provider, provider, summary: summarise(rows), calibration: calibration(rows, bins) }));
  const detailed = [...byProviderExperiment.entries()].map(([group, rows]) => ({ group, summary: summarise(rows), calibration: calibration(rows, bins) }));

  // Confident-but-wrong rows: the ones that matter most for automation.
  const confidentWrong = records.filter((r) => r.correct === false && r.confidence >= 0.8).sort((a, b) => b.confidence - a.confidence).slice(0, 40);
  const ambiguous = records.filter((r) => r.flags.includes("ambiguous") || r.flags.includes("near-tie")).slice(0, 60);

  return NextResponse.json({ files, total: records.length, reports, detailed, confidentWrong, ambiguous });
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}
