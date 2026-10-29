// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { AlertCircle, RotateCcw, Square, X } from "lucide-react";
import type { RecordingStatus } from "../../shared/ipc.ts";
import { withClass } from "../shared/shortcut.tsx";
import { formatClock } from "../shared/theme.tsx";
import { VoiceWave } from "../shared/voice-wave.tsx";

/**
 * The compact recording pill (D29): a small capsule with only a waveform while you talk. Hovering
 * it shows the time with Cancel and Stop. It grows into a short line only when something needs
 * reading (the last 10 seconds, no voice heard, an error); with the result it simply goes.
 */

const ink = "#f2efe8";
const muted = "#a39e94";
/** No voice for this long at the start of a recording: say which mic isn't hearing anything. */
export const SILENCE_HINT_MS = 2500;

const styles = stylex.create({
  capsule: {
    height: 36,
    maxWidth: 440,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(15, 14, 13, 0.94)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2)",
    color: ink,
    overflow: "hidden",
    transitionProperty: "width",
    transitionDuration: "var(--motion-layout)",
    transitionTimingFunction: "var(--motion-ease)",
    animationName: "ivibe-rise",
    animationDuration: "var(--motion-layout)",
    animationTimingFunction: "var(--motion-ease)",
  },
  content: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    height: "100%",
    paddingInline: 14,
    whiteSpace: "nowrap",
    animationName: "ivibe-fade",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },
  tight: { paddingInline: 6, gap: 6 },
  clock: {
    fontSize: 12.5,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
    color: muted,
    minWidth: 34,
  },
  clockWarning: { color: "#ff9c8a" },
  text: {
    fontSize: 12.5,
    fontWeight: 500,
    maxWidth: 330,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  warn: { color: "#f5b971" },
  // Where the result will go, on hover: "→ Claude Code".
  target: {
    fontSize: 12,
    color: muted,
    maxWidth: 130,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  button: {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 999,
    color: ink,
    backgroundColor: { default: "transparent", ":hover": "rgba(255, 255, 255, 0.1)" },
    cursor: "pointer",
    transitionProperty: "background-color",
    transitionDuration: "var(--motion-micro)",
  },
  stop: {
    backgroundColor: { default: ink, ":hover": "#ffffff" },
    color: "#121110",
  },
  // Working: the voice settles into a line with light running along it.
  line: {
    width: 56,
    height: 2,
    borderRadius: 999,
    backgroundImage:
      "linear-gradient(90deg, rgba(242,239,232,0.18) 0%, rgba(242,239,232,0.18) 35%, rgba(242,239,232,0.95) 50%, rgba(242,239,232,0.18) 65%, rgba(242,239,232,0.18) 100%)",
    backgroundSize: "300% 100%",
    animationName: "ivibe-shimmer",
    animationDuration: "1.4s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
});

/** "the clipboard" → "Clipboard": app names stay as they are. */
const destination = (name = "the clipboard") => {
  const bare = name.replace(/^the /, "");
  return bare[0]!.toUpperCase() + bare.slice(1);
};

function Action({
  label,
  onClick,
  children,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...withClass("no-drag", styles.button, primary && styles.stop)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** The capsule's width follows its content, so it glides between states instead of jumping. */
function useContentWidth(): [RefObject<HTMLDivElement | null>, number | undefined] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.ceil(element.getBoundingClientRect().width) + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });
  return [ref, width];
}

export function CompactPill({
  status,
  heardVoice,
  hovered,
}: {
  status: RecordingStatus;
  heardVoice: boolean;
  hovered: boolean;
}) {
  const [ref, width] = useContentWidth();
  const hud = window.ivibeHud;
  const recording = status.phase === "recording" || status.phase === "starting";
  const remaining = status.maxMs - status.elapsedMs;
  const nearEnd = status.phase === "recording" && remaining <= 10_000;

  let key: string;
  let body: ReactNode;
  let tight = false;
  if (recording) {
    const silent =
      status.phase === "recording" && !heardVoice && status.elapsedMs > SILENCE_HINT_MS;
    const wave = <VoiceWave subscribe={hud.onLevel} color={ink} />;
    if (hovered || nearEnd) {
      key = "controls";
      tight = true;
      body = (
        <>
          <Action label="Cancel recording" onClick={() => void hud.cancel()}>
            <X size={14} strokeWidth={2.25} />
          </Action>
          <span {...stylex.props(styles.clock, nearEnd && styles.clockWarning)}>
            {formatClock(nearEnd ? remaining : status.elapsedMs)}
          </span>
          {wave}
          <span {...stylex.props(styles.target)}>
            {status.editing ? "Edits your selection" : `→ ${destination(status.targetName)}`}
          </span>
          <Action label="Stop and paste" onClick={() => void hud.stop()} primary>
            <Square size={9} strokeWidth={0} fill="currentColor" />
          </Action>
        </>
      );
    } else if (silent) {
      key = "silent";
      body = (
        <>
          {wave}
          <span {...stylex.props(styles.text, styles.warn)}>
            Can’t hear {status.microphone || "your mic"}
          </span>
        </>
      );
    } else {
      key = "wave";
      body = wave;
    }
  } else if (status.phase === "finalizing" || status.phase === "writing") {
    key = "working";
    body = <span {...stylex.props(styles.line)} role="status" aria-label="Writing your result" />;
  } else if (status.phase === "error") {
    key = "error";
    body = (
      <>
        <AlertCircle size={15} strokeWidth={2} color="#ff9c8a" />
        <span {...stylex.props(styles.text)} title={status.error}>
          {status.error ?? "Recording failed"}
        </span>
        {status.canRetry && (
          <Action label="Retry" onClick={() => void hud.retry()}>
            <RotateCcw size={13} strokeWidth={2.25} />
          </Action>
        )}
        <Action label="Dismiss" onClick={() => void hud.dismiss()}>
          <X size={14} strokeWidth={2.25} />
        </Action>
      </>
    );
  } else {
    // The result is in: main closes the pill straight away.
    return null;
  }

  return (
    // The capsule drags the window; its buttons don't.
    <div {...withClass("drag-region", styles.capsule)} style={{ width }}>
      <div key={key} ref={ref} {...stylex.props(styles.content, tight && styles.tight)}>
        {body}
      </div>
    </div>
  );
}
