"use client";

/**
 * Side-by-side Support compare: Jev vs Claude vs Gemini on the same ticket.
 * Each column shows the full distribution plus latency / tokens / estimated cost.
 */

import type { ChoiceAnswer, CompareRunResult, NoulAnswer, PipelineTrace, ProviderName, Route, ScoreAnswer } from "@/lib/types";
import { DecisionBars } from "./DecisionBars";
import { RouteBadge } from "./RouteBadge";

const LABEL: Partial<Record<ProviderName, string>> = {
  jev: "TypeSafe Jev",
  "openrouter-claude": "Claude",
  "openrouter-gemini": "Gemini",
  "openrouter-llm": "OpenRouter LLM",
  mock: "Mock",
};

const KIND: Partial<Record<ProviderName, string>> = {
  jev: "decision model",
  "openrouter-claude": "LLM via OpenRouter",
  "openrouter-gemini": "LLM via OpenRouter",
  "openrouter-llm": "LLM via OpenRouter",
  mock: "heuristic",
};

function usd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(4)}`;
}

function tokensOf(t: PipelineTrace): string {
  const u = t.response.usage;
  return u ? `${u.input_tokens} / ${u.output_tokens}` : "n/a";
}

export function CompareResultPanel({ compare }: { compare: CompareRunResult }) {
  const traces = [...compare.traces].sort((a, b) => preferredOrder(a.provider) - preferredOrder(b.provider));

  return (
    <div className="result-body compare-body">
      <div className="section-label">Head-to-head · same ticket, same questions</div>
      <table className="data compare-summary">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Decision</th>
            <th>Conf</th>
            <th>Route</th>
            <th>Latency</th>
            <th>Tokens in/out</th>
            <th>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => (
            <tr key={t.provider}>
              <td>
                <b>{LABEL[t.provider] ?? t.provider}</b>
                <div className="small muted mono">{t.response.model}</div>
              </td>
              <td>{t.outcome.decision}</td>
              <td className="num">{t.outcome.confidence.toFixed(2)}</td>
              <td><RouteBadge route={t.outcome.route} /></td>
              <td className="num">{Math.round(t.response.latencyMs)} ms</td>
              <td className="num mono">{tokensOf(t)}</td>
              <td className="num">{usd(t.response.estimatedCostUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {compare.errors.length > 0 && (
        <div className="error" style={{ marginTop: 4 }}>
          {compare.errors.map((e) => (
            <div key={e.provider}>✗ {LABEL[e.provider] ?? e.provider}: {e.error}</div>
          ))}
        </div>
      )}

      <div className="compare-grid">
        {traces.map((t) => (
          <ProviderArm key={t.provider} trace={t} />
        ))}
      </div>

      <div className="small muted">
        Costs are estimates from the lab pricing table — not live billing. Jev is a decision model; Claude and Gemini are chat models asked to speak the same typed contract.
      </div>
    </div>
  );
}

function preferredOrder(name: ProviderName): number {
  const order: ProviderName[] = ["jev", "openrouter-claude", "openrouter-gemini", "openrouter-llm", "mock"];
  const i = order.indexOf(name);
  return i === -1 ? 99 : i;
}

function ProviderArm({ trace }: { trace: PipelineTrace }) {
  const a = trace.response.answers;
  const dept = a.department as ChoiceAnswer | undefined;
  const refund = a.refundRequested as NoulAnswer | undefined;
  const frus = a.frustration as ScoreAnswer | undefined;
  const accent = trace.provider === "jev" ? "var(--violet)" : "var(--text-2)";

  return (
    <article className="compare-arm" style={{ ["--arm-accent" as string]: accent }}>
      <header className="compare-arm-head">
        <div>
          <div className="compare-arm-title">{LABEL[trace.provider] ?? trace.provider}</div>
          <div className="small muted">{KIND[trace.provider] ?? trace.response.provider} · <code>{trace.response.model}</code></div>
        </div>
        <RouteBadge route={trace.outcome.route as Route} />
      </header>

      <div className="compare-metrics">
        <Metric k="Latency" v={`${Math.round(trace.response.latencyMs)} ms`} emphasize />
        <Metric k="Tokens" v={tokensOf(trace)} />
        <Metric k="Est. cost" v={usd(trace.response.estimatedCostUsd)} emphasize />
        <Metric k="Confidence" v={trace.outcome.confidence.toFixed(2)} />
      </div>

      {dept && (
        <div>
          <div className="section-label">Department <span className="badge owner-model owner">choice</span></div>
          <DecisionBars answer={dept} compact />
        </div>
      )}
      {refund && (
        <div>
          <div className="section-label">Refund requested <span className="badge owner-model owner">noul</span></div>
          <DecisionBars answer={refund} name="P(yes)" compact />
        </div>
      )}
      {frus && (
        <div>
          <div className="section-label">Frustration <span className="badge owner-model owner">score</span></div>
          <DecisionBars answer={frus} headline={`E = ${frus.score.toFixed(2)}`} compact />
        </div>
      )}

      {trace.response.warnings && trace.response.warnings.length > 0 && (
        <div className="small muted">
          {trace.response.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      <details className="inspect">
        <summary>Raw response</summary>
        <pre>{JSON.stringify(trace.response.raw, null, 2)}</pre>
      </details>
    </article>
  );
}

function Metric({ k, v, emphasize }: { k: string; v: string; emphasize?: boolean }) {
  return (
    <div className={`compare-metric ${emphasize ? "emphasize" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
