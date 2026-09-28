"use client";

/**
 * components/CalibrationLab.tsx — Experiment 4
 * Reads results/ (CLI benchmarks + UI runs), buckets predictions by confidence
 * and compares predicted probability with empirical accuracy. Minimal on purpose:
 * one stat row, one reliability chart, two compact tables.
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

type Experiment = "support" | "agent-firewall" | "model-router";

export function CalibrationLab() {
  const [data, setData] = useState<Payload | null>(null);
  const [bins, setBins] = useState(10);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("mock");
  const [experiment, setExperiment] = useState<Experiment>("support");
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
      setMsg(`Ran ${d.n} examples → ${d.file}${d.errors?.length ? ` (${d.errors.length} errors)` : ""}`);
      load();
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [experiment, provider, load]);

  const groups = view === "provider" ? data?.reports ?? [] : data?.detailed ?? [];
  const primary = data?.reports[0];
  const totalLabelled = data?.reports.reduce((a, r) => a + r.calibration.n, 0) ?? 0;
  const weighted = (pick: (r: Payload["reports"][number]) => number | null) => {
    if (!data || !totalLabelled) return null;
    let acc = 0;
    for (const r of data.reports) {
      const v = pick(r);
      if (v !== null) acc += v * r.calibration.n;
    }
    return acc / totalLabelled;
  };
  const ece = weighted((r) => r.calibration.ece);
  const brier = weighted((r) => r.calibration.brier);
  const accuracy = weighted((r) => r.summary.accuracy);

  const controls = (
    <div className="row" style={{ gap: 8 }}>
      <select value={experiment} onChange={(e) => setExperiment(e.target.value as Experiment)}>
        <option value="support">support-tickets</option>
        <option value="agent-firewall">agent-actions</option>
        <option value="model-router">routing-prompts</option>
      </select>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        {providers.map((p) => (
          <option key={p.name} value={p.name} disabled={!p.configured || !p.enabled}>
            {p.label}{!p.configured ? " — no key" : ""}
          </option>
        ))}
      </select>
      <button className="primary" onClick={runBatch} disabled={busy}>{busy ? "Running…" : "Run dataset"}</button>
    </div>
  );

  return (
    <div>
      <header className="page-head">
        <h1>Calibration Lab</h1>
        <p>Does 0.8 mean 80%? Bucket every recorded prediction by confidence and compare with actual accuracy.</p>
      </header>

      {data && data.total === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <h3>No calibration run yet</h3>
            <p>Run the dataset to compare predicted confidence with actual accuracy. The mock provider works offline.</p>
            <div style={{ marginTop: 8 }}>{controls}</div>
            {msg && <div className="small text-2" style={{ marginTop: 8 }}>{msg}</div>}
          </div>
        </section>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <section className="panel">
            <div className="panel-head">
              {controls}
              <div className="row" style={{ gap: 8 }}>
                <span className="small muted">bins</span>
                <input type="number" min={2} max={20} value={bins} onChange={(e) => setBins(Number(e.target.value))} style={{ width: 60 }} />
                <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
                  <option value="provider">by provider</option>
                  <option value="detailed">provider × experiment</option>
                </select>
                <button className="ghost" onClick={load}>Refresh</button>
              </div>
            </div>
            {msg && <div className="small text-2" style={{ padding: "8px 16px 0" }}>{msg}</div>}
            <div className="grid-4" style={{ padding: 16 }}>
              <Stat k="ECE" v={fmt(ece, 3)} hint="expected calibration error" />
              <Stat k="Brier" v={fmt(brier, 3)} />
              <Stat k="Accuracy" v={accuracy === null ? "n/a" : `${Math.round(accuracy * 100)}%`} />
              <Stat k="Confident wrong" v={String(data?.confidentWrong.length ?? 0)} hint="conf ≥ 0.8, wrong" accent={data?.confidentWrong.length ? "var(--red)" : undefined} />
            </div>
            {primary && data && data.reports.length > 1 && <div className="small muted" style={{ padding: "0 16px 12px" }}>Top row is weighted across {data.reports.length} providers; per-group values below.</div>}
          </section>

          <div className="cal-grid">
            <section className="panel">
              <div className="panel-head"><h3>Reliability</h3><span className="small muted">predicted confidence vs actual accuracy</span></div>
              <div style={{ padding: 16 }}>
                <ReliabilityDiagram reports={groups} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h3>Per group</h3></div>
              <div style={{ overflow: "auto" }}>
                <table className="data">
                  <thead>
                    <tr><th>group</th><th>n</th><th>acc</th><th>acc@auto</th><th>auto%</th><th>ECE</th><th>MCE</th><th>Brier</th><th>p50 ms</th><th>$ / 1k</th></tr>
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
              </div>
              <details className="inspect" style={{ padding: "10px 16px 14px" }}>
                <summary>Bucket table</summary>
                <table className="data">
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
                          <td className="num" style={{ color: b.gap > 0.15 ? "var(--red)" : undefined }}>{b.gap.toFixed(3)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </details>
            </section>
          </div>

          {data && (
            <div className="cal-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <section className="panel">
                <div className="panel-head"><h3>Confident &amp; wrong</h3><span className="small muted">conf ≥ 0.8 · decision ≠ label</span></div>
                {data.confidentWrong.length ? <RowsTable rows={data.confidentWrong} /> : <div className="result-empty" style={{ padding: 24 }}>None recorded.</div>}
              </section>
              <section className="panel">
                <div className="panel-head"><h3>Ambiguous / near ties</h3><span className="small muted">flagged or top-two margin &lt; 0.2</span></div>
                {data.ambiguous.length ? <RowsTable rows={data.ambiguous} /> : <div className="result-empty" style={{ padding: 24 }}>None recorded.</div>}
              </section>
            </div>
          )}

          {data && data.files.length > 0 && (
            <details className="inspect">
              <summary>{data.files.length} result files · {data.total} rows</summary>
              <ul className="small mono muted">
                {data.files.map((f) => <li key={f.name}>{f.name} — {f.n} rows</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, hint, accent }: { k: string; v: string; hint?: string; accent?: string }) {
  return (
    <div className="stat hero">
      <div className="k">{k}</div>
      <div className="v" style={accent ? { color: accent } : undefined}>{v}</div>
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

function RowsTable({ rows }: { rows: MetricRecord[] }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 340 }}>
      <table className="data">
        <thead>
          <tr><th>example</th><th>provider</th><th>question</th><th>decision</th><th>expected</th><th>conf</th><th>route</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} title={Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).map(([k, p]) => `${k}: ${p.toFixed(2)}`).join("\n")}>
              <td className="mono">{r.exampleId}</td>
              <td>{r.provider}</td>
              <td>{r.question}</td>
              <td>{r.decision}</td>
              <td>{r.expected ?? "—"}</td>
              <td className="num">{r.confidence.toFixed(2)}</td>
              <td>{r.route ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pct(n: number | null): string {
  return n === null ? "n/a" : `${Math.round(n * 100)}%`;
}
function fmt(n: number | null, d: number): string {
  return n === null ? "n/a" : n.toFixed(d);
}
