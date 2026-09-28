"use client";

/**
 * components/ResultPanel.tsx
 * Right column. The decision dominates; below it a compact stat row, then the
 * per-experiment teaching sequence that keeps MODEL JUDGMENT visibly separate
 * from DETERMINISTIC POLICY. Everything is read from the PipelineTrace the API
 * already returns — no logic lives here.
 */

import type { Answer, ChoiceAnswer, NoulAnswer, PipelineStage, PipelineTrace, Route, ScoreAnswer } from "@/lib/types";
import { DecisionBars } from "./DecisionBars";
import { RouteBadge } from "./RouteBadge";

type Check = { name: string; passed: boolean; detail: string; owner?: "code" | "model" };

const ROUTE_LABEL: Record<Route, string> = { auto: "Auto", "stronger-model": "Stronger model", "human-review": "Human review", blocked: "Blocked" };
const ROUTE_ACCENT: Record<Route, string> = { auto: "var(--route-auto)", "stronger-model": "var(--route-stronger)", "human-review": "var(--route-human)", blocked: "var(--route-blocked)" };

function stage(trace: PipelineTrace, pred: (s: PipelineStage) => boolean): PipelineStage | undefined {
  return trace.stages.find(pred);
}
function checksOf(s?: PipelineStage): Check[] {
  return ((s?.data as { checks?: Check[] } | undefined)?.checks ?? []) as Check[];
}
function usd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0";
  return n < 0.0001 ? `$${n.toExponential(2)}` : `$${n.toFixed(5)}`;
}

export function ResultPanel({ trace }: { trace: PipelineTrace }) {
  const r = trace.response;
  return (
    <div className="result-body">
      {trace.experiment === "support" && <SupportResult trace={trace} />}
      {trace.experiment === "agent-firewall" && <FirewallResult trace={trace} />}
      {trace.experiment === "model-router" && <RouterResult trace={trace} />}

      <div>
        <div className="section-label">Request</div>
        <div className="stats">
          <Stat k="Latency" v={`${r.latencyMs.toFixed(0)} ms`} />
          <Stat k="Tokens in / out" v={r.usage ? `${r.usage.input_tokens} / ${r.usage.output_tokens}` : "n/a"} />
          <Stat k="Cost" v={usd(r.estimatedCostUsd)} />
          <Stat k="Model" v={r.model} />
        </div>
        {r.warnings && r.warnings.length > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            {r.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </div>

      <details className="inspect">
        <summary>Raw provider response</summary>
        <pre>{JSON.stringify(r.raw, null, 2)}</pre>
      </details>
      <details className="inspect">
        <summary>Full trace</summary>
        <pre>{JSON.stringify(trace.stages, null, 2)}</pre>
      </details>
    </div>
  );
}

function Stat({ k, v, hero, accent }: { k: string; v: string; hero?: boolean; accent?: string }) {
  return (
    <div className={`stat ${hero ? "hero" : ""}`}>
      <div className="k">{k}</div>
      <div className="v" title={v} style={accent ? { color: accent } : undefined}>{v}</div>
    </div>
  );
}

function Verdict({ route, why, label }: { route: Route; why: string; label?: string }) {
  return (
    <div className="verdict" style={{ ["--accent" as string]: ROUTE_ACCENT[route] }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 2 }}>{label ?? "Route"}</div>
        <div className="big">{ROUTE_LABEL[route]}</div>
      </div>
      <div className="why">{why}</div>
    </div>
  );
}

function Seq({ steps }: { steps: { t: string; s: string; accent: string }[] }) {
  return (
    <div className="seq">
      {steps.map((st, i) => (
        <div key={st.t} style={{ display: "contents" }}>
          <div className="seq-step" style={{ ["--accent" as string]: st.accent }}>
            <div className="t">{st.t}</div>
            <div className="s">{st.s}</div>
          </div>
          {i < steps.length - 1 && <div className="seq-arrow">→</div>}
        </div>
      ))}
    </div>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <div className="checks">
      {checks.map((c, i) => (
        <div key={i} style={{ display: "contents" }}>
          <span className="k">{c.name.replace(/^(authorization|semantic|arithmetic|date|data|allowlist|class|arguments|rate limit|budget|gate|policy):\s*/i, "")}</span>
          <span className={`v ${c.passed ? "pill-ok" : "pill-bad"}`}>{c.passed ? "Pass" : "Fail"}</span>
          <span className="d">{c.detail}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Support                                                          */
/* ------------------------------------------------------------------ */

function SupportResult({ trace }: { trace: PipelineTrace }) {
  const a = trace.response.answers;
  const dept = a.department as ChoiceAnswer;
  const refund = a.refundRequested as NoulAnswer;
  const frus = a.frustration as ScoreAnswer;
  const gate = stage(trace, (s) => s.kind === "gate");
  const refundStage = stage(trace, (s) => s.title === "Refund policy");
  const frusStage = stage(trace, (s) => s.title === "Frustration escalation");
  const action = stage(trace, (s) => s.kind === "action");
  const refundAction = (action?.data as { refundAction?: string } | undefined)?.refundAction ?? "—";
  const route = trace.outcome.route;

  return (
    <>
      <div>
        <div className="section-label">
          Decision · department
          <span className="badge owner-model owner">model judgment</span>
        </div>
        <DecisionBars answer={dept} />
      </div>

      <div className="stats">
        <Stat k="Confidence" v={dept.confidence.toFixed(2)} hero />
        <Stat k="Route" v={ROUTE_LABEL[route]} hero accent={ROUTE_ACCENT[route]} />
        <Stat k="Refund policy" v={refundAction.replace(/-/g, " ")} />
        <Stat k="Ground truth" v={`${trace.outcome.expected} ${trace.outcome.correct ? "✓" : "✗"}`} accent={trace.outcome.correct ? "var(--green)" : "var(--red)"} />
      </div>

      <div>
        <div className="section-label">Sequence</div>
        <Seq
          steps={[
            { t: "Ticket", s: (trace.stages[0]?.summary ?? "").split(" · ").slice(1).join(" · "), accent: "var(--text-2)" },
            { t: "Jev judgment", s: `${dept.choice} ${Math.round(dept.confidence * 100)}% · refund ${Math.round(refund.noul * 100)}% · frustration ${frus.score.toFixed(1)}`, accent: "var(--violet)" },
            { t: "Confidence gate", s: gate?.route ? ROUTE_LABEL[gate.route] + ` · conf ${dept.confidence.toFixed(2)}` : "", accent: "var(--cyan)" },
            { t: "Refund policy", s: refundAction.replace(/-/g, " "), accent: "var(--orange)" },
            { t: "Action", s: ROUTE_LABEL[route], accent: ROUTE_ACCENT[route] },
          ]}
        />
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="section-label">Other judgments <span className="badge owner-model owner">model</span></div>
          <div className="stack" style={{ gap: 10 }}>
            <DecisionBars answer={refund} name="Refund requested" compact />
            <DecisionBars answer={frus} name="Frustration" headline={`E = ${frus.score.toFixed(2)}`} compact />
          </div>
        </div>
        <div>
          <div className="section-label">Policy checks <span className="badge owner-code owner">code</span></div>
          <CheckList checks={checksOf(refundStage)} />
          {frusStage && (
            <div className="checks" style={{ marginTop: 6 }}>
              <span className="k">frustration escalation</span>
              <span className={`v ${(frusStage.data as { escalate?: boolean }).escalate ? "pill-warn" : "pill-ok"}`}>{(frusStage.data as { escalate?: boolean }).escalate ? "Escalate" : "No"}</span>
              <span className="d">{frusStage.summary}</span>
            </div>
          )}
        </div>
      </div>

      <Verdict route={route} why={action?.summary ?? ""} label="Final action" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Firewall                                                         */
/* ------------------------------------------------------------------ */

function FirewallResult({ trace }: { trace: PipelineTrace }) {
  const a = trace.response.answers;
  const intent = a.intentAligned as NoulAnswer;
  const blast = a.blastRadius as ChoiceAnswer;
  const staticStage = stage(trace, (s) => s.title === "Static execution policy");
  const modelStage = stage(trace, (s) => s.title === "Per-risk-class threshold");
  const action = stage(trace, (s) => s.kind === "action");
  const staticChecks = checksOf(staticStage);
  const modelChecks = checksOf(modelStage);
  const staticVeto = staticChecks.some((c) => !c.passed);
  const route = trace.outcome.route;
  const state = trace.stages[0]?.data as { proposed?: { tool: string }; toolPolicy?: { risk?: string } | string } | undefined;
  const risk = typeof state?.toolPolicy === "object" ? state.toolPolicy.risk : "unknown";

  const find = (needle: string) => staticChecks.find((c) => c.name.toLowerCase().includes(needle));
  const yn = (c?: Check) => (c ? (c.passed ? <span className="pill-ok">Yes</span> : <span className="pill-bad">No</span>) : <span className="muted">—</span>);

  return (
    <>
      <div>
        <div className="section-label">
          Static policy
          <span className="badge owner-code owner">code · runs first</span>
        </div>
        <div className="stats">
          <Stat k="Tool" v={state?.proposed?.tool ?? "—"} />
          <Stat k="Risk class" v={risk ?? "—"} />
          <div className="stat"><div className="k">Role allowed</div><div className="v">{yn(find("authorization"))}</div></div>
          <div className="stat"><div className="k">Args valid</div><div className="v">{yn(find("arguments"))}</div></div>
          <div className="stat"><div className="k">Rate limit</div><div className="v">{find("rate limit") ? (find("rate limit")!.passed ? <span className="pill-ok">Pass</span> : <span className="pill-bad">Fail</span>) : <span className="muted">n/a</span>}</div></div>
        </div>
        {staticVeto && (
          <div className="near-tie" style={{ borderColor: "color-mix(in srgb, var(--red) 45%, transparent)", background: "color-mix(in srgb, var(--red) 8%, transparent)", color: "var(--red)" }}>
            Static policy vetoed this call. The model’s judgment below is recorded for the benchmark but did not influence the outcome.
          </div>
        )}
        <details className="inspect" style={{ marginTop: 8 }}>
          <summary>All static checks</summary>
          <CheckList checks={staticChecks} />
        </details>
      </div>

      <div>
        <div className="section-label">
          Model judgment
          <span className="badge owner-model owner">model</span>
        </div>
        <div className="stats" style={{ marginBottom: 10 }}>
          <Stat k="Goal alignment" v={intent.noul.toFixed(2)} hero />
          <Stat k="Blast radius" v={`${blast.choice} · ${blast.confidence.toFixed(2)}`} hero />
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <DecisionBars answer={intent} name="Serves the goal" compact />
          <DecisionBars answer={blast} name="Blast radius" compact />
        </div>
        {modelChecks.length > 0 && !staticVeto && (
          <div style={{ marginTop: 10 }}>
            <div className="small muted" style={{ marginBottom: 4 }}>Thresholds for risk class “{risk}” (set in code):</div>
            <CheckList checks={modelChecks} />
          </div>
        )}
      </div>

      <div>
        <div className="section-label">
          Final policy
          <span className="badge owner-code owner">code decides</span>
        </div>
        <Verdict route={route} why={action?.summary ?? ""} label={route === "auto" ? "Allowed (simulated)" : "Decision"} />
        <div className="small muted" style={{ marginTop: 6 }}>
          Ground truth verdict: <b>{trace.outcome.expected}</b> {trace.outcome.correct ? "✓" : "✗"} · No tool is ever executed.
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Router                                                           */
/* ------------------------------------------------------------------ */

const TIER_NAME: Record<string, string> = { small: "Small / fast", medium: "Mid-tier", large: "Reasoning model" };

function RouterResult({ trace }: { trace: PipelineTrace }) {
  const a = trace.response.answers;
  const cx = a.complexity as ScoreAnswer;
  const dom = a.domain as ChoiceAnswer;
  const tools = a.needsTools as NoulAnswer;
  const gate = stage(trace, (s) => s.kind === "gate");
  const action = stage(trace, (s) => s.kind === "action");
  const checks = checksOf(gate);
  const budgetOk = checks.filter((c) => c.name.startsWith("budget")).every((c) => c.passed);
  const tier = (action?.data as { tier?: string } | undefined)?.tier ?? trace.outcome.decision;
  const route = trace.outcome.route;

  return (
    <>
      <div>
        <div className="section-label">
          Decision · complexity
          <span className="badge owner-model owner">model judgment</span>
        </div>
        <DecisionBars answer={cx} headline={`expected level ${cx.score.toFixed(2)} of 3`} />
      </div>

      <div className="stats">
        <Stat k="Complexity" v={`${cx.score.toFixed(1)} / 3`} hero />
        <Stat k="Domain" v={`${dom.choice} · ${Math.round(dom.confidence * 100)}%`} />
        <Stat k="Needs tools" v={tools.noul >= 0.5 ? `Yes · ${Math.round(tools.noul * 100)}%` : `No · ${Math.round((1 - tools.noul) * 100)}%`} />
        <Stat k="Recommended tier" v={TIER_NAME[tier] ?? tier} />
        <Stat k="Budget" v={budgetOk ? "Within limit" : "Exceeded"} accent={budgetOk ? "var(--green)" : "var(--red)"} />
        <Stat k="Ground truth tier" v={`${trace.outcome.expected} ${trace.outcome.correct ? "✓" : "✗"}`} accent={trace.outcome.correct ? "var(--green)" : "var(--red)"} />
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="section-label">Other judgments <span className="badge owner-model owner">model</span></div>
          <div className="stack" style={{ gap: 10 }}>
            <DecisionBars answer={dom} name="Domain" compact />
            <DecisionBars answer={tools} name="Needs tools" compact />
          </div>
        </div>
        <div>
          <div className="section-label">Routing policy <span className="badge owner-code owner">code</span></div>
          <CheckList checks={checks.filter((c) => c.owner !== "model")} />
        </div>
      </div>

      <Verdict route={route} why={action?.summary ?? ""} label={route === "auto" ? `Final route → ${TIER_NAME[tier] ?? tier}` : "Final route"} />
    </>
  );
}

export { RouteBadge };
export type { Answer };
