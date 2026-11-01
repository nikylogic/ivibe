// SPDX-License-Identifier: AGPL-3.0-only

import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ArrowUp, Check, Lock, SendHorizontal } from "lucide-react";
import { APP_NAME, AppIcon } from "./demo/icons.tsx";
import type { App } from "./demo/icons.tsx";
import { Hud, Toast } from "./demo/hud.tsx";
import type { HudPhase, Segment } from "./demo/hud.tsx";
import { bump, ease, glide, MONO } from "./demo/kit.tsx";
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
  /** The mode's light behind the pill; left out where the scene can stand empty. */
  hue?: Tone;
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
            {hue && (
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
            )}
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

// 1. Press a key. Just talk. -------------------------------------------------------------------
//
// Your words appear as you say them, ums and all. When you stop, the fillers and the false start
// lift away, what's left slides together into one clean sentence, and it lands in WhatsApp.

/** `breaks`: the clean sentence starts a new line here. */
type Word = { raw: string; clean?: string; drop?: true; breaks?: true };

const WORDS: Word[] = [
  { raw: "hey", clean: "Hey" },
  { raw: "asha,", clean: "Asha," },
  { raw: "um,", drop: true },
  { raw: "the", drop: true },
  { raw: "demo", drop: true },
  { raw: "is,", drop: true },
  { raw: "uh,", drop: true },
  { raw: "the" },
  { raw: "demo" },
  { raw: "is" },
  { raw: "ready" },
  { raw: "for" },
  { raw: "tomorrow." },
  { raw: "so,", drop: true },
  { raw: "like,", drop: true },
  { raw: "let", clean: "Let", breaks: true },
  { raw: "me" },
  { raw: "know" },
  { raw: "what" },
  { raw: "you" },
  { raw: "think", clean: "think!" },
];

/** The story, in ms. */
const KEY = 350;
const SAY = 850;
const STEP = 165;
const STOP = SAY + WORDS.length * STEP + 250;
const MARK = STOP + 150;
const LIFT = MARK + 500;
const MOVE = LIFT + 380;
const MOVE_MS = 820;
const BOX = MOVE + MOVE_MS + 80;
const PASTED = BOX + 120;
const OUT = PASTED + 2300;
const TALK_MS = OUT + 450;
/** Where reduced motion rests: the clean sentence, pasted. */
const TALK_STILL = OUT - 200;

/** The two layouts the words move between, in the scene's pixels. */
const RAW_BOX = { left: 24, top: 34, width: 512 };
const CLEAN_BOX = { left: 46, top: 52, width: 400 };
const WORD_STYLE: CSSProperties = {
  fontSize: 25,
  lineHeight: "36px",
  fontWeight: 500,
  letterSpacing: "-0.012em",
};

type Spot = { x: number; y: number };

/**
 * Lays both versions of the sentence out once, hidden, and reads where every word sits, so the
 * visible words can glide between them with transforms alone.
 */
function useSpots() {
  const raw = useRef<HTMLDivElement>(null);
  const clean = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<{ raw: Spot[]; clean: Spot[]; height: number } | null>(null);
  useEffect(() => {
    let live = true;
    const read = (box: HTMLDivElement | null) =>
      Array.from(box?.querySelectorAll<HTMLElement>(":scope > span") ?? [], (element) => ({
        x: element.offsetLeft,
        y: element.offsetTop,
      }));
    void document.fonts.ready.then(() => {
      if (!live) return;
      const cleanSpots = read(clean.current);
      setSpots({
        raw: read(raw.current),
        // Clean spots are listed only for the words that stay; give the dropped ones theirs too.
        clean: cleanSpots,
        height: clean.current?.offsetHeight ?? 0,
      });
    });
    return () => {
      live = false;
    };
  }, []);
  const measure = (
    <>
      <div
        ref={raw}
        style={{ ...WORD_STYLE, ...at(RAW_BOX), visibility: "hidden" }}
        aria-hidden="true"
      >
        {WORDS.map((word, index) => (
          <span key={index} style={{ display: "inline-block" }}>
            {word.raw}&nbsp;
          </span>
        ))}
      </div>
      <div
        ref={clean}
        style={{ ...WORD_STYLE, ...at(CLEAN_BOX), visibility: "hidden" }}
        aria-hidden="true"
      >
        {WORDS.filter((word) => !word.drop).map((word, index) => (
          <Fragment key={index}>
            {word.breaks && <br />}
            <span style={{ display: "inline-block" }}>{word.clean ?? word.raw}&nbsp;</span>
          </Fragment>
        ))}
      </div>
    </>
  );
  return { spots, measure };
}

function at(box: { left: number; top: number; width: number }): CSSProperties {
  return { position: "absolute", left: box.left, top: box.top, width: box.width };
}

const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** A key on a real keyboard: a lit face over a skirt that shortens as it goes down. */
function Key({
  x,
  y,
  width = 46,
  legend,
  glyph,
  down = 0,
  glow = 0,
  led,
}: {
  x: number;
  y: number;
  width?: number;
  /** The small word in the corner ("caps lock", "option"). */
  legend?: string;
  /** The big symbol ("⌥", "Q"). */
  glyph?: string;
  /** 0 up, 1 fully pressed. */
  down?: number;
  /** How lit it is in the pill's colour. */
  glow?: number;
  /** Caps Lock's light: undefined for keys without one, else how lit (0 to 1). */
  led?: number;
}) {
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: 46,
        borderRadius: 9,
        background:
          "linear-gradient(180deg, var(--color-background-card) 0%, color-mix(in srgb, var(--color-background-card) 94%, var(--color-text-primary)) 100%)",
        boxShadow: [
          "inset 0 0 0 1px var(--color-border)",
          `0 ${(3 - 2 * down).toFixed(2)}px 0 var(--color-border)`,
          `0 ${(9 - 5 * down).toFixed(2)}px 16px -10px rgba(0,0,0,0.4)`,
          `0 0 0 ${(1.5 * glow).toFixed(2)}px ${tone("Dictate", 0.75 * glow)}`,
          `0 0 22px ${tone("Dictate", 0.32 * glow)}`,
        ].join(", "),
        transform: `translateY(${(2 * down).toFixed(2)}px)`,
        color: "var(--color-text-secondary)",
        fontWeight: 500,
      }}
    >
      {led !== undefined && (
        <span
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            width: 6,
            height: 6,
            borderRadius: 3,
            background: `color-mix(in srgb, ${tone("Dictate")} ${led * 100}%, var(--color-border))`,
            boxShadow: `0 0 ${(8 * led).toFixed(2)}px ${(1.5 * led).toFixed(2)}px ${tone("Dictate", 0.7 * led)}`,
          }}
        />
      )}
      {glyph && (
        <span
          style={{
            position: "absolute",
            right: legend ? 8 : undefined,
            left: legend ? undefined : 0,
            width: legend ? undefined : "100%",
            textAlign: "center",
            top: legend ? 6 : 12,
            fontSize: legend ? 13 : 15,
            color: "var(--color-text-primary)",
          }}
        >
          {glyph}
        </span>
      )}
      {legend && (
        <span style={{ position: "absolute", left: 8, bottom: 6, fontSize: 10.5 }}>{legend}</span>
      )}
    </span>
  );
}

/** One pressed key: a soft press and release. */
const press = (t: number, at: number) => bump(t, at, 240);

/**
 * A slice of a real keyboard around the shortcut, fading out at its edges. On Windows it's Caps
 * Lock, whose light turns on for as long as you talk; on a Mac, Option and Space.
 */
function Keyboard({ t, mac }: { t: number; mac: boolean }) {
  const down = press(t, KEY) + press(t, STOP);
  const glow = Math.max(down, 0);
  const led = ease(t, KEY + 80, 180) * (1 - ease(t, STOP + 80, 180));
  const row = (index: number) => index * 52;
  const keys = mac ? (
    <>
      <Key x={0} y={row(0)} width={98} legend="shift" glyph="⇧" />
      <Key x={104} y={row(0)} glyph="Z" />
      <Key x={156} y={row(0)} glyph="X" />
      <Key x={208} y={row(0)} glyph="C" />
      <Key x={260} y={row(0)} glyph="V" />
      <Key x={0} y={row(1)} legend="fn" />
      <Key x={52} y={row(1)} legend="control" glyph="⌃" />
      <Key x={104} y={row(1)} legend="option" glyph="⌥" down={down} glow={glow} />
      <Key x={156} y={row(1)} width={56} legend="command" glyph="⌘" />
      <Key x={218} y={row(1)} width={210} down={down} glow={glow} />
    </>
  ) : (
    <>
      <Key x={0} y={row(0)} width={70} legend="tab" />
      <Key x={76} y={row(0)} glyph="Q" />
      <Key x={128} y={row(0)} glyph="W" />
      <Key x={180} y={row(0)} glyph="E" />
      <Key x={0} y={row(1)} width={84} legend="caps lock" led={led} down={down} glow={glow} />
      <Key x={90} y={row(1)} glyph="A" />
      <Key x={142} y={row(1)} glyph="S" />
      <Key x={194} y={row(1)} glyph="D" />
      <Key x={0} y={row(2)} width={108} legend="shift" />
      <Key x={114} y={row(2)} glyph="Z" />
      <Key x={166} y={row(2)} glyph="X" />
    </>
  );
  // The shortcut sits at the centre of the scene, and the slice fades out around it.
  const focus = mac ? { x: 262, y: row(1) + 23 } : { x: 42, y: row(1) + 23 };
  const mask = `radial-gradient(ellipse 230px 78px at ${focus.x}px ${focus.y}px, #000 45%, transparent 100%)`;
  return (
    <div
      style={{
        position: "absolute",
        left: 280 - focus.x,
        top: KEYS_TOP - focus.y,
        width: 440,
        height: 160,
        maskImage: mask,
        WebkitMaskImage: mask,
        transform: "scale(1.2)",
        transformOrigin: `${focus.x}px ${focus.y}px`,
      }}
    >
      {keys}
    </div>
  );
}

/** Where the shortcut key's centre sits in the scene. */
const KEYS_TOP = 392;
/** Where the compact pill sits. */
const PILL_TOP = 238;
const EMERGE = KEY + 90;

/** The compact pill's bars: tallest in the middle (shared/voice-wave.tsx). */
const envelope = (index: number, count: number) => {
  const x = (index - (count - 1) / 2) / ((count - 1) / 2);
  return 0.5 + 0.5 * Math.cos((x * Math.PI) / 2) ** 1.4;
};

/**
 * The app's compact pill (hud/compact.tsx): a small capsule with only a waveform while you talk;
 * working, the voice settles into a line with light running along it; with the result it goes.
 * It rises out of the key that started it.
 */
function TinyPill({
  t,
  top,
  rise,
  appearAt,
  speaking: [talkFrom, talkTo],
  stopAt,
  goneAt,
  hue,
}: {
  t: number;
  top: number;
  /** How far below its place it starts (the key it rises out of). */
  rise: number;
  appearAt: number;
  /** When the voice is heard. */
  speaking: [number, number];
  /** Listening ends: the waveform settles into the working line. */
  stopAt: number;
  /** The result has landed: the pill goes. */
  goneAt: number;
  hue: Tone;
}) {
  const listening = t < stopAt;
  const appear = ease(t, appearAt, 460);
  const gone = ease(t, goneAt, 300);
  const speaking = t > talkFrom && t < talkTo;
  const voice = speaking
    ? 0.55 + 0.25 * Math.sin(t / 130) + 0.2 * Math.sin(t / 53 + 1.7)
    : 0.16 + 0.04 * Math.sin(t / 300);
  const ink = "#f2efe8";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: appear * (1 - gone),
        transform: `translateY(${((1 - appear) * rise + gone * 6).toFixed(2)}px) scale(${(0.45 + 0.55 * appear).toFixed(3)})`,
      }}
    >
      <span
        style={{
          position: "relative",
          width: listening ? 104 : 84,
          height: 36,
          borderRadius: 999,
          background: "rgba(15, 14, 13, 0.94)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: `0 10px 30px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2), 0 0 26px -4px ${tone(hue, 0.45)}`,
          transition: "width 225ms var(--motion-ease)",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            opacity: listening ? 1 : 0,
            transition: "opacity 125ms ease",
          }}
        >
          {Array.from({ length: 13 }, (_, index) => {
            const sway = 0.8 + 0.2 * Math.sin(t / 95 - index * 0.6);
            const level = Math.min(1, Math.max(0.16, envelope(index, 13) * voice * sway));
            return (
              <span
                key={index}
                style={{
                  width: 2.5,
                  height: 18,
                  borderRadius: 2,
                  background: ink,
                  transform: `scaleY(${level.toFixed(3)})`,
                }}
              />
            );
          })}
        </span>
        <span
          style={{
            position: "absolute",
            left: 13,
            right: 13,
            top: 17,
            height: 2,
            borderRadius: 999,
            backgroundImage:
              "linear-gradient(90deg, rgba(242,239,232,0.18) 0%, rgba(242,239,232,0.18) 35%, rgba(242,239,232,0.95) 50%, rgba(242,239,232,0.18) 65%, rgba(242,239,232,0.18) 100%)",
            backgroundSize: "300% 100%",
            backgroundPosition: `${(100 - ((t / 1400) % 1) * 100).toFixed(2)}% 0`,
            opacity: listening ? 0 : 1,
            transition: "opacity 125ms ease",
          }}
        />
      </span>
    </div>
  );
}

function TalkScene() {
  const clock = useClock(TALK_MS, 500);
  const t = still() ? TALK_STILL : clock.t;
  const mac = detectPlatform() === "mac";
  const { spots, measure } = useSpots();
  // Everything fades together at the end of the loop.
  const shown = 1 - ease(t, OUT, 420);
  const box = ease(t, BOX, 420);
  let kept = 0;
  let dropped = 0;
  return (
    <Scene clock={clock} width={560} height={440}>
      {measure}
      {/* WhatsApp's message box, appearing around the clean sentence. */}
      {spots && (
        <div
          style={{
            position: "absolute",
            left: CLEAN_BOX.left - 22,
            top: CLEAN_BOX.top - 16,
            width: CLEAN_BOX.width + 92,
            height: spots.height + 32,
            borderRadius: 26,
            background: "var(--color-background-card)",
            boxShadow: "inset 0 0 0 1px var(--color-border), 0 18px 40px -26px rgba(0,0,0,0.45)",
            opacity: box * shown,
            transform: `scale(${mix(0.97, 1, box)})`,
          }}
        >
          <span
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              width: 40,
              height: 40,
              borderRadius: 20,
              display: "grid",
              placeItems: "center",
              background: "#25d366",
              color: "#fff",
            }}
          >
            <SendHorizontal size={18} strokeWidth={2.2} />
          </span>
        </div>
      )}
      {/* The words. */}
      {spots &&
        WORDS.map((word, index) => {
          const said = ease(t, SAY + index * STEP, 240);
          const from = spots.raw[index]!;
          const base: CSSProperties = {
            ...WORD_STYLE,
            position: "absolute",
            left: 0,
            top: 0,
            whiteSpace: "nowrap",
            borderRadius: 7,
          };
          if (word.drop) {
            // Marked in the pill's colour, then lifted away.
            const order = dropped++;
            const mark = ease(t, MARK + order * 40, 260);
            const lift = ease(t, LIFT + order * 55, 460);
            return (
              <span
                key={index}
                style={{
                  ...base,
                  transform: `translate3d(${RAW_BOX.left + from.x}px, ${RAW_BOX.top + from.y - lift * 16}px, 0) scale(${1 - lift * 0.06})`,
                  opacity: said * (1 - lift) * shown,
                  color: `color-mix(in srgb, ${tone("Dictate")} ${mark * 100}%, var(--color-text-secondary))`,
                  background: tone("Dictate", 0.16 * mark),
                  boxShadow: `0 0 0 3px ${tone("Dictate", 0.16 * mark)}`,
                }}
              >
                {word.raw}
              </span>
            );
          }
          // Kept: glides from where it was said to its place in the clean sentence.
          const to = spots.clean[kept]!;
          const move = glide(t, MOVE + kept++ * 14, MOVE_MS);
          const x = mix(RAW_BOX.left + from.x, CLEAN_BOX.left + to.x, move);
          const y = mix(RAW_BOX.top + from.y, CLEAN_BOX.top + to.y, move);
          return (
            <span
              key={index}
              style={{
                ...base,
                transform: `translate3d(${x.toFixed(2)}px, ${(y + (1 - said) * 6).toFixed(2)}px, 0)`,
                opacity: said * shown,
                color: `color-mix(in srgb, var(--color-text-primary) ${move * 100}%, var(--color-text-secondary))`,
              }}
            >
              {move > 0.5 ? (word.clean ?? word.raw) : word.raw}
            </span>
          );
        })}
      {/* The shortcut on a real keyboard, and the pill rising out of it. */}
      <Keyboard t={t} mac={mac} />
      <div style={{ position: "absolute", inset: 0, opacity: shown }}>
        <TinyPill
          t={t}
          top={PILL_TOP}
          rise={KEYS_TOP - PILL_TOP - 18}
          appearAt={EMERGE}
          speaking={[SAY - 80, STOP - 200]}
          stopAt={STOP}
          goneAt={PASTED}
          hue="Dictate"
        />
      </div>
    </Scene>
  );
}

// 2. Show the bug. Get proof. ------------------------------------------------------------------
//
// You describe the bug the way anyone would: vaguely. When you stop, every vague phrase gets a
// wavy underline, the filler lifts away, and each vague phrase flips over like a card to show its
// proof: a screenshot of the button, what actually happened, the exact error. The precise prompt
// settles in Claude Code's box and the pill goes.

type ProofKind = "save" | "nothing" | "error" | "in" | "file";

/** One piece of the sentence: said (`raw`), and/or what it becomes (`proof`). */
type Piece = { raw?: string; drop?: true; proof?: ProofKind };

const PIECES: Piece[] = [
  { raw: "ugh,", drop: true },
  { raw: "the save button thing", proof: "save" },
  { raw: "is broken again,", drop: true },
  { raw: "it just", drop: true },
  { raw: "doesn’t work,", proof: "nothing" },
  { raw: "something about map", proof: "error" },
  { raw: "I think", drop: true },
  { proof: "in" },
  { proof: "file" },
];

const P_APPEAR = 200;
const P_SAY = 650;
const P_WORD = 175;
/** When each said piece starts, word by word. */
const SAID_AT = (() => {
  let at = P_SAY;
  return PIECES.map((piece) => {
    const start = at;
    if (piece.raw) at += piece.raw.split(" ").length * P_WORD;
    return start;
  });
})();
const P_STOP = SAID_AT[SAID_AT.length - 1]! + 300;
const P_MARK = P_STOP + 150;
const P_LIFT = P_MARK + 450;
const P_FLIP = P_LIFT + 420;
const P_FLIP_GAP = 440;
const P_FLIP_MS = 380;
const P_MOVE = P_FLIP + 3 * P_FLIP_GAP + 150;
const P_MOVE_MS = 800;
const P_FRESH = P_MOVE + P_MOVE_MS - 200;
const P_SEND = P_FRESH + 500;
const P_OUT = P_SEND + 2100;
const PROOF_MS = P_OUT + 450;
const PROOF_STILL = P_OUT - 200;

/** The prompt box and the text inside it, in the scene's pixels. */
const PROMPT = { left: 30, top: 16, width: 500 };
const TEXT = { left: PROMPT.left + 22, top: PROMPT.top + 50, width: 462 };
const PROOF_TEXT: CSSProperties = {
  fontSize: 19,
  lineHeight: "34px",
  fontWeight: 500,
  letterSpacing: "-0.01em",
};

/** A tiny screenshot, as attached: the page with Save boxed, or the console with the error. */
function MiniShot({ kind }: { kind: "page" | "console" }) {
  const page = kind === "page";
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: 30,
        height: 21,
        borderRadius: 4,
        overflow: "hidden",
        flexShrink: 0,
        background: page ? "#ffffff" : "#1f1d1c",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    >
      {page ? (
        <>
          <span style={miniBar(4, 4, 14, 2, "#18181b")} />
          <span style={miniBar(4, 8, 22, 3, "#e4e4e7")} />
          <span style={miniBar(4, 15, 9, 3, "#5146e5")} />
          <span
            style={{
              ...miniBar(2, 13, 13, 7, "transparent"),
              boxShadow: `inset 0 0 0 1px ${tone("Fix")}`,
            }}
          />
        </>
      ) : (
        <>
          <span style={miniBar(3, 5, 20, 2, "#ff7b72")} />
          <span style={miniBar(3, 9, 15, 2, "#ff7b72")} />
          <span style={miniBar(3, 14, 10, 2, "rgba(255,255,255,0.3)")} />
          <span
            style={{
              ...miniBar(1, 3, 26, 9, "transparent"),
              boxShadow: `inset 0 0 0 1px ${tone("Fix")}`,
            }}
          />
        </>
      )}
    </span>
  );
}

const miniBar = (x: number, y: number, w: number, h: number, color: string): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: w,
  height: h,
  borderRadius: 1,
  background: color,
});

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 30,
  padding: "0 9px 0 4px",
  borderRadius: 8,
  verticalAlign: "middle",
};

/** What a vague phrase becomes. */
function Proof({ kind }: { kind: ProofKind }) {
  if (kind === "save")
    return (
      <span
        style={{
          ...CHIP,
          background: "color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
        }}
      >
        <MiniShot kind="page" />
        Save on Edit profile
      </span>
    );
  if (kind === "error")
    return (
      <span
        style={{
          ...CHIP,
          background: tone("Fix", 0.12),
          color: "color-mix(in srgb, rgb(214, 74, 50) 80%, var(--color-text-primary))",
          fontFamily: MONO,
          fontSize: 13.5,
          fontWeight: 500,
        }}
      >
        <MiniShot kind="console" />
        TypeError: can’t read ‘map’
      </span>
    );
  if (kind === "file")
    return (
      <span
        style={{
          ...CHIP,
          padding: "0 9px",
          background: "color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
          fontFamily: MONO,
          fontSize: 13.5,
        }}
      >
        ProfileForm.tsx:41
      </span>
    );
  return <span>{kind === "in" ? "in" : "does nothing."}</span>;
}

/** Lays out the said sentence and the proven one, hidden, and reads where each piece sits. */
function useProofSpots() {
  const raw = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<{
    raw: (Spot | null)[];
    done: (Spot | null)[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    const read = (box: HTMLDivElement | null) => {
      const spans = Array.from(box?.querySelectorAll<HTMLElement>(":scope > span") ?? []);
      return PIECES.map((_, index) => {
        const element = spans.find((span) => span.dataset.piece === String(index));
        return element ? { x: element.offsetLeft, y: element.offsetTop } : null;
      });
    };
    void document.fonts.ready.then(() => {
      if (live) setSpots({ raw: read(raw.current), done: read(done.current) });
    });
    return () => {
      live = false;
    };
  }, []);
  const measure = (
    <>
      <div
        ref={raw}
        style={{ ...PROOF_TEXT, ...at(TEXT), visibility: "hidden" }}
        aria-hidden="true"
      >
        {PIECES.map((piece, index) =>
          piece.raw ? (
            <span key={index} data-piece={index} style={{ display: "inline-block" }}>
              {piece.raw}&nbsp;
            </span>
          ) : null,
        )}
      </div>
      <div
        ref={done}
        style={{ ...PROOF_TEXT, ...at(TEXT), visibility: "hidden" }}
        aria-hidden="true"
      >
        {PIECES.map((piece, index) =>
          piece.proof ? (
            <span key={index} data-piece={index} style={{ display: "inline-block" }}>
              <Proof kind={piece.proof} />
              &nbsp;
            </span>
          ) : null,
        )}
      </div>
    </>
  );
  return { spots, measure };
}

function ProofScene() {
  const clock = useClock(PROOF_MS, 600);
  const t = still() ? PROOF_STILL : clock.t;
  const { spots, measure } = useProofSpots();
  const shown = 1 - ease(t, P_OUT, 420);
  // The placeholder, until the first word and again once the prompt has gone.
  const empty = Math.min(1, 1 - ease(t, P_SAY - 120, 140) + ease(t, P_OUT + 300, 260));
  const send = ease(t, P_SEND, 300) * shown;
  let flips = 0;
  let drops = 0;
  return (
    <Scene clock={clock} width={560} height={300}>
      {measure}
      {/* Claude Code's prompt box: always here. */}
      <div
        style={{
          ...at(PROMPT),
          height: 190,
          borderRadius: 20,
          background: "var(--color-background-card)",
          boxShadow: "inset 0 0 0 1px var(--color-border), 0 18px 40px -28px rgba(0,0,0,0.45)",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 22,
            top: 16,
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
          }}
        >
          <AppIcon app="claude" size={16} os="mac" />
          Claude Code
        </span>
        {/* Nothing typed yet: the placeholder and a blinking caret. */}
        <span
          style={{
            position: "absolute",
            left: 22,
            top: 50,
            ...PROOF_TEXT,
            color: "var(--color-text-secondary)",
            opacity: empty * 0.55,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 20,
              marginRight: 4,
              verticalAlign: "-3px",
              background: "var(--color-text-primary)",
              opacity: Math.floor(t / 530) % 2 === 0 ? 1 : 0,
            }}
          />
          Ask Claude Code…
        </span>
        <span
          style={{
            position: "absolute",
            right: 14,
            bottom: 14,
            width: 34,
            height: 34,
            borderRadius: 17,
            display: "grid",
            placeItems: "center",
            background: `color-mix(in srgb, ${tone("Fix")} ${send * 100}%, color-mix(in srgb, var(--color-text-primary) 10%, transparent))`,
            color: send > 0.5 ? "#fff" : "var(--color-text-secondary)",
            transform: `scale(${(1 + bump(t, P_SEND, 360) * 0.12).toFixed(3)})`,
          }}
        >
          <ArrowUp size={17} strokeWidth={2.4} />
        </span>
      </div>
      {/* The sentence, and its proof. */}
      <div style={{ position: "absolute", inset: 0, perspective: 700 }}>
        {spots &&
          PIECES.map((piece, index) => {
            const from = spots.raw[index];
            const to = spots.done[index];
            const said = ease(t, SAID_AT[index]!, 260);
            const base: CSSProperties = {
              ...PROOF_TEXT,
              position: "absolute",
              left: 0,
              top: 0,
              whiteSpace: "nowrap",
            };
            const parts: ReactNode[] = [];
            if (piece.raw && from) {
              const x = TEXT.left + from.x;
              const y = TEXT.top + from.y;
              if (piece.drop) {
                const lift = ease(t, P_LIFT + drops++ * 60, 440);
                parts.push(
                  <span
                    key="raw"
                    style={{
                      ...base,
                      transform: `translate3d(${x}px, ${(y - lift * 14 + (1 - said) * 6).toFixed(2)}px, 0)`,
                      opacity: said * (1 - lift) * shown,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {piece.raw}
                  </span>,
                );
              } else {
                // Vague: underlined wavy, then flipped over to its proof.
                const mark = ease(t, P_MARK, 300);
                const flipAt = P_FLIP + flips * P_FLIP_GAP;
                const out = ease(t, flipAt, P_FLIP_MS / 2);
                parts.push(
                  <span
                    key="raw"
                    style={{
                      ...base,
                      transform: `translate3d(${x}px, ${(y + (1 - said) * 6).toFixed(2)}px, 0) rotateX(${(out * 90).toFixed(1)}deg)`,
                      opacity: said * (out < 1 ? 1 : 0) * shown,
                      color: "var(--color-text-secondary)",
                      textDecorationLine: "underline",
                      textDecorationStyle: "wavy",
                      textDecorationColor: tone("Fix", mark),
                      textDecorationThickness: 1.5,
                      textUnderlineOffset: 6,
                    }}
                  >
                    {piece.raw}
                  </span>,
                );
              }
            }
            if (piece.proof && to) {
              let x = TEXT.left + to.x;
              let y = TEXT.top + to.y;
              let rotate = 0;
              let opacity = shown;
              if (from) {
                // The proof is the back of the vague phrase's card, then it moves into place.
                const flipAt = P_FLIP + flips++ * P_FLIP_GAP;
                const back = ease(t, flipAt + P_FLIP_MS / 2, P_FLIP_MS / 2);
                const move = glide(t, P_MOVE + index * 20, P_MOVE_MS);
                x = mix(TEXT.left + from.x, x, move);
                y = mix(TEXT.top + from.y, y, move);
                rotate = (1 - back) * -90;
                opacity *= back > 0 ? 1 : 0;
              } else {
                const fresh = ease(t, P_FRESH + (piece.proof === "file" ? 120 : 0), 380);
                y += (1 - fresh) * 8;
                opacity *= fresh;
              }
              parts.push(
                <span
                  key="proof"
                  style={{
                    ...base,
                    transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotateX(${rotate.toFixed(1)}deg)`,
                    opacity,
                    color: "var(--color-text-primary)",
                  }}
                >
                  <Proof kind={piece.proof} />
                </span>,
              );
            }
            return <Fragment key={index}>{parts}</Fragment>;
          })}
      </div>
      <TinyPill
        t={t}
        top={234}
        rise={10}
        appearAt={P_APPEAR}
        speaking={[P_SAY - 80, P_STOP - 150]}
        stopAt={P_STOP}
        goneAt={P_SEND}
        hue="Fix"
      />
    </Scene>
  );
}

// 3. Your secrets stay yours. ------------------------------------------------------------------
//
// A line down the middle is the edge of your device. A screenshot slides across it: whatever has
// crossed shows solid black boxes over the secrets, whatever hasn't is untouched. The bug itself
// stays readable.

type Run = { text: string; secret?: true; error?: true };

const TERMINAL: Run[][] = [
  [{ text: "$ export GITHUB_TOKEN=" }, { text: "ghp_8fK2xQ9mW", secret: true }],
  [{ text: "$ psql postgres://asha:" }, { text: "hunter2", secret: true }, { text: "@db" }],
  [{ text: "✗ Error: connection refused", error: true }],
];

const GATE = 280;
const CARD = { width: 260, height: 120, top: 84 };
const FROM_X = GATE - 16 - CARD.width;
const TO_X = GATE + 16;
const S_IN = 0;
const S_SCAN = 500;
const S_SCAN_MS = 900;
const S_FOUND = 1250;
const S_CROSS = 1900;
const S_CROSS_MS = 2600;
const S_SETTLE = S_CROSS + S_CROSS_MS;
const S_OUT = S_SETTLE + 2500;
const SECRETS_MS = S_OUT + 450;
const SECRETS_STILL = S_SETTLE + 900;

/** The terminal as captured: clear, or with its secrets under solid black boxes. */
function Shot({ redacted, found }: { redacted: boolean; found: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 12,
        overflow: "hidden",
        background: "#262422",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
        fontFamily: MONO,
        fontSize: 11,
        lineHeight: "22px",
        color: "rgba(255,255,255,0.78)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 26,
          paddingInline: 10,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            style={{ width: 7, height: 7, borderRadius: 4, background: "rgba(255,255,255,0.16)" }}
          />
        ))}
        <span style={{ marginLeft: 6, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          Terminal
        </span>
      </div>
      <div style={{ padding: "8px 12px", whiteSpace: "pre" }}>
        {TERMINAL.map((line, row) => (
          <div key={row}>
            {line.map((run, index) => (
              <span
                key={index}
                style={{
                  borderRadius: 2,
                  color: run.error ? "#ff8f84" : undefined,
                  ...(run.secret && redacted
                    ? {
                        background: "#000",
                        color: "transparent",
                        boxShadow: "0 0 0 2px #000, inset 0 0 0 1px rgba(255,255,255,0.06)",
                      }
                    : {}),
                  ...(run.secret && !redacted
                    ? {
                        outline: `1px dashed ${tone("Fix", found)}`,
                        outlineOffset: 2,
                        background: tone("Fix", 0.12 * found),
                      }
                    : {}),
                }}
              >
                {run.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SecretsScene() {
  const clock = useClock(SECRETS_MS, 400);
  const t = still() ? SECRETS_STILL : clock.t;
  const x = mix(FROM_X, TO_X, glide(t, S_CROSS, S_CROSS_MS));
  // Where the edge of the device falls across the screenshot, in its own pixels.
  const edge = Math.max(0, Math.min(CARD.width, GATE - x));
  const crossing = edge > 0 && edge < CARD.width ? 1 : 0;
  const glow = Math.min(1, ease(t, S_CROSS + 150, 300) * (1 - ease(t, S_SETTLE - 250, 300)));
  const shown = ease(t, S_IN, 360) * (1 - ease(t, S_OUT, 420));
  const scan = (t - S_SCAN) / S_SCAN_MS;
  const found = ease(t, S_FOUND, 320);
  return (
    <Scene clock={clock} width={560} height={320}>
      {/* The edge of your device: always here. */}
      <span
        style={{
          position: "absolute",
          left: 0,
          width: GATE - 18,
          top: 6,
          textAlign: "right",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-text-secondary)",
        }}
      >
        Your computer
      </span>
      <span
        style={{
          position: "absolute",
          left: GATE + 18,
          top: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-text-secondary)",
        }}
      >
        Leaves your device
      </span>
      <span
        style={{
          position: "absolute",
          left: GATE - 0.5,
          top: 34,
          width: 1,
          height: 222,
          background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${tone("Fix")} ${glow * 100}%, var(--color-border)) 15%, color-mix(in srgb, ${tone("Fix")} ${glow * 100}%, var(--color-border)) 85%, transparent)`,
          boxShadow: `0 0 ${(14 * glow).toFixed(1)}px ${(1.5 * glow).toFixed(1)}px ${tone("Fix", 0.45 * glow)}`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: GATE - 13,
          top: 4,
          width: 26,
          height: 26,
          borderRadius: 13,
          display: "grid",
          placeItems: "center",
          background: "var(--color-background-card)",
          boxShadow: "inset 0 0 0 1px var(--color-border)",
          color: glow > 0.5 ? tone("Fix") : "var(--color-text-secondary)",
          transition: "color 200ms ease",
        }}
      >
        <Lock size={12} strokeWidth={2.4} />
      </span>
      {/* The screenshot: clear on your side of the line, covered past it. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: CARD.top,
          width: CARD.width,
          height: CARD.height,
          transform: `translate3d(${x.toFixed(2)}px, ${((1 - shown) * 6).toFixed(2)}px, 0)`,
          opacity: shown,
          filter: "drop-shadow(0 16px 22px rgba(0,0,0,0.28))",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(-4px ${(CARD.width - edge).toFixed(2)}px -4px -4px)`,
          }}
        >
          <Shot redacted={false} found={found} />
          {/* Read on this device first. */}
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 26 + Math.max(0, Math.min(1, scan)) * (CARD.height - 28),
              height: 1,
              background: tone("Fix", 0.9),
              boxShadow: `0 0 8px 1px ${tone("Fix", 0.5)}`,
              opacity: scan > 0 && scan < 1 ? 1 : 0,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(-4px -4px -4px ${edge.toFixed(2)}px)`,
          }}
        >
          <Shot redacted found={0} />
        </div>
        {/* The light where it crosses. */}
        <span
          style={{
            position: "absolute",
            left: edge - 1,
            top: -4,
            width: 2,
            height: CARD.height + 8,
            background: tone("Fix"),
            boxShadow: `0 0 12px 2px ${tone("Fix", 0.6)}`,
            opacity: crossing,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: GATE,
          right: 0,
          top: CARD.top + CARD.height + 18,
          display: "flex",
          justifyContent: "center",
          opacity: shown,
        }}
      >
        <Toast t={t} at={S_SETTLE + 100}>
          Hid a GitHub token and a password
        </Toast>
      </div>
      <TinyPill
        t={t}
        top={268}
        rise={10}
        appearAt={S_CROSS - 300}
        speaking={[0, 0]}
        stopAt={S_CROSS - 300}
        goneAt={S_SETTLE + 100}
        hue="Fix"
      />
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
        line="Say it however you like. iVibe backs it up with proof."
        alt
      >
        <ProofScene />
      </Band>
      <Band
        title="Your secrets stay yours."
        line="Keys and passwords are blacked out before anything leaves your device."
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
