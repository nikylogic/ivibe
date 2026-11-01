// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { CompactPill, Hud, Toast } from "./hud.tsx";
import { Play, RotateCcw } from "lucide-react";
import type { HudPhase, Segment } from "./hud.tsx";
import type { App } from "./icons.tsx";
import { between, bump, Cursor, ease, H, Keys, launch, top, W } from "./kit.tsx";
import type { Env, Stop } from "./kit.tsx";

/**
 * "See it work": a small desktop, macOS or Windows to match the visitor, that plays each mode the
 * way the app does it, with the app's own pill. Everything is a function of one clock (`t`, ms
 * into the current mode), so a frame can be reproduced exactly.
 */

type Mode = "fix" | "prompt" | "dictate";

const LABELS: Record<Mode, string> = { fix: "Fix", prompt: "Prompt", dictate: "Dictate" };
const ORDER: Mode[] = ["fix", "prompt", "dictate"];

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
  fix: "Show the bug and say what's wrong. Get a clear fix prompt.",
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
  /** Which part of the desktop matters, for the phone-sized crop. */
  focus: (t: number) => number;
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
    const segments: Segment[] = [
      { text: "I change my bio and hit Save,", at: 2600, final: 3400 },
      { text: "and nothing happens.", at: 3500, final: 4300 },
      { text: "The console says it can’t read map.", at: 4500, final: 5600 },
      { text: "It should save and show a toast.", at: 6000, final: 7100 },
    ];
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
      focus: (t) =>
        t < 8750
          ? chrome.left + CHROME.width / 2
          : t < 12_150
            ? 730
            : 730 + (520 - 730) * ease(t, 12_150, 500),
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
    const segments: Segment[] = [
      { text: "Uh, so I want, like, a dark mode toggle.", at: 1400, final: 2400 },
      { text: "It should remember my choice.", at: 2600, final: 3500 },
      { text: "Oh and, um, follow the system setting", at: 3700, final: 4600 },
      { text: "by default, I guess.", at: 4700, final: 5500 },
    ];
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
      focus: () => 546,
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
  const segments: Segment[] = [
    { text: "Hey Asha, um, the demo is, uh,", at: 1400, final: 2300 },
    { text: "the demo is ready for tomorrow.", at: 2400, final: 3300 },
    { text: "So, like, let me know what you think.", at: 3500, final: 4500 },
  ];
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
    focus: () => 520,
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

/** On a phone the whole desktop is too small to read, so it shows a part of it this wide. */
const NARROW_VIEW = 600;
/** Room for the site's top bar above the card, and for the mode controls under it. */
const NAV = 76;
const CONTROLS = 132;
/** How far you scroll, in viewport heights, from the hero to the settled card. */
const RUN = 1.6;
/** Where the camera stops pulling out of the pill and starts shrinking the desktop. */
const PULL_BACK = 0.55;
/** The compact pill's waveform, in stage pixels: 13 bars of 2.5 with gaps of 2.5. */
const WAVE = { width: 62.5, height: 36 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number, from: number, to: number) => {
  const p = clamp01((value - from) / (to - from));
  return p * p * (3 - 2 * p);
};
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

function useViewport(): { vw: number; vh: number } {
  const read = () => ({ vw: document.documentElement.clientWidth, vh: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () =>
      setSize((was) => {
        const next = read();
        return next.vw === was.vw && next.vh === was.vh ? was : next;
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
function geometry(vw: number, vh: number, env: Env, focus: number) {
  const availableHeight = Math.max(240, vh - NAV - CONTROLS);
  const fitWidth = Math.min(W, vw - 32, (availableHeight * W) / H);
  const narrow = fitWidth < 640;
  const view = narrow ? NARROW_VIEW : W;
  const cardWidth = Math.min(narrow ? vw - 32 : fitWidth, (availableHeight * view) / H);
  const cardHeight = (cardWidth * H) / view;
  const card = {
    left: (vw - cardWidth) / 2,
    top: NAV + Math.max(0, (availableHeight - cardHeight) / 2),
    width: cardWidth,
    height: cardHeight,
  };
  const pill = { x: W / 2, y: H - pillBottom(env) - 18 };
  const pan = narrow ? Math.min(W - view, Math.max(0, focus - view / 2)) : 0;
  // Three camera positions, each a scale and the screen point where the pill's centre lands.
  const inside = {
    k: Math.max((vw * 0.92) / WAVE.width, (vh * 1.08) / WAVE.height),
    x: vw / 2,
    y: vh / 2,
  };
  const coverK = Math.max(vw / W, vh / H) * 1.04;
  const desktop = { k: coverK, x: vw / 2, y: pill.y * coverK + vh - H * coverK };
  const settled = {
    k: cardWidth / view,
    x: card.left + (pill.x - pan) * (cardWidth / view),
    y: card.top + pill.y * (cardWidth / view),
  };
  return { card, pill, inside, desktop, settled };
}

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
  const { vw, vh } = useViewport();
  const still = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const now = script(mode, env);
  const duration = now.ms;

  const section = useRef<HTMLElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const invitation = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  /** The eased scroll progress the camera is drawn at. */
  const shown = useRef(0);
  const heroDark = useRef<boolean | null>(null);

  // What the camera loop reads; refreshed on every render.
  const live = useRef({ vw, vh, env, focus: W / 2, onHeroDark });
  live.current = { vw, vh, env, focus: playing ? now.focus(t) : W / 2, onHeroDark };

  /** Draws the camera at progress p: 0 is inside the pill, 1 is the settled card. */
  const draw = useCallback((p: number) => {
    const { vw, vh, env, focus, onHeroDark } = live.current;
    const g = geometry(vw, vh, env, focus);
    const a = smooth(p, 0, PULL_BACK);
    const b = smooth(p, PULL_BACK, 1);
    const from = b > 0 ? g.desktop : g.inside;
    const to = b > 0 ? g.settled : g.desktop;
    const amount = b > 0 ? b : a;
    // Scale changes by the same ratio per step, which reads as a steady pull back.
    let k = from.k * (to.k / from.k) ** amount;
    let x = mix(from.x, to.x, amount);
    let y = mix(from.y, to.y, amount);
    // The visible part of the screen: all of it in the hero, the card once settled.
    const left = g.card.left * b;
    const top = g.card.top * b;
    const width = mix(vw, g.card.width, b);
    const height = mix(vh, g.card.height, b);
    const rect = {
      left,
      top,
      right: Math.max(0, vw - left - width),
      bottom: Math.max(0, vh - top - height),
    };
    const radius = 22 * b;
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
      world.current.style.setProperty("--wave", String(0.14 + 0.86 * smooth(p, 0.05, 0.4)));
    }
    if (card.current) {
      card.current.style.clipPath = `inset(${rect.top}px ${rect.right}px ${rect.bottom}px ${rect.left}px round ${radius}px)`;
    }
    if (shadow.current) {
      Object.assign(shadow.current.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${vw - rect.left - rect.right}px`,
        height: `${vh - rect.top - rect.bottom}px`,
        borderRadius: `${radius}px`,
        opacity: String(b),
      });
    }
    const heroShown = 1 - smooth(p, 0.02, 0.2);
    if (words.current) {
      words.current.style.opacity = String(heroShown);
      words.current.style.transform = `translateY(${-p * 140}px) scale(${1 - 0.06 * clamp01(p * 4)})`;
      words.current.style.visibility = heroShown <= 0 ? "hidden" : "visible";
      words.current.style.pointerEvents = heroShown > 0.5 ? "auto" : "none";
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
      controls.current.style.transform = `translateY(${rect.top + (vh - rect.top - rect.bottom) + 18}px)`;
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
      return clamp01(-element.getBoundingClientRect().top / (live.current.vh * RUN));
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

  // Scrolling back up to the hero puts the demo away; it starts over from Play.
  useEffect(() => {
    if (!stage.settled && playing && !frozen) {
      setPlaying(false);
      setFinished(false);
      setMode("fix");
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
      setT(duration - 600);
      return;
    }
    let visible = true;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    observer.observe(element);
    const tick = (time: number) => {
      if (visible && document.visibilityState === "visible") elapsed += Math.min(100, time - last);
      last = time;
      if (elapsed >= duration) {
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
      setT(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [mode, duration, frozen, playing]);

  const fade = playing ? ease(t, 0, 350) * (1 - ease(t, duration - 450, 400)) : 0;
  const phase = playing ? now.hud(t) : null;
  const nod = playing ? Math.max(0, ...now.keys.map((press) => bump(t, press.at - 60))) : 0;
  const mac = env.os === "mac";
  const open = playing ? now.open : { chrome: true };

  const start = (next: Mode) => {
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
      style={{ position: "relative", height: vh * (1 + RUN) }}
    >
      <div style={{ position: "sticky", top: 0, height: vh, overflow: "hidden" }}>
        <div
          ref={shadow}
          aria-hidden="true"
          style={{
            position: "absolute",
            boxShadow: "0 30px 80px rgba(30,20,10,0.22), 0 0 0 1px var(--color-border)",
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
            {playing && (
              <div style={{ position: "absolute", inset: 0, opacity: fade }}>{now.windows(t)}</div>
            )}
            {/*
              Until Play, the card is only the wallpaper, the pill and the invitation. Play
              builds the desktop around the pill: the dock or taskbar rises, the menu bar drops
              in, and the mascot pops up in its corner.
            */}
            {playing && (
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
                      <Mascot size={MASCOT} state={mascotState(phase)} />
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
              {playing ? (
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

            {playing && (
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

        {/* Once the desktop has settled into its card: the invitation to watch. */}
        <div
          ref={invitation}
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
          <Text size="xl" weight="semibold">
            {finished ? "Fix, Prompt and Dictate, in one pill." : "Ready to see how it works?"}
          </Text>
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

        {/* The hero's words, over the inside of the pill; they leave as the camera pulls back. */}
        <div
          ref={words}
          style={{
            position: "absolute",
            inset: 0,
            paddingTop: NAV - 20,
            // A calm, dark middle so the eye goes straight to the downloads: the waveform and its
            // light show only towards the sides. The corners sink into shadow.
            background: [
              "radial-gradient(ellipse 44% 46% at 50% 54%, rgba(16, 15, 14, 0.97) 0%, rgba(16, 15, 14, 0.93) 48%, rgba(16, 15, 14, 0.6) 75%, transparent 100%)",
              "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgba(8, 7, 6, 0.6) 100%)",
            ].join(", "),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* A fine film grain, so the dark reads as a surface and not a flat fill. */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              opacity: 0.07,
              backgroundImage: GRAIN,
            }}
          />
          <div style={{ position: "relative" }}>
            <Theme theme={ivibeTheme} mode="dark">
              {hero}
            </Theme>
          </div>
        </div>

        {/* The modes, under the card. */}
        <div
          ref={controls}
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
                  value={mode}
                  onChange={(value) => start(value as Mode)}
                >
                  {ORDER.map((item) => (
                    <SegmentedControlItem key={item} value={item} label={LABELS[item]} />
                  ))}
                </SegmentedControl>
                <Steps mode={mode} progress={playing ? t / duration : 0} />
              </VStack>
              <div style={{ maxWidth: 560, textAlign: "center" }}>
                <Text color="secondary" size="sm">
                  {SUMMARY[mode]}
                </Text>
              </div>
            </VStack>
          </div>
        </div>
      </div>
    </section>
  );
}
