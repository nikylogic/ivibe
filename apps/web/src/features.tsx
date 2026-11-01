// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Check, Copy, EyeOff, KeyRound, Lock, Mic } from "lucide-react";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { AppIcon } from "./demo/icons.tsx";
import type { App } from "./demo/icons.tsx";
import { MONO } from "./demo/kit.tsx";
import { TONES } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { detectPlatform } from "./release.ts";

/**
 * The features, one band each: a few words on one side, a small living scene on the other, the
 * sides alternating down the page. Each scene is a short story told with real iVibe UI and the
 * mascot; it plays when the band comes into view and loops while it stays. Motion is CSS
 * keyframes on opacity, transform and clip-path, plus a gentle scroll parallax for the floating
 * pieces. With reduced motion every scene rests on its final frame.
 */

const styles = stylex.create({
  band: {
    paddingBlock: { default: 112, "@media (max-width: 900px)": 72 },
    overflow: "hidden",
  },
  alt: {
    backgroundColor:
      "color-mix(in srgb, var(--color-text-primary) 3.5%, var(--color-background-surface))",
  },
  inner: {
    maxWidth: 1180,
    marginInline: "auto",
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 0.85fr) minmax(0, 1.15fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    columnGap: 64,
    rowGap: 40,
    alignItems: "center",
  },
  // Scenes on the left on every other band; on a phone the words always come first.
  left: { order: { default: -1, "@media (max-width: 900px)": 0 } },
  words: { maxWidth: 500 },
  // The hero's serif, at its own weight.
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: "clamp(36px, 4vw, 54px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
    margin: 0,
  },
});

/** A colour from the voice tones, at some opacity. */
const tone = (name: Tone, alpha = 1) => `rgba(${TONES[name]}, ${alpha})`;
/** The page's text colour, thinned: mock UI that follows the theme. */
const ink = (percent: number) =>
  `color-mix(in srgb, var(--color-text-primary) ${percent}%, transparent)`;
const white = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;
const PAPER = "#f4f1ec";
const SERIF = '"Instrument Serif", Georgia, serif';
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** An animated part: `name` is a keyframe in global.css, `when` its start within the story. */
function anim(name: string, when: number, ms = 600, extra?: CSSProperties): CSSProperties {
  return {
    animationName: name,
    animationDelay: `${when}ms`,
    animationDuration: `${ms}ms`,
    ...extra,
  };
}

/** Absolutely placed, in the scene's own pixels. */
const at = (x: number, y: number, extra?: CSSProperties): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  ...extra,
});

// ---------------------------------------------------------------------------------------------
// The machinery: a band that knows when it's on screen, and a story clock.

/**
 * Plays a story while the band is on screen: `step` counts how many of `times` have passed, and
 * `round` changes each time it starts over (on arrival, and on a loop while it stays).
 */
function useStory(times: number[], total: number) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false);
  const [round, setRound] = useState(0);
  const [passed, setPassed] = useState({ round: 0, step: 0 });
  const was = useRef(false);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        const now = !!entry && entry.intersectionRatio >= 0.4;
        if (now && !was.current) setRound((value) => value + 1);
        was.current = now;
        setVisible(now);
      },
      { threshold: [0, 0.4] },
    );
    // The mascot's 3D scene only exists while the band is close.
    const close = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), {
      rootMargin: "400px 0px",
    });
    watch.observe(element);
    close.observe(element);
    return () => {
      watch.disconnect();
      close.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!visible || still()) return;
    const timers = times.map((time, index) =>
      setTimeout(() => setPassed({ round, step: index + 1 }), time),
    );
    timers.push(setTimeout(() => setRound((value) => value + 1), total + 2600));
    return () => timers.forEach(clearTimeout);
  }, [visible, round, times, total]);
  const step = still() ? times.length : passed.round === round ? passed.step : 0;
  return { box, visible, near, round, step };
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

/**
 * A scene drawn in fixed pixels and scaled to its column. `--ivf-p` (-1 to 1, the band's place on
 * screen) drives the parallax of the floating pieces.
 */
function Scene({
  width,
  height,
  story,
  under,
  over,
  children,
}: {
  width: number;
  height: number;
  story: ReturnType<typeof useStory>;
  /** Kept across loops (the mascot), drawn under or over the story. */
  under?: ReactNode;
  over?: ReactNode;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1.12, element.clientWidth / width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  useEffect(() => {
    const element = frame.current;
    if (!element || still()) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const box = element.getBoundingClientRect();
      const p = (box.top + box.height / 2 - window.innerHeight / 2) / window.innerHeight;
      element.style.setProperty("--ivf-p", Math.max(-1, Math.min(1, p)).toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={story.box}
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
            {under}
            <div
              key={story.round}
              className={story.visible ? "ivf-run" : undefined}
              style={{ position: "absolute", inset: 0 }}
            >
              {children}
            </div>
            {over}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One band: the words and the scene. */
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
      <div {...stylex.props(styles.inner)}>
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

// ---------------------------------------------------------------------------------------------
// Pieces the scenes share.

/** Something that floats beside the scene: a slow bob, and parallax with the scroll. */
function Float({
  x,
  y,
  depth,
  rotate = 0,
  children,
}: {
  x: number;
  y: number;
  depth: number;
  rotate?: number;
  children: ReactNode;
}) {
  return (
    <span
      style={at(x, y, {
        transform: `translate3d(0, calc(var(--ivf-p, 0) * ${-depth}px), 0) rotate(${rotate}deg)`,
        willChange: "transform",
      })}
    >
      <span className="ivf-bob" style={{ display: "block", animationDelay: `${-(x % 5) * 0.7}s` }}>
        {children}
      </span>
    </span>
  );
}

/** iVibe's app, as a dark device the story happens in. */
function Device({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <span
      style={at(x, y, {
        width: w,
        height: h,
        borderRadius: 34,
        background: "linear-gradient(180deg, #262422 0%, #151413 38%, #121110 100%)",
        boxShadow: `inset 0 0 0 1px ${white(0.08)}, 0 40px 70px -36px rgba(0,0,0,0.65)`,
      })}
    />
  );
}

/** The mascot, kept alive across loops; only drawn while its band is close. */
function Buddy({
  story,
  x,
  y,
  size,
  mood,
}: {
  story: ReturnType<typeof useStory>;
  x: number;
  y: number;
  size: number;
  mood: MascotState;
}) {
  return (
    <span style={at(x - size / 2, y, { width: size, height: size, pointerEvents: "none" })}>
      {story.near && <Mascot size={size} state={mood} />}
    </span>
  );
}

/** The mascot's name tag, with what it's doing now. */
function NameTag({ x, y, status, hue }: { x: number; y: number; status: string; hue: Tone }) {
  return (
    <span
      style={at(x, y, {
        transform: "translateX(-50%)",
        padding: "6px 14px 7px",
        borderRadius: 13,
        background: "rgba(44, 42, 40, 0.96)",
        boxShadow: `inset 0 0 0 1px ${white(0.08)}, 0 8px 18px -8px rgba(0,0,0,0.5)`,
        color: "#fff",
        textAlign: "center",
        whiteSpace: "nowrap",
      })}
    >
      <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>iVibe</span>
      <span
        key={status}
        className="ivf-tag"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 11.5,
          color: white(0.62),
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 3, background: tone(hue) }} />
        {status}
      </span>
    </span>
  );
}

/** A waveform: still, or talking in the mode's colour. */
function Wave({ hue, bars = 13, talking }: { hue: Tone; bars?: number; talking: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 3.5 }}>
      {Array.from({ length: bars }, (_, index) => {
        const middle = 1 - Math.abs(index - (bars - 1) / 2) / ((bars + 1) / 2);
        return (
          <span
            key={index}
            className={talking ? "ivf-a" : undefined}
            style={{
              width: 3,
              height: 6 + 14 * middle,
              borderRadius: 2,
              background: tone(hue, talking ? 1 : 0.45),
              transform: "scaleY(0.4)",
              transition: "background 300ms ease",
              ...(talking
                ? anim("ivf-wave", index * 60, 520 + ((index * 137) % 260), {
                    animationIterationCount: "infinite",
                    animationDirection: "alternate",
                    animationTimingFunction: "ease-in-out",
                  })
                : {}),
            }}
          />
        );
      })}
    </span>
  );
}

/** iVibe's pill. */
function Pill({
  x,
  y,
  w,
  hue,
  talking,
}: {
  x: number;
  y: number;
  w: number;
  hue: Tone;
  talking: boolean;
}) {
  return (
    <span
      style={at(x, y, {
        width: w,
        height: 40,
        borderRadius: 20,
        display: "grid",
        placeItems: "center",
        background: "rgba(15, 14, 13, 0.95)",
        boxShadow: `inset 0 0 0 1px ${white(0.08)}, 0 0 28px -6px ${tone(hue, 0.6)}, 0 14px 30px -14px rgba(0,0,0,0.6)`,
      })}
    >
      <Wave hue={hue} bars={11} talking={talking} />
    </span>
  );
}

/** A keycap as it sits on a real keyboard. */
function Keycap({ label, width = 56 }: { label: string; width?: number }) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width,
        height: 54,
        borderRadius: 11,
        background: "var(--color-background-card)",
        color: "var(--color-text-primary)",
        fontSize: 14,
        fontWeight: 500,
        boxShadow: `inset 0 0 0 1px ${ink(14)}, 0 4px 0 ${ink(16)}, 0 12px 22px -10px rgba(0,0,0,0.35)`,
      }}
    >
      {label}
    </span>
  );
}

function Bar({
  x,
  y,
  w,
  h,
  color,
  r = 2,
  style,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  r?: number;
  style?: CSSProperties;
}) {
  return (
    <span style={at(x, y, { width: w, height: h, borderRadius: r, background: color, ...style })} />
  );
}

/** A bar that draws itself in from the left. */
function Line({
  x,
  y,
  w,
  color,
  when,
  h = 4,
}: {
  x: number;
  y: number;
  w: number;
  color: string;
  when: number;
  h?: number;
}) {
  return (
    <span
      className="ivf-a"
      style={at(x, y, {
        width: w,
        height: h,
        borderRadius: h / 2,
        background: color,
        transformOrigin: "0 50%",
        ...anim("ivf-fill", when, 420, { animationTimingFunction: "cubic-bezier(.4,0,.2,1)" }),
      })}
    />
  );
}

/** A numbered pin, dropped on what an outline marks. */
function Pin({ x, y, n, when }: { x: number; y: number; n: number; when: number }) {
  return (
    <span
      className="ivf-a"
      style={at(x - 11, y - 11, {
        width: 22,
        height: 22,
        borderRadius: 11,
        display: "grid",
        placeItems: "center",
        background: tone("Fix"),
        color: "#fff",
        fontSize: 11.5,
        fontWeight: 700,
        boxShadow: `0 4px 12px -2px ${tone("Fix", 0.6)}`,
        ...anim("ivf-pop", when, 420),
      })}
    >
      {n}
    </span>
  );
}

/** An outline that draws itself around something. */
function Outline({
  x,
  y,
  w,
  h,
  when,
  ms = 700,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  when: number;
  ms?: number;
}) {
  return (
    <svg width={w + 4} height={h + 4} style={at(x - 2, y - 2, { overflow: "visible" })}>
      <rect
        className="ivf-a"
        x={2}
        y={2}
        width={w}
        height={h}
        rx={9}
        pathLength={1}
        strokeDasharray={1}
        style={{
          fill: "none",
          stroke: tone("Fix"),
          strokeWidth: 2,
          ...anim("ivf-draw", when, ms, { animationTimingFunction: "ease-in-out" }),
        }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Press a key. Just talk.

const SAID = [
  { word: "um", filler: true },
  { word: "so" },
  { word: "tell" },
  { word: "Asha" },
  { word: "the" },
  { word: "demo" },
  { word: "is" },
  { word: "uh", filler: true },
  { word: "ready" },
  { word: "for" },
  { word: "tomorrow" },
];
const TALK_TIMES = [600, 3200, 4100];
const TALK_MS = 5000;

function TalkScene() {
  const story = useStory(TALK_TIMES, TALK_MS);
  const { step } = story;
  const mac = detectPlatform() === "mac";
  const mood = (["idle", "recording", "writing", "done"] as const)[step]!;
  const status = ["Ready", "Listening…", "Tidying up…", "Pasted"][step]!;
  return (
    <Scene
      width={540}
      height={480}
      story={story}
      over={
        <>
          <Buddy story={story} x={270} y={0} size={80} mood={mood} />
          <NameTag x={270} y={84} status={status} hue="Dictate" />
        </>
      }
    >
      <Device x={130} y={44} w={280} h={420} />
      {/* What you said, as you said it. */}
      <span
        className="ivf-a"
        style={at(194, 172, {
          width: 196,
          padding: "10px 13px",
          borderRadius: "16px 16px 4px 16px",
          background: tone("Dictate", 0.92),
          color: "#fff",
          fontSize: 13.5,
          lineHeight: 1.4,
          ...anim("ivf-rise", 800, 300),
        })}
      >
        {SAID.map((item, index) => (
          <span
            key={index}
            className="ivf-a"
            style={{
              opacity: item.filler ? 0.55 : 1,
              ...anim("ivf-word", 900 + index * 190, 260),
            }}
          >
            {item.word}{" "}
          </span>
        ))}
      </span>
      {/* What it becomes. */}
      <span
        className="ivf-a"
        style={at(150, 280, {
          width: 206,
          padding: "10px 13px",
          borderRadius: "16px 16px 16px 4px",
          background: PAPER,
          color: "#1b1a19",
          fontSize: 13.5,
          lineHeight: 1.4,
          ...anim("ivf-rise", 3900, 420),
        })}
      >
        Hey Asha, the demo is ready for tomorrow.
      </span>
      <span
        className="ivf-a"
        style={at(152, 352, {
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11.5,
          color: white(0.55),
          ...anim("ivf-rise", 4300, 360),
        })}
      >
        <AppIcon app="whatsapp" size={16} os="mac" />
        In WhatsApp
      </span>
      {/* The pill, at the bottom of the app. */}
      <span
        style={at(148, 396, {
          width: 244,
          height: 46,
          borderRadius: 23,
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingInline: 16,
          background: white(0.07),
          boxShadow: `inset 0 0 0 1px ${white(0.06)}`,
          color: white(0.5),
        })}
      >
        <Mic size={16} />
        <Wave hue="Dictate" talking={step === 1} />
      </span>
      {/* The shortcut, pressed. */}
      <Float x={0} y={128} depth={36} rotate={-9}>
        <span className="ivf-a" style={{ display: "flex", gap: 8, ...anim("ivf-press", 420, 480) }}>
          {mac ? (
            <>
              <Keycap label="⌥" />
              <Keycap label="space" width={96} />
            </>
          ) : (
            <Keycap label="Caps Lock" width={112} />
          )}
        </span>
      </Float>
      {/* The ums and uhs float off, and get dropped. */}
      {[
        { word: "um", x: 438, y: 168, when: 950, rotate: 8 },
        { word: "so…", x: 430, y: 330, when: 1150, rotate: 5 },
        { word: "uh", x: 462, y: 252, when: 2250, rotate: -6 },
      ].map((filler) => (
        <Float key={filler.word} x={filler.x} y={filler.y} depth={60} rotate={filler.rotate}>
          <span
            className="ivf-a"
            style={{ display: "block", ...anim("ivf-pop", filler.when, 380) }}
          >
            <span
              className="ivf-a"
              style={{
                display: "block",
                padding: "6px 12px",
                borderRadius: 12,
                background: "var(--color-background-card)",
                color: "var(--color-text-secondary)",
                boxShadow: `inset 0 0 0 1px ${ink(10)}, 0 10px 20px -12px rgba(0,0,0,0.4)`,
                fontSize: 14,
                textDecoration: "line-through",
                textDecorationColor: tone("Dictate"),
                opacity: 0,
                ...anim("ivf-drop", 3200 + (filler.y - 168), 700),
              }}
            >
              {filler.word}
            </span>
          </span>
        </Float>
      ))}
    </Scene>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Show the bug. Get proof.

const PROOF_TIMES = [2400, 4000];
const PROOF_MS = 5000;

/** A tiny copy of a marked screenshot. */
function Thumb({
  x,
  y,
  when,
  mark,
}: {
  x: number;
  y: number;
  when: number;
  mark: "error" | "button";
}) {
  return (
    <span
      className="ivf-a"
      style={at(x, y, {
        width: 98,
        height: 66,
        borderRadius: 9,
        background: PAPER,
        overflow: "hidden",
        boxShadow: "0 8px 18px -8px rgba(0,0,0,0.6)",
        ...anim("ivf-pop", when, 420),
      })}
    >
      {mark === "error" ? (
        <>
          <Bar x={8} y={10} w={60} h={4} color="rgba(0,0,0,0.25)" />
          <Bar x={8} y={22} w={82} h={26} r={4} color="rgba(235,72,56,0.14)" />
          <Bar x={13} y={28} w={60} h={3} color="rgba(225,70,55,0.8)" />
          <Bar x={13} y={36} w={44} h={3} color="rgba(225,70,55,0.55)" />
          <span
            style={at(5, 19, {
              width: 86,
              height: 31,
              borderRadius: 6,
              boxShadow: `inset 0 0 0 1.5px ${tone("Fix")}`,
            })}
          />
        </>
      ) : (
        <>
          <Bar x={8} y={10} w={50} h={4} color="rgba(0,0,0,0.3)" />
          <Bar x={8} y={20} w={80} h={9} r={3} color="rgba(0,0,0,0.07)" />
          <Bar x={8} y={34} w={80} h={9} r={3} color="rgba(0,0,0,0.07)" />
          <Bar x={8} y={49} w={28} h={10} r={3} color="rgba(0,0,0,0.75)" />
          <span
            style={at(4, 45, {
              width: 36,
              height: 18,
              borderRadius: 5,
              boxShadow: `inset 0 0 0 1.5px ${tone("Fix")}`,
            })}
          />
        </>
      )}
    </span>
  );
}

function ProofScene() {
  const story = useStory(PROOF_TIMES, PROOF_MS);
  const { step } = story;
  const mood = (["recording", "writing", "done"] as const)[step]!;
  const status = ["Watching…", "Writing the prompt…", "Ready to paste"][step]!;
  return (
    <Scene
      width={580}
      height={480}
      story={story}
      over={
        <>
          <Buddy story={story} x={451} y={66} size={68} mood={mood} />
          <NameTag x={451} y={138} status={status} hue="Fix" />
        </>
      }
    >
      {/* Your app, with the bug. */}
      <span
        style={at(0, 40, {
          width: 390,
          height: 280,
          borderRadius: 14,
          overflow: "hidden",
          background: "var(--color-background-surface)",
          boxShadow: `inset 0 0 0 1px ${ink(12)}, 0 30px 60px -34px rgba(0,0,0,0.55)`,
        })}
      >
        <Bar x={14} y={12} w={9} h={9} r={5} color={ink(16)} />
        <Bar x={28} y={12} w={9} h={9} r={5} color={ink(16)} />
        <Bar x={42} y={12} w={9} h={9} r={5} color={ink(16)} />
        <Bar x={110} y={9} w={190} h={15} r={8} color={ink(7)} />
        <Bar x={0} y={32} w={390} h={1} r={0} color={ink(10)} />
        <Bar x={20} y={54} w={96} h={9} color={ink(70)} />
        <Bar x={20} y={78} w={40} h={4} color={ink(30)} />
        <Bar x={20} y={86} w={166} h={24} r={6} color={ink(5)} />
        <Bar x={20} y={122} w={52} h={4} color={ink(30)} />
        <Bar x={20} y={130} w={166} h={24} r={6} color={ink(5)} />
        <Bar x={20} y={176} w={64} h={26} r={7} color={ink(84)} />
        <Bar x={206} y={33} w={1} h={247} r={0} color={ink(10)} />
        <Bar x={207} y={33} w={183} h={247} r={0} color={ink(3)} />
        <Bar x={218} y={46} w={34} h={4} color={ink(25)} />
        <Bar x={258} y={46} w={34} h={4} color={ink(12)} />
        <Bar x={212} y={64} w={172} h={58} r={7} color="rgba(235, 72, 56, 0.1)" />
        <Bar x={222} y={76} w={130} h={4} color="rgba(225, 70, 55, 0.85)" />
        <Bar x={222} y={88} w={104} h={4} color="rgba(225, 70, 55, 0.6)" />
        <Bar x={232} y={100} w={84} h={4} color="rgba(225, 70, 55, 0.6)" />
        <Bar x={218} y={140} w={120} h={4} color={ink(14)} />
        <Bar x={218} y={152} w={90} h={4} color={ink(14)} />
      </span>
      {/* You click Save; iVibe marks what broke. */}
      <span className="ivf-a" style={at(66, 228, anim("ivf-cursor", 150, 650))}>
        <svg width="18" height="22" viewBox="0 0 18 22">
          <path
            d="M1 1v17l4.5-4.2 3 6.8 3-1.3-3-6.6H15z"
            fill="#111"
            stroke="#fff"
            strokeWidth="1.4"
          />
        </svg>
      </span>
      <Outline x={208} y={100} w={180} h={66} when={900} />
      <Pin x={388} y={100} n={1} when={1600} />
      <Outline x={14} y={210} w={76} h={38} when={1800} ms={600} />
      <Pin x={90} y={210} n={2} when={2350} />
      {/* The prompt, with the proof. */}
      <Device x={326} y={110} w={250} h={360} />
      <Thumb x={344} y={212} when={2500} mark="error" />
      <Thumb x={460} y={212} when={2700} mark="button" />
      <span
        className="ivf-a"
        style={at(344, 296, {
          width: 214,
          height: 112,
          borderRadius: 14,
          background: white(0.06),
          boxShadow: `inset 0 0 0 1px ${white(0.06)}`,
          ...anim("ivf-rise", 2850, 380),
        })}
      >
        <span style={at(14, 12, { fontSize: 11, color: white(0.5) })}>Fix prompt</span>
      </span>
      {[186, 160, 176, 118, 150].map((w, index) => (
        <Line
          key={index}
          x={358}
          y={334 + index * 13}
          w={w}
          color={white(0.5)}
          when={3000 + index * 150}
        />
      ))}
      <span
        className="ivf-a"
        style={at(344, 420, {
          width: 214,
          height: 34,
          borderRadius: 17,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          background: PAPER,
          color: "#1b1a19",
          fontSize: 12.5,
          fontWeight: 600,
          ...anim("ivf-pop", 3950, 380),
        })}
      >
        <Copy size={13} strokeWidth={2.2} />
        Copy prompt
      </span>
    </Scene>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Your secrets stay yours.

const ENV: { key: string; value: string; secret?: boolean }[] = [
  { key: "META_API_KEY", value: "mk_live_9f2c4e7a1b38d0e6", secret: true },
  { key: "PORT", value: "5173" },
  { key: "DB_PASSWORD", value: "correct-horse-battery", secret: true },
  { key: "PAYMENTS_KEY", value: "pk_4eC39HqLyjWDarjtT1", secret: true },
  { key: "NODE_ENV", value: "development" },
];
const ROW = 32;
const FIRST = 132;
const SCAN_FROM = 600;
const SCAN_MS = 1700;
const SCAN_SPAN = ENV.length * ROW + 10;
const SECRET_TIMES = [SCAN_FROM + SCAN_MS + 200];
const SECRET_MS = 4200;

function SecretsScene() {
  const story = useStory(SECRET_TIMES, SECRET_MS);
  // Shy while your secrets are on show; pleased once they're covered.
  const mood: MascotState = story.step === 0 ? "shy" : "done";
  return (
    <Scene
      width={560}
      height={440}
      story={story}
      under={<Buddy story={story} x={440} y={4} size={104} mood={mood} />}
    >
      <span
        style={at(10, 74, {
          width: 520,
          height: 270,
          borderRadius: 16,
          overflow: "hidden",
          background: "#1a1918",
          boxShadow: `inset 0 0 0 1px ${white(0.08)}, 0 40px 70px -36px rgba(0,0,0,0.65)`,
        })}
      >
        <Bar x={16} y={15} w={10} h={10} r={5} color={white(0.14)} />
        <Bar x={32} y={15} w={10} h={10} r={5} color={white(0.14)} />
        <Bar x={48} y={15} w={10} h={10} r={5} color={white(0.14)} />
        <span style={at(244, 12, { color: white(0.45), fontSize: 12, fontFamily: MONO })}>
          .env
        </span>
        <Bar x={0} y={38} w={520} h={1} r={0} color={white(0.07)} />
      </span>
      {ENV.map((line, index) => {
        const y = FIRST + index * ROW;
        // Each box lands as the scan reaches its row.
        const reached = SCAN_FROM + ((y - FIRST + 10) / SCAN_SPAN) * SCAN_MS;
        return (
          <span
            key={line.key}
            style={at(30, y, { whiteSpace: "pre", fontFamily: MONO, fontSize: 14 })}
          >
            <span style={{ color: white(0.25) }}>{index + 1} </span>
            <span style={{ color: "rgba(255, 196, 140, 0.92)" }}>{line.key}</span>
            <span style={{ color: white(0.35) }}>=</span>
            <span style={{ position: "relative", color: white(0.82) }}>
              {line.value}
              {line.secret && (
                <span
                  className="ivf-a"
                  style={{
                    position: "absolute",
                    inset: "-4px -5px",
                    borderRadius: 4,
                    background: "#000",
                    boxShadow: `inset 0 0 0 1px ${white(0.1)}`,
                    transformOrigin: "0 50%",
                    ...anim("ivf-cover", reached, 280),
                  }}
                />
              )}
            </span>
          </span>
        );
      })}
      {/* Read on this device, line by line, before anything leaves it. */}
      <span
        className="ivf-a"
        style={at(10, FIRST - 10, {
          width: 520,
          height: 2,
          opacity: 0,
          background: `linear-gradient(90deg, transparent, ${tone("Fix", 0.95)} 25%, ${tone("Fix", 0.95)} 75%, transparent)`,
          boxShadow: `0 0 16px 3px ${tone("Fix", 0.45)}`,
          ["--ivf-scan" as string]: `${SCAN_SPAN}px`,
          ...anim("ivf-scan", SCAN_FROM, SCAN_MS, { animationTimingFunction: "linear" }),
        })}
      />
      <span className="ivf-a" style={at(428, 302, anim("ivf-pop", SCAN_FROM + SCAN_MS + 150, 420))}>
        <Badge label="3 hidden" icon={<EyeOff size={12} aria-hidden="true" />} />
      </span>
      <Float x={18} y={372} depth={40} rotate={-5}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            borderRadius: 14,
            background: "var(--color-background-card)",
            color: "var(--color-text-primary)",
            boxShadow: `inset 0 0 0 1px ${ink(10)}, 0 14px 26px -14px rgba(0,0,0,0.45)`,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Lock size={14} />
          Stays on your device
        </span>
      </Float>
    </Scene>
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Paste where you type.

const AROUND: { app: App; x: number; y: number; depth: number; rotate: number }[] = [
  { app: "claude", x: 22, y: 168, depth: 50, rotate: -8 },
  { app: "notion", x: 498, y: 150, depth: 70, rotate: 7 },
  { app: "terminal", x: 506, y: 286, depth: 30, rotate: -5 },
  { app: "whatsapp", x: 34, y: 330, depth: 80, rotate: 6 },
  { app: "linear", x: 480, y: 410, depth: 45, rotate: -7 },
];
const PASTE_TIMES = [1400, 3000];
const PASTE_MS = 4400;
const PILL_AT = { x: 290, y: 92 };
const INPUT_AT = { x: 384, y: 418 };

function PasteScene() {
  const story = useStory(PASTE_TIMES, PASTE_MS);
  const { step } = story;
  const mood = (["writing", "idle", "done"] as const)[step]!;
  return (
    <Scene
      width={580}
      height={480}
      story={story}
      over={<Buddy story={story} x={290} y={0} size={68} mood={mood} />}
    >
      <Pill x={PILL_AT.x - 80} y={PILL_AT.y - 20} w={160} hue="Prompt" talking={step === 0} />
      {/* Cursor, open on your project. */}
      <span
        style={at(110, 160, {
          width: 360,
          height: 300,
          borderRadius: 14,
          overflow: "hidden",
          background: "#1b1a19",
          boxShadow: `inset 0 0 0 1px ${white(0.08)}, 0 40px 70px -36px rgba(0,0,0,0.65)`,
        })}
      >
        <span
          style={at(14, 9, {
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12,
            color: white(0.55),
          })}
        >
          <AppIcon app="cursor" size={16} os="mac" />
          Cursor
        </span>
        <Bar x={0} y={34} w={360} h={1} r={0} color={white(0.07)} />
        {[120, 160, 90, 140, 70, 150, 110, 130, 80, 100, 140, 60].map((w, index) => (
          <Bar
            key={index}
            x={16 + (index % 3 === 2 ? 14 : 0)}
            y={50 + index * 18}
            w={w}
            h={5}
            color={
              index % 4 === 1 ? "rgba(255, 186, 104, 0.45)" : white(index % 3 === 0 ? 0.22 : 0.13)
            }
          />
        ))}
        <Bar x={188} y={35} w={1} h={265} r={0} color={white(0.07)} />
        <Bar x={204} y={52} w={110} h={5} color={white(0.16)} />
        <Bar x={204} y={63} w={80} h={5} color={white(0.16)} />
        <Bar
          x={198}
          y={232}
          w={152}
          h={54}
          r={10}
          color={white(0.04)}
          style={{ boxShadow: `inset 0 0 0 1px ${white(0.12)}` }}
        />
      </span>
      {/* The prompt flies from the pill into the chat box, and lands. */}
      <span
        className="ivf-a"
        style={at(PILL_AT.x - 18, PILL_AT.y - 11, {
          width: 36,
          height: 22,
          borderRadius: 6,
          opacity: 0,
          background: tone("Prompt"),
          boxShadow: `0 6px 16px -4px ${tone("Prompt", 0.7)}`,
          ["--dx" as string]: `${INPUT_AT.x - PILL_AT.x}px`,
          ["--dy" as string]: `${INPUT_AT.y - PILL_AT.y}px`,
          ...anim("ivf-send", 500, 900, { animationTimingFunction: "cubic-bezier(.5,0,.3,1)" }),
        })}
      />
      <span className="ivf-a" style={at(320, 404, { opacity: 0, ...anim("ivf-out", 2900, 300) })}>
        {[130, 112, 76].map((w, index) => (
          <Line
            key={index}
            x={0}
            y={index * 11}
            w={w}
            color="rgba(255, 186, 104, 0.8)"
            when={1350 + index * 220}
          />
        ))}
      </span>
      {/* Sent. */}
      <span
        className="ivf-a"
        style={at(330, 300, {
          width: 126,
          padding: "9px 11px",
          borderRadius: "12px 12px 3px 12px",
          background: tone("Prompt", 0.2),
          boxShadow: `inset 0 0 0 1px ${tone("Prompt", 0.3)}`,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          ...anim("ivf-rise", 3000, 420),
        })}
      >
        <span style={{ height: 4, borderRadius: 2, background: tone("Prompt", 0.85) }} />
        <span
          style={{ height: 4, width: "80%", borderRadius: 2, background: tone("Prompt", 0.85) }}
        />
        <span
          style={{ height: 4, width: "55%", borderRadius: 2, background: tone("Prompt", 0.85) }}
        />
      </span>
      {/* And every other app you type in. */}
      {AROUND.map((item, index) => (
        <Float key={item.app} x={item.x} y={item.y} depth={item.depth} rotate={item.rotate}>
          <span
            className="ivf-a"
            style={{
              display: "block",
              borderRadius: 13,
              ["--ivf-ring" as string]: tone("Prompt", 0.6),
              ...anim("ivf-ring-in", 3300 + index * 160, 700),
            }}
          >
            <AppIcon app={item.app} size={52} os="mac" />
          </span>
        </Float>
      ))}
    </Scene>
  );
}

// ---------------------------------------------------------------------------------------------
// 5. Meta's AI. Free with your key.

const MODELS = [
  { name: "Muse Voice", role: "Hears you" },
  { name: "Muse Spark", role: "Finds the cause" },
  { name: "SAM 3.1", role: "Marks the proof" },
];
const KEY_TIMES = [1100, 1500, 2200, 2900, 3700];
const KEY_MS = 4700;
const ROLL = ["9", "6", "3", "0"];

function KeyScene() {
  const story = useStory(KEY_TIMES, KEY_MS);
  const { step } = story;
  const mood = (["idle", "done", "recording", "writing", "writing", "done"] as const)[step]!;
  const status = [
    "Add your key",
    "Key saved",
    "Hearing you…",
    "Finding the cause…",
    "Marking the proof…",
    "Done",
  ][step]!;
  return (
    <Scene
      width={540}
      height={480}
      story={story}
      over={
        <>
          <Buddy story={story} x={270} y={0} size={80} mood={mood} />
          <NameTag x={270} y={84} status={status} hue="Prompt" />
        </>
      }
    >
      <Device x={130} y={44} w={280} h={420} />
      {/* Your key, typed once and kept on this computer. */}
      <span
        style={at(150, 166, {
          width: 240,
          height: 44,
          borderRadius: 13,
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingInline: 13,
          background: white(0.06),
          boxShadow: `inset 0 0 0 1px ${white(0.08)}`,
          color: white(0.82),
          fontFamily: MONO,
          fontSize: 12.5,
        })}
      >
        <KeyRound size={15} color={tone("Prompt")} />
        <span
          className="ivf-a"
          style={anim("ivf-reveal", 300, 700, { animationTimingFunction: "steps(14)" })}
        >
          mk_••••••••••3f2a
        </span>
        <span
          className="ivf-a"
          style={{
            marginLeft: "auto",
            display: "grid",
            placeItems: "center",
            width: 18,
            height: 18,
            borderRadius: 9,
            background: tone("Prompt"),
            color: "#2a1700",
            ...anim("ivf-pop", 1100, 360),
          }}
        >
          <Check size={11} strokeWidth={3} />
        </span>
      </span>
      {/* Meta's models, one after another. */}
      {MODELS.map((model, index) => {
        const when = 1500 + index * 700;
        const y = 236 + index * 52;
        return (
          <span key={model.name}>
            <span
              style={at(152, y, { display: "flex", alignItems: "baseline", gap: 8, width: 236 })}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{model.name}</span>
              <span style={{ fontSize: 11.5, color: white(0.5) }}>{model.role}</span>
              <span
                className="ivf-a"
                style={{
                  marginLeft: "auto",
                  alignSelf: "center",
                  display: "grid",
                  placeItems: "center",
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: white(0.9),
                  color: "#151413",
                  ...anim("ivf-pop", when + 620, 320),
                }}
              >
                <Check size={10} strokeWidth={3} />
              </span>
            </span>
            <Bar x={152} y={y + 24} w={236} h={4} color={white(0.08)} />
            <span
              className="ivf-a"
              style={at(152, y + 24, {
                width: 236,
                height: 4,
                borderRadius: 2,
                background: tone("Prompt", 0.85),
                transformOrigin: "0 50%",
                ...anim("ivf-fill", when, 620, {
                  animationTimingFunction: "cubic-bezier(.4,0,.2,1)",
                }),
              })}
            />
          </span>
        );
      })}
      {/* What it costs you. */}
      <span
        style={at(130, 396, {
          width: 280,
          display: "flex",
          justifyContent: "center",
          alignItems: "baseline",
          gap: 8,
          color: "#fff",
        })}
      >
        <span
          style={{
            display: "flex",
            fontFamily: SERIF,
            fontSize: 46,
            lineHeight: "50px",
            height: 50,
          }}
        >
          <span>$</span>
          <span style={{ display: "inline-block", height: 50, overflow: "hidden" }}>
            <span
              className="ivf-a"
              style={{
                display: "flex",
                flexDirection: "column",
                transform: `translateY(-${(ROLL.length - 1) * 50}px)`,
                ...anim("ivf-roll", 3700, 900, {
                  animationTimingFunction: "cubic-bezier(.3,0,.1,1)",
                }),
              }}
            >
              {ROLL.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          </span>
        </span>
        <span style={{ fontSize: 12.5, color: white(0.5) }}>a month</span>
      </span>
      {/* The key itself, floating by. */}
      <Float x={18} y={150} depth={50} rotate={-14}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 70,
            height: 70,
            borderRadius: 35,
            background: `radial-gradient(circle at 35% 30%, #ffd9a6, ${tone("Prompt")} 60%, #e0913a)`,
            color: "#3a2000",
            boxShadow: `0 18px 30px -14px ${tone("Prompt", 0.8)}`,
          }}
        >
          <KeyRound size={30} strokeWidth={2.2} />
        </span>
      </Float>
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
        line="iVibe writes the fix prompt, with screenshots marked where it broke."
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
        <KeyScene />
      </Band>
    </section>
  );
}
