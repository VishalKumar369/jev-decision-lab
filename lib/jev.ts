/**
 * lib/jev.ts
 *
 * Everything specific to TypeSafe Jev:
 *
 *   1. Tiny builders (`choice`, `score`, `noul`) so experiments read cleanly.
 *   2. A wire-format normaliser — Jev is reachable through three hosts (direct,
 *      OpenRouter, Vercel AI Gateway) whose envelopes differ slightly. We
 *      collapse them into `DecisionResponse`.
 *   3. The direct HTTP client. We deliberately use `fetch` instead of the
 *      official `@typesafe-ai/sdk` so students can see the actual request body.
 *      Swapping in the SDK is a one-file change.
 *
 * What Jev is, in one paragraph: a "System One" model. You give it a state and
 * a set of typed questions; it returns calibrated probabilities over the
 * answers *you* defined. No prose, no tool calls, no reasoning trace. It is fast
 * (tens to low hundreds of ms) and cheap ($0.042 / 1M input tokens, output free)
 * because it does not generate text. That makes it a *primitive* you call from
 * code, in the same place you'd otherwise write a brittle regex or a slow LLM
 * call.
 */

import { config } from "./env";
import { estimateCostUsd } from "./pricing";
import type {
  Answer,
  ChoiceQuestion,
  DecisionRequest,
  DecisionResponse,
  NoulQuestion,
  ProviderName,
  ScoreQuestion,
  TokenUsage,
} from "./types";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function choice(instructions: string, criteria: Record<string, string>): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

export function score(instructions: string, criteria: string[]): ScoreQuestion {
  if (criteria.length < 2) throw new Error("score() needs at least two ordered levels");
  return { type: "score", instructions, criteria };
}

export function noul(instructions: string, criteria?: { true: string; false: string }): NoulQuestion {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Coerce whatever a Jev host returned into our `Answer` union.
 * Vercel's gateway calls nouls "boolean"; OpenRouter nests answers under
 * `answers`; the direct API includes `legend` on scores but OpenRouter may not.
 * We fill gaps from the original question so the UI always has a legend.
 */
export function normaliseAnswer(key: string, raw: unknown, req: DecisionRequest): Answer {
  const r = (raw ?? {}) as Record<string, unknown>;
  const q = req.questions[key];
  const type = (r.type as string) ?? q?.type;

  if (type === "noul" || type === "boolean") {
    const p = typeof r.noul === "number" ? r.noul : typeof r.probability === "number" ? r.probability : Number(r.value);
    return { type: "noul", noul: clamp01(p) };
  }

  if (type === "choice") {
    const probabilities = normaliseDistribution(r.probabilities as Record<string, number>, Object.keys((q as ChoiceQuestion)?.criteria ?? {}));
    const choiceLabel = typeof r.choice === "string" ? r.choice : argmax(probabilities);
    const confidence = typeof r.confidence === "number" ? r.confidence : probabilities[choiceLabel] ?? 0;
    return { type: "choice", choice: choiceLabel, confidence: clamp01(confidence), probabilities };
  }

  if (type === "score") {
    const levels = (q as ScoreQuestion)?.criteria ?? [];
    const probabilities = normaliseDistribution(
      r.probabilities as Record<string, number>,
      levels.map((_, i) => String(i)),
    );
    const legend =
      (r.legend as Record<string, string>) ?? Object.fromEntries(levels.map((desc, i) => [String(i), desc]));
    const expected = Object.entries(probabilities).reduce((acc, [k, p]) => acc + Number(k) * p, 0);
    const scoreValue = typeof r.score === "number" ? r.score : expected;
    const confidence = typeof r.confidence === "number" ? r.confidence : Math.max(...Object.values(probabilities));
    return { type: "score", score: scoreValue, confidence: clamp01(confidence), legend, probabilities };
  }

  throw new Error(`Unknown answer type for question "${key}": ${JSON.stringify(raw)}`);
}

export function normaliseDistribution(input: Record<string, number> | undefined, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const src = input ?? {};
  for (const k of keys.length ? keys : Object.keys(src)) out[k] = Math.max(0, Number(src[k] ?? 0));
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum > 0) for (const k of Object.keys(out)) out[k] = out[k] / sum;
  else if (keys.length) for (const k of keys) out[k] = 1 / keys.length; // total ignorance
  return out;
}

export function argmax(dist: Record<string, number>): string {
  return Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Build a DecisionResponse from a Jev-style body `{ model, answers, usage }`. */
export function fromJevBody(
  provider: ProviderName,
  body: Record<string, unknown>,
  req: DecisionRequest,
  latencyMs: number,
  fallbackModel: string,
): DecisionResponse {
  // Vercel's gateway returns the answers map at the top level; others nest it.
  const answersRaw = (body.answers ?? body) as Record<string, unknown>;
  const answers: Record<string, Answer> = {};
  for (const key of Object.keys(req.questions)) {
    if (answersRaw[key] === undefined) throw new Error(`Provider omitted answer for question "${key}"`);
    answers[key] = normaliseAnswer(key, answersRaw[key], req);
  }
  const usageRaw = body.usage as Partial<TokenUsage> | undefined;
  const usage: TokenUsage | null = usageRaw
    ? { input_tokens: Number(usageRaw.input_tokens ?? 0), output_tokens: Number(usageRaw.output_tokens ?? 0) }
    : null;
  const model = typeof body.model === "string" ? body.model : fallbackModel;
  return {
    provider,
    model,
    answers,
    usage,
    estimatedCostUsd: usage ? estimateCostUsd(model, usage.input_tokens, usage.output_tokens) : null,
    latencyMs,
    raw: body,
  };
}

// ---------------------------------------------------------------------------
// Direct client
// ---------------------------------------------------------------------------

/**
 * POST https://api.typesafe.ai/v1/systemone
 *
 * Request:  { model, state, questions }
 * Response: { model, answers: { <key>: <typed answer> }, usage }
 */
export async function callJevDirect(req: DecisionRequest): Promise<DecisionResponse> {
  const apiKey = config.typesafe.apiKey();
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  const model = config.typesafe.model();
  const url = `${config.typesafe.baseUrl().replace(/\/$/, "")}/v1/systemone`;

  const started = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state: req.state, questions: req.questions }),
  });
  const latencyMs = performance.now() - started;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jev HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return fromJevBody("jev", body, req, latencyMs, model);
}

/**
 * POST https://openrouter.ai/api/alpha/decisions — same body, OpenRouter envelope.
 * OpenRouter also reports `usage.cost` in USD; when present we prefer it over
 * our own estimate.
 */
export async function callJevViaOpenRouter(req: DecisionRequest): Promise<DecisionResponse> {
  const apiKey = config.openrouter.apiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const model = config.openrouter.jevModel();

  const started = performance.now();
  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/bytemonk/jev-decision-lab",
      "X-Title": "Jev Decision Lab",
    },
    body: JSON.stringify({ model, state: req.state, questions: req.questions }),
  });
  const latencyMs = performance.now() - started;
  if (!res.ok) throw new Error(`OpenRouter decisions HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as Record<string, unknown>;
  const out = fromJevBody("openrouter-jev", body, req, latencyMs, model);
  const usage = body.usage as { cost?: number } | undefined;
  if (usage && typeof usage.cost === "number") out.estimatedCostUsd = usage.cost;
  return out;
}

/**
 * POST https://ai-gateway.vercel.sh/v4/ai/evaluation-model
 * Vercel does not return `usage` for this endpoint at the time of writing, so
 * token counts and cost will be null — and the UI will say so.
 */
export async function callJevViaVercel(req: DecisionRequest): Promise<DecisionResponse> {
  const apiKey = config.vercel.apiKey();
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not set");
  const model = "typesafe-ai/jev";

  const started = performance.now();
  const res = await fetch("https://ai-gateway.vercel.sh/v4/ai/evaluation-model", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "ai-model-id": model,
      "ai-evaluation-model-specification-version": "4",
      "ai-gateway-protocol-version": "0.0.1",
    },
    body: JSON.stringify({ state: req.state, questions: req.questions }),
  });
  const latencyMs = performance.now() - started;
  if (!res.ok) throw new Error(`Vercel gateway HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as Record<string, unknown>;
  return fromJevBody("vercel-jev", body, req, latencyMs, model);
}
