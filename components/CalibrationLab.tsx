"use client";

/**
 * components/CalibrationLab.tsx — Experiment 4
 *
 * Reads everything in results/ (CLI benchmarks + every UI click), buckets by
 * confidence, and answers: when the provider said 0.8, was it right 80% of the
 * time? It also lists the two kinds of rows that should worry you most:
 *   - confident and wrong  (the automation risk)
 *   - ambiguous / near-tie (the cases you should NOT automate)
 */

import { useCallback, useEffect, useState } from "react";
import type { CalibrationReport, Summary } from "@/lib/metrics";
import type { MetricRecord, ProviderInfo } from "@/lib/types";
import { ReliabilityDiagram } from "./ReliabilityDiagram";

interface Payload {
  files: { name: string; n: number; provider: string; experiment: string; createdAt: string }[];
  total: number;
  reports: { group: string; provider: string; summary: Summary; calibration: CalibrationReport }[];
  detailed: { group: string; summary: Summary; calibration: CalibrationReport }[];
  confidentWrong: MetricRecord[];
  ambiguous: MetricRecord[];
}

export function CalibrationLab() {
  const [data, setData] = useState<Payload | null>(null);
  const [bins, setBins] = useState(10);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("mock");
  const [experiment, setExperiment] = useState<"support" | "agent-firewall" | "model-router">("support");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<"provider" | "detailed">("provider");

  const load = useCallback(() => {
    fetch(`/api/results?bins=${bins}`).then((r) => r.json()).then(setData).catch(() => setMsg("could not load results"));
  }, [bins]);

  useEffect(() => {
    load();
    fetch("/api/providers").then((r) => r.json()).then((d: { providers: ProviderInfo[]; defaultProvider: string }) => {
      setProviders(d.providers);
      setProvider(d.defaultProvider);
    });
  }, [load]);

  const runBatch = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/run-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experiment, provider }) });
      const d = (await r.json()) as { file?: string; n?: number; error?: string; errors?: unknown[] };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMsg(`ran ${d.n} examples → ${d.file}${d.errors?.length ? ` (${d.errors.length} errors)` : ""}`);
      load();
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [experiment, provider, load]);

  const groups = view === "provider" ? data?.reports ?? [] : data?.detailed ?? [];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1>4 · Calibration Lab</h1>
        <p className="ink2" style={{ maxWidth: 900 }}>
          A confidence gate is only legitimate if the confidence number means something. <strong>Calibration</strong> is that property: across all the times a provider says
          0.8, it should be right about 80% of the time. This page buckets every labelled prediction recorded in <code>results/</code> and compares predicted probability with
          empirical accuracy. Expected Calibration Error (ECE) is the size-weighted mean gap; Brier is the mean squared error of the chosen answer’s probability.
        </p>
      </header>

      <div className="card row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <label>
            run dataset{" "}
            <select value={experiment} onChange={(e) => setExperiment(e.target.value as typeof experiment)}>
              <option value="support">support-tickets</option>
              <option value="agent-firewall">agent-actions</option>
              <option value="model-router">routing-prompts</option>
            </select>
          </label>
          <label>
            with{" "}
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.name} value={p.name} disabled={!p.configured || !p.enabled}>
                  {p.label}{!p.configured ? " — no key" : ""}
                </option>
              ))}
            </select>
          </label>
          <button onClick={runBatch} disabled={busy}>{busy ? "running…" : "Run whole dataset ▶"}</button>
        </div>
        <div className="row">
          <label>
            bins{" "}
            <input type="number" min={2} max={20} value={bins} onChange={(e) => setBins(Number(e.target.value))} style={{ width: 64 }} />
          </label>
          <label>
            group by{" "}
            <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
              <option value="provider">provider</option>
              <option value="detailed">provider × experiment</option>
            </select>
          </label>
          <button className="secondary" onClick={load}>refresh</button>
        </div>
      </div>
      {msg && <div className="small ink2">{msg}</div>}

      {data && data.total === 0 && (
        <div className="callout code">
          No results yet. Click “Run whole dataset” above (the mock provider works offline), or run <span className="kbd">npm run bench</span> in a terminal.
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: "minmax(320px, 520px) 1fr" }}>
          <div className="card">
            <h3>Reliability diagram</h3>
            <ReliabilityDiagram reports={groups} />
            <p className="small muted" style={{ marginTop: 8 }}>
              Marker size ∝ bucket count. Below the diagonal = over-confident (dangerous for automation); above = under-confident (wasted escalations).
            </p>
          </div>
          <div className="card stack">
            <h3>Per-group summary</h3>
            <table className="data">
              <thead>
                <tr>
                  <th>group</th><th>n</th><th>acc</th><th>acc@auto</th><th>auto%</th><th>ECE</th><th>MCE</th><th>Brier</th><th>p50 ms</th><th>$ / 1k</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.group}>
                    <td>{g.group}</td>
                    <td className="num">{g.calibration.n}</td>
                    <td className="num">{pct(g.summary.accuracy)}</td>
                    <td className="num">{pct(g.summary.autoAccuracy)}</td>
                    <td className="num">{pct(g.summary.autoRate)}</td>
                    <td className="num">{g.calibration.ece.toFixed(3)}</td>
                    <td className="num">{g.calibration.mce.toFixed(3)}</td>
                    <td className="num">{g.calibration.brier.toFixed(3)}</td>
                    <td className="num">{g.summary.latency.p50}</td>
                    <td className="num">{g.summary.costPerThousandDecisionsUsd === null ? "n/a" : g.summary.costPerThousandDecisionsUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details>
              <summary>bucket table</summary>
              <table className="data small">
                <thead><tr><th>group</th><th>bucket</th><th>n</th><th>mean conf</th><th>accuracy</th><th>gap</th></tr></thead>
                <tbody>
                  {groups.flatMap((g) =>
                    g.calibration.buckets.filter((b) => b.n > 0).map((b) => (
                      <tr key={`${g.group}-${b.lo}`}>
                        <td>{g.group}</td>
                        <td className="mono">{b.lo.toFixed(2)}–{b.hi.toFixed(2)}</td>
                        <td className="num">{b.n}</td>
                        <td className="num">{b.meanConfidence.toFixed(3)}</td>
                        <td className="num">{b.empiricalAccuracy.toFixed(3)}</td>
                        <td className="num" style={{ color: b.gap > 0.15 ? "var(--route-blocked)" : undefined }}>{b.gap.toFixed(3)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      )}

      {data && data.confidentWrong.length > 0 && (
        <div className="card stack">
          <h3>Confident and wrong <span className="muted small">(confidence ≥ 0.8, decision ≠ label)</span></h3>
          <p className="small ink2">These are the rows a confidence gate would have automated incorrectly. Each one is an argument for a higher threshold, a better question, or a label-set fix.</p>
          <RowsTable rows={data.confidentWrong} />
        </div>
      )}

      {data && data.ambiguous.length > 0 && (
        <div className="card stack">
          <h3>Ambiguous inputs and near-ties <span className="muted small">(dataset-flagged or top-two margin &lt; 0.2)</span></h3>
          <p className="small ink2">Not errors. A spread-out distribution on an input humans also disagreed about is the model doing its job — and exactly what the gate should send to a person.</p>
          <RowsTable rows={data.ambiguous} />
        </div>
      )}

      {data && data.files.length > 0 && (
        <details className="card">
          <summary>{data.files.length} result files · {data.total} rows</summary>
          <ul className="small mono">
            {data.files.map((f) => (
              <li key={f.name}>{f.name} — {f.n} rows</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RowsTable({ rows }: { rows: MetricRecord[] }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 420 }}>
      <table className="data small">
        <thead>
          <tr><th>experiment</th><th>example</th><th>provider</th><th>question</th><th>decision</th><th>expected</th><th>conf</th><th>distribution</th><th>route</th><th>flags</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.experiment}</td>
              <td className="mono">{r.exampleId}</td>
              <td>{r.provider}</td>
              <td>{r.question}</td>
              <td>{r.decision}</td>
              <td>{r.expected ?? "—"}</td>
              <td className="num">{r.confidence.toFixed(2)}</td>
              <td className="mono" style={{ whiteSpace: "nowrap" }}>
                {Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).map(([k, p]) => `${k}:${p.toFixed(2)}`).join(" ")}
              </td>
              <td>{r.route ?? "—"}</td>
              <td className="muted">{r.flags.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pct(n: number | null): string {
  return n === null ? "n/a" : `${(n * 100).toFixed(0)}%`;
}
