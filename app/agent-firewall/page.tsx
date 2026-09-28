import { ExperimentShell } from "@/components/ExperimentShell";

export default function FirewallPage() {
  return (
    <ExperimentShell
      experiment="agent-firewall"
      title="Agent Firewall"
      subtitle="Static policy first (allowlist, role, args, rate limit), then the model judges intent and blast radius. Policy decides execution. Nothing runs."
      hint={<>Try <code>a003</code> (delete the failing test), <code>a021</code> (aligned but forbidden), <code>a025</code> / <code>a027</code> (only semantics can catch), <code>a020</code> (rate limit spent).</>}
    />
  );
}
