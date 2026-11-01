// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Check } from "lucide-react";
import { CLEAN, FIX_PROMPT, ProofConsole, ProofPage } from "./demo/apps.tsx";
import { APP_NAME, AppIcon } from "./demo/icons.tsx";
import type { App } from "./demo/icons.tsx";
import { Hud, Toast } from "./demo/hud.tsx";
import type { HudPhase, Segment } from "./demo/hud.tsx";
import { bump, ease, MONO } from "./demo/kit.tsx";
import { TONES } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { detectPlatform } from "./release.ts";

/**
 * The features, one band each: a few words on one side, the real app on the other. Every scene is
 * iVibe's own pill (the same component as the demo, so sizes, colours and words match the app)
 * plus at most one thing beside it, playing a short loop while the band is on screen. With reduced
 * motion each scene rests on its last frame.
 */

const styles = stylex.create({
  band: {
    paddingBlock: { default: 120, "@media (max-width: 900px)": 72 },
    overflow: "hidden",
  },
  alt: {
    backgroundColor:
      "color-mix(in srgb, var(--color-text-primary) 3%, var(--color-background-surface))",
  },
  inner: {
    maxWidth: 1120,
    marginInline: "auto",
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 0.8fr) minmax(0, 1.2fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    columnGap: 72,
    rowGap: 40,
    alignItems: "center",
  },
  // The scene sits on the left on every other band, keeping the wider column; on a phone the
  // words always come first.
  flipped: {
    gridTemplateColumns: {
      default: "minmax(0, 1.2fr) minmax(0, 0.8fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
  },
  left: { order: { default: -1, "@media (max-width: 900px)": 0 } },
  words: { maxWidth: 420 },
  // The hero's serif, at its own weight.
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: "clamp(36px, 4vw, 52px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
    margin: 0,
  },
});

const tone = (name: Tone, alpha = 1) => `rgba(${TONES[name]}, ${alpha})`;
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Shown from `start`, fading and rising in over `ms`. */
function enter(t: number, start: number, ms = 320): CSSProperties {
  const shown = ease(t, start, ms);
  return { opacity: shown, transform: `translateY(${((1 - shown) * 8).toFixed(2)}px)` };
}

/** Shown from `start` until `end`. */
function during(t: number, start: number, end: number, ms = 300): CSSProperties {
  const shown = ease(t, start, ms) * (1 - ease(t, end, ms));
  return { opacity: shown, transform: `translateY(${((1 - shown) * 8).toFixed(2)}px)` };
}

/**
 * A story clock: `t` runs from 0 to `total` while the band is on screen, rests a moment, and
 * starts over. Off screen it stops.
 */
function useClock(total: number, rest = 1800) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [t, setT] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const watch = new IntersectionObserver(
      ([entry]) => setVisible(!!entry && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35] },
    );
    watch.observe(element);
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || still()) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setT(Math.min(total, (now - start) % (total + rest)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, total, rest]);
  return { box, t: still() ? total : t };
}

/** Tells the navbar mascot where to look (null: ahead again). */
function look(target: HTMLElement | null) {
  const box = target?.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("ivibe:look", {
      detail: box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null,
    }),
  );
}

/** A scene in fixed pixels, scaled down to fit its column, with the mode's light behind it. */
function Scene({
  clock,
  width,
  height,
  hue,
  children,
}: {
  clock: ReturnType<typeof useClock>;
  width: number;
  height: number;
  hue: Tone;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, element.clientWidth / width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div
      ref={clock.box}
      aria-hidden="true"
      onPointerEnter={(event) => look(event.currentTarget)}
      onPointerLeave={() => look(null)}
    >
      <div ref={frame} style={{ display: "grid", justifyItems: "center", width: "100%" }}>
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            style={{
              position: "relative",
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            {/* The mode's light, low behind the pill. */}
            <span
              style={{
                position: "absolute",
                left: "10%",
                right: "10%",
                bottom: -40,
                height: 220,
                background: `radial-gradient(50% 50% at 50% 60%, ${tone(hue, 0.16)}, transparent 70%)`,
                pointerEvents: "none",
              }}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The pill: anchored at the bottom so it grows upwards as the app's does, or, alone in its scene,
 * centred so it opens out both ways.
 */
function PillAt({
  phase,
  t,
  pressed,
  centred,
}: {
  phase: HudPhase | null;
  t: number;
  pressed?: boolean;
  centred?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        ...(centred ? { top: 0, bottom: 0, alignItems: "center" } : { bottom: 16 }),
        display: "flex",
        justifyContent: "center",
      }}
    >
      {phase && <Hud t={t} phase={phase} pressed={pressed} />}
    </div>
  );
}

/** The band: words on one side, the scene on the other. */
function Band({
  title,
  line,
  sceneLeft,
  alt,
  children,
}: {
  title: string;
  line: string;
  sceneLeft?: boolean;
  alt?: boolean;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.band, alt && styles.alt)}>
      <div {...stylex.props(styles.inner, sceneLeft && styles.flipped)}>
        <div {...stylex.props(styles.words)}>
          <VStack gap={4}>
            <Heading level={2} xstyle={styles.title}>
              {title}
            </Heading>
            <Text size="lg" color="secondary">
              {line}
            </Text>
          </VStack>
        </div>
        <div {...stylex.props(sceneLeft && styles.left)}>{children}</div>
      </div>
    </div>
  );
}

/** A keycap as it sits on a real keyboard. */
function Keycap({ label, width = 52 }: { label: string; width?: number }) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width,
        height: 48,
        borderRadius: 10,
        background: "var(--color-background-card)",
        color: "var(--color-text-primary)",
        fontSize: 13.5,
        fontWeight: 500,
        boxShadow:
          "inset 0 0 0 1px var(--color-border), 0 3px 0 var(--color-border), 0 10px 18px -10px rgba(0,0,0,0.3)",
      }}
    >
      {label}
    </span>
  );
}

// 1. Press a key. Just talk. -------------------------------------------------------------------

const TALK: Segment[] = [
  { text: "Hey Asha, um, the demo is, uh,", at: 1000, final: 1900 },
  { text: "the demo is ready for tomorrow.", at: 2000, final: 2900 },
  { text: "So, like, let me know what you think.", at: 3100, final: 4100 },
];
const TALK_MS = 8200;

function TalkScene() {
  const clock = useClock(TALK_MS);
  const { t } = clock;
  const mac = detectPlatform() === "mac";
  const phase: HudPhase | null =
    t < 500
      ? null
      : t < 4600
        ? { kind: "listening", since: 500, hint: "Listening. Speak naturally.", segments: TALK }
        : t < 5600
          ? { kind: "working", label: "Cleaning up your words for WhatsApp…" }
          : { kind: "pasted", label: "Pasted into WhatsApp" };
  return (
    <Scene clock={clock} width={560} height={300} hue="Dictate">
      {/* The shortcut, pressed... */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 36,
          display: "flex",
          justifyContent: "center",
          ...during(t, -300, 4600),
        }}
      >
        <span style={{ display: "flex", gap: 8, transform: `translateY(${bump(t, 250) * 3}px)` }}>
          {mac ? (
            <>
              <Keycap label="⌥" />
              <Keycap label="space" width={92} />
            </>
          ) : (
            <Keycap label="Caps Lock" width={108} />
          )}
        </span>
      </div>
      {/* ...and what you said, cleaned up and pasted. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 28,
          display: "flex",
          justifyContent: "center",
          ...enter(t, 5700, 420),
        }}
      >
        <Card padding={4} maxWidth={400}>
          <Text>{CLEAN}</Text>
        </Card>
      </div>
      <PillAt phase={phase} t={t} />
    </Scene>
  );
}

// 2. Show the bug. Get proof. ------------------------------------------------------------------

const BUG: Segment[] = [
  { text: "I change my bio and hit Save,", at: 500, final: 1300 },
  { text: "and nothing happens.", at: 1400, final: 2100 },
  { text: "The console says it can’t read map.", at: 2200, final: 3100 },
];
const PROOF_MS = 10_500;
const PROMPT_TEXT = FIX_PROMPT.map((row) => row.text).join("\n");

function ProofScene() {
  const clock = useClock(PROOF_MS);
  const { t } = clock;
  const label = "Pasted into Claude Code · 2 screenshots";
  const phase: HudPhase =
    t < 3400
      ? {
          kind: "listening",
          since: 0,
          hint: "Listening. Describe the bug as you show it.",
          segments: BUG,
        }
      : t < 4800
        ? { kind: "working", label: "Writing your fix prompt for Claude Code…" }
        : t < 5800
          ? { kind: "pasted", label }
          : {
              kind: "expanded",
              label,
              title: "Your prompt",
              shots: [
                <ProofPage key="page" dark={false} />,
                <ProofConsole key="console" dark={false} />,
              ],
              text: PROMPT_TEXT,
            };
  return (
    <Scene clock={clock} width={560} height={440} hue="Fix">
      <PillAt phase={phase} t={t} pressed={t > 5600 && t < 5800} centred />
    </Scene>
  );
}

// 3. Your secrets stay yours. ------------------------------------------------------------------

/** The screenshot, shown this many times its size in the pill. */
const ZOOM = 2.3;
const SECRETS_MS = 6400;

function SecretsScene() {
  const clock = useClock(SECRETS_MS);
  const { t } = clock;
  const phase: HudPhase =
    t < 1400
      ? { kind: "working", label: "Reading your screenshots…" }
      : t < 3600
        ? { kind: "working", label: "Hiding secrets on this device…" }
        : { kind: "pasted", label: "Pasted into Claude Code · 2 screenshots" };
  // The scan runs down the screenshot; the token is covered as it passes.
  const scan = Math.min(1, Math.max(0, (t - 500) / 1100));
  const covered = ease(t, 1150, 220);
  return (
    <Scene clock={clock} width={560} height={420} hue="Fix">
      <div
        style={{
          position: "absolute",
          left: (560 - 156 * ZOOM) / 2,
          top: 8,
          width: 156,
          height: 98,
          transform: `scale(${ZOOM})`,
          transformOrigin: "0 0",
          borderRadius: 10,
          boxShadow: "0 10px 24px -14px rgba(0,0,0,0.35)",
          outline: "0.5px solid var(--color-border)",
        }}
      >
        <ProofPage dark={false} />
        {/* The token as it was on screen, until it's covered. */}
        <span
          style={{
            position: "absolute",
            left: 12,
            top: 67,
            width: 126,
            height: 10,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            paddingLeft: 3,
            fontFamily: MONO,
            fontSize: 6.2,
            color: "#18181b",
            opacity: 1 - covered,
          }}
        >
          ghp_8fK2xQ9mWv3LtR7cY1nB
        </span>
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: scan * 96,
            height: 1,
            background: tone("Fix"),
            boxShadow: `0 0 6px 1px ${tone("Fix", 0.5)}`,
            opacity: scan > 0 && scan < 1 ? 1 : 0,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 262,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Toast t={t} at={1300}>
          Hid a GitHub token on this device
        </Toast>
      </div>
      <PillAt phase={phase} t={t} />
    </Scene>
  );
}

// 4. Paste where you type. ---------------------------------------------------------------------

const APPS: App[] = ["cursor", "claude", "notion", "whatsapp"];
const EACH = 1700;

function PasteScene() {
  const clock = useClock(APPS.length * EACH, 0);
  const { t } = clock;
  const index = Math.min(APPS.length - 1, Math.floor(t / EACH));
  const local = t - index * EACH;
  const name = APP_NAME[APPS[index]!];
  const phase: HudPhase =
    local < 600
      ? { kind: "working", label: `Writing for ${name}…` }
      : { kind: "pasted", label: `Pasted into ${name}` };
  return (
    <Scene clock={clock} width={560} height={240} hue="Prompt">
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 24,
          display: "flex",
          justifyContent: "center",
          gap: 22,
        }}
      >
        {APPS.map((app, at) => {
          const on = at === index;
          return (
            <span
              key={app}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                opacity: on ? 1 : 0.32,
                transform: on ? "translateY(-4px)" : "none",
                transition: "opacity 360ms ease, transform 360ms var(--motion-ease)",
              }}
            >
              <AppIcon app={app} size={54} os="mac" />
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: on ? "var(--color-text-primary)" : "transparent",
                  transition: "background 360ms ease",
                }}
              />
            </span>
          );
        })}
      </div>
      <PillAt phase={phase} t={t} />
    </Scene>
  );
}

// 5. Meta's AI. Free with your key. ------------------------------------------------------------

const MODELS = [
  { name: "Muse Voice", label: "Transcribing with Muse Voice…", from: 1600, to: 2700 },
  { name: "Muse Spark", label: "Finding the cause with Muse Spark…", from: 2700, to: 3900 },
  { name: "SAM 3.1", label: "Marking the proof with SAM 3.1…", from: 3900, to: 5000 },
];
const ASK: Segment[] = [{ text: "Why does Save do nothing?", at: 300, final: 1300 }];
const META_MS = 7800;

function MetaScene() {
  const clock = useClock(META_MS);
  const { t } = clock;
  const running = MODELS.find((model) => t >= model.from && t < model.to);
  const phase: HudPhase =
    t < 1600
      ? {
          kind: "listening",
          since: 0,
          hint: "Listening. Describe the bug as you show it.",
          segments: ASK,
        }
      : running
        ? { kind: "working", label: running.label }
        : { kind: "pasted", label: "Done, on your own Meta key" };
  return (
    <Scene clock={clock} width={560} height={240} hue="Prompt">
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 30,
          display: "flex",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {MODELS.map((model) => {
          const done = t >= model.to;
          const now = t >= model.from && !done;
          return (
            <span
              key={model.name}
              style={{ opacity: done || now ? 1 : 0.4, transition: "opacity 300ms ease" }}
            >
              <Badge
                label={model.name}
                variant="neutral"
                icon={
                  done ? (
                    <Check size={12} strokeWidth={3} aria-hidden="true" />
                  ) : now ? (
                    <Spinner size="sm" />
                  ) : undefined
                }
              />
            </span>
          );
        })}
      </div>
      <PillAt phase={phase} t={t} />
    </Scene>
  );
}

// ---------------------------------------------------------------------------------------------

export function Features() {
  return (
    <section id="features">
      <Band
        title="Press a key. Just talk."
        line="One shortcut, in any app. Ramble all you like, it comes out clean."
        sceneLeft
      >
        <TalkScene />
      </Band>
      <Band
        title="Show the bug. Get proof."
        line="A clear fix prompt, with screenshots marked where it broke."
        alt
      >
        <ProofScene />
      </Band>
      <Band
        title="Your secrets stay yours."
        line="Keys and passwords are blacked out on your device, before anything leaves it."
        sceneLeft
      >
        <SecretsScene />
      </Band>
      <Band
        title="Paste where you type."
        line="Cursor, Claude, Notion, WhatsApp. Anywhere with a text box."
        alt
      >
        <PasteScene />
      </Band>
      <Band
        title="Meta's AI. Free with your key."
        line="Bring your Meta API key. No account, and no bill from us."
        sceneLeft
      >
        <MetaScene />
      </Band>
    </section>
  );
}
