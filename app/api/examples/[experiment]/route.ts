import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/datasets";
import { isRunnable } from "@/lib/experiments";

export const runtime = "nodejs";

/** GET /api/examples/:experiment → the labelled dataset for that experiment. */
export async function GET(_req: Request, ctx: { params: Promise<{ experiment: string }> }) {
  const { experiment } = await ctx.params;
  if (!isRunnable(experiment)) return NextResponse.json({ error: `unknown experiment "${experiment}"` }, { status: 404 });
  return NextResponse.json({ experiment, examples: loadDataset(experiment) });
}
