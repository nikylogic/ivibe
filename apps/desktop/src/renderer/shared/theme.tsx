// SPDX-License-Identifier: AGPL-3.0-only

import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Theme, defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/theme-neutral/theme.css";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "./global.css";

/**
 * The iVibe look: warm paper neutrals, ink-black primary actions, Instrument Serif for display
 * type and Inter for the interface. Colour is reserved for meaning (recording, secrets, results).
 * Fonts are bundled, so the renderer CSP can stay 'self'.
 */
export const ivibeTheme = defineTheme({
  name: "ivibe",
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: {
      family: "Inter Variable",
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif',
    },
    heading: {
      family: "Instrument Serif",
      fallbacks: 'Georgia, "Times New Roman", serif',
      weight: "normal",
      weights: { 1: "normal", 2: "normal", 3: "normal", 4: "normal" },
    },
  },
  tokens: {
    "--color-background-body": ["#f4f1ea", "#121110"],
    "--color-background-surface": ["#fdfcf9", "#1a1917"],
    "--color-background-card": ["#fdfcf9", "#1a1917"],
    "--color-background-popover": ["#fdfcf9", "#22211e"],
    "--color-background-muted": ["#efebe3", "#22211e"],

    "--color-accent": ["#1b1a17", "#f2efe8"],
    "--color-accent-muted": ["#ebe7de", "#2a2925"],
    "--color-on-accent": ["#fdfcf9", "#121110"],
    "--color-text-accent": ["#1b1a17", "#f2efe8"],
    "--color-icon-accent": ["#1b1a17", "#f2efe8"],

    "--color-text-primary": ["#1b1a17", "#f2efe8"],
    "--color-text-secondary": ["#6f6a60", "#a39e94"],
    "--color-text-disabled": ["#aaa59b", "#5d5a54"],
    "--color-icon-primary": ["#1b1a17", "#f2efe8"],
    "--color-icon-secondary": ["#6f6a60", "#a39e94"],

    "--color-border": ["#1b1a1714", "#f2efe814"],
    "--color-border-emphasized": ["#d9d4c9", "#3a3833"],
    "--color-shadow": ["#2a24181a", "#00000066"],
    "--color-skeleton": ["#ebe7de", "#2a2925"],

    "--radius-container": "18px",
  },
});

/** Mounts a window's React tree inside the iVibe theme. */
export function mount(children: ReactNode, mode: "system" | "dark" = "system"): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");
  createRoot(root).render(
    <StrictMode>
      <Theme theme={ivibeTheme} mode={mode}>
        {children}
      </Theme>
    </StrictMode>,
  );
}

/** 61_500 → "01:01" */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Status colours used outside Astryx components (recording dot, secret highlights). */
export const signal = {
  recording: "#e5484d",
  secret: "#d98a1c",
  ok: "#3d9a5b",
} as const;
