// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Kbd } from "@astryxdesign/core/Kbd";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { IvibeApi } from "../../preload/ui.ts";
import type { AppInfo, ByokStatus, RecordingStatus, RecordingSummary } from "../../shared/ipc.ts";
import { formatClock, mount } from "../shared/theme.tsx";

declare global {
  interface Window {
    ivibe: IvibeApi;
  }
}

const styles = stylex.create({
  page: { minHeight: "100%", padding: 32, maxWidth: 880, marginInline: "auto" },
  wordmark: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" },
  vibe: {
    backgroundImage: "linear-gradient(90deg, #7c5cff, #c04cfd 55%, #ff5c8a)",
    backgroundClip: "text",
    color: "transparent",
  },
  clock: { fontSize: 44, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  stat: { minWidth: 110 },
});

const phaseLabel: Record<RecordingStatus["phase"], string> = {
  idle: "Ready",
  starting: "Starting…",
  recording: "Recording",
  finalizing: "Processing",
  review: "Recording ready",
  error: "Something went wrong",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <VStack gap={0.5} xstyle={styles.stat}>
      <Text color="secondary">{label}</Text>
      <Text weight="bold" hasTabularNumbers>
        {value}
      </Text>
    </VStack>
  );
}

const RULE_LABELS: Record<string, string> = {
  "high-entropy": "random-looking tokens",
  "env-line": ".env values",
  "connection-string": "connection passwords",
  "sensitive-app": "password manager screens",
};

function describeRedactions(redactions: Record<string, number>): string {
  const entries = Object.entries(redactions);
  if (entries.length === 0) return "No secrets found on screen.";
  const parts = entries.map(([rule, count]) => `${count} × ${RULE_LABELS[rule] ?? rule}`);
  return `Hidden before anything leaves this device: ${parts.join(", ")}.`;
}

function RecordingResult({ summary }: { summary: RecordingSummary }) {
  const { privacy } = summary;
  const hidden = Object.values(privacy.redactions).reduce((sum, count) => sum + count, 0);
  return (
    <Card padding={5}>
      <VStack gap={4}>
        <HStack justify="between" align="center">
          <Heading level={3}>Recording ready</Heading>
          <Badge variant="success" label="Captured on this device" />
        </HStack>
        <HStack gap={6} wrap="wrap">
          <Stat label="Length" value={formatClock(summary.durationMs)} />
          <Stat label="Screen" value={`${summary.display.width}×${summary.display.height}`} />
          <Stat label="Frames sampled" value={String(summary.frames.sampled)} />
          <Stat label="Keyframes" value={String(summary.frames.keyframes)} />
          <Stat label="Screen changes" value={String(summary.frames.changed)} />
          <Stat
            label="Narration"
            value={summary.audio.silent ? "Silent" : `${summary.audio.seconds.toFixed(1)} s`}
          />
          <Stat label="Text lines read" value={String(privacy.lines)} />
          <Stat label="Secrets hidden" value={String(hidden)} />
          <Stat label="OCR per frame" value={`${privacy.ocrMsAverage} ms`} />
        </HStack>
        <Banner
          status={hidden > 0 ? "warning" : "success"}
          title={privacy.blackouts > 0 ? "A password manager was blacked out" : "Redaction done"}
          description={describeRedactions(privacy.redactions)}
        />
        <Text color="secondary">
          Frames stay in memory on this device and nothing has been uploaded.
        </Text>
      </VStack>
    </Card>
  );
}

function RecordCard({ status, info }: { status: RecordingStatus; info: AppInfo | null }) {
  const busy = status.phase === "starting" || status.phase === "recording";
  return (
    <Card padding={6}>
      <VStack gap={4}>
        <HStack justify="between" align="center">
          <VStack gap={1}>
            <Heading level={2}>Show the bug. Get the fix.</Heading>
            <Text color="secondary">
              Record up to 60 seconds of your screen while you explain what went wrong.
            </Text>
          </VStack>
          {status.phase === "recording" && (
            <Text xstyle={styles.clock}>{formatClock(status.elapsedMs)}</Text>
          )}
        </HStack>
        <HStack gap={3} align="center">
          {busy ? (
            <>
              <Button
                label="Stop recording"
                variant="primary"
                onClick={() => void window.ivibe.recording.stop()}
              />
              <Button
                label="Cancel"
                variant="ghost"
                onClick={() => void window.ivibe.recording.cancel()}
              />
            </>
          ) : (
            <Button
              label="Start recording"
              variant="primary"
              isLoading={status.phase === "finalizing"}
              onClick={() => void window.ivibe.recording.start()}
            />
          )}
          {info && (
            <HStack gap={1} align="center">
              <Text color="secondary">or press</Text>
              <Kbd keys={info.platform === "darwin" ? "ctrl+option+r" : "ctrl+alt+r"} />
              <Text color="secondary">anywhere</Text>
            </HStack>
          )}
        </HStack>
        {info && !info.hotkeyRegistered && (
          <Banner
            status="warning"
            title="The recording shortcut is taken by another app"
            description="Use the Start recording button or the tray icon for now."
          />
        )}
      </VStack>
    </Card>
  );
}

function ByokCard() {
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.ivibe.byok.status().then(setStatus);
  }, []);

  const save = useCallback(async () => {
    setError(null);
    try {
      setStatus(await window.ivibe.byok.set(key));
      setKey("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
          : String(err),
      );
    }
  }, [key]);

  return (
    <Card padding={5}>
      <VStack gap={3}>
        <HStack justify="between" align="center">
          <Heading level={3}>Your Meta API key</Heading>
          {status?.hasKey ? (
            <Badge variant="success" label={`Saved · ends in ${status.hint}`} />
          ) : (
            <Badge variant="neutral" label="Not set" />
          )}
        </HStack>
        <Text color="secondary">
          Bring your own key and iVibe is free forever. The key is encrypted with your system
          keychain and calls go from this device straight to Meta.
        </Text>
        <HStack gap={2} align="end">
          <TextInput
            type="password"
            label="Meta Model API key"
            placeholder="LLM_…"
            value={key}
            onChange={setKey}
            onEnter={() => void save()}
            status={error ? { type: "error", message: error } : undefined}
            width="100%"
          />
          <Button
            label="Save key"
            variant="secondary"
            isDisabled={!key}
            onClick={() => void save()}
          />
          {status?.hasKey && (
            <Button
              label="Remove"
              variant="ghost"
              onClick={() => void window.ivibe.byok.clear().then(setStatus)}
            />
          )}
        </HStack>
      </VStack>
    </Card>
  );
}

function App() {
  const [status, setStatus] = useState<RecordingStatus>({
    phase: "idle",
    elapsedMs: 0,
    maxMs: 60_000,
  });
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.ivibe.recording.get().then(setStatus);
    void window.ivibe.app.info().then(setInfo);
    return window.ivibe.recording.onState(setStatus);
  }, []);

  const dot =
    status.phase === "recording"
      ? ("error" as const)
      : status.phase === "error"
        ? ("warning" as const)
        : ("success" as const);

  return (
    <VStack gap={5} xstyle={styles.page}>
      <HStack justify="between" align="center">
        <Text xstyle={styles.wordmark}>
          i<span {...stylex.props(styles.vibe)}>Vibe</span>
        </Text>
        <HStack gap={2} align="center">
          <StatusDot
            variant={dot}
            label={phaseLabel[status.phase]}
            isPulsing={status.phase === "recording"}
          />
          <Text color="secondary">{phaseLabel[status.phase]}</Text>
          {info && <Badge variant="neutral" label={`v${info.version}`} />}
        </HStack>
      </HStack>

      {status.phase === "error" && status.error && (
        <Banner status="error" title="Recording failed" description={status.error} />
      )}

      <RecordCard status={status} info={info} />
      {status.phase === "review" && status.summary && <RecordingResult summary={status.summary} />}

      <Divider />
      <ByokCard />
    </VStack>
  );
}

mount(<App />);
