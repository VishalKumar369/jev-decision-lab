import type { PipelineTrace } from "@/lib/types";

function usd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0";
  return n < 0.0001 ? `$${n.toExponential(2)}` : `$${n.toFixed(5)}`;
}

/** Everything we record about one request, at a glance. "n/a" is shown, not hidden. */
export function MetricsStrip({ trace }: { trace: PipelineTrace }) {
  const r = trace.response;
  return (
    <div className="metrics">
      <Metric k="provider" v={r.provider} />
      <Metric k="model" v={r.model} />
      <Metric k="latency" v={`${r.latencyMs.toFixed(0)} ms`} />
      <Metric k="tokens in / out" v={r.usage ? `${r.usage.input_tokens} / ${r.usage.output_tokens}` : "n/a"} />
      <Metric k="est. cost" v={usd(r.estimatedCostUsd)} />
      <Metric k="per 1M decisions" v={r.estimatedCostUsd === null ? "n/a" : `$${(r.estimatedCostUsd * 1_000_000).toFixed(0)}`} />
      <Metric k="decision" v={trace.outcome.decision} />
      <Metric k="confidence" v={trace.outcome.confidence.toFixed(2)} />
      <Metric
        k="ground truth"
        v={trace.outcome.expected === null ? "unlabelled" : `${trace.outcome.expected} ${trace.outcome.correct ? "✓" : "✗"}`}
      />
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v" title={v} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {v}
      </div>
    </div>
  );
}
