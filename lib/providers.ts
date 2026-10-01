/**
 * lib/providers.ts
 *
 * The adapter registry. Experiments ask for a provider by name and get back an
 * object with `decide()`; they never import a vendor client directly.
 *
 * Adding a provider = add a `ProviderName` in types.ts, a call function
 * somewhere, and one entry in `REGISTRY` below. Nothing else changes.
 *
 * `enabled` vs `configured`:
 *   - configured: the API key is present
 *   - enabled:    ENABLED_PROVIDERS allows it (a deterministic policy so a
 *                 curious click in the UI can't burn budget on a big model)
 */

import { config, has } from "./env";
import { callJevDirect, callJevViaOpenRouter, callJevViaVercel } from "./jev";
import { callLlmEmulator } from "./llm";
import { callMock } from "./mock";
import type { DecisionProvider, DecisionRequest, DecisionResponse, ProviderInfo, ProviderName } from "./types";

interface Entry {
  kind: ProviderInfo["kind"];
  label: string;
  description: string;
  configured: () => boolean;
  model: () => string;
  call: (req: DecisionRequest) => Promise<DecisionResponse>;
}

const REGISTRY: Record<ProviderName, Entry> = {
  mock: {
    kind: "heuristic",
    label: "Mock (keyword heuristic)",
    description: "Offline, deterministic keyword rules with seeded noise. Not a model — it is the 'what if we just wrote code' baseline.",
    configured: () => true,
    model: () => "mock-heuristic-v1",
    call: callMock,
  },
  jev: {
    kind: "decision-model",
    label: "TypeSafe Jev",
    description: "POST api.typesafe.ai/v1/systemone. Calibrated probabilities over answers you define. ~100 ms, $0.042/1M input, output free.",
    configured: () => has("TYPESAFE_API_KEY"),
    model: () => config.typesafe.model(),
    call: callJevDirect,
  },
  "openrouter-jev": {
    kind: "decision-model",
    label: "Jev via OpenRouter",
    description: "Same model through OpenRouter's /alpha/decisions endpoint. Reports cost directly.",
    configured: () => has("OPENROUTER_API_KEY"),
    model: () => config.openrouter.jevModel(),
    call: callJevViaOpenRouter,
  },
  "vercel-jev": {
    kind: "decision-model",
    label: "Jev via Vercel AI Gateway",
    description: "Same model through Vercel's evaluation-model endpoint. No token usage reported.",
    configured: () => has("AI_GATEWAY_API_KEY"),
    model: () => "typesafe-ai/jev",
    call: callJevViaVercel,
  },
  "openrouter-llm": {
    kind: "llm-emulator",
    label: "LLM via OpenRouter (emulating decisions)",
    description: "Any chat model asked to answer the same typed questions as JSON. Verbalised probabilities, not calibrated.",
    configured: () => has("OPENROUTER_API_KEY"),
    model: () => config.openrouter.llmModel(),
    call: (req) => callLlmEmulator("openrouter-llm", req),
  },
  "openrouter-claude": {
    kind: "llm-emulator",
    label: "Claude",
    description: "Claude asked for the same typed JSON probabilities as Jev. Comparison arm for Support.",
    configured: () => has("OPENROUTER_API_KEY"),
    model: () => config.openrouter.claudeModel(),
    call: (req) => callLlmEmulator("openrouter-claude", req),
  },
  "openrouter-gemini": {
    kind: "llm-emulator",
    label: "Gemini",
    description: "Gemini asked for the same typed JSON probabilities as Jev. Comparison arm for Support.",
    configured: () => has("OPENROUTER_API_KEY"),
    model: () => config.openrouter.geminiModel(),
    call: (req) => callLlmEmulator("openrouter-gemini", req),
  },
  openai: {
    kind: "llm-emulator",
    label: "OpenAI (emulating decisions)",
    description: "Chat completions with JSON mode, asked for a probability per option.",
    configured: () => has("OPENAI_API_KEY"),
    model: () => config.openai.model(),
    call: (req) => callLlmEmulator("openai", req),
  },
  anthropic: {
    kind: "llm-emulator",
    label: "Anthropic (emulating decisions)",
    description: "Messages API, asked for a probability per option.",
    configured: () => has("ANTHROPIC_API_KEY"),
    model: () => config.anthropic.model(),
    call: (req) => callLlmEmulator("anthropic", req),
  },
  google: {
    kind: "llm-emulator",
    label: "Google Gemini (emulating decisions)",
    description: "generateContent with JSON response type, asked for a probability per option.",
    configured: () => has("GOOGLE_API_KEY"),
    model: () => config.google.model(),
    call: (req) => callLlmEmulator("google", req),
  },
};

export const PROVIDER_NAMES = Object.keys(REGISTRY) as ProviderName[];

export function isProviderName(s: string): s is ProviderName {
  return (PROVIDER_NAMES as string[]).includes(s);
}

export function providerInfo(name: ProviderName): ProviderInfo {
  const e = REGISTRY[name];
  return {
    name,
    kind: e.kind,
    label: e.label,
    description: e.description,
    configured: e.configured(),
    enabled: config.lab.enabledProviders().includes(name),
    model: e.model(),
  };
}

export function listProviders(): ProviderInfo[] {
  return PROVIDER_NAMES.map(providerInfo);
}

export function getProvider(name: ProviderName): DecisionProvider {
  const e = REGISTRY[name];
  if (!e) throw new Error(`Unknown provider "${name}"`);
  return {
    info: () => providerInfo(name),
    decide: async (req) => {
      const info = providerInfo(name);
      if (!info.enabled) throw new Error(`Provider "${name}" is disabled by ENABLED_PROVIDERS`);
      if (!info.configured) throw new Error(`Provider "${name}" is not configured — see .env.example`);
      return e.call(req);
    },
  };
}

/** Resolve a user-supplied name, falling back to DEFAULT_PROVIDER. */
export function resolveProvider(name?: string | null): DecisionProvider {
  const chosen = name && isProviderName(name) ? name : config.lab.defaultProvider();
  return getProvider(chosen);
}
