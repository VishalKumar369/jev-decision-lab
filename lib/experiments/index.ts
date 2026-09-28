/**
 * lib/experiments/index.ts
 *
 * One entry point the API route and the benchmark share:
 *   runExample(experiment, example, provider) → PipelineTrace
 *
 * "calibration" is not a separate pipeline — it is an *analysis* over the rows
 * the other three produce. See lib/metrics.ts#calibration and experiments/calibration.ts.
 */

import type { AgentAction, DecisionProvider, ExperimentName, PipelineTrace, RoutingPrompt, SupportTicket } from "../types";
import { runFirewall } from "./firewall";
import { runRouter } from "./router";
import { runSupport } from "./support";

export type RunnableExperiment = Exclude<ExperimentName, "calibration">;

export function isRunnable(name: string): name is RunnableExperiment {
  return name === "support" || name === "agent-firewall" || name === "model-router";
}

export function detectExperiment(example: unknown): RunnableExperiment {
  const e = example as Record<string, unknown>;
  if ("proposed" in e) return "agent-firewall";
  if ("prompt" in e) return "model-router";
  return "support";
}

export async function runExample(experiment: RunnableExperiment, example: unknown, provider: DecisionProvider): Promise<PipelineTrace> {
  switch (experiment) {
    case "support":
      return runSupport(example as SupportTicket, provider);
    case "agent-firewall":
      return runFirewall(example as AgentAction, provider);
    case "model-router":
      return runRouter(example as RoutingPrompt, provider);
  }
}

export { runSupport, runFirewall, runRouter };
