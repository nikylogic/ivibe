// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Mic, ShieldCheck, Square } from "lucide-react";
import type { AppInfo, RecordingStatus, RecordingSummary } from "../../shared/ipc.ts";
import { formatClock, signal } from "../shared/theme.tsx";
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
});

function Recorder({ status, info }: { status: RecordingStatus; info: AppInfo | null }) {
  const isRecording = status.phase === "recording" || status.phase === "starting";
  const levels = useLevelHistory(window.ivibe.recording.onLevel, 48, isRecording);

  if (status.phase === "finalizing") {
    return (
      <div {...stylex.props(styles.recorder)}>
        <Spinner size="sm" />
        <Text>Reading the screen and hiding secrets on this device…</Text>
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

export function RecordPage({ status, info }: { status: RecordingStatus; info: AppInfo | null }) {
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.hero)}>
        <Heading level={1} xstyle={styles.display}>
          Show the bug.
          <br />
          <span {...stylex.props(styles.displaySoft)}>We’ll find the fix.</span>
        </Heading>
        <Text color="secondary" xstyle={styles.lede}>
          Record up to a minute of your screen and talk through what went wrong. iVibe reads the
          screen and hides secrets on this device, then finds the root cause.
        </Text>
      </div>

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

      {status.phase === "review" && status.summary && <LastRecording summary={status.summary} />}
    </div>
  );
}
