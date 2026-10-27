// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Copy, Mic, ShieldCheck, Square } from "lucide-react";
import type {
  AppInfo,
  OutputMode,
  RecordingResult,
  RecordingStatus,
  RecordingSummary,
  TranscriptSegment,
} from "../../shared/ipc.ts";
import type { SettingsState } from "./state.ts";
import { formatClock, signal } from "../shared/theme.tsx";
import { asSentence } from "../shared/transcript.ts";
import { Waveform, useLevelHistory } from "../shared/waveform.tsx";
import { Shortcut } from "../shared/shortcut.tsx";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 40,
    width: "100%",
    maxWidth: 720,
    marginInline: "auto",
    paddingBlock: 24,
    paddingInline: 40,
  },
  hero: { display: "flex", flexDirection: "column", gap: 14 },
  modes: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" },
  result: {
    margin: 0,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-surface)",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    userSelect: "text",
  },
  proofGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
  },
  proofItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    textAlign: "start",
    cursor: "zoom-in",
  },
  proofImage: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    display: "block",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  display: { fontSize: 52, lineHeight: 1.02, letterSpacing: "-0.01em" },
  displaySoft: { fontStyle: "italic", color: "var(--color-text-secondary)" },
  lede: { maxWidth: 520, fontSize: 15, lineHeight: 1.6 },

  recorder: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    minHeight: 96,
    paddingInline: 24,
    paddingBlock: 20,
    borderRadius: 22,
    backgroundColor: "var(--color-background-muted)",
  },
  grow: { flex: 1, minWidth: 0 },
  hint: { display: "flex", alignItems: "center", gap: 8 },
  live: { display: "flex", alignItems: "center", gap: 12 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e5484d", // signal.recording; StyleX needs a literal
    animationName: "ivibe-pulse",
    animationDuration: "1.6s",
    animationIterationCount: "infinite",
  },
  clock: { fontSize: 28, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },

  section: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    animationName: "ivibe-rise",
    animationDuration: "260ms",
  },
  sectionTitle: { fontSize: 13, fontWeight: 600 },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-surface)",
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 18,
    borderInlineStartWidth: 1,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: { default: "var(--color-border)", ":first-child": "transparent" },
  },
  statValue: { fontSize: 22, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" },
  privacy: { display: "flex", alignItems: "flex-start", gap: 10 },

  transcript: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  line: {
    display: "grid",
    gridTemplateColumns: "44px 1fr",
    gap: 12,
    alignItems: "baseline",
    animationName: "ivibe-rise",
    animationDuration: "240ms",
  },
  time: {
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    color: "var(--color-text-secondary)",
  },
  said: { fontSize: 15, lineHeight: 1.55 },
  saidPending: { color: "var(--color-text-secondary)", letterSpacing: "0.12em" },
  saidFailed: { color: "var(--color-text-secondary)", fontStyle: "italic" },
});

const MODES: { mode: OutputMode; label: string; note: string; lede: string }[] = [
  {
    mode: "fix",
    label: "Fix",
    note: "Screen and voice become a fix prompt, with screenshots as proof.",
    lede: "Show the bug and talk it through. iVibe hides secrets on this device, writes the fix prompt and pastes it into your coding agent.",
  },
  {
    mode: "prompt",
    label: "Prompt",
    note: "Voice only. What you say becomes a clean, structured prompt.",
    lede: "Say what you want built. iVibe turns it into a clear prompt and pastes it where you were typing.",
  },
  {
    mode: "dictate",
    label: "Dictate",
    note: "Voice only. Your words, cleaned up and pasted as they are.",
    lede: "Just talk. iVibe removes the ums and false starts and pastes your words where you were typing.",
  },
];

const modeInfo = (mode: OutputMode) => MODES.find((entry) => entry.mode === mode) ?? MODES[0]!;

function ModeSwitch({ settings, isLocked }: { settings: SettingsState; isLocked: boolean }) {
  const mode = settings.settings?.mode ?? "fix";
  return (
    <div {...stylex.props(styles.modes)}>
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
      <Text color="secondary" size="sm">
        {modeInfo(mode).note}
      </Text>
    </div>
  );
}

function Recorder({ status, info }: { status: RecordingStatus; info: AppInfo | null }) {
  const isRecording = status.phase === "recording" || status.phase === "starting";
  const levels = useLevelHistory(window.ivibe.recording.onLevel, 48, isRecording);

  if (status.phase === "finalizing" || status.phase === "writing") {
    const target = status.targetName ? ` for ${status.targetName}` : "";
    return (
      <div {...stylex.props(styles.recorder)}>
        <Spinner size="sm" />
        <Text>
          {status.phase === "finalizing"
            ? "Finishing the recording on this device…"
            : `Muse Spark is writing the result${target}…`}
        </Text>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div {...stylex.props(styles.recorder)}>
        <div {...stylex.props(styles.live)}>
          <span {...stylex.props(styles.dot)} />
          <span {...stylex.props(styles.clock)}>{formatClock(status.elapsedMs)}</span>
        </div>
        <div {...stylex.props(styles.grow)}>
          <Waveform levels={levels} color="var(--color-text-primary)" height={36} />
        </div>
        <Button
          label="Cancel"
          variant="ghost"
          onClick={() => void window.ivibe.recording.cancel()}
        />
        <Button
          label="Stop"
          variant="primary"
          size="lg"
          icon={<Square size={12} fill="currentColor" strokeWidth={0} />}
          onClick={() => void window.ivibe.recording.stop()}
        />
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.recorder)}>
      <Button
        label="Start recording"
        variant="primary"
        size="lg"
        icon={<Mic size={16} strokeWidth={2} />}
        onClick={() => void window.ivibe.recording.start()}
      />
      <div {...stylex.props(styles.hint)}>
        <Text color="secondary">or press</Text>
        <Shortcut isMac={info?.platform === "darwin"} />
        <Text color="secondary">from any app</Text>
      </div>
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

function privacyLine(redactions: Record<string, number>, blackouts: number): string {
  const entries = Object.entries(redactions);
  if (entries.length === 0) return "No secrets were on screen. Everything stayed on this device.";
  const parts = entries.map(
    ([rule, count]) => `${count} ${RULE_LABELS[rule] ?? rule}${count === 1 ? "" : "s"}`,
  );
  const blackout = blackouts > 0 ? " Password manager frames were blacked out." : "";
  return `Hidden on this device before anything could be sent: ${parts.join(", ")}.${blackout}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.stat)}>
      <Text color="secondary" size="sm">
        {label}
      </Text>
      <span {...stylex.props(styles.statValue)}>{value}</span>
    </div>
  );
}

/** What the user said, one timestamped line per sentence; fills in live while recording. */
function Transcript({ segments }: { segments: readonly TranscriptSegment[] }) {
  return (
    <ol {...stylex.props(styles.transcript)} aria-live="polite">
      {segments.map((segment) => (
        <li key={segment.id} {...stylex.props(styles.line)}>
          <span {...stylex.props(styles.time)}>{formatClock(segment.startMs)}</span>
          <span
            {...stylex.props(
              styles.said,
              segment.state === "pending" && styles.saidPending,
              segment.state === "failed" && styles.saidFailed,
            )}
            data-selectable
          >
            {segment.state === "final"
              ? asSentence(segment.text)
              : segment.state === "pending"
                ? "···"
                : "Couldn’t transcribe this part."}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TranscriptSection({ status }: { status: RecordingStatus }) {
  const segments = status.transcript ?? [];
  if (status.captions === "no-key") {
    return (
      <Text color="secondary" size="sm">
        Add your Meta key in Settings to see what you say as you record.
      </Text>
    );
  }
  if (segments.length === 0) return null;
  return (
    <section {...stylex.props(styles.section)}>
      <Text xstyle={styles.sectionTitle}>What you said</Text>
      <Transcript segments={segments} />
    </section>
  );
}

function Result({ result }: { result: RecordingResult }) {
  const where =
    result.delivery === "pasted" ? `Pasted into ${result.targetName}` : "Copied to the clipboard";
  const proof =
    result.proofImages > 0
      ? ` with ${result.proofImages} screenshot${result.proofImages === 1 ? "" : "s"}`
      : "";
  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.resultHeader)}>
        <Text xstyle={styles.sectionTitle}>
          {where}
          {proof}
        </Text>
        <Button
          label="Copy"
          variant="ghost"
          size="sm"
          icon={<Copy size={14} strokeWidth={2} />}
          onClick={() => void window.ivibe.recording.copyResult()}
        />
      </div>
      {result.proof.length > 0 && (
        <div {...stylex.props(styles.proofGrid)}>
          {result.proof.map((shot, index) => (
            <button
              key={shot.file}
              type="button"
              title="Open full size"
              {...stylex.props(styles.proofItem)}
              onClick={() => void window.ivibe.recording.openProof(index)}
            >
              <img src={shot.preview} alt={shot.title} {...stylex.props(styles.proofImage)} />
              <Text color="secondary" size="sm">
                {index + 1}. {shot.title}
              </Text>
            </button>
          ))}
        </div>
      )}
      <pre {...stylex.props(styles.result)} data-selectable>
        {result.text}
      </pre>
    </section>
  );
}

function LastRecording({ summary }: { summary: RecordingSummary }) {
  const { privacy } = summary;
  const hidden = Object.values(privacy.redactions).reduce((sum, count) => sum + count, 0);
  return (
    <section {...stylex.props(styles.section)}>
      <Text xstyle={styles.sectionTitle}>Last recording</Text>
      <div {...stylex.props(styles.stats)}>
        <Stat label="Length" value={formatClock(summary.durationMs)} />
        <Stat
          label="Narration"
          value={summary.audio.silent ? "None" : `${Math.round(summary.audio.seconds)} s`}
        />
        <Stat label="Lines read" value={String(privacy.lines)} />
        <Stat label="Secrets hidden" value={String(hidden)} />
      </div>
      <div {...stylex.props(styles.privacy)}>
        <ShieldCheck size={16} strokeWidth={2} color={hidden > 0 ? signal.secret : signal.ok} />
        <Text color="secondary" size="sm">
          {privacyLine(privacy.redactions, privacy.blackouts)}
        </Text>
      </div>
    </section>
  );
}

export function RecordPage({
  status,
  info,
  settings,
}: {
  status: RecordingStatus;
  info: AppInfo | null;
  settings: SettingsState;
}) {
  const busy = status.phase !== "idle" && status.phase !== "review" && status.phase !== "error";
  const mode = (busy ? status.mode : settings.settings?.mode) ?? "fix";
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.hero)}>
        <Heading level={1} xstyle={styles.display}>
          {mode === "fix" ? "Show the bug." : "Just say it."}
          <br />
          <span {...stylex.props(styles.displaySoft)}>
            {mode === "dictate" ? "We’ll tidy it up." : "We’ll write the prompt."}
          </span>
        </Heading>
        <Text color="secondary" xstyle={styles.lede}>
          {modeInfo(mode).lede}
        </Text>
      </div>

      <ModeSwitch settings={settings} isLocked={busy} />

      <Recorder status={status} info={info} />

      {status.phase === "error" && status.error && (
        <Banner status="error" title="The recording stopped" description={status.error} />
      )}
      {info && !info.hotkeyRegistered && (
        <Banner
          status="warning"
          title="Another app is using the shortcut"
          description="Start recordings from the button above or the tray icon."
        />
      )}

      {status.phase !== "idle" && <TranscriptSection status={status} />}
      {status.phase === "review" && status.result && <Result result={status.result} />}
      {status.phase === "review" && status.summary && status.mode === "fix" && (
        <LastRecording summary={status.summary} />
      )}
    </div>
  );
}
