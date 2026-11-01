// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Lock } from "lucide-react";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { bump, ease, glide, MONO } from "./demo/kit.tsx";
import { TONES } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { Scene, useClock } from "./features.tsx";
import { REPO } from "./release.ts";

/**
 * Everything shipped, as a git line that draws itself once and carries the mascot to "now". From
 * there a dashed path runs to the two updates coming next: Vibes, where every mode is a removable
 * piece, and the note taker, the first big thing built that way.
 */

const RELEASES = [
  { tag: "v0.1.0", date: "Oct 29", line: "First release: Windows, Mac and Linux" },
  { tag: "v0.1.1", date: "Oct 29", line: "Clearer errors, no more dead recordings" },
  { tag: "v0.1.2", date: "Oct 29", line: "Faster Dictate: pastes in about two seconds" },
  { tag: "v0.1.3", date: "Oct 31", line: "Dependable pill, one-step Mac install" },
];
const COLUMNS = RELEASES.length + 1;
const DRAW_MS = 1800;
const SERIF = '"Instrument Serif", Georgia, serif';
const NARROW = "(max-width: 760px)";
const HAIRLINE = "color-mix(in srgb, var(--color-text-primary) 26%, transparent)";

const pulse = stylex.keyframes({
  from: { transform: "scale(1)", opacity: 0.55 },
  to: { transform: "scale(2.6)", opacity: 0 },
});
const stepping = stylex.keyframes({
  from: { transform: "translateY(0)" },
  to: { transform: "translateY(-4px)" },
});

const styles = stylex.create({
  section: {
    paddingBlock: { default: 120, "@media (max-width: 900px)": 72 },
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
    overflow: "hidden",
  },
  inner: { maxWidth: 1040, marginInline: "auto" },
  words: { textAlign: "center" },
  title: {
    fontFamily: SERIF,
    fontSize: "clamp(36px, 4vw, 52px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  // The line: stops across on a wide screen, down the side on a phone.
  track: {
    position: "relative",
    marginTop: { default: 40, [`@media ${NARROW}`]: 48 },
    paddingTop: { default: 64, [`@media ${NARROW}`]: 0 },
  },
  stops: {
    display: "grid",
    gridTemplateColumns: {
      default: `repeat(${COLUMNS}, minmax(0, 1fr))`,
      [`@media ${NARROW}`]: "minmax(0, 1fr)",
    },
    rowGap: 28,
  },
  stop: {
    position: "relative",
    display: "flex",
    flexDirection: { default: "column", [`@media ${NARROW}`]: "row" },
    alignItems: { default: "center", [`@media ${NARROW}`]: "flex-start" },
    textAlign: { default: "center", [`@media ${NARROW}`]: "start" },
    gap: { default: 14, [`@media ${NARROW}`]: 16 },
    paddingInline: { default: 10, [`@media ${NARROW}`]: 0 },
  },
  stopWords: {
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "center", [`@media ${NARROW}`]: "flex-start" },
    gap: 3,
    minWidth: 0,
  },
  drawn: {
    position: "absolute",
    backgroundColor: "var(--color-text-primary)",
    top: { default: 70, [`@media ${NARROW}`]: 6 },
    bottom: { default: "auto", [`@media ${NARROW}`]: 11 },
    left: { default: `${50 / COLUMNS}%`, [`@media ${NARROW}`]: 6 },
    width: { default: `${100 - 100 / COLUMNS}%`, [`@media ${NARROW}`]: 2 },
    height: { default: 2, [`@media ${NARROW}`]: "auto" },
    transformOrigin: { default: "0 50%", [`@media ${NARROW}`]: "50% 0" },
    transitionProperty: "transform",
    transitionDuration: `${DRAW_MS}ms`,
    transitionTimingFunction: "cubic-bezier(0.45, 0, 0.3, 1)",
  },
  undrawn: {
    transform: { default: "scaleX(0)", [`@media ${NARROW}`]: "scaleY(0)" },
  },
  dot: {
    position: "relative",
    flexShrink: 0,
    width: 14,
    height: 14,
    borderRadius: "50%",
    backgroundColor: "var(--color-text-primary)",
    transitionProperty: "transform, opacity",
    transitionDuration: "320ms",
    transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  dotWaiting: { transform: "scale(0)", opacity: 0 },
  ring: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    backgroundColor: "var(--color-text-primary)",
    animationName: { default: pulse, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1800ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-out",
    opacity: { default: "auto", "@media (prefers-reduced-motion: reduce)": 0 },
  },
  mascot: {
    position: "absolute",
    top: 0,
    width: 56,
    marginLeft: -28,
    pointerEvents: "none",
    transitionProperty: "left",
    transitionDuration: `${DRAW_MS}ms`,
    transitionTimingFunction: "cubic-bezier(0.45, 0, 0.3, 1)",
  },
  walking: {
    animationName: { default: stepping, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "190ms",
    animationDirection: "alternate",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
  },
  // The dashed path from "now" to the first card.
  path: {
    position: "relative",
    height: { default: 64, [`@media ${NARROW}`]: 36 },
    marginTop: { default: 14, [`@media ${NARROW}`]: 6 },
    transitionProperty: "opacity",
    transitionDuration: "420ms",
  },
  pathAcross: {
    position: "absolute",
    // It starts right under "Now", which has no text below it.
    top: -76,
    height: 108,
    left: "25%",
    right: `${50 / COLUMNS}%`,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderStyle: "dashed",
    borderColor: HAIRLINE,
    borderBottomRightRadius: 14,
    display: { default: "block", [`@media ${NARROW}`]: "none" },
  },
  pathDown: {
    position: "absolute",
    top: { default: 32, [`@media ${NARROW}`]: -14 },
    bottom: 0,
    left: { default: "25%", [`@media ${NARROW}`]: 6 },
    width: 0,
    borderLeftWidth: 1.5,
    borderLeftStyle: "dashed",
    borderLeftColor: HAIRLINE,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [`@media ${NARROW}`]: "minmax(0, 1fr)",
    },
    gap: 24,
    transitionProperty: "opacity, transform",
    transitionDuration: "520ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 0,
    padding: { default: 28, "@media (max-width: 640px)": 20 },
    borderRadius: 20,
    backgroundColor:
      "color-mix(in srgb, var(--color-text-primary) 3%, var(--color-background-surface))",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, var(--color-text-primary) 8%, transparent)",
  },
  cardTitle: {
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: 400,
    lineHeight: 1.1,
    margin: 0,
  },
  waiting: { opacity: 0, transform: "translateY(10px)" },
  shown: { opacity: 1, transform: "none" },
  after: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginTop: 48,
  },
});

/**
 * True once either part has scrolled into view, so scrolling fast past the line can't leave the
 * cards hidden; straight away with reduced motion.
 */
function useSeen() {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (seen) return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        setSeen(true);
      },
      { threshold: 0.3 },
    );
    for (const element of [box.current, cards.current]) if (element) watch.observe(element);
    return () => watch.disconnect();
  }, [seen]);
  return { box, cards, seen };
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return narrow;
}

// The Vibes scene ------------------------------------------------------------------------------
//
// Every mode is a keycap on a switch plate. Dictate pulls off to show the switch under it: even the
// built-in ones are just vibes. Then what you say flies into an empty socket, a new key drops in
// and clicks, and the socket left over is where the note taker goes.

const SAID = "add a mode that turns my rant into a polite reply";
const SAID_WORDS = SAID.split(" ");

const V_LIFT = 700;
const V_LIFT_MS = 420;
const V_BACK = 1780;
const V_BACK_MS = 280;
const V_TALK = 2500;
const V_WORDS = V_TALK + 260;
const V_WORD_MS = 170;
const V_ABSORB = V_WORDS + SAID_WORDS.length * V_WORD_MS + 220;
const V_ABSORB_STAGGER = 55;
const V_FLY_MS = 460;
const V_FORM = V_ABSORB + SAID_WORDS.length * V_ABSORB_STAGGER + V_FLY_MS - 120;
const V_FORM_MS = 340;
const V_LAND = V_FORM + V_FORM_MS;
const V_RISE = V_LAND + 200;
const V_NEXT = V_RISE + 520;
const V_OUT = V_NEXT + 2500;
const VIBES_MS = V_OUT + 420;

const PLATE = { left: 20, width: 400, top: 112, pad: 14 };
const CAP = { width: 68, height: 58, gap: 8 };
const PLATE_HEIGHT = CAP.height + PLATE.pad * 2;
/** The plate sits in the middle until you talk, then moves down to make room for your words. */
const PLATE_REST = -30;
const capX = (index: number) => PLATE.left + PLATE.pad + index * (CAP.width + CAP.gap);
const CAP_Y = PLATE.top + PLATE.pad;
const WORDS_Y = 56;

function Socket({
  index,
  tone,
  lit = 0,
  children,
}: {
  index: number;
  tone?: Tone;
  /** How brightly the switch glows, 0 to 1. */
  lit?: number;
  children?: ReactNode;
}) {
  const light = tone ? TONES[tone] : "244, 241, 234";
  const stem = `rgba(${light}, ${(0.28 + 0.72 * lit).toFixed(3)})`;
  return (
    <span
      style={{
        position: "absolute",
        left: capX(index),
        top: CAP_Y,
        width: CAP.width,
        height: CAP.height,
        borderRadius: 10,
        background: `radial-gradient(60% 60% at 50% 42%, rgba(${light}, ${(0.26 * lit).toFixed(3)}), transparent 72%), #070706`,
        boxShadow: "inset 0 2px 5px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* The switch's cross, what a keycap sits on. */}
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 18,
          width: 15,
          height: 4,
          marginLeft: -7.5,
          borderRadius: 1,
          background: stem,
          boxShadow: `0 0 ${(10 * lit).toFixed(1)}px rgba(${light}, ${(0.8 * lit).toFixed(3)})`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 12.5,
          width: 4,
          height: 15,
          marginLeft: -2,
          borderRadius: 1,
          background: stem,
        }}
      />
      {children}
    </span>
  );
}

function Keycap({
  name,
  tone,
  index,
  led = 0,
  y = 0,
  turn = 0,
  lifted = 0,
  pressed = 0,
  opacity = 1,
}: {
  name: string;
  tone?: Tone;
  index: number;
  /** How bright its light is beyond resting, 0 to 1. */
  led?: number;
  y?: number;
  turn?: number;
  /** 0 seated, 1 held off the plate. */
  lifted?: number;
  /** 0 up, 1 clicked down. */
  pressed?: number;
  opacity?: number;
}) {
  const light = tone ? TONES[tone] : "244, 241, 234";
  return (
    <span
      style={{
        position: "absolute",
        left: capX(index),
        top: CAP_Y - 3,
        width: CAP.width,
        height: CAP.height,
        borderRadius: 10,
        background: "linear-gradient(180deg, #fdfaf3 0%, #f1ecdf 62%, #e6e0d2 100%)",
        color: "#25221d",
        fontSize: 12.5,
        fontWeight: 500,
        opacity,
        boxShadow: [
          "inset 0 1px 0 rgba(255, 255, 255, 0.95)",
          "inset 0 -2px 3px rgba(70, 60, 40, 0.1)",
          `0 ${(4 - 2.5 * pressed).toFixed(2)}px 0 #aaa394`,
          `0 ${(7 + 26 * lifted).toFixed(1)}px ${(9 + 20 * lifted).toFixed(1)}px rgba(0, 0, 0, ${(0.5 - 0.12 * lifted).toFixed(3)})`,
        ].join(", "),
        transform: `translate3d(0, ${(y + 2.5 * pressed).toFixed(2)}px, 0) rotate(${turn.toFixed(2)}deg) scale(${(1 + 0.05 * lifted).toFixed(3)})`,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 9,
          top: 9,
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: tone ? `rgb(${light})` : `rgba(90, 82, 68, ${(0.3 + 0.7 * led).toFixed(3)})`,
          boxShadow: `0 0 ${(2 + 8 * led).toFixed(1)}px rgba(${tone ? light : "90, 82, 68"}, ${(0.45 + 0.55 * led).toFixed(3)})`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 10,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </span>
  );
}

/** Where each spoken word sits, measured once the fonts are in. */
function useWordSpots() {
  const row = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<{ left: number; width: number }[]>([]);
  useEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => {
      const element = row.current;
      if (!live || !element) return;
      setSpots(
        [...element.children].map((child) => {
          const word = child as HTMLElement;
          return { left: word.offsetLeft, width: word.offsetWidth };
        }),
      );
    });
    return () => {
      live = false;
    };
  }, []);
  return { row, spots };
}

function VibesScene() {
  const clock = useClock(VIBES_MS, 400);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t = still ? V_NEXT + 1000 : clock.t;
  const { row, spots } = useWordSpots();
  const shown = ease(t, 0, 380) * (1 - ease(t, V_OUT, 400));

  // Dictate comes off and goes back.
  const lift = glide(t, V_LIFT, V_LIFT_MS) * (1 - glide(t, V_BACK, V_BACK_MS));
  const click = bump(t, V_BACK + V_BACK_MS - 30, 220);
  const flash = bump(t, V_BACK + V_BACK_MS - 30, 700);

  // You talk: the plate moves down, the pill comes in, the words arrive.
  const talking = glide(t, V_TALK, 380) * (1 - glide(t, V_RISE, 460));
  const pillShown = ease(t, V_TALK + 100, 280) * (1 - ease(t, V_ABSORB + 200, 300));
  const voice =
    t > V_WORDS && t < V_ABSORB
      ? 0.55 + 0.25 * Math.sin(t / 120) + 0.2 * Math.sin(t / 51 + 1.4)
      : 0.14;

  // The words fall into the socket, which brightens with each one.
  const heard = Math.max(0, Math.min(1, (t - V_ABSORB - V_FLY_MS * 0.6) / (V_FORM - V_ABSORB)));
  const socketLit = heard * (1 - ease(t, V_LAND, 120));

  // The new key drops in, clicks, and its light comes on.
  const falling = glide(t, V_FORM, V_FORM_MS);
  const landed = bump(t, V_LAND - 20, 220);
  const lightsUp = bump(t, V_LAND, 900);

  // The socket left over is waiting for the note taker.
  const next = ease(t, V_NEXT, 360);
  const breathing = t > V_NEXT ? 0.5 + 0.5 * Math.sin((t - V_NEXT) / 360) : 0;

  const socketX = capX(3) + CAP.width / 2;
  const socketY = CAP_Y + CAP.height / 2;

  return (
    <Scene clock={clock} width={440} height={232}>
      <div style={{ position: "absolute", inset: 0, opacity: shown }}>
        {/* The pill, listening. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 8,
            width: 92,
            height: 32,
            marginLeft: -46,
            borderRadius: 12,
            background: "#0f0e0d",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 10px 26px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2.5,
            opacity: pillShown,
            transform: `translateY(${((1 - pillShown) * 8).toFixed(2)}px)`,
          }}
        >
          {Array.from({ length: 13 }, (_, index) => {
            const middle = 1 - Math.abs(index - 6) / 7;
            const sway = 0.75 + 0.25 * Math.sin(t / 90 - index * 0.7);
            const level = Math.min(1, Math.max(0.14, (0.3 + 0.7 * middle) * voice * sway * 1.5));
            return (
              <span
                key={index}
                style={{
                  width: 2,
                  height: 16,
                  borderRadius: 1,
                  background: "#f4f1ea",
                  transform: `scaleY(${level.toFixed(3)})`,
                }}
              />
            );
          })}
        </div>

        {/* The plate. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate3d(0, ${(PLATE_REST * (1 - talking)).toFixed(2)}px, 0)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: PLATE.left,
              top: PLATE.top,
              width: PLATE.width,
              height: PLATE_HEIGHT,
              borderRadius: 18,
              background: "linear-gradient(180deg, #24221f 0%, #171614 45%, #100f0e 100%)",
              boxShadow: [
                "inset 0 1px 0 rgba(255, 255, 255, 0.14)",
                "inset 0 -1px 0 rgba(0, 0, 0, 0.6)",
                "0 2px 0 #050505",
                "0 22px 40px -8px rgba(0, 0, 0, 0.5)",
              ].join(", "),
            }}
          />
          <Socket index={0} />
          <Socket index={1} />
          <Socket index={2} tone="Dictate" lit={lift} />
          <Socket index={3} lit={socketLit} />
          <Socket index={4} lit={next * (0.35 + 0.65 * breathing)}>
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 8,
                textAlign: "center",
                fontSize: 10.5,
                whiteSpace: "nowrap",
                color: "rgba(244, 241, 234, 0.85)",
                opacity: next,
              }}
            >
              Note taker
            </span>
          </Socket>

          <Keycap name="Fix" tone="Fix" index={0} />
          <Keycap name="Prompt" tone="Prompt" index={1} />
          {falling > 0 && (
            <Keycap
              name="Polite"
              index={3}
              y={(1 - falling) * -58}
              turn={(1 - falling) * 3}
              lifted={1 - falling}
              pressed={landed}
              led={lightsUp}
              opacity={ease(t, V_FORM, 160)}
            />
          )}
          {/* Last, so it passes in front of the others while it's off the plate. */}
          <Keycap
            name="Dictate"
            tone="Dictate"
            index={2}
            y={lift * -50}
            turn={lift * -4.5}
            lifted={lift}
            pressed={click}
            led={flash}
          />
        </div>

        {/* What you said, word by word, then into the socket. */}
        <div
          ref={row}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: WORDS_Y,
            display: "flex",
            justifyContent: "center",
            gap: "0.32em",
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap",
          }}
        >
          {SAID_WORDS.map((word, index) => {
            const spot = spots[index];
            const spoken = ease(t, V_WORDS + index * V_WORD_MS, 200);
            const fly = glide(t, V_ABSORB + index * V_ABSORB_STAGGER, V_FLY_MS);
            const toX = spot ? socketX - (spot.left + spot.width / 2) : 0;
            const toY = socketY - (WORDS_Y + 9);
            const x = toX * fly;
            const y = (1 - spoken) * 7 + toY * fly - 22 * Math.sin(fly * Math.PI);
            const gone = fly > 0.72 ? (fly - 0.72) / 0.28 : 0;
            return (
              <span
                key={index}
                style={{
                  display: "inline-block",
                  opacity: spoken * (1 - gone) * (1 - ease(t, V_LAND, 60)),
                  transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${(1 - 0.62 * fly).toFixed(3)})`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </Scene>
  );
}

// The note taker scene -------------------------------------------------------------------------
//
// Two voices run in as two lines, meet at the pill and come out as ink on a page. The page stays
// frosted: it isn't here yet.

const N_TURN_MS = 1650;
const N_TURNS = 4;
const N_DONE = N_TURN_MS * N_TURNS;
const N_OUT = N_DONE + 2100;
const NOTES_MS = N_OUT + 420;

const WAVE = { until: 172, middle: 112, apart: 40, step: 4 };
const NOTE_PILL = { left: 172, width: 62, height: 32 };
const NOTE_PAGE = { left: 262, top: 12, width: 166, height: 200 };
const NOTE_LINES = [
  { width: 0.48, top: 26, height: 8, strong: true },
  { width: 0.82, top: 48 },
  { width: 0.7, top: 62 },
  { width: 0.76, top: 76 },
  { width: 0.4, top: 104, height: 8, strong: true },
  { width: 0.8, top: 126 },
  { width: 0.62, top: 140 },
  { width: 0.72, top: 154 },
];

/** How much a voice is talking: the first has turns 0 and 2, the second 1 and 3. */
function talkLevel(t: number, voice: number) {
  let level = 0;
  for (let turn = voice; turn < N_TURNS; turn += 2) {
    const from = turn * N_TURN_MS;
    level += glide(t, from - 60, 260) * (1 - glide(t, from + N_TURN_MS - 200, 260));
  }
  return level;
}

function wavePath(t: number, voice: number, level: number) {
  const { until, middle, apart, step } = WAVE;
  const side = voice === 0 ? -1 : 1;
  const points: string[] = [];
  for (let x = 0; x <= until; x += step) {
    const along = x / until;
    const home = middle + side * apart * (1 - along) ** 1.5;
    // Quiet at the far edge and where it meets the pill, loudest between.
    const shape = Math.sin(Math.PI * along ** 0.85);
    const wave =
      Math.sin(x / 7.5 - t / 95 + voice * 2.1) * (0.6 + 0.4 * Math.sin(x / 21 + t / 300 + voice));
    const y = home + wave * shape * (1.4 + 17 * level);
    points.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function NotesScene() {
  const clock = useClock(NOTES_MS, 400);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t = still ? N_DONE + 1400 : clock.t;
  const shown = ease(t, 0, 380) * (1 - ease(t, N_OUT, 400));
  const levels = [talkLevel(t, 0), talkLevel(t, 1)];
  const anyone = Math.max(levels[0]!, levels[1]!);
  const sealed = ease(t, N_DONE + 150, 420);
  const sheen = (t - N_DONE) / 1100;

  // Which line the pen is on, and how far along.
  const lineMs = (N_DONE - 500) / NOTE_LINES.length;
  const penLine = Math.floor((t - 300) / lineMs);
  const written = (index: number) => glide(t, 300 + index * lineMs, lineMs * 0.92);
  const pen = NOTE_LINES[penLine];
  const penAlong = pen ? written(penLine) : 0;

  return (
    <Scene clock={clock} width={440} height={232}>
      <div style={{ position: "absolute", inset: 0, opacity: shown }}>
        {/* The two voices, fading in from nothing at the edge. */}
        <svg
          width={WAVE.until}
          height={224}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
        >
          <defs>
            <linearGradient
              id="note-voice"
              gradientUnits="userSpaceOnUse"
              x1={0}
              x2={WAVE.until}
              y1={0}
              y2={0}
            >
              <stop offset="0" stopColor="var(--color-text-primary)" stopOpacity={0} />
              <stop offset="0.28" stopColor="var(--color-text-primary)" stopOpacity={1} />
            </linearGradient>
          </defs>
          {[0, 1].map((voice) => (
            <path
              key={voice}
              d={wavePath(t, voice, levels[voice]!)}
              fill="none"
              stroke="url(#note-voice)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.32 + 0.68 * levels[voice]!}
            />
          ))}
        </svg>

        {/* What leaves the pill, on its way to the page. */}
        <span
          style={{
            position: "absolute",
            left: NOTE_PILL.left + NOTE_PILL.width,
            width: NOTE_PAGE.left - NOTE_PILL.left - NOTE_PILL.width + 4,
            top: WAVE.middle - 0.75,
            height: 1.5,
            overflow: "hidden",
            opacity: 0.3 + 0.7 * anyone,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--color-text-primary) 0 5px, transparent 5px 10px)",
              backgroundPositionX: `${((t / 22) % 10).toFixed(2)}px`,
            }}
          />
        </span>

        {/* The pill. */}
        <div
          style={{
            position: "absolute",
            left: NOTE_PILL.left,
            top: WAVE.middle - NOTE_PILL.height / 2,
            width: NOTE_PILL.width,
            height: NOTE_PILL.height,
            borderRadius: 12,
            background: "#0f0e0d",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 10px 26px rgba(0, 0, 0, 0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2.5,
          }}
        >
          {Array.from({ length: 9 }, (_, index) => {
            const middle = 1 - Math.abs(index - 4) / 5;
            const sway = 0.7 + 0.3 * Math.sin(t / 85 - index * 0.8);
            const level = Math.max(0.14, (0.15 + 0.85 * anyone) * (0.3 + 0.7 * middle) * sway);
            return (
              <span
                key={index}
                style={{
                  width: 2,
                  height: 15,
                  borderRadius: 1,
                  background: "#f4f1ea",
                  transform: `scaleY(${level.toFixed(3)})`,
                }}
              />
            );
          })}
        </div>

        {/* The page, on a small stack of them. */}
        <div
          style={{
            position: "absolute",
            left: NOTE_PAGE.left,
            top: NOTE_PAGE.top,
            width: NOTE_PAGE.width,
            height: NOTE_PAGE.height,
            perspective: 700,
          }}
        >
          {[3.4, 1.6].map((turn) => (
            <span
              key={turn}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 7,
                background: "#e8e2d4",
                boxShadow: "0 8px 18px rgba(0, 0, 0, 0.14)",
                transform: `rotate(${turn}deg)`,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 7,
              overflow: "hidden",
              background: "linear-gradient(170deg, #fbf8f1 0%, #f4efe3 100%)",
              boxShadow: "0 16px 30px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
            }}
          >
            {/* Blurred from the first stroke, so nothing can be read. */}
            <div style={{ position: "absolute", inset: 0, filter: "blur(2.6px)" }}>
              {NOTE_LINES.map((line, index) => (
                <span
                  key={index}
                  style={{
                    position: "absolute",
                    left: 16,
                    top: line.top,
                    width: (NOTE_PAGE.width - 32) * line.width,
                    height: line.height ?? 5,
                    borderRadius: 3,
                    background: line.strong ? "#2a2622" : "#857d70",
                    transformOrigin: "0 50%",
                    transform: `scaleX(${written(index).toFixed(3)})`,
                  }}
                />
              ))}
            </div>
            {/* The tip of the pen. */}
            {pen && t < N_DONE && (
              <span
                style={{
                  position: "absolute",
                  left: 16 + (NOTE_PAGE.width - 32) * pen.width * penAlong - 2.5,
                  top: pen.top + (pen.height ?? 5) / 2 - 2.5,
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#2a2622",
                  boxShadow: "0 0 7px rgba(42, 38, 34, 0.5)",
                }}
              />
            )}
            {/* A light passing over it as it seals. */}
            {sheen > 0 && sheen < 1 && (
              <span
                style={{
                  position: "absolute",
                  top: -30,
                  bottom: -30,
                  width: 54,
                  left: -70 + sheen * (NOTE_PAGE.width + 110),
                  background:
                    "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent)",
                  transform: "rotate(16deg)",
                }}
              />
            )}
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                display: "flex",
                alignItems: "center",
                gap: 5,
                height: 26,
                paddingInline: 10,
                borderRadius: 10,
                background: "#0f0e0d",
                color: "#f4f1ea",
                fontSize: 11.5,
                fontWeight: 500,
                boxShadow: "0 8px 18px rgba(0, 0, 0, 0.3)",
                opacity: sealed,
                transform: `translate(-50%, -50%) scale(${(0.9 + 0.1 * sealed).toFixed(3)})`,
              }}
            >
              <Lock size={11} strokeWidth={2.4} aria-hidden="true" />
              Soon
            </span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

// The section ----------------------------------------------------------------------------------

function CardLabel({ children }: { children: string }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--color-text-secondary)" }}>
      {children}
    </span>
  );
}

export function Roadmap() {
  const { box, cards, seen } = useSeen();
  const narrow = useNarrow();
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!seen) return;
    const timer = window.setTimeout(() => setArrived(true), DRAW_MS);
    return () => window.clearTimeout(timer);
  }, [seen]);

  const mascot = (
    <Mascot
      size={56}
      state={arrived ? "done" : "idle"}
      gaze={arrived ? { x: -0.7, y: 0.5 } : { x: 1, y: 0 }}
    />
  );

  return (
    <section id="roadmap" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.inner)}>
        <div {...stylex.props(styles.words)}>
          <VStack gap={4}>
            <Heading level={2} xstyle={styles.title}>
              Built in the open.
            </Heading>
            <Text size="lg" color="secondary">
              Every update, in public.
            </Text>
          </VStack>
        </div>

        <div ref={box} {...stylex.props(styles.track)}>
          <span {...stylex.props(styles.drawn, !seen && styles.undrawn)} />
          {!narrow && (
            <div
              {...stylex.props(styles.mascot, seen && !arrived && styles.walking)}
              style={{ left: seen ? `${100 - 50 / COLUMNS}%` : `${50 / COLUMNS}%` }}
            >
              {mascot}
            </div>
          )}
          <ol {...stylex.props(styles.stops)} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {RELEASES.map((release, index) => (
              <li key={release.tag} {...stylex.props(styles.stop)}>
                <span
                  {...stylex.props(styles.dot, !seen && styles.dotWaiting)}
                  style={{ transitionDelay: `${(index * DRAW_MS) / (COLUMNS - 1)}ms` }}
                />
                <span {...stylex.props(styles.stopWords)}>
                  <Link href={`https://github.com/${REPO}/releases/tag/${release.tag}`}>
                    <span style={{ fontFamily: MONO, fontSize: 13 }}>{release.tag}</span>
                  </Link>
                  <Text size="sm" color="secondary">
                    {release.date}
                  </Text>
                  <Text size="sm">{release.line}</Text>
                </span>
              </li>
            ))}
            <li {...stylex.props(styles.stop)}>
              <span
                {...stylex.props(styles.dot, !seen && styles.dotWaiting)}
                style={{ transitionDelay: `${DRAW_MS - 120}ms` }}
              >
                {arrived && <span {...stylex.props(styles.ring)} />}
              </span>
              <span {...stylex.props(styles.stopWords)}>
                <span style={{ fontFamily: MONO, fontSize: 13 }}>Now</span>
                {narrow && (
                  <span style={{ position: "absolute", left: 66, top: -20 }}>{mascot}</span>
                )}
              </span>
            </li>
          </ol>
        </div>

        <div aria-hidden="true" {...stylex.props(styles.path)} style={{ opacity: arrived ? 1 : 0 }}>
          <span {...stylex.props(styles.pathAcross)} />
          <span {...stylex.props(styles.pathDown)} />
        </div>

        <div ref={cards} {...stylex.props(styles.cards, arrived ? styles.shown : styles.waiting)}>
          <article {...stylex.props(styles.card)}>
            <VStack gap={2}>
              <CardLabel>Next</CardLabel>
              <h3 {...stylex.props(styles.cardTitle)}>Everything is a vibe.</h3>
              <Text color="secondary">Say what you want. iVibe builds it.</Text>
            </VStack>
            <VibesScene />
          </article>
          <article {...stylex.props(styles.card)}>
            <VStack gap={2}>
              <CardLabel>Then</CardLabel>
              <h3 {...stylex.props(styles.cardTitle)}>Note taker.</h3>
              <Text color="secondary">Built to outdo them all, open or closed.</Text>
            </VStack>
            <NotesScene />
          </article>
        </div>

        <div {...stylex.props(styles.after)}>
          <Button label="View on GitHub" variant="primary" href={`https://github.com/${REPO}`} />
          <Link href={`https://github.com/${REPO}/discussions`}>Suggest a feature</Link>
          <Text size="sm" color="secondary">
            AGPL-3.0
          </Text>
        </div>
      </div>
    </section>
  );
}
