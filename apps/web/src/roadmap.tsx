// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { bump, ease, glide, MONO } from "./demo/kit.tsx";
import { TONES } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { Scene, useClock } from "./features.tsx";
import { Awake } from "./pricing.tsx";
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

/** True once the element has scrolled into view; straight away with reduced motion. */
function useSeen() {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const element = box.current;
    if (!element || seen) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watch.disconnect();
        setSeen(true);
      },
      { threshold: 0.3 },
    );
    watch.observe(element);
    return () => watch.disconnect();
  }, [seen]);
  return { box, seen };
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
// The pill's modes are cartridges. Dictate lifts out and clicks back: even the built-in ones are
// just vibes. You say what you want, a new one forms and clicks in, and the empty slot beside it
// is where the note taker goes.

const SAID = "add a mode that turns my rant into a polite reply";
const V_LIFT = 900;
const V_LIFT_MS = 360;
const V_BACK = 1750;
const V_BACK_MS = 300;
const V_LISTEN = 2500;
const V_TYPE = V_LISTEN + 150;
const V_TYPE_CHAR_MS = 30;
const V_FORM = V_TYPE + SAID.length * V_TYPE_CHAR_MS + 260;
const V_FORM_MS = 420;
const V_NEXT = V_FORM + V_FORM_MS + 500;
const V_OUT = V_NEXT + 2300;
const VIBES_MS = V_OUT + 420;

const DOCK = { left: 16, width: 408, top: 150, height: 54, pad: 8, gap: 6 };
const SLOT_WIDTH = (DOCK.width - DOCK.pad * 2 - DOCK.gap * 4) / 5;
const slotX = (index: number) => DOCK.left + DOCK.pad + index * (SLOT_WIDTH + DOCK.gap);
const CARTRIDGE_TOP = DOCK.top + DOCK.pad;
const CARTRIDGE_HEIGHT = DOCK.height - DOCK.pad * 2;
const OPEN_SLOT = "rgba(244, 241, 234, 0.32)";

function Cartridge({
  name,
  tone,
  index,
  y = 0,
  turn = 0,
  scale = 1,
  opacity = 1,
}: {
  name: string;
  tone?: Tone;
  index: number;
  y?: number;
  turn?: number;
  scale?: number;
  opacity?: number;
}) {
  return (
    <span
      style={{
        position: "absolute",
        left: slotX(index),
        top: CARTRIDGE_TOP,
        width: SLOT_WIDTH,
        height: CARTRIDGE_HEIGHT,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: "#f4f1ea",
        color: "#191816",
        fontSize: 12.5,
        fontWeight: 500,
        opacity,
        boxShadow: y < -2 ? "0 12px 22px rgba(0, 0, 0, 0.32)" : "none",
        transform: `translate3d(0, ${y.toFixed(2)}px, 0) rotate(${turn.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      }}
    >
      {tone && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: `rgb(${TONES[tone]})`,
          }}
        />
      )}
      {name}
    </span>
  );
}

function VibesScene() {
  const clock = useClock(VIBES_MS, 400);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t = still ? V_NEXT + 900 : clock.t;
  const shown = ease(t, 0, 380) * (1 - ease(t, V_OUT, 400));

  const lift = glide(t, V_LIFT, V_LIFT_MS) * (1 - glide(t, V_BACK, V_BACK_MS));
  const click = bump(t, V_BACK + V_BACK_MS - 30, 240);
  const typed = Math.max(0, Math.min(SAID.length, Math.floor((t - V_TYPE) / V_TYPE_CHAR_MS)));
  const listening = ease(t, V_LISTEN, 260) * (1 - ease(t, V_FORM, 240));
  const falling = glide(t, V_FORM, V_FORM_MS);
  const landed = bump(t, V_FORM + V_FORM_MS - 30, 260);
  const next = ease(t, V_NEXT, 320);
  const breathing = t > V_NEXT ? 0.5 + 0.5 * Math.sin((t - V_NEXT) / 340) : 0;

  return (
    <Scene clock={clock} width={440} height={232}>
      <div style={{ position: "absolute", inset: 0, opacity: shown }}>
        {/* What you said. */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            opacity: listening,
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              height: 26,
              paddingInline: 10,
              borderRadius: 9,
              background: "#0f0e0d",
            }}
          >
            <Awake />
          </span>
          <span
            style={{
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            {SAID.slice(0, typed)}
            <span style={{ opacity: typed < SAID.length ? 1 : 0 }}>|</span>
          </span>
        </div>

        {/* The pill makes room above it only while you talk. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${(-44 * (1 - listening)).toFixed(2)}px)`,
          }}
        >
          {/* The dashed path leading on to the note taker. */}
          <span
            style={{
              position: "absolute",
              left: DOCK.left + DOCK.width,
              right: -30,
              top: DOCK.top + DOCK.height / 2,
              borderTop: `1.5px dashed ${HAIRLINE}`,
              transformOrigin: "0 50%",
              transform: `scaleX(${next.toFixed(3)})`,
            }}
          />

          {/* The pill. */}
          <div
            style={{
              position: "absolute",
              left: DOCK.left,
              top: DOCK.top,
              width: DOCK.width,
              height: DOCK.height,
              borderRadius: 17,
              background: "#0f0e0d",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 14px 34px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.18)",
            }}
          />
          {/* The slots, seen when nothing is seated in them. */}
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              style={{
                position: "absolute",
                left: slotX(index),
                top: CARTRIDGE_TOP,
                width: SLOT_WIDTH,
                height: CARTRIDGE_HEIGHT,
                borderRadius: 10,
                border: `1px dashed ${OPEN_SLOT}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(244, 241, 234, 0.82)",
                fontSize: 11,
                opacity: index === 4 ? 0.55 + 0.45 * next * breathing : 1,
              }}
            >
              {index === 4 && <span style={{ opacity: next }}>Note taker</span>}
            </span>
          ))}

          <Cartridge name="Fix" tone="Fix" index={0} />
          <Cartridge name="Prompt" tone="Prompt" index={1} />
          <Cartridge
            name="Dictate"
            tone="Dictate"
            index={2}
            y={lift * -46}
            turn={lift * -4}
            scale={1 + 0.03 * click}
          />
          {falling > 0 && (
            <Cartridge
              name="Polite"
              index={3}
              y={(1 - falling) * -46}
              turn={(1 - falling) * 3}
              scale={1 + 0.04 * landed}
              opacity={ease(t, V_FORM, 180)}
            />
          )}
        </div>
      </div>
    </Scene>
  );
}

// The note taker scene -------------------------------------------------------------------------
//
// Two people talk, and notes form as they do. They stay blurred: it isn't here yet.

const N_TURN_MS = 1500;
const N_TURNS = 4;
const N_DONE = N_TURN_MS * N_TURNS;
const N_OUT = N_DONE + 1300;
const NOTES_MS = N_OUT + 420;
const NOTE_LINES = [
  { width: "42%", top: 22, height: 9, strong: true },
  { width: "86%", top: 46 },
  { width: "72%", top: 64 },
  { width: "34%", top: 90, height: 9, strong: true },
  { width: "78%", top: 112 },
  { width: "58%", top: 130 },
];
const VOICE_BARS = 26;

function NoteVoice({ t, turn, top }: { t: number; turn: number; top: number }) {
  // Whose turn it is: 0 and 2 for the first voice, 1 and 3 for the second.
  const position = t / N_TURN_MS;
  const speaking = position < N_TURNS && Math.floor(position) % 2 === turn;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      {Array.from({ length: VOICE_BARS }, (_, index) => {
        const middle = 1 - Math.abs(index - (VOICE_BARS - 1) / 2) / (VOICE_BARS / 2);
        const wave =
          0.5 + 0.3 * Math.sin(t / 110 + index * 0.9 + turn) + 0.2 * Math.sin(t / 47 - index * 1.7);
        const level = speaking ? Math.max(0.12, (0.25 + 0.75 * middle) * wave) : 0.08;
        return (
          <span
            key={index}
            style={{
              width: 2,
              height: 24,
              borderRadius: 1,
              background: "var(--color-text-primary)",
              opacity: speaking ? 0.82 : 0.26,
              transform: `scaleY(${level.toFixed(3)})`,
            }}
          />
        );
      })}
    </div>
  );
}

function NotesScene() {
  const clock = useClock(NOTES_MS, 400);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t = still ? N_DONE + 500 : clock.t;
  const shown = ease(t, 0, 380) * (1 - ease(t, N_OUT, 400));
  return (
    <Scene clock={clock} width={440} height={232}>
      <div style={{ position: "absolute", inset: 0, opacity: shown }}>
        <NoteVoice t={t} turn={0} top={8} />
        <NoteVoice t={t} turn={1} top={38} />
        <div
          style={{
            position: "absolute",
            left: 70,
            right: 70,
            top: 76,
            height: 154,
            borderRadius: 8,
            background: "#f6f2e8",
            boxShadow: "0 14px 26px rgba(0, 0, 0, 0.2)",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0, filter: "blur(3.5px)" }}>
            {NOTE_LINES.map((line, index) => {
              const at = 300 + (index * (N_DONE - 900)) / NOTE_LINES.length;
              const grown = glide(t, at, 520);
              return (
                <span
                  key={index}
                  style={{
                    position: "absolute",
                    left: 22,
                    top: line.top,
                    width: line.width,
                    height: line.height ?? 7,
                    borderRadius: 3,
                    background: line.strong ? "#2a2622" : "#8a8276",
                    opacity: grown,
                    transformOrigin: "0 50%",
                    transform: `scaleX(${grown.toFixed(3)})`,
                  }}
                />
              );
            })}
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
  const { box, seen } = useSeen();
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

        <div {...stylex.props(styles.cards, arrived ? styles.shown : styles.waiting)}>
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
