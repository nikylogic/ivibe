// SPDX-License-Identifier: AGPL-3.0-only

import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./global.css";

/** Mounts a window's React tree inside the Astryx theme. */
export function mount(children: ReactNode, mode: "system" | "dark" = "system"): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");
  createRoot(root).render(
    <StrictMode>
      <Theme theme={neutralTheme} mode={mode}>
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
