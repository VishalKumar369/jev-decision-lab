import { ExperimentShell } from "@/components/ExperimentShell";

export default function RouterPage() {
  return (
    <ExperimentShell
      experiment="model-router"
      title="3 · Model Router"
      intro={
        <>
          <p>
            Before spending on a frontier model, ask a cheap decision model how hard the prompt is. The model returns <code>complexity</code> (score 0–3), <code>domain</code>{" "}
            and <code>needsTools</code>; code maps complexity to a tier, bumps tools-required prompts to at least medium, and refuses to silently downgrade when the desired
            tier breaks the request’s cost/latency budget.
          </p>
          <p className="small muted">
            The routing call itself should cost less than the cheapest tier it routes to — check the “per 1M decisions” figure against <code>TIER_PROFILE</code> in{" "}
            <code>lib/policy-engine.ts</code>. Try <code>r007</code> (trivial but needs live data) and <code>r022</code> (short prompt, deep answer).
          </p>
        </>
      }
    />
  );
}
