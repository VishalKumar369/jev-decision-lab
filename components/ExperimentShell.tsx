"use client";

/**
 * components/ExperimentShell.tsx
 *
 * The shared interactive frame for experiments 1–3:
 *
 *   [provider picker] [example list with ambiguity badges] [editable JSON state]
 *                     ↓ Run
 *   [pipeline view]  [metrics strip]  [raw provider response]  [session log]
 *
 * The example editor is deliberately raw JSON: students should see the exact
 * object the pipeline consumes, edit a word, and watch the probabilities move.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PipelineTrace, ProviderInfo } from "@/lib/types";
import { MetricsStrip } from "./MetricsStrip";
import { PipelineView } from "./PipelineView";
import { RouteBadge } from "./RouteBadge";

type Experiment = "support" | "agent-firewall" | "model-router";

interface Props {
  experiment: Experiment;
  title: string;
  intro: React.ReactNode;
}

/** Short label for an example row. Lives here (not in the page) because functions can't cross the server→client boundary. */
const LABEL_OF: Record<Experiment, (ex: Record<string, unknown>) => string> = {
  support: (ex) => String(ex.subject),
  "agent-firewall": (ex) => `${(ex.proposed as { tool: string }).tool} — ${String(ex.goal).slice(0, 60)}`,
  "model-router": (ex) => String(ex.prompt).slice(0, 70),
};

export function ExperimentShell({ experiment, title, intro }: Props) {
  const labelOf = LABEL_OF[experiment];
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<string>("mock");
  const [examples, setExamples] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [trace, setTrace] = useState<PipelineTrace | null>(null);
  const [log, setLog] = useState<PipelineTrace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d: { providers: ProviderInfo[]; defaultProvider: string }) => {
        setProviders(d.providers);
        setProvider(d.defaultProvider);
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
      setError("example is not valid JSON");
      setBusy(false);
      return;
    }
    try {
      const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experiment, provider, example }) });
      const d = (await r.json()) as { trace?: PipelineTrace; error?: string };
      if (!r.ok || !d.trace) throw new Error(d.error ?? `HTTP ${r.status}`);
      setTrace(d.trace);
      setLog((l) => [d.trace!, ...l].slice(0, 50));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [draft, experiment, provider]);

  const providerInfo = useMemo(() => providers.find((p) => p.name === provider), [providers, provider]);
  const sessionStats = useMemo(() => {
    const labelled = log.filter((t) => t.outcome.correct !== null);
    const byRoute: Record<string, number> = {};
    for (const t of log) byRoute[t.outcome.route] = (byRoute[t.outcome.route] ?? 0) + 1;
    return {
      n: log.length,
      acc: labelled.length ? labelled.filter((t) => t.outcome.correct).length / labelled.length : null,
      p50: median(log.map((t) => t.response.latencyMs)),
      cost: log.reduce((a, t) => a + (t.response.estimatedCostUsd ?? 0), 0),
      byRoute,
    };
  }, [log]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1>{title}</h1>
        <div className="ink2" style={{ maxWidth: 900 }}>{intro}</div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: "minmax(240px, 300px) 1fr" }}>
        {/* ---- left: examples ---- */}
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Labelled examples</h3>
            <span className="small muted">{examples.length}</span>
          </div>
          <div className="examples">
            {examples.map((ex) => (
              <button key={ex.id as string} className={`example ${selectedId === ex.id ? "selected" : ""}`} onClick={() => select(ex.id as string)}>
                <span className="id">{ex.id as string}</span>
                <span className="t">{labelOf(ex)}</span>
                {ex.ambiguous ? <span className="badge ambiguous" title={(ex.notes as string) ?? "annotators disagreed"}>?</span> : null}
              </button>
            ))}
          </div>
        </div>

        {/* ---- right: editor + run ---- */}
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <label>
                provider{" "}
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {providers.map((p) => (
                    <option key={p.name} value={p.name} disabled={!p.configured || !p.enabled}>
                      {p.label}
                      {!p.configured ? " — no key" : !p.enabled ? " — disabled" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {providerInfo && (
                <span className="small muted">
                  {providerInfo.kind} · {providerInfo.model}
                </span>
              )}
            </div>
            <button onClick={run} disabled={busy}>
              {busy ? "running…" : "Run pipeline ▶"}
            </button>
          </div>
          {providerInfo && <div className="small ink2">{providerInfo.description}</div>}
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="example JSON" />
          <div className="small muted">
            Edit anything and re-run. The <code>labels</code> block is ground truth and is never sent to the model — compare it against the decision afterwards.
          </div>
          {error && <div className="error">✗ {error}</div>}
        </div>
      </div>

      {trace && (
        <section className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Pipeline trace · {trace.exampleId}</h2>
            <RouteBadge route={trace.outcome.route} />
          </div>
          <PipelineView trace={trace} />
          <MetricsStrip trace={trace} />
          <details className="card">
            <summary>raw provider response (unmodified wire payload)</summary>
            <pre className="small">{JSON.stringify(trace.response.raw, null, 2)}</pre>
          </details>
        </section>
      )}

      {log.length > 0 && (
        <section className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>This session</h3>
            <span className="small muted">
              {sessionStats.n} runs · accuracy {sessionStats.acc === null ? "n/a" : `${(sessionStats.acc * 100).toFixed(0)}%`} · p50 {sessionStats.p50.toFixed(0)} ms · est. ${sessionStats.cost.toFixed(5)}
              {" · "}
              {Object.entries(sessionStats.byRoute).map(([r, n]) => `${r}:${n}`).join(" ")}
            </span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>example</th>
                <th>provider</th>
                <th>decision</th>
                <th>expected</th>
                <th>conf</th>
                <th>route</th>
                <th>ms</th>
                <th>cost</th>
              </tr>
            </thead>
            <tbody>
              {log.map((t, i) => (
                <tr key={i} onClick={() => setTrace(t)} style={{ cursor: "pointer" }}>
                  <td className="mono">{t.exampleId}</td>
                  <td>{t.provider}</td>
                  <td>{t.outcome.decision}</td>
                  <td>
                    {t.outcome.expected ?? "—"} {t.outcome.correct === null ? "" : t.outcome.correct ? "✓" : "✗"}
                  </td>
                  <td className="num">{t.outcome.confidence.toFixed(2)}</td>
                  <td><RouteBadge route={t.outcome.route} /></td>
                  <td className="num">{t.response.latencyMs.toFixed(0)}</td>
                  <td className="num">{t.response.estimatedCostUsd === null ? "n/a" : t.response.estimatedCostUsd.toExponential(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
