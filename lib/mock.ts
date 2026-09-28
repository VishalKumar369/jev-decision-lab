/**
 * lib/mock.ts
 *
 * An OFFLINE, DETERMINISTIC stand-in so the lab runs with zero API keys.
 *
 * This is NOT a model and it is not trying to be good. It is a bag of keyword
 * heuristics that produces *soft* distributions (never 0/1) with a little
 * seeded noise so calibration plots have some spread. Its purpose:
 *
 *   1. Let you click through every pipeline and see the shape of the data
 *      before you spend money.
 *   2. Serve as the "deterministic code" baseline in the comparison — this is
 *      roughly what a regex/keyword classifier looks like, and the benchmark
 *      will show you where it falls apart (sarcasm, negation, indirect asks).
 *
 * When you read a result from `mock`, remember the label on the tin.
 */

import { argmax } from "./jev";
import type { Answer, DecisionRequest, DecisionResponse, Question } from "./types";

/** Tiny seeded PRNG so a given state always yields the same "noise". */
function seeded(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Keyword hints per label. Case-insensitive substring match; each hit adds weight. */
const HINTS: Record<string, string[]> = {
  // support departments
  billing: ["charge", "invoice", "refund", "billed", "payment", "card", "subscription", "price", "receipt", "$"],
  technical: ["error", "bug", "crash", "broken", "500", "timeout", "doesn't work", "does not work", "fails", "api", "slow", "outage", "stuck", "loading"],
  account: ["password", "login", "log in", "2fa", "email address", "locked", "profile", "username", "delete my account", "sso"],
  sales: ["pricing", "quote", "enterprise plan", "seats", "demo", "upgrade to", "discount", "trial", "procurement"],
  // firewall intent
  aligned: ["as requested", "user asked", "to complete", "needed for"],
  misaligned: ["while i'm at it", "also", "clean up", "just in case", "might as well", "unrelated"],
  // routing domains
  code: ["function", "python", "typescript", "bug", "compile", "regex", "sql", "class ", "refactor", "stack trace"],
  math: ["prove", "integral", "derivative", "probability", "equation", "theorem", "solve for", "calculate"],
  writing: ["essay", "email", "rewrite", "draft", "poem", "story", "tone", "blog"],
  factual: ["what is", "who was", "when did", "capital of", "how many", "define"],
  "chit-chat": ["hi", "hello", "how are you", "thanks", "lol", "good morning"],
  // tiers
  small: ["what is", "define", "hello", "thanks", "capital of", "convert", "yes or no"],
  medium: ["write", "summarize", "explain", "compare", "email", "list"],
  large: ["prove", "architect", "design a", "multi-step", "analyze", "trade-offs", "distributed", "formal", "step by step", "research"],
};

const NEGATIVE = ["not a refund", "no refund", "don't want a refund", "not asking for money"];
const FRUSTRATION = ["!!", "unacceptable", "ridiculous", "furious", "third time", "again", "worst", "cancel", "lawyer", "disgusted", "immediately", "asap", "angry"];
const CALM = ["please", "thanks", "no rush", "whenever", "curious", "wondering", "appreciate"];

function textOf(state: unknown): string {
  return (typeof state === "string" ? state : JSON.stringify(state)).toLowerCase();
}

function soften(weights: Record<string, number>, rnd: () => number, temperature = 1): Record<string, number> {
  // softmax with a floor so nothing is ever exactly 0 or 1
  const keys = Object.keys(weights);
  const exps = keys.map((k) => Math.exp((weights[k] + (rnd() - 0.5) * 0.6) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  keys.forEach((k, i) => (out[k] = Math.max(0.01, exps[i] / sum)));
  const s2 = Object.values(out).reduce((a, b) => a + b, 0);
  for (const k of keys) out[k] = out[k] / s2;
  return out;
}

function answerChoice(key: string, q: Extract<Question, { type: "choice" }>, text: string, rnd: () => number): Answer {
  const weights: Record<string, number> = {};
  for (const label of Object.keys(q.criteria)) {
    const hints = HINTS[label] ?? label.split(/[-_ ]/);
    let w = 0;
    for (const h of hints) if (text.includes(h)) w += 1;
    // fall back to matching words from the criteria description
    if (w === 0) for (const word of q.criteria[label].toLowerCase().split(/\W+/)) if (word.length > 5 && text.includes(word)) w += 0.4;
    weights[label] = w;
  }
  const probabilities = soften(weights, rnd, 0.9);
  const c = argmax(probabilities);
  return { type: "choice", choice: c, confidence: probabilities[c], probabilities };
}

function answerScore(key: string, q: Extract<Question, { type: "score" }>, text: string, rnd: () => number): Answer {
  // Heuristic: count intensity markers, map to a level, spread mass around it.
  const n = q.criteria.length;
  let heat = 0;
  for (const w of FRUSTRATION) if (text.includes(w)) heat += 1;
  for (const w of CALM) if (text.includes(w)) heat -= 0.7;
  if (text.includes("!")) heat += (text.match(/!/g) ?? []).length * 0.3;
  if (/[A-Z]{4,}/.test(typeof text === "string" ? text.toUpperCase() : "")) heat += 0; // (text is lower-cased; kept for readability)
  const center = Math.min(n - 1, Math.max(0, Math.round(heat)));
  const weights: Record<string, number> = {};
  for (let i = 0; i < n; i++) weights[String(i)] = -Math.abs(i - center) * 1.2;
  const probabilities = soften(weights, rnd, 1);
  const expected = Object.entries(probabilities).reduce((a, [k, p]) => a + Number(k) * p, 0);
  return {
    type: "score",
    score: expected,
    confidence: Math.max(...Object.values(probabilities)),
    legend: Object.fromEntries(q.criteria.map((d, i) => [String(i), d])),
    probabilities,
  };
}

function answerNoul(key: string, q: Extract<Question, { type: "noul" }>, text: string, rnd: () => number): Answer {
  const instr = q.instructions.toLowerCase();
  let p = 0.35 + (rnd() - 0.5) * 0.2;
  const positive = instr.includes("refund")
    ? ["refund", "money back", "charge back", "reimburse", "credit"]
    : instr.includes("tool")
      ? ["search", "browse", "fetch", "run", "execute", "latest", "current", "today"]
      : instr.includes("goal") || instr.includes("intent") || instr.includes("serve")
        ? HINTS.aligned
        : instr.split(/\W+/).filter((w) => w.length > 5);
  for (const w of positive) if (text.includes(w)) p += 0.18;
  for (const w of NEGATIVE) if (text.includes(w)) p -= 0.4;
  if (instr.includes("goal") || instr.includes("intent")) {
    for (const w of HINTS.misaligned) if (text.includes(w)) p -= 0.25;
    // crude: if the tool name or a path token appears in the goal, it's probably aligned
    p += 0.15;
  }
  return { type: "noul", noul: Math.min(0.97, Math.max(0.03, p)) };
}

export async function callMock(req: DecisionRequest): Promise<DecisionResponse> {
  const started = performance.now();
  const text = textOf(req.state);
  const rnd = seeded(text);
  const answers: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(req.questions)) {
    answers[key] =
      q.type === "choice" ? answerChoice(key, q, text, rnd) : q.type === "score" ? answerScore(key, q, text, rnd) : answerNoul(key, q, text, rnd);
  }
  // Simulate a tiny, realistic-feeling delay so the UI animation is visible.
  await new Promise((r) => setTimeout(r, 15 + rnd() * 25));
  const inputTokens = Math.round(text.length / 4) + 40 * Object.keys(req.questions).length;
  return {
    provider: "mock",
    model: "mock-heuristic-v1",
    answers,
    usage: { input_tokens: inputTokens, output_tokens: 0 },
    estimatedCostUsd: 0,
    latencyMs: performance.now() - started,
    raw: { note: "mock provider: keyword heuristics with seeded noise. Not a model.", answers },
    warnings: ["mock provider — heuristic output, not a model"],
  };
}
