import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { listProviders } from "@/lib/providers";

export const runtime = "nodejs";

/** GET /api/providers → which adapters exist, which are configured, which the UI may call. */
export async function GET() {
  return NextResponse.json({ providers: listProviders(), defaultProvider: config.lab.defaultProvider() });
}
