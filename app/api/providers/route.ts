import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { supportCompareProviders } from "@/lib/experiments";
import { listProviders, providerInfo } from "@/lib/providers";

export const runtime = "nodejs";

/** GET /api/providers → which adapters exist, which are configured, which the UI may call. */
export async function GET() {
  const compareNames = supportCompareProviders();
  return NextResponse.json({
    providers: listProviders(),
    defaultProvider: config.lab.defaultProvider(),
    supportCompare: compareNames.map((name) => providerInfo(name)),
  });
}
