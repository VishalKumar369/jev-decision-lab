import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: {
    default: "Jev Lab",
    template: "%s · Jev Lab",
  },
  description:
    "Compare TypeSafe Jev with Claude and Gemini on the same support tickets — latency, tokens, cost, and calibrated probabilities.",
  applicationName: "Jev Lab",
  authors: [{ name: "ByteMonk" }],
  creator: "ByteMonk",
  keywords: ["Jev", "TypeSafe", "decision model", "ByteMonk", "support routing", "calibration"],
  openGraph: {
    title: "Jev Lab",
    description:
      "Compare TypeSafe Jev with Claude and Gemini on the same support tickets — latency, tokens, cost, and calibrated probabilities.",
    siteName: "Jev Lab",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Jev Lab",
    description:
      "Compare TypeSafe Jev with Claude and Gemini on the same support tickets — latency, tokens, cost, and calibrated probabilities.",
  },
  icons: {
    icon: [{ url: "/bytemonk-logo.png", type: "image/png" }],
    apple: [{ url: "/bytemonk-logo.png", type: "image/png" }],
  },
};

/** Apply saved theme before paint so SSR HTML and the first client paint agree. */
const themeInit = `(function(){try{var t=localStorage.getItem("jev-lab-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="jev-lab-theme" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <div className="frame">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
