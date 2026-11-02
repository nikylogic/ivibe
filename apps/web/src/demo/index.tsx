// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../../desktop/src/renderer/shared/mascot/scene.ts";
import { detectPlatform } from "../release.ts";
import { ivibeTheme } from "../theme.ts";
import {
  CHROME,
  ChromeWindow,
  ClaudeAppWindow,
  ClaudeCodeWindow,
  CONSOLE_ERROR,
  FIX_PROMPT,
  ProofConsole,
  ProofPage,
  SAVE,
  WhatsAppWindow,
} from "./apps.tsx";
import {
  Dock,
  dockSpot,
  mascotBottom,
  MenuBar,
  pillBottom,
  Taskbar,
  Wallpaper,
} from "./desktop.tsx";
import { AsciiWave, uprightPhone } from "./ascii-wave.tsx";
import type { Camera } from "./ascii-wave.tsx";
import { CompactPill, Hud, Toast } from "./hud.tsx";
import { LABELS, ORDER, SAID } from "./said.ts";
import type { Mode } from "./said.ts";
import { RUN } from "./scroll.ts";
import { Story, STORY_MS, StoryDots } from "./story.tsx";
import { holdTone } from "./voice.ts";
import type { Tone } from "./voice.ts";
import { Play, RotateCcw } from "lucide-react";
import type { HudPhase } from "./hud.tsx";
import type { App } from "./icons.tsx";
import { between, bump, Cursor, ease, H, Keys, launch, MONO, top, W } from "./kit.tsx";
import type { Env, Stop } from "./kit.tsx";

/**
 * "See it work": a small desktop, macOS or Windows to match the visitor, that plays each mode the
 * way the app does it, with the app's own pill. Everything is a function of one clock (`t`, ms
 * into the current mode), so a frame can be reproduced exactly.
 */

// Kbd draws ctrl and alt as Mac glyphs; a word joiner keeps them as the words Windows prints.
const KEYS: Record<Env["os"], Record<Mode, string>> = {
  windows: { fix: "ctrl⁠+Caps Lock", prompt: "alt⁠+Caps Lock", dictate: "Caps Lock" },
  mac: { fix: "ctrl+alt+Space", prompt: "shift+alt+Space", dictate: "alt+Space" },
};

/** The pill's prompts while listening, as the app words them. */
const HINT: Record<Mode, string> = {
  fix: "Listening. Describe the bug as you show it.",
  prompt: "Listening. Say what you want built or changed.",
  dictate: "Listening. Speak naturally.",
};

const SUMMARY: Record<Mode, string> = {
  fix: "Show the bug and say what's wrong. Get a clear fix prompt, with marked-up screenshots as proof.",
  prompt: "Say your idea in your own words. Get a clear prompt.",
  dictate: "Just talk. Get clean text where you type.",
};

/** What one mode does on screen. Every value is a pure function of t. */
type Script = {
  ms: number;
  keys: { at: number; combo: string }[];
  hud: (t: number) => HudPhase | null;
  viewPressed?: (t: number) => boolean;
  toast?: { at: number; text: string };
  active: (t: number) => App;
  open: Partial<Record<App, boolean>>;
  dockPressed?: (t: number) => App | undefined;
  pointer: Stop[];
  clicks: number[];
  windows: (t: number) => ReactNode;
};

function script(mode: Mode, env: Env): Script {
  const keys = KEYS[env.os][mode];
  const viewButton = { x: 653, y: H - pillBottom(env) - 26 };

  if (mode === "fix") {
    const chrome = { left: 24, top: top(env, 18) };
    const save = { x: chrome.left + SAVE.x, y: chrome.top + SAVE.y };
    const error = { x: chrome.left + CONSOLE_ERROR.x, y: chrome.top + CONSOLE_ERROR.y };
    const terminalIcon = dockSpot(env, "terminal");
    const terminal = { left: 430, top: top(env, 64) };
    const segments = SAID.fix;
    return {
      ms: 16_500,
      keys: [
        { at: 2000, combo: keys },
        { at: 7600, combo: keys },
      ],
      hud: (t) =>
        t < 2150
          ? null
          : t < 7650
            ? { kind: "listening", since: 2150, hint: HINT.fix, segments }
            : t < 8600
              ? { kind: "working", label: "Hiding secrets on this device…" }
              : t < 10_400
                ? { kind: "working", label: "Writing your fix prompt for Claude Code…" }
                : t < 12_150
                  ? { kind: "pasted", label: "Pasted into Claude Code · 2 screenshots" }
                  : {
                      kind: "expanded",
                      label: "Pasted into Claude Code · 2 screenshots",
                      title: "Your prompt",
                      shots: [
                        <ProofPage key="page" dark={env.dark} />,
                        <ProofConsole key="console" dark={env.dark} />,
                      ],
                      text: FIX_PROMPT.map((row) => row.text).join("\n"),
                    },
      viewPressed: (t) => between(t, 12_000, 12_150),
      toast: { at: 8000, text: "Hid a GitHub token on this device" },
      active: (t) => (t < 8750 ? "chrome" : "terminal"),
      open: { chrome: true, terminal: true },
      dockPressed: (t) => (between(t, 8650, 8800) ? "terminal" : undefined),
      pointer: [
        { at: 0, x: 720, y: 470 },
        { from: 350, at: 1050, x: save.x + 3, y: save.y + 2 },
        { from: 3000, at: 3350, x: save.x + 6, y: save.y + 4 },
        { from: 4600, at: 5150, x: error.x, y: error.y },
        { at: 5450, x: error.x + 34, y: error.y + 10 },
        { at: 5750, x: error.x - 24, y: error.y + 4 },
        { at: 6050, x: error.x + 6, y: error.y },
        { from: 8100, at: 8650, x: terminalIcon.x, y: terminalIcon.y },
        { from: 11_300, at: 12_000, x: viewButton.x, y: viewButton.y },
      ],
      clicks: [1100, 3400, 8700, 12_050],
      windows: (t) => (
        <>
          <ChromeWindow env={env} t={t} clicks={[1100, 3400]} style={{ ...chrome, ...CHROME }} />
          <ClaudeCodeWindow
            env={env}
            t={t}
            pasteAt={10_400}
            style={{
              ...terminal,
              width: 590,
              height: 340,
              ...launch(t, 8750, terminal, terminalIcon),
            }}
          />
        </>
      ),
    };
  }

  if (mode === "prompt") {
    const claude = { left: 150, top: top(env, 22) };
    const input = { x: 500, y: claude.top + 262 };
    const segments = SAID.prompt;
    return {
      ms: 11_500,
      keys: [
        { at: 900, combo: keys },
        { at: 5900, combo: keys },
      ],
      hud: (t) =>
        t < 1050
          ? null
          : t < 5950
            ? { kind: "listening", since: 1050, hint: HINT.prompt, segments }
            : t < 6300
              ? { kind: "working", label: "Finishing up…" }
              : t < 7900
                ? { kind: "working", label: "Writing your prompt for Claude…" }
                : t < 10_300
                  ? { kind: "pasted", label: "Pasted into Claude" }
                  : null,
      active: () => "claude",
      open: { chrome: true, terminal: true, claude: true },
      pointer: [
        { at: 0, x: 760, y: 430 },
        { from: 150, at: 650, x: input.x, y: input.y },
        { from: 8300, at: 8900, x: 700, y: claude.top + 420 },
      ],
      clicks: [700],
      windows: (t) => (
        <ClaudeAppWindow
          env={env}
          t={t}
          focusAt={700}
          pasteAt={7900}
          style={{ ...claude, width: 740, height: 470 }}
        />
      ),
    };
  }

  const whatsapp = { left: 110, top: top(env, 22) };
  const composer = { x: 640, y: whatsapp.top + 390 - 26 };
  const segments = SAID.dictate;
  return {
    ms: 11_500,
    keys: [
      { at: 900, combo: keys },
      { at: 5000, combo: keys },
      { at: 7900, combo: "enter" },
    ],
    hud: (t) =>
      t < 1050
        ? null
        : t < 5050
          ? { kind: "listening", since: 1050, hint: HINT.dictate, segments }
          : t < 5400
            ? { kind: "working", label: "Finishing up…" }
            : t < 6700
              ? { kind: "working", label: "Cleaning up your words for WhatsApp…" }
              : t < 9300
                ? { kind: "pasted", label: "Pasted into WhatsApp" }
                : null,
    active: () => "whatsapp",
    open: { chrome: true, terminal: true, claude: true, whatsapp: true },
    pointer: [
      { at: 0, x: 820, y: 260 },
      { from: 150, at: 650, x: composer.x, y: composer.y },
      { from: 7000, at: 7500, x: 860, y: whatsapp.top + 200 },
    ],
    clicks: [700],
    windows: (t) => (
      <WhatsAppWindow
        env={env}
        t={t}
        focusAt={700}
        pasteAt={6700}
        sendAt={7980}
        style={{ ...whatsapp, width: 820, height: 390 }}
      />
    ),
  };
}

function mascotState(phase: HudPhase | null): MascotState {
  if (!phase) return "idle";
  return phase.kind === "listening" ? "recording" : phase.kind === "working" ? "writing" : "done";
}

/** The visitor's OS, or `?os=mac` / `?os=windows` to show the other one. */
function demoOs(): Env["os"] {
  const asked = new URLSearchParams(window.location.search).get("os");
  if (asked === "mac" || asked === "windows") return asked;
  const platform = detectPlatform();
  return platform === "windows" || platform === "linux" ? "windows" : "mac";
}

function usePrefersDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return dark;
}

/** `?mode=fix&t=12500` holds that exact frame, for screenshots and for checking a moment. */
function frozenFrame(): { mode: Mode; t: number } | null {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const t = Number(params.get("t"));
  if (!ORDER.includes(mode as Mode) || !params.has("t") || !Number.isFinite(t)) return null;
  return { mode: mode as Mode, t };
}

const MASCOT = 92;

/** Under this height the desktop demo drops its caption, to give the card the room. */
const SHORT = 700;
/** The desktop's scale limits: under the least its 12px text can't be read, over the most it's soft. */
const LEAST_SCALE = 0.75;
const MOST_SCALE = 1.8;

/** The desktop card's width: as big as the screen allows, leaving margins on large screens. */
function desktopWidth(vw: number, vh: number): number {
  const room = vh < SHORT ? vh - NAV_SHORT - CONTROLS_SHORT : vh - NAV - CONTROLS;
  return Math.min(vw - 32, Math.max(W, vw * 0.8), (room * W) / H, W * MOST_SCALE);
}

/** Where a whole desktop would be too small to read, the demo is told as a story (story.tsx). */
const tellsStory = (vw: number, vh: number) =>
  vw < 900 || vh < 480 || desktopWidth(vw, vh) / W < LEAST_SCALE;
/** The story's room: its card's widest, under the navbar, with the modes and dots below it. */
const STORY_CARD = { width: 560, height: 560 };
const STORY_NAV = 62;
const STORY_CONTROLS = 104;
/** On a phone on its side, the modes sit to the card's right. */
const STORY_RAIL = 204;
/** Room for the site's top bar above the card, and for the mode controls under it. */
const NAV = 76;
const CONTROLS = 132;
const NAV_SHORT = 64;
/** When the dark behind the hero's words has gone, before the pill's shape can stack up with it. */
const BACKDROP_GONE = 0.14;
/** The scale at which the pill's rim starts to fade, and has gone. */
const RIM_FULL = 2;
const RIM_GONE = 6;
/** The settled card's corners. */
const CARD_CORNER = 22;
/** The hero's frame: the same gap and corners as the download section at the end of the page. */
const HERO_GAP = 12;
const HERO_CORNER = 28;
const CONTROLS_SHORT = 84;
/** How far you scroll, in viewport heights, from the hero to the settled card. */
/** Where the camera stops pulling out of the pill and starts shrinking the desktop. */
const PULL_BACK = 0.55;
/** Prototype: `?waves` shows the hero's old waveform, to compare with the characters. */
const ASCII_HERO = !new URLSearchParams(window.location.search).has("waves");
/** The compact pill's waveform, in stage pixels: 13 bars of 2.5 with gaps of 2.5. */
const WAVE = { width: 62.5, height: 36 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number, from: number, to: number) => {
  const p = clamp01((value - from) / (to - from));
  return p * p * (3 - 2 * p);
};
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** A phone's address bar changes the height by less than this; turning the phone by more. */
const BAR_MOVE = 140;
/** Extra scroll on touch screens, so the demo stays pinned to the end with the bar either way. */
const TOUCH_SLACK = 120;
const touchScreen = () => window.matchMedia("(pointer: coarse)").matches;

/**
 * The screen, and `runVh`: the height the scroll is measured by. It ignores a phone's address bar
 * sliding in and out, or the page would change height and jump under the visitor's thumb.
 */
function useViewport(): { vw: number; vh: number; runVh: number } {
  const read = () => {
    const vh = window.innerHeight;
    return { vw: document.documentElement.clientWidth, vh, runVh: vh };
  };
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () =>
      setSize((was) => {
        const next = read();
        const barOnly =
          touchScreen() && next.vw === was.vw && Math.abs(next.vh - was.runVh) < BAR_MOVE;
        if (barOnly) next.runVh = was.runVh;
        return next.vw === was.vw && next.vh === was.vh && next.runVh === was.runVh ? was : next;
      });
    // The page's width also changes without a resize, when the scrollbar appears after load.
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return size;
}

/** Everything the camera needs, from the viewport and where the demo is looking. */
function geometry(vw: number, vh: number, env: Env) {
  const story = tellsStory(vw, vh);
  const sideways = story && vh < 480;
  let card: { left: number; top: number; width: number; height: number };
  let controls: { left: number; right: number; top: number };
  if (sideways) {
    const height = vh - STORY_NAV - 12;
    const width = vw - 32 - STORY_RAIL - 12;
    card = { left: 16, top: STORY_NAV, width, height };
    controls = { left: 16 + width + 12, right: 16, top: STORY_NAV };
  } else if (story) {
    const width = Math.min(STORY_CARD.width, vw - 32);
    const room = vh - STORY_NAV - STORY_CONTROLS;
    const height = Math.min(STORY_CARD.height, room);
    card = {
      left: Math.round((vw - width) / 2),
      top: Math.round(STORY_NAV + (room - height) / 2),
      width,
      height,
    };
    controls = { left: 16, right: 16, top: card.top + height + 10 };
  } else {
    const short = vh < SHORT;
    const nav = short ? NAV_SHORT : NAV;
    const room = vh - nav - (short ? CONTROLS_SHORT : CONTROLS);
    const cardWidth = desktopWidth(vw, vh);
    const cardHeight = (cardWidth * H) / W;
    // On whole pixels, so the settled card's edges are crisp.
    card = {
      left: Math.round((vw - cardWidth) / 2),
      top: Math.round(nav + Math.max(0, (room - cardHeight) / 2)),
      width: Math.round(cardWidth),
      height: Math.round(cardHeight),
    };
    controls = { left: 16, right: 16, top: card.top + card.height + (short ? 10 : 18) };
  }
  const pill = { x: W / 2, y: H - pillBottom(env) - 18 };
  // Three camera positions, each a scale and the screen point where the pill's centre lands.
  const inside = {
    k: Math.max((vw * 0.92) / WAVE.width, (vh * 1.08) / WAVE.height),
    x: vw / 2,
    y: vh / 2,
  };
  const coverK = Math.max(vw / W, vh / H) * 1.04;
  const desktop = { k: coverK, x: vw / 2, y: pill.y * coverK + vh - H * coverK };
  // In a story's taller card the desktop is only a backdrop, so it covers the card, pill low.
  const settledK = story ? Math.max(card.width / W, card.height / H) : card.width / W;
  const settled = {
    k: settledK,
    x: card.left + card.width / 2,
    y: story ? card.top + card.height - 44 : card.top + pill.y * settledK,
  };
  return { card, controls, pill, inside, desktop, settled, story, sideways };
}

/** Scrolls to where the demo sits settled in its card, as "How it works" does. */
const TONE_OF: Record<Mode, Tone> = { fix: "Fix", prompt: "Prompt", dictate: "Dictate" };

/**
 * Where the demo is: one hairline for each mode, filled for those already shown and filling with
 * the clock for the one playing. Drawn in the page's own text colour, moved by a transform.
 */
function Steps({ mode, progress }: { mode: Mode; progress: number }) {
  const current = ORDER.indexOf(mode);
  return (
    <div
      role="progressbar"
      aria-label={`${LABELS[mode]} demo`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      style={{ display: "flex", gap: 6, width: 168 }}
    >
      {ORDER.map((item, index) => {
        const fill =
          index < current ? 1 : index === current ? Math.min(1, Math.max(0, progress)) : 0;
        return (
          <span
            key={item}
            style={{
              flex: 1,
              height: 2,
              borderRadius: 999,
              overflow: "hidden",
              background: "color-mix(in srgb, var(--color-text-primary) 14%, transparent)",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                background: "var(--color-text-primary)",
                opacity: 0.75,
                transformOrigin: "0 50%",
                transform: `scaleX(${fill})`,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** A tile of soft white noise, drawn once by the browser and repeated. */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

/**
 * The hint at the foot of the hero: the same dots and characters as the waveform, falling in turn
 * into an arrow. The camera fades it out as soon as the page moves.
 */
function ScrollHint({ hint }: { hint: RefObject<HTMLDivElement | null> }) {
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animations = marks.current.map((mark, index) =>
      mark?.animate(
        [
          { opacity: 0.32, transform: "translateY(-2px)" },
          { opacity: 1, transform: "none", offset: 0.28 },
          { opacity: 0.32, transform: "translateY(2px)", offset: 0.62 },
          { opacity: 0.32, transform: "translateY(2px)" },
        ],
        { duration: 1700, delay: index * 170, iterations: Infinity, easing: "ease-in-out" },
      ),
    );
    return () => animations.forEach((animation) => animation?.cancel());
  }, []);
  return (
    <div
      ref={hint}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        color: "rgba(244, 241, 234, 0.62)",
        fontSize: 12,
        letterSpacing: "0.02em",
      }}
    >
      Scroll
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: "10px",
        }}
      >
        {[".", ":", "v"].map((mark, index) => (
          <span
            key={mark}
            ref={(element) => {
              marks.current[index] = element;
            }}
          >
            {mark}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * Plays one entrance when its children first appear: from `from` (a transform) to rest, with an
 * overshoot-free ease. It runs on the graphics card and is skipped for reduced motion.
 */
function Enter({
  from,
  delay = 0,
  fade = false,
  origin,
  children,
}: {
  from: string;
  delay?: number;
  fade?: boolean;
  origin?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.animate(
      [
        { transform: from, opacity: fade ? 0 : 1 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 520, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
    );
    return () => animation.cancel();
  }, [from, delay, fade]);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, transformOrigin: origin }}>
      {children}
    </div>
  );
}

/**
 * The hero and the demo as one camera move, the way Superwhisper does it. The hero is the inside
 * of iVibe's pill: its waveform, huge and glowing, moving like a voice. Scrolling pulls the camera
 * back out of the pill until it is the small pill above the dock, then the desktop shrinks into a
 * card where the demo plays.
 *
 * The scroll never re-renders React: a loop eases towards the scroll position and writes
 * transforms and opacities straight to the elements, so it stays smooth with a mouse wheel too.
 */
export function Showcase({
  theme,
  hero,
  onHeroDark,
}: {
  theme: ThemeMode;
  hero: ReactNode;
  /** Whether the top of the screen is the dark inside of the pill, for the site's top bar. */
  onHeroDark: (dark: boolean) => void;
}) {
  const systemDark = usePrefersDark();
  const [os] = useState(demoOs);
  const env: Env = { os, dark: theme === "dark" || (theme === "system" && systemDark) };
  const [frozen] = useState(frozenFrame);
  const [mode, setMode] = useState<Mode>(frozen?.mode ?? "fix");
  const [playing, setPlaying] = useState(frozen !== null);
  // All three modes have played: the card offers a replay.
  const [finished, setFinished] = useState(false);
  const [t, setT] = useState(0);
  const [stage, setStage] = useState({ desktop: false, settled: false });
  const { vw, vh, runVh } = useViewport();
  const still = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const now = script(mode, env);
  const layout = geometry(vw, vh, env);
  const story = layout.story;
  const duration = story ? STORY_MS[mode] : now.ms;
  /** Where the clock is, so a story's dots can move it. */
  const elapsed = useRef(0);

  const section = useRef<HTMLElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const invitation = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const storyBox = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  /** From the top of the headline to the bottom of what's under it. */
  const heroText = useCallback(() => {
    const hero = words.current?.querySelector("section");
    const first = hero?.firstElementChild?.getBoundingClientRect();
    const last = hero?.lastElementChild?.getBoundingClientRect();
    return first && last ? { top: first.top, bottom: last.bottom } : null;
  }, []);
  /** The eased scroll progress the camera is drawn at. */
  const shown = useRef(0);
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1, p: 0 });
  const heroDark = useRef<boolean | null>(null);

  // What the camera loop reads; refreshed on every render.
  const live = useRef({ vw, vh, runVh, env, onHeroDark });
  live.current = { vw, vh, runVh, env, onHeroDark };

  /** Draws the camera at progress p: 0 is inside the pill, 1 is the settled card. */
  const draw = useCallback((p: number) => {
    const { vw, vh, env, onHeroDark } = live.current;
    const g = geometry(vw, vh, env);
    const a = smooth(p, 0, PULL_BACK);
    const b = smooth(p, PULL_BACK, 1);
    const from = b > 0 ? g.desktop : g.inside;
    const to = b > 0 ? g.settled : g.desktop;
    const amount = b > 0 ? b : a;
    // Scale changes by the same ratio per step, which reads as a steady pull back.
    let k = from.k * (to.k / from.k) ** amount;
    let x = mix(from.x, to.x, amount);
    let y = mix(from.y, to.y, amount);
    // The visible part of the screen: all but a small gap in the hero, the card once settled.
    const left = mix(HERO_GAP, g.card.left, b);
    const top = mix(HERO_GAP, g.card.top, b);
    const width = mix(vw - HERO_GAP * 2, g.card.width, b);
    const height = mix(vh - HERO_GAP * 2, g.card.height, b);
    const rect = {
      left,
      top,
      right: Math.max(0, vw - left - width),
      bottom: Math.max(0, vh - top - height),
    };
    const radius = mix(HERO_CORNER, CARD_CORNER, b);
    // The desktop always fills the visible window, edge to edge, so nothing shows around it
    // while the window shrinks into the card: only its corners round.
    if (b > 0) {
      const right = vw - rect.right;
      const bottom = vh - rect.bottom;
      k = Math.max(k, (right - left) / W, (bottom - top) / H);
      const worldLeft = Math.min(left, Math.max(right - W * k, x - g.pill.x * k));
      const worldTop = Math.min(top, Math.max(bottom - H * k, y - g.pill.y * k));
      x = worldLeft + g.pill.x * k;
      y = worldTop + g.pill.y * k;
    }

    if (world.current) {
      world.current.style.transform = `translate(${x - g.pill.x * k}px, ${y - g.pill.y * k}px) scale(${k})`;
      // With the characters, the real bars only appear as the characters leave.
      const wave = ASCII_HERO ? smooth(p, 0.16, 0.34) : 0.14 + 0.86 * smooth(p, 0.05, 0.4);
      world.current.style.setProperty("--wave", String(wave));
      // The pill's hairline rim is only a hairline near its own size.
      world.current.style.setProperty(
        "--rim",
        String(clamp01((RIM_GONE - k) / (RIM_GONE - RIM_FULL))),
      );
      // Inside the pill the colour lives in the characters, so there's no glare behind them.
      if (ASCII_HERO) world.current.style.setProperty("--wave-light", String(smooth(p, 0.1, 0.34)));
      camera.current = { x, y, k, p };
    }
    if (card.current) {
      card.current.style.clipPath = `inset(${rect.top}px ${rect.right}px ${rect.bottom}px ${rect.left}px round ${radius}px)`;
    }
    for (const layer of [shadow.current, frame.current]) {
      if (!layer) continue;
      Object.assign(layer.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${vw - rect.left - rect.right}px`,
        height: `${vh - rect.top - rect.bottom}px`,
        borderRadius: `${radius}px`,
        opacity: String(b),
      });
    }
    const heroShown = 1 - smooth(p, 0.02, 0.2);
    if (backdrop.current) {
      const left = 1 - smooth(p, 0.02, BACKDROP_GONE);
      backdrop.current.style.opacity = String(left);
      backdrop.current.style.visibility = left <= 0 ? "hidden" : "visible";
    }
    if (words.current) {
      words.current.style.opacity = String(heroShown);
      words.current.style.transform = `translateY(${-p * 140}px) scale(${1 - 0.06 * clamp01(p * 4)})`;
      words.current.style.visibility = heroShown <= 0 ? "hidden" : "visible";
      words.current.style.pointerEvents = heroShown > 0.5 ? "auto" : "none";
    }
    if (hint.current) {
      const left = 1 - smooth(p, 0, 0.025);
      hint.current.style.opacity = String(left);
      hint.current.style.visibility = left <= 0 ? "hidden" : "visible";
    }
    const settled = smooth(p, 0.86, 1);
    if (invitation.current) {
      invitation.current.style.opacity = String(settled);
      invitation.current.style.transform = `translate(${g.card.left + g.card.width / 2}px, ${
        g.card.top + g.card.height * 0.44 + (1 - settled) * 14
      }px) translate(-50%, -50%)`;
    }
    if (controls.current) {
      controls.current.style.opacity = String(settled);
      controls.current.style.left = `${g.controls.left}px`;
      controls.current.style.right = `${g.controls.right}px`;
      controls.current.style.transform = `translateY(${g.controls.top}px)`;
    }
    if (storyBox.current) {
      Object.assign(storyBox.current.style, {
        left: `${g.card.left}px`,
        top: `${g.card.top}px`,
        width: `${g.card.width}px`,
        height: `${g.card.height}px`,
        opacity: String(settled),
      });
    }

    // The top bar sits on the pill's dark inside until the pill's top edge passes under it.
    const pillTop = y - (WAVE.height / 2) * k;
    const dark = b === 0 && pillTop < 64;
    if (dark !== heroDark.current) {
      heroDark.current = dark;
      onHeroDark(dark);
    }
    setStage((current) => {
      const next = { desktop: p > 0.25, settled: p > 0.8 };
      return current.desktop === next.desktop && current.settled === next.settled ? current : next;
    });
  }, []);

  // The camera loop: follows the scroll with a short ease, then rests.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const target = () => {
      const element = section.current;
      if (!element) return 0;
      return clamp01(-element.getBoundingClientRect().top / (live.current.runVh * RUN));
    };
    const tick = (time: number) => {
      const dt = Math.min(64, time - last);
      last = time;
      const goal = target();
      const gap = goal - shown.current;
      shown.current =
        Math.abs(gap) < 0.0005 || still.current
          ? goal
          : shown.current + gap * (1 - Math.exp(-dt / 85));
      draw(shown.current);
      raf = shown.current === goal ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    shown.current = target();
    draw(shown.current);
    window.addEventListener("scroll", wake, { passive: true });
    return () => {
      window.removeEventListener("scroll", wake);
      cancelAnimationFrame(raf);
    };
  }, [draw]);

  // A resize, a new theme or the demo looking elsewhere (on a phone) moves the camera too.
  useLayoutEffect(() => draw(shown.current));

  // A rotation changes how long the scroll is. Inside the demo, stay at the same point of it,
  // or a shorter section would leave the reader past its end.
  const lastRun = useRef(runVh);
  useLayoutEffect(() => {
    const was = lastRun.current * RUN;
    const next = runVh * RUN;
    lastRun.current = runVh;
    const element = section.current;
    if (!element || was === next) return;
    const into = -element.getBoundingClientRect().top;
    if (into <= 0 || into > was) return;
    window.scrollTo({ top: window.scrollY + (into / was) * next - into, behavior: "instant" });
  }, [runVh]);

  // Scrolling back up to the hero puts the demo away; it starts over from Play.
  useEffect(() => {
    if (!stage.settled && playing && !frozen) {
      setPlaying(false);
      setFinished(false);
      setMode("fix");
      elapsed.current = 0;
      setT(0);
    }
  }, [stage.settled, playing, frozen]);

  // The demo's clock: plays while on screen, moves to the next mode at the end of each.
  useEffect(() => {
    const element = card.current;
    if (!element || !playing) return;
    if (frozen && frozen.mode === mode) {
      setT(frozen.t);
      return;
    }
    if (still.current) {
      // Without motion, a story stays on a step until its dots move it.
      setT(story ? elapsed.current : duration - 600);
      return;
    }
    let visible = true;
    let raf = 0;
    let last = performance.now();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    observer.observe(element);
    const tick = (time: number) => {
      if (visible && document.visibilityState === "visible") {
        elapsed.current += Math.min(100, time - last);
      }
      last = time;
      if (elapsed.current >= duration) {
        elapsed.current = 0;
        setT(0);
        const next = ORDER.indexOf(mode) + 1;
        if (next < ORDER.length) setMode(ORDER[next]!);
        else {
          // The last mode is done: back to the calm card, with a replay.
          setPlaying(false);
          setFinished(true);
          setMode("fix");
        }
        return;
      }
      setT(elapsed.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [mode, duration, frozen, playing, story]);

  const jump = (to: number) => {
    elapsed.current = to;
    setT(to);
  };

  const desktopPlaying = playing && !story;
  const sharpness = Math.max(1, Math.ceil(layout.settled.k));
  const fade = playing ? ease(t, 0, 350) * (1 - ease(t, duration - 450, 400)) : 0;
  // Without motion a story's clock stands still on each step, so it can't fade in by it.
  const storyShown = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : fade;
  const phase = playing ? now.hud(t) : null;
  const nod = playing ? Math.max(0, ...now.keys.map((press) => bump(t, press.at - 60))) : 0;
  const mac = env.os === "mac";
  const open = playing ? now.open : { chrome: true };

  // While the demo plays, its mode colours the pill's light and the navbar.
  useEffect(() => {
    holdTone(playing ? TONE_OF[mode] : null);
    return () => holdTone(null);
  }, [playing, mode]);

  const start = (next: Mode) => {
    elapsed.current = 0;
    setT(0);
    setMode(next);
    setFinished(false);
    setPlaying(true);
  };

  return (
    <section
      ref={section}
      id="modes"
      aria-label="iVibe"
      style={{
        position: "relative",
        height: runVh * (1 + RUN) + (touchScreen() ? TOUCH_SLACK : 0),
      }}
    >
      <div style={{ position: "sticky", top: 0, height: vh, overflow: "hidden" }}>
        <div
          ref={shadow}
          aria-hidden="true"
          style={{
            position: "absolute",
            boxShadow: env.dark
              ? "0 30px 80px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(0, 0, 0, 0.25)"
              : "0 30px 80px rgba(60, 40, 20, 0.16), 0 8px 24px rgba(60, 40, 20, 0.08)",
          }}
        />
        <div
          ref={card}
          role="img"
          aria-label={
            playing ? `${LABELS[mode]}: ${SUMMARY[mode]}` : "iVibe's pill, listening, on a desktop"
          }
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        >
          <div
            ref={world}
            data-world="desktop"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: W,
              height: H,
              transformOrigin: "0 0",
            }}
          >
            <Wallpaper env={env} />
            {desktopPlaying && (
              <div style={{ position: "absolute", inset: 0, opacity: fade }}>{now.windows(t)}</div>
            )}
            {/*
              Until Play, the card is only the wallpaper, the pill and the invitation. Play
              builds the desktop around the pill: the dock or taskbar rises, the menu bar drops
              in, and the mascot pops up in its corner.
            */}
            {desktopPlaying && (
              <div style={{ position: "absolute", inset: 0 }}>
                {mac ? (
                  <>
                    <Enter from="translateY(-100%)" delay={120}>
                      <MenuBar env={env} app={now.active(t)} />
                    </Enter>
                    <Enter from="translateY(110px)">
                      <Dock env={env} open={open} pressed={now.dockPressed?.(t)} />
                    </Enter>
                  </>
                ) : (
                  <Enter from="translateY(60px)">
                    <Taskbar
                      env={env}
                      open={open}
                      active={now.active(t)}
                      pressed={now.dockPressed?.(t)}
                    />
                  </Enter>
                )}
                {/*
                  The mascot sits still in the corner and nods with each key press; the shortcut
                  floats above it on its own layer, so showing it never moves the mascot.
                */}
                <div
                  style={{
                    position: "absolute",
                    right: 16,
                    bottom: mascotBottom(env),
                    width: MASCOT,
                    height: MASCOT,
                  }}
                >
                  <Enter from="translateY(16px) scale(0.6)" delay={260} fade origin="50% 100%">
                    <div
                      style={{
                        transform: `translateY(${nod * 3}px) scale(${1 + nod * 0.04}, ${1 - nod * 0.06})`,
                        transformOrigin: "50% 100%",
                      }}
                    >
                      {/* Drawn at the card's scale and shrunk back, so it stays sharp. */}
                      <div
                        style={{
                          width: MASCOT,
                          height: MASCOT,
                          transform: `scale(${1 / sharpness})`,
                          transformOrigin: "0 0",
                        }}
                      >
                        <Mascot size={MASCOT * sharpness} state={mascotState(phase)} />
                      </div>
                    </div>
                  </Enter>
                </div>
              </div>
            )}

            {/* The pill, above the dock or taskbar where the app puts it. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: pillBottom(env),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              {desktopPlaying ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    opacity: fade,
                  }}
                >
                  {now.toast && (
                    <Toast t={t} at={now.toast.at}>
                      {now.toast.text}
                    </Toast>
                  )}
                  {phase && <Hud t={t} phase={phase} pressed={now.viewPressed?.(t)} />}
                </div>
              ) : (
                <CompactPill />
              )}
            </div>

            {desktopPlaying && (
              <>
                <div
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: mascotBottom(env) + MASCOT + 6,
                  }}
                >
                  {now.keys.map((press) => (
                    <Keys
                      key={press.at}
                      combo={press.combo}
                      t={t}
                      at={press.at}
                      tail={16 + MASCOT / 2 - 12}
                    />
                  ))}
                </div>
                <div
                  style={{ position: "absolute", inset: 0, opacity: fade, pointerEvents: "none" }}
                >
                  <Cursor t={t} path={now.pointer} clicks={now.clicks} />
                </div>
              </>
            )}
          </div>
        </div>

        {/*
          The card's edge: one smooth hairline drawn over the rim, so the corners stay clean at
          every step of the zoom. It fades in with the card.
        */}
        <div
          ref={frame}
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            boxShadow: env.dark
              ? "inset 0 0 0 1px rgba(255, 255, 255, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.06)"
              : "inset 0 0 0 1px rgba(40, 28, 16, 0.10)",
          }}
        />

        {/* The story, in real text, outside the card's picture so screen readers can read it. */}
        <div
          ref={storyBox}
          style={{
            position: "absolute",
            borderRadius: 22,
            overflow: "hidden",
            display: story && playing ? "block" : "none",
            pointerEvents: stage.settled ? "auto" : "none",
          }}
        >
          {story && playing && (
            <div style={{ position: "absolute", inset: 0, opacity: storyShown }}>
              <Story
                mode={mode}
                t={t}
                env={env}
                width={layout.card.width}
                height={layout.card.height}
                sideways={layout.sideways}
              />
            </div>
          )}
        </div>

        {/* Once the desktop has settled into its card: the invitation to watch. */}
        <div
          ref={invitation}
          className="touch-area"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: playing ? "none" : "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            padding: "28px 48px",
            borderRadius: 999,
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--color-background-surface) 70%, transparent), transparent)",
            opacity: 0,
            pointerEvents: stage.settled && !playing ? "auto" : "none",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Text size="xl" weight="semibold">
              {finished ? "Fix, Prompt and Dictate, in one pill." : "Ready to see how it works?"}
            </Text>
          </div>
          <Button
            label={finished ? "Replay demo" : "Play demo"}
            variant="primary"
            icon={
              finished ? (
                <RotateCcw size={14} strokeWidth={2.25} />
              ) : (
                <Play size={14} strokeWidth={0} fill="currentColor" />
              )
            }
            onClick={() => start("fix")}
          />
        </div>

        {ASCII_HERO && (
          <AsciiWave
            camera={camera}
            width={vw}
            height={vh}
            clipPath={`inset(${HERO_GAP}px round ${HERO_CORNER}px)`}
            quiet={heroText}
          />
        )}

        {/*
          A calm, dark middle so the eye goes straight to the downloads: the waveform and its light
          show only towards the sides, and the corners sink into shadow. It fills the hero's frame and
          never moves, so no edge of it can show as the pill shrinks away inside.
        */}
        <div
          ref={backdrop}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: HERO_GAP,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: HERO_CORNER,
            // An upright phone's letters part around the text, so there it only needs the corners.
            background: [
              ...(uprightPhone(vw, vh)
                ? []
                : [
                    "radial-gradient(ellipse 44% 46% at 50% 54%, rgba(16, 15, 14, 0.97) 0%, rgba(16, 15, 14, 0.93) 48%, rgba(16, 15, 14, 0.6) 75%, transparent 100%)",
                  ]),
              "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgba(8, 7, 6, 0.6) 100%)",
            ].join(", "),
          }}
        >
          {/* A fine film grain, so the dark reads as a surface and not a flat fill. */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.07,
              backgroundImage: GRAIN,
            }}
          />
        </div>

        {/* The hero's words, over the inside of the pill; they leave as the camera pulls back. */}
        <div
          ref={words}
          style={{
            position: "absolute",
            inset: 0,
            paddingTop: NAV - 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "relative" }}>
            <Theme theme={ivibeTheme} mode="dark">
              {hero}
            </Theme>
          </div>
          {/* Left out where the hero's words already reach the bottom of the screen. */}
          {vh >= 620 && <ScrollHint hint={hint} />}
        </div>

        {/* The modes, under the card. */}
        <div
          ref={controls}
          className="touch-area"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            top: 0,
            opacity: 0,
            pointerEvents: stage.settled && playing ? "auto" : "none",
          }}
        >
          {/* Only while the demo plays: before it, the card is just the pill and Play. */}
          <div
            style={{
              opacity: playing ? 1 : 0,
              transform: playing ? "none" : "translateY(-6px)",
              transition: "opacity 400ms ease, transform 400ms ease",
            }}
          >
            <VStack gap={3} hAlign="center">
              <VStack gap={2} hAlign="center">
                <SegmentedControl
                  label="Mode"
                  size={story ? "lg" : "md"}
                  value={mode}
                  onChange={(value) => start(value as Mode)}
                >
                  {ORDER.map((item) => (
                    <SegmentedControlItem key={item} value={item} label={LABELS[item]} />
                  ))}
                </SegmentedControl>
                {story ? (
                  <StoryDots mode={mode} t={t} onJump={jump} />
                ) : (
                  <Steps mode={mode} progress={playing ? t / duration : 0} />
                )}
              </VStack>
              {!story && vh >= SHORT && (
                <div style={{ maxWidth: 560, textAlign: "center" }}>
                  <Text color="secondary" size="sm">
                    {SUMMARY[mode]}
                  </Text>
                </div>
              )}
            </VStack>
          </div>
        </div>
      </div>
    </section>
  );
}
