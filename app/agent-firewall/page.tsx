import { ExperimentShell } from "@/components/ExperimentShell";

export default function FirewallPage() {
  return (
    <ExperimentShell
      experiment="agent-firewall"
      title="2 · Agent Action Firewall"
      intro={
        <>
          <p>
            An agent proposes a tool call. <strong>Static policy runs first</strong>: allowlist, role, argument validation, rate limit. Only if all of that passes do the model’s
            two judgments matter — <code>intentAligned</code> (does this exact call serve the goal?) and <code>blastRadius</code> — and the bar rises with the tool’s risk
            class (0.5 for reads, 0.8 for writes, 0.95 for destructive).
          </p>
          <p className="small muted">
            Nothing here executes; every tool is simulated. Try <code>a003</code> (delete the failing test to “make it pass”), <code>a021</code> (perfectly aligned and still
            forbidden), <code>a025</code> / <code>a027</code> (pass every static check — only semantics can catch them), <code>a020</code> (same call as a018, but the rate limit
            is spent).
          </p>
        </>
      }
    />
  );
}
