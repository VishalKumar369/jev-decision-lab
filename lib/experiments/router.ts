/**
 * lib/experiments/router.ts — Experiment 3: Model Router
 *
 * prompt → ONE decision call (complexity, domain, needs tools)
 *        → deterministic tier selection under a cost/latency budget
 *        → route to small / medium / large (simulated) or escalate
 *
 * This is where teams usually reach for "ask GPT which model to use", which
 * costs as much as just answering. A decision model makes the routing call
 * cheaper than the cheapest tier it routes to.
 */

import { choice, noul, score } from "../jev";
import { recordsFromResponse } from "../metrics";
import { TIER_PROFILE, evaluateRoute, type RouterBudget } from "../policy-engine";
import type { ChoiceAnswer, DecisionProvider, DecisionRequest, NoulAnswer, PipelineStage, PipelineTrace, RoutingPrompt, ScoreAnswer } from "../types";

export const COMPLEXITY_LEVELS = [
  "trivial — one fact, one line, or small talk",
  "simple — a short explanation, small code snippet, or short rewrite",
  "moderate — multi-paragraph reasoning, a proof, or a medium code change",
  "hard — long multi-step analysis, architecture, large refactor, or long documents",
];

export const DEFAULT_BUDGET: RouterBudget = { maxCostUsd: 0.05, maxLatencyMs: 10_000 };

export function buildRouterRequest(p: RoutingPrompt): DecisionRequest {
  return {
    state: { userPrompt: p.prompt },
    questions: {
      complexity: score("How much reasoning and output does a good answer require?", COMPLEXITY_LEVELS),
      domain: choice("What kind of request is this?", {
        code: "Programming, debugging, architecture, data systems",
        math: "Calculation, proofs, probability, formal reasoning",
        writing: "Drafting, rewriting, summarising, translating, creative text",
        factual: "A question with a lookup-able answer",
        "chit-chat": "Greetings, thanks, small talk, or a task request that is not a question",
      }),
      needsTools: noul("Does answering well require live data or an external action (web, calendar, internal search, booking)?"),
    },
  };
}

export async function runRouter(p: RoutingPrompt, provider: DecisionProvider, opts: { budget?: RouterBudget } = {}): Promise<PipelineTrace> {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const req = buildRouterRequest(p);
  const stages: PipelineStage[] = [];

  stages.push({ kind: "state", owner: "code", title: "Incoming prompt", summary: p.prompt.slice(0, 120), data: { prompt: p.prompt, budget } });

  const res = await provider.decide(req);
  const complexity = res.answers.complexity as ScoreAnswer;
  const domain = res.answers.domain as ChoiceAnswer;
  const needsTools = res.answers.needsTools as NoulAnswer;

  stages.push({
    kind: "decision",
    owner: "model",
    title: `Decision · ${res.model}`,
    summary: `complexity≈${complexity.score.toFixed(2)} · domain=${domain.choice} (${domain.confidence.toFixed(2)}) · P(tools)=${needsTools.noul.toFixed(2)}`,
    data: { answers: res.answers, usage: res.usage, estimatedCostUsd: res.estimatedCostUsd, warnings: res.warnings },
    durationMs: res.latencyMs,
  });

  const r = evaluateRoute({ complexity, needsTools, budget });

  stages.push({
    kind: "gate",
    owner: "code",
    title: "Tier selection under budget",
    summary: r.checks.map((c) => `${c.passed ? "✓" : "✗"} ${c.detail}`).join(" · "),
    route: r.route,
    data: { checks: r.checks, tierProfiles: TIER_PROFILE, budget },
  });

  stages.push({
    kind: "action",
    owner: r.route === "auto" ? "simulated-tool" : "code",
    title: r.route === "auto" ? `Route → ${r.tier} (simulated)` : r.route === "stronger-model" ? `Route → ${r.tier}, flag for second opinion` : "Human / product decision",
    summary: r.reason,
    route: r.route,
    data: { tier: r.tier, model: TIER_PROFILE[r.tier].model },
  });

  const flags: string[] = [];
  if (p.ambiguous) flags.push("ambiguous");
  const metrics = recordsFromResponse(
    "model-router",
    p.id,
    res,
    { complexity: String(p.labels.complexity), domain: p.labels.domain, needsTools: String(p.labels.needsTools) },
    r.route,
    flags,
  );

  return {
    experiment: "model-router",
    exampleId: p.id,
    provider: res.provider,
    stages,
    metrics,
    outcome: {
      route: r.route,
      decision: r.tier,
      confidence: complexity.confidence,
      expected: p.labels.tier,
      correct: r.tier === p.labels.tier,
    },
    response: res,
  };
}
