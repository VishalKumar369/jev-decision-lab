"use client";

/**
 * Support compare — one screen: ticket in, Jev / Claude / Gemini out.
 * No example browser, no teaching chrome, no session table.
 */

import { useCallback, useState } from "react";
import type { ChoiceAnswer, CompareRunResult, NoulAnswer, PipelineTrace, ProviderName, ScoreAnswer, SupportTicket } from "@/lib/types";
import { DecisionBars } from "./DecisionBars";
import { RouteBadge } from "./RouteBadge";

const BLANK: SupportTicket = {
  id: "live",
  subject: "",
  body: "",
  customer: { tier: "pro", accountAgeDays: 180, refundEligible: true },
};

const LABEL: Partial<Record<ProviderName, string>> = {
  jev: "Jev",
  "openrouter-claude": "Claude",
  "openrouter-gemini": "Gemini",
};

function formatCostUsd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0.000000";
  // Always fixed decimals so Jev ($0.000026) is comparable to Claude ($0.001520).
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function preferredOrder(name: ProviderName): number {
  const order: ProviderName[] = ["jev", "openrouter-claude", "openrouter-gemini"];
  const i = order.indexOf(name);
  return i === -1 ? 99 : i;
}

export function SupportCompare() {
  const [ticket, setTicket] = useState<SupportTicket>(BLANK);
  const [compare, setCompare] = useState<CompareRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = ticket.subject.trim().length > 0 || ticket.body.trim().length > 0;

  const run = useCallback(async () => {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    try {
      const example: SupportTicket = {
        ...ticket,
        id: ticket.id || "live",
        subject: ticket.subject.trim() || "(no subject)",
        body: ticket.body.trim(),
      };
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment: "support", example, compare: true }),
      });
      const d = (await r.json()) as { compare?: CompareRunResult; error?: string };
      if (!r.ok || !d.compare) throw new Error(d.error ?? `HTTP ${r.status}`);
      setCompare(d.compare);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [ticket, canRun]);

  const traces = compare
    ? [...compare.traces].sort((a, b) => preferredOrder(a.provider) - preferredOrder(b.provider))
    : [];

  return (
    <div className="support-screen">
      <header className="support-top">
        <h1>Support Pipeline</h1>
        <button className="primary" onClick={run} disabled={busy || !canRun}>
          {busy ? "Running…" : "Run ▶"}
        </button>
      </header>

      <div className="support-layout">
        <section className="panel support-input">
          <label className="field">
            <span>Subject</span>
            <input
              type="text"
              value={ticket.subject}
              placeholder="e.g. Charged twice this month"
              onChange={(e) => setTicket((t) => ({ ...t, subject: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
              }}
            />
          </label>
          <label className="field support-body-field">
            <span>Ticket</span>
            <textarea
              className="big"
              value={ticket.body}
              placeholder="Paste the customer message…"
              onChange={(e) => setTicket((t) => ({ ...t, body: e.target.value }))}
            />
          </label>
          {error && <div className="error">✗ {error}</div>}
        </section>

        <section className="panel support-results">
          {compare?.errors && compare.errors.length > 0 && (
            <div className="error support-errors">
              {compare.errors.map((e) => (
                <div key={e.provider}>✗ {LABEL[e.provider] ?? e.provider}: {e.error}</div>
              ))}
            </div>
          )}

          {traces.length > 0 ? (
            <div className="support-arms">
              {traces.map((t) => (
                <ArmCard key={t.provider} trace={t} />
              ))}
            </div>
          ) : (
            <div className="support-empty">
              {busy ? "Waiting for Jev, Claude, and Gemini…" : "Enter a ticket and run."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ArmCard({ trace }: { trace: PipelineTrace }) {
  const a = trace.response.answers;
  const dept = a.department as ChoiceAnswer | undefined;
  const refund = a.refundRequested as NoulAnswer | undefined;
  const frus = a.frustration as ScoreAnswer | undefined;
  const u = trace.response.usage;
  const accent = trace.provider === "jev" ? "var(--violet)" : "var(--cyan)";

  return (
    <article className="support-arm" style={{ ["--arm-accent" as string]: accent }}>
      <header className="support-arm-head">
        <div>
          <div className="support-arm-name">{LABEL[trace.provider] ?? trace.provider}</div>
          <div className="support-arm-model mono">{trace.response.model}</div>
        </div>
        <RouteBadge route={trace.outcome.route} />
      </header>

      <div className="support-arm-stats">
        <div>
          <span className="k">Latency</span>
          <span className="v">{Math.round(trace.response.latencyMs)} ms</span>
        </div>
        <div>
          <span className="k">Est. cost</span>
          <span className="v cost">{formatCostUsd(trace.response.estimatedCostUsd)}</span>
        </div>
        <div title="Tokens sent to the model (prompt / state + questions)">
          <span className="k">Tokens in</span>
          <span className="v mono">{u ? u.input_tokens.toLocaleString() : "n/a"}</span>
        </div>
        <div title="Tokens the model generated (JSON answers)">
          <span className="k">Tokens out</span>
          <span className="v mono">{u ? u.output_tokens.toLocaleString() : "n/a"}</span>
        </div>
      </div>

      {dept && (
        <div className="support-arm-block">
          <div className="support-arm-label">Department</div>
          <DecisionBars answer={dept} compact />
        </div>
      )}
      {refund && (
        <div className="support-arm-block">
          <div className="support-arm-label">Refund · {Math.round(refund.noul * 100)}%</div>
          <DecisionBars answer={refund} compact />
        </div>
      )}
      {frus && (
        <div className="support-arm-block">
          <div className="support-arm-label">Frustration · E={frus.score.toFixed(1)}</div>
          <DecisionBars answer={frus} compact />
        </div>
      )}
    </article>
  );
}
