// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { ChevronRight } from "lucide-react";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { AsciiWave } from "./demo/ascii-wave.tsx";
import type { Camera } from "./demo/ascii-wave.tsx";
import { say, WORD_MS } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { Footer } from "./footer.tsx";
import { heroMascotSize, Nav } from "./nav.tsx";
import { ivibeTheme } from "./theme.ts";
import { TopBar } from "./top-bar.tsx";

/**
 * A page that says one thing, in the home page's voice: a line, the mascot sitting in it like a
 * word, and a second line in italics that transcribes itself. Good news happens on the hero's dark
 * stage, with the waveform saying it. Anything else stays on quiet paper, with no voice at all.
 */

const FRAME_MARGIN = 12;
/** The waveform's size in pill units, as the hero's camera frames it (finale.tsx). */
const WAVE = { width: 62.5, height: 36 };

const PHONE = "@media (max-width: 559px)";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  paper: {
    minHeight: "86svh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 112,
    paddingBottom: 72,
    paddingInline: 16,
  },
  stageRoom: { position: "relative", height: "100svh" },
  stage: {
    position: "absolute",
    inset: FRAME_MARGIN,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#0f0e0d",
  },
  // The eye goes to the words; the waveform stays around them.
  quiet: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage:
      "radial-gradient(ellipse 52% 50% at 50% 50%, rgba(15, 14, 13, 0.92) 0%, rgba(15, 14, 13, 0.72) 55%, transparent 100%)",
  },
  stageWords: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingInline: 16,
    color: "var(--color-text-primary)",
  },
  words: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
    maxWidth: "100%",
    textAlign: "center",
  },
  headline: {
    fontSize: {
      default: "clamp(38px, min(2.4vw + 26px, 9.5vh), 84px)",
      [PHONE]: "clamp(34px, 10.5vw, 44px)",
    },
    lineHeight: 1.08,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  // Plain text, so a long line wraps and the mascot stays beside its last word.
  firstLine: { display: "block", textWrap: "balance" },
  // The canvas has room around the toy for it to move; it is pulled in to sit like a word.
  mascot: {
    display: "inline-flex",
    width: "1.05em",
    height: "1.1em",
    verticalAlign: "-0.28em",
    alignItems: "center",
    justifyContent: "center",
    marginInlineStart: "0.1em",
    marginInlineEnd: "-0.06em",
    overflow: "visible",
  },
  second: {
    display: "block",
    marginInline: "auto",
    maxWidth: "19em",
    textWrap: "balance",
    fontStyle: "italic",
    color: "var(--color-text-secondary)",
  },
  word: {
    display: "inline-block",
    animationName: "ivibe-word-in",
    animationDuration: "420ms",
    animationTimingFunction: "var(--motion-ease)",
    animationFillMode: "both",
  },
  line: { maxWidth: 560, textWrap: "balance", overflowWrap: "anywhere" },
  buttons: {
    display: "grid",
    gridAutoFlow: { default: "column", [PHONE]: "row" },
    gridAutoColumns: "1fr",
    gap: 12,
    width: "fit-content",
  },
});

export interface MomentAction {
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface MomentWords {
  /** Sits beside the mascot. */
  first: string;
  /** Says what happens now, in italics. */
  second: string;
  /** Anything that needs saying in plain words. */
  line?: string;
  /** The first is the main one. */
  actions?: MomentAction[];
  /** A small way out, under the buttons. */
  aside?: { label: string; href: string };
  mascot?: MascotState;
}

type PageProps = { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void };

/** The line, the mascot, and everything under them. */
function Words({ first, second, line, actions = [], aside, mascot = "idle" }: MomentWords) {
  const [size] = useState(heroMascotSize);
  const words = second.split(" ");
  return (
    <div {...stylex.props(styles.words)}>
      <Heading level={1} xstyle={styles.headline}>
        <span {...stylex.props(styles.firstLine)}>
          {first}
          <span {...stylex.props(styles.mascot)} aria-hidden="true">
            <Mascot size={size} state={mascot} shyHold={1.2} />
          </span>{" "}
        </span>
        {/* The key starts the words again when a page's second line changes. */}
        <span key={second} {...stylex.props(styles.second)}>
          {words.map((word, position) => (
            <span key={position}>
              <span
                {...stylex.props(styles.word)}
                style={{ animationDelay: `${180 + position * WORD_MS}ms` }}
              >
                {word}
              </span>
              {position < words.length - 1 ? " " : null}
            </span>
          ))}
        </span>
      </Heading>
      {line && (
        <Text color="secondary" xstyle={styles.line}>
          {line}
        </Text>
      )}
      {(actions.length > 0 || aside) && (
        <VStack gap={3} hAlign="center" className="touch-area">
          {actions.length > 0 && (
            <div {...stylex.props(styles.buttons)}>
              {actions.map((action, position) => (
                <Button
                  key={action.label}
                  label={action.label}
                  size="lg"
                  variant={position === 0 ? "primary" : "secondary"}
                  icon={action.icon}
                  href={action.href}
                />
              ))}
            </div>
          )}
          {aside && (
            <Link href={aside.href} size="sm" color="secondary">
              {aside.label}
              <ChevronRight
                size={13}
                strokeWidth={1.75}
                style={{ display: "inline", verticalAlign: "-2px", marginInlineStart: 4 }}
              />
            </Link>
          )}
        </VStack>
      )}
    </div>
  );
}

/** Quiet paper: for a problem, or anything that isn't news. */
export function Paper({ mode, onModeChange, ...words }: PageProps & MomentWords) {
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" mode={mode} onModeChange={onModeChange} />
      <main {...stylex.props(styles.paper)}>
        <Words {...words} />
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

/** The hero's dark stage, with the waveform saying the words as they appear. */
export function Stage({
  mode,
  onModeChange,
  tone = "Fix",
  ...words
}: PageProps & MomentWords & { tone?: Tone }) {
  const stage = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1, p: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      camera.current = {
        x: width / 2,
        y: height / 2,
        k: Math.max((width * 0.92) / WAVE.width, (height * 1.08) / WAVE.height),
        p: 0,
      };
      setSize({ width, height });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  const spoken = `${words.first} ${words.second}`;
  useEffect(() => say(spoken, tone), [spoken, tone]);

  const contentBox = useRef(() => {
    const box = content.current?.firstElementChild?.getBoundingClientRect();
    return box ? { top: box.top, bottom: box.bottom } : null;
  }).current;

  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode="dark">
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" mode={mode} onModeChange={onModeChange} />
      <main {...stylex.props(styles.stageRoom)}>
        <div ref={stage} {...stylex.props(styles.stage)}>
          {size.width > 0 && (
            <AsciiWave camera={camera} width={size.width} height={size.height} quiet={contentBox} />
          )}
          <div {...stylex.props(styles.quiet)} />
          <Theme theme={ivibeTheme} mode="dark">
            <div ref={content} {...stylex.props(styles.stageWords)}>
              <Words {...words} />
            </div>
          </Theme>
        </div>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
