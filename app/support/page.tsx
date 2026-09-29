import { ExperimentShell } from "@/components/ExperimentShell";

export default function SupportPage() {
  return (
    <ExperimentShell
      experiment="support"
      title="Support Pipeline"
      subtitle="Ticket → Jev judgment (choice / noul / score) → confidence gate → refund policy → action. The model classifies; code authorizes."
      hint={<>Try a clear charge (“twice”) vs an ambiguous Pro upgrade. Ambiguous rows are marked <code>?</code>.</>}
    />
  );
}
