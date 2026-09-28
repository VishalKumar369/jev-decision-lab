/**
 * lib/policy-engine.ts
 *
 * Everything in this file is DETERMINISTIC. No model is called here, ever.
 *
 * This is the most important boundary in the project. The model (Jev, an LLM,
 * or the mock) answers *semantic* questions — "does this person want a refund?",
 * "does this tool call serve the stated goal?". Code answers everything else:
 *
 *   - authorization      (is this actor allowed to do this at all?)
 *   - thresholds         (how sure must the model be before we act?)
 *   - arithmetic         (is $312 over the $250 auto-refund limit?)
 *   - date comparisons   (was the purchase within the 30-day window?)
 *   - rate limits        (has this actor done 3 destructive things already?)
 *   - execution policy   (which tools may run at all, with which args?)
 *
 * Why? Because these rules must be auditable, testable with unit tests, and
 * changeable by a product manager editing a number — none of which is true of
 * a prompt. A model that is 92% sure a refund is requested should not be the
 * thing deciding whether $10,000 leaves the company.
 *
 * Each function returns a small result object with a `reason` string so the UI
 * can show *why* code did what it did, next to *why* the model believed what
 * it believed.
 */

import type { Answer, ChoiceAnswer, NoulAnswer, Route, ScoreAnswer } from "./types";

// ---------------------------------------------------------------------------
// 1. Confidence gate — the universal pattern
// ---------------------------------------------------------------------------

export interface GateThresholds {
  /** At or above this confidence → act automatically. */
  auto: number;
  /** At or above this (but below `auto`) → try a stronger/slower model. Below → human. */
  escalate: number;
}

export const DEFAULT_GATE: GateThresholds = { auto: 0.85, escalate: 0.6 };

export interface GateResult {
  route: Route;
  confidence: number;
  thresholds: GateThresholds;
  reason: string;
  /** True when the top two options are close — surfaced, never hidden. */
  ambiguous: boolean;
  margin: number;
}

/** Confidence for any answer type, and the margin between the top two options. */
export function confidenceOf(answer: Answer): { confidence: number; margin: number } {
  if (answer.type === "noul") {
    // A noul is a Bernoulli; "confidence" is distance from the coin flip.
    const c = Math.max(answer.noul, 1 - answer.noul);
    return { confidence: c, margin: Math.abs(answer.noul - 0.5) * 2 };
  }
  const sorted = Object.values(answer.probabilities).sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  return { confidence: answer.confidence ?? top, margin: top - second };
}

/**
 * The gate. Pure function of (answer, thresholds). Call it *after* any
 * authorization/policy checks that could veto the action regardless of
 * confidence — see the experiment engines for ordering.
 */
export function confidenceGate(answer: Answer, thresholds: GateThresholds = DEFAULT_GATE): GateResult {
  const { confidence, margin } = confidenceOf(answer);
  const ambiguous = margin < 0.2;
  let route: Route;
  let reason: string;
  if (confidence >= thresholds.auto) {
    route = "auto";
    reason = `confidence ${confidence.toFixed(2)} ≥ auto threshold ${thresholds.auto}`;
  } else if (confidence >= thresholds.escalate) {
    route = "stronger-model";
    reason = `confidence ${confidence.toFixed(2)} in [${thresholds.escalate}, ${thresholds.auto}) → escalate to a stronger model`;
  } else {
    route = "human-review";
    reason = `confidence ${confidence.toFixed(2)} < ${thresholds.escalate} → human review`;
  }
  if (ambiguous && route === "auto") {
    // Even a high top probability can hide a near-tie on a score question.
    reason += ` (note: top-two margin only ${margin.toFixed(2)})`;
  }
  return { route, confidence, thresholds, reason, ambiguous, margin };
}

// ---------------------------------------------------------------------------
// 2. Support pipeline policies
// ---------------------------------------------------------------------------

export interface RefundPolicy {
  /** Refunds at or below this amount can be auto-approved. */
  autoApproveLimitUsd: number;
  /** Purchases older than this cannot be refunded automatically. */
  windowDays: number;
  /** Minimum P(refund requested) before we even consider the refund path. */
  minRefundProbability: number;
}

export const DEFAULT_REFUND_POLICY: RefundPolicy = { autoApproveLimitUsd: 250, windowDays: 30, minRefundProbability: 0.7 };

export interface RefundDecision {
  action: "auto-refund" | "route-to-billing-agent" | "no-refund-path" | "denied-not-eligible";
  reason: string;
  checks: { name: string; passed: boolean; detail: string }[];
}

/**
 * Note the ordering: eligibility (authorization) is checked FIRST and can veto
 * regardless of what the model thinks. Then the model's probability is one
 * input among several deterministic checks.
 */
export function evaluateRefund(
  input: {
    refundRequested: NoulAnswer;
    customer: { refundEligible: boolean; tier: string };
    order?: { amountUsd: number; purchasedAt: string };
    now?: Date;
  },
  policy: RefundPolicy = DEFAULT_REFUND_POLICY,
): RefundDecision {
  const checks: RefundDecision["checks"] = [];
  const now = input.now ?? new Date();

  // Authorization — code, not model.
  checks.push({
    name: "authorization: account refund-eligible",
    passed: input.customer.refundEligible,
    detail: input.customer.refundEligible ? "account flag refundEligible=true" : "account flag refundEligible=false",
  });
  if (!input.customer.refundEligible) {
    return { action: "denied-not-eligible", reason: "Account is not eligible for refunds; model opinion irrelevant.", checks };
  }

  // Semantic input from the model, thresholded by code.
  const p = input.refundRequested.noul;
  const asked = p >= policy.minRefundProbability;
  checks.push({
    name: `semantic: P(refund requested) ≥ ${policy.minRefundProbability}`,
    passed: asked,
    detail: `P = ${p.toFixed(3)} (from model)`,
  });
  if (!asked) return { action: "no-refund-path", reason: "Model does not believe a refund is being requested.", checks };

  if (!input.order) {
    checks.push({ name: "data: order present", passed: false, detail: "no order attached to ticket" });
    return { action: "route-to-billing-agent", reason: "Refund requested but no order to refund against — needs a human.", checks };
  }

  // Arithmetic — code.
  const underLimit = input.order.amountUsd <= policy.autoApproveLimitUsd;
  checks.push({
    name: `arithmetic: amount ≤ $${policy.autoApproveLimitUsd}`,
    passed: underLimit,
    detail: `$${input.order.amountUsd.toFixed(2)}`,
  });

  // Date comparison — code.
  const ageDays = (now.getTime() - new Date(input.order.purchasedAt).getTime()) / 86_400_000;
  const inWindow = ageDays <= policy.windowDays;
  checks.push({
    name: `date: purchase within ${policy.windowDays} days`,
    passed: inWindow,
    detail: `${ageDays.toFixed(1)} days old`,
  });

  if (underLimit && inWindow) return { action: "auto-refund", reason: "All deterministic checks passed.", checks };
  return { action: "route-to-billing-agent", reason: "Refund requested but outside auto-approve limits.", checks };
}

/** Frustration escalation is a threshold on a *score* answer — code again. */
export function frustrationEscalation(frustration: ScoreAnswer, threshold = 3): { escalate: boolean; reason: string } {
  const escalate = frustration.score >= threshold;
  return {
    escalate,
    reason: `expected frustration ${frustration.score.toFixed(2)} ${escalate ? "≥" : "<"} ${threshold}`,
  };
}

// ---------------------------------------------------------------------------
// 3. Agent Action Firewall — execution policy
// ---------------------------------------------------------------------------

export type ToolRiskClass = "read" | "write" | "destructive" | "forbidden";

/**
 * The tool allowlist. Anything not listed is `forbidden` — the model never gets
 * a vote on that. Risk class is a property of the *tool*, decided by humans.
 */
export const TOOL_POLICY: Record<string, { risk: ToolRiskClass; minRole: "viewer" | "developer" | "admin"; description: string }> = {
  read_file: { risk: "read", minRole: "viewer", description: "Read a file inside the workspace" },
  list_dir: { risk: "read", minRole: "viewer", description: "List a directory" },
  search_code: { risk: "read", minRole: "viewer", description: "Grep the repository" },
  http_get: { risk: "read", minRole: "viewer", description: "GET a URL on the allowlist" },
  write_file: { risk: "write", minRole: "developer", description: "Create or overwrite a file inside the workspace" },
  run_tests: { risk: "write", minRole: "developer", description: "Run the test suite" },
  git_commit: { risk: "write", minRole: "developer", description: "Commit staged changes" },
  send_email: { risk: "write", minRole: "developer", description: "Send an email to an internal address" },
  delete_file: { risk: "destructive", minRole: "developer", description: "Delete a file inside the workspace" },
  drop_table: { risk: "destructive", minRole: "admin", description: "Drop a database table" },
  shell: { risk: "destructive", minRole: "admin", description: "Run an arbitrary shell command" },
  git_push_force: { risk: "destructive", minRole: "admin", description: "Force-push a branch" },
  transfer_funds: { risk: "forbidden", minRole: "admin", description: "Never allowed from an agent" },
};

const ROLE_RANK = { viewer: 0, developer: 1, admin: 2 } as const;

export interface FirewallPolicyInput {
  tool: string;
  args: Record<string, unknown>;
  actor: { role: keyof typeof ROLE_RANK; recentDestructiveCalls: number };
  /** From the model: P(this call serves the stated goal). */
  intentAligned: NoulAnswer;
  /** From the model: blast radius. */
  blastRadius: ChoiceAnswer;
}

export interface FirewallDecision {
  route: Route;
  reason: string;
  checks: { name: string; passed: boolean; detail: string; owner: "code" | "model" }[];
  riskClass: ToolRiskClass | "unknown";
}

export const FIREWALL_LIMITS = {
  /** Max destructive calls per actor per window before everything goes to review. */
  destructiveCallsPerWindow: 3,
  /** Paths outside this prefix are never touched. */
  workspaceRoot: "/workspace/",
  /** Read tools auto-run at this alignment; write tools need more; destructive need the most. */
  alignmentThreshold: { read: 0.5, write: 0.8, destructive: 0.95 } as Record<ToolRiskClass, number>,
};

/**
 * Order of checks matters and is intentional:
 *   1. allowlist        (unknown tool → blocked, model not consulted)
 *   2. forbidden class  (blocked, model not consulted)
 *   3. authorization    (role too low → blocked)
 *   4. argument policy  (path traversal, wildcards, prod hosts → blocked)
 *   5. rate limit       (too many destructive calls → human review)
 *   6. THEN the model's semantic judgments, thresholded per risk class
 */
export function evaluateFirewall(input: FirewallPolicyInput, limits = FIREWALL_LIMITS): FirewallDecision {
  const checks: FirewallDecision["checks"] = [];
  const policy = TOOL_POLICY[input.tool];

  checks.push({ name: "allowlist: tool is known", passed: !!policy, detail: policy ? policy.description : `"${input.tool}" is not in TOOL_POLICY`, owner: "code" });
  if (!policy) return { route: "blocked", reason: "Unknown tool. Blocked before any model call mattered.", checks, riskClass: "unknown" };

  checks.push({ name: "class: not forbidden", passed: policy.risk !== "forbidden", detail: `risk class = ${policy.risk}`, owner: "code" });
  if (policy.risk === "forbidden") return { route: "blocked", reason: "Tool is forbidden for agents by policy.", checks, riskClass: policy.risk };

  const authorized = ROLE_RANK[input.actor.role] >= ROLE_RANK[policy.minRole];
  checks.push({ name: `authorization: role ≥ ${policy.minRole}`, passed: authorized, detail: `actor role = ${input.actor.role}`, owner: "code" });
  if (!authorized) return { route: "blocked", reason: "Actor's role is not permitted to use this tool.", checks, riskClass: policy.risk };

  const argCheck = validateArgs(input.tool, input.args, limits.workspaceRoot);
  checks.push({ name: "arguments: pass static validation", passed: argCheck.ok, detail: argCheck.detail, owner: "code" });
  if (!argCheck.ok) return { route: "blocked", reason: `Argument policy violated: ${argCheck.detail}`, checks, riskClass: policy.risk };

  if (policy.risk === "destructive") {
    const underLimit = input.actor.recentDestructiveCalls < limits.destructiveCallsPerWindow;
    checks.push({
      name: `rate limit: destructive calls < ${limits.destructiveCallsPerWindow}`,
      passed: underLimit,
      detail: `${input.actor.recentDestructiveCalls} in current window`,
      owner: "code",
    });
    if (!underLimit) return { route: "human-review", reason: "Destructive-call budget exhausted for this actor.", checks, riskClass: policy.risk };
  }

  // Only now do the model's opinions matter — and the bar rises with risk.
  const needed = limits.alignmentThreshold[policy.risk];
  const p = input.intentAligned.noul;
  const alignedEnough = p >= needed;
  checks.push({ name: `semantic: P(intent aligned) ≥ ${needed}`, passed: alignedEnough, detail: `P = ${p.toFixed(3)}`, owner: "model" });

  const blast = input.blastRadius.choice;
  const blastOk = policy.risk === "destructive" ? blast === "single-file" || blast === "none" : blast !== "organisation";
  checks.push({
    name: "semantic: blast radius acceptable for risk class",
    passed: blastOk,
    detail: `model says "${blast}" (${(input.blastRadius.probabilities[blast] ?? 0).toFixed(2)})`,
    owner: "model",
  });

  if (alignedEnough && blastOk) {
    return { route: "auto", reason: "Deterministic checks passed and model judgments clear the per-class thresholds.", checks, riskClass: policy.risk };
  }
  if (policy.risk === "destructive" || p < 0.5) {
    return { route: "human-review", reason: "Model is not confident enough for this risk class — a human decides.", checks, riskClass: policy.risk };
  }
  return { route: "stronger-model", reason: "Borderline alignment on a non-destructive tool — ask a stronger model before a human.", checks, riskClass: policy.risk };
}

/** Static argument validation. Pure string/regex checks — this is where a lot of real safety lives. */
export function validateArgs(tool: string, args: Record<string, unknown>, workspaceRoot: string): { ok: boolean; detail: string } {
  const path = typeof args.path === "string" ? args.path : undefined;
  if (path !== undefined) {
    if (path.includes("..")) return { ok: false, detail: `path traversal in "${path}"` };
    if (!path.startsWith(workspaceRoot)) return { ok: false, detail: `"${path}" is outside ${workspaceRoot}` };
    if (/[*?]/.test(path) && (tool === "delete_file" || tool === "write_file")) return { ok: false, detail: `wildcards not allowed for ${tool}` };
  }
  if (tool === "shell") {
    const cmd = String(args.command ?? "");
    if (/\brm\s+-rf?\b|\bmkfs\b|\bdd\s+if=|:\(\)\s*\{/.test(cmd)) return { ok: false, detail: "command matches destructive pattern" };
    if (/\bsudo\b/.test(cmd)) return { ok: false, detail: "sudo is never allowed" };
  }
  if (tool === "http_get") {
    const url = String(args.url ?? "");
    if (!/^https:\/\/(docs|api)\.example\.com\//.test(url)) return { ok: false, detail: `"${url}" not on the URL allowlist` };
  }
  if (tool === "drop_table") {
    const env = String(args.environment ?? "");
    if (env !== "staging") return { ok: false, detail: `drop_table only allowed in staging (got "${env || "unset"}")` };
  }
  if (tool === "send_email") {
    const to = String(args.to ?? "");
    if (!/@example\.com$/.test(to)) return { ok: false, detail: `recipient "${to}" is not internal` };
  }
  return { ok: true, detail: "no violations" };
}

// ---------------------------------------------------------------------------
// 4. Model Router — cost/latency-aware tier selection
// ---------------------------------------------------------------------------

export type Tier = "small" | "medium" | "large";

export interface RouterBudget {
  /** Max $ we are willing to spend on this request. */
  maxCostUsd: number;
  /** Max acceptable p95 latency in ms. */
  maxLatencyMs: number;
}

export const TIER_PROFILE: Record<Tier, { costPerRequestUsd: number; p95LatencyMs: number; model: string }> = {
  small: { costPerRequestUsd: 0.0002, p95LatencyMs: 800, model: "small-fast-model" },
  medium: { costPerRequestUsd: 0.002, p95LatencyMs: 2500, model: "mid-tier-model" },
  large: { costPerRequestUsd: 0.02, p95LatencyMs: 8000, model: "frontier-model" },
};

export interface RouterDecision {
  tier: Tier;
  route: Route;
  reason: string;
  checks: { name: string; passed: boolean; detail: string; owner: "code" | "model" }[];
}

/**
 * The model tells us how complex the prompt *is*. Code decides which tier we can
 * *afford*. When they disagree (complex prompt, tiny budget) the router does not
 * silently degrade — it escalates to a human/product decision.
 */
export function evaluateRoute(
  input: { complexity: ScoreAnswer; needsTools: NoulAnswer; budget: RouterBudget },
  gate: GateThresholds = { auto: 0.6, escalate: 0.45 },
): RouterDecision {
  const checks: RouterDecision["checks"] = [];
  const c = input.complexity.score; // expected level on 0–3
  const desired: Tier = c < 0.9 ? "small" : c < 2.1 ? "medium" : "large";
  checks.push({ name: "semantic: complexity → desired tier", passed: true, detail: `expected complexity ${c.toFixed(2)} → ${desired}`, owner: "model" });

  const g = confidenceGate(input.complexity, gate);
  checks.push({ name: "gate: complexity confidence", passed: g.route === "auto", detail: g.reason, owner: "code" });

  // Tools force at least the medium tier in this lab's fictional fleet.
  let tier = desired;
  if (input.needsTools.noul >= 0.7 && tier === "small") {
    tier = "medium";
    checks.push({ name: "policy: tools require ≥ medium", passed: true, detail: `P(needs tools) = ${input.needsTools.noul.toFixed(2)} → bump to medium`, owner: "code" });
  }

  const profile = TIER_PROFILE[tier];
  const affordable = profile.costPerRequestUsd <= input.budget.maxCostUsd;
  const fastEnough = profile.p95LatencyMs <= input.budget.maxLatencyMs;
  checks.push({ name: `budget: cost ≤ $${input.budget.maxCostUsd}`, passed: affordable, detail: `${tier} ≈ $${profile.costPerRequestUsd}`, owner: "code" });
  checks.push({ name: `budget: p95 ≤ ${input.budget.maxLatencyMs} ms`, passed: fastEnough, detail: `${tier} p95 ≈ ${profile.p95LatencyMs} ms`, owner: "code" });

  if (g.route === "human-review") {
    return { tier, route: "human-review", reason: "Complexity estimate too uncertain to route automatically.", checks };
  }
  if (!affordable || !fastEnough) {
    return { tier, route: "human-review", reason: "Desired tier violates the request budget — do not silently downgrade.", checks };
  }
  if (g.route === "stronger-model") {
    return { tier, route: "stronger-model", reason: "Moderate confidence — route, but flag for a second opinion.", checks };
  }
  return { tier, route: "auto", reason: `Route to ${tier} (${profile.model}).`, checks };
}

// ---------------------------------------------------------------------------
// 5. UI rate limit — trivial fixed window, in memory
// ---------------------------------------------------------------------------

const buckets = new Map<string, { windowStart: number; count: number }>();

export function checkRateLimit(key: string, perMinute: number, now = Date.now()): { allowed: boolean; remaining: number } {
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= 60_000) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: perMinute - 1 };
  }
  if (b.count >= perMinute) return { allowed: false, remaining: 0 };
  b.count += 1;
  return { allowed: true, remaining: perMinute - b.count };
}
