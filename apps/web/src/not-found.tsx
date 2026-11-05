// SPDX-License-Identifier: AGPL-3.0-only

import type { ThemeMode } from "@astryxdesign/core/theme";
import { Paper } from "./moment.tsx";
import { usePageMeta } from "./seo.ts";

/** Any address that isn't a page. The server answers these with a real 404 (scripts/prerender.mjs). */
export function NotFoundPage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  usePageMeta({
    title: "Page not found · iVibe",
    description: "This page doesn't exist. Head back to iVibe or read the docs.",
    path: "/404",
    noindex: true,
  });
  return (
    <Paper
      mode={mode}
      onModeChange={onModeChange}
      first="Nothing here"
      second="this page doesn’t exist"
      mascot="shy"
      actions={[
        { label: "Go home", href: "/" },
        { label: "Read the docs", href: "/docs" },
      ]}
    />
  );
}
