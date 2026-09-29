/**
 * lib/types.ts
 *
 * The shared vocabulary of the lab. Read this file first.
 *
 * The central idea: a *decision request* is "here is a state, answer these
 * typed questions about it". A *decision response* is a map of typed answers,
 * each carrying a probability distribution. There is no free-form text
 * anywhere in this contract. That is what makes Jev a *machine-consumed*
 * primitive rather than a chatbot — downstream code reads numbers, not prose.
 *
 * Every provider in `lib/providers.ts` (Jev direct, OpenRouter, an LLM asked
 * to emulate the same contract, or the offline mock) must speak exactly this
 * shape, so experiments and metrics never know which provider answered.
 */

// ---------------------------------------------------------------------------
// Questions (what we ask)
// ---------------------------------------------------------------------------

/**
 * A `choice` question picks one label from a closed set. The `criteria` map
 * is label → plain-English description of when that label applies. Jev returns
 * a probability for *every* label, not just the winner.
 */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/**
 * A `score` question rates the state on an *ordered* rubric. `criteria` is an
 * array where index 0 is the lowest level. The answer is a probability-weighted
 * expected level (so it may be fractional, e.g. 2.4 on a 0–4 scale).
 */
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

/**
 * A `noul` question ("no-or-yes") returns a single probability that a statement
 * about the state is true. It is the cheapest primitive and composes well:
 * ask ten nouls in one request and do the counting in code.
 */
export interface NoulQuestion {
  type: "noul";
  instructions: string;
  /** Optional clarification of what true/false mean. */
  criteria?: { true: string; false: string };
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

/** The `state` can be text, a JSON object, or an array — whatever describes the situation. */
export type DecisionState = string | Record<string, unknown> | unknown[];

export interface DecisionRequest {
  state: DecisionState;
  questions: Record<string, Question>;
}

// ---------------------------------------------------------------------------
// Answers (what comes back)
// ---------------------------------------------------------------------------

export interface ChoiceAnswer {
  type: "choice";
  /** The arg-max label. */
  choice: string;
  /**
   * How concentrated the distribution is (0–1). Note: this is NOT "how likely
   * the model is to be right" — calibration is the property that makes those
   * two numbers line up, and the Calibration Lab exists to check whether it does.
   */
  confidence: number;
  /** Probability per label. Should sum to ~1. */
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  /** Expected level index (0-based, may be fractional). */
  score: number;
  confidence: number;
  /** Level index (as a string key) → description, so a UI can render it. */
  legend: Record<string, string>;
  /** Probability per level index (string keys "0", "1", ...). */
  probabilities: Record<string, number>;
}

export interface NoulAnswer {
  type: "noul";
  /** P(statement is true). */
  noul: number;
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * What a provider returns. `raw` is kept so the UI can always show the
 * unmodified wire response — the lab's rule is "do not hide uncertainty".
 */
export interface DecisionResponse {
  provider: ProviderName;
  /** Exact model snapshot that answered, e.g. "jev-1.13.0" or "gpt-4o-mini-2024-07-18". */
  model: string;
  answers: Record<string, Answer>;
  usage: TokenUsage | null;
  /** Estimated cost in USD from our pricing table (null if unknown). */
  estimatedCostUsd: number | null;
  /** Wall-clock latency of the HTTP round trip as measured by the lab. */
  latencyMs: number;
  raw: unknown;
  /**
   * LLM emulators sometimes return malformed JSON or probabilities that don't
   * sum to one. We repair what we can and record what we did here, because
   * that repair work is itself part of the comparison.
   */
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export type ProviderName =
  | "mock" // offline deterministic heuristic (not a model)
  | "jev" // TypeSafe Jev, direct API
  | "openrouter-jev" // Jev via OpenRouter decisions endpoint
  | "vercel-jev" // Jev via Vercel AI Gateway
  | "openrouter-llm" // any chat model via OpenRouter, emulating the contract
  | "openrouter-claude" // Claude via OpenRouter (LLM emulator)
  | "openrouter-gemini" // Gemini via OpenRouter (LLM emulator)
  | "openai"
  | "anthropic"
  | "google";

export type ProviderKind = "decision-model" | "llm-emulator" | "heuristic";

export interface ProviderInfo {
  name: ProviderName;
  kind: ProviderKind;
  label: string;
  /** Whether the required env vars are present. */
  configured: boolean;
  /** Whether ENABLED_PROVIDERS allows the UI to call it. */
  enabled: boolean;
  model: string;
  description: string;
}

export interface DecisionProvider {
  info(): ProviderInfo;
  decide(req: DecisionRequest): Promise<DecisionResponse>;
}

// ---------------------------------------------------------------------------
// Metrics (what we record about every request)
// ---------------------------------------------------------------------------

export type ExperimentName = "support" | "agent-firewall" | "model-router" | "calibration";

/** Where a decision ended up after the deterministic gate. */
export type Route = "auto" | "stronger-model" | "human-review" | "blocked";

/**
 * One row in the results file. The benchmark, the calibration analysis, the
 * latency and cost scripts and the UI's metrics strip all read this shape.
 *
 * Correctness is only filled when the dataset example has a ground-truth label.
 */
export interface MetricRecord {
  id: string;
  timestamp: string;
  experiment: ExperimentName;
  exampleId: string;
  provider: ProviderName;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  /** The question this row is about (an example can produce several rows). */
  question: string;
  questionType: Question["type"];
  /** Full distribution, verbatim. */
  probabilities: Record<string, number>;
  /** The label/level/boolean the provider selected. */
  decision: string;
  confidence: number;
  /** Ground truth if labelled. */
  expected: string | null;
  correct: boolean | null;
  /** What the deterministic policy did with the decision. */
  route: Route | null;
  /** Free-form flags: "ambiguous", "repaired-json", "policy-override", ... */
  flags: string[];
}

// ---------------------------------------------------------------------------
// Pipeline traces (what the UI draws)
// ---------------------------------------------------------------------------

export type StageKind =
  | "state" // incoming state
  | "decision" // semantic judgment (Jev / LLM / mock)
  | "gate" // deterministic confidence gate
  | "policy" // deterministic business/authorization rule
  | "action"; // simulated side effect

export interface PipelineStage {
  kind: StageKind;
  title: string;
  /** Who owns this stage — the UI colours these differently on purpose. */
  owner: "code" | "model" | "simulated-tool";
  /** Short human summary shown on the card. */
  summary: string;
  /** Anything the stage wants to expose; rendered as JSON. */
  data?: unknown;
  /** Only for gate stages. */
  route?: Route;
  /** Milliseconds spent in this stage (0 for pure code). */
  durationMs?: number;
}

export interface PipelineTrace {
  experiment: ExperimentName;
  exampleId: string;
  provider: ProviderName;
  stages: PipelineStage[];
  /** The rows that would be written to results/ for this run. */
  metrics: MetricRecord[];
  /** Final outcome of the whole pipeline. */
  outcome: {
    route: Route;
    decision: string;
    confidence: number;
    correct: boolean | null;
    expected: string | null;
  };
  response: DecisionResponse;
}

/**
 * Support compare mode: one ticket, several providers in parallel.
 * Each arm returns its own PipelineTrace so latency / tokens / cost stay honest.
 */
export interface CompareRunResult {
  experiment: ExperimentName;
  exampleId: string;
  traces: PipelineTrace[];
  errors: { provider: ProviderName; error: string }[];
}

// ---------------------------------------------------------------------------
// Dataset shapes
// ---------------------------------------------------------------------------

export interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  customer: {
    tier: "free" | "pro" | "enterprise";
    accountAgeDays: number;
    /** Whether this login is allowed to receive refunds at all (authorization is code, not a model). */
    refundEligible: boolean;
  };
  order?: {
    amountUsd: number;
    /** Relative so the dataset never goes stale; the engine converts to a date. */
    purchasedDaysAgo: number;
  };
  labels?: {
    department: "billing" | "technical" | "account" | "sales";
    refundRequested: boolean;
    frustration: 0 | 1 | 2 | 3 | 4;
  };
  /** Marked by the dataset author when humans disagreed. Surfaced, not hidden. */
  ambiguous?: boolean;
  notes?: string;
}

export interface AgentAction {
  id: string;
  /** What the (simulated) agent was asked to accomplish. */
  goal: string;
  /** The tool call the agent proposes. */
  proposed: {
    tool: string;
    args: Record<string, unknown>;
    /** The agent's own justification — this is *input* to Jev, never trusted by code. */
    rationale: string;
  };
  /** Which user/role is running the agent (authorization is code). */
  actor: { role: "viewer" | "developer" | "admin"; recentDestructiveCalls: number };
  labels: {
    /** Does the proposed action actually serve the stated goal? */
    intentAligned: boolean;
    /** Ground-truth risk level. */
    risk: "low" | "medium" | "high" | "critical";
    /** What a careful human reviewer would do. */
    verdict: "allow" | "review" | "block";
  };
  ambiguous?: boolean;
  notes?: string;
}

export interface RoutingPrompt {
  id: string;
  prompt: string;
  labels: {
    complexity: 0 | 1 | 2 | 3;
    domain: "code" | "math" | "writing" | "factual" | "chit-chat";
    needsTools: boolean;
    /** The tier a cost-aware human operator would send this to. */
    tier: "small" | "medium" | "large";
  };
  ambiguous?: boolean;
  notes?: string;
}
