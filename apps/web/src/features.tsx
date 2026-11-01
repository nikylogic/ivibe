// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Check, EyeOff, KeyRound } from "lucide-react";
import { AppIcon } from "./demo/icons.tsx";
import type { App } from "./demo/icons.tsx";
import { MONO } from "./demo/kit.tsx";
import { TONES } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { detectPlatform } from "./release.ts";

/**
 * "Inside the pill.": why iVibe can be trusted, shown rather than told. Six tiles, each a small
 * piece of real iVibe UI that plays once when it comes into view (and again on hover). Motion is
 * CSS keyframes on opacity and transform only, paused while a tile is off screen; with reduced
 * motion every tile simply shows its final frame.
 */

const styles = stylex.create({
  section: {
    position: "relative",
    maxWidth: 1080,
    marginInline: "auto",
    paddingInline: { default: 24, "@media (max-width: 640px)": 16 },
    paddingTop: { default: 140, "@media (max-width: 640px)": 96 },
    paddingBottom: 140,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(34px, 4.2vw, 52px)",
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    margin: 0,
    marginBottom: 40,
  },
  grid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 900px)": "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 640px)": "minmax(0, 1fr)",
    },
    gridTemplateAreas: {
      default: '"key proof proof" "secret secret apps" "meta free apps"',
      "@media (max-width: 900px)":
        '"proof proof" "key apps" "free apps" "secret secret" "meta meta"',
      "@media (max-width: 640px)": '"key" "proof" "secret" "apps" "meta" "free"',
    },
  },
});

/** A colour from the voice tones, at some opacity. */
const tone = (name: Tone, alpha = 1) => `rgba(${TONES[name]}, ${alpha})`;
/** The page's text colour, thinned: mock UI that follows the theme. */
const ink = (percent: number) =>
  `color-mix(in srgb, var(--color-text-primary) ${percent}%, transparent)`;
const PILL = "rgba(15, 14, 13, 0.94)";

/** An animated element: `name` is a keyframe in global.css, `at` its start within the play. */
function anim(name: string, at: number, ms = 600, extra?: CSSProperties): CSSProperties {
  return {
    animationName: name,
    animationDelay: `${at}ms`,
    animationDuration: `${ms}ms`,
    ...extra,
  };
}

/**
 * Lays out a fixed-size drawing and scales it down to fit narrow tiles, so every picture can be
 * drawn in plain pixels.
 */
function Stage({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setScale(Math.min(1, (element.clientWidth - 24) / width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={box} style={{ display: "grid", placeItems: "center", width: "100%" }}>
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
          {children}
        </div>
      </div>
    </div>
  );
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
 * One tile: the picture on top, a few words under it. It plays while on screen and replays when
 * the pointer comes back after a play has finished.
 */
function Tile({
  area,
  hue,
  title,
  line,
  playMs,
  children,
}: {
  area: string;
  hue: Tone;
  title: string;
  line?: string;
  /** How long one play lasts, so hover only replays a finished one. */
  playMs: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  const [round, setRound] = useState(0);
  const [hover, setHover] = useState(false);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = !!entry && entry.intersectionRatio >= 0.35;
        if (visible && startedAt.current === null) startedAt.current = performance.now();
        setRun(visible);
      },
      { threshold: [0, 0.35] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const replay = () => {
    setHover(true);
    look(box.current);
    if (startedAt.current !== null && performance.now() - startedAt.current > playMs) {
      startedAt.current = performance.now();
      setRound((value) => value + 1);
    }
  };
  return (
    <div
      ref={box}
      style={{ gridArea: area, display: "flex", minWidth: 0 }}
      onPointerEnter={replay}
      onPointerLeave={() => {
        setHover(false);
        look(null);
      }}
    >
      <Card
        padding={0}
        width="100%"
        style={{
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* The mode's light, faint in one corner. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `radial-gradient(120% 90% at 100% 0%, ${tone(hue, 0.13)}, transparent 60%)`,
            opacity: hover ? 1 : 0.65,
            transition: "opacity 500ms ease",
          }}
        />
        <div
          key={round}
          aria-hidden="true"
          className={run ? "ivf ivf-run" : "ivf"}
          style={{
            flex: 1,
            minHeight: 216,
            display: "grid",
            placeItems: "center",
            paddingTop: 24,
            paddingBottom: 8,
          }}
        >
          {children}
        </div>
        <div style={{ position: "relative", padding: "0 22px 20px" }}>
          <VStack gap={0.5}>
            <Text weight="semibold">{title}</Text>
            {line && (
              <Text size="sm" color="secondary">
                {line}
              </Text>
            )}
          </VStack>
        </div>
      </Card>
    </div>
  );
}

/** iVibe's pill, small: a dark capsule whose bars talk in the mode's colour. */
function MiniPill({
  hue,
  width = 112,
  bars = 9,
  talkAt,
  style,
  children,
}: {
  hue: Tone;
  width?: number;
  bars?: number;
  /** When the bars start talking; left out, they rest. */
  talkAt?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <span
      className={style?.animationName ? "ivf-a" : undefined}
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        width,
        height: 34,
        borderRadius: 17,
        background: PILL,
        boxShadow: `0 10px 24px -10px rgba(0,0,0,0.5), 0 0 22px -6px ${tone(hue, 0.55)}, inset 0 0 0 1px rgba(255,255,255,0.08)`,
        ...style,
      }}
    >
      {children}
      {Array.from({ length: bars }, (_, index) => {
        const middle = 1 - Math.abs(index - (bars - 1) / 2) / ((bars + 1) / 2);
        return (
          <span
            key={index}
            className={talkAt === undefined ? undefined : "ivf-a"}
            style={{
              width: 3,
              height: 6 + 12 * middle,
              borderRadius: 2,
              background: tone(hue),
              transform: "scaleY(0.55)",
              ...(talkAt === undefined
                ? {}
                : anim("ivf-wave", talkAt + index * 70, 700 + ((index * 137) % 300), {
                    animationIterationCount: "infinite",
                    animationDirection: "alternate",
                    animationTimingFunction: "ease-in-out",
                  })),
            }}
          />
        );
      })}
    </span>
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
        height: 50,
        borderRadius: 10,
        background: "var(--color-background-card)",
        color: "var(--color-text-primary)",
        fontSize: 13,
        fontWeight: 500,
        boxShadow: `inset 0 0 0 1px ${ink(14)}, 0 3px 0 ${ink(14)}, 0 6px 12px -6px rgba(0,0,0,0.25)`,
      }}
    >
      {label}
    </span>
  );
}

// 1. One shortcut ------------------------------------------------------------------------------

function ShortcutPicture() {
  const mac = detectPlatform() === "mac";
  return (
    <Stage width={240} height={180}>
      {/* The keys go down together, with a ring where they meet the keyboard. */}
      <span
        className="ivf-a"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 18,
          display: "flex",
          justifyContent: "center",
          gap: 8,
          ...anim("ivf-press", 350, 520),
        }}
      >
        {mac ? (
          <>
            <Keycap label="⌥" />
            <Keycap label="space" width={120} />
          </>
        ) : (
          <Keycap label="Caps Lock" width={112} />
        )}
      </span>
      <span
        className="ivf-a"
        style={{
          position: "absolute",
          left: 120 - 70,
          top: 14,
          width: 140,
          height: 58,
          borderRadius: 16,
          opacity: 0,
          boxShadow: `0 0 0 2px ${tone("Dictate", 0.6)}`,
          ...anim("ivf-ring-out", 420, 700),
        }}
      />
      {/* The pill opens under them and listens. */}
      <MiniPill
        hue="Dictate"
        talkAt={900}
        style={{
          left: 120 - 56,
          top: 116,
          ...anim("ivf-pill-in", 700, 520),
        }}
      />
    </Stage>
  );
}

// 2. Proof, not guesses ------------------------------------------------------------------------

function Bar({
  x,
  y,
  w,
  h,
  color,
  r = 2,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  r?: number;
}) {
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: r,
        background: color,
      }}
    />
  );
}

/** A numbered pin, dropped on what the outline marks. */
function Pin({ x, y, n, at }: { x: number; y: number; n: number; at: number }) {
  return (
    <span
      className="ivf-a"
      style={{
        position: "absolute",
        left: x - 10,
        top: y - 10,
        width: 20,
        height: 20,
        borderRadius: 10,
        display: "grid",
        placeItems: "center",
        background: tone("Fix"),
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        boxShadow: `0 4px 10px -2px ${tone("Fix", 0.6)}`,
        ...anim("ivf-pop", at, 420),
      }}
    >
      {n}
    </span>
  );
}

function ProofPicture() {
  const W = 460;
  const H = 188;
  const outline = { stroke: tone("Fix"), strokeWidth: 2, fill: "none" } as const;
  return (
    <Stage width={W} height={H}>
      {/* A browser window: the form on the left, the console on the right. */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12,
          background: "var(--color-background-surface)",
          boxShadow: `inset 0 0 0 1px ${ink(12)}, 0 12px 28px -18px rgba(0,0,0,0.4)`,
          overflow: "hidden",
        }}
      >
        <Bar x={12} y={10} w={8} h={8} r={4} color={ink(16)} />
        <Bar x={24} y={10} w={8} h={8} r={4} color={ink(16)} />
        <Bar x={36} y={10} w={8} h={8} r={4} color={ink(16)} />
        <Bar x={120} y={7} w={220} h={14} r={7} color={ink(7)} />
        <Bar x={0} y={28} w={W} h={1} r={0} color={ink(10)} />
        {/* The page. */}
        <Bar x={20} y={46} w={96} h={8} color={ink(70)} />
        <Bar x={20} y={66} w={40} h={4} color={ink(30)} />
        <Bar x={20} y={74} w={210} h={20} r={5} color={ink(5)} />
        <Bar x={20} y={104} w={52} h={4} color={ink(30)} />
        <Bar x={20} y={112} w={210} h={20} r={5} color={ink(5)} />
        <Bar x={20} y={148} w={58} h={22} r={6} color={ink(82)} />
        {/* The console, with the error Save threw. */}
        <Bar x={262} y={29} w={1} h={H - 29} r={0} color={ink(10)} />
        <Bar x={263} y={29} w={W - 263} h={H - 29} r={0} color={ink(3)} />
        <Bar x={276} y={42} w={36} h={4} color={ink(25)} />
        <Bar x={318} y={42} w={36} h={4} color={ink(12)} />
        <Bar x={268} y={60} w={186} h={50} r={6} color="rgba(235, 72, 56, 0.1)" />
        <Bar x={278} y={70} w={140} h={4} color="rgba(225, 70, 55, 0.85)" />
        <Bar x={278} y={80} w={112} h={4} color="rgba(225, 70, 55, 0.6)" />
        <Bar x={288} y={90} w={90} h={4} color="rgba(225, 70, 55, 0.6)" />
        <Bar x={276} y={124} w={120} h={4} color={ink(14)} />
        <Bar x={276} y={136} w={90} h={4} color={ink(14)} />
      </span>
      {/* What iVibe marks: the error, then the button that caused it. */}
      <svg
        width={W}
        height={H}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
        aria-hidden="true"
      >
        <rect
          className="ivf-a"
          x={264}
          y={56}
          width={194}
          height={58}
          rx={9}
          pathLength={1}
          strokeDasharray={1}
          style={{
            ...outline,
            ...anim("ivf-draw", 400, 800, { animationTimingFunction: "ease-in-out" }),
          }}
        />
        <rect
          className="ivf-a"
          x={14}
          y={142}
          width={70}
          height={34}
          rx={9}
          pathLength={1}
          strokeDasharray={1}
          style={{
            ...outline,
            ...anim("ivf-draw", 1500, 700, { animationTimingFunction: "ease-in-out" }),
          }}
        />
      </svg>
      <Pin x={458} y={56} n={1} at={1150} />
      <Pin x={84} y={142} n={2} at={2150} />
    </Stage>
  );
}

// 3. Secrets stay yours ------------------------------------------------------------------------

const ENV: { key: string; value: string; secret?: boolean }[] = [
  { key: "META_API_KEY", value: "mk_live_9f2c4e7a1b38d0e6", secret: true },
  { key: "PORT", value: "5173" },
  { key: "DB_PASSWORD", value: "correct-horse-battery", secret: true },
  { key: "NODE_ENV", value: "development" },
];
const ROW = 27;
const FIRST = 44;
const SCAN_FROM = 300;
const SCAN_MS = 1700;
const SCAN_SPAN = 4 * ROW + 16;

function SecretsPicture() {
  const W = 460;
  const H = 176;
  return (
    <Stage width={W} height={H}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12,
          background: "#1a1918",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 12px 28px -16px rgba(0,0,0,0.55)",
          overflow: "hidden",
          fontFamily: MONO,
          fontSize: 12.5,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 16,
            top: 10,
            color: "rgba(255,255,255,0.4)",
            fontSize: 11,
          }}
        >
          .env
        </span>
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 30,
            height: 1,
            background: "rgba(255,255,255,0.07)",
          }}
        />
        {ENV.map((line, index) => {
          const y = FIRST + index * ROW;
          // The box lands as the scan line reaches its row.
          const reached = SCAN_FROM + ((y - FIRST + 8) / SCAN_SPAN) * SCAN_MS;
          return (
            <span
              key={line.key}
              style={{ position: "absolute", left: 16, top: y, whiteSpace: "pre" }}
            >
              <span style={{ color: "rgba(255,255,255,0.28)" }}>{index + 1} </span>
              <span style={{ color: "rgba(255, 196, 140, 0.9)" }}>{line.key}</span>
              <span style={{ color: "rgba(255,255,255,0.35)" }}>=</span>
              <span style={{ position: "relative", color: "rgba(255,255,255,0.78)" }}>
                {line.value}
                {line.secret && (
                  <span
                    className="ivf-a"
                    style={{
                      position: "absolute",
                      inset: "-3px -4px",
                      borderRadius: 3,
                      background: "#000",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
                      transformOrigin: "0 50%",
                      ...anim("ivf-cover", reached, 260),
                    }}
                  />
                )}
              </span>
            </span>
          );
        })}
        {/* The scan: every line is read on this device before anything leaves it. */}
        <span
          className="ivf-a"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: FIRST - 8,
            height: 2,
            opacity: 0,
            background: `linear-gradient(90deg, transparent, ${tone("Fix", 0.95)} 30%, ${tone("Fix", 0.95)} 70%, transparent)`,
            boxShadow: `0 0 14px 2px ${tone("Fix", 0.45)}`,
            ["--ivf-scan" as string]: `${SCAN_SPAN}px`,
            ...anim("ivf-scan", SCAN_FROM, SCAN_MS, { animationTimingFunction: "linear" }),
          }}
        />
      </span>
      <span
        className="ivf-a"
        style={{
          position: "absolute",
          right: 14,
          bottom: 14,
          ...anim("ivf-rise", SCAN_FROM + SCAN_MS, 500),
        }}
      >
        <Theme2Badge />
      </span>
    </Stage>
  );
}

/** Two hidden, in the card's own badge style. */
function Theme2Badge() {
  return <Badge label="2 hidden" icon={<EyeOff size={12} aria-hidden="true" />} />;
}

// 4. Any app -----------------------------------------------------------------------------------

const TARGETS: App[] = ["cursor", "claude", "terminal", "notion", "linear", "whatsapp"];
const SPOT = (index: number) => ({ x: 50 + (index % 3) * 70, y: 170 + Math.floor(index / 3) * 74 });
const SEND_FROM = 500;
const SEND_GAP = 600;
const SEND_MS = 700;

function AppsPicture() {
  const from = { x: 120, y: 52 };
  return (
    <Stage width={240} height={290}>
      <MiniPill hue="Prompt" talkAt={0} style={{ left: 120 - 56, top: 35 }} />
      {TARGETS.map((app, index) => {
        const spot = SPOT(index);
        const at = SEND_FROM + index * SEND_GAP;
        return (
          <span key={app}>
            <span
              className="ivf-a"
              style={{
                position: "absolute",
                left: spot.x - 23,
                top: spot.y - 23,
                borderRadius: 11,
                ...anim("ivf-ring-in", at + SEND_MS - 120, 700),
                ["--ivf-ring" as string]: tone("Prompt", 0.6),
              }}
            >
              <AppIcon app={app} size={46} os="mac" />
            </span>
            {/* The prompt, flying from the pill to the app. */}
            <span
              className="ivf-a"
              style={{
                position: "absolute",
                left: from.x - 15,
                top: from.y - 9,
                width: 30,
                height: 18,
                borderRadius: 5,
                opacity: 0,
                background: tone("Prompt"),
                boxShadow: `0 4px 12px -2px ${tone("Prompt", 0.6)}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 3,
                padding: "0 6px",
                ["--dx" as string]: `${spot.x - from.x}px`,
                ["--dy" as string]: `${spot.y - from.y}px`,
                ...anim("ivf-send", at, SEND_MS, {
                  animationTimingFunction: "cubic-bezier(.5,0,.3,1)",
                }),
              }}
            >
              <span style={{ height: 2, borderRadius: 1, background: "rgba(40,22,0,0.55)" }} />
              <span
                style={{
                  height: 2,
                  width: "65%",
                  borderRadius: 1,
                  background: "rgba(40,22,0,0.55)",
                }}
              />
            </span>
          </span>
        );
      })}
    </Stage>
  );
}

// 5. Meta models inside ------------------------------------------------------------------------

const MODELS = [
  { name: "Muse Voice", role: "Hears you" },
  { name: "Muse Spark", role: "Finds the cause" },
  { name: "SAM 3.1", role: "Marks the proof" },
];

function ModelsPicture() {
  return (
    <Stage width={280} height={168}>
      {MODELS.map((model, index) => {
        const at = 300 + index * 650;
        return (
          <span
            key={model.name}
            className="ivf-a"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: index * 56,
              ...anim("ivf-rise", at, 420),
            }}
          >
            <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{model.name}</span>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                {model.role}
              </span>
              <span
                className="ivf-a"
                style={{
                  marginLeft: "auto",
                  alignSelf: "center",
                  display: "grid",
                  placeItems: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: ink(90),
                  color: "var(--color-background-surface)",
                  ...anim("ivf-pop", at + 700, 360),
                }}
              >
                <Check size={11} strokeWidth={3} aria-hidden="true" />
              </span>
            </span>
            <span
              style={{
                position: "relative",
                display: "block",
                height: 4,
                marginTop: 10,
                borderRadius: 2,
                background: ink(8),
              }}
            >
              <span
                className="ivf-a"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 2,
                  background: ink(70),
                  transformOrigin: "0 50%",
                  ...anim("ivf-fill", at + 100, 620, {
                    animationTimingFunction: "cubic-bezier(.4,0,.2,1)",
                  }),
                }}
              />
            </span>
          </span>
        );
      })}
    </Stage>
  );
}

// 6. Free, your key ----------------------------------------------------------------------------

const ROLL = ["9", "6", "3", "0"];

function FreePicture() {
  return (
    <Stage width={240} height={168}>
      {/* Your key goes into the pill, and it lights up. */}
      <MiniPill
        hue="Dictate"
        width={150}
        bars={7}
        talkAt={1150}
        style={{ left: 120 - 75, top: 22, paddingLeft: 36 }}
      />
      <span
        className="ivf-a"
        style={{
          position: "absolute",
          left: 120 - 75 + 5,
          top: 22 + 5,
          width: 24,
          height: 24,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: tone("Prompt"),
          color: "rgba(40,22,0,0.85)",
          ...anim("ivf-key-in", 300, 800, { animationTimingFunction: "cubic-bezier(.3,0,.2,1)" }),
        }}
      >
        <KeyRound size={13} strokeWidth={2.4} aria-hidden="true" />
      </span>
      {/* And the bill rolls down to nothing. */}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 82,
          display: "flex",
          justifyContent: "center",
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 56,
          lineHeight: "60px",
          height: 60,
        }}
      >
        <span>$</span>
        <span style={{ display: "inline-block", height: 60, overflow: "hidden" }}>
          <span
            className="ivf-a"
            style={{
              display: "flex",
              flexDirection: "column",
              transform: `translateY(-${(ROLL.length - 1) * 60}px)`,
              ["--ivf-roll" as string]: `-${(ROLL.length - 1) * 60}px`,
              ...anim("ivf-roll", 1200, 900, {
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
    </Stage>
  );
}

// ---------------------------------------------------------------------------------------------

export function Features() {
  return (
    <section id="features" {...stylex.props(styles.section)}>
      <Heading level={2} xstyle={styles.title}>
        Inside the pill.
      </Heading>
      <div {...stylex.props(styles.grid)}>
        <Tile
          area="key"
          hue="Dictate"
          title="One shortcut"
          line="Press it anywhere. Just talk."
          playMs={1800}
        >
          <ShortcutPicture />
        </Tile>
        <Tile
          area="proof"
          hue="Fix"
          title="Proof, not guesses"
          line="Screenshots marked where it broke."
          playMs={2700}
        >
          <ProofPicture />
        </Tile>
        <Tile
          area="secret"
          hue="Fix"
          title="Secrets stay yours"
          line="Keys are blacked out on your device."
          playMs={2600}
        >
          <SecretsPicture />
        </Tile>
        <Tile area="apps" hue="Prompt" title="Any app" line="Paste where you type." playMs={4400}>
          <AppsPicture />
        </Tile>
        <Tile
          area="meta"
          hue="Prompt"
          title="Meta models inside"
          line="Meta's AI, from voice to proof."
          playMs={2400}
        >
          <ModelsPicture />
        </Tile>
        <Tile
          area="free"
          hue="Dictate"
          title="Free with your key"
          line="No account. No bill from us."
          playMs={2200}
        >
          <FreePicture />
        </Tile>
      </div>
    </section>
  );
}
