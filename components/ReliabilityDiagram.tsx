/**
 * components/ReliabilityDiagram.tsx
 *
 * The standard calibration picture: x = Predicted confidence per bucket,
 * y = empirical accuracy in that bucket. Perfect calibration is the diagonal.
 * Points above the line = under-confident, below = over-confident. Marker size
 * encodes bucket count so a bucket of n=2 doesn't look as authoritative as n=80.
 *
 * Plain SVG, one axis, hover tooltip via <title>, categorical colour per provider
 * (fixed slot order) with a legend + direct labels so identity is never colour-alone.
 *
 * Rendered after mount only: Dark Reader (and similar extensions) rewrite SVG
 * stroke/fill/style attrs before React hydrates, which trips a mismatch warning.
 */

"use client";

import { useEffect, useState } from "react";
import type { CalibrationReport } from "@/lib/metrics";

/** Fixed identity per provider: Jev white, Claude orange, Gemini blue. */
const PROVIDER_STYLE: Record<string, { label: string; color: string }> = {
  jev: { label: "Jev", color: "var(--text)" },
  "openrouter-claude": { label: "Claude", color: "#d97757" },
  "openrouter-gemini": { label: "Gemini", color: "var(--blue)" },
};

function styleFor(group: string, i: number): { label: string; color: string } {
  const [provider, ...rest] = group.split(" / ");
  const known = PROVIDER_STYLE[provider];
  if (!known) return { label: group, color: SLOTS[i % SLOTS.length] };
  return { label: rest.length ? `${known.label} / ${rest.join(" / ")}` : known.label, color: known.color };
}

const SLOTS = ["var(--violet)", "var(--cyan)", "var(--orange)", "var(--green)", "var(--red)", "var(--purple)", "var(--blue)", "var(--text-2)"];

export function ReliabilityDiagram({ reports }: { reports: { group: string; calibration: CalibrationReport }[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const W = 420, H = 420, P = 44;
  const sx = (v: number) => P + v * (W - 2 * P);
  const sy = (v: number) => H - P - v * (H - 2 * P);
  const maxN = Math.max(1, ...reports.flatMap((r) => r.calibration.buckets.map((b) => b.n)));

  if (!ready) {
    return <div className="reliability-diagram-skeleton" aria-hidden />;
  }

  return (
    <div className="stack">
      <svg
        className="reliability-diagram-svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Reliability diagram"
        suppressHydrationWarning
      >
        {/* grid */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
          <g key={t}>
            <line x1={sx(t)} y1={sy(0)} x2={sx(t)} y2={sy(1)} stroke="var(--border)" suppressHydrationWarning />
            <line x1={sx(0)} y1={sy(t)} x2={sx(1)} y2={sy(t)} stroke="var(--border)" suppressHydrationWarning />
            <text x={sx(t)} y={H - P + 16} fontSize="11" textAnchor="middle" fill="var(--muted)" className="tabular" suppressHydrationWarning>
              {t.toFixed(1)}
            </text>
            <text x={P - 8} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="var(--muted)" className="tabular" suppressHydrationWarning>
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {/* diagonal */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1.5" suppressHydrationWarning />
        <text x={sx(0.12)} y={sy(0.06)} fontSize="11" fill="var(--muted)" transform={`rotate(-45 ${sx(0.12)} ${sy(0.06)})`} suppressHydrationWarning>
          perfect calibration
        </text>
        {/* axes labels */}
        <text x={W / 2} y={H - 6} fontSize="12" textAnchor="middle" fill="var(--text-2)" suppressHydrationWarning>
          Predicted confidence
        </text>
        <text x={14} y={H / 2} fontSize="12" textAnchor="middle" fill="var(--text-2)" transform={`rotate(-90 14 ${H / 2})`} suppressHydrationWarning>
          Actual accuracy
        </text>

        {reports.map((r, i) => {
          const { label, color } = styleFor(r.group, i);
          const pts = r.calibration.buckets.filter((b) => b.n > 0);
          const path = pts.map((b, j) => `${j ? "L" : "M"}${sx(b.meanConfidence)},${sy(b.empiricalAccuracy)}`).join(" ");
          return (
            <g key={r.group}>
              <path d={path} fill="none" stroke={color} strokeWidth="2" opacity="0.7" suppressHydrationWarning />
              {pts.map((b) => (
                <circle
                  key={b.lo}
                  cx={sx(b.meanConfidence)}
                  cy={sy(b.empiricalAccuracy)}
                  r={4 + 8 * Math.sqrt(b.n / maxN)}
                  fill={color}
                  stroke="var(--surface)"
                  strokeWidth="2"
                  opacity="0.9"
                  suppressHydrationWarning
                >
                  <title>{`${label}\nbucket ${b.lo.toFixed(1)}–${b.hi.toFixed(1)}  n=${b.n}\nmean conf ${b.meanConfidence.toFixed(3)}\naccuracy ${b.empiricalAccuracy.toFixed(3)}\ngap ${b.gap.toFixed(3)}`}</title>
                </circle>
              ))}
              {pts.length > 0 && (
                <text
                  x={sx(pts[pts.length - 1].meanConfidence) + 10}
                  y={sy(pts[pts.length - 1].empiricalAccuracy) - 8}
                  fontSize="11"
                  fill="var(--text-2)"
                  suppressHydrationWarning
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="row small">
        {reports.map((r, i) => (
          <span key={r.group} className="row" style={{ gap: 6 }}>
            <span className="reliability-legend-swatch" style={{ background: styleFor(r.group, i).color }} />
            {styleFor(r.group, i).label} <span className="muted">ECE {r.calibration.ece.toFixed(3)} · n={r.calibration.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
