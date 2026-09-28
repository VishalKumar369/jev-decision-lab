/**
 * lib/env.ts
 *
 * One place that reads process.env. Next.js loads `.env.local` for the app;
 * the scripts in experiments/ call `loadEnv()` explicitly (see experiments/_shared.ts).
 *
 * Keeping env access here means providers can be unit-tested by stubbing one
 * function, and nobody sprinkles `process.env.X!` around the codebase.
 */

import type { ProviderName } from "./types";

export function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export function has(name: string): boolean {
  return env(name) !== "";
}

export const config = {
  typesafe: {
    apiKey: () => env("TYPESAFE_API_KEY"),
    model: () => env("TYPESAFE_MODEL", "jev-latest"),
    baseUrl: () => env("TYPESAFE_BASE_URL", "https://api.typesafe.ai"),
  },
  openrouter: {
    apiKey: () => env("OPENROUTER_API_KEY"),
    jevModel: () => env("OPENROUTER_JEV_MODEL", "typesafe/jev-1.13"),
    llmModel: () => env("OPENROUTER_LLM_MODEL", "openai/gpt-4o-mini"),
  },
  vercel: {
    apiKey: () => env("AI_GATEWAY_API_KEY"),
  },
  openai: {
    apiKey: () => env("OPENAI_API_KEY"),
    model: () => env("OPENAI_MODEL", "gpt-4o-mini"),
  },
  anthropic: {
    apiKey: () => env("ANTHROPIC_API_KEY"),
    model: () => env("ANTHROPIC_MODEL", "claude-haiku-4-5"),
  },
  google: {
    apiKey: () => env("GOOGLE_API_KEY"),
    model: () => env("GOOGLE_MODEL", "gemini-2.0-flash"),
  },
  lab: {
    defaultProvider: () => env("DEFAULT_PROVIDER", "mock") as ProviderName,
    enabledProviders: (): ProviderName[] =>
      env("ENABLED_PROVIDERS", "mock,jev,openrouter-jev,openrouter-llm,openai,anthropic,google,vercel-jev")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as ProviderName[],
    uiRateLimitPerMinute: () => Number(env("UI_RATE_LIMIT_PER_MINUTE", "60")),
  },
};
