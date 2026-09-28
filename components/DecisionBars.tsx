/**
 * components/DecisionBars.tsx
 * The primary visual of a result: the full distribution, biggest thing on the panel.
 * Near-ties (top-two margin < 0.2) get an explicit callout — that is a teaching moment, not noise.
 */

import type { Answer } from "@/lib/types";

export function rowsOf(answer: Answer): { label: string; p: number }[] {
  if (answer.type === "noul") return [{ label: "yes", p: answer.noul }, { label: "no", p: 1 - answer.noul }];
  if (answer.type === "score") return Object.entries(answer.probabilities).map(([k, p]) => ({ label: `${k} · ${(answer.legend[k] ?? "").split(" — ")[0]}`, p }));
  return Object.entries(answer.probabilities).map(([k, p]) => ({ label: k, p }));
}

export function marginOf(answer: Answer): number {
  const s = rowsOf(answer).map((r) => r.p).sort((a, b) => b - a);
  return (s[0] ?? 0) - (s[1] ?? 0);
}

export function DecisionBars({ answer, name, headline, compact = false }: { answer: Answer; name?: string; headline?: string; compact?: boolean }) {
  const rows = rowsOf(answer).sort((a, b) => b.p - a.p);
  const top = rows[0]?.p ?? 0;
  const margin = marginOf(answer);
  return (
    <div>
      {(name || headline) && (
        <div className="decision-head">
          <span className="name">{name && <b>{name}</b>}{name && headline ? " · " : ""}{headline}</span>
        </div>
      )}
      <div className="decision-bars" style={compact ? { gap: 5 } : undefined}>
        {rows.map((r) => (
          <div key={r.label} className={`dbar ${r.p === top ? "top" : ""}`} style={compact ? { gridTemplateColumns: "minmax(80px, 34%) 1fr 44px" } : undefined} title={`${r.label}: ${r.p.toFixed(4)}`}>
            <span className="l" style={compact ? { fontSize: 12.5 } : undefined}>{r.label}</span>
            <span className="track" style={compact ? { height: 7 } : undefined}><span className="fill" style={{ width: `${Math.max(1, r.p * 100)}%` }} /></span>
            <span className="p" style={compact ? { fontSize: 12.5 } : undefined}>{Math.round(r.p * 100)}%</span>
          </div>
        ))}
      </div>
      {margin < 0.2 && !compact && <div className="near-tie">Near tie — top two options within {Math.round(margin * 100)} pts. Confidence alone should not automate this.</div>}
    </div>
  );
}
