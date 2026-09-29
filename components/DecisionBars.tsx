/**
 * components/DecisionBars.tsx
 * The primary visual of a result: the full distribution, biggest thing on the panel.
 * Near-ties (top-two margin < 0.2) get an explicit callout — that is a teaching moment, not noise.
 */

import type { Answer } from "@/lib/types";

/** Short rubric name for score bars (text before the em-dash). */
function scoreShort(legend: string): string {
  const head = legend.split(" — ")[0].trim();
  // "mildly annoyed" stays readable; drop trailing fluff only.
  return head || legend;
}

export function rowsOf(answer: Answer): { label: string; p: number; key: string }[] {
  if (answer.type === "noul") {
    return [
      { key: "yes", label: "yes", p: answer.noul },
      { key: "no", label: "no", p: 1 - answer.noul },
    ];
  }
  if (answer.type === "score") {
    return Object.entries(answer.probabilities).map(([k, p]) => ({
      key: k,
      label: `${k}  ${scoreShort(answer.legend[k] ?? "")}`,
      p,
    }));
  }
  return Object.entries(answer.probabilities).map(([k, p]) => ({ key: k, label: k, p }));
}

export function marginOf(answer: Answer): number {
  const s = rowsOf(answer)
    .map((r) => r.p)
    .sort((a, b) => b - a);
  return (s[0] ?? 0) - (s[1] ?? 0);
}

export function DecisionBars({
  answer,
  name,
  headline,
  compact = false,
}: {
  answer: Answer;
  name?: string;
  headline?: string;
  compact?: boolean;
}) {
  // Ordered rubrics stay in level order; choices/nouls sort by mass so the winner leads.
  const rows =
    answer.type === "score"
      ? [...rowsOf(answer)].sort((a, b) => Number(a.key) - Number(b.key))
      : [...rowsOf(answer)].sort((a, b) => b.p - a.p);
  const top = Math.max(...rows.map((r) => r.p), 0);
  const margin = marginOf(answer);
  const isScore = answer.type === "score";

  return (
    <div>
      {(name || headline) && (
        <div className="decision-head">
          <span className="name">
            {name && <b>{name}</b>}
            {name && headline ? " · " : ""}
            {headline}
          </span>
        </div>
      )}
      <div className={`decision-bars ${compact ? "compact" : ""} ${isScore ? "score" : ""}`}>
        {rows.map((r) => (
          <div key={r.key} className={`dbar ${r.p === top ? "top" : ""}`} title={`${r.label}: ${r.p.toFixed(4)}`}>
            <span className="l">{r.label}</span>
            <span className="track">
              <span className="fill" style={{ width: `${Math.max(1, r.p * 100)}%` }} />
            </span>
            <span className="p">{Math.round(r.p * 100)}%</span>
          </div>
        ))}
      </div>
      {margin < 0.2 && !compact && (
        <div className="near-tie">Near tie — top two options within {Math.round(margin * 100)} pts. Confidence alone should not automate this.</div>
      )}
    </div>
  );
}
