import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { loadDataset } from "@/lib/datasets";
import { isRunnable, runExample, runSupportCompare } from "@/lib/experiments";
import { checkRateLimit } from "@/lib/policy-engine";
import { resolveProvider } from "@/lib/providers";
import { appendUiRecords } from "@/lib/results-store";
import type { SupportTicket } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/run
 * body: { experiment, provider?, exampleId?, example?, compare? }
 *
 * For Support with `compare: true` (the default UI path), the same ticket is
 * sent in parallel to Jev + Claude + Gemini (see SUPPORT_COMPARE_PROVIDERS).
 * Other experiments still run a single provider.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`run:${ip}`, config.lab.uiRateLimitPerMinute());
  if (!rl.allowed) return NextResponse.json({ error: "rate limit: too many runs this minute" }, { status: 429 });

  let body: { experiment?: string; provider?: string; exampleId?: string; example?: unknown; compare?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { experiment, provider, exampleId, example, compare } = body;
  if (!experiment || !isRunnable(experiment)) {
    return NextResponse.json({ error: "experiment must be support | agent-firewall | model-router" }, { status: 400 });
  }

  const ex = example ?? loadDataset(experiment).find((e) => (e as { id: string }).id === exampleId);
  if (!ex) return NextResponse.json({ error: `example "${exampleId}" not found` }, { status: 404 });

  try {
    if (experiment === "support" && compare !== false) {
      const result = await runSupportCompare(ex as SupportTicket);
      for (const t of result.traces) appendUiRecords(t.metrics);
      if (result.traces.length === 0) {
        const detail = result.errors.map((e) => `${e.provider}: ${e.error}`).join("; ") || "no providers returned";
        return NextResponse.json({ error: `compare failed — ${detail}` }, { status: 502 });
      }
      return NextResponse.json({ compare: result });
    }

    const trace = await runExample(experiment, ex, resolveProvider(provider));
    appendUiRecords(trace.metrics);
    return NextResponse.json({ trace });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
