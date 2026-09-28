import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { loadDataset } from "@/lib/datasets";
import { isRunnable, runExample } from "@/lib/experiments";
import { checkRateLimit } from "@/lib/policy-engine";
import { resolveProvider } from "@/lib/providers";
import { appendUiRecords } from "@/lib/results-store";

export const runtime = "nodejs";

/**
 * POST /api/run
 * body: { experiment, provider?, exampleId? , example? }
 *
 * Either `exampleId` (from the dataset) or a full `example` object (edited in
 * the UI). Returns a PipelineTrace. The rate limit is a deterministic policy
 * from lib/policy-engine.ts — the same file that gates the experiments.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`run:${ip}`, config.lab.uiRateLimitPerMinute());
  if (!rl.allowed) return NextResponse.json({ error: "rate limit: too many runs this minute" }, { status: 429 });

  let body: { experiment?: string; provider?: string; exampleId?: string; example?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { experiment, provider, exampleId, example } = body;
  if (!experiment || !isRunnable(experiment)) return NextResponse.json({ error: "experiment must be support | agent-firewall | model-router" }, { status: 400 });

  const ex = example ?? loadDataset(experiment).find((e) => (e as { id: string }).id === exampleId);
  if (!ex) return NextResponse.json({ error: `example "${exampleId}" not found` }, { status: 404 });

  try {
    const trace = await runExample(experiment, ex, resolveProvider(provider));
    appendUiRecords(trace.metrics);
    return NextResponse.json({ trace });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
