/**
 * lib/llm.ts
 *
 * The "general-purpose LLM" comparison arm.
 *
 * To compare apples with apples we make chat models speak the *same* contract
 * as Jev: given a state and typed questions, return JSON containing a
 * probability distribution for every question. This is exactly what teams do
 * in practice when they use an LLM as a classifier — and it exposes the costs
 * of doing so:
 *
 *   - a long instruction prompt on every call (paid input tokens)
 *   - hundreds of output tokens (paid, slow — generation is serial)
 *   - occasional malformed JSON that must be repaired or retried
 *   - "probabilities" that are *verbalised guesses*, not calibrated
 *     estimates. The Calibration Lab lets you measure this yourself.
 *
 * Three transports are implemented with raw fetch (no SDKs, so the request
 * bodies are visible):
 *   - OpenAI-compatible chat completions (OpenAI, OpenRouter)
 *   - Anthropic Messages API
 *   - Google Gemini generateContent
 */

import { config } from "./env";
import { argmax, clamp01, normaliseDistribution } from "./jev";
import { estimateCostUsd } from "./pricing";
import type { Answer, DecisionRequest, DecisionResponse, ProviderName, Question } from "./types";

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function describeQuestion(key: string, q: Question): string {
  switch (q.type) {
    case "choice":
      return (
        `"${key}" (type: choice): ${q.instructions}\n` +
        `  options:\n` +
        Object.entries(q.criteria)
          .map(([k, v]) => `    - ${k}: ${v}`)
          .join("\n") +
        `\n  answer shape: {"type":"choice","probabilities":{${Object.keys(q.criteria)
          .map((k) => `"${k}":<0-1>`)
          .join(",")}}}`
      );
    case "score":
      return (
        `"${key}" (type: score): ${q.instructions}\n` +
        `  ordered levels (index 0 is lowest):\n` +
        q.criteria.map((c, i) => `    - ${i}: ${c}`).join("\n") +
        `\n  answer shape: {"type":"score","probabilities":{${q.criteria.map((_, i) => `"${i}":<0-1>`).join(",")}}}`
      );
    case "noul":
      return (
        `"${key}" (type: noul): ${q.instructions}\n` +
        (q.criteria ? `  true: ${q.criteria.true}\n  false: ${q.criteria.false}\n` : "") +
        `  answer shape: {"type":"noul","noul":<probability the statement is true, 0-1>}`
      );
  }
}

export function buildEmulatorPrompt(req: DecisionRequest): { system: string; user: string } {
  const system = [
    "You are a decision engine, not an assistant. You never write prose.",
    "You will be given a STATE and a set of typed QUESTIONS about it.",
    "For every question return a calibrated probability distribution over the allowed answers.",
    "Calibrated means: across many cases where you say 0.8, you should be right about 80% of the time.",
    "Do not always output 0.99 — express genuine uncertainty when the state is ambiguous.",
    "Respond with ONE JSON object whose keys are exactly the question keys. No markdown fences, no commentary.",
  ].join(" ");

  const user =
    `STATE:\n${typeof req.state === "string" ? req.state : JSON.stringify(req.state, null, 2)}\n\n` +
    `QUESTIONS:\n` +
    Object.entries(req.questions)
      .map(([k, q]) => describeQuestion(k, q))
      .join("\n\n") +
    `\n\nReturn only the JSON object.`;
  return { system, user };
}

// ---------------------------------------------------------------------------
// Response parsing / repair
// ---------------------------------------------------------------------------

/** Pull the first {...} block out of a response that may contain fences or chatter. */
export function extractJson(text: string): { value: Record<string, unknown> | null; repaired: boolean } {
  try {
    return { value: JSON.parse(text), repaired: false };
  } catch {
    /* fall through */
  }
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return { value: JSON.parse(stripped.slice(start, end + 1)), repaired: true };
    } catch {
      /* fall through */
    }
  }
  return { value: null, repaired: true };
}

/**
 * Turn the LLM's JSON into typed answers, noting every repair. If a question is
 * missing entirely we return a uniform distribution and flag it — the point of
 * the lab is to *see* these failures, not to paper over them.
 */
export function answersFromEmulatorJson(
  json: Record<string, unknown> | null,
  req: DecisionRequest,
): { answers: Record<string, Answer>; warnings: string[] } {
  const warnings: string[] = [];
  const answers: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(req.questions)) {
    const raw = (json?.[key] ?? null) as Record<string, unknown> | null;
    if (!raw) warnings.push(`missing answer for "${key}" — substituted uniform distribution`);

    if (q.type === "noul") {
      const p = raw && typeof raw.noul === "number" ? raw.noul : raw && typeof raw.probability === "number" ? raw.probability : 0.5;
      answers[key] = { type: "noul", noul: clamp01(p) };
      continue;
    }
    const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    const given = (raw?.probabilities ?? {}) as Record<string, number>;
    const sum = Object.values(given).reduce((a, b) => a + Number(b || 0), 0);
    if (raw && Math.abs(sum - 1) > 0.05) warnings.push(`"${key}" probabilities summed to ${sum.toFixed(2)} — renormalised`);
    const unknownKeys = Object.keys(given).filter((k) => !keys.includes(k));
    if (unknownKeys.length) warnings.push(`"${key}" returned labels outside the allowed set: ${unknownKeys.join(", ")} — dropped`);
    const probabilities = normaliseDistribution(given, keys);

    if (q.type === "choice") {
      const c = argmax(probabilities);
      answers[key] = { type: "choice", choice: c, confidence: probabilities[c], probabilities };
    } else {
      const expected = Object.entries(probabilities).reduce((acc, [k, p]) => acc + Number(k) * p, 0);
      answers[key] = {
        type: "score",
        score: expected,
        confidence: Math.max(...Object.values(probabilities)),
        legend: Object.fromEntries(q.criteria.map((d, i) => [String(i), d])),
        probabilities,
      };
    }
  }
  return { answers, warnings };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

interface ChatResult {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  raw: unknown;
}

async function openAiCompatible(baseUrl: string, apiKey: string, model: string, system: string, user: string, extraHeaders: Record<string, string> = {}): Promise<ChatResult> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    model: body.model ?? model,
    inputTokens: body.usage?.prompt_tokens ?? null,
    outputTokens: body.usage?.completion_tokens ?? null,
    raw: body,
  };
}

async function anthropicMessages(apiKey: string, model: string, system: string, user: string): Promise<ChatResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    model?: string;
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: body.content?.map((c) => c.text ?? "").join("") ?? "",
    model: body.model ?? model,
    inputTokens: body.usage?.input_tokens ?? null,
    outputTokens: body.usage?.output_tokens ?? null,
    raw: body,
  };
}

async function geminiGenerate(apiKey: string, model: string, system: string, user: string): Promise<ChatResult> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    modelVersion?: string;
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    text: body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    model: body.modelVersion ?? model,
    inputTokens: body.usageMetadata?.promptTokenCount ?? null,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
    raw: body,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function callLlmEmulator(provider: Exclude<ProviderName, "mock" | "jev" | "openrouter-jev" | "vercel-jev">, req: DecisionRequest): Promise<DecisionResponse> {
  const { system, user } = buildEmulatorPrompt(req);
  const started = performance.now();
  let result: ChatResult;
  let priceModel: string;

  switch (provider) {
    case "openai": {
      const key = config.openai.apiKey();
      if (!key) throw new Error("OPENAI_API_KEY is not set");
      priceModel = config.openai.model();
      result = await openAiCompatible("https://api.openai.com/v1", key, priceModel, system, user);
      break;
    }
    case "openrouter-llm": {
      const key = config.openrouter.apiKey();
      if (!key) throw new Error("OPENROUTER_API_KEY is not set");
      priceModel = config.openrouter.llmModel();
      result = await openAiCompatible("https://openrouter.ai/api/v1", key, priceModel, system, user, {
        "HTTP-Referer": "https://github.com/bytemonk/jev-decision-lab",
        "X-Title": "jev-decision-lab",
      });
      break;
    }
    case "anthropic": {
      const key = config.anthropic.apiKey();
      if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
      priceModel = config.anthropic.model();
      result = await anthropicMessages(key, priceModel, system, user);
      break;
    }
    case "google": {
      const key = config.google.apiKey();
      if (!key) throw new Error("GOOGLE_API_KEY is not set");
      priceModel = config.google.model();
      result = await geminiGenerate(key, priceModel, system, user);
      break;
    }
  }
  const latencyMs = performance.now() - started;

  const { value, repaired } = extractJson(result.text);
  const { answers, warnings } = answersFromEmulatorJson(value, req);
  if (repaired) warnings.unshift(value ? "response was not clean JSON — extracted first object" : "response contained no parseable JSON");

  const usage = result.inputTokens === null ? null : { input_tokens: result.inputTokens, output_tokens: result.outputTokens ?? 0 };
  return {
    provider,
    model: result.model,
    answers,
    usage,
    estimatedCostUsd: usage ? estimateCostUsd(priceModel, usage.input_tokens, usage.output_tokens) : null,
    latencyMs,
    raw: { request: { system, user }, response: result.raw },
    warnings,
  };
}
