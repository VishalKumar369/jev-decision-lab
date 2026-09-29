"use client";

/**
 * components/ExperimentShell.tsx
 * The lab workspace shared by experiments 1–3:
 *
 *   | Examples | Input / Config | Decision result |
 *
 * Support runs a parallel compare (Jev + Claude + Gemini) by default.
 * Other experiments still pick a single provider.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompareRunResult, PipelineTrace, ProviderInfo } from "@/lib/types";
import { CompareResultPanel } from "./CompareResultPanel";
import { InputPanel } from "./InputPanel";
import { ResultPanel } from "./ResultPanel";
import { RouteBadge } from "./RouteBadge";

type Experiment = "support" | "agent-firewall" | "model-router";

interface Props {
  experiment: Experiment;
  title: string;
  subtitle: string;
  hint?: React.ReactNode;
}

const LABEL_OF: Record<Experiment, (ex: Record<string, unknown>) => string> = {
  support: (ex) => String(ex.subject),
  "agent-firewall": (ex) => `${(ex.proposed as { tool: string }).tool} · ${String(ex.goal)}`,
  "model-router": (ex) => String(ex.prompt),
};

/** Prefer configured Jev when available so the lab does not silently start on mock. */
function resolveInitialProvider(providers: ProviderInfo[], serverDefault: string): string {
  const usable = (p: ProviderInfo | undefined) => p && p.configured && p.enabled;
  const jev = providers.find((p) => p.name === "jev");
  if (usable(jev)) return "jev";
  const fromServer = providers.find((p) => p.name === serverDefault);
  if (usable(fromServer)) return serverDefault;
  const first = providers.find((p) => usable(p));
  return first?.name ?? serverDefault;
}

export function ExperimentShell({ experiment, title, subtitle, hint }: Props) {
  const labelOf = LABEL_OF[experiment];
  const isSupport = experiment === "support";
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [compareArms, setCompareArms] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("jev");
  const [examples, setExamples] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [trace, setTrace] = useState<PipelineTrace | null>(null);
  const [compare, setCompare] = useState<CompareRunResult | null>(null);
  const [log, setLog] = useState<PipelineTrace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d: { providers: ProviderInfo[]; defaultProvider: string; supportCompare?: ProviderInfo[] }) => {
        setProviders(d.providers);
        setProvider(resolveInitialProvider(d.providers, d.defaultProvider));
        setCompareArms(d.supportCompare ?? []);
      })
      .catch(() => setError("could not load providers"));
    fetch(`/api/examples/${experiment}`)
      .then((r) => r.json())
      .then((d: { examples: Record<string, unknown>[] }) => {
        setExamples(d.examples);
        if (d.examples[0]) {
          setSelectedId(d.examples[0].id as string);
          setDraft(JSON.stringify(d.examples[0], null, 2));
        }
      })
      .catch(() => setError("could not load dataset"));
  }, [experiment]);

  const select = useCallback(
    (id: string) => {
      const ex = examples.find((e) => e.id === id);
      if (!ex) return;
      setSelectedId(id);
      setDraft(JSON.stringify(ex, null, 2));
      setTrace(null);
      setCompare(null);
      setError(null);
    },
    [examples],
  );

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    let example: unknown;
    try {
      example = JSON.parse(draft);
    } catch {
      setError("input is not valid JSON");
      setBusy(false);
      return;
    }
    try {
      const payload = isSupport
        ? { experiment, example, compare: true }
        : { experiment, provider, example, compare: false };
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as { trace?: PipelineTrace; compare?: CompareRunResult; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);

      if (d.compare) {
        setCompare(d.compare);
        setTrace(null);
        setLog((l) => [...d.compare!.traces, ...l].slice(0, 50));
      } else if (d.trace) {
        setTrace(d.trace);
        setCompare(null);
        setLog((l) => [d.trace!, ...l].slice(0, 50));
      } else {
        throw new Error(d.error ?? "empty response");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [draft, experiment, provider, isSupport]);

  const providerInfo = useMemo(() => providers.find((p) => p.name === provider), [providers, provider]);
  const usingMock = !isSupport && provider === "mock";

  return (
    <div>
      <header className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {hint && <div className="small muted" style={{ maxWidth: 420, textAlign: "right" }}>{hint}</div>}
      </header>

      <div className={`workspace ${isSupport ? "workspace-compare" : ""}`}>
        {/* ---- Examples ---- */}
        <section className="panel">
          <div className="panel-head">
            <h3>Examples</h3>
            <span className="small muted">{examples.length}</span>
          </div>
          <div className="examples">
            {examples.map((ex) => (
              <button key={ex.id as string} className={`example ${selectedId === ex.id ? "selected" : ""}`} onClick={() => select(ex.id as string)} title={labelOf(ex)}>
                <span className="id">{ex.id as string}</span>
                <span className="t">{labelOf(ex)}</span>
                {ex.ambiguous ? <span className="amb" title={(ex.notes as string) ?? "annotators disagreed"}>?</span> : <span />}
              </button>
            ))}
          </div>
        </section>

        {/* ---- Input ---- */}
        <section className="panel">
          <div className="panel-head panel-head-run">
            {isSupport ? (
              <div className="compare-arms">
                <span className="eyebrow">Compare in parallel</span>
                <div className="q-chips">
                  {(compareArms.length ? compareArms : [{ name: "jev", label: "TypeSafe Jev", model: "…" } as ProviderInfo]).map((p) => (
                    <span key={p.name} className={`q-chip ${p.name === "jev" ? "model" : "llm"}`}>
                      {p.name === "jev" ? "Jev" : p.name === "openrouter-claude" ? "Claude" : p.name === "openrouter-gemini" ? "Gemini" : p.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <label className="judge-with">
                <span>Judge with</span>
                <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Judge with">
                  {providers.map((p) => (
                    <option key={p.name} value={p.name} disabled={!p.configured || !p.enabled}>
                      {p.label}{!p.configured ? " — no key" : !p.enabled ? " — disabled" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="primary" onClick={run} disabled={busy || !draft}>
              {busy ? (isSupport ? "Comparing…" : "Running…") : isSupport ? "Run compare ▶" : "Run ▶"}
            </button>
          </div>
          {usingMock && (
            <div className="provider-banner mock">
              Mock heuristic — keyword rules with noise, <b>not a model</b>. Switch to TypeSafe Jev for real probabilities.
            </div>
          )}
          {isSupport && (
            <div className="small muted provider-blurb">
              Same ticket → Jev (direct) + Claude + Gemini (OpenRouter), in parallel. Code still owns the confidence gate and refund policy on each arm.
            </div>
          )}
          {!isSupport && providerInfo && !usingMock && (
            <div className="small muted provider-blurb">
              {providerInfo.kind} · <code>{providerInfo.model}</code> — {providerInfo.description}
            </div>
          )}
          <InputPanel experiment={experiment} draft={draft} onDraft={setDraft} />
          {error && <div className="error" style={{ padding: "0 16px 14px" }}>✗ {error}</div>}
        </section>

        {/* ---- Result ---- */}
        <section className="panel result-col">
          <div className="panel-head">
            <h3>{isSupport ? "Compare result" : "Decision result"}</h3>
            {compare && (
              <span className="small muted mono">{compare.exampleId} · {compare.traces.length} arms</span>
            )}
            {trace && (
              <span className="row" style={{ gap: 8 }}>
                <span className="small muted mono">{trace.exampleId} · {trace.provider}</span>
                <RouteBadge route={trace.outcome.route} />
              </span>
            )}
          </div>
          {compare ? (
            <CompareResultPanel compare={compare} />
          ) : trace ? (
            <ResultPanel trace={trace} />
          ) : (
            <div className="result-empty">
              {isSupport
                ? "Pick a ticket and run compare — Jev, Claude, and Gemini answer the same questions."
                : "Select an example and run — judgments first, then code decides the route."}
            </div>
          )}
        </section>
      </div>

      {log.length > 1 && (
        <section className="panel session">
          <div className="panel-head">
            <h3>This session</h3>
            <span className="small muted">{log.length} runs · {sessionSummary(log)}</span>
          </div>
          <table className="data">
            <thead>
              <tr><th>example</th><th>provider</th><th>decision</th><th>expected</th><th>conf</th><th>route</th><th>ms</th><th>cost</th></tr>
            </thead>
            <tbody>
              {log.map((t, i) => (
                <tr
                  key={i}
                  onClick={() => {
                    setTrace(t);
                    setCompare(null);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <td className="mono">{t.exampleId}</td>
                  <td>{t.provider}</td>
                  <td>{t.outcome.decision}</td>
                  <td>{t.outcome.expected ?? "—"} {t.outcome.correct === null ? "" : t.outcome.correct ? "✓" : "✗"}</td>
                  <td className="num">{t.outcome.confidence.toFixed(2)}</td>
                  <td><RouteBadge route={t.outcome.route} /></td>
                  <td className="num">{t.response.latencyMs.toFixed(0)}</td>
                  <td className="num">{t.response.estimatedCostUsd === null ? "n/a" : `$${t.response.estimatedCostUsd.toFixed(5)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function sessionSummary(log: PipelineTrace[]): string {
  const labelled = log.filter((t) => t.outcome.correct !== null);
  const acc = labelled.length ? Math.round((labelled.filter((t) => t.outcome.correct).length / labelled.length) * 100) : null;
  const lat = [...log.map((t) => t.response.latencyMs)].sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0;
  return `accuracy ${acc === null ? "n/a" : `${acc}%`} · p50 ${p50.toFixed(0)} ms`;
}
