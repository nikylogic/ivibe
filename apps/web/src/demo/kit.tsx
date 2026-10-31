// SPDX-License-Identifier: AGPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import { Kbd } from "@astryxdesign/core/Kbd";

/** The demo desktop: a macOS one for Mac visitors, Windows 11 for everyone else. */
export type Os = "mac" | "windows";
export type Env = { os: Os; dark: boolean };

/** The stage is laid out at this size and scaled to fit. */
export const W = 1040;
export const H = 620;

export const SANS = '"Inter Variable", -apple-system, "Segoe UI", sans-serif';
export const MONO = '"Cascadia Code", "SF Mono", Menlo, Consolas, monospace';

/** Where windows may start, under the menu bar on macOS. */
export const top = (env: Env, y: number) => (env.os === "mac" ? y + 16 : y);

// ---------------------------------------------------------------------------------------------
// Timing: everything is a function of t, ms into the current mode.

/** 0 → 1 over [start, start + ms], eased out. */
export function ease(t: number, start: number, ms = 360): number {
  const p = Math.min(1, Math.max(0, (t - start) / ms));
  return 1 - (1 - p) ** 3;
}

export const between = (t: number, start: number, end: number) => t >= start && t < end;

/** A window opening: scales up a touch and fades in. */
export function opening(t: number, start: number): CSSProperties {
  const e = ease(t, start, 380);
  return {
    opacity: e,
    transform: `translateY(${(1 - e) * 12}px) scale(${0.965 + e * 0.035})`,
    visibility: t < start ? "hidden" : "visible",
  };
}

// ---------------------------------------------------------------------------------------------
// Window chrome.

export function TrafficLights() {
  return (
    <span style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
        <span
          key={color}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            background: color,
            boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.18)",
          }}
        />
      ))}
    </span>
  );
}

export function CaptionButtons({ color }: { color: string }) {
  const icon = (d: ReactNode) => (
    <span style={{ width: 46, height: "100%", display: "grid", placeItems: "center" }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1">
        {d}
      </svg>
    </span>
  );
  return (
    <span style={{ display: "flex", alignSelf: "stretch", flexShrink: 0 }}>
      {icon(<path d="M0 5h10" />)}
      {icon(<rect x="0.5" y="0.5" width="9" height="9" rx="1" />)}
      {icon(<path d="m0.5 0.5 9 9m0-9-9 9" />)}
    </span>
  );
}

export type Palette = { bar: string; bg: string; fg: string; dim: string; edge: string };

/**
 * A window as the OS draws it. `bar` replaces the plain title row (Chrome's tab strip, say); the
 * window controls are placed around it.
 */
export function Frame({
  env,
  palette,
  title,
  icon,
  bar,
  barHeight = 32,
  style,
  children,
}: {
  env: Env;
  palette: Palette;
  title?: string;
  icon?: ReactNode;
  bar?: ReactNode;
  barHeight?: number;
  style: CSSProperties;
  children: ReactNode;
}) {
  const mac = env.os === "mac";
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        borderRadius: mac ? 11 : 8,
        overflow: "hidden",
        background: palette.bg,
        color: palette.fg,
        border: `0.5px solid ${env.dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)"}`,
        boxShadow: mac
          ? "0 22px 70px rgba(0,0,0,0.32), 0 0 0 0.5px rgba(0,0,0,0.12)"
          : "0 16px 40px rgba(0,0,0,0.26)",
        fontFamily: SANS,
        ...style,
      }}
    >
      <div
        style={{
          height: barHeight,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: mac ? 13 : 12,
          background: palette.bar,
          fontSize: 12,
        }}
      >
        {mac && <TrafficLights />}
        {bar ?? (
          <span
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: mac ? "center" : "flex-start",
              marginRight: mac ? 66 : 0,
              fontWeight: mac ? 600 : 400,
              color: mac ? palette.dim : palette.fg,
            }}
          >
            {!mac && icon}
            {title}
          </span>
        )}
        {!mac && <CaptionButtons color={palette.fg} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// iVibe's own pieces: the pill and what you said.

export type PillState = "listening" | "writing" | "done";

/** The app's compact pill: listening (dotted waveform), writing (shimmer) or done (check). */
export function Pill({ t, state, label }: { t: number; state: PillState; label?: string }) {
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
    boxShadow: "0 10px 26px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(255,255,255,0.12)",
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
export function Caption({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 540,
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

/** A pointer gliding along [time, x, y] points, with a ring on each click. */
export function Cursor({
  t,
  path,
  clicks = [],
}: {
  t: number;
  path: [number, number, number][];
  clicks?: number[];
}) {
  let x = path[0]![1];
  let y = path[0]![2];
  for (let index = 1; index < path.length; index++) {
    const [time, nx, ny] = path[index]!;
    const [prev] = path[index - 1]!;
    const e = ease(t, prev, time - prev);
    x = x + (nx - x) * e;
    y = y + (ny - y) * e;
  }
  const click = clicks.find((at) => between(t, at, at + 380));
  const ring = click === undefined ? 0 : (t - click) / 380;
  const pressed = clicks.some((at) => between(t, at, at + 120));
  return (
    <>
      {ring > 0 && (
        <span
          style={{
            position: "absolute",
            left: x - 16 * ring,
            top: y - 16 * ring,
            width: 32 * ring,
            height: 32 * ring,
            borderRadius: "50%",
            background: "rgba(80, 120, 255, 0.25)",
            border: "1.5px solid rgba(80, 120, 255, 0.6)",
            opacity: 1 - ring,
          }}
        />
      )}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x - 4,
          top: y - 2,
          transform: `scale(${pressed ? 0.88 : 1})`,
          transformOrigin: "4px 2px",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,.4))",
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

/**
 * The shortcut, pressed: keys show, go down one after another (modifiers first), come back up,
 * and fade out once the pill has taken over.
 */
export function Keys({ combo, t, at }: { combo: string; t: number; at: number }) {
  const parts = combo.split("+");
  const shown = ease(t, at - 650, 240) * (1 - ease(t, at + 2000, 400));
  if (shown <= 0) return null;
  const release = at + 360;
  const ring = Math.min(1, Math.max(0, (t - at) / 450));
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 11px",
        borderRadius: 13,
        background: "color-mix(in srgb, var(--color-background-surface) 88%, transparent)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18), inset 0 0 0 0.5px rgba(0,0,0,0.08)",
        opacity: shown,
        transform: `translateY(${(1 - shown) * 8}px)`,
      }}
    >
      {ring > 0 && ring < 1 && (
        <span
          style={{
            position: "absolute",
            inset: -10 * ring,
            borderRadius: 13 + 10 * ring,
            border: "2px solid rgba(229, 72, 77, 0.55)",
            opacity: 1 - ring,
          }}
        />
      )}
      {parts.map((key, index) => {
        const down = between(t, at - (parts.length - 1 - index) * 130, release);
        return (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {index > 0 && (
              <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>+</span>
            )}
            <span
              style={{
                display: "inline-block",
                zoom: 1.35,
                transform: `translateY(${down ? 1.5 : 0}px) scale(${down ? 0.93 : 1})`,
                filter: down ? "brightness(0.9)" : "none",
                transition: "transform 70ms, filter 70ms",
              }}
            >
              <Kbd keys={key} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
