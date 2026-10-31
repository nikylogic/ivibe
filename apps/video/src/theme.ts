// SPDX-License-Identifier: AGPL-3.0-only

import "@fontsource-variable/inter";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";

/** The app's light palette (desktop/src/renderer/shared/theme.tsx). */
export const C = {
  page: "#fdfcf9",
  body: "#f4f1ea",
  muted: "#efebe3",
  ink: "#1b1a17",
  secondary: "#6f6a60",
  faint: "#aaa59b",
  border: "#1b1a1714",
  borderStrong: "#d9d4c9",
  shadow: "0 30px 80px #2a24181f, 0 4px 14px #2a241812",
  pill: "#1c1b19",
  pillText: "#f2efe8",
  record: "#e5484d",
  proof: "#e5484d",
  secret: "#c99a3c",
  terminal: "#151412",
  terminalText: "#e9e5dc",
  accentGreen: "#46a758",
};

export const SANS = '"Inter Variable", -apple-system, "Segoe UI", sans-serif';
export const SERIF = '"Instrument Serif", Georgia, serif';
export const MONO = '"Cascadia Code", Consolas, Menlo, monospace';

export const FPS = 30;
export const sec = (seconds: number) => Math.round(seconds * FPS);
