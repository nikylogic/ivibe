// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/scene.ts";
import { detectPlatform } from "./release.ts";

/**
 * "See it work": a small desktop that plays each mode the way the app does it, with the pill above
 * the dock, windows that open and results that paste. Everything is a function of one clock (`t`,
 * ms into the current mode), so it can also be captured frame by frame later.
 */

/** The stage is laid out at this size and scaled to fit, so it looks the same at any width. */
const W = 1040;
const H = 620;

type Mode = "fix" | "prompt" | "dictate";
const MODES: { id: Mode; label: string; ms: number }[] = [
  { id: "fix", label: "Fix", ms: 12_500 },
  { id: "prompt", label: "Prompt", ms: 9_500 },
  { id: "dictate", label: "Dictate", ms: 9_500 },
];

const KEYS: Record<"mac" | "other", Record<Mode, string>> = {
  // Kbd draws ctrl and alt as Mac glyphs; a word joiner keeps them as the words Windows prints.
  other: { fix: "ctrl⁠+Caps Lock", prompt: "alt⁠+Caps Lock", dictate: "Caps Lock" },
  mac: { fix: "ctrl+alt+Space", prompt: "shift+alt+Space", dictate: "alt+Space" },
};

// ---------------------------------------------------------------------------------------------
// Timing helpers: everything below is computed from t.

/** 0 → 1 over [start, start + ms], eased out. */
function ease(t: number, start: number, ms = 360): number {
  const p = Math.min(1, Math.max(0, (t - start) / ms));
  return 1 - (1 - p) ** 3;
}

const between = (t: number, start: number, end: number) => t >= start && t < end;

/** The part of a text typed by time t. */
function typed(text: string, t: number, start: number, end: number): string {
  const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return text.slice(0, Math.round(p * text.length)).trimEnd();
}

/** A window opening: scales up a touch and fades in. */
function opening(t: number, start: number): CSSProperties {
  const e = ease(t, start, 420);
  return {
    opacity: e,
    transform: `translateY(${(1 - e) * 14}px) scale(${0.96 + e * 0.04})`,
    visibility: t < start ? "hidden" : "visible",
  };
}

// ---------------------------------------------------------------------------------------------
// Pieces of the desktop.

const ink = "var(--color-text-primary)";
const soft = "var(--color-text-secondary)";
const line = "var(--color-border)";

function Window({
  title,
  dark = false,
  style,
  children,
}: {
  title: string;
  dark?: boolean;
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        borderRadius: 12,
        overflow: "hidden",
        background: dark ? "#161513" : "var(--color-background-surface)",
        color: dark ? "#e9e5dc" : ink,
        boxShadow: "0 24px 60px rgba(30, 24, 16, 0.22), 0 2px 8px rgba(30, 24, 16, 0.12)",
        border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : line}`,
        ...style,
      }}
    >
      <div
        style={{
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingInline: 12,
          background: dark ? "#1f1d1a" : "var(--color-background-muted)",
          borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.06)" : line}`,
          fontSize: 11.5,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
          <span key={color} style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            marginRight: 42,
            color: dark ? "#8f8a80" : soft,
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/** The app's compact pill: listening (dotted waveform), writing (shimmer) or done (check). */
function Pill({
  t,
  state,
  label,
}: {
  t: number;
  state: "listening" | "writing" | "done";
  label?: string;
}) {
  const box: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 34,
    paddingInline: 16,
    borderRadius: 17,
    background: "#1c1b19",
    color: "#f2efe8",
    fontSize: 12.5,
    fontWeight: 550,
    boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
    whiteSpace: "nowrap",
  };
  if (state === "done") {
    return (
      <span style={box}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#46a758"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {label}
      </span>
    );
  }
  if (state === "writing") {
    const x = (t / 6) % 220;
    return (
      <span style={box}>
        <span
          style={{
            backgroundImage: `linear-gradient(90deg, #8f8a80 ${x - 50}px, #fdfcf9 ${x}px, #8f8a80 ${x + 50}px)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {label ?? "Writing the prompt…"}
        </span>
      </span>
    );
  }
  const dots = 13;
  return (
    <span style={{ ...box, gap: 4, paddingInline: 18 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: "#e5484d",
          marginRight: 5,
          opacity: 0.55 + 0.45 * Math.sin(t / 160),
        }}
      />
      {Array.from({ length: dots }, (_, index) => {
        const center = 1 - Math.abs(index - (dots - 1) / 2) / ((dots - 1) / 2);
        const voice = Math.abs(Math.sin(t / 105 + index * 0.9) * Math.sin(t / 240 + index));
        return (
          <span
            key={index}
            style={{
              width: 2.5,
              height: 3 + center * voice * 15,
              borderRadius: 2,
              background: "#f2efe8",
            }}
          />
        );
      })}
    </span>
  );
}

/** What you said, live, above the pill. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 560,
        padding: "9px 14px",
        borderRadius: 12,
        background: "rgba(28, 27, 25, 0.92)",
        color: "#f2efe8",
        fontSize: 14,
        lineHeight: 1.45,
        boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

function Cursor({
  t,
  path,
  clickAt,
}: {
  t: number;
  path: [number, number, number][];
  clickAt?: number;
}) {
  // path: [time, x, y]; glides between points with an ease.
  let x = path[0]![1];
  let y = path[0]![2];
  for (let index = 1; index < path.length; index++) {
    const [time, nx, ny] = path[index]!;
    const [prev] = path[index - 1]!;
    const e = ease(t, prev, time - prev);
    x = x + (nx - x) * e;
    y = y + (ny - y) * e;
  }
  const ring = clickAt === undefined ? 0 : Math.min(1, Math.max(0, (t - clickAt) / 380));
  return (
    <>
      {ring > 0 && ring < 1 && (
        <span
          style={{
            position: "absolute",
            left: x - 18 * ring,
            top: y - 18 * ring,
            width: 36 * ring,
            height: 36 * ring,
            borderRadius: "50%",
            border: "2px solid #1b1a17",
            opacity: 1 - ring,
          }}
        />
      )}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x - 3,
          top: y - 2,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))",
        }}
      >
        <path
          d="M4 2 L4 19 L8.5 14.8 L11.4 21.2 L14.2 20 L11.3 13.7 L17.5 13.7 Z"
          fill="#111"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}

type PillState = "listening" | "writing" | "done";
type App = "browser" | "terminal" | "chat" | "messages";

/** Generic app icons in iVibe's style: a browser, a terminal, a chat app and messages. */
function DockIcon({ app, open, lift }: { app: App; open: boolean; lift: number }) {
  const tile: Record<App, { bg: string; glyph: ReactNode }> = {
    browser: {
      bg: "linear-gradient(160deg, #ffffff, #e9e4da)",
      glyph: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b6fd8"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" />
        </svg>
      ),
    },
    terminal: {
      bg: "linear-gradient(160deg, #2b2925, #141311)",
      glyph: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e8946b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 8 4 4-4 4M12 17h7" />
        </svg>
      ),
    },
    chat: {
      bg: "linear-gradient(160deg, #f3ece0, #d8ccb8)",
      glyph: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4a4136"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <path d="M12 3.5 14.2 9.8 20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.2z" />
        </svg>
      ),
    },
    messages: {
      bg: "linear-gradient(160deg, #6ad08a, #2f9d55)",
      glyph: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
          <path d="M12 4c-4.7 0-8.5 3.1-8.5 7 0 2.1 1.1 4 2.9 5.3L5.6 20l4-1.9c.8.2 1.6.3 2.4.3 4.7 0 8.5-3.1 8.5-7s-3.8-7.4-8.5-7.4z" />
        </svg>
      ),
    },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: tile[app].bg,
          display: "grid",
          placeItems: "center",
          boxShadow: "0 4px 10px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.25)",
          transform: `translateY(${-lift * 8}px)`,
        }}
      >
        {tile[app].glyph}
      </div>
      <span
        style={{ width: 4, height: 4, borderRadius: 2, background: open ? ink : "transparent" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Fix: a Save button that does nothing, shown and described; the prompt lands in Claude Code.

const FIX_SAID = "I change my bio and hit Save… nothing happens. It should save and show a toast.";

function ProfilePage({ t }: { t: number }) {
  const shake = ease(t, 1500, 420);
  const pressed = between(t, 1380, 1520);
  const field = (label: string, value: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: soft, marginBottom: 5 }}>{label}</div>
      <div
        style={{
          border: `1.5px solid ${line}`,
          borderRadius: 7,
          padding: "7px 10px",
          fontSize: 12.5,
        }}
      >
        {value}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100% - 30px)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: `1px solid ${line}`,
        }}
      >
        <span style={{ fontSize: 13, color: soft }}>‹ ›</span>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: soft,
            background: "var(--color-background-muted)",
            borderRadius: 6,
            padding: "4px 10px",
          }}
        >
          localhost:5173/profile
        </span>
      </div>
      <div style={{ flex: 1, padding: "18px 24px" }}>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 14 }}>Edit profile</div>
        {field("Name", "Asha Rao")}
        {field("Bio", "Building things on weekends")}
        <span
          style={{
            display: "inline-block",
            marginTop: 4,
            padding: "8px 26px",
            borderRadius: 7,
            background: "#5146e5",
            color: "#fff",
            fontWeight: 650,
            fontSize: 12.5,
            transform: `translateX(${Math.sin(shake * Math.PI * 5) * 4 * (1 - shake)}px) scale(${pressed ? 0.96 : 1})`,
          }}
        >
          Save
        </span>
      </div>
      <div
        style={{
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: "8px 12px",
          fontFamily: "Consolas, Menlo, monospace",
          fontSize: 10.5,
          lineHeight: 1.55,
        }}
      >
        <div style={{ color: "#8b8b8b" }}>Console</div>
        <div style={{ color: "#f48771", opacity: ease(t, 1600) }}>
          Uncaught TypeError: Cannot read properties of undefined (reading &apos;map&apos;)
        </div>
        <div style={{ color: "#f48771", opacity: ease(t, 1600) }}>
          &nbsp;&nbsp;at saveProfile (ProfileForm.tsx:41)
        </div>
      </div>
    </div>
  );
}

/** A pasted proof screenshot: a thumbnail with the red box iVibe draws. */
function Proof({ kind, t, at }: { kind: "save" | "console"; t: number; at: number }) {
  const e = ease(t, at, 300);
  const bar = (left: number, top: number, width: number, color: string, height = 6) => (
    <span
      style={{ position: "absolute", left, top, width, height, borderRadius: 2, background: color }}
    />
  );
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: 132,
        height: 78,
        borderRadius: 6,
        overflow: "hidden",
        background: kind === "save" ? "#f6f4ef" : "#1e1e1e",
        border: "1px solid rgba(255,255,255,0.14)",
        opacity: e,
        transform: `scale(${0.9 + e * 0.1})`,
      }}
    >
      {kind === "save" ? (
        <>
          {bar(10, 9, 60, "#333")}
          {bar(10, 22, 100, "#ddd", 8)}
          {bar(10, 36, 100, "#ddd", 8)}
          {bar(10, 54, 34, "#5146e5", 12)}
          <span
            style={{
              position: "absolute",
              left: 5,
              top: 49,
              width: 44,
              height: 22,
              borderRadius: 4,
              border: "2px solid #e5484d",
            }}
          />
        </>
      ) : (
        <>
          {bar(8, 12, 110, "#f48771", 5)}
          {bar(8, 22, 80, "#f48771", 5)}
          {bar(8, 40, 60, "#9cdcfe", 5)}
          <span
            style={{
              position: "absolute",
              left: 4,
              top: 7,
              width: 122,
              height: 24,
              borderRadius: 4,
              border: "2px solid #e5484d",
            }}
          />
        </>
      )}
    </span>
  );
}

const FIX_PROMPT: { text: string; strong?: boolean; dim?: boolean }[] = [
  { text: "Save on Edit profile does nothing", strong: true },
  { text: "Expected: saves the bio and shows a toast." },
  { text: "Actual: TypeError reading 'map' in saveProfile" },
  { text: "  (ProfileForm.tsx:41); no request is sent.", dim: true },
  { text: "Proof:", dim: true },
];

function FixScene({ t }: { t: number }) {
  return (
    <>
      <Window
        title="Profile · localhost"
        style={{ left: 70, top: 40, width: 560, height: 400, ...opening(t, 0) }}
      >
        <ProfilePage t={t} />
      </Window>
      <Window
        title="claude — ~/profile-app"
        dark
        style={{ left: 440, top: 96, width: 540, height: 360, ...opening(t, 7300) }}
      >
        <div
          style={{
            padding: "14px 18px",
            fontFamily: "Consolas, Menlo, monospace",
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          <div style={{ color: "#8f8a80", marginBottom: 8 }}>✻ Ready. What should we work on?</div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 8,
              padding: "10px 12px",
              display: "flex",
              gap: 10,
            }}
          >
            <span style={{ color: "#e8946b" }}>{">"}</span>
            <div style={{ minWidth: 0 }}>
              {FIX_PROMPT.map((row, index) => (
                <div
                  key={row.text}
                  style={{
                    whiteSpace: "pre",
                    color: row.dim ? "#a9a49a" : row.strong ? "#ffffff" : "#e9e5dc",
                    fontWeight: row.strong ? 700 : 400,
                    opacity: ease(t, 7700 + index * 160, 200),
                  }}
                >
                  {row.text}
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <Proof kind="save" t={t} at={8600} />
                <Proof kind="console" t={t} at={8750} />
              </div>
            </div>
          </div>
        </div>
      </Window>
      {t < 7300 && (
        <Cursor
          t={t}
          path={[
            [0, 520, 520],
            [1300, 140, 340],
            [7000, 146, 344],
          ]}
          clickAt={1380}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Prompt: a ramble becomes a clear, structured prompt in a chat app.

const RAMBLE =
  "uh so I want, like, a dark mode toggle… it should remember my choice, oh and, um, follow the system setting by default I guess";

const STRUCTURED: { text: string; kind?: "title" | "label" }[] = [
  { text: "Add a dark mode toggle", kind: "title" },
  { text: "Goal", kind: "label" },
  { text: "Let users switch between light and dark themes." },
  { text: "Requirements", kind: "label" },
  { text: "• Follow the system setting by default" },
  { text: "• Remember the user's choice across visits" },
  { text: "Done when", kind: "label" },
  { text: "• The choice survives a reload" },
];

function PromptScene({ t }: { t: number }) {
  return (
    <Window title="Chat" style={{ left: 190, top: 36, width: 660, height: 410, ...opening(t, 0) }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100% - 30px)",
          padding: 18,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            color: soft,
            fontSize: 18,
            fontFamily: '"Instrument Serif", Georgia, serif',
          }}
        >
          {t < 5200 ? "What are we building today?" : ""}
        </div>
        <div
          style={{
            border: `1.5px solid ${t > 5200 ? ink : line}`,
            borderRadius: 14,
            padding: "12px 14px",
            fontSize: 12.5,
            lineHeight: 1.5,
            minHeight: 22,
          }}
        >
          {t < 5200 ? (
            <span style={{ color: soft }}>Message</span>
          ) : (
            STRUCTURED.map((row, index) => (
              <div
                key={row.text}
                style={{
                  opacity: ease(t, 5300 + index * 130, 180),
                  fontWeight: row.kind === "title" ? 700 : row.kind === "label" ? 600 : 400,
                  color: row.kind === "label" ? soft : ink,
                  marginTop: row.kind === "label" ? 5 : 0,
                }}
              >
                {row.text}
              </div>
            ))
          )}
        </div>
      </div>
    </Window>
  );
}

// ---------------------------------------------------------------------------------------------
// Dictate: words as heard, the fillers struck out, the clean message pasted.

const HEARD: { word: string; filler?: boolean }[] = [
  { word: "Hey" },
  { word: "Asha," },
  { word: "um,", filler: true },
  { word: "the", filler: true },
  { word: "demo", filler: true },
  { word: "is,", filler: true },
  { word: "uh,", filler: true },
  { word: "the" },
  { word: "demo" },
  { word: "is" },
  { word: "ready" },
  { word: "for" },
  { word: "tomorrow," },
  { word: "so", filler: true },
  { word: "like,", filler: true },
  { word: "let" },
  { word: "me" },
  { word: "know" },
  { word: "what" },
  { word: "you" },
  { word: "think" },
];
const CLEAN = "Hey Asha, the demo is ready for tomorrow. Let me know what you think!";

function DictateScene({ t }: { t: number }) {
  const clean = typed(CLEAN, t, 5400, 6600);
  return (
    <Window
      title="Messages · Asha"
      style={{ left: 190, top: 36, width: 660, height: 410, ...opening(t, 0) }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          height: "calc(100% - 30px)",
          padding: 18,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            alignSelf: "flex-start",
            background: "var(--color-background-muted)",
            borderRadius: 14,
            padding: "8px 12px",
            fontSize: 13,
          }}
        >
          Is the demo ready for tomorrow?
        </div>
        <div style={{ flex: 1 }} />
        {t > 6800 && (
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "80%",
              background: "#2f9d55",
              color: "#fff",
              borderRadius: 14,
              padding: "8px 12px",
              fontSize: 13,
              opacity: ease(t, 6800, 260),
            }}
          >
            {CLEAN}
          </div>
        )}
        <div
          style={{
            border: `1.5px solid ${between(t, 5300, 6800) ? ink : line}`,
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            color: clean && t < 6800 ? ink : soft,
          }}
        >
          {t < 6800 && clean ? clean : "Message"}
        </div>
      </div>
    </Window>
  );
}

// ---------------------------------------------------------------------------------------------

/** What the pill, captions, dock and mascot do in each mode, at time t. */
function overlay(mode: Mode, t: number) {
  if (mode === "fix") {
    const pill: PillState | null =
      t < 2400 ? null : t < 6400 ? "listening" : t < 9400 ? "writing" : ("done" as const);
    return {
      keysAt: 2200,
      pill,
      label: pill === "done" ? "Pasted into Claude Code" : undefined,
      extra: pill === "done" ? "Hid a GitHub token" : undefined,
      caption: between(t, 2600, 6400) ? typed(FIX_SAID, t, 2600, 6000) : "",
      apps: ["browser", "terminal"] as App[],
      open: { browser: true, terminal: t >= 7300 } as Partial<Record<App, boolean>>,
      lift: { terminal: ease(t, 7200, 200) * (1 - ease(t, 7500, 300)) } as Partial<
        Record<App, number>
      >,
    };
  }
  if (mode === "prompt") {
    const pill: PillState | null =
      t < 700 ? null : t < 4400 ? "listening" : t < 6900 ? "writing" : ("done" as const);
    return {
      keysAt: 600,
      pill,
      label: pill === "done" ? "Pasted into Chat" : undefined,
      extra: undefined,
      caption: between(t, 900, 4400) ? typed(RAMBLE, t, 900, 4200) : "",
      apps: ["browser", "terminal", "chat"] as App[],
      open: { chat: true } as Partial<Record<App, boolean>>,
      lift: {} as Partial<Record<App, number>>,
    };
  }
  const pill: PillState | null =
    t < 700 ? null : t < 4800 ? "listening" : t < 6800 ? "writing" : ("done" as const);
  return {
    keysAt: 600,
    pill,
    label: pill === "writing" ? "Tidying up…" : pill === "done" ? "Pasted" : undefined,
    extra: undefined,
    caption: "",
    words: between(t, 900, 5000),
    apps: ["browser", "terminal", "messages"] as App[],
    open: { messages: true } as Partial<Record<App, boolean>>,
    lift: {} as Partial<Record<App, number>>,
  };
}

function mascotState(pill: string | null): MascotState {
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
  const strike = ease(t, 4200, 400);
  return (
    <Caption>
      {HEARD.slice(0, shown).map((item, index) => (
        <span
          key={index}
          style={
            item.filler
              ? {
                  color: strike > 0.4 ? "#ff8a80" : undefined,
                  textDecoration: strike > 0.4 ? "line-through" : undefined,
                  opacity: 1 - strike * 0.5,
                }
              : undefined
          }
        >
          {item.word}{" "}
        </span>
      ))}
    </Caption>
  );
}

export function Demo() {
  const platform = detectPlatform();
  const keys = KEYS[platform === "mac" ? "mac" : "other"];
  const [mode, setMode] = useState<Mode>("fix");
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const still = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

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
    const duration = MODES.find((item) => item.id === mode)!.ms;
    if (still.current) {
      setT(duration - 400);
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
  }, [mode]);

  const now = overlay(mode, t);
  const keysShown = ease(t, now.keysAt, 260);
  const fadeOut = 1 - ease(t, MODES.find((item) => item.id === mode)!.ms - 450, 400);

  return (
    <VStack gap={5} hAlign="center" width="100%">
      <div
        ref={frame}
        style={{
          width: "100%",
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 22,
          overflow: "hidden",
          position: "relative",
          background:
            "radial-gradient(120% 90% at 30% 10%, var(--color-background-surface) 0%, var(--color-background-body) 45%, var(--color-accent-muted) 100%)",
          border: `1px solid ${line}`,
          boxShadow: "0 30px 80px var(--color-shadow)",
          fontFamily: '"Inter Variable", -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            opacity: fadeOut,
          }}
          aria-hidden="true"
        >
          {mode === "fix" && <FixScene t={t} />}
          {mode === "prompt" && <PromptScene t={t} />}
          {mode === "dictate" && <DictateScene t={t} />}

          {/* The shortcut being pressed. */}
          <div
            style={{
              position: "absolute",
              left: 22,
              top: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 10,
              background: "var(--color-background-surface)",
              boxShadow: "0 6px 18px rgba(30,24,16,0.14)",
              opacity: keysShown,
              transform: `translateY(${(1 - keysShown) * -6}px) scale(${between(t, now.keysAt + 80, now.keysAt + 260) ? 0.96 : 1})`,
            }}
          >
            <Kbd keys={keys[mode]} />
          </div>

          {/* The pill and captions, above the dock, where the app puts them. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 92,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            {now.caption && <Caption>“{now.caption}”</Caption>}
            {mode === "dictate" && "words" in now && now.words && <Heard t={t} />}
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
                    }}
                  >
                    {now.extra}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* The dock. */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 12,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 10,
              padding: "8px 12px 4px",
              borderRadius: 18,
              background: "color-mix(in srgb, var(--color-background-surface) 70%, transparent)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${line}`,
            }}
          >
            {now.apps.map((app) => (
              <DockIcon
                key={app}
                app={app}
                open={now.open[app] === true}
                lift={now.lift[app] ?? 0}
              />
            ))}
          </div>

          {/* The mascot keeps you company, and cheers when the result lands. */}
          <div style={{ position: "absolute", right: 14, bottom: 6 }}>
            <Mascot size={96} state={mascotState(now.pill)} />
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
