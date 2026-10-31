// SPDX-License-Identifier: AGPL-3.0-only

import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/**
 * The app's theme (desktop/src/renderer/shared/theme.tsx), so the site looks like iVibe: warm
 * paper neutrals, ink-black actions, Instrument Serif headings and Inter for everything else.
 */
export const ivibeTheme = defineTheme({
  name: "ivibe",
  extends: neutralTheme,
  typography: {
    scale: { base: 15, ratio: 1.2 },
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
