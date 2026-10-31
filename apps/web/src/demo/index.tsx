// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../../desktop/src/renderer/shared/mascot/scene.ts";
import { detectPlatform } from "../release.ts";
import { ChromeWindow, ClaudeAppWindow, ClaudeCodeWindow, SAVE, WhatsAppWindow } from "./apps.tsx";
import {
  Dock,
  dockSpot,
  mascotBottom,
  MenuBar,
  pillBottom,
  Taskbar,
  Wallpaper,
} from "./desktop.tsx";
import type { App } from "./icons.tsx";
import { between, Caption, Cursor, ease, H, Keys, Pill, top, W } from "./kit.tsx";
import type { Env, PillState } from "./kit.tsx";

/**
 * "See it work": a small desktop, macOS or Windows to match the visitor, that plays each mode the
 * way the app does it. Everything is a function of one clock (`t`, ms into the current mode).
 */

type Mode = "fix" | "prompt" | "dictate";
const MODES: { id: Mode; label: string; ms: number }[] = [
  { id: "fix", label: "Fix", ms: 12_500 },
  { id: "prompt", label: "Prompt", ms: 9_500 },
  { id: "dictate", label: "Dictate", ms: 10_000 },
];

// Kbd draws ctrl and alt as Mac glyphs; a word joiner keeps them as the words Windows prints.
const KEYS: Record<Env["os"], Record<Mode, string>> = {
  windows: { fix: "ctrl⁠+Caps Lock", prompt: "alt⁠+Caps Lock", dictate: "Caps Lock" },
  mac: { fix: "ctrl+alt+Space", prompt: "shift+alt+Space", dictate: "alt+Space" },
};

const FIX_SAID = "I change my bio and hit Save… nothing happens. It should save and show a toast.";
const RAMBLE =
  "uh so I want, like, a dark mode toggle… it should remember my choice, oh and, um, follow the system setting by default I guess";
const HEARD: { word: string; filler?: boolean }[] = [
  ..."Hey Asha,".split(" ").map((word) => ({ word })),
  ..."um, the demo is, uh,".split(" ").map((word) => ({ word, filler: true })),
  ..."the demo is ready for tomorrow,".split(" ").map((word) => ({ word })),
  ..."so like,".split(" ").map((word) => ({ word, filler: true })),
  ..."let me know what you think".split(" ").map((word) => ({ word })),
];

type Beat = {
  keysAt: number;
  pill: PillState | null;
  label?: string;
  extra?: string;
  caption?: string;
  heard?: boolean;
  active: App;
  open: Partial<Record<App, boolean>>;
  pressed?: App;
};

/** The pill, captions and dock at time t. */
function beat(mode: Mode, t: number): Beat {
  if (mode === "fix") {
    const pill = t < 2400 ? null : t < 6400 ? "listening" : t < 9400 ? "writing" : "done";
    return {
      keysAt: 2200,
      pill,
      label: pill === "done" ? "Pasted into Claude Code" : undefined,
      extra: pill === "done" ? "Hid a GitHub token" : undefined,
      caption: between(t, 2600, 6400) ? typed(FIX_SAID, t, 2600, 6000) : undefined,
      active: t < 7050 ? "chrome" : "terminal",
      open: { chrome: true, terminal: true },
      pressed: between(t, 6900, 7050) ? "terminal" : undefined,
    };
  }
  if (mode === "prompt") {
    const pill = t < 700 ? null : t < 4400 ? "listening" : t < 6900 ? "writing" : "done";
    return {
      keysAt: 600,
      pill,
      label: pill === "done" ? "Pasted into Claude" : undefined,
      caption: between(t, 900, 4400) ? typed(RAMBLE, t, 900, 4200) : undefined,
      active: "claude",
      open: { chrome: true, terminal: true, claude: true },
    };
  }
  const pill =
    t < 700 ? null : t < 4800 ? "listening" : t < 6200 ? "writing" : t < 9000 ? "done" : null;
  return {
    keysAt: 600,
    pill,
    label:
      pill === "writing" ? "Tidying up…" : pill === "done" ? "Pasted into WhatsApp" : undefined,
    heard: between(t, 900, 4800),
    active: "whatsapp",
    open: { chrome: true, terminal: true, claude: true, whatsapp: true },
  };
}

function typed(text: string, t: number, start: number, end: number): string {
  const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return text.slice(0, Math.round(p * text.length)).trimEnd();
}

function mascotState(pill: PillState | null): MascotState {
  return pill === "listening"
    ? "recording"
    : pill === "writing"
      ? "writing"
      : pill === "done"
        ? "done"
        : "idle";
}

function Heard({ t }: { t: number }) {
  const shown = Math.floor(Math.min(1, Math.max(0, (t - 900) / 3000)) * HEARD.length);
  const strike = ease(t, 4000, 400);
  return (
    <Caption>
      {HEARD.slice(0, shown).map((item, index) => (
        <span
          key={index}
          style={
            item.filler && strike > 0.3
              ? { color: "#ff8a80", textDecoration: "line-through", opacity: 1 - strike * 0.4 }
              : undefined
          }
        >
          {item.word}{" "}
        </span>
      ))}
    </Caption>
  );
}

const FIX_CHROME = { left: 40, top: 22 };

/** The windows of each mode, and the pointer moving between them. */
function Scene({ env, mode, t }: { env: Env; mode: Mode; t: number }) {
  if (mode === "fix") {
    const chrome = { left: FIX_CHROME.left, top: top(env, FIX_CHROME.top) };
    const opened = 7050;
    return (
      <>
        <ChromeWindow
          env={env}
          t={t}
          clickAt={1300}
          style={{ ...chrome, width: 580, height: 490 }}
        />
        <ClaudeCodeWindow
          env={env}
          t={t}
          pasteAt={9400}
          style={{
            left: 420,
            top: top(env, 74),
            width: 580,
            height: 330,
            opacity: ease(t, opened, 260),
            transform: `scale(${0.97 + ease(t, opened, 260) * 0.03})`,
            visibility: t < opened ? "hidden" : "visible",
          }}
        />
      </>
    );
  }
  if (mode === "prompt") {
    return (
      <>
        <ClaudeAppWindow
          env={env}
          t={t}
          pasteAt={6900}
          style={{ left: 150, top: top(env, 22), width: 740, height: 470 }}
        />
      </>
    );
  }
  return (
    <>
      <WhatsAppWindow
        env={env}
        t={t}
        pasteAt={6200}
        sendAt={7450}
        style={{ left: 110, top: top(env, 22), width: 820, height: 470 }}
      />
    </>
  );
}

/** The pointer, drawn above the dock so it can click it. */
function Pointer({ env, mode, t }: { env: Env; mode: Mode; t: number }) {
  if (mode === "fix") {
    const save = { x: FIX_CHROME.left + SAVE.x, y: top(env, FIX_CHROME.top) + SAVE.y };
    const terminal = dockSpot(env, "terminal");
    return (
      <Cursor
        t={t}
        path={[
          [0, 640, 470],
          [1200, save.x + 4, save.y + 2],
          [6300, save.x + 10, save.y + 6],
          [6850, terminal.x, terminal.y],
        ]}
        clicks={[1300, 6900]}
      />
    );
  }
  return <Cursor t={t} path={mode === "prompt" ? [[0, 700, 300]] : [[0, 860, 250]]} />;
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

export function Demo({ theme }: { theme: ThemeMode }) {
  const systemDark = usePrefersDark();
  const env: Env = {
    os: demoOs(),
    dark: theme === "dark" || (theme === "system" && systemDark),
  };
  const [mode, setMode] = useState<Mode>("fix");
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const still = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const duration = MODES.find((item) => item.id === mode)!.ms;

  // Fits the stage to its column.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / W);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // One clock: plays while on screen, moves to the next mode at the end of each.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
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
    const tick = (now: number) => {
      if (visible && document.visibilityState === "visible") elapsed += Math.min(100, now - last);
      last = now;
      if (elapsed >= duration) {
        const next = MODES[(MODES.findIndex((item) => item.id === mode) + 1) % MODES.length]!;
        setT(0);
        setMode(next.id);
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
  }, [mode, duration]);

  const now = beat(mode, t);
  const fade = ease(t, 0, 350) * (1 - ease(t, duration - 450, 400));
  const mac = env.os === "mac";

  return (
    <VStack gap={5} hAlign="center" width="100%">
      <div
        ref={frame}
        style={{
          width: "100%",
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 20,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 30px 80px rgba(30,20,10,0.22), 0 0 0 1px var(--color-border)",
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
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <Wallpaper env={env} />
          <div style={{ position: "absolute", inset: 0, opacity: fade }}>
            <Scene env={env} mode={mode} t={t} />
          </div>
          {mac ? (
            <>
              <MenuBar env={env} app={now.active} />
              <Dock env={env} open={now.open} pressed={now.pressed} />
            </>
          ) : (
            <Taskbar env={env} open={now.open} active={now.active} pressed={now.pressed} />
          )}

          {/* The pill and what you said, above the dock, where the app puts them. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: pillBottom(env),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              pointerEvents: "none",
            }}
          >
            {now.caption && <Caption>“{now.caption}”</Caption>}
            {now.heard && <Heard t={t} />}
            {now.pill && (
              <div style={{ display: "flex", gap: 8, opacity: ease(t, now.keysAt + 150, 260) }}>
                <Pill t={t} state={now.pill} label={now.label} />
                {now.extra && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 34,
                      paddingInline: 14,
                      borderRadius: 17,
                      background: "#3a2f1c",
                      color: "#f0d9a8",
                      fontSize: 12.5,
                      fontWeight: 550,
                      boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
                    }}
                  >
                    {now.extra}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* The mascot in the corner, with the shortcut being pressed just above it. */}
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: mascotBottom(env),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Keys combo={KEYS[env.os][mode]} t={t} at={now.keysAt} />
            {mode === "dictate" && <Keys combo="enter" t={t} at={7400} />}
            <Mascot size={92} state={mascotState(now.pill)} />
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: fade, pointerEvents: "none" }}>
            <Pointer env={env} mode={mode} t={t} />
          </div>
        </div>
      </div>

      <SegmentedControl
        label="Mode"
        value={mode}
        onChange={(value) => {
          setT(0);
          setMode(value as Mode);
        }}
      >
        {MODES.map((item) => (
          <SegmentedControlItem key={item.id} value={item.id} label={item.label} />
        ))}
      </SegmentedControl>
      <Text color="secondary" size="sm">
        {mode === "fix"
          ? "Show the bug and say what's wrong. The prompt lands in your coding agent, with screenshots that prove it."
          : mode === "prompt"
            ? "Ramble an idea. A clear, structured prompt lands in the chat you were typing in."
            : "Just talk. Fillers and false starts go; your words land where you were typing."}
      </Text>
    </VStack>
  );
}
