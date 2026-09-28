/**
 * lib/pricing.ts
 *
 * Estimated $/1M tokens. These are *estimates* baked in at authoring time
 * (September 2026) so the lab can show relative cost without a billing API.
 * Update them when you swap models; the cost script prints which table entry
 * it used so stale numbers are visible rather than silent.
 *
 * Why cost matters for the lesson: a decision model charges only for input and
 * returns ~30 output tokens, while an LLM asked to "return JSON with
 * probabilities" pays for hundreds of output tokens *and* a long instruction
 * prompt. Per decision, the difference is usually 1–3 orders of magnitude.
 */

export interface Price {
  inputPerMillion: number;
  outputPerMillion: number;
  source: string;
}

const TABLE: Record<string, Price> = {
  // TypeSafe Jev: input only, output free.
  "jev-latest": { inputPerMillion: 0.042, outputPerMillion: 0, source: "typesafe.ai pricing" },
  "jev-1.13": { inputPerMillion: 0.042, outputPerMillion: 0, source: "typesafe.ai pricing" },
  "typesafe/jev-1.13": { inputPerMillion: 0.042, outputPerMillion: 0, source: "openrouter model page" },
  "typesafe/jev": { inputPerMillion: 0.042, outputPerMillion: 0, source: "typesafe.ai pricing" },
  "typesafe-ai/jev": { inputPerMillion: 0.042, outputPerMillion: 0, source: "vercel ai gateway" },

  // General-purpose LLMs (approximate list prices).
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6, source: "openai pricing (approx)" },
  "openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6, source: "openrouter (approx)" },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10, source: "openai pricing (approx)" },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6, source: "openai pricing (approx)" },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5, source: "anthropic pricing (approx)" },
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15, source: "anthropic pricing (approx)" },
  "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4, source: "google pricing (approx)" },
  "gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5, source: "google pricing (approx)" },

  // The mock is free — it's a heuristic, not a model.
  mock: { inputPerMillion: 0, outputPerMillion: 0, source: "n/a" },
};

/** Find a price by exact model id, then by prefix (so "jev-1.13.0" matches "jev-1.13"). */
export function priceFor(model: string): Price | null {
  if (TABLE[model]) return TABLE[model];
  const key = Object.keys(TABLE)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? TABLE[key] : null;
}

export function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const p = priceFor(model);
  if (!p || inputTokens === null) return null;
  const out = outputTokens ?? 0;
  return (inputTokens * p.inputPerMillion + out * p.outputPerMillion) / 1_000_000;
}

export function allPrices(): Record<string, Price> {
  return { ...TABLE };
}
