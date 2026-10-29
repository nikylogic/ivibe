// SPDX-License-Identifier: AGPL-3.0-only

import { Fragment, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  Cloud,
  CreditCard,
  Info,
  Keyboard,
  KeyRound,
  Languages,
  Mic,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import {
  SUGGESTED_SPOKEN_LANGUAGES,
  LANGUAGES as SPEECH_LANGUAGES,
  MAX_SPOKEN_LANGUAGES,
  isLanguage,
  isOutputLanguage,
} from "@ivibe/engine";
import type { Personal } from "@ivibe/engine";
import type {
  AppInfo,
  Appearance,
  CloudUsage,
  OutputMode,
  ShortcutStatus,
  UpdateStatus,
} from "../../shared/ipc.ts";
import { LANGUAGES, isAppLanguage } from "../../shared/languages.ts";
import { PASTE_SHORTCUT, defaultShortcuts } from "../../shared/shortcuts.ts";
import { signal } from "../shared/theme.tsx";
import { Shortcut } from "../shared/shortcut.tsx";
import { Row } from "./settings-row.tsx";
import { BackupSettings } from "./backup-section.tsx";
import { ShortcutButton } from "./shortcut-button.tsx";
import { PillChoice } from "./pill-choice.tsx";
import {
  ipcMessage,
  isPro,
  neverStarted,
  planNote,
  trialNote,
  useBackup,
  useUpdate,
} from "./state.ts";
import type { ByokState, CloudState, SettingsState } from "./state.ts";

const styles = stylex.create({
  // Laid out like the other pages: a centred column with a display title.
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
    maxWidth: 720,
    marginInline: "auto",
    paddingBlock: 24,
    paddingInline: 40,
  },
  hero: { display: "flex", flexDirection: "column", gap: 10 },
  display: { fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.01em" },
  section: { display: "flex", flexDirection: "column" },
  label: { display: "flex", flexDirection: "column", gap: 2 },
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
  plan: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
  },
  buttons: { display: "flex", gap: 8 },
  usage: { display: "flex", flexDirection: "column", gap: 12 },
  balance: { fontSize: 28, fontWeight: 600, lineHeight: 1.1 },
  table: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    columnGap: 16,
    rowGap: 6,
    alignItems: "baseline",
  },
  number: { textAlign: "end", fontVariantNumeric: "tabular-nums" },
  dot: { width: 8, height: 8, borderRadius: 999 },
  meter: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "var(--color-border)",
  },
  meterFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width var(--motion-micro) linear",
  },
  list: { margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 6 },
});

/** One group in a section; the title is left out when the section header says it all. */
/** iVibe Pro (D26): what it gives, where the subscription stands, and the way to buy or manage it. */
function updateNote(update: UpdateStatus): string {
  switch (update.phase) {
    case "checking":
      return "Checking for updates…";
    case "latest":
      return "You're up to date.";
    case "available":
      return `iVibe ${update.version} is available. Download it and install it over this one.`;
    case "downloading":
      return `Downloading iVibe ${update.version}… ${update.percent}%`;
    case "ready":
      return `iVibe ${update.version} is ready. Restart to update.`;
    case "error":
      return update.message;
    case "idle":
      return "iVibe checks for updates when it opens and every few hours.";
  }
}

function Updates() {
  const update = useUpdate();
  if (!update) return null;
  const busy = update.phase === "checking" || update.phase === "downloading";
  return (
    <>
      <Text color="secondary" size="sm">
        {updateNote(update)}
      </Text>
      <div {...stylex.props(styles.buttons)}>
        {update.phase === "ready" || update.phase === "available" ? (
          <Button
            label={update.phase === "ready" ? "Restart to update" : "Download"}
            variant="primary"
            onClick={() => void window.ivibe.app.update.install()}
          />
        ) : (
          <Button
            label="Check for updates"
            variant="secondary"
            isLoading={busy}
            isDisabled={busy}
            onClick={() => void window.ivibe.app.update.check()}
          />
        )}
      </div>
    </>
  );
}

function ProPlan({ cloud }: { cloud: CloudState }) {
  const status = cloud.status;
  if (!status) return null;
  if (!status.signedIn) {
    return (
      <>
        <Text color="secondary">
          iVibe Pro is part of iVibe Cloud. Sign in with GitHub first; you'll get free credits to
          try it before you pay anything.
        </Text>
        <div>
          <Button
            label={status.pending ? "Waiting for the browser…" : "Sign in with GitHub"}
            variant="primary"
            isLoading={status.pending}
            onClick={cloud.signIn}
          />
        </div>
      </>
    );
  }
  const offer = status.planOffer;
  const pro = isPro(status);
  const note = planNote(status);
  // A plan that once ran can be managed (invoices, card); a declined first checkout can't.
  const hadPlan = !!status.plan && !neverStarted(status);
  return (
    <div {...stylex.props(styles.plan)}>
      <Text weight="semibold">iVibe Pro{offer ? ` · ${offer.price}` : ""}</Text>
      <Text color="secondary" size="sm">
        {offer?.credits ?? 400} credits every month, no API key needed. Credits reset at each
        renewal, so unused ones don't carry over. Pro runs use Meta's standard models, which Meta
        doesn't train on.
      </Text>
      {note && <Text size="sm">{note}</Text>}
      {status.message && <Text size="sm">{status.message}</Text>}
      <div {...stylex.props(styles.buttons)}>
        {!pro &&
          (offer?.available ? (
            <Button
              label={hadPlan ? "Get Pro again" : "Get Pro"}
              variant="primary"
              onClick={() => cloud.billing("checkout")}
            />
          ) : (
            <Text color="secondary" size="sm">
              Coming soon.
            </Text>
          ))}
        {hadPlan && (
          <Button
            label="Manage subscription"
            variant="secondary"
            onClick={() => cloud.billing("portal")}
          />
        )}
      </div>
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  transcribe: "Live captions",
  dictate: "Dictation",
  prompt: "Prompts",
  fix: "Fix reports",
};

const formatCredits = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Billing → Usage: the exact balance and where credits went this period, read fresh from the
 * server (the sidebar deliberately shows no numbers). Refreshes whenever a run changes the
 * balance.
 */
function Usage({ cloud }: { cloud: CloudState }) {
  const [usage, setUsage] = useState<CloudUsage | null | undefined>(undefined);
  const credits = cloud.status?.credits;
  useEffect(() => {
    let live = true;
    void window.ivibe.cloud.usage().then((next) => live && setUsage(next));
    return () => {
      live = false;
    };
  }, [credits]);

  if (usage === undefined) return <Text color="secondary">Loading usage…</Text>;
  if (usage === null) {
    return <Text color="secondary">Usage couldn't be loaded. Check your connection.</Text>;
  }
  const since = new Date(usage.period.from).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <div {...stylex.props(styles.usage)}>
      <div>
        <Text color="secondary" size="sm">
          Credits available
        </Text>
        <div {...stylex.props(styles.balance)}>{formatCredits(usage.available)}</div>
        <Text color="secondary" size="sm">
          About ${(usage.available / 100).toFixed(2)} of AI usage. 1 credit = 1 cent.
          {usage.held > 0 && ` ${formatCredits(usage.held)} reserved for a run in progress.`}
        </Text>
      </div>

      <Text weight="semibold">
        {usage.period.kind === "billing" ? `This billing period (since ${since})` : "Last 30 days"}
      </Text>
      <div {...stylex.props(styles.table)}>
        {usage.byKind.length === 0 && (
          <Text color="secondary" size="sm">
            Nothing used yet.
          </Text>
        )}
        {usage.byKind.map((row) => (
          <Fragment key={row.kind}>
            <Text size="sm">{KIND_LABELS[row.kind] ?? row.kind}</Text>
            <Text size="sm" color="secondary" xstyle={styles.number}>
              {row.runs} {row.kind === "transcribe" ? "clips" : row.runs === 1 ? "run" : "runs"}
            </Text>
            <Text size="sm" xstyle={styles.number}>
              {formatCredits(row.credits)}
            </Text>
          </Fragment>
        ))}
        <Text size="sm" weight="semibold">
          Used
        </Text>
        <span />
        <Text size="sm" weight="semibold" xstyle={styles.number}>
          {formatCredits(usage.spent)}
        </Text>
        {usage.added > 0 && (
          <>
            <Text size="sm" color="secondary">
              Added
            </Text>
            <span />
            <Text size="sm" color="secondary" xstyle={styles.number}>
              +{formatCredits(usage.added)}
            </Text>
          </>
        )}
      </div>

      {usage.recent.length > 0 && (
        <>
          <Text weight="semibold">Recent recordings</Text>
          <div {...stylex.props(styles.table)}>
            {usage.recent.map((run) => (
              <Fragment key={run.at + run.kind}>
                <Text size="sm">{KIND_LABELS[run.kind] ?? run.kind}</Text>
                <Text size="sm" color="secondary" xstyle={styles.number}>
                  {new Date(run.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <Text size="sm" xstyle={styles.number}>
                  {formatCredits(run.credits)}
                </Text>
              </Fragment>
            ))}
          </div>
        </>
      )}

      <Text color="secondary" size="sm">
        You pay for what Meta's models actually use: a dictation is usually well under 1 credit, a
        Fix report a few credits. Live captions are charged per second of audio. Pro credits reset
        at each renewal and don't carry over.
      </Text>
    </div>
  );
}

/** D25: free-credit runs go to Meta's contributor model; say so wherever the trial is offered. */
const TRIAL_MODEL_NOTE =
  "Free-credit runs use Meta's contributor model, so Meta may use them to improve its models. Runs with your own Meta key never do.";

function CloudAccount({ cloud, byok }: { cloud: CloudState; byok: ByokState }) {
  const { status } = cloud;
  if (!status) return null;
  const pro = status.tier === "pro";
  const message = status.message && <Text color="secondary">{status.message}</Text>;
  if (!status.signedIn) {
    return (
      <>
        <Text color="secondary">
          Sign in with GitHub to get {status.trialCredits ?? 50} free credits. No API key needed. 1
          credit is 1 cent of AI usage: about 10 Fix runs or 100 dictations. They start with your
          first recording.
        </Text>
        <Text color="secondary" size="sm">
          {TRIAL_MODEL_NOTE}
        </Text>
        {message}
        <div>
          <Button
            label={status.pending ? "Waiting for the browser…" : "Sign in with GitHub"}
            variant="primary"
            isLoading={status.pending}
            onClick={cloud.signIn}
          />
        </div>
      </>
    );
  }
  return (
    <>
      <div {...stylex.props(styles.connected)}>
        <span {...stylex.props(styles.dot)} style={{ backgroundColor: signal.ok }} />
        <Text>
          Signed in as {status.login} ·{" "}
          {pro
            ? `Pro · ${status.credits ?? "…"} credits left`
            : status.trial === "available"
              ? `${status.trialCredits ?? 50} free credits`
              : `${status.credits ?? "…"} credits left`}
        </Text>
      </div>
      {pro && planNote(status) && <Text color="secondary">{planNote(status)}</Text>}
      {!pro && trialNote(status) && <Text color="secondary">{trialNote(status)}</Text>}
      {status.tier === "trial" && !byok.status?.hasKey && (
        <Text color="secondary" size="sm">
          {TRIAL_MODEL_NOTE}
        </Text>
      )}
      {message}
      {byok.status?.hasKey && (
        <Text color="secondary" size="sm">
          You also have your own Meta key. Choose which one recordings use in Meta API key.
        </Text>
      )}
      <div>
        <Button label="Sign out" variant="ghost" onClick={cloud.signOut} />
      </div>
    </>
  );
}

/**
 * Signed in and holding a key (D29): which one recordings run on, and whether the other takes
 * over when it can't (credits used up, key refused).
 */
function RunOnSettings({ cloud, settings }: { cloud: CloudState; settings: SettingsState }) {
  const current = settings.settings;
  const pro = cloud.status?.tier === "pro";
  const credits = pro ? "iVibe Pro credits" : "iVibe Cloud credits";
  const runOn = current?.runOn ?? "auto";
  const first = runOn === "auto" ? (pro ? "cloud" : "key") : runOn;
  return (
    <Row
      title="Which one recordings use"
      note={`You have your own Meta key and ${credits}. Pick the one to use first.`}
    >
      <div>
        <SegmentedControl
          label="Use first"
          value={first}
          isDisabled={!current}
          onChange={(value) => settings.change({ runOn: value as "cloud" | "key" })}
        >
          <SegmentedControlItem value="cloud" label={credits} />
          <SegmentedControlItem value="key" label="My Meta key" />
        </SegmentedControl>
      </div>
      <Switch
        label={
          first === "cloud" ? "Use my key when credits run out" : `Use ${credits} if my key fails`
        }
        description={
          first === "cloud"
            ? "Recordings carry on with your own key instead of stopping."
            : "If Meta refuses your key (expired, out of quota, rate limited), the recording carries on with your credits."
        }
        value={current?.runFallback ?? true}
        isDisabled={!current}
        onChange={(runFallback) => settings.change({ runFallback })}
      />
    </Row>
  );
}

function MetaKey({ byok, pro }: { byok: ByokState; pro: boolean }) {
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
      ) : pro ? (
        <Text color="secondary">
          Optional on Pro: add your own key to keep recording if your Pro credits run out. Get one
          at{" "}
          <Link href="https://dev.meta.ai" target="_blank">
            dev.meta.ai
          </Link>
          .
        </Text>
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
    </div>
  );
}

/** "Hindi · हिन्दी"; English needs no second name. */
const LANGUAGE_OPTIONS = SPEECH_LANGUAGES.map(({ name, native }) => ({
  value: name,
  label: native === name ? name : `${name} · ${native}`,
}));

/** What recognition listens for and what results are written in (engine/languages.ts). */
function LanguageSettings({ settings }: { settings: SettingsState }) {
  const personal = settings.settings?.personal;
  if (!personal) return null;
  const save = (change: Partial<Personal>) =>
    settings.change({ personal: { ...personal, ...change } });
  const detect = personal.spokenLanguages.length === 0;

  return (
    <>
      <Row
        title="Languages you speak"
        note={`Recognition listens for these, including when you mix them in one sentence. Up to ${MAX_SPOKEN_LANGUAGES}.`}
      >
        <Switch
          label="Detect automatically"
          description="Works for any of the 25 supported languages. Choosing yours decides how words that fit either language are written, such as डेंगू or Dengue."
          value={detect}
          onChange={(on) => save({ spokenLanguages: on ? [] : [...SUGGESTED_SPOKEN_LANGUAGES] })}
        />
        {!detect && (
          <MultiSelector
            label="Languages you speak"
            isLabelHidden
            options={LANGUAGE_OPTIONS}
            value={personal.spokenLanguages}
            hasSearch
            searchPlaceholder="Search languages"
            triggerDisplay="badges"
            width="100%"
            // At least one stays chosen (none is what the switch above is for), at most three.
            onChange={(value) => {
              const spokenLanguages = value.filter(isLanguage).slice(0, MAX_SPOKEN_LANGUAGES);
              if (spokenLanguages.length > 0) save({ spokenLanguages });
            }}
          />
        )}
      </Row>
      <Row
        title="Write results in"
        note="Every mode writes in this language. Code, file names and error text are never translated."
      >
        <Selector
          label="Write results in"
          isLabelHidden
          options={[{ value: "auto", label: "Same as I speak" }, ...LANGUAGE_OPTIONS]}
          value={personal.outputLanguage}
          hasSearch
          onChange={(outputLanguage) => {
            if (isOutputLanguage(outputLanguage)) save({ outputLanguage });
          }}
          width={320}
        />
        {personal.outputLanguage !== "English" && (
          <Text color="secondary" size="sm">
            Fix and Prompt results go to AI coding agents, which usually work best in English.
          </Text>
        )}
      </Row>
    </>
  );
}

export type SettingsSection =
  | "general"
  | "system"
  | "shortcuts"
  | "cloud"
  | "billing"
  | "key"
  | "personal"
  | "microphone"
  | "privacy"
  | "about";

export const SECTIONS: { id: SettingsSection; label: string; note: string; icon: typeof Mic }[] = [
  {
    id: "general",
    label: "General",
    note: "How iVibe looks, its language, and where results go.",
    icon: SlidersHorizontal,
  },
  {
    id: "system",
    label: "System",
    note: "The languages you speak, and the one results are written in.",
    icon: Languages,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    note: "Keys that record and paste from any app.",
    icon: Keyboard,
  },
  {
    id: "cloud",
    label: "iVibe Cloud",
    note: "Your account, your credits, and encrypted backups.",
    icon: Cloud,
  },
  {
    id: "billing",
    label: "Billing",
    note: "iVibe Pro: monthly credits for iVibe Cloud, no API key needed.",
    icon: CreditCard,
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
export function SettingsPage({
  section,
  info,
  byok,
  cloud,
  settings,
  shortcutStatus,
}: {
  section: SettingsSection;
  info: AppInfo | null;
  byok: ByokState;
  cloud: CloudState;
  settings: SettingsState;
  shortcutStatus: ShortcutStatus | null;
}) {
  const current = settings.settings;
  const backup = useBackup();
  const microphones = useMicrophones();
  const saved = current?.microphone ?? "";
  const isMac = info?.platform === "darwin";
  const defaults = defaultShortcuts(info?.platform ?? "win32");
  const isDefault =
    current !== null &&
    (Object.keys(defaults) as OutputMode[]).every(
      (mode) => current.shortcuts[mode] === defaults[mode],
    );
  const usesCapsLock = Object.values(current?.shortcuts ?? {}).some((accelerator) =>
    accelerator.split("+").includes("Capslock"),
  );
  const active = SECTIONS.find((candidate) => candidate.id === section) ?? SECTIONS[0]!;

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.hero)}>
        <Heading level={1} xstyle={styles.display}>
          {active.label}
        </Heading>
        <Text color="secondary">{active.note}</Text>
      </div>
      <div>
        <div key={active.id} {...stylex.props(styles.section)}>
          {active.id === "general" && (
            <>
              <Row title="Appearance" note="Light or dark, or match your system.">
                <div>
                  <SegmentedControl
                    label="Appearance"
                    value={current?.appearance ?? "system"}
                    isDisabled={!current}
                    onChange={(appearance) =>
                      settings.change({ appearance: appearance as Appearance })
                    }
                  >
                    <SegmentedControlItem value="system" label="System" />
                    <SegmentedControlItem value="light" label="Light" />
                    <SegmentedControlItem value="dark" label="Dark" />
                  </SegmentedControl>
                </div>
              </Row>
              <Row title="Dictate" note="What happens to your words before they're pasted.">
                <Switch
                  label="Clean up with AI"
                  description="Removes filler words and self-corrections, fixes punctuation, and writes in your output language. Turn it off to paste your words as heard: faster, and it uses fewer credits."
                  value={current?.dictateCleanup ?? true}
                  isDisabled={!current}
                  onChange={(dictateCleanup) => settings.change({ dictateCleanup })}
                />
                <Switch
                  label="Edit selected text by voice"
                  description="Select text in any app, then dictate: say what to change (“make this more formal”, “translate to Hindi”) or dictate new words, and the result replaces the selection. Needs AI cleanup."
                  value={current?.editSelection ?? true}
                  isDisabled={!current || current.dictateCleanup === false}
                  onChange={(editSelection) => settings.change({ editSelection })}
                />
              </Row>
              <Row
                title="Recording pill"
                note="What shows at the bottom of the screen while you record."
              >
                <PillChoice settings={settings} />
                <Switch
                  label="Sounds"
                  description="A soft sound when recording starts and stops."
                  value={current?.sounds ?? true}
                  isDisabled={!current}
                  onChange={(sounds) => settings.change({ sounds })}
                />
              </Row>
              <Row title="Language" note="The language iVibe's screens are shown in.">
                <Selector
                  label="Language"
                  isLabelHidden
                  options={LANGUAGES.map(({ code, label }) => ({ value: code, label }))}
                  value={current?.language ?? "en"}
                  isDisabled={!current}
                  onChange={(language) => {
                    if (isAppLanguage(language)) settings.change({ language });
                  }}
                  width={240}
                />
                <Text color="secondary" size="sm">
                  More languages are coming soon.
                </Text>
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
                  description="If a result could only be copied, clicking into a text field pastes it there, screenshots included."
                  value={current?.clickToPaste ?? true}
                  isDisabled={!current || current.autoPaste === false}
                  onChange={(clickToPaste) => settings.change({ clickToPaste })}
                />
              </Row>
            </>
          )}

          {active.id === "system" && <LanguageSettings settings={settings} />}

          {active.id === "shortcuts" && (
            <>
              <Row
                title="Recording"
                note="Each mode has its own shortcut. Click one and press the new keys."
              >
                {SHORTCUT_ROWS.map(({ mode, label }) => (
                  <div key={mode} {...stylex.props(styles.shortcutRow)}>
                    <div {...stylex.props(styles.label)}>
                      <Text size="sm">{label}</Text>
                      {mode === "dictate" && info?.platform === "win32" && (
                        <Text color="secondary" size="sm">
                          Hold to talk, or double-press to go hands-free and again to stop.
                        </Text>
                      )}
                    </div>
                    <ShortcutButton
                      mode={mode}
                      settings={settings}
                      status={shortcutStatus}
                      isMac={isMac}
                      align="end"
                    />
                  </div>
                ))}
              </Row>
              <Row
                title="Pasting"
                note="Pastes the latest result into the app in front, screenshots included."
              >
                <div {...stylex.props(styles.shortcutRow)}>
                  <Text size="sm">Paste the last result</Text>
                  <div {...stylex.props(styles.fixedKeys)}>
                    <Shortcut accelerator={PASTE_SHORTCUT} isMac={isMac} />
                  </div>
                </div>
              </Row>
              <Row>
                <div {...stylex.props(styles.shortcutRow)}>
                  <Text color="secondary" size="sm">
                    {usesCapsLock
                      ? "While iVibe runs, Caps Lock records instead of switching to capitals."
                      : "Shortcuts work from any app while iVibe is running."}
                  </Text>
                  <div {...stylex.props(styles.fixed)}>
                    <Button
                      label="Reset to defaults"
                      variant="secondary"
                      size="sm"
                      isDisabled={!current || isDefault}
                      onClick={() => settings.change({ shortcuts: defaults })}
                    />
                  </div>
                </div>
              </Row>
            </>
          )}

          {active.id === "cloud" && (
            <>
              <Row>
                <CloudAccount cloud={cloud} byok={byok} />
              </Row>
              <BackupSettings status={backup} settings={settings} cloud={cloud} />
            </>
          )}

          {active.id === "billing" && (
            <>
              <Row>
                <ProPlan cloud={cloud} />
              </Row>
              {cloud.status?.signedIn && (
                <Row>
                  <Usage cloud={cloud} />
                </Row>
              )}
            </>
          )}

          {active.id === "key" && (
            <>
              <Row>
                <MetaKey byok={byok} pro={cloud.status?.tier === "pro"} />
              </Row>
              {byok.status?.hasKey && cloud.status?.signedIn && (
                <RunOnSettings cloud={cloud} settings={settings} />
              )}
            </>
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
              <Updates />
            </Row>
          )}
        </div>
      </div>
    </div>
  );
}
