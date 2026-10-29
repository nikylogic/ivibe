// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Mic, Square } from "lucide-react";
import type { AppInfo, OutputMode, RecordingStatus, ShortcutStatus } from "../../shared/ipc.ts";
import type { SettingsState } from "./state.ts";
import { useBackup } from "./state.ts";
import { BackupNotice } from "./backup-section.tsx";
import { formatClock } from "../shared/theme.tsx";
import { asSentence } from "../../shared/transcript.ts";
import { Waveform, useLevelHistory } from "../shared/waveform.tsx";
import { Shortcut } from "../shared/shortcut.tsx";
import { transition } from "./motion.ts";
import { ShortcutButton } from "./shortcut-button.tsx";

const ORB = 104;

const styles = stylex.create({
  // A centred stage: heading, mode and the record button. Results live in the pill and History.
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 32,
    width: "100%",
    maxWidth: 640,
    flex: "1 0 auto",
    marginInline: "auto",
    paddingBlock: 32,
    paddingInline: 32,
    textAlign: "center",
  },
  stage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    width: "100%",
  },
  display: { fontSize: 52, lineHeight: 1.02, letterSpacing: "-0.01em" },
  displaySoft: { fontStyle: "italic", color: "var(--color-text-secondary)" },
  modes: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
  modeRow: { display: "flex", alignItems: "center", gap: 10 },

  recorder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 18,
    minHeight: ORB + 80,
  },
  orbWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: ORB,
    height: ORB,
  },
  // Grows with the voice while recording.
  halo: {
    position: "absolute",
    inset: 0,
    borderRadius: 999,
    backgroundColor: "rgba(229, 72, 77, 0.22)",
    transition: "transform var(--motion-micro) var(--motion-ease)",
  },
  orb: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: ORB,
    height: ORB,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "var(--color-text-primary)",
    color: "var(--color-background-body)",
    boxShadow: {
      default: "0 10px 30px var(--color-shadow), 0 0 0 8px var(--color-background-muted)",
      ":hover": "0 14px 36px var(--color-shadow), 0 0 0 12px var(--color-background-muted)",
    },
    transform: { default: "scale(1)", ":active": "scale(0.96)" },
    transitionProperty: "box-shadow, transform, background-color",
    transitionDuration: "var(--motion-micro)",
    transitionTimingFunction: "var(--motion-ease)",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "3px solid var(--color-border-emphasized)" },
  },
  orbRecording: {
    backgroundColor: "#e5484d", // signal.recording; StyleX needs a literal
    color: "#fff",
    boxShadow: { default: "none", ":hover": "none" },
  },
  orbBusy: {
    backgroundColor: "var(--color-background-muted)",
    color: "var(--color-text-primary)",
    boxShadow: { default: "none", ":hover": "none" },
    cursor: "default",
  },
  hint: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  live: { display: "flex", alignItems: "center", gap: 14 },
  clock: { fontSize: 20, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },
  caption: {
    maxWidth: 520,
    minHeight: 24,
    fontSize: 15,
    lineHeight: 1.55,
    color: "var(--color-text-secondary)",
    animationName: "ivibe-rise",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },

  link: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: { default: "var(--color-text-secondary)", ":hover": "var(--color-text-primary)" },
    fontFamily: "inherit",
    fontSize: 13,
    cursor: "pointer",
  },
  banner: { width: "100%", textAlign: "start" },
});

const MODES: { mode: OutputMode; label: string; note: string }[] = [
  {
    mode: "fix",
    label: "Fix",
    note: "Screen and voice become a fix prompt, with screenshots as proof.",
  },
  {
    mode: "prompt",
    label: "Prompt",
    note: "Voice only. What you say becomes a clean, structured prompt.",
  },
  {
    mode: "dictate",
    label: "Dictate",
    note: "Voice only. Your words, cleaned up and pasted as they are.",
  },
];

const modeInfo = (mode: OutputMode) => MODES.find((entry) => entry.mode === mode) ?? MODES[0]!;

function ModeSwitch({
  settings,
  isLocked,
  shortcutStatus,
  isMac,
}: {
  settings: SettingsState;
  isLocked: boolean;
  shortcutStatus: ShortcutStatus | null;
  isMac: boolean;
}) {
  const mode = settings.settings?.mode ?? "fix";
  return (
    <div {...stylex.props(styles.modes)}>
      <div {...stylex.props(styles.modeRow)}>
        <SegmentedControl
          label="What a recording turns into"
          value={mode}
          isDisabled={isLocked || !settings.settings}
          className="ivibe-segments"
          onChange={(value) =>
            transition("mode", () => settings.change({ mode: value as OutputMode }))
          }
        >
          {MODES.map((entry) => (
            <SegmentedControlItem key={entry.mode} value={entry.mode} label={entry.label} />
          ))}
        </SegmentedControl>
        <ShortcutButton mode={mode} settings={settings} status={shortcutStatus} isMac={isMac} />
      </div>
      <Text color="secondary" size="sm">
        {modeInfo(mode).note}
      </Text>
    </div>
  );
}

/** The last thing heard, as a live caption under the record button. */
function LiveCaption({ status }: { status: RecordingStatus }) {
  const last = [...(status.transcript ?? [])]
    .reverse()
    .find((segment) => segment.state === "final");
  return (
    <div key={last?.id} {...stylex.props(styles.caption)} aria-live="polite">
      {last ? asSentence(last.text) : ""}
    </div>
  );
}

function Recorder({
  status,
  accelerator,
  isMac,
  canHold,
}: {
  status: RecordingStatus;
  accelerator: string | null;
  isMac: boolean;
  /** The shortcut supports hold-to-talk and double-press (Dictate on Windows). */
  canHold: boolean;
}) {
  const isRecording = status.phase === "recording" || status.phase === "starting";
  const isBusy = status.phase === "finalizing" || status.phase === "writing";
  const levels = useLevelHistory(window.ivibe.recording.onLevel, 48, isRecording);
  const level = levels[levels.length - 1] ?? 0;

  let orb;
  if (isBusy) {
    orb = (
      <div {...stylex.props(styles.orb, styles.orbBusy)} role="status" aria-label="Working">
        <Spinner size="md" />
      </div>
    );
  } else if (isRecording) {
    orb = (
      <button
        type="button"
        aria-label="Stop recording"
        onClick={() => void window.ivibe.recording.stop()}
        {...stylex.props(styles.orb, styles.orbRecording)}
      >
        <Square size={26} fill="currentColor" strokeWidth={0} />
      </button>
    );
  } else {
    orb = (
      <button
        type="button"
        aria-label="Start recording"
        onClick={() => void window.ivibe.recording.start()}
        {...stylex.props(styles.orb)}
      >
        <Mic size={34} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <div {...stylex.props(styles.recorder)}>
      <div {...stylex.props(styles.orbWrap)}>
        {isRecording && (
          <span
            {...stylex.props(styles.halo)}
            style={{ transform: `scale(${1.08 + Math.min(0.45, Math.sqrt(level) * 1.1)})` }}
          />
        )}
        {orb}
      </div>

      {isBusy && (
        <Text color="secondary">
          {status.phase === "finalizing"
            ? "Finishing the recording on this device…"
            : `Muse Spark is writing the result${status.targetName ? ` for ${status.targetName}` : ""}…`}
        </Text>
      )}

      {isRecording && (
        <>
          <div {...stylex.props(styles.live)}>
            <span {...stylex.props(styles.clock)}>{formatClock(status.elapsedMs)}</span>
            <Waveform levels={levels} color="var(--color-text-primary)" height={28} />
            <button
              type="button"
              {...stylex.props(styles.link)}
              onClick={() => void window.ivibe.recording.cancel()}
            >
              Cancel
            </button>
          </div>
          <LiveCaption status={status} />
        </>
      )}

      {!isRecording && !isBusy && (
        <div {...stylex.props(styles.hint)}>
          {!accelerator ? (
            <Text color="secondary">Click to record</Text>
          ) : canHold ? (
            <>
              <Text color="secondary">Hold</Text>
              <Shortcut accelerator={accelerator} isMac={isMac} />
              <Text color="secondary">to talk, or double-press for hands-free</Text>
            </>
          ) : (
            <>
              <Text color="secondary">Click or press</Text>
              <Shortcut accelerator={accelerator} isMac={isMac} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function RecordPage({
  status,
  info,
  settings,
  shortcutStatus,
  onOpenBackup,
}: {
  status: RecordingStatus;
  info: AppInfo | null;
  settings: SettingsState;
  shortcutStatus: ShortcutStatus | null;
  onOpenBackup: () => void;
}) {
  const backup = useBackup();
  const busy = status.phase !== "idle" && status.phase !== "review" && status.phase !== "error";
  const mode = (busy ? status.mode : settings.settings?.mode) ?? "fix";
  const isMac = info?.platform === "darwin";
  const isTaken = shortcutStatus?.[mode] === false;
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.stage)}>
        <Heading level={1} xstyle={styles.display}>
          {mode === "fix" ? "Show the bug." : "Just say it."}
          <br />
          <span {...stylex.props(styles.displaySoft)}>
            {mode === "dictate" ? "We’ll tidy it up." : "We’ll write the prompt."}
          </span>
        </Heading>

        <ModeSwitch
          settings={settings}
          isLocked={busy}
          shortcutStatus={shortcutStatus}
          isMac={isMac}
        />

        <Recorder
          status={status}
          accelerator={isTaken ? null : (settings.settings?.shortcuts[mode] ?? null)}
          isMac={isMac}
          canHold={mode === "dictate" && info?.platform === "win32"}
        />
      </div>

      {!busy && backup?.deleteAfter != null && (
        <div {...stylex.props(styles.banner)}>
          <BackupNotice status={backup} onOpen={onOpenBackup} />
        </div>
      )}

      {status.phase === "error" && status.error && (
        <div {...stylex.props(styles.banner)}>
          <Banner
            status="error"
            title="The recording stopped"
            description={status.error}
            endContent={
              status.canRetry ? (
                <Button
                  label="Retry"
                  size="sm"
                  variant="secondary"
                  onClick={() => void window.ivibe.recording.retry()}
                />
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
