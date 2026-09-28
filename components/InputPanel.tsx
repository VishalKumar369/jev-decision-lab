"use client";

/**
 * components/InputPanel.tsx
 * The centre column. Shows the example's important properties as fields (the
 * primary text is editable inline) and keeps the raw JSON one click away —
 * still fully editable, never the dominant thing on screen.
 */

import type { AgentAction, RoutingPrompt, SupportTicket } from "@/lib/types";

type Experiment = "support" | "agent-firewall" | "model-router";

interface Props {
  experiment: Experiment;
  draft: string;
  onDraft: (next: string) => void;
}

export function InputPanel({ experiment, draft, onDraft }: Props) {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(draft);
  } catch {
    obj = null;
  }

  const set = (path: string[], value: unknown) => {
    if (!obj) return;
    const next = structuredClone(obj) as Record<string, unknown>;
    let cur: Record<string, unknown> = next;
    for (const k of path.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
    cur[path[path.length - 1]] = value;
    onDraft(JSON.stringify(next, null, 2));
  };

  return (
    <div className="input-body">
      {obj ? (
        experiment === "support" ? <SupportFields t={obj as unknown as SupportTicket} set={set} /> :
        experiment === "agent-firewall" ? <FirewallFields a={obj as unknown as AgentAction} set={set} /> :
        <RouterFields p={obj as unknown as RoutingPrompt} set={set} />
      ) : (
        <div className="error">JSON is not valid — fix it below.</div>
      )}
      <details className="inspect">
        <summary>Inspect JSON</summary>
        <textarea value={draft} onChange={(e) => onDraft(e.target.value)} spellCheck={false} aria-label="example JSON" style={{ minHeight: 220 }} />
        <div className="small muted" style={{ marginTop: 6 }}>
          <code>labels</code> is ground truth and is never sent to the model.
        </div>
      </details>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fact">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function SupportFields({ t, set }: { t: SupportTicket; set: (p: string[], v: unknown) => void }) {
  return (
    <>
      <label className="field">
        <span>Subject</span>
        <input type="text" value={t.subject ?? ""} onChange={(e) => set(["subject"], e.target.value)} />
      </label>
      <label className="field">
        <span>Customer request</span>
        <textarea className="big" value={t.body ?? ""} onChange={(e) => set(["body"], e.target.value)} />
      </label>
      <div className="facts">
        <Fact k="Customer" v={cap(t.customer?.tier)} />
        <Fact k="Account age" v={`${t.customer?.accountAgeDays ?? "—"} days`} />
        <Fact k="Refund eligible" v={t.customer?.refundEligible ? <span className="pill-ok">Yes</span> : <span className="pill-bad">No</span>} />
        <Fact k="Order" v={t.order ? `$${t.order.amountUsd} · ${t.order.purchasedDaysAgo}d ago` : <span className="muted">none</span>} />
      </div>
      <Labels items={[["department", t.labels?.department], ["refund requested", String(t.labels?.refundRequested)], ["frustration", String(t.labels?.frustration)]]} ambiguous={t.ambiguous} notes={t.notes} />
    </>
  );
}

function FirewallFields({ a, set }: { a: AgentAction; set: (p: string[], v: unknown) => void }) {
  return (
    <>
      <label className="field">
        <span>Agent goal</span>
        <textarea className="big" style={{ minHeight: 64 }} value={a.goal ?? ""} onChange={(e) => set(["goal"], e.target.value)} />
      </label>
      <div className="facts">
        <Fact k="Proposed tool" v={<code>{a.proposed?.tool}</code>} />
        <Fact k="Actor role" v={cap(a.actor?.role)} />
        <Fact k="Arguments" v={<code style={{ wordBreak: "break-all" }}>{JSON.stringify(a.proposed?.args)}</code>} />
        <Fact k="Recent destructive calls" v={a.actor?.recentDestructiveCalls ?? 0} />
      </div>
      <label className="field">
        <span>Agent rationale (input to the model, never trusted by code)</span>
        <textarea className="big" style={{ minHeight: 56 }} value={a.proposed?.rationale ?? ""} onChange={(e) => set(["proposed", "rationale"], e.target.value)} />
      </label>
      <Labels items={[["intent aligned", String(a.labels?.intentAligned)], ["risk", a.labels?.risk], ["verdict", a.labels?.verdict]]} ambiguous={a.ambiguous} notes={a.notes} />
    </>
  );
}

function RouterFields({ p, set }: { p: RoutingPrompt; set: (path: string[], v: unknown) => void }) {
  return (
    <>
      <label className="field">
        <span>User prompt</span>
        <textarea className="big" style={{ minHeight: 120 }} value={p.prompt ?? ""} onChange={(e) => set(["prompt"], e.target.value)} />
      </label>
      <Labels items={[["complexity", String(p.labels?.complexity)], ["domain", p.labels?.domain], ["needs tools", String(p.labels?.needsTools)], ["tier", p.labels?.tier]]} ambiguous={p.ambiguous} notes={p.notes} />
    </>
  );
}

function Labels({ items, ambiguous, notes }: { items: [string, string | undefined][]; ambiguous?: boolean; notes?: string }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div className="section-label">
        Ground truth
        {ambiguous && <span className="badge ambiguous">annotators disagreed</span>}
      </div>
      <div className="row" style={{ gap: 14 }}>
        {items.map(([k, v]) => (
          <span key={k} className="small">
            <span className="muted">{k}</span> <b>{v ?? "—"}</b>
          </span>
        ))}
      </div>
      {notes && <div className="small muted" style={{ marginTop: 8 }}>{notes}</div>}
    </div>
  );
}

function cap(s?: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : "—";
}
