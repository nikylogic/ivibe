// SPDX-License-Identifier: AGPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCheck,
  ChevronDown,
  EllipsisVertical,
  Info,
  MessageCircle,
  Mic,
  Phone,
  Plus,
  RotateCw,
  Search,
  Smile,
  SquarePen,
  Star,
  Video,
  X,
} from "lucide-react";
import { siClaude } from "simple-icons";
import { Glyph } from "./icons.tsx";
import { between, ease, Frame, MONO, SANS } from "./kit.tsx";
import type { Env, Palette } from "./kit.tsx";

/**
 * Recreations of the apps people use iVibe with, close enough to read as the real thing: Chrome
 * with DevTools, Claude Code in a terminal, the Claude app and WhatsApp.
 */

const icon = { strokeWidth: 1.8 } as const;

// ---------------------------------------------------------------------------------------------
// Chrome, on a profile page whose Save button does nothing, with DevTools docked on the right.

/** Fixed sizes, so the pointer can find things. Points are from the window's top left. */
export const CHROME = { width: 680, height: 470 };
const DEVTOOLS = 290;
export const SAVE = { x: 64, y: 369 };
export const CONSOLE_ERROR = { x: CHROME.width - DEVTOOLS + 130, y: 166 };

const TOKEN = "ghp_8fK2vQ9xR1mN4tL7wP3sY6zB0cD5eH2jA";

function pageColors(dark: boolean) {
  return {
    bg: dark ? "#101012" : "#ffffff",
    fg: dark ? "#f4f4f5" : "#18181b",
    dim: dark ? "#a1a1aa" : "#71717a",
    line: dark ? "#2a2a2e" : "#e4e4e7",
    field: dark ? "#18181b" : "#ffffff",
  };
}

function toolsColors(dark: boolean) {
  return {
    bg: dark ? "#282828" : "#ffffff",
    bar: dark ? "#3c3c3c" : "#f1f3f4",
    line: dark ? "#494c50" : "#cbcdd1",
    fg: dark ? "#e3e3e3" : "#1f1f1f",
    dim: dark ? "#c7c7c7" : "#474747",
    accent: dark ? "#7cacf8" : "#0b57d0",
    errorBg: dark ? "#4e3534" : "#fcebeb",
    errorLine: dark ? "#653b39" : "#f9dedc",
    errorFg: dark ? "#f9b7b2" : "#dc362e",
  };
}

export function ChromeWindow({
  env,
  t,
  clicks,
  style,
}: {
  env: Env;
  t: number;
  /** When Save is clicked; the error shows after the first. */
  clicks: number[];
  style: CSSProperties;
}) {
  const d = env.dark;
  const c = {
    strip: d ? "#1f2023" : "#dde3ea",
    tab: d ? "#35363a" : "#ffffff",
    omni: d ? "#202124" : "#eef1f5",
    fg: d ? "#e8eaed" : "#1f1f1f",
    dim: d ? "#9aa0a6" : "#5f6368",
  };
  const page = pageColors(d);
  const tools = toolsColors(d);
  const palette: Palette = { bar: c.strip, bg: c.tab, fg: c.fg, dim: c.dim };
  const pressed = clicks.some((at) => between(t, at, at + 140));
  const errors = clicks.filter((at) => t >= at + 180).length;
  const firstError = clicks[0]! + 180;

  const tabs = (
    <div
      style={{ flex: 1, alignSelf: "flex-end", display: "flex", alignItems: "flex-end", gap: 6 }}
    >
      <div
        style={{
          width: 210,
          height: 31,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingInline: 12,
          borderRadius: "9px 9px 0 0",
          background: c.tab,
          fontSize: 12,
          color: c.fg,
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: "#5146e5",
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            display: "grid",
            placeItems: "center",
          }}
        >
          P
        </span>
        <span style={{ flex: 1 }}>Edit profile · Pulse</span>
        <X size={12} color={c.dim} {...icon} />
      </div>
      <Plus size={15} color={c.dim} style={{ marginBottom: 8 }} {...icon} />
    </div>
  );

  const field = (label: string, value: ReactNode, last = false) => (
    <>
      <div style={{ height: 21, fontSize: 11.5, fontWeight: 500, color: page.dim }}>{label}</div>
      <div
        style={{
          height: 32,
          boxSizing: "border-box",
          border: `1px solid ${page.line}`,
          borderRadius: 7,
          padding: "7px 10px",
          fontSize: 12.5,
          marginBottom: last ? 14 : 10,
          background: page.field,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </>
  );

  return (
    <Frame env={env} palette={palette} bar={tabs} barHeight={38} style={style}>
      {/* Toolbar */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingInline: 12,
          background: c.tab,
          borderBottom: `1px solid ${d ? "#3c4043" : "#e3e6ea"}`,
          boxSizing: "border-box",
        }}
      >
        <ArrowLeft size={15} color={c.fg} {...icon} />
        <ArrowRight size={15} color={c.dim} {...icon} />
        <RotateCw size={14} color={c.fg} {...icon} />
        <div
          style={{
            flex: 1,
            height: 28,
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingInline: 12,
            borderRadius: 14,
            background: c.omni,
            fontSize: 12.5,
            color: c.fg,
          }}
        >
          <Info size={13} color={c.dim} {...icon} />
          <span>
            localhost:5173<span style={{ color: c.dim }}>/settings/profile</span>
          </span>
          <span style={{ flex: 1 }} />
          <Star size={13} color={c.dim} {...icon} />
        </div>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            background: "#c58af9",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "grid",
            placeItems: "center",
          }}
        >
          N
        </span>
        <EllipsisVertical size={15} color={c.fg} {...icon} />
      </div>

      <div style={{ position: "absolute", top: 40, left: 0, right: 0, bottom: 0, display: "flex" }}>
        {/* The page */}
        <div style={{ flex: 1, minWidth: 0, background: page.bg, color: page.fg }}>
          <div
            style={{
              height: 36,
              display: "flex",
              alignItems: "center",
              gap: 16,
              paddingInline: 22,
              borderBottom: `1px solid ${page.line}`,
              fontSize: 12,
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontWeight: 800, letterSpacing: -0.3 }}>Pulse</span>
            <span style={{ color: page.dim }}>Projects</span>
            <span>Settings</span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: "linear-gradient(135deg,#f6a35c,#e5484d)",
              }}
            />
          </div>
          <div style={{ padding: "14px 22px 0" }}>
            <div style={{ height: 32, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
              Edit profile
            </div>
            {field("Name", "Asha Rao")}
            {field("Bio", "Building things on weekends. Coffee and maps.")}
            {field(
              "GitHub token",
              <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{TOKEN}</span>,
              true,
            )}
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 84,
                height: 32,
                borderRadius: 7,
                background: pressed ? "#3f35c9" : "#5146e5",
                color: "#fff",
                fontWeight: 600,
                fontSize: 12.5,
                transform: `scale(${pressed ? 0.96 : 1})`,
              }}
            >
              Save
            </span>
          </div>
        </div>

        {/* DevTools, docked on the right */}
        <div
          style={{
            width: DEVTOOLS,
            flexShrink: 0,
            background: tools.bg,
            borderLeft: `1px solid ${tools.line}`,
            fontSize: 11.5,
            color: tools.fg,
          }}
        >
          <div
            style={{
              height: 27,
              display: "flex",
              alignItems: "stretch",
              gap: 14,
              paddingInline: 10,
              background: tools.bar,
              borderBottom: `1px solid ${tools.line}`,
              color: tools.dim,
              boxSizing: "border-box",
            }}
          >
            {["Elements", "Console", "Sources", "»"].map((name) => (
              <span
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderBottom: `2px solid ${name === "Console" ? tools.accent : "transparent"}`,
                  color: name === "Console" ? tools.fg : undefined,
                }}
              >
                {name}
              </span>
            ))}
            <span style={{ flex: 1 }} />
            {errors > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#e46962" }}>
                <ErrorDot /> {errors}
              </span>
            )}
          </div>
          <div
            style={{
              height: 26,
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingInline: 10,
              borderBottom: `1px solid ${tools.line}`,
              color: tools.dim,
              boxSizing: "border-box",
            }}
          >
            <span>⊘</span>
            <span>top ▾</span>
            <span
              style={{
                flex: 1,
                height: 18,
                borderRadius: 4,
                background: d ? "#1f1f1f" : "#f1f3f4",
                paddingInline: 6,
                fontSize: 11,
                lineHeight: "18px",
                color: d ? "#8a8a8a" : "#80868b",
              }}
            >
              Filter
            </span>
          </div>
          {errors > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "6px 10px",
                background: tools.errorBg,
                borderBottom: `1px solid ${tools.errorLine}`,
                color: tools.errorFg,
                fontFamily: MONO,
                fontSize: 10.5,
                lineHeight: 1.55,
                opacity: ease(t, firstError, 160),
              }}
            >
              <ErrorDot />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ flex: 1 }}>
                    Uncaught TypeError: Cannot read properties of undefined (reading
                    &apos;map&apos;)
                  </span>
                  {errors > 1 && (
                    <span
                      style={{
                        alignSelf: "flex-start",
                        borderRadius: 8,
                        paddingInline: 5,
                        background: "#e46962",
                        color: "#fff",
                        fontFamily: SANS,
                        fontSize: 9.5,
                        fontWeight: 700,
                      }}
                    >
                      {errors}
                    </span>
                  )}
                </div>
                <div style={{ paddingLeft: 12 }}>
                  at saveProfile (<u>ProfileForm.tsx:41:18</u>)
                </div>
                <div style={{ textAlign: "right", color: tools.dim }}>
                  <u>ProfileForm.tsx:41</u>
                </div>
              </div>
            </div>
          )}
          <div style={{ padding: "4px 10px", color: tools.accent, fontFamily: MONO }}>›</div>
        </div>
      </div>
    </Frame>
  );
}

/** A text field's blinking caret. */
function Caret({ t, color }: { t: number; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 1.5,
        height: 15,
        marginRight: 1,
        verticalAlign: -3,
        background: color,
        opacity: Math.floor(t / 530) % 2 ? 0 : 1,
      }}
    />
  );
}

function ErrorDot() {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        marginTop: 2,
        borderRadius: 6,
        background: "#e46962",
        color: "#fff",
        fontSize: 9,
        fontWeight: 900,
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      ×
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// The proof screenshots iVibe picked while you talked, as the pill shows them: the element that
// matters boxed in red, and the token blacked out before anything left the device.

const SHOT = { width: 156, height: 98 };

function Shot({ children, background }: { children: ReactNode; background: string }) {
  return (
    <span
      style={{
        position: "relative",
        flexShrink: 0,
        width: SHOT.width,
        height: SHOT.height,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        background,
      }}
    >
      {children}
    </span>
  );
}

const box = (left: number, top: number, width: number, height: number): CSSProperties => ({
  position: "absolute",
  left,
  top,
  width,
  height,
  borderRadius: 4,
  border: "2px solid #e5484d",
  boxShadow: "0 0 0 2px rgba(229, 72, 77, 0.25)",
});

const bar = (
  left: number,
  top: number,
  width: number,
  height: number,
  background: string,
): CSSProperties => ({
  position: "absolute",
  left,
  top,
  width,
  height,
  borderRadius: 2,
  background,
});

/** The page at the moment Save was clicked. */
export function ProofPage({ dark }: { dark: boolean }) {
  const page = pageColors(dark);
  const field = (top: number, width: number, value: string) => (
    <>
      <span style={bar(10, top, 26, 3, page.dim)} />
      <span
        style={{ ...bar(10, top + 6, 130, 12, page.field), border: `1px solid ${page.line}` }}
      />
      <span style={bar(14, top + 10, width, 4, value)} />
    </>
  );
  return (
    <Shot background={page.bg}>
      <span style={bar(10, 7, 46, 6, page.fg)} />
      {field(18, 40, page.fg)}
      {field(39, 90, page.fg)}
      <span style={bar(10, 60, 36, 3, page.dim)} />
      <span style={{ ...bar(10, 66, 130, 12, page.field), border: `1px solid ${page.line}` }} />
      {/* The token, hidden on this device. */}
      <span style={bar(13, 68, 124, 8, "#111")} />
      <span style={{ ...bar(10, 82, 30, 11, "#5146e5"), borderRadius: 3 }} />
      <span style={box(6, 79, 38, 17)} />
    </Shot>
  );
}

/** DevTools with the error that Save threw. */
export function ProofConsole({ dark }: { dark: boolean }) {
  const tools = toolsColors(dark);
  return (
    <Shot background={tools.bg}>
      <span style={bar(0, 0, SHOT.width, 12, tools.bar)} />
      <span style={bar(8, 4, 22, 4, tools.dim)} />
      <span style={bar(36, 4, 22, 4, tools.accent)} />
      <span style={bar(64, 4, 22, 4, tools.dim)} />
      <span style={bar(0, 20, SHOT.width, 38, tools.errorBg)} />
      <span style={bar(8, 25, 120, 4, tools.errorFg)} />
      <span style={bar(8, 33, 96, 4, tools.errorFg)} />
      <span style={bar(16, 41, 80, 4, tools.errorFg)} />
      <span style={bar(100, 49, 48, 4, tools.dim)} />
      <span style={box(3, 21, 148, 36)} />
      <span style={bar(8, 66, 6, 4, tools.accent)} />
    </Shot>
  );
}

// ---------------------------------------------------------------------------------------------
// Claude Code, in Terminal on macOS or Windows Terminal.

export const FIX_PROMPT = [
  { text: "Save on Edit profile does nothing", strong: true },
  { text: "Expected: saving shows a “Saved” toast and keeps the new bio." },
  {
    text: "Actual: no request is sent. Console: TypeError: Cannot read properties of undefined (reading 'map') at saveProfile (ProfileForm.tsx:41).",
  },
];

export function ClaudeCodeWindow({
  env,
  t,
  pasteAt,
  style,
}: {
  env: Env;
  t: number;
  pasteAt: number;
  style: CSSProperties;
}) {
  const mac = env.os === "mac";
  const palette: Palette = {
    bar: mac ? "#2b2b2b" : "#202020",
    bg: mac ? "#1e1e1e" : "#0c0c0c",
    fg: "#e6e6e6",
    dim: "#a8a8a8",
  };
  const pasted = t >= pasteAt;
  const flash = pasted ? 1 - ease(t, pasteAt, 700) : 0;
  const dim = "#8a8a8a";
  const orange = "#d77757";
  const windowsTab = (
    <div
      style={{ flex: 1, alignSelf: "flex-end", display: "flex", alignItems: "flex-end", gap: 8 }}
    >
      <div
        style={{
          width: 190,
          height: 28,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingInline: 10,
          borderRadius: "7px 7px 0 0",
          background: "#0c0c0c",
          fontSize: 12,
          color: "#fff",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#5aa9ff" }}>{">_"}</span>
        <span style={{ flex: 1 }}>claude</span>
        <X size={12} color={dim} {...icon} />
      </div>
      <Plus size={15} color={dim} style={{ marginBottom: 7 }} {...icon} />
      <ChevronDown size={14} color={dim} style={{ marginBottom: 7 }} {...icon} />
    </div>
  );
  return (
    <Frame
      env={env}
      palette={palette}
      title={mac ? "profile-app — claude — 92×26" : undefined}
      bar={mac ? undefined : windowsTab}
      barHeight={mac ? 30 : 36}
      style={style}
    >
      <div
        style={{
          padding: "12px 16px",
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.55,
          color: "#e6e6e6",
        }}
      >
        <div
          style={{
            display: "inline-block",
            border: `1px solid ${orange}`,
            borderRadius: 6,
            padding: "6px 14px 6px 10px",
            marginBottom: 12,
          }}
        >
          <div>
            <span style={{ color: orange }}>✻</span> Welcome to <b>Claude Code</b>!
          </div>
          <div style={{ color: dim, paddingLeft: 18, marginTop: 6 }}>
            /help for help, /status for your current setup
          </div>
          <div style={{ color: dim, paddingLeft: 18, marginTop: 6 }}>
            cwd: {mac ? "~/code/profile-app" : "C:\\code\\profile-app"}
          </div>
        </div>
        <div
          style={{
            border: `1px solid ${flash > 0 ? `rgba(215,119,87,${0.4 + flash * 0.6})` : "#5c5c5c"}`,
            borderRadius: 6,
            padding: "6px 10px",
            display: "flex",
            gap: 10,
          }}
        >
          <span style={{ color: "#bdbdbd" }}>{">"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {pasted ? (
              <>
                {FIX_PROMPT.map((row) => (
                  <div
                    key={row.text}
                    style={{
                      fontWeight: row.strong ? 700 : 400,
                      color: row.strong ? "#fff" : "#e0e0e0",
                    }}
                  >
                    {row.text}
                  </div>
                ))}
                <div style={{ color: "#b1b9f9" }}>[Image #1] [Image #2]</div>
              </>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 15,
                  verticalAlign: -3,
                  background: "#e6e6e6",
                  opacity: Math.floor(t / 530) % 2 ? 0 : 0.9,
                }}
              />
            )}
          </div>
        </div>
        <div style={{ color: dim, paddingLeft: 2, marginTop: 4 }}>? for shortcuts</div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// The Claude app: a rambling idea pasted as a structured prompt.

export const STRUCTURED: { text: string; kind?: "title" | "label" }[] = [
  { text: "Add a dark mode toggle", kind: "title" },
  { text: "Goal", kind: "label" },
  { text: "Let people switch between light and dark themes." },
  { text: "Requirements", kind: "label" },
  { text: "• Follow the system setting by default" },
  { text: "• Remember the choice across visits" },
  { text: "Done when", kind: "label" },
  { text: "• The choice survives a reload" },
];

export function ClaudeAppWindow({
  env,
  t,
  focusAt,
  pasteAt,
  style,
}: {
  env: Env;
  t: number;
  focusAt: number;
  pasteAt: number;
  style: CSSProperties;
}) {
  const d = env.dark;
  const c = {
    bg: d ? "#262624" : "#faf9f5",
    side: d ? "#1f1e1d" : "#f3f1ea",
    card: d ? "#30302e" : "#ffffff",
    line: d ? "#3e3e3a" : "#e5e2d8",
    fg: d ? "#ece9df" : "#3d3929",
    dim: d ? "#a19f96" : "#8c8879",
    accent: "#c96442",
  };
  const pasted = t >= pasteAt;
  const palette: Palette = { bar: c.side, bg: c.bg, fg: c.fg, dim: c.dim };
  const sideIcon = (node: ReactNode) => (
    <span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center" }}>
      {node}
    </span>
  );
  return (
    <Frame
      env={env}
      palette={palette}
      title={env.os === "mac" ? "" : "Claude"}
      icon={<Glyph icon={siClaude} size={14} color="#d97757" />}
      style={style}
    >
      <div style={{ display: "flex", height: "100%" }}>
        <div
          style={{
            width: 52,
            background: c.side,
            borderRight: `1px solid ${c.line}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            paddingTop: 8,
          }}
        >
          {sideIcon(<SquarePen size={16} color={c.fg} {...icon} />)}
          {sideIcon(<MessageCircle size={16} color={c.dim} {...icon} />)}
          {sideIcon(<Search size={16} color={c.dim} {...icon} />)}
          <span style={{ flex: 1 }} />
          <span
            style={{
              width: 26,
              height: 26,
              marginBottom: 12,
              borderRadius: 13,
              background: d ? "#4a4740" : "#e3dccb",
              color: c.fg,
              fontSize: 11,
              fontWeight: 600,
              display: "grid",
              placeItems: "center",
            }}
          >
            A
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
            paddingBottom: 30,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 30,
              color: c.fg,
            }}
          >
            <Glyph icon={siClaude} size={28} color="#d97757" />
            Evening, Asha
          </div>
          <div
            style={{
              width: 540,
              borderRadius: 18,
              background: c.card,
              border: `1px solid ${c.line}`,
              boxShadow: d ? "0 4px 18px rgba(0,0,0,0.25)" : "0 4px 18px rgba(60,50,30,0.07)",
              padding: "14px 16px 10px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.55, minHeight: 40, color: c.fg }}>
              {pasted ? (
                STRUCTURED.map((row) => (
                  <div
                    key={row.text}
                    style={{
                      fontWeight: row.kind === "title" ? 650 : row.kind === "label" ? 600 : 400,
                      color: row.kind === "label" ? c.dim : c.fg,
                      marginTop: row.kind === "label" ? 4 : 0,
                    }}
                  >
                    {row.text}
                  </div>
                ))
              ) : (
                <>
                  {t >= focusAt && <Caret t={t} color={c.fg} />}
                  <span style={{ color: c.dim }}>How can I help you today?</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: `1px solid ${c.line}`,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Plus size={15} color={c.fg} {...icon} />
              </span>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: c.accent,
                  opacity: pasted ? 1 : 0.45,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ArrowUp size={16} color="#fff" strokeWidth={2.4} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// WhatsApp: a dictated reply, pasted and sent.

export const CLEAN = "Hey Asha, the demo is ready for tomorrow. Let me know what you think!";

const CHATS = [
  { name: "Asha Rao", last: "Is the demo ready for tomorrow?", time: "9:38 PM", color: "#e5484d" },
  { name: "Design crew", last: "Rahul: new mocks are up", time: "8:12 PM", color: "#3e63dd" },
  { name: "Mom", last: "Call me when you're free", time: "6:47 PM", color: "#46a758" },
  { name: "Karan", last: "Photo", time: "Yesterday", color: "#f76b15" },
  { name: "Hackathon team", last: "Submission is due Nov 4", time: "Yesterday", color: "#8e4ec6" },
];

function Avatar({ name, color, size }: { name: string; color: string; size: number }) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color,
        color: "#fff",
        fontSize: size * 0.38,
        fontWeight: 600,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

export function WhatsAppWindow({
  env,
  t,
  focusAt,
  pasteAt,
  sendAt,
  style,
}: {
  env: Env;
  t: number;
  focusAt: number;
  pasteAt: number;
  sendAt: number;
  style: CSSProperties;
}) {
  const d = env.dark;
  const c = {
    pane: d ? "#111b21" : "#ffffff",
    head: d ? "#202c33" : "#f0f2f5",
    chat: d ? "#0b141a" : "#efeae2",
    inBubble: d ? "#202c33" : "#ffffff",
    outBubble: d ? "#005c4b" : "#d9fdd3",
    fg: d ? "#e9edef" : "#111b21",
    dim: d ? "#8696a0" : "#667781",
    selected: d ? "#2a3942" : "#f0f2f5",
    input: d ? "#2a3942" : "#ffffff",
    line: d ? "#222d34" : "#e9edef",
    green: "#00a884",
  };
  const palette: Palette = { bar: c.head, bg: c.pane, fg: c.fg, dim: c.dim };
  const sent = t >= sendAt;
  const draft = t >= pasteAt && !sent;
  const bubble = (text: string, mine: boolean, time: string, style?: CSSProperties) => (
    <div
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "72%",
        background: mine ? c.outBubble : c.inBubble,
        color: c.fg,
        borderRadius: 8,
        padding: "6px 9px 5px",
        fontSize: 12.5,
        lineHeight: 1.4,
        boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)",
        ...style,
      }}
    >
      {text}
      <span
        style={{
          float: "right",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          marginLeft: 10,
          marginTop: 5,
          fontSize: 10,
          color: c.dim,
        }}
      >
        {time}
        {mine && <CheckCheck size={13} color="#53bdeb" strokeWidth={2} />}
      </span>
    </div>
  );
  return (
    <Frame
      env={env}
      palette={palette}
      title="WhatsApp"
      icon={<span style={{ width: 14, height: 14, borderRadius: 4, background: "#25d366" }} />}
      style={style}
    >
      <div style={{ display: "flex", height: "100%", fontSize: 12.5 }}>
        {/* Chat list */}
        <div
          style={{
            width: 270,
            borderRight: `1px solid ${c.line}`,
            background: c.pane,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", padding: "12px 14px 8px" }}>
            <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Chats</span>
            <SquarePen size={16} color={c.dim} {...icon} />
            <EllipsisVertical size={16} color={c.dim} style={{ marginLeft: 14 }} {...icon} />
          </div>
          <div
            style={{
              margin: "0 12px 8px",
              height: 30,
              borderRadius: 8,
              background: c.head,
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingInline: 12,
              color: c.dim,
              fontSize: 12,
            }}
          >
            <Search size={13} {...icon} /> Search or start a new chat
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
            {["All", "Unread", "Favourites", "Groups"].map((chip, index) => (
              <span
                key={chip}
                style={{
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11.5,
                  background: index === 0 ? (d ? "#103529" : "#d9fdd3") : c.head,
                  color: index === 0 ? (d ? "#25d366" : "#008069") : c.dim,
                }}
              >
                {chip}
              </span>
            ))}
          </div>
          {CHATS.map((chat, index) => {
            const last = index === 0 && sent ? CLEAN : chat.last;
            return (
              <div
                key={chat.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: index === 0 ? c.selected : undefined,
                }}
              >
                <Avatar name={chat.name} color={chat.color} size={36} />
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderBottom: `1px solid ${index === 0 ? "transparent" : c.line}`,
                    paddingBottom: 6,
                  }}
                >
                  <div style={{ display: "flex" }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{chat.name}</span>
                    <span style={{ fontSize: 10.5, color: c.dim }}>
                      {index === 0 && sent ? "9:41 PM" : chat.time}
                    </span>
                  </div>
                  <div
                    style={{
                      color: c.dim,
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {last}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              height: 50,
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingInline: 14,
              background: c.head,
              flexShrink: 0,
            }}
          >
            <Avatar name="Asha Rao" color="#e5484d" size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Asha Rao</div>
              <div style={{ fontSize: 11, color: c.dim }}>online</div>
            </div>
            <Video size={17} color={c.dim} {...icon} />
            <Phone size={15} color={c.dim} style={{ marginLeft: 14 }} {...icon} />
            <Search size={15} color={c.dim} style={{ marginLeft: 14 }} {...icon} />
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              gap: 6,
              padding: "14px 40px",
              background: c.chat,
              backgroundImage: d
                ? "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)"
                : "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          >
            <span
              style={{
                alignSelf: "center",
                fontSize: 10.5,
                padding: "3px 10px",
                borderRadius: 7,
                background: c.inBubble,
                color: c.dim,
                marginBottom: 6,
              }}
            >
              TODAY
            </span>
            {bubble("How's the build going?", false, "9:31 PM")}
            {bubble("Is the demo ready for tomorrow?", false, "9:38 PM")}
            {sent &&
              bubble(CLEAN, true, "9:41 PM", {
                opacity: ease(t, sendAt, 200),
                transform: `translateY(${(1 - ease(t, sendAt, 260)) * 10}px)`,
              })}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "8px 14px",
              background: c.head,
              flexShrink: 0,
            }}
          >
            <Plus size={19} color={c.dim} {...icon} />
            <Smile size={18} color={c.dim} {...icon} />
            <div
              style={{
                flex: 1,
                minHeight: 34,
                display: "flex",
                alignItems: "center",
                padding: "6px 12px",
                borderRadius: 8,
                background: c.input,
                color: draft ? c.fg : c.dim,
                boxSizing: "border-box",
                lineHeight: 1.4,
              }}
            >
              {draft ? (
                CLEAN
              ) : (
                <>
                  {t >= focusAt && <Caret t={t} color={c.fg} />}
                  Type a message
                </>
              )}
            </div>
            {draft ? (
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  background: c.green,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ArrowRight size={16} color="#fff" strokeWidth={2.2} />
              </span>
            ) : (
              <Mic size={18} color={c.dim} {...icon} />
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}
