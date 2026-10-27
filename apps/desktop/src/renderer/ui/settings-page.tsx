// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Info, KeyRound, Mic, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import type { Personal } from "@ivibe/engine";
import type { AppInfo, OutputMode, ShortcutStatus } from "../../shared/ipc.ts";
import { PASTE_SHORTCUT } from "../../shared/shortcuts.ts";
import { signal } from "../shared/theme.tsx";
import { Shortcut } from "../shared/shortcut.tsx";
import { ShortcutButton } from "./shortcut-button.tsx";
import { ipcMessage } from "./state.ts";
import type { ByokState, SettingsState } from "./state.ts";

const styles = stylex.create({
  // A fixed height, so switching sections doesn't make the dialog jump.
  panel: {
    display: "grid",
    gridTemplateColumns: "212px 1fr",
    height: "min(620px, 82vh)",
    width: "100%",
  },
  sections: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: 12,
    paddingTop: 20,
    backgroundColor: "var(--color-background-muted)",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "var(--color-border)",
  },
  sectionsTitle: { fontSize: 13, fontWeight: 600, paddingInline: 10, paddingBottom: 10 },
  sectionButton: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    height: 36,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-background-surface)",
    },
    color: "var(--color-text-secondary)",
    fontFamily: "inherit",
    fontSize: 14,
    textAlign: "start",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "2px solid var(--color-border-emphasized)" },
  },
  sectionSelected: {
    backgroundColor: {
      default: "var(--color-background-body)",
      ":hover": "var(--color-background-body)",
    },
    color: "var(--color-text-primary)",
    fontWeight: 500,
    boxShadow: "0 1px 2px var(--color-shadow)",
  },
  content: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  header: { paddingTop: 20, paddingInline: 24, paddingBottom: 4 },
  scroll: { flex: 1, overflowY: "auto", paddingInline: 24, paddingBottom: 24 },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingBlock: 20,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--color-border)",
  },
  label: { display: "flex", flexDirection: "column", gap: 2 },
  labelTitle: { fontSize: 14, fontWeight: 600 },
  shortcutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 36,
  },
  // Lines the fixed paste keys up with the editable ones, which have padding for their border.
  fixedKeys: { paddingInline: 9 },
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

/** One group in a section; the title is left out when the section header says it all. */
function Row({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.row)}>
      {(title || note) && (
        <div {...stylex.props(styles.label)}>
          {title && <Text xstyle={styles.labelTitle}>{title}</Text>}
          {note && (
            <Text color="secondary" size="sm">
              {note}
            </Text>
          )}
        </div>
      )}
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

export type SettingsSection = "general" | "key" | "personal" | "microphone" | "privacy" | "about";

const SECTIONS: { id: SettingsSection; label: string; note: string; icon: typeof Mic }[] = [
  {
    id: "general",
    label: "General",
    note: "Where results go and the shortcuts that work from any app.",
    icon: SlidersHorizontal,
  },
  {
    id: "key",
    label: "Meta API key",
    note: "Encrypted with your system keychain. Calls go from this device straight to Meta.",
    icon: KeyRound,
  },
  {
    id: "personal",
    label: "Personal",
    note: "Used in every result: your name, context and the words you use.",
    icon: UserRound,
  },
  {
    id: "microphone",
    label: "Microphone",
    note: "The one iVibe listens to while you record.",
    icon: Mic,
  },
  { id: "privacy", label: "Privacy", note: "What happens to a recording.", icon: ShieldCheck },
  { id: "about", label: "About", note: "Version, license and source.", icon: Info },
];

/** Keeping results on this device, and wiping them. */
function HistorySettings({ settings }: { settings: SettingsState }) {
  const [cleared, setCleared] = useState(false);
  const current = settings.settings;
  return (
    <Row title="History" note="Results are kept on this device only, up to the last 200.">
      <Switch
        label="Keep history"
        description="Save each result, with its screenshots, so you can read or paste it again."
        value={current?.keepHistory ?? true}
        isDisabled={!current}
        onChange={(keepHistory) => settings.change({ keepHistory })}
      />
      <div {...stylex.props(styles.connected)}>
        <Button
          label="Clear history"
          variant="secondary"
          onClick={() => void window.ivibe.history.clear().then(() => setCleared(true))}
        />
        {cleared && (
          <Text color="secondary" size="sm">
            History and its screenshots were deleted.
          </Text>
        )}
      </div>
    </Row>
  );
}

const SHORTCUT_ROWS: { mode: OutputMode; label: string }[] = [
  { mode: "dictate", label: "Dictate" },
  { mode: "fix", label: "Fix" },
  { mode: "prompt", label: "Prompt" },
];

/** The settings, shown in a dialog over the app: sections on the left, one at a time on the right. */
export function SettingsPanel({
  section,
  onSectionChange,
  onClose,
  info,
  byok,
  settings,
  shortcutStatus,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  info: AppInfo | null;
  byok: ByokState;
  settings: SettingsState;
  shortcutStatus: ShortcutStatus | null;
}) {
  const current = settings.settings;
  const microphones = useMicrophones();
  const saved = current?.microphone ?? "";
  const isMac = info?.platform === "darwin";
  const active = SECTIONS.find((candidate) => candidate.id === section) ?? SECTIONS[0]!;

  return (
    <div {...stylex.props(styles.panel)}>
      <nav {...stylex.props(styles.sections)} aria-label="Settings sections">
        <Text xstyle={styles.sectionsTitle}>Settings</Text>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={id === active.id ? "page" : undefined}
            onClick={() => onSectionChange(id)}
            {...stylex.props(styles.sectionButton, id === active.id && styles.sectionSelected)}
          >
            <Icon size={17} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div {...stylex.props(styles.content)}>
        <DialogHeader
          title={active.label}
          subtitle={active.note}
          onOpenChange={onClose}
          xstyle={styles.header}
        />
        <div {...stylex.props(styles.scroll)}>
          {active.id === "general" && (
            <>
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
                  description="If a result could only be copied, clicking into a text field pastes it there, screenshots included."
                  value={current?.clickToPaste ?? true}
                  isDisabled={!current || current.autoPaste === false}
                  onChange={(clickToPaste) => settings.change({ clickToPaste })}
                />
              </Row>
              <Row
                title="Shortcuts"
                note="These work from any app. Press a mode's shortcut to start recording in that mode, and any of them to stop. Click one to change it."
              >
                {SHORTCUT_ROWS.map(({ mode, label }) => (
                  <div key={mode} {...stylex.props(styles.shortcutRow)}>
                    <Text size="sm">{label}</Text>
                    <ShortcutButton
                      mode={mode}
                      settings={settings}
                      status={shortcutStatus}
                      isMac={isMac}
                      align="end"
                    />
                  </div>
                ))}
                <div {...stylex.props(styles.shortcutRow)}>
                  <Text size="sm">Paste the last result</Text>
                  <div {...stylex.props(styles.fixedKeys)}>
                    <Shortcut accelerator={PASTE_SHORTCUT} isMac={isMac} />
                  </div>
                </div>
                {current?.shortcuts.dictate === "Capslock" && (
                  <Text color="secondary" size="sm">
                    While iVibe runs, Caps Lock records instead of switching to capitals.
                  </Text>
                )}
              </Row>
            </>
          )}

          {active.id === "key" && (
            <Row>
              <MetaKey byok={byok} />
            </Row>
          )}

          {active.id === "personal" && current && (
            <Row>
              <PersonalForm
                personal={current.personal}
                onSave={(personal) => settings.change({ personal })}
              />
            </Row>
          )}

          {active.id === "microphone" && (
            <Row>
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
          )}

          {active.id === "privacy" && <HistorySettings settings={settings} />}

          {active.id === "privacy" && (
            <Row title="What happens to a recording">
              <ul {...stylex.props(styles.list)}>
                <li>
                  <Text size="sm">
                    Frames and audio stay in memory on this device while you record.
                  </Text>
                </li>
                <li>
                  <Text size="sm">
                    Every frame is read on-device, and keys, tokens and passwords are painted over.
                  </Text>
                </li>
                <li>
                  <Text size="sm">
                    Only redacted frames and your narration are sent for analysis.
                  </Text>
                </li>
                <li>
                  <Text size="sm">
                    Your Meta key never leaves this device, and requests ask Meta not to store
                    anything.
                  </Text>
                </li>
              </ul>
            </Row>
          )}

          {active.id === "about" && (
            <Row>
              <Text size="sm">iVibe {info ? `v${info.version}` : ""}</Text>
              <Text color="secondary" size="sm">
                Open source under AGPL-3.0 ·{" "}
                <Link href="https://github.com/nikylogic/ivibe" target="_blank">
                  GitHub
                </Link>
              </Text>
            </Row>
          )}
        </div>
      </div>
    </div>
  );
}
