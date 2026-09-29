"use client";

/**
 * Support Pipeline — matches the lab compare layout:
 *   left: ticket input
 *   top: compact Jev / Claude / Gemini summary cards
 *   bottom: Jev probabilities panel (Summary | Probabilities | JSON)
 */

import { useCallback, useMemo, useState } from "react";
import type {
  Answer,
  ChoiceAnswer,
  CompareRunResult,
  NoulAnswer,
  PipelineTrace,
  ProviderName,
  ScoreAnswer,
  SupportTicket,
} from "@/lib/types";
import { DecisionBars, rowsOf } from "./DecisionBars";
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

type DetailTab = "summary" | "probabilities" | "json";

function formatCostUsd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0.000000";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function preferredOrder(name: ProviderName): number {
  const order: ProviderName[] = ["jev", "openrouter-claude", "openrouter-gemini"];
  const i = order.indexOf(name);
  return i === -1 ? 99 : i;
}

function topOf(answer: Answer | undefined): { label: string; p: number } | null {
  if (!answer) return null;
  if (answer.type === "choice") return { label: answer.choice, p: answer.confidence };
  if (answer.type === "noul") {
    const yes = answer.noul >= 0.5;
    return { label: yes ? "Yes" : "No", p: yes ? answer.noul : 1 - answer.noul };
  }
  const rows = rowsOf(answer).sort((a, b) => b.p - a.p);
  const top = rows[0];
  if (!top) return { label: `E=${answer.score.toFixed(1)}`, p: answer.confidence };
  // "1  mildly annoyed" → "Mildly annoyed"
  const bare = top.label.replace(/^\d+\s+/, "").trim();
  const pretty = bare ? bare[0].toUpperCase() + bare.slice(1) : top.label;
  return { label: pretty, p: top.p };
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function SupportCompare() {
  const [ticket, setTicket] = useState<SupportTicket>(BLANK);
  const [compare, setCompare] = useState<CompareRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("probabilities");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const canRun = ticket.body.trim().length > 0;

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
      setTab("probabilities");
      setDetailsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [ticket, canRun]);

  const traces = useMemo(
    () =>
      compare
        ? [...compare.traces].sort((a, b) => preferredOrder(a.provider) - preferredOrder(b.provider))
        : [],
    [compare],
  );

  const jevTrace = traces.find((t) => t.provider === "jev") ?? null;

  return (
    <div className="support-screen">
      <header className="support-top">
        <div>
          <h1>Support Pipeline</h1>
          <p className="support-sub">Compare decisions from the same ticket.</p>
        </div>
      </header>

      <div className="support-layout">
        {/* ---- Ticket input ---- */}
        <section className="panel support-input">
          <h2 className="support-input-title">Ticket input</h2>

          <label className="field">
            <span>
              Subject <em className="optional">optional</em>
            </span>
            <input
              type="text"
              value={ticket.subject}
              placeholder="e.g. Charged twice this month"
              onChange={(e) => setTicket((t) => ({ ...t, subject: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
            />
          </label>

          <label className="field support-body-field">
            <span>Ticket</span>
            <textarea
              className="big"
              value={ticket.body}
              placeholder="Describe the customer problem…"
              onChange={(e) => setTicket((t) => ({ ...t, body: e.target.value }))}
            />
          </label>

          {error && <div className="error">✗ {error}</div>}

          <button className="support-run" onClick={run} disabled={busy || !canRun}>
            {busy ? "Running…" : "▶ Run"}
          </button>
        </section>

        {/* ---- Results: summary cards + Jev detail ---- */}
        <section className="support-results">
          {compare?.errors && compare.errors.length > 0 && (
            <div className="error support-errors">
              {compare.errors.map((e) => (
                <div key={e.provider}>
                  ✗ {LABEL[e.provider] ?? e.provider}: {e.error}
                </div>
              ))}
            </div>
          )}

          {traces.length > 0 ? (
            <>
              <div className="support-summary-grid">
                {traces.map((t) => (
                  <SummaryCard key={t.provider} trace={t} />
                ))}
              </div>

              {jevTrace ? (
                <JevDetailPanel
                  trace={jevTrace}
                  tab={tab}
                  onTab={setTab}
                  detailsOpen={detailsOpen}
                  onToggleDetails={() => setDetailsOpen((o) => !o)}
                />
              ) : (
                <div className="panel support-detail support-empty-detail">
                  Jev did not return a result for this run.
                </div>
              )}
            </>
          ) : (
            <div className="panel support-empty-panel">
              {busy ? "Waiting for Jev, Claude, and Gemini…" : "Enter a ticket and run."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ trace }: { trace: PipelineTrace }) {
  const a = trace.response.answers;
  const dept = topOf(a.department as ChoiceAnswer | undefined);
  const refund = topOf(a.refundRequested as NoulAnswer | undefined);
  const frus = topOf(a.frustration as ScoreAnswer | undefined);

  const arm =
    trace.provider === "openrouter-claude"
      ? "claude"
      : trace.provider === "openrouter-gemini"
        ? "gemini"
        : "jev";

  return (
    <article className={`support-summary panel support-arm-${arm}`} data-provider={trace.provider}>
      <header className="support-summary-head">
        <div>
          <div className="support-arm-name">{LABEL[trace.provider] ?? trace.provider}</div>
          <div className="support-arm-model mono">{trace.response.model}</div>
        </div>
        <RouteBadge route={trace.outcome.route} />
      </header>

      <div className="support-summary-rows">
        {dept && <SummaryRow k="Department" label={cap(dept.label)} p={dept.p} />}
        {refund && <SummaryRow k="Refund" label={refund.label} p={refund.p} />}
        {frus && <SummaryRow k="Frustration" label={frus.label} p={frus.p} />}
      </div>

      <footer className="support-summary-foot">
        <span>
          Latency <b>{Math.round(trace.response.latencyMs)} ms</b>
        </span>
        <span>
          Est. cost <b>{formatCostUsd(trace.response.estimatedCostUsd)}</b>
        </span>
      </footer>
    </article>
  );
}

function SummaryRow({ k, label, p }: { k: string; label: string; p: number }) {
  const pct = Math.round(p * 100);
  return (
    <div className="support-summary-row">
      <div className="support-summary-row-top">
        <span className="k">{k}</span>
        <span className="v">
          {label} <b>{pct}%</b>
        </span>
      </div>
      <span className="track">
        <span className="fill" style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
    </div>
  );
}

function JevDetailPanel({
  trace,
  tab,
  onTab,
  detailsOpen,
  onToggleDetails,
}: {
  trace: PipelineTrace;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const a = trace.response.answers;
  const dept = a.department as ChoiceAnswer | undefined;
  const refund = a.refundRequested as NoulAnswer | undefined;
  const frus = a.frustration as ScoreAnswer | undefined;
  const u = trace.response.usage;

  return (
    <section className="panel support-detail">
      <header className="support-detail-head">
        <h3>Jev probabilities</h3>
        <nav className="support-tabs" aria-label="Jev detail">
          {(
            [
              ["summary", "Summary"],
              ["probabilities", "Probabilities"],
              ["json", "JSON"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`support-tab ${tab === id ? "active" : ""}`}
              onClick={() => onTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="support-detail-body">
        {tab === "summary" && (
          <div className="support-detail-summary">
            <SummaryRow
              k="Department"
              label={cap(dept?.choice ?? "—")}
              p={dept?.confidence ?? 0}
            />
            <SummaryRow
              k="Refund requested"
              label={(refund?.noul ?? 0) >= 0.5 ? "Yes" : "No"}
              p={refund ? (refund.noul >= 0.5 ? refund.noul : 1 - refund.noul) : 0}
            />
            <SummaryRow
              k="Frustration"
              label={topOf(frus)?.label ?? "—"}
              p={topOf(frus)?.p ?? 0}
            />
            <div className="support-detail-meta">
              <span>
                Route <RouteBadge route={trace.outcome.route} />
              </span>
              <span>
                Latency <b>{Math.round(trace.response.latencyMs)} ms</b>
              </span>
              <span>
                Est. cost <b>{formatCostUsd(trace.response.estimatedCostUsd)}</b>
              </span>
            </div>
          </div>
        )}

        {tab === "probabilities" && (
          <div className="support-prob-grid">
            {dept && (
              <div className="support-prob-col">
                <div className="support-arm-label">Department</div>
                <DecisionBars answer={dept} compact />
              </div>
            )}
            {refund && (
              <div className="support-prob-col">
                <div className="support-arm-label">Refund</div>
                <DecisionBars answer={refund} compact />
              </div>
            )}
            {frus && (
              <div className="support-prob-col">
                <div className="support-arm-label">Frustration</div>
                <DecisionBars answer={frus} compact />
              </div>
            )}
          </div>
        )}

        {tab === "json" && (
          <pre className="support-json">{JSON.stringify(trace.response.raw, null, 2)}</pre>
        )}
      </div>

      <details className="support-token-details" open={detailsOpen} onToggle={(e) => {
        const open = (e.target as HTMLDetailsElement).open;
        if (open !== detailsOpen) onToggleDetails();
      }}>
        <summary>Tokens and model details</summary>
        <div className="support-token-grid">
          <div>
            <span className="k">Model</span>
            <span className="v mono">{trace.response.model}</span>
          </div>
          <div>
            <span className="k">Tokens in</span>
            <span className="v mono">{u ? u.input_tokens.toLocaleString() : "n/a"}</span>
          </div>
          <div>
            <span className="k">Tokens out</span>
            <span className="v mono">{u ? u.output_tokens.toLocaleString() : "n/a"}</span>
          </div>
          <div>
            <span className="k">Est. cost</span>
            <span className="v">{formatCostUsd(trace.response.estimatedCostUsd)}</span>
          </div>
          <div>
            <span className="k">Latency</span>
            <span className="v">{Math.round(trace.response.latencyMs)} ms</span>
          </div>
        </div>
      </details>
    </section>
  );
}
