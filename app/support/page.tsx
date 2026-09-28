import { ExperimentShell } from "@/components/ExperimentShell";

export default function SupportPage() {
  return (
    <ExperimentShell
      experiment="support"
      title="1 · Support Decision Pipeline"
      intro={
        <>
          <p>
            One ticket in, <strong>one decision call</strong> with three typed questions out: <code>department</code> (choice), <code>refundRequested</code> (noul),{" "}
            <code>frustration</code> (score 0–4). Then code takes over: a confidence gate on the department, a refund policy that checks eligibility, the $250 limit and the
            30-day window, and a frustration threshold that forces a human.
          </p>
          <p className="small muted">
            Try <code>t010</code> (negated “refund”), <code>t007</code> (confident model, but $468 &gt; limit), <code>t018</code> (refund asked, account not eligible),{" "}
            <code>t029</code> (no department really fits — low confidence is the <em>right</em> answer).
          </p>
        </>
      }
    />
  );
}
