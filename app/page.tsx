import Link from "next/link";

/**
 * app/page.tsx — the thesis page.
 *
 * Not a dashboard, not a chatbot. It explains the one idea the four experiments
 * are built to demonstrate: a decision model is a *machine-consumed primitive*
 * that sits between code and LLMs, and the gate around it is yours.
 */
export default function Home() {
  return (
    <div className="stack" style={{ gap: 28 }}>
      <header style={{ maxWidth: 860 }}>
        <h1>Where does a decision model fit?</h1>
        <p className="ink2" style={{ fontSize: 17 }}>
          Software has three ways to make a judgment call. <strong>Deterministic code</strong> is fast, auditable and blind to meaning. <strong>A general-purpose LLM</strong>{" "}
          understands meaning and returns prose you then have to parse, trust and pay for. <strong>A decision model</strong> like TypeSafe Jev takes a state and typed
          questions and returns <em>calibrated probabilities over answers you defined</em> — no text, ~100 ms, fractions of a cent per thousand calls. This lab lets you
          measure the trade-offs instead of taking anyone’s word for them.
        </p>
      </header>

      <section className="grid grid-3">
        <Column
          title="Deterministic code"
          owner="code"
          rows={[
            ["input", "structured fields"],
            ["output", "exact value"],
            ["latency", "µs"],
            ["cost", "≈ 0"],
            ["fails on", "meaning, negation, sarcasm, novelty"],
            ["owns", "authorization · thresholds · arithmetic · dates · rate limits · execution"],
          ]}
        />
        <Column
          title="Decision model (Jev)"
          owner="model"
          rows={[
            ["input", "state + typed questions"],
            ["output", "P(answer) for every option"],
            ["latency", "~70–500 ms"],
            ["cost", "$0.042 / 1M input tokens, output free"],
            ["fails on", "open-ended tasks, generation, counting"],
            ["owns", "semantic judgment only — which team, is this a refund, does this call serve the goal"],
          ]}
        />
        <Column
          title="General-purpose LLM"
          owner="simulated-tool"
          rows={[
            ["input", "prompt"],
            ["output", "text (maybe JSON, maybe not)"],
            ["latency", "1–10 s"],
            ["cost", "10–1000× per decision"],
            ["fails on", "calibration, format drift, cost at scale"],
            ["owns", "generation, reasoning traces, the ‘stronger model’ escalation tier"],
          ]}
        />
      </section>

      <section className="card">
        <h2>The pipeline every experiment draws</h2>
        <div className="pipeline" aria-label="pipeline diagram">
          <Stage owner="code" title="Incoming state" body="ticket · proposed tool call · user prompt" />
          <Arrow />
          <Stage owner="model" title="Decision" body="typed questions → probability distributions" />
          <Arrow />
          <Stage owner="code" title="Confidence gate" body="≥ 0.85 auto · ≥ 0.60 stronger model · else human" />
          <Arrow />
          <Stage owner="code" title="Policy" body="eligibility · limits · dates · allowlists · budgets" />
          <Arrow />
          <Stage owner="simulated-tool" title="Action" body="simulated side effect · escalation · review queue" />
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Colour = owner. Violet boxes are the only place a model is consulted. Everything grey is plain TypeScript you can unit-test. Green is a simulated tool — this
          project never executes anything real.
        </p>
      </section>

      <section className="grid grid-2">
        <ExperimentCard href="/support" n="1" title="Support Decision Pipeline" body="Three questions in one call, then refund arithmetic, eligibility and frustration thresholds in code." />
        <ExperimentCard href="/agent-firewall" n="2" title="Agent Action Firewall" body="Static allowlist/role/arg checks first; the model judges intent alignment and blast radius; per-risk-class thresholds decide." />
        <ExperimentCard href="/model-router" n="3" title="Model Router" body="A cheap complexity estimate picks a tier under a cost/latency budget — and refuses to silently downgrade." />
        <ExperimentCard href="/calibration" n="4" title="Calibration Lab" body="Bucket every recorded prediction by confidence and see whether 0.8 really means 80%. This is what makes the gate legitimate." />
      </section>

      <section className="grid grid-2">
        <div className="callout">
          <strong>Do not hide uncertainty.</strong> Every decision box shows the full distribution, flags near-ties, and links the raw wire response. Ambiguous dataset rows are
          marked <span className="badge ambiguous">?</span> and kept — a low-confidence answer on an ambiguous input is correct behaviour, not a bug.
        </div>
        <div className="callout code">
          <strong>Jev never executes.</strong> It has no tools, no memory, no output text. It answers questions. The gate around it — thresholds, authorization, rate limits
          — lives in <code>lib/policy-engine.ts</code> and is the part you own.
        </div>
      </section>

      <section className="card small ink2">
        <strong>Getting started:</strong> copy <code>.env.example</code> to <code>.env.local</code>, add <code>TYPESAFE_API_KEY</code>, pick “TypeSafe Jev (direct)” in any
        experiment. With no keys the <em>mock</em> provider (keyword heuristics — not a model) runs offline so you can learn the shape first. Then{" "}
        <span className="kbd">npm run bench -- --provider mock,jev</span> and <span className="kbd">npm run calibration</span>.
      </section>
    </div>
  );
}

function Column({ title, owner, rows }: { title: string; owner: "code" | "model" | "simulated-tool"; rows: [string, string][] }) {
  return (
    <div className={`stage owner-${owner}`} style={{ maxWidth: "none" }}>
      <div className="title">{title}</div>
      <table className="data small">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="muted" style={{ width: 70 }}>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stage({ owner, title, body }: { owner: "code" | "model" | "simulated-tool"; title: string; body: string }) {
  return (
    <div className={`stage owner-${owner}`} style={{ minWidth: 190, flexBasis: 190 }}>
      <div className="title">{title}</div>
      <div className="summary">{body}</div>
    </div>
  );
}

function Arrow() {
  return <div className="arrow" aria-hidden>→</div>;
}

function ExperimentCard({ href, n, title, body }: { href: string; n: string; title: string; body: string }) {
  return (
    <Link href={href} className="card" style={{ textDecoration: "none", display: "block" }}>
      <div className="muted small">Experiment {n}</div>
      <h2>{title}</h2>
      <p className="ink2 small" style={{ margin: 0 }}>{body}</p>
    </Link>
  );
}
