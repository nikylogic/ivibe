// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { ChevronRight, Monitor, Moon, Sun } from "lucide-react";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import {
  FALLBACK_RELEASE,
  MAC_INSTALL,
  RELEASES_URL,
  REPO,
  detectPlatform,
  latestRelease,
} from "./release.ts";
import type { Download, Platform, Release } from "./release.ts";
import { Showcase } from "./demo/index.tsx";
import { ivibeTheme } from "./theme.ts";

/** What the headline says iVibe does, one mode at a time. */
const LINES = [
  { mode: "Fix", text: "captures bugs as precise prompts" },
  { mode: "Prompt", text: "turns rambling into clear prompts" },
  { mode: "Dictate", text: "tidies up everything you say" },
];
/** How long each line stays, and how long it takes to leave. */
const LINE_MS = 2800;
const LEAVE_MS = 260;

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  // Floats over the hero's desktop and the demo card.
  bar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: 14,
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "inherit",
  },
  brandIcon: { width: 30, height: 30, display: "block" },
  wordmark: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 28,
    lineHeight: 1,
    letterSpacing: "-0.01em",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
    paddingInline: 16,
    paddingBottom: 72,
    textAlign: "center",
  },
  headline: {
    fontSize: "clamp(44px, 7.2vw, 92px)",
    lineHeight: 1.04,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  firstLine: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  // The canvas has room around the toy for it to move; it is pulled in to sit like a word.
  mascot: {
    display: "inline-flex",
    width: "1.05em",
    height: "1.1em",
    alignItems: "center",
    justifyContent: "center",
    marginInlineStart: "0.04em",
    marginInlineEnd: "-0.06em",
    overflow: "visible",
  },
  // Holds the tallest line, so the page under it never moves as lines change.
  rotating: {
    display: "block",
    minHeight: "1.1em",
    fontStyle: "italic",
    color: "var(--color-text-secondary)",
  },
  lineIn: {
    display: "inline-block",
    animationName: "ivibe-line-in",
    animationDuration: "var(--motion-layout)",
    animationTimingFunction: "var(--motion-ease)",
    animationFillMode: "both",
  },
  lineOut: {
    display: "inline-block",
    animationName: "ivibe-line-out",
    animationDuration: `${LEAVE_MS}ms`,
    animationTimingFunction: "var(--motion-ease)",
    animationFillMode: "both",
  },
  sub: { maxWidth: 560 },
  popover: { width: 340, textAlign: "start" },
  downloadRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});

const appleIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" />
  </svg>
);

const windowsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2 4.4 10 3.3v8.1H2zm9-1.2L22 1.6v9.8H11zM2 12.6h8v8.1l-8-1.1zm9 0h11v9.8l-11-1.5z" />
  </svg>
);

const githubIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

const linuxIcon = <Monitor size={15} strokeWidth={1.75} aria-hidden="true" />;

const PLATFORM_BUTTONS: Record<
  Platform,
  { label: string; icon: ReactNode; pick: (release: Release) => Download }
> = {
  mac: { label: "Download for Mac", icon: appleIcon, pick: (release) => release.macArm },
  windows: {
    label: "Download for Windows",
    icon: windowsIcon,
    pick: (release) => release.windows,
  },
  linux: {
    label: "Download for Linux",
    icon: linuxIcon,
    pick: (release) => release.linuxAppImage,
  },
};

/** Cycles through LINES; each line rises in, waits, then rises out. */
function useRotatingLine(): { index: number; leaving: boolean } {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setLeaving(true);
      leaveTimer = setTimeout(() => {
        setIndex((current) => (current + 1) % LINES.length);
        setLeaving(false);
      }, LEAVE_MS);
    }, LINE_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(leaveTimer);
    };
  }, []);
  return { index, leaving };
}

function useRelease(): Release {
  const [release, setRelease] = useState<Release>(FALLBACK_RELEASE);
  useEffect(() => {
    latestRelease().then(setRelease, () => undefined);
  }, []);
  return release;
}

function TopBar({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  return (
    <header {...stylex.props(styles.bar)}>
      <a href="/" {...stylex.props(styles.brand)} aria-label="iVibe home">
        <img src="/favicon.svg" alt="" {...stylex.props(styles.brandIcon)} />
        <span {...stylex.props(styles.wordmark)}>iVibe</span>
      </a>
      <HStack gap={2} vAlign="center">
        <Button
          label="iVibe on GitHub"
          variant="ghost"
          isIconOnly
          icon={githubIcon}
          href={`https://github.com/${REPO}`}
          target="_blank"
          rel="noreferrer"
        />
        <SegmentedControl
          label="Appearance"
          size="sm"
          value={mode}
          onChange={(value) => onModeChange(value as ThemeMode)}
        >
          <SegmentedControlItem
            value="light"
            label="Light"
            isLabelHidden
            icon={<Sun size={14} />}
          />
          <SegmentedControlItem
            value="system"
            label="System"
            isLabelHidden
            icon={<Monitor size={14} />}
          />
          <SegmentedControlItem value="dark" label="Dark" isLabelHidden icon={<Moon size={14} />} />
        </SegmentedControl>
      </HStack>
    </header>
  );
}

function DownloadLink({ download }: { download: Download }) {
  return (
    <div {...stylex.props(styles.downloadRow)}>
      <Link href={download.url}>{download.label}</Link>
      {download.size && (
        <Text size="sm" color="secondary">
          {download.size}
        </Text>
      )}
    </div>
  );
}

function OtherPlatforms({ release }: { release: Release }) {
  return (
    <Popover
      label="Other platforms"
      placement="below"
      content={
        <VStack gap={3} xstyle={styles.popover}>
          <VStack gap={2}>
            <Text weight="semibold">
              iVibe {release.version ? `${release.version} ` : ""}downloads
            </Text>
            <DownloadLink download={release.macArm} />
            <DownloadLink download={release.macIntel} />
            <DownloadLink download={release.windows} />
            <DownloadLink download={release.linuxAppImage} />
            <DownloadLink download={release.linuxDeb} />
          </VStack>
          <VStack gap={1}>
            <Text size="sm" color="secondary">
              On a Mac, one line in Terminal installs it with no security prompt:
            </Text>
            <CodeBlock code={MAC_INSTALL} language="bash" hasCopyButton isWrapped size="sm" />
          </VStack>
          <Link href={RELEASES_URL} size="sm">
            All releases and release notes
          </Link>
        </VStack>
      }
    >
      <Button
        label="Other platforms and versions"
        variant="ghost"
        size="sm"
        endContent={<ChevronRight size={14} strokeWidth={1.75} />}
      />
    </Popover>
  );
}

function Hero() {
  const { index, leaving } = useRotatingLine();
  const release = useRelease();
  const detected = detectPlatform();
  // The visitor's own platform first and filled; Mac and Windows always show.
  const order: Platform[] =
    detected === "linux"
      ? ["linux", "mac", "windows"]
      : detected === "windows"
        ? ["windows", "mac"]
        : ["mac", "windows"];
  const line = LINES[index]!;

  return (
    <section {...stylex.props(styles.hero)}>
      <Heading level={1} xstyle={styles.headline}>
        <span {...stylex.props(styles.firstLine)}>
          iVibe
          <span {...stylex.props(styles.mascot)} aria-hidden="true">
            {/* A first hello: it blushes and glances away, then smiles back (scene.ts). */}
            <Mascot
              size={Math.round(Math.min(150, Math.max(78, window.innerWidth * 0.11)))}
              state="shy"
            />
          </span>
          , AI that
        </span>
        <span {...stylex.props(styles.rotating)}>
          <span
            key={index}
            {...stylex.props(leaving ? styles.lineOut : styles.lineIn)}
            aria-live="polite"
          >
            {line.text}
          </span>
        </span>
      </Heading>

      <VStack gap={3} hAlign="center">
        <HStack gap={3} hAlign="center" wrap="wrap">
          {order.map((platform, position) => {
            const button = PLATFORM_BUTTONS[platform];
            return (
              <Button
                key={platform}
                label={button.label}
                size="lg"
                variant={position === 0 && detected ? "primary" : "secondary"}
                icon={button.icon}
                href={button.pick(release).url}
              />
            );
          })}
        </HStack>
        <OtherPlatforms release={release} />
      </VStack>

      <VStack gap={1} hAlign="center" xstyle={styles.sub}>
        <Text size="lg" weight="medium">
          Show the bug, say what&apos;s wrong, paste the prompt.
        </Text>
        <Text size="lg" color="secondary">
          Screenshots that prove the bug, in Claude Code, Cursor, ChatGPT or any app you type in.
        </Text>
      </VStack>
    </section>
  );
}

export function Home({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const [heroDark, setHeroDark] = useState(true);
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={heroDark ? "dark" : mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <main>
        <Showcase theme={mode} hero={<Hero />} onHeroDark={setHeroDark} />
      </main>
    </div>
  );
}
