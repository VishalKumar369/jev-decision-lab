/** Tiny inline icon set (stroke icons, currentColor). Kept local to avoid a dependency. */

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

export const Icon = {
  home: () => (
    <svg {...base}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
  ),
  chat: () => (
    <svg {...base}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
  ),
  shield: () => (
    <svg {...base}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></svg>
  ),
  route: () => (
    <svg {...base}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 13v4" /></svg>
  ),
  bars: () => (
    <svg {...base}><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
  ),
  code: () => (
    <svg {...base}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" /></svg>
  ),
  brain: () => (
    <svg {...base}><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3v1a3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3 3 3 0 0 1-2 3v1a3 3 0 0 1-3 3h-1V4z" /></svg>
  ),
  spark: () => (
    <svg {...base}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>
  ),
  sun: () => (
    <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  moon: () => (
    <svg {...base}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>
  ),
  chevron: () => (
    <svg {...base}><path d="m9 6 6 6-6 6" /></svg>
  ),
};
