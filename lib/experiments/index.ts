/**
 * lib/experiments/index.ts
 *
 * One entry point the API route and the benchmark share:
 *   runExample(experiment, example, provider) → PipelineTrace
 *
 * "calibration" is not a separate pipeline — it is an *analysis* over the rows
 * the other three produce. See lib/metrics.ts#calibration and experiments/calibration.ts.
 */

import { config } from "../env";
import { getProvider, isProviderName, providerInfo } from "../providers";
import type { AgentAction, CompareRunResult, DecisionProvider, ExperimentName, PipelineTrace, ProviderName, RoutingPrompt, SupportTicket } from "../types";
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

/** Providers the Support UI fires in parallel (configured + enabled only). */
export function supportCompareProviders(): ProviderName[] {
  return config.lab.supportCompareProviders().filter((name) => {
    if (!isProviderName(name)) return false;
    const info = providerInfo(name);
    return info.configured && info.enabled;
  });
}

/**
 * Run the same support ticket through several providers at once.
 * Failures on one arm do not cancel the others — they land in `errors`.
 */
export async function runSupportCompare(ticket: SupportTicket, names?: ProviderName[]): Promise<CompareRunResult> {
  const providers = names?.length ? names : supportCompareProviders();
  if (providers.length === 0) {
    throw new Error("No compare providers configured — set TYPESAFE_API_KEY and OPENROUTER_API_KEY, or check SUPPORT_COMPARE_PROVIDERS");
  }

  const settled = await Promise.all(
    providers.map(async (name) => {
      try {
        const trace = await runSupport(ticket, getProvider(name));
        return { ok: true as const, trace };
      } catch (e) {
        return { ok: false as const, provider: name, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return {
    experiment: "support",
    exampleId: ticket.id,
    traces: settled.filter((s): s is { ok: true; trace: PipelineTrace } => s.ok).map((s) => s.trace),
    errors: settled.filter((s): s is { ok: false; provider: ProviderName; error: string } => !s.ok).map((s) => ({ provider: s.provider, error: s.error })),
  };
}

export { runSupport, runFirewall, runRouter };
