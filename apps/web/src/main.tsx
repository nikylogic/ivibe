// SPDX-License-Identifier: AGPL-3.0-only

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/theme-neutral/theme.css";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "./global.css";
import { ivibeTheme } from "./theme.ts";
import { Home } from "./home.tsx";
import { DownloadPage } from "./download.tsx";

/** The site has two pages; anything else is the home page. */
const onDownload = window.location.pathname.replace(/\/+$/, "") === "/download";

const MODE_KEY = "ivibe.theme";

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function App() {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // A remembered theme is a convenience; without storage it follows the system.
    }
  }, [mode]);
  return (
    <Theme theme={ivibeTheme} mode={mode}>
      {onDownload ? (
        <DownloadPage mode={mode} onModeChange={setMode} />
      ) : (
        <Home mode={mode} onModeChange={setMode} />
      )}
    </Theme>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
