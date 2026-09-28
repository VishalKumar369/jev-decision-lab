"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Overview"],
  ["/support", "1 · Support Pipeline"],
  ["/agent-firewall", "2 · Agent Firewall"],
  ["/model-router", "3 · Model Router"],
  ["/calibration", "4 · Calibration Lab"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <span className="brand">jev-decision-lab</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <span style={{ flex: 1 }} />
      <span className="small muted">a teaching project — nothing here is production</span>
    </nav>
  );
}
