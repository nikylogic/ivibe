// SPDX-License-Identifier: AGPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO, SANS, SERIF } from "./theme.ts";

/** 0 → 1 with the app's soft settle, starting at `from`. */
export function useEnter(from: number, damping = 18): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - from, fps, config: { damping, mass: 0.7 } });
}

export const fade = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** The first `count` characters of a text, as it is typed between two frames. */
export function typed(text: string, frame: number, from: number, to: number): string {
  const count = Math.round(
    interpolate(frame, [from, to], [0, text.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  return text.slice(0, count);
}

/** A macOS-style window: title bar with three dots, rounded, softly lifted. */
export function Window({
  title,
  dark = false,
  style,
  children,
}: {
  title: string;
  dark?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        borderRadius: 18,
        overflow: "hidden",
        background: dark ? C.terminal : "#ffffff",
        boxShadow: C.shadow,
        border: `1px solid ${dark ? "#ffffff14" : C.border}`,
        fontFamily: SANS,
        ...style,
      }}
    >
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingInline: 18,
          background: dark ? "#1d1c19" : C.body,
          borderBottom: `1px solid ${dark ? "#ffffff10" : C.border}`,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
          <span key={color} style={{ width: 12, height: 12, borderRadius: 6, background: color }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            marginRight: 52,
            fontSize: 15,
            color: dark ? "#8f8a80" : C.secondary,
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/** The compact recording pill: a dark capsule with a live dotted waveform. */
export function Pill({
  state,
  label,
}: {
  state: "listening" | "writing" | "done";
  label?: string;
}) {
  const frame = useCurrentFrame();
  if (state === "done") {
    return (
      <div style={pillBox(18)}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.accentGreen}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span style={{ fontSize: 19, fontWeight: 550 }}>{label}</span>
      </div>
    );
  }
  if (state === "writing") {
    const shimmer = (frame * 2.4) % 260;
    return (
      <div style={pillBox(22)}>
        <span
          style={{
            fontSize: 19,
            fontWeight: 550,
            backgroundImage: `linear-gradient(90deg, #8f8a80 ${shimmer - 60}px, #fdfcf9 ${shimmer}px, #8f8a80 ${shimmer + 60}px)`,
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          {label ?? "Writing the prompt…"}
        </span>
      </div>
    );
  }
  const dots = 15;
  return (
    <div style={{ ...pillBox(26), gap: 6 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 5,
          background: C.record,
          marginRight: 8,
          opacity: 0.55 + 0.45 * Math.sin(frame / 5),
        }}
      />
      {Array.from({ length: dots }, (_, index) => {
        const center = 1 - Math.abs(index - (dots - 1) / 2) / ((dots - 1) / 2);
        const voice = Math.abs(Math.sin(frame / 3.1 + index * 0.9) * Math.sin(frame / 7.3 + index));
        const height = 4 + center * voice * 26;
        return (
          <span
            key={index}
            style={{ width: 4, height, borderRadius: 2, background: C.pillText, opacity: 0.9 }}
          />
        );
      })}
    </div>
  );
}

function pillBox(paddingInline: number): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    height: 56,
    paddingInline,
    borderRadius: 28,
    background: C.pill,
    color: C.pillText,
    fontFamily: SANS,
    boxShadow: "0 18px 40px #00000033",
  };
}

/** A pointer that glides between points and presses on `clickAt`. */
export function Cursor({
  path,
  clickAt,
}: {
  path: { frame: number; x: number; y: number }[];
  clickAt?: number;
}) {
  const frame = useCurrentFrame();
  const frames = path.map((point) => point.frame);
  const opts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const x = interpolate(
    frame,
    frames,
    path.map((point) => point.x),
    opts,
  );
  const y = interpolate(
    frame,
    frames,
    path.map((point) => point.y),
    opts,
  );
  const pressed = clickAt !== undefined && frame >= clickAt && frame < clickAt + 6;
  const ring = clickAt === undefined ? 0 : fade(frame, clickAt, clickAt + 14);
  return (
    <>
      {clickAt !== undefined && ring > 0 && ring < 1 && (
        <div
          style={{
            position: "absolute",
            left: x - 28 * ring - 2,
            top: y - 28 * ring - 2,
            width: 56 * ring + 4,
            height: 56 * ring + 4,
            borderRadius: "50%",
            border: `3px solid ${C.ink}`,
            opacity: 1 - ring,
          }}
        />
      )}
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x - 4,
          top: y - 2,
          transform: `scale(${pressed ? 0.88 : 1})`,
          filter: "drop-shadow(0 2px 3px #0005)",
        }}
      >
        <path
          d="M4 2 L4 19 L8.5 14.8 L11.4 21.2 L14.2 20 L11.3 13.7 L17.5 13.7 Z"
          fill="#111"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}

/** Keycaps for a shortcut, e.g. ["Ctrl", "Caps Lock"]. */
export function Keys({ keys, pressed = false }: { keys: string[]; pressed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {keys.map((key, index) => (
        <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {index > 0 && <span style={{ color: C.faint, fontSize: 20 }}>+</span>}
          <span
            style={{
              fontFamily: SANS,
              fontSize: 20,
              fontWeight: 550,
              color: C.ink,
              padding: "8px 14px",
              borderRadius: 10,
              background: "#fff",
              border: `1px solid ${C.borderStrong}`,
              boxShadow: pressed ? "0 1px 0 #d9d4c9" : "0 3px 0 #d9d4c9",
              transform: pressed ? "translateY(2px)" : "none",
            }}
          >
            {key}
          </span>
        </span>
      ))}
    </span>
  );
}

/** The mode's name in the app's serif, with its shortcut. */
export function ModeTitle({
  name,
  line,
  keys,
  pressed,
}: {
  name: string;
  line: string;
  keys: string[];
  pressed: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: SERIF, fontSize: 84, lineHeight: 1, color: C.ink }}>
        {name}
        <span style={{ fontStyle: "italic", color: C.secondary }}>. {line}</span>
      </div>
      <div>
        <Keys keys={keys} pressed={pressed} />
      </div>
    </div>
  );
}

export const mono: CSSProperties = { fontFamily: MONO };
