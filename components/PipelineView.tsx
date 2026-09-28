"use client";

/**
 * components/PipelineView.tsx
 *
 * The visual argument of the whole project: a left-to-right flow
 *
 *   incoming state → decision (model) → confidence gate (code) → policy (code) → action
 *
 * Stage cards are colour-coded by OWNER, not by success/failure, so the eye
 * learns which boxes are the model's and which are yours. Only the model box
 * shows probability bars; only code boxes show thresholds and checks.
 */

import type { Answer, PipelineStage, PipelineTrace } from "@/lib/types";
import { ProbabilityBars } from "./ProbabilityBars";
import { OwnerBadge, RouteBadge } from "./RouteBadge";

export function PipelineView({ trace }: { trace: PipelineTrace }) {
  return (
    <div className="pipeline">
      {trace.stages.map((s, i) => (
        <StageCard key={i} stage={s} last={i === trace.stages.length - 1} />
      ))}
    </div>
  );
}

function StageCard({ stage, last }: { stage: PipelineStage; last: boolean }) {
  const data = (stage.data ?? {}) as Record<string, unknown>;
  const answers = stage.kind === "decision" ? (data.answers as Record<string, Answer> | undefined) : undefined;
  const checks = data.checks as { name: string; passed: boolean; detail: string; owner?: string }[] | undefined;
  return (
    <>
      <div className={`stage owner-${stage.owner}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <OwnerBadge owner={stage.owner} />
          {stage.durationMs !== undefined && <span className="small mono muted">{stage.durationMs.toFixed(0)} ms</span>}
        </div>
        <div className="title">{stage.title}</div>
        {stage.route && <div><RouteBadge route={stage.route} /></div>}
        <div className="summary">{stage.summary}</div>

        {answers && (
          <div className="stack" style={{ gap: 10 }}>
            {Object.entries(answers).map(([k, a]) => (
              <ProbabilityBars key={k} name={k} answer={a} />
            ))}
            {Array.isArray(data.warnings) && (data.warnings as string[]).length > 0 && (
              <div className="small muted">{(data.warnings as string[]).map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
            )}
          </div>
        )}

        {checks && (
          <ul className="small" style={{ margin: 0, paddingLeft: 16 }}>
            {checks.map((c, i) => (
              <li key={i} style={{ color: c.passed ? "var(--ink-2)" : "var(--route-blocked)" }}>
                {c.passed ? "✓" : "✗"} {c.name} <span className="muted">— {c.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {stage.data !== undefined && (
          <details>
            <summary>raw stage data</summary>
            <pre className="small">{JSON.stringify(stage.data, null, 2)}</pre>
          </details>
        )}
      </div>
      {!last && <div className="arrow" aria-hidden>→</div>}
    </>
  );
}
