/**
 * components/ProbabilityBars.tsx
 *
 * Renders a full distribution — never just the winner. The near-tie flag is the
 * lab's "do not hide uncertainty" rule made visible: if the top two options are
 * within 0.2 of each other, we say so right next to the bars.
 */

import type { Answer } from "@/lib/types";

export function ProbabilityBars({ answer, name }: { answer: Answer; name: string }) {
  const rows: { label: string; p: number }[] =
    answer.type === "noul"
      ? [
          { label: "true", p: answer.noul },
          { label: "false", p: 1 - answer.noul },
        ]
      : Object.entries(answer.probabilities).map(([k, p]) => ({
          label: answer.type === "score" ? `${k} · ${answer.legend[k]?.split(" — ")[0] ?? ""}` : k,
          p,
        }));
  const sorted = [...rows].sort((a, b) => b.p - a.p);
  const top = sorted[0]?.p ?? 0;
  const second = sorted[1]?.p ?? 0;
  const nearTie = top - second < 0.2;
  const headline =
    answer.type === "choice"
      ? `${answer.choice} · conf ${answer.confidence.toFixed(2)}`
      : answer.type === "score"
        ? `E[level] = ${answer.score.toFixed(2)} · conf ${answer.confidence.toFixed(2)}`
        : `P(true) = ${answer.noul.toFixed(2)}`;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {name} <span className="muted">({answer.type})</span>
        </span>
        <span className="small mono ink2">{headline}</span>
      </div>
      <div className="pbars">
        {rows.map((r) => (
          <div key={r.label} className={`pbar ${r.p === top ? "top" : ""}`} title={`${r.label}: ${r.p.toFixed(4)}`}>
            <span className="label">{r.label}</span>
            <span className="track">
              <span className="fill" style={{ width: `${Math.max(1, r.p * 100)}%` }} />
            </span>
            <span className="val">{r.p.toFixed(2)}</span>
          </div>
        ))}
      </div>
      {nearTie && (
        <div className="small" style={{ marginTop: 4 }}>
          <span className="badge ambiguous">⚠ near tie · margin {(top - second).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
