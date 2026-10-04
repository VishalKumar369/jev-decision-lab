"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icons";

const LINKS = [
  { href: "/", label: "Overview", icon: Icon.home },
  { href: "/support", label: "Support Pipeline", icon: Icon.chat, n: "1" },
  { href: "/calibration", label: "Calibration Lab", icon: Icon.bars, n: "2" },
];

export function Sidebar() {
  const path = usePathname();
  // Match the inline theme script in layout.tsx — never flip icons until mounted.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("jev-lab-theme");
      const current = document.documentElement.dataset.theme;
      const next = saved === "light" || saved === "dark" ? saved : current === "light" ? "light" : "dark";
      setTheme(next);
      document.documentElement.dataset.theme = next;
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
    <aside className="sidebar" suppressHydrationWarning>
      <div className="brand">
        {/* Plain img avoids next/image inline styles that browser extensions mutate before hydrate. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* <img src="/bytemonk-logo.png" alt="ByteMonk" width={32} height={32} className="brand-logo" /> */}
        <div className="brand-text">
          <span className="brand-name">Jev Decision Lab</span>
          {/* <span className="brand-by">by ByteMonk</span> */}
        </div>
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
        <a
          className="bytemonk-soft"
          href="https://github.com/bytemonk"
          target="_blank"
          rel="noreferrer"
          title="ByteMonk"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bytemonk-logo.png" alt="" width={18} height={18} className="brand-logo soft" />
          <span>ByteMonk</span>
        </a>
        <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme" suppressHydrationWarning>
          <span style={{ display: "inline-flex", width: 14, height: 14 }} suppressHydrationWarning>
            {!mounted || theme === "dark" ? <Icon.sun /> : <Icon.moon />}
          </span>
          {!mounted || theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
    </aside>
  );
}
