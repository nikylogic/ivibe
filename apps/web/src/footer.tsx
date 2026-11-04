// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { scrollToDemo } from "./demo/scroll.ts";
import { REPO } from "./release.ts";
import { ThemeSwitch } from "./theme-switch.tsx";

/** The guide pages. Listed here, every page links to them, which is how they reach the sitemap. */
const GUIDE_LINKS = [
  { path: "/voice-to-prompt", label: "Voice to prompt" },
  { path: "/open-source-dictation", label: "Open-source dictation" },
  { path: "/compare/wispr-flow", label: "Wispr Flow alternative" },
  { path: "/compare/superwhisper", label: "Superwhisper alternative" },
];

const styles = stylex.create({
  footer: {
    backgroundColor: "var(--color-background-surface)",
    paddingTop: { default: 56, "@media (max-width: 720px)": 40 },
    paddingBottom: 28,
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
  footerInner: {
    maxWidth: 1040,
    marginInline: "auto",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) auto auto auto",
      "@media (max-width: 720px)": "minmax(0, 1fr) minmax(0, 1fr)",
    },
    columnGap: 64,
    rowGap: 32,
    alignItems: "start",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    gridColumn: { default: "auto", "@media (max-width: 720px)": "1 / -1" },
  },
  links: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: { default: 10, "@media (pointer: coarse)": 22 },
  },
  fine: {
    maxWidth: 1040,
    marginInline: "auto",
    marginTop: 40,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fineLinks: {
    display: "flex",
    flexWrap: "wrap",
    gap: { default: 16, "@media (pointer: coarse)": 24 },
  },
});

export function Footer({
  mode,
  onModeChange,
  home = false,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  /** Only the home page's switch has left the top of the screen by the time you get here. */
  home?: boolean;
}) {
  const github = `https://github.com/${REPO}`;
  return (
    <footer className="touch-area" {...stylex.props(styles.footer)}>
      <div {...stylex.props(styles.footerInner)}>
        <div {...stylex.props(styles.brand)}>
          <Mascot size={40} state="idle" />
          <div>
            <Text weight="medium">iVibe</Text>
            <br />
            <Text size="sm" color="secondary">
              Made in the open.
            </Text>
          </div>
        </div>
        <nav aria-label="Product" {...stylex.props(styles.links)}>
          {home ? (
            <Link size="sm" onClick={scrollToDemo}>
              How it works
            </Link>
          ) : (
            <Link href="/#how" size="sm">
              How it works
            </Link>
          )}
          <Link href={home ? "#pricing" : "/#pricing"} size="sm">
            Pricing
          </Link>
          <Link href={home ? "#film" : "/#film"} size="sm">
            Demo film
          </Link>
          <Link href="/docs" size="sm">
            Docs
          </Link>
          <Link href="/blog" size="sm">
            Blog
          </Link>
          <Link href={`${github}/releases`} size="sm">
            Changelog
          </Link>
          <Link href="/download" size="sm">
            Download
          </Link>
        </nav>
        <nav aria-label="Guides" {...stylex.props(styles.links)}>
          {GUIDE_LINKS.map((guide) => (
            <Link key={guide.path} href={guide.path} size="sm">
              {guide.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Community" {...stylex.props(styles.links)}>
          <Link href={github} size="sm">
            GitHub
          </Link>
          <Link href={`${github}/discussions`} size="sm">
            Suggest a feature
          </Link>
          <Link href="mailto:business@ivibe.tech" size="sm">
            business@ivibe.tech
          </Link>
        </nav>
        {home && <ThemeSwitch mode={mode} onModeChange={onModeChange} />}
      </div>
      <div {...stylex.props(styles.fine)}>
        <Text size="sm" color="secondary">
          © 2026 iVibe. Open source under AGPL-3.0.
        </Text>
        <nav aria-label="Legal" {...stylex.props(styles.fineLinks)}>
          <Link href="/privacy" size="sm">
            Privacy
          </Link>
          <Link href="/terms" size="sm">
            Terms
          </Link>
          <Link href="/refunds" size="sm">
            Refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
