// SPDX-License-Identifier: AGPL-3.0-only

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
