// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Personal } from "@ivibe/engine";
import type { AppInfo } from "../../shared/ipc.ts";
import { signal } from "../shared/theme.tsx";
import { Shortcut } from "../shared/shortcut.tsx";
import { ipcMessage } from "./state.ts";
import type { ByokState, SettingsState } from "./state.ts";

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", width: "100%" },
  row: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 24,
    paddingBlock: 22,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--color-border)",
  },
  label: { display: "flex", flexDirection: "column", gap: 4 },
  labelTitle: { fontSize: 14, fontWeight: 600 },
  body: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
  inline: { display: "flex", alignItems: "flex-end", gap: 8 },
  fixed: { flexShrink: 0 },
  connected: { display: "flex", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  meter: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "var(--color-border)",
  },
  meterFill: { height: "100%", borderRadius: 999, transition: "width 80ms linear" },
  list: { margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 6 },
});

function Row({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.label)}>
        <Text xstyle={styles.labelTitle}>{title}</Text>
        {note && (
          <Text color="secondary" size="sm">
            {note}
          </Text>
        )}
      </div>
      <div {...stylex.props(styles.body)}>{children}</div>
    </div>
  );
}

function MetaKey({ byok }: { byok: ByokState }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await byok.save(key);
      setKey("");
    } catch (err) {
      setError(ipcMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const { status } = byok;
  return (
    <>
      {status?.hasKey ? (
        <div {...stylex.props(styles.connected)}>
          <span {...stylex.props(styles.dot)} style={{ backgroundColor: signal.ok }} />
          <Text>Connected · key ending in {status.hint}</Text>
        </div>
      ) : (
        <Text color="secondary">
          Free forever with your own key. Get one at{" "}
          <Link href="https://dev.meta.ai" target="_blank">
            dev.meta.ai
          </Link>
          .
        </Text>
      )}
      <div {...stylex.props(styles.inline)}>
        <TextInput
          type="password"
          label={status?.hasKey ? "Replace key" : "Meta Model API key"}
          placeholder="LLM_…"
          value={key}
          onChange={setKey}
          onEnter={() => void save()}
          status={error ? { type: "error", message: error } : undefined}
          width="100%"
        />
        <div {...stylex.props(styles.fixed)}>
          <Button
            label="Save"
            variant="primary"
            isDisabled={!key}
            isLoading={isSaving}
            onClick={() => void save()}
          />
        </div>
      </div>
      {status?.hasKey && (
        <div>
          <Button label="Remove key" variant="ghost" onClick={() => void byok.clear()} />
        </div>
      )}
      {status && !status.encryptionAvailable && (
        <Text color="secondary" size="sm">
          No system keychain was found, so the key would be stored unencrypted.
        </Text>
      )}
    </>
  );
}

/** Audio inputs by label; Windows lists "Default" and "Communications" aliases, which are skipped. */
function useMicrophones(): string[] {
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    const load = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(
        (device) =>
          device.kind === "audioinput" &&
          device.label &&
          device.deviceId !== "default" &&
          device.deviceId !== "communications",
      );
      setLabels([...new Set(inputs.map((device) => device.label))]);
    };
    void load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, []);
  return labels;
}

const TEST_MS = 5000;

/** Listens for a few seconds and shows the level, so the user can see which mic hears them. */
function MicTest({ microphone }: { microphone: string }) {
  const [level, setLevel] = useState<number | null>(null);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const test = async () => {
    stopRef.current?.();
    setError(null);
    setHeard(false);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const deviceId = microphone
        ? devices.find((device) => device.kind === "audioinput" && device.label === microphone)
            ?.deviceId
        : undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, autoGainControl: true },
      });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
        setLevel(rms);
        // Same threshold as the recording pill's "We can't hear you" hint.
        if (rms > 0.01) setHeard(true);
      }, 80);
      const stop = () => {
        clearInterval(timer);
        clearTimeout(timeout);
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        stopRef.current = null;
        setLevel(null);
      };
      const timeout = setTimeout(stop, TEST_MS);
      stopRef.current = stop;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const isTesting = level !== null;
  return (
    <>
      <div {...stylex.props(styles.connected)}>
        <Button
          label={isTesting ? "Listening…" : "Test microphone"}
          variant="secondary"
          isDisabled={isTesting}
          onClick={() => void test()}
        />
        <Text color="secondary" size="sm">
          {error
            ? `Couldn't open the microphone: ${error}`
            : isTesting
              ? heard
                ? "Hearing you."
                : "Say something…"
              : heard
                ? "This microphone works."
                : ""}
        </Text>
      </div>
      {isTesting && (
        <div {...stylex.props(styles.meter)}>
          <div
            {...stylex.props(styles.meterFill)}
            style={{
              width: `${Math.min(100, Math.sqrt(level / 0.3) * 100)}%`,
              backgroundColor: heard ? signal.ok : "var(--color-text-secondary)",
            }}
          />
        </div>
      )}
    </>
  );
}

const splitWords = (text: string) =>
  text
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);

/**
 * Prompt stack layer 4: who the user is. Edited locally and saved when focus leaves the form, so
 * the trimming done on save never fights the user's typing.
 */
function PersonalForm({ personal, onSave }: { personal: Personal; onSave: (p: Personal) => void }) {
  const [draft, setDraft] = useState({ ...personal, words: personal.dictionary.join(", ") });
  const save = () => onSave({ ...draft, dictionary: splitWords(draft.words) });
  return (
    <div {...stylex.props(styles.body)} onBlur={save}>
      <TextInput
        label="Your name"
        placeholder="Nikhil"
        value={draft.name}
        onChange={(name) => setDraft({ ...draft, name })}
        width="100%"
      />
      <TextArea
        label="About you"
        description="Your role and stack, so prompts have the right context."
        placeholder="Full-stack developer. We use Next.js, Supabase and pnpm."
        value={draft.about}
        rows={2}
        maxLength={300}
        onChange={(about) => setDraft({ ...draft, about })}
      />
      <TextArea
        label="Your words"
        description="Names and terms to always spell your way, separated by commas."
        placeholder="iVibe, Muse Spark, Supabase, Asha"
        value={draft.words}
        rows={2}
        onChange={(words) => setDraft({ ...draft, words })}
      />
      <TextArea
        label="Always"
        description="Standing instructions for every result."
        placeholder="Use pnpm, not npm. No emoji."
        value={draft.instructions}
        rows={2}
        maxLength={500}
        onChange={(instructions) => setDraft({ ...draft, instructions })}
      />
      <Switch
        label="Dictate in English"
        description="Translate Hindi or Hinglish when dictating. Prompts for AI agents are always in English."
        value={draft.dictationLanguage === "english"}
        onChange={(english) => {
          const next = {
            ...draft,
            dictationLanguage: english ? ("english" as const) : ("keep" as const),
          };
          setDraft(next);
          onSave({ ...next, dictionary: splitWords(next.words) });
        }}
      />
    </div>
  );
}

/** The settings, shown in a dialog over the app. */
export function SettingsPanel({
  info,
  byok,
  settings,
}: {
  info: AppInfo | null;
  byok: ByokState;
  settings: SettingsState;
}) {
  const current = settings.settings;
  const microphones = useMicrophones();
  const saved = current?.microphone ?? "";
  return (
    <div {...stylex.props(styles.panel)}>
      <Row
        title="Meta API key"
        note="Encrypted with your system keychain. Calls go from this device straight to Meta."
      >
        <MetaKey byok={byok} />
      </Row>

      <Row title="Personal" note="Used in every result: your name, context and the words you use.">
        {current ? (
          <PersonalForm
            personal={current.personal}
            onSave={(personal) => settings.change({ personal })}
          />
        ) : null}
      </Row>

      <Row title="Microphone" note="The one iVibe listens to while you record.">
        <Selector
          label="Microphone"
          options={[
            { value: "", label: "System default" },
            // A saved mic that is unplugged stays listed so the choice is visible.
            ...(saved && !microphones.includes(saved)
              ? [{ value: saved, label: `${saved} (not connected)` }]
              : []),
            ...microphones.map((label) => ({ value: label, label })),
          ]}
          value={saved}
          isDisabled={!current}
          onChange={(microphone) => settings.change({ microphone })}
          width="100%"
        />
        <MicTest microphone={saved} />
      </Row>

      <Row title="Output" note="Where the result goes when a recording ends.">
        <Switch
          label="Paste into the app I was using"
          description="Detects Claude Code, Cursor, ChatGPT and more. When off, or if you switch apps, the result is copied instead."
          value={current?.autoPaste ?? true}
          isDisabled={!current}
          onChange={(autoPaste) => settings.change({ autoPaste })}
        />
        <Switch
          label="Attach screenshots as proof"
          description="Fix mode only. Redacted screenshots are pasted into chat apps, or referenced as files for terminal agents."
          value={current?.proofImages ?? true}
          isDisabled={!current}
          onChange={(proofImages) => settings.change({ proofImages })}
        />
        <Switch
          label="Paste where I click next"
          description="If a result could only be copied, clicking into a text field pastes it there, screenshots included. Ctrl+Alt+V pastes the last result anywhere."
          value={current?.clickToPaste ?? true}
          isDisabled={!current || current.autoPaste === false}
          onChange={(clickToPaste) => settings.change({ clickToPaste })}
        />
      </Row>

      <Row title="Shortcut" note="Starts and stops a recording from any app.">
        <div {...stylex.props(styles.connected)}>
          <Shortcut isMac={info?.platform === "darwin"} />
          <Text color="secondary" size="sm">
            {info?.hotkeyRegistered === false ? "Taken by another app" : "Active"}
          </Text>
        </div>
      </Row>

      <Row title="Privacy" note="What happens to a recording.">
        <ul {...stylex.props(styles.list)}>
          <li>
            <Text size="sm">Frames and audio stay in memory on this device while you record.</Text>
          </li>
          <li>
            <Text size="sm">
              Every frame is read on-device, and keys, tokens and passwords are painted over.
            </Text>
          </li>
          <li>
            <Text size="sm">Only redacted frames and your narration are sent for analysis.</Text>
          </li>
        </ul>
      </Row>

      <Row title="About">
        <Text color="secondary" size="sm">
          iVibe {info ? `v${info.version}` : ""} · open source under AGPL-3.0 ·{" "}
          <Link href="https://github.com/nikylogic/ivibe" target="_blank">
            GitHub
          </Link>
        </Text>
      </Row>
    </div>
  );
}
