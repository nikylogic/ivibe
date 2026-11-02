// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { Footer } from "./footer.tsx";
import { TopBar } from "./top-bar.tsx";
import { Nav } from "./nav.tsx";
import { usePageMeta } from "./seo.ts";
import { ivibeTheme } from "./theme.ts";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  main: {
    minHeight: "78vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    paddingTop: 120,
    paddingBottom: 72,
    paddingInline: 24,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(36px, 5vw, 48px)",
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    margin: 0,
  },
});

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
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" mode={mode} onModeChange={onModeChange} />
      <main {...stylex.props(styles.main)}>
        <VStack gap={5} hAlign="center">
          <Mascot size={120} state="idle" />
          <VStack gap={2} hAlign="center">
            <Heading level={1} xstyle={styles.title}>
              Nothing here.
            </Heading>
            <Text color="secondary">This page doesn&apos;t exist.</Text>
          </VStack>
          <HStack gap={2} hAlign="center" wrap="wrap">
            <Button label="Go home" variant="primary" href="/" />
            <Button label="Read the docs" variant="secondary" href="/docs" />
          </HStack>
        </VStack>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
