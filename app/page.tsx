import { Icon } from "@/components/Icons";

/**
 * app/page.tsx — Overview.
 * Three comparison columns, the decision flow thesis, then the five metrics
 * recorded on every input query (latency · cost · accuracy · probability · escalation).
 */
export default function Home() {
  return (
    <div className="overview-screen stack" style={{ gap: 16 }}>
      <header className="page-head">
        <div className="eyebrow">Lab overview</div>
        <h1 style={{ marginTop: 6 }}>Jev Decision Lab</h1>
        <p>Compare deterministic code, decision models, and LLMs in controlled experiments.</p>
      </header>

      <section className="grid-3">
        <Compare accent="var(--blue)" icon={<Icon.code />} title="Deterministic Code" sub="Fast, exact, predictable." rows={[["Output", "Exact value"], ["Latency", "µs"], ["Best for", "Rules, math, validation"]]} />
        <Compare accent="var(--violet)" icon={<Icon.brain />} title="Decision Model (Jev)" sub="Typed questions, calibrated probabilities." rows={[["Output", "P(answer)"], ["Latency", "~70–500 ms"], ["Best for", "Judgment, trade-offs"]]} />
        <Compare accent="var(--cyan)" icon={<Icon.spark />} title="General-purpose LLM" sub="Flexible, open-ended." rows={[["Output", "Text / JSON"], ["Latency", "1–10 s"], ["Best for", "Generation, reasoning"]]} />
      </section>

      <section className="panel panel-pad">
        <h2 style={{ marginBottom: 14 }}>What we record</h2>
        <div className="flow">
          <MetricStep accent="var(--cyan)" icon={<Icon.latency />} t="Latency" s="Time to judgment" />
          <Arrow />
          <MetricStep accent="var(--orange)" icon={<Icon.cost />} t="Cost" s="$ per decision" />
          <Arrow />
          <MetricStep accent="var(--green)" icon={<Icon.accuracy />} t="Accuracy" s="Vs labelled truth" />
          <Arrow />
          <MetricStep accent="var(--violet)" icon={<Icon.probability />} t="Probability" s="Full distribution" />
          <Arrow />
          <MetricStep accent="var(--blue)" icon={<Icon.escalate />} t="Escalation rate" s="Human / stronger model" />
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 style={{ marginBottom: 14 }}>Decision flow</h2>
        <div className="flow">
          <Step n={1} accent="var(--text-2)" t="Input" s="Ticket + context" />
          <Arrow />
          <Step n={2} accent="var(--violet)" t="Decision" s="Typed questions" />
          <Arrow />
          <Step n={3} accent="var(--cyan)" t="Confidence" s="P(answer) + score" />
          <Arrow />
          <Step n={4} accent="var(--orange)" t="Policy" s="Limits + allowlists" />
          <Arrow />
          <Step n={5} accent="var(--green)" t="Action" s="Simulated result" />
        </div>
        <div className="flow-legend">
          <span><i style={{ background: "var(--violet)" }} />model judgment</span>
          <span><i style={{ background: "var(--cyan)" }} />deterministic code</span>
          <span><i style={{ background: "var(--orange)" }} />policy</span>
          <span><i style={{ background: "var(--green)" }} />simulated action</span>
        </div>
      </section>
    </div>
  );
}

function Compare({ accent, icon, title, sub, rows }: { accent: string; icon: React.ReactNode; title: string; sub: string; rows: [string, string][] }) {
  return (
    <div className="panel compare-card accent-top" style={{ ["--accent" as string]: accent }}>
      <div className="head">
        <div className="icon">{icon}</div>
        <div>
          <div className="title">{title}</div>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <div className="compare-rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step({ n, accent, t, s }: { n: number; accent: string; t: string; s: string }) {
  return (
    <div className="flow-step" style={{ ["--accent" as string]: accent }}>
      <div className="num">{n}</div>
      <div style={{ minWidth: 0 }}>
        <div className="t">{t}</div>
        <div className="s">{s}</div>
      </div>
    </div>
  );
}

function Arrow() {
  return <div className="flow-arrow" aria-hidden>→</div>;
}

function MetricStep({
  accent,
  icon,
  t,
  s,
}: {
  accent: string;
  icon: React.ReactNode;
  t: string;
  s: string;
}) {
  return (
    <div className="flow-step" style={{ ["--accent" as string]: accent }}>
      <div className="ico" aria-hidden>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="t">{t}</div>
        <div className="s">{s}</div>
      </div>
    </div>
  );
}
