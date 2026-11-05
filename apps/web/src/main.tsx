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
import type { LegalPageName } from "./legal.tsx";
import type { PageComponent } from "./page.ts";

const path = window.location.pathname.replace(/\/+$/, "");

const notFound = async (): Promise<PageComponent> => (await import("./not-found.tsx")).NotFoundPage;

/** Only this page's code. Rendering waits for it, so the page never flashes empty. */
async function loadPage(): Promise<PageComponent> {
  if (path === "") return (await import("./home.tsx")).Home;
  if (path === "/download") return (await import("./download.tsx")).DownloadPage;
  if (path === "/welcome") return (await import("./welcome.tsx")).WelcomePage;
  if (path.startsWith("/account/")) {
    const { AccountPage, hasAccountPage } = await import("./account-pages.tsx");
    return hasAccountPage(path) ? AccountPage : notFound();
  }
  if (path === "/docs" || path.startsWith("/docs/")) {
    const { DocsPage, hasDocsPage } = await import("./docs.tsx");
    return hasDocsPage(path) ? DocsPage : notFound();
  }
  if (path === "/blog" || path.startsWith("/blog/")) {
    const { BlogPage, hasBlogPage } = await import("./blog.tsx");
    return hasBlogPage(path) ? BlogPage : notFound();
  }
  if (path === "/privacy" || path === "/terms" || path === "/refunds") {
    const { LegalPage } = await import("./legal.tsx");
    const name = path.slice(1) as LegalPageName;
    return function Legal(props) {
      return <LegalPage name={name} {...props} />;
    };
  }
  const { GuidePage, hasGuidePage } = await import("./guides.tsx");
  return hasGuidePage(path) ? GuidePage : notFound();
}

const MODE_KEY = "ivibe.theme";

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function App({ Page }: { Page: PageComponent }) {
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
      <Page mode={mode} onModeChange={setMode} />
    </Theme>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
void loadPage().then((Page) => {
  createRoot(root).render(
    <StrictMode>
      <App Page={Page} />
    </StrictMode>,
  );
});
