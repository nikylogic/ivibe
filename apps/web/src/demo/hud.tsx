// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import { currentTone, onTone, speech, TONES } from "./voice.ts";
import type { Tone } from "./voice.ts";
import type { ReactNode } from "react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Theme } from "@astryxdesign/core/theme";
import { CheckCircle2, ChevronDown, Copy, ShieldCheck, Square, X } from "lucide-react";
import { ivibeTheme } from "../theme.ts";
import { ease } from "./kit.tsx";

/**
 * The app's pill in its "full" style (apps/desktop/src/renderer/hud/main.tsx), drawn from a
 * timeline instead of the recorder: live transcript, waveform and clock while you talk, then the
 * working line, then where the result went. Sizes, colours and words match the app.
 */

const ink = "#f2efe8";
const muted = "#a39e94";

/** A transcript sentence: shown as "···" from `at`, as text from `final`. */
export type Segment = { text: string; at: number; final: number };

export type HudPhase =
  | { kind: "listening"; since: number; hint: string; segments: Segment[] }
  | { kind: "working"; label: string }
  | { kind: "pasted"; label: string }
  | { kind: "expanded"; label: string; title: string; shots: ReactNode[]; text: string };

/** How loud the voice is at time t: speech-like while a sentence is being said, quiet between. */
function level(t: number, segments: Segment[]): number {
  const speaking = segments.some((segment) => t >= segment.at - 150 && t < segment.final - 250);
  if (!speaking) return 0.05 + 0.03 * Math.abs(Math.sin(t / 400));
  const syllable = Math.abs(Math.sin(t / 85) * Math.sin(t / 31 + 1.3));
  const phrase = 0.55 + 0.45 * Math.abs(Math.sin(t / 700));
  return Math.min(1, 0.18 + syllable * phrase * 0.85);
}

/** The full pill's waveform: the last 26 levels scrolling left, like useLevelHistory. */
function Waveform({ t, segments }: { t: number; segments: Segment[] }) {
  const bars = 26;
  const step = 90;
  const now = Math.floor(t / step) * step;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 2.5, height: 24 }}>
      {Array.from({ length: bars }, (_, index) => {
        const at = now - (bars - 1 - index) * step;
        const height = Math.max(3, level(at, segments) * 24);
        return (
          <span
            key={index}
            style={{ width: 3, height, borderRadius: 999, background: ink, opacity: 0.92 }}
          />
        );
      })}
    </span>
  );
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Caption({ t, hint, segments }: { t: number; hint: string; segments: Segment[] }) {
  const said = segments.filter((segment) => t >= segment.at);
  return (
    <div
      style={{
        minHeight: 22,
        maxHeight: 44,
        paddingTop: 14,
        paddingInline: 18,
        fontSize: 14,
        lineHeight: "22px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maskImage: "linear-gradient(to bottom, transparent 0, black 22px)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 22px)",
      }}
    >
      {said.length === 0 ? (
        <span style={{ color: muted }}>{hint}</span>
      ) : (
        <span>
          {said.map((segment) =>
            t >= segment.final ? (
              <span key={segment.at}>{segment.text} </span>
            ) : (
              <span key={segment.at} style={{ color: muted, letterSpacing: "0.1em" }}>
                ···{" "}
              </span>
            ),
          )}
        </span>
      )}
    </div>
  );
}

const row = {
  height: 52,
  display: "flex",
  alignItems: "center",
  gap: 12,
  paddingInlineStart: 18,
  paddingInlineEnd: 8,
} as const;

const status = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  minWidth: 0,
  flex: 1,
} as const;

const pillButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  paddingInline: 14,
  borderRadius: 999,
  background: ink,
  color: "#121110",
  fontSize: 13,
  fontWeight: 600,
  flexShrink: 0,
} as const;

/** The pill. `pressed` darkens View while the pointer clicks it. */
export function Hud({
  t,
  phase,
  pressed = false,
}: {
  t: number;
  phase: HudPhase;
  pressed?: boolean;
}) {
  const expanded = phase.kind === "expanded";
  let controls: ReactNode;
  if (phase.kind === "listening") {
    controls = (
      <div style={row}>
        <span
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: 999,
            background: "#e5484d",
            boxShadow: `0 0 0 ${3 + Math.abs(Math.sin(t / 500)) * 2}px rgba(229, 72, 77, 0.18)`,
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <Waveform t={t} segments={phase.segments} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
          {clock(t - phase.since)}
        </span>
        <span style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconButton
            label="Cancel recording"
            variant="ghost"
            size="sm"
            icon={<X size={16} strokeWidth={2} />}
          />
          <IconButton
            label="Stop and paste"
            variant="primary"
            size="sm"
            icon={<Square size={11} strokeWidth={0} fill="currentColor" />}
          />
        </span>
      </div>
    );
  } else if (phase.kind === "working") {
    controls = (
      <div style={row}>
        <div style={status}>
          <Spinner size="sm" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {phase.label}
          </span>
        </div>
      </div>
    );
  } else {
    controls = (
      <div style={row}>
        <div style={status}>
          <CheckCircle2 size={17} strokeWidth={2} color="#6fcf8e" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {phase.label}
          </span>
        </div>
        <span style={{ ...pillButton, filter: pressed ? "brightness(0.85)" : undefined }}>
          {expanded ? "Hide" : "View"}
        </span>
        <IconButton
          label="Dismiss"
          variant="ghost"
          size="sm"
          icon={<X size={16} strokeWidth={2} />}
        />
      </div>
    );
  }

  return (
    <Theme theme={ivibeTheme} mode="dark">
      <div
        style={{
          width: expanded ? 520 : 420,
          transition: "width 260ms cubic-bezier(0.2, 0, 0, 1)",
          display: "flex",
          flexDirection: "column",
          borderRadius: 22,
          background: "rgba(15, 14, 13, 0.94)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 14px 40px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.2)",
          color: ink,
          overflow: "hidden",
          fontFamily: '"Inter Variable", -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {phase.kind === "expanded" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              paddingTop: 16,
              paddingInline: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{phase.title}</span>
              <IconButton
                label="Collapse"
                variant="ghost"
                size="sm"
                icon={<ChevronDown size={16} strokeWidth={2} />}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>{phase.shots}</div>
            <pre
              style={{
                margin: 0,
                maxHeight: 112,
                overflow: "hidden",
                padding: 12,
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.05)",
                color: "#e6e2da",
                fontFamily: "inherit",
                fontSize: 12.5,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {phase.text}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Copy", icon: <Copy size={14} strokeWidth={2} /> },
                { label: "Open in iVibe", icon: null },
              ].map((action) => (
                <span
                  key={action.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: 30,
                    paddingInline: 12,
                    borderRadius: 999,
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {action.icon}
                  {action.label}
                </span>
              ))}
            </div>
          </div>
        )}
        {phase.kind === "listening" && (
          <Caption t={t} hint={phase.hint} segments={phase.segments} />
        )}
        {controls}
      </div>
    </Theme>
  );
}

/** The amber note above the pill when something was hidden before leaving the device. */
export function Toast({ t, at, children }: { t: number; at: number; children: ReactNode }) {
  const shown = ease(t, at, 260) * (1 - ease(t, at + 2800, 260));
  if (shown <= 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        paddingInline: 12,
        borderRadius: 999,
        background: "rgba(54, 38, 14, 0.95)",
        border: "1px solid rgba(245, 185, 113, 0.35)",
        color: "#f8d5a3",
        fontSize: 12.5,
        fontWeight: 500,
        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.3)",
        opacity: shown,
        transform: `translateY(${(1 - shown) * 6}px)`,
      }}
    >
      <ShieldCheck size={15} strokeWidth={2} />
      {children}
    </div>
  );
}

/** The bars' shape in the compact pill: tallest in the middle (shared/voice-wave.tsx). */
export const envelope = (index: number, count: number) => {
  const x = (index - (count - 1) / 2) / ((count - 1) / 2);
  return 0.5 + 0.5 * Math.cos((x * Math.PI) / 2) ** 1.4;
};

/**
 * A calm, continuous voice level: a few slow waves layered like the rise and fall of speech.
 * No hard pauses or jagged syllables, since the hero shows these bars many times their size.
 */
export function talking(t: number): number {
  const s = t / 1000;
  const voice =
    0.5 +
    0.2 * Math.sin(s * 1.15) +
    0.12 * Math.sin(s * 2.7 + 1.1) +
    0.07 * Math.sin(s * 4.3 + 2.4);
  // Phrases swell and soften every few seconds.
  const breath = 0.78 + 0.22 * Math.sin(s * 0.42 - 0.6);
  return voice * breath;
}

export const BARS = 13;

export const BAR = 2.5;
export const TALLEST = 18;
/** The bar's pieces are drawn this many times larger and scaled down, so they stay crisp when the hero zooms in on them. */
const DETAIL = 16;

/**
 * The app's default, compact pill while you talk: a small capsule holding only a waveform of 13
 * bars that sway around the voice level (hud/compact.tsx). It animates itself, so it costs
 * nothing to the page around it, and only with transforms: each bar is two round caps that slide
 * apart and a strip between them that stretches, all moved by the graphics card without
 * repainting. That matters in the hero, which shows these bars many times their size. Their
 * brightness follows the `--wave` custom property, which the hero dims inside the pill.
 */
export function CompactPill() {
  const parts = useRef<
    { top: HTMLSpanElement | null; mid: HTMLSpanElement | null; bottom: HTMLSpanElement | null }[]
  >(Array.from({ length: BARS }, () => ({ top: null, mid: null, bottom: null })));
  const glow = useRef<HTMLSpanElement>(null);
  const [tone, setTone] = useState<Tone>(currentTone);
  useEffect(() => onTone(setTone), []);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shown = Array.from({ length: BARS }, () => 0.3);
    let raf = 0;
    let last = performance.now();
    const paint = (time: number) => {
      const dt = Math.min(64, time - last) / 1000;
      last = time;
      // A quiet hum, and the headline's words when it says one.
      const spoken = still ? 0 : speech(time);
      const level = still ? 0.6 : Math.min(1, Math.max(0.5, talking(time) * 0.85) + spoken * 0.5);
      if (glow.current) glow.current.style.opacity = (0.55 + 0.45 * spoken).toFixed(3);
      for (let index = 0; index < BARS; index++) {
        // A ripple that travels across the bars, so neighbours move together like a real wave.
        const sway = still
          ? 1
          : 0.8 +
            0.16 * Math.sin((time / 1000) * 1.9 - index * 0.55) +
            0.06 * Math.sin((time / 1000) * 3.1 + index * 1.7);
        const want = level * envelope(index, BARS) * sway;
        shown[index]! += (want - shown[index]!) * (1 - Math.exp(-dt * (7 + 10 * spoken)));
        const stretch = Math.max(0, shown[index]! * TALLEST - BAR);
        const { top, mid, bottom } = parts.current[index]!;
        if (top)
          top.style.transform = `translate3d(0, ${(-stretch / 2).toFixed(3)}px, 0) scale(${1 / DETAIL})`;
        if (bottom)
          bottom.style.transform = `translate3d(0, ${(stretch / 2).toFixed(3)}px, 0) scale(${1 / DETAIL})`;
        if (mid)
          mid.style.transform = `scale3d(${1 / DETAIL}, ${(stretch / DETAIL).toFixed(4)}, 1)`;
      }
      if (!still) raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);
  const piece = {
    position: "absolute",
    left: (BAR - BAR * DETAIL) / 2,
    width: BAR * DETAIL,
    background: ink,
    willChange: "transform",
  } as const;
  return (
    <div
      style={{
        position: "relative",
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        gap: BAR,
        paddingInline: 14,
        borderRadius: 999,
        background:
          "radial-gradient(120% 140% at 50% 30%, rgba(255, 244, 228, 0.07), transparent 60%), rgb(15, 14, 13)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/*
        The light inside the pill, behind the bars: tinted by the mode the headline shows, and
        brighter while it speaks. Still layers that only fade, so they cost nothing per frame.
      */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-2px -4px",
          // The light stays even where the hero dims the bars.
          opacity: "var(--wave-light, calc(0.5 + 0.5 * var(--wave, 1)))",
        }}
      >
        <span ref={glow} style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
          {(Object.keys(TONES) as Tone[]).map((name) => (
            <span
              key={name}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 999,
                background: `radial-gradient(ellipse closest-side, rgba(${TONES[name]}, 0.5), rgba(${TONES[name]}, 0.16) 55%, transparent)`,
                opacity: name === tone ? 1 : 0,
                transition: "opacity 1.4s ease",
              }}
            />
          ))}
        </span>
      </span>
      {Array.from({ length: BARS }, (_, index) => {
        const slot = parts.current[index]!;
        return (
          <span
            key={index}
            style={{ position: "relative", width: BAR, height: TALLEST, opacity: "var(--wave, 1)" }}
          >
            <span
              ref={(element) => {
                slot.mid = element;
              }}
              style={{
                ...piece,
                top: TALLEST / 2 - DETAIL / 2,
                height: DETAIL,
                transform: `scale3d(${1 / DETAIL}, 0, 1)`,
              }}
            />
            {(["top", "bottom"] as const).map((end) => (
              <span
                key={end}
                ref={(element) => {
                  slot[end] = element;
                }}
                style={{
                  ...piece,
                  top: (TALLEST - BAR * DETAIL) / 2,
                  height: BAR * DETAIL,
                  borderRadius: "50%",
                  transform: `scale(${1 / DETAIL})`,
                }}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}
