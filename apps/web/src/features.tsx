// SPDX-License-Identifier: AGPL-3.0-only

import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Check, SendHorizontal } from "lucide-react";
import { FIX_PROMPT, ProofConsole, ProofPage } from "./demo/apps.tsx";
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
function TinyPill({ t }: { t: number }) {
  const listening = t < STOP;
  const appear = ease(t, EMERGE, 460);
  const gone = ease(t, PASTED, 300);
  const speaking = t > SAY - 80 && t < STOP - 200;
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
        top: PILL_TOP,
        display: "flex",
        justifyContent: "center",
        opacity: appear * (1 - gone),
        transform: `translateY(${((1 - appear) * (KEYS_TOP - PILL_TOP - 18) + gone * 6).toFixed(2)}px) scale(${(0.45 + 0.55 * appear).toFixed(3)})`,
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
          boxShadow: `0 10px 30px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2), 0 0 26px -4px ${tone("Dictate", 0.45)}`,
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
        <TinyPill t={t} />
      </div>
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
