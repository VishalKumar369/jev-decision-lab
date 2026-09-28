import { ExperimentShell } from "@/components/ExperimentShell";

export default function RouterPage() {
  return (
    <ExperimentShell
      experiment="model-router"
      title="Model Router"
      subtitle="A cheap complexity estimate picks a tier under a cost/latency budget. Code refuses to silently downgrade."
      hint={<>Try <code>r007</code> (trivial, but needs live data) and <code>r022</code> (short prompt, deep answer).</>}
    />
  );
}
