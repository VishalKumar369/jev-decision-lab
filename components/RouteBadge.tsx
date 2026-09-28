import type { Route } from "@/lib/types";

const META: Record<Route, { icon: string; label: string }> = {
  auto: { icon: "▶", label: "automatic action" },
  "stronger-model": { icon: "↗", label: "stronger model" },
  "human-review": { icon: "✋", label: "human review" },
  blocked: { icon: "⛔", label: "blocked" },
};

/** Status colour is never alone: icon + label always accompany it. */
export function RouteBadge({ route }: { route: Route }) {
  const m = META[route];
  return (
    <span className={`badge route-${route}`}>
      <span aria-hidden>{m.icon}</span> {m.label}
    </span>
  );
}

export function OwnerBadge({ owner }: { owner: "code" | "model" | "simulated-tool" }) {
  const label = owner === "code" ? "deterministic code" : owner === "model" ? "model (semantic)" : "simulated tool";
  return <span className={`badge owner-${owner}`}>{label}</span>;
}
