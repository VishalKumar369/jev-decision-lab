import { ExperimentShell } from "@/components/ExperimentShell";

export default function SupportPage() {
  return (
    <ExperimentShell
      experiment="support"
      title="Support Pipeline"
      subtitle="Ticket → Jev judgment → confidence gate → refund policy → action. The model classifies; code authorizes."
      hint={<>Try <code>t010</code> (negated “refund”), <code>t007</code> (confident, but $468 &gt; limit), <code>t018</code> (not eligible), <code>t029</code> (nothing fits).</>}
    />
  );
}
