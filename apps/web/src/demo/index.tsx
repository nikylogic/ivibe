// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@astryxdesign/core/Button";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../../desktop/src/renderer/shared/mascot/scene.ts";
import { detectPlatform } from "../release.ts";
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
import { Play } from "lucide-react";
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
  fix: "Show the bug and say what's wrong. iVibe picks the screenshots that prove it, hides secrets on your device, and pastes a clear fix prompt into your coding agent.",
  prompt: "Ramble an idea. A clear, structured prompt lands in the chat you were typing in.",
  dictate: "Just talk. Fillers and false starts go; your words land where you were typing.",
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
/** How far you scroll, in viewport heights, for the hero to settle into the card. */
const ZOOM_RUN = 0.9;

const smooth = (value: number, from: number, to: number) => {
  const p = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return p * p * (3 - 2 * p);
};

function useViewport(): { vw: number; vh: number } {
  const read = () => ({ vw: document.documentElement.clientWidth, vh: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

/** 0 at the top of the page, 1 once the hero has shrunk into the demo card. */
function useZoomProgress(section: RefObject<HTMLElement | null>, vh: number): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const element = section.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top;
      setProgress(Math.min(1, Math.max(0, -top / (vh * ZOOM_RUN))));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(raf);
    };
  }, [section, vh]);
  return progress;
}

/**
 * The hero and the demo as one piece, the way Superwhisper does it: the hero's backdrop is a
 * desktop, close up, with iVibe's pill listening. Scrolling zooms out (the backdrop shrinks into a
 * card and the menu bar, dock and mascot come into view) and the demo plays on that desktop.
 */
export function Showcase({ theme, hero }: { theme: ThemeMode; hero: ReactNode }) {
  const systemDark = usePrefersDark();
  const [os] = useState(demoOs);
  const env: Env = { os, dark: theme === "dark" || (theme === "system" && systemDark) };
  const [frozen] = useState(frozenFrame);
  const [mode, setMode] = useState<Mode>(frozen?.mode ?? "fix");
  const [playing, setPlaying] = useState(frozen !== null);
  const [t, setT] = useState(0);
  const [idle, setIdle] = useState(0);
  const section = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const still = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const { vw, vh } = useViewport();
  const progress = useZoomProgress(section, vh);
  const now = script(mode, env);
  const duration = now.ms;

  // Scrolling back up to the hero puts the demo away; it starts over from Play.
  useEffect(() => {
    if (progress < 0.5 && playing && !frozen) {
      setPlaying(false);
      setMode("fix");
      setT(0);
    }
  }, [progress, playing, frozen]);

  // The hero's pill keeps listening while the demo isn't playing.
  useEffect(() => {
    if (playing || still.current) return;
    let raf = 0;
    const tick = (time: number) => {
      setIdle(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

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
        setMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!);
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

  // The card where the hero settles: as wide as fits, leaving room for the bar and controls.
  const availableHeight = Math.max(240, vh - NAV - CONTROLS);
  const fitWidth = Math.min(W, vw - 32, (availableHeight * W) / H);
  const narrow = fitWidth < 640;
  const view = narrow ? NARROW_VIEW : W;
  const cardWidth = Math.min(narrow ? vw - 32 : fitWidth, (availableHeight * view) / H);
  const cardHeight = (cardWidth * H) / view;
  const cardLeft = (vw - cardWidth) / 2;
  const cardTop = NAV + Math.max(0, (availableHeight - cardHeight) / 2);

  const e = smooth(progress, 0, 1);
  const rect = {
    left: cardLeft * e,
    top: cardTop * e,
    width: vw + (cardWidth - vw) * e,
    height: vh + (cardHeight - vh) * e,
  };

  // The pill is the point both ends of the zoom agree on: near the bottom of the hero, and in
  // its place above the dock once the whole desktop shows.
  const pill = { x: W / 2, y: H - pillBottom(env) - 18 };
  const focus = playing ? now.focus(t) : W / 2;
  const pan = narrow ? Math.min(W - view, Math.max(0, focus - view / 2)) : 0;
  const k0 = Math.max(vw / W, vh / H) * 1.12;
  const k1 = cardWidth / view;
  const k = k0 * (k1 / k0) ** e;
  const at = {
    x: vw / 2 + ((pill.x - pan) * k1 - vw / 2) * e,
    y: vh * 0.89 + (pill.y * k1 - vh * 0.89) * e,
  };

  const heroShown = 1 - smooth(progress, 0.04, 0.38);
  const desktopShown = smooth(progress, 0.35, 0.85);
  const settled = smooth(progress, 0.82, 1);
  const fade = playing ? ease(t, 0, 350) * (1 - ease(t, duration - 450, 400)) : 0;
  const phase = playing ? now.hud(t) : null;
  const nod = playing ? Math.max(0, ...now.keys.map((press) => bump(t, press.at - 60))) : 0;
  const mac = env.os === "mac";

  const start = (next: Mode) => {
    setT(0);
    setMode(next);
    setPlaying(true);
  };

  return (
    <section
      ref={section}
      id="modes"
      aria-label="iVibe"
      style={{ position: "relative", height: vh * (1 + ZOOM_RUN) }}
    >
      <div style={{ position: "sticky", top: 0, height: vh, overflow: "hidden" }}>
        <div
          ref={card}
          role="img"
          aria-label={
            playing ? `${LABELS[mode]}: ${SUMMARY[mode]}` : "A desktop with iVibe's pill listening"
          }
          style={{
            position: "absolute",
            ...rect,
            borderRadius: 22 * e,
            overflow: "hidden",
            boxShadow: `0 30px 80px rgba(30,20,10,${0.22 * e}), 0 0 0 ${e}px var(--color-border)`,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: W,
              height: H,
              transformOrigin: "0 0",
              transform: `translate(${at.x - pill.x * k}px, ${at.y - pill.y * k}px) scale(${k})`,
            }}
          >
            <Wallpaper env={env} />
            {playing ? (
              <div style={{ position: "absolute", inset: 0, opacity: fade }}>{now.windows(t)}</div>
            ) : (
              // Before the demo: the bug on one side, the prompt it became on the other. In the
              // hero they sit at the edges, out of focus; zooming out slides them into place.
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  filter: `blur(${(1 - e) * 2.5}px)`,
                  opacity: 0.55 + 0.45 * e,
                }}
              >
                <ChromeWindow
                  env={env}
                  t={10_000}
                  clicks={[0]}
                  style={{
                    left: -170 + 186 * e,
                    top: top(env, 170),
                    ...CHROME,
                    transform: "scale(0.52)",
                    transformOrigin: "0 0",
                  }}
                />
                <ClaudeCodeWindow
                  env={env}
                  t={10_000}
                  pasteAt={0}
                  style={{
                    left: 880 - 180 * e,
                    top: top(env, 205),
                    width: 590,
                    height: 340,
                    transform: "scale(0.52)",
                    transformOrigin: "0 0",
                  }}
                />
              </div>
            )}
            <div style={{ opacity: desktopShown }}>
              {mac ? (
                <>
                  <MenuBar env={env} app={playing ? now.active(t) : "chrome"} />
                  <Dock
                    env={env}
                    open={playing ? now.open : { chrome: true, terminal: true }}
                    pressed={playing ? now.dockPressed?.(t) : undefined}
                  />
                </>
              ) : (
                <Taskbar
                  env={env}
                  open={playing ? now.open : { chrome: true, terminal: true }}
                  active={playing ? now.active(t) : "chrome"}
                  pressed={playing ? now.dockPressed?.(t) : undefined}
                />
              )}
            </div>

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
                <CompactPill t={idle} />
              )}
            </div>

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
                opacity: desktopShown,
              }}
            >
              <div
                style={{
                  transform: `translateY(${nod * 3}px) scale(${1 + nod * 0.04}, ${1 - nod * 0.06})`,
                  transformOrigin: "50% 100%",
                }}
              >
                <Mascot size={MASCOT} state={mascotState(phase)} />
              </div>
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

          {/* Once the desktop has settled into its card: the invitation to watch. */}
          {!playing && settled > 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                paddingBottom: cardHeight * 0.12,
                opacity: settled,
                transform: `translateY(${(1 - settled) * 12}px)`,
                pointerEvents: settled > 0.5 ? "auto" : "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: Math.min(560, cardWidth * 0.8),
                  height: 260,
                  transform: `translate(-50%, calc(-50% - ${cardHeight * 0.06}px))`,
                  background:
                    "radial-gradient(closest-side, color-mix(in srgb, var(--color-background-surface) 82%, transparent), transparent)",
                }}
              />
              <span style={{ position: "relative" }}>
                <Text size="xl" weight="semibold">
                  Ready to see how it works?
                </Text>
              </span>
              <Button
                label="Play demo"
                variant="primary"
                icon={<Play size={14} strokeWidth={0} fill="currentColor" />}
                onClick={() => start(mode)}
              />
            </div>
          )}
        </div>

        {/* The hero's words, over the close-up desktop; they leave as the zoom starts. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            paddingTop: NAV - 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: heroShown,
            transform: `translateY(${-progress * 70}px) scale(${1 - 0.05 * Math.min(1, progress * 3)})`,
            pointerEvents: heroShown > 0.5 ? "auto" : "none",
            visibility: heroShown <= 0 ? "hidden" : "visible",
          }}
        >
          {hero}
        </div>

        {/* The modes, under the card. */}
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            top: rect.top + rect.height + 18,
            opacity: settled,
            pointerEvents: settled > 0.5 ? "auto" : "none",
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
              <div style={{ width: 200, visibility: playing ? "visible" : "hidden" }}>
                <ProgressBar
                  label={`${LABELS[mode]} demo`}
                  isLabelHidden
                  value={(t / duration) * 100}
                />
              </div>
            </VStack>
            <div style={{ maxWidth: 560, textAlign: "center" }}>
              <Text color="secondary" size="sm">
                {SUMMARY[mode]}
              </Text>
            </div>
          </VStack>
        </div>
      </div>
    </section>
  );
}
