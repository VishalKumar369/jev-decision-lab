"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icons";

const LINKS = [
  { href: "/", label: "Overview", icon: Icon.home },
  { href: "/support", label: "Support Pipeline", icon: Icon.chat, n: "1" },
  { href: "/agent-firewall", label: "Agent Firewall", icon: Icon.shield, n: "2" },
  { href: "/model-router", label: "Model Router", icon: Icon.route, n: "3" },
  { href: "/calibration", label: "Calibration Lab", icon: Icon.bars, n: "4" },
];

export function Sidebar() {
  const path = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("jev-lab-theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("jev-lab-theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">J</span>
        jev-decision-lab
      </div>
      <nav className="navlist">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="navlink" aria-current={path === l.href ? "page" : undefined}>
            <l.icon />
            <span style={{ flex: 1 }}>{l.label}</span>
            {l.n && <span className="n">{l.n}</span>}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="small">
          <span className="status-dot" />
          Teaching lab
          <div className="muted" style={{ paddingLeft: 15 }}>Not for production</div>
        </div>
        <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
          <span style={{ display: "inline-flex", width: 14, height: 14 }}>{theme === "dark" ? <Icon.sun /> : <Icon.moon />}</span>
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
    </aside>
  );
}
