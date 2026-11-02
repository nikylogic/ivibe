// SPDX-License-Identifier: AGPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { CLEAN, FIX_PROMPT, ProofConsole, ProofPage, STRUCTURED } from "./apps.tsx";
import { Waveform } from "./hud.tsx";
import { ease, MONO } from "./kit.tsx";
import type { Env } from "./kit.tsx";
import { SAID } from "./said.ts";
import type { Mode } from "./said.ts";

/**
 * The demo on phones and upright tablets, where a whole desktop would be too small to read: each
 * mode told in three steps, in real text at a readable size. It runs on the same clock as the
 * desktop demo (`t`, ms into the mode), so `?mode=fix&t=8000` holds one of its frames too.
 */

type Step = { at: number; title: string; note: string };

const STEPS: Record<Mode, Step[]> = {
  fix: [
    { at: 0, title: "Show the bug", note: "Say what’s wrong while you show it." },
    {
      at: 7000,
      title: "iVibe writes the prompt",
      note: "Secrets are hidden on your device first.",
    },
    { at: 14_500, title: "Pasted into Claude Code", note: "With 2 screenshots as proof." },
  ],
  prompt: [
    { at: 0, title: "Say your idea", note: "In your own words, ums included." },
    { at: 6000, title: "iVibe writes the prompt", note: "Clear and structured." },
    { at: 12_000, title: "Pasted into Claude", note: "Right where you were typing." },
  ],
  dictate: [
    { at: 0, title: "Just talk", note: "In any app." },
    { at: 5500, title: "iVibe cleans it up", note: "The ums and false starts go." },
    { at: 10_000, title: "Pasted into WhatsApp", note: "Your words, ready to send." },
  ],
};

/** Under this card height, the page with the bug shows only what matters. */
const COMPACT_BELOW = 460;

export const STORY_MS: Record<Mode, number> = { fix: 19_000, prompt: 16_000, dictate: 14_000 };

const stepIndex = (mode: Mode, t: number) => {
  const steps = STEPS[mode];
  let index = 0;
  for (let next = 1; next < steps.length; next += 1) if (t >= steps[next]!.at) index = next;
  return index;
};

/** Words a person says but wouldn't write. */
const FILLER = /(\buh,?\s|\bum,?\s|\blike,\s|\bso,\s|\boh and,\s|,\si guess)/gi;
/** Where the desktop demo's words begin, moved up to just after the step starts. */
const leadIn = (mode: Mode) => SAID[mode][0]!.at - 300;

const LINE = "color-mix(in srgb, var(--color-text-primary) 12%, transparent)";
const PILL = "rgba(15, 14, 13, 0.94)";
const PILL_TEXT = "#f2efe8";
const panel: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  background: "var(--color-background-surface)",
  padding: 12,
  fontSize: 14,
  lineHeight: 1.45,
  color: "var(--color-text-primary)",
};

function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        alignSelf: "center",
        flexShrink: 0,
        minHeight: 38,
        maxWidth: "100%",
        padding: "6px 14px",
        borderRadius: 999,
        background: PILL,
        color: PILL_TEXT,
        fontSize: 13,
        lineHeight: 1.25,
      }}
    >
      {children}
    </div>
  );
}

function Listening({ mode, t }: { mode: Mode; t: number }) {
  return (
    <Pill>
      <Waveform t={t + leadIn(mode)} segments={SAID[mode]} />
    </Pill>
  );
}

function Working({ label }: { label: string }) {
  return <Pill>{label}</Pill>;
}

function Pasted({ label }: { label: string }) {
  return (
    <Pill>
      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
      {label}
    </Pill>
  );
}

/** What's been said so far, with the words that won't survive dimmed or struck out. */
function Transcript({
  mode,
  t,
  striking = false,
  fillWidth,
  givesWay = false,
}: {
  mode: Mode;
  t: number;
  striking?: boolean;
  /** When the words are the whole picture: they fill the card, larger, at this width. */
  fillWidth?: number;
  /** On a tight card it gives up its room first, keeping the newest words. */
  givesWay?: boolean;
}) {
  const said = SAID[mode].filter((segment) => t + leadIn(mode) >= segment.at);
  const text = said.map((segment) => segment.text).join(" ");
  return (
    <div
      style={
        fillWidth
          ? {
              ...panel,
              flex: "1 1 auto",
              minHeight: 0,
              overflow: "hidden",
              fontSize: Math.min(22, Math.max(16, fillWidth / 18)),
              lineHeight: 1.4,
            }
          : givesWay
            ? {
                ...panel,
                fontSize: 15,
                flex: "0 1 auto",
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                maskImage: "linear-gradient(to bottom, transparent, black 14px)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent, black 14px)",
              }
            : { ...panel, fontSize: 15, flexShrink: 0 }
      }
    >
      <div style={{ flexShrink: 0 }}>
        {text.split(FILLER).map((part, index) =>
          index % 2 === 1 ? (
            <span
              key={index}
              style={{
                opacity: 0.55,
                textDecorationLine: striking ? "line-through" : undefined,
              }}
            >
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
        {/* Keeps the box from jumping as the words arrive. */}
        {!text && <span style={{ opacity: 0.55 }}>Listening…</span>}
      </div>
    </div>
  );
}

/** The page with the bug: Save does nothing, and the console says why. */
function BugPage({ t, compact }: { t: number; compact: boolean }) {
  const tapped = ease(t, 1400, 300) * (1 - ease(t, 2100, 300));
  const errorShown = ease(t, 2600);
  return (
    <div
      style={{
        ...panel,
        flex: compact ? "1 0 auto" : "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {!compact && (
        <>
          <div style={{ fontWeight: 600 }}>Edit profile</div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${LINE}`,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Building things on weekends.
          </div>
        </>
      )}
      <div
        style={{
          alignSelf: "flex-start",
          padding: "5px 16px",
          borderRadius: 8,
          background: "#5146e5",
          color: "#fff",
          fontWeight: 500,
          transform: `scale(${1 - tapped * 0.06})`,
          outline: errorShown > 0 ? "2px solid #e5484d" : "none",
          outlineOffset: 3,
        }}
      >
        Save
      </div>
      <div
        style={{
          marginTop: 2,
          padding: "6px 10px",
          borderRadius: 8,
          background: "rgba(229, 72, 77, 0.14)",
          color: "#e5484d",
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.4,
          opacity: errorShown,
        }}
      >
        TypeError: can’t read “map”
      </div>
    </div>
  );
}

/** Each line of a result appears in turn, as the prompt gets written. */
function Reveal({ t, children }: { t: number; children: ReactNode[] }) {
  return (
    <>
      {children.map((child, index) => (
        <div key={index} style={{ opacity: ease(t, 1500 + index * 500) }}>
          {child}
        </div>
      ))}
    </>
  );
}

function Scrollless({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...panel,
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        // Where a very short screen can't fit it all, the text fades out, not cuts off.
        maskImage: "linear-gradient(to bottom, black calc(100% - 18px), transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 18px), transparent)",
      }}
    >
      {children}
    </div>
  );
}

function Shots({ dark, width }: { dark: boolean; width: number }) {
  const gap = 8;
  const scale = Math.min(1, (width - gap) / 2 / 156);
  return (
    <div style={{ display: "flex", gap, flexShrink: 0, height: 98 * scale }}>
      {[ProofPage, ProofConsole].map((Shot, index) => (
        <div
          key={index}
          style={{
            width: 156 * scale,
            height: 98 * scale,
            flexShrink: 0,
          }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", display: "flex" }}>
            <Shot dark={dark} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FixPrompt({ t }: { t: number }) {
  return (
    <Scrollless>
      <Reveal t={t}>
        {FIX_PROMPT.map((row) => (
          <span key={row.text} style={{ fontWeight: row.strong ? 600 : 400 }}>
            {row.text}
          </span>
        ))}
      </Reveal>
    </Scrollless>
  );
}

function StructuredPrompt({ t, lines = STRUCTURED.length }: { t: number; lines?: number }) {
  return (
    <Scrollless>
      <Reveal t={t}>
        {STRUCTURED.slice(0, lines).map((row) => (
          <span
            key={row.text}
            style={{
              fontWeight: row.kind === "title" ? 600 : 400,
              opacity: row.kind === "label" ? 0.65 : 1,
            }}
          >
            {row.text}
          </span>
        ))}
      </Reveal>
    </Scrollless>
  );
}

/** What each step shows, given the time since that step began. */
function picture(
  mode: Mode,
  step: number,
  t: number,
  env: Env,
  width: number,
  compact: boolean,
): ReactNode {
  const dark = env.dark;
  if (mode === "fix") {
    if (step === 0) {
      return (
        <>
          <BugPage t={t} compact={compact} />
          <Transcript mode={mode} t={t} givesWay={compact} />
          <Listening mode={mode} t={t} />
        </>
      );
    }
    if (step === 1) {
      return (
        <>
          <FixPrompt t={t} />
          <div style={{ flexShrink: 0, opacity: ease(t, 3000) }}>
            <Shots dark={dark} width={width} />
          </div>
          <Working label={t < 1500 ? "Hiding secrets on this device…" : "Writing your prompt…"} />
        </>
      );
    }
    return (
      <>
        <div
          style={{
            ...panel,
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "#141311",
            color: "#f2efe8",
            fontFamily: MONO,
            fontSize: 13,
          }}
        >
          <div style={{ opacity: 0.6 }}>Claude Code</div>
          <div style={{ fontWeight: 600 }}>&gt; {FIX_PROMPT[0]!.text}</div>
          <div style={{ color: "#b9a8ff" }}>[Image #1] [Image #2]</div>
          {FIX_PROMPT.slice(1).map((row) => (
            <div key={row.text}>{row.text}</div>
          ))}
        </div>
        <Shots dark={dark} width={width} />
        <Pasted label="Pasted into Claude Code" />
      </>
    );
  }

  if (mode === "prompt") {
    if (step === 0) {
      return (
        <>
          <Transcript mode={mode} t={t} fillWidth={width} />
          <Listening mode={mode} t={t} />
        </>
      );
    }
    if (step === 1) {
      return (
        <>
          <StructuredPrompt t={t} />
          <Working label="Writing your prompt…" />
        </>
      );
    }
    return (
      <>
        <StructuredPrompt t={99_999} />
        <Pasted label="Pasted into Claude" />
      </>
    );
  }

  if (step === 0) {
    return (
      <>
        <Transcript mode={mode} t={t} fillWidth={width} />
        <Listening mode={mode} t={t} />
      </>
    );
  }
  if (step === 1) {
    return (
      <>
        <Transcript mode={mode} t={99_999} striking />
        <div
          style={{
            ...panel,
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            fontSize: Math.min(22, Math.max(15, width / 20)),
            opacity: ease(t, 1500),
          }}
        >
          {CLEAN}
        </div>
        <Working label="Cleaning up your words…" />
      </>
    );
  }
  return (
    <>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 8,
          overflow: "hidden",
          padding: 10,
          borderRadius: 12,
          background: dark ? "#0b141a" : "#efeae2",
          fontSize: 14,
          lineHeight: 1.4,
          color: dark ? "#e9edef" : "#111b21",
        }}
      >
        <div style={{ marginBottom: "auto", fontWeight: 600 }}>Asha</div>
        <div
          style={{
            alignSelf: "flex-start",
            maxWidth: "85%",
            padding: "8px 12px",
            borderRadius: 12,
            background: dark ? "#202c33" : "#ffffff",
          }}
        >
          Is the demo ready for tomorrow?
        </div>
        <div
          style={{
            alignSelf: "flex-end",
            maxWidth: "85%",
            padding: "8px 12px",
            borderRadius: 12,
            background: dark ? "#144d37" : "#d9fdd3",
            color: dark ? "#e9edef" : "#111b21",
          }}
        >
          {CLEAN}
        </div>
      </div>
      <Pasted label="Pasted into WhatsApp" />
    </>
  );
}

export function Story({
  mode,
  t,
  env,
  width,
  height,
  sideways,
}: {
  mode: Mode;
  t: number;
  env: Env;
  /** The card's width, for what has to be sized to fit it. */
  width: number;
  height: number;
  /** A phone on its side: the words sit beside the picture, not under it. */
  sideways: boolean;
}) {
  const index = stepIndex(mode, t);
  const step = STEPS[mode][index]!;
  // Without motion, a step is simply shown finished.
  const since = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? Number.MAX_SAFE_INTEGER
    : t - step.at;
  const shown = ease(since, 0, 320);
  const padding = sideways ? 12 : 16;
  const words = sideways ? Math.round(width * 0.36) : width;
  const pictureWidth = (sideways ? width - words - padding : width) - padding * 2 - 26;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: sideways ? "row-reverse" : "column",
        gap: sideways ? padding : 14,
        padding,
        background:
          "color-mix(in srgb, var(--color-text-primary) 4%, var(--color-background-surface))",
        color: "var(--color-text-primary)",
      }}
    >
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: shown,
          transform: `translateY(${(1 - shown) * 8}px)`,
        }}
      >
        {picture(mode, index, since, env, pictureWidth, sideways || height < COMPACT_BELOW)}
      </div>
      <div
        style={{
          flex: "none",
          width: sideways ? words : undefined,
          display: "flex",
          flexDirection: "column",
          justifyContent: sideways ? "center" : undefined,
          gap: 4,
        }}
      >
        <div
          aria-live="polite"
          style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: sideways ? 22 : 26,
            lineHeight: 1.1,
          }}
        >
          {step.title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.4, color: "var(--color-text-secondary)" }}>
          {step.note}
        </div>
      </div>
    </div>
  );
}

/** One dot for each step of the current mode. Tapping one goes straight to that step. */
export function StoryDots({
  mode,
  t,
  onJump,
}: {
  mode: Mode;
  t: number;
  onJump: (t: number) => void;
}) {
  const current = stepIndex(mode, t);
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {STEPS[mode].map((step, index) => (
        <button
          key={step.title}
          type="button"
          aria-label={`Step ${index + 1} of ${STEPS[mode].length}: ${step.title}`}
          aria-current={index === current ? "step" : undefined}
          onClick={() => onJump(step.at)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 44,
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "var(--color-text-primary)",
              opacity: index === current ? 0.85 : 0.22,
              transition: "opacity 200ms ease",
            }}
          />
        </button>
      ))}
    </div>
  );
}
