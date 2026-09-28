import type { Route } from "@/lib/types";

const META: Record<Route, { icon: string; label: string }> = {
  auto: { icon: "▶", label: "Auto" },
  "stronger-model": { icon: "↗", label: "Stronger model" },
  "human-review": { icon: "✋", label: "Human review" },
  blocked: { icon: "⛔", label: "Blocked" },
};

/** Status colour never travels alone: icon + label always accompany it. */
export function RouteBadge({ route }: { route: Route }) {
  const m = META[route];
  return (
    <span className={`badge route-${route}`}>
      <span aria-hidden>{m.icon}</span> {m.label}
    </span>
  );
}
