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
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import {
  FALLBACK_RELEASE,
  MAC_INSTALL,
  RELEASES_URL,
  detectPlatform,
  latestRelease,
} from "./release.ts";
import type { Download, Platform, Release } from "./release.ts";
import { Showcase } from "./demo/index.tsx";
import { say, WORD_MS } from "./demo/voice.ts";
import { ivibeTheme } from "./theme.ts";
import { heroMascotSize, Nav } from "./nav.tsx";

/** What the headline says iVibe does, one mode at a time. */
const LINES = [
  { mode: "Fix" as const, text: "captures bugs as precise prompts" },
  { mode: "Prompt" as const, text: "turns rambling into clear prompts" },
  { mode: "Dictate" as const, text: "tidies up everything you say" },
];
/** How long each line stays, and how long it takes to leave. */
const LINE_MS = 3800;
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
    // No brand on the left: the hero names iVibe. Just GitHub and the theme, on the right.
    justifyContent: "flex-end",
    paddingBlock: 14,
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingInline: 16,
    paddingBottom: 72,
    textAlign: "center",
  },
  headline: {
    fontSize: "clamp(34px, 4.4vw, 60px)",
    lineHeight: 1.08,
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
  lineIn: { display: "inline-block" },
  // Each word resolves as the pill says it, like a live transcription.
  word: {
    display: "inline-block",
    animationName: "ivibe-word-in",
    animationDuration: "420ms",
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
  sub: { maxWidth: 640, textWrap: "balance" },
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
  // The theme switch rests here through the hero and the demo, and leaves below the demo (the
  // footer has it there).
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const check = () => {
      const demo = document.getElementById("modes");
      setBelow(!!demo && demo.getBoundingClientRect().bottom < window.innerHeight - 1);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return (
    <header
      {...stylex.props(styles.bar)}
      style={{
        opacity: below ? 0 : 1,
        pointerEvents: below ? "none" : undefined,
        transition: "opacity 300ms ease",
      }}
    >
      <HStack gap={2} vAlign="center">
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

/** How long the mascot's first hello stays shy beyond the app's, in seconds. */
const SHY_HOLD = 3.4;

/**
 * The mascot's first hello on the site, one feeling after another: shy (turned away, blushing,
 * peeking back), a smile, then it listens as if you were talking, thinks, and is pleased with the
 * result. Times are when each starts, in ms; after the last it simply idles.
 */
const HELLO: { at: number; state: MascotState }[] = [
  { at: 0, state: "shy" },
  { at: 8_200 + 1_400, state: "recording" },
  { at: 8_200 + 4_600, state: "writing" },
  { at: 8_200 + 6_400, state: "done" },
  { at: 8_200 + 8_400, state: "idle" },
];

/** Plays the first hello, unless the visitor prefers less motion. */
function useHello(): MascotState {
  const [state, setState] = useState<MascotState>("shy");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = HELLO.slice(1).map(({ at, state }) => setTimeout(() => setState(state), at));
    return () => timers.forEach(clearTimeout);
  }, []);
  return state;
}

/** A voice for the mascot to listen to while it plays at recording: phrases with soft gaps. */
function pretendVoice(listener: (rms: number) => void): () => void {
  let frame = 0;
  const tick = (time: number) => {
    const s = time / 1000;
    const phrase = 0.5 + 0.5 * Math.sin(s * 1.7);
    listener(0.004 + 0.03 * phrase * (0.6 + 0.4 * Math.abs(Math.sin(s * 7.3))));
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function Hero({ release }: { release: Release }) {
  const mascot = useHello();
  const { index, leaving } = useRotatingLine();
  const detected = detectPlatform();
  // The visitor's own platform first and filled; Mac and Windows always show.
  const order: Platform[] =
    detected === "linux"
      ? ["linux", "mac", "windows"]
      : detected === "windows"
        ? ["windows", "mac"]
        : ["mac", "windows"];
  const line = LINES[index]!;
  // Each new line is said aloud by the pill behind the hero while its words type in.
  useEffect(() => say(line.text, line.mode), [line]);

  return (
    <section {...stylex.props(styles.hero)}>
      <Heading level={1} xstyle={styles.headline}>
        <span {...stylex.props(styles.firstLine)}>
          iVibe
          {/* The navbar borrows this mascot as you scroll (nav.tsx). */}
          <span id="hero-mascot" {...stylex.props(styles.mascot)} aria-hidden="true">
            {/* A first hello: it blushes and glances away, then smiles back (scene.ts). */}
            <Mascot
              size={heroMascotSize()}
              state={mascot}
              shyHold={SHY_HOLD}
              onLevel={pretendVoice}
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
            {line.text.split(" ").map((word, position, words) => (
              <span key={position}>
                <span
                  {...stylex.props(styles.word)}
                  style={{ animationDelay: `${position * WORD_MS}ms` }}
                >
                  {word}
                </span>
                {position < words.length - 1 ? " " : null}
              </span>
            ))}
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
        <Text size="base" weight="medium">
          Show the bug, say what&apos;s wrong, paste the prompt.
        </Text>
        <Text size="base" color="secondary">
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
  const release = useRelease();
  const platform = detectPlatform() ?? "mac";
  const button = PLATFORM_BUTTONS[platform];
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={heroDark ? "dark" : mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav
        download={{
          label: button.label,
          icon: button.icon,
          href: button.pick(release).url,
        }}
      />
      <main>
        <Showcase theme={mode} hero={<Hero release={release} />} onHeroDark={setHeroDark} />
      </main>
    </div>
  );
}
