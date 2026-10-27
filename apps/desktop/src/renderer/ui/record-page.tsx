// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { ChevronDown, Copy, History, Mic, ShieldCheck, Square } from "lucide-react";
import type {
  AppInfo,
  OutputMode,
  RecordingResult,
  RecordingStatus,
  RecordingSummary,
  ShortcutStatus,
  TranscriptSegment,
} from "../../shared/ipc.ts";
import { PASTE_SHORTCUT } from "../../shared/shortcuts.ts";
import type { SettingsState } from "./state.ts";
import { formatClock, signal } from "../shared/theme.tsx";
import { asSentence } from "../shared/transcript.ts";
import { Waveform, useLevelHistory } from "../shared/waveform.tsx";
import { Shortcut } from "../shared/shortcut.tsx";
import { ShortcutButton } from "./shortcut-button.tsx";

const ORB = 104;

const styles = stylex.create({
  // A centred stage: heading, mode, the record button; the result card follows below it.
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
    transition: "transform 110ms ease-out",
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
    transitionDuration: "160ms",
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
    animationDuration: "240ms",
  },

  // The latest result, one card.
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    width: "100%",
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-surface)",
    textAlign: "start",
    animationName: "ivibe-rise",
    animationDuration: "260ms",
  },
  cardHeader: { display: "flex", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 },
  text: {
    margin: 0,
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    userSelect: "text",
  },
  clamped: {
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  thumbs: { display: "flex", gap: 8, overflowX: "auto" },
  thumb: {
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "zoom-in",
  },
  thumbImage: {
    display: "block",
    height: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--color-border)",
  },
  footerNote: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: { default: "var(--color-text-secondary)", ":hover": "var(--color-text-primary)" },
    fontFamily: "inherit",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  chevronOpen: { transform: "rotate(180deg)" },
  transcript: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  line: { display: "grid", gridTemplateColumns: "40px 1fr", gap: 10, alignItems: "baseline" },
  time: {
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    color: "var(--color-text-secondary)",
  },
  said: { fontSize: 14, lineHeight: 1.55 },
  saidMuted: { color: "var(--color-text-secondary)" },
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
          onChange={(value) => settings.change({ mode: value as OutputMode })}
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
  if (status.captions === "no-key") {
    return (
      <Text color="secondary" size="sm">
        Add your Meta key in Settings to see what you say as you record.
      </Text>
    );
  }
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
}: {
  status: RecordingStatus;
  accelerator: string | null;
  isMac: boolean;
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
          <Text color="secondary">{accelerator ? "Click or press" : "Click to record"}</Text>
          {accelerator && <Shortcut accelerator={accelerator} isMac={isMac} />}
        </div>
      )}
    </div>
  );
}

const RULE_LABELS: Record<string, string> = {
  "meta-key": "Meta key",
  "openai-key": "OpenAI key",
  "anthropic-key": "Anthropic key",
  "github-token": "GitHub token",
  "aws-key": "AWS key",
  "high-entropy": "random-looking token",
  "env-line": ".env value",
  "connection-string": "database password",
  assignment: "password or secret",
  "sensitive-app": "password manager screen",
};

function privacyLine(summary: RecordingSummary): { text: string; hidden: number } {
  const entries = Object.entries(summary.privacy.redactions);
  const hidden = entries.reduce((sum, [, count]) => sum + count, 0);
  if (hidden === 0) return { text: "No secrets on screen", hidden };
  const parts = entries.map(
    ([rule, count]) => `${count} ${RULE_LABELS[rule] ?? rule}${count === 1 ? "" : "s"}`,
  );
  return { text: `Hidden on this device: ${parts.join(", ")}`, hidden };
}

function Transcript({ segments }: { segments: readonly TranscriptSegment[] }) {
  return (
    <ol {...stylex.props(styles.transcript)}>
      {segments.map((segment) => (
        <li key={segment.id} {...stylex.props(styles.line)}>
          <span {...stylex.props(styles.time)}>{formatClock(segment.startMs)}</span>
          <span
            {...stylex.props(styles.said, segment.state !== "final" && styles.saidMuted)}
            data-selectable
          >
            {segment.state === "final"
              ? asSentence(segment.text)
              : "Couldn’t transcribe this part."}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ResultCard({
  result,
  status,
  isMac,
  onOpenHistory,
}: {
  result: RecordingResult;
  status: RecordingStatus;
  isMac: boolean;
  onOpenHistory: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showSaid, setShowSaid] = useState(false);
  const paste = isMac ? "⌃⌥V" : PASTE_SHORTCUT.replace("Control", "Ctrl");
  const title =
    result.delivery === "pasted"
      ? `Pasted into ${result.targetName}`
      : result.waiting
        ? "Copied · click a text field to paste"
        : `Copied · press ${paste} to paste`;
  const segments = (status.transcript ?? []).filter((segment) => segment.state !== "pending");
  const privacy = status.mode === "fix" && status.summary ? privacyLine(status.summary) : null;
  const isLong = result.text.length > 320 || result.text.split("\n").length > 4;

  return (
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardHeader)}>
        <Text xstyle={styles.cardTitle}>{title}</Text>
        <Button
          label="Copy"
          variant="ghost"
          size="sm"
          icon={<Copy size={14} strokeWidth={2} />}
          onClick={() => void window.ivibe.recording.copyResult()}
        />
      </div>

      {result.proof.length > 0 && (
        <div {...stylex.props(styles.thumbs)}>
          {result.proof.map((shot, index) => (
            <button
              key={shot.file}
              type="button"
              title={`${index + 1}. ${shot.title}`}
              {...stylex.props(styles.thumb)}
              onClick={() => void window.ivibe.recording.openProof(index)}
            >
              <img src={shot.preview} alt={shot.title} {...stylex.props(styles.thumbImage)} />
            </button>
          ))}
        </div>
      )}

      <pre {...stylex.props(styles.text, isLong && !showAll && styles.clamped)} data-selectable>
        {result.text}
      </pre>
      {showSaid && segments.length > 0 && <Transcript segments={segments} />}

      <div {...stylex.props(styles.footer)}>
        <div {...stylex.props(styles.footerNote)}>
          {privacy && (
            <>
              <ShieldCheck
                size={15}
                strokeWidth={2}
                color={privacy.hidden > 0 ? signal.secret : signal.ok}
              />
              <Text color="secondary" size="sm">
                {privacy.text}
              </Text>
            </>
          )}
        </div>
        {isLong && (
          <button type="button" {...stylex.props(styles.link)} onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : "Show all"}
          </button>
        )}
        {segments.length > 0 && (
          <button
            type="button"
            aria-expanded={showSaid}
            {...stylex.props(styles.link)}
            onClick={() => setShowSaid(!showSaid)}
          >
            What you said
            <ChevronDown
              size={14}
              strokeWidth={2}
              {...stylex.props(showSaid && styles.chevronOpen)}
            />
          </button>
        )}
        <button type="button" {...stylex.props(styles.link)} onClick={onOpenHistory}>
          <History size={14} strokeWidth={2} />
          History
        </button>
      </div>
    </section>
  );
}

export function RecordPage({
  status,
  info,
  settings,
  shortcutStatus,
  onOpenHistory,
}: {
  status: RecordingStatus;
  info: AppInfo | null;
  settings: SettingsState;
  shortcutStatus: ShortcutStatus | null;
  onOpenHistory: () => void;
}) {
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
        />
      </div>

      {status.phase === "error" && status.error && (
        <div {...stylex.props(styles.banner)}>
          <Banner status="error" title="The recording stopped" description={status.error} />
        </div>
      )}

      {status.phase === "review" && status.result && (
        <ResultCard
          result={status.result}
          status={status}
          isMac={isMac}
          onOpenHistory={onOpenHistory}
        />
      )}
    </div>
  );
}
