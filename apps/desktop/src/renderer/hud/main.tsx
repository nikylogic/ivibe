// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { AlertCircle, CheckCircle2, ClipboardCheck, ShieldCheck, Square, X } from "lucide-react";
import type { HudApi } from "../../preload/hud.ts";
import type {
  OutputMode,
  RecordingFeedback,
  RecordingStatus,
  TranscriptSegment,
} from "../../shared/ipc.ts";
import { withClass } from "../shared/shortcut.tsx";
import { formatClock, mount } from "../shared/theme.tsx";
import { asSentence } from "../shared/transcript.ts";
import { Waveform, useLevelHistory } from "../shared/waveform.tsx";

declare global {
  interface Window {
    ivibeHud: HudApi;
  }
}

/** No voice for this long at the start of a recording triggers a microphone hint. */
const SILENCE_HINT_MS = 6000;
const TOAST_MS = 2800;

const ink = "#f2efe8";

/** What the user is asked to talk about, per mode. */
const LISTENING_HINT: Record<OutputMode, string> = {
  fix: "Listening. Describe the bug as you show it.",
  prompt: "Listening. Say what you want built or changed.",
  dictate: "Listening. Speak naturally.",
};

/** What gets written, for the pill's "Writing … for X" line. */
const WRITING_LABEL: Record<OutputMode, string> = {
  fix: "Writing your fix prompt",
  prompt: "Writing your prompt",
  dictate: "Cleaning up your words",
};

const isMac = navigator.userAgent.includes("Mac");

const styles = stylex.create({
  frame: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingBottom: 14,
  },
  card: {
    width: 420,
    display: "flex",
    flexDirection: "column",
    borderRadius: 22,
    backgroundColor: "rgba(15, 14, 13, 0.94)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: "0 14px 40px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.2)",
    color: "#f2efe8",
    overflow: "hidden",
    animationName: "ivibe-rise",
    animationDuration: "240ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },

  caption: {
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
    // Older words fade upward as new ones arrive.
    maskImage: "linear-gradient(to bottom, transparent 0, black 22px)",
  },
  captionText: { overflowWrap: "anywhere" },
  hint: { color: "#a39e94" },
  warn: { color: "#f5b971" },
  pending: { color: "#a39e94", letterSpacing: "0.1em" },
  failed: { color: "#a39e94", fontStyle: "italic" },

  controls: {
    height: 52,
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingInlineStart: 18,
    paddingInlineEnd: 8,
  },
  dot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: 999,
    backgroundColor: "#e5484d",
    boxShadow: "0 0 0 4px rgba(229, 72, 77, 0.18)",
    animationName: "ivibe-pulse",
    animationDuration: "1.6s",
    animationIterationCount: "infinite",
  },
  grow: { flex: 1, minWidth: 0, display: "flex", alignItems: "center" },
  clock: {
    fontSize: 13,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
    color: "#f2efe8",
  },
  clockWarning: { color: "#ff9c8a" },
  divider: { width: 1, height: 20, backgroundColor: "rgba(255, 255, 255, 0.1)" },
  actions: { display: "flex", alignItems: "center", gap: 4 },
  status: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, minWidth: 0 },
  statusText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  open: {
    height: 30,
    paddingInline: 14,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "#f2efe8",
    color: "#121110",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },

  toast: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 32,
    paddingInline: 12,
    borderRadius: 999,
    backgroundColor: "rgba(54, 38, 14, 0.95)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(245, 185, 113, 0.35)",
    color: "#f8d5a3",
    fontSize: 12.5,
    fontWeight: 500,
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.3)",
    animationName: "ivibe-rise",
    animationDuration: "200ms",
  },
});

function useFeedbackToast(): RecordingFeedback | null {
  const [toast, setToast] = useState<RecordingFeedback | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.ivibeHud.onFeedback((feedback) => {
      setToast(feedback);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), TOAST_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  return toast;
}

/** Whether any voice has been heard yet, for the microphone hint. */
function useHeardVoice(isRecording: boolean): boolean {
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    if (!isRecording) return;
    return window.ivibeHud.onLevel((rms) => {
      if (rms > 0.02) setHeard(true);
    });
  }, [isRecording]);
  return heard;
}

function Caption({ status, heardVoice }: { status: RecordingStatus; heardVoice: boolean }) {
  const segments: TranscriptSegment[] = status.transcript ?? [];
  const isRecording = status.phase === "recording";

  if (status.captions === "no-key") {
    return (
      <div {...stylex.props(styles.caption)}>
        <span {...stylex.props(styles.hint)}>Live captions need your Meta key (Settings)</span>
      </div>
    );
  }
  if (segments.length === 0) {
    const silent = isRecording && !heardVoice && status.elapsedMs > SILENCE_HINT_MS;
    return (
      <div {...stylex.props(styles.caption)}>
        <span {...stylex.props(silent ? styles.warn : styles.hint)}>
          {silent
            ? "We can’t hear you. Pick your microphone in Settings."
            : isRecording || status.phase === "starting"
              ? LISTENING_HINT[status.mode ?? "fix"]
              : "No narration recorded."}
        </span>
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.caption)} aria-live="polite">
      <span {...stylex.props(styles.captionText)}>
        {segments.map((segment) => (
          <span key={segment.id}>
            {segment.state === "final" && `${asSentence(segment.text)} `}
            {segment.state === "pending" && <span {...stylex.props(styles.pending)}>··· </span>}
            {segment.state === "failed" && (
              <span {...stylex.props(styles.failed)}>(couldn’t transcribe) </span>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}

function Toast({ feedback }: { feedback: RecordingFeedback }) {
  return (
    <div {...stylex.props(styles.toast)} role="status">
      <ShieldCheck size={15} strokeWidth={2} />
      {feedback.type === "secret"
        ? `Hid ${feedback.label} on this device`
        : "Blacked out a password manager"}
    </div>
  );
}

function Controls({ status }: { status: RecordingStatus }) {
  const isRecording = status.phase === "recording" || status.phase === "starting";
  const levels = useLevelHistory(window.ivibeHud.onLevel, 26, isRecording);
  const remaining = status.maxMs - status.elapsedMs;
  const nearEnd = remaining <= 10_000;

  if (status.phase === "finalizing" || status.phase === "writing") {
    const mode = status.mode ?? "fix";
    const label =
      status.phase === "finalizing"
        ? mode === "fix"
          ? "Hiding secrets on this device…"
          : "Finishing up…"
        : `${WRITING_LABEL[mode]}${status.targetName ? ` for ${status.targetName}` : ""}…`;
    return (
      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.status)}>
          <Spinner size="sm" />
          <span {...stylex.props(styles.statusText)}>{label}</span>
        </div>
      </div>
    );
  }

  if (status.phase === "review" && status.result) {
    const { result } = status;
    const pasted = result.delivery === "pasted";
    const proof =
      result.proofImages > 0
        ? ` · ${result.proofImages} screenshot${result.proofImages === 1 ? "" : "s"}`
        : "";
    return (
      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.status, styles.grow)}>
          {pasted ? (
            <CheckCircle2 size={17} strokeWidth={2} color="#6fcf8e" />
          ) : (
            <ClipboardCheck size={17} strokeWidth={2} color="#6fcf8e" />
          )}
          <span {...stylex.props(styles.statusText)}>
            {pasted
              ? `Pasted into ${result.targetName}${proof}`
              : `Copied. Press ${isMac ? "⌘V" : "Ctrl+V"} to paste${proof}`}
          </span>
        </div>
        <button {...stylex.props(styles.open)} onClick={() => void window.ivibeHud.openApp()}>
          View
        </button>
      </div>
    );
  }

  if (status.phase === "review") {
    const hidden = Object.values(status.summary?.privacy.redactions ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
    return (
      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.status, styles.grow)}>
          <CheckCircle2 size={17} strokeWidth={2} color="#6fcf8e" />
          <span {...stylex.props(styles.statusText)}>
            Recording ready
            {hidden > 0 ? ` · ${hidden} secret${hidden === 1 ? "" : "s"} hidden` : ""}
          </span>
        </div>
        <button {...stylex.props(styles.open)} onClick={() => void window.ivibeHud.openApp()}>
          Open
        </button>
      </div>
    );
  }

  if (status.phase === "error") {
    return (
      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.status, styles.grow)}>
          <AlertCircle size={17} strokeWidth={2} color="#ff9c8a" />
          <span {...stylex.props(styles.statusText)}>{status.error ?? "Recording failed"}</span>
        </div>
        <IconButton
          label="Dismiss"
          variant="ghost"
          size="sm"
          icon={<X size={16} strokeWidth={2} />}
          onClick={() => void window.ivibeHud.openApp()}
        />
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.controls)}>
      <span {...stylex.props(styles.dot)} aria-label="Recording" />
      <div {...stylex.props(styles.grow)}>
        <Waveform levels={levels} color={ink} height={24} barWidth={3} gap={2.5} />
      </div>
      <span {...stylex.props(styles.clock, nearEnd && styles.clockWarning)}>
        {nearEnd ? `${formatClock(remaining)} left` : formatClock(status.elapsedMs)}
      </span>
      <span {...stylex.props(styles.divider)} />
      <div {...stylex.props(styles.actions)}>
        <IconButton
          label="Cancel recording"
          variant="ghost"
          size="sm"
          icon={<X size={16} strokeWidth={2} />}
          onClick={() => void window.ivibeHud.cancel()}
        />
        <IconButton
          label="Stop and paste"
          variant="primary"
          size="sm"
          icon={<Square size={11} strokeWidth={0} fill="currentColor" />}
          onClick={() => void window.ivibeHud.stop()}
        />
      </div>
    </div>
  );
}

function Hud() {
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const toast = useFeedbackToast();
  const heardVoice = useHeardVoice(status?.phase === "recording");

  useEffect(() => window.ivibeHud.onState(setStatus), []);

  if (!status || status.phase === "idle") return null;

  return (
    <div {...stylex.props(styles.frame)}>
      {toast && <Toast feedback={toast} />}
      {/* The card drags the window; over it, the window stops passing clicks through. */}
      <div
        {...withClass("drag-region", styles.card)}
        onMouseEnter={() => window.ivibeHud.setInteractive(true)}
        onMouseLeave={() => window.ivibeHud.setInteractive(false)}
      >
        <Caption status={status} heardVoice={heardVoice} />
        <div className="no-drag">
          <Controls status={status} />
        </div>
      </div>
    </div>
  );
}

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
mount(<Hud />, "dark");
