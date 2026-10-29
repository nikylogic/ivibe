// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Copy, Download, FileDown, RotateCcw, ShieldCheck, UploadCloud } from "lucide-react";
import type { BackupFrequency, BackupStatus } from "../../shared/ipc.ts";
import { Row } from "./settings-row.tsx";
import { daysUntil, formatBytes, ipcMessage } from "./state.ts";
import type { CloudState, SettingsState } from "./state.ts";

/**
 * Settings → iVibe Cloud → Backup (D28, docs/architecture.md §6.10): end-to-end encrypted backups for iVibe Pro.
 * The recovery key is the only thing that can open a backup; this page makes sure people keep it.
 */

const styles = stylex.create({
  buttons: { display: "flex", gap: 8, flexWrap: "wrap" },
  key: {
    fontFamily: '"Cascadia Mono", Consolas, ui-monospace, monospace',
    fontSize: 15,
    letterSpacing: "0.04em",
    lineHeight: 1.7,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border-emphasized)",
    backgroundColor: "var(--color-background-muted)",
    userSelect: "all",
    wordSpacing: "0.3em",
  },
  list: {
    margin: 0,
    paddingInlineStart: 18,
    listStyleType: "disc",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  confirm: { maxWidth: 220 },
});

const icon = (Icon: typeof Copy) => <Icon size={16} strokeWidth={1.75} />;

const FREQUENCIES: { value: BackupFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const day = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function when(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `today, ${time}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `yesterday, ${time}`;
  return `${day(at)}, ${time}`;
}

/** Runs an action, keeping its error message for the page. */
function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async <T,>(work: () => Promise<T>, success?: (value: T) => string | null) => {
    setError(null);
    setDone(null);
    try {
      const value = await work();
      if (success) setDone(success(value));
      return value;
    } catch (err) {
      setError(ipcMessage(err));
      return undefined;
    }
  };
  return { error, done, run, setError };
}

function Messages({ error, done }: { error: string | null; done: string | null }) {
  return (
    <>
      {error && <Banner status="error" title={error} />}
      {done && <Banner status="success" title={done} />}
    </>
  );
}

const WHAT = (
  <ul {...stylex.props(styles.list)}>
    <li>
      <Text size="sm">Your History, screenshots and settings, on the schedule you pick.</Text>
    </li>
    <li>
      <Text size="sm">
        Encrypted on this computer before upload, with a key only you hold. iVibe can't read it.
      </Text>
    </li>
    <li>
      <Text size="sm">Restore it on a new computer with your recovery key.</Text>
    </li>
  </ul>
);

/** Showing a new key, then checking it was kept, then turning backup on. */
function Setup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [step, setStep] = useState<"intro" | "key" | "confirm">("intro");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const action = useAction();

  if (step === "intro") {
    return (
      <Row title="Backup" note="End-to-end encrypted, included with iVibe Pro.">
        {WHAT}
        <div {...stylex.props(styles.buttons)}>
          <Button
            label="Turn on backup"
            variant="primary"
            icon={icon(ShieldCheck)}
            onClick={() =>
              void action.run(async () => {
                setKey(await window.ivibe.backup.begin());
                setStep("key");
              })
            }
          />
        </div>
        <Messages {...action} />
      </Row>
    );
  }

  if (step === "key" && key) {
    return (
      <Row
        title="Your recovery key"
        note="This is the only way to open your backup. iVibe can't see it or recover it. Save it somewhere safe, such as a password manager."
      >
        <div {...stylex.props(styles.key)}>{key}</div>
        <div {...stylex.props(styles.buttons)}>
          <Button
            label="Copy"
            variant="secondary"
            icon={icon(Copy)}
            onClick={() => void navigator.clipboard.writeText(key)}
          />
          <Button
            label="Save as file"
            variant="secondary"
            icon={icon(FileDown)}
            onClick={() => void action.run(() => window.ivibe.backup.saveKey())}
          />
          <Button label="I've saved it" variant="primary" onClick={() => setStep("confirm")} />
        </div>
        <Messages {...action} />
      </Row>
    );
  }

  return (
    <Row
      title="Check your recovery key"
      note="Type the last four characters of your recovery key, to be sure you have it."
    >
      <div {...stylex.props(styles.confirm)}>
        <TextInput
          label="Last four characters"
          isLabelHidden
          placeholder="e.g. 7F3A"
          value={typed}
          onChange={setTyped}
          width="100%"
        />
      </div>
      <div {...stylex.props(styles.buttons)}>
        <Button label="Back" variant="ghost" onClick={() => setStep("key")} />
        <Button
          label="Turn on backup"
          variant="primary"
          isLoading={saving}
          isDisabled={typed.trim().length !== 4}
          onClick={() => {
            setSaving(true);
            void action
              .run(() => window.ivibe.backup.confirm(typed))
              .then((status) => status && onDone())
              .finally(() => setSaving(false));
          }}
        />
      </div>
      <Messages {...action} />
    </Row>
  );
}

/** A backup exists but this computer doesn't have its key yet. */
function Connect({ status }: { status: BackupStatus }) {
  const [key, setKey] = useState("");
  const action = useAction();
  const busy = status.busy !== null;
  return (
    <>
      <Row
        title="Use your backup on this computer"
        note="Enter your recovery key. It's 64 letters and numbers, from when you turned on backup."
      >
        <TextInput
          label="Recovery key"
          isLabelHidden
          placeholder="XXXX XXXX XXXX …"
          value={key}
          onChange={setKey}
          width="100%"
        />
        <div {...stylex.props(styles.buttons)}>
          <Button
            label="Restore to this computer"
            variant="primary"
            icon={icon(RotateCcw)}
            isLoading={status.busy === "restore"}
            isDisabled={!key.trim() || busy}
            onClick={() =>
              void action.run(
                () => window.ivibe.backup.restore(key),
                (count) => `Restored ${count} ${count === 1 ? "result" : "results"}.`,
              )
            }
          />
          <Button
            label="Download my data"
            variant="secondary"
            icon={icon(Download)}
            isLoading={status.busy === "export"}
            isDisabled={!key.trim() || busy}
            onClick={() =>
              void action.run(
                () => window.ivibe.backup.exportTo(key),
                (folder) => (folder ? `Saved to ${folder}` : null),
              )
            }
          />
        </div>
        <Messages {...action} />
      </Row>
      <DeleteRow
        title="Lost your recovery key?"
        note="Nobody can open the old backup without it. Start over to delete it and make a new one."
        label="Start over"
      />
    </>
  );
}

function DeleteRow({ title, note, label }: { title: string; note: string; label: string }) {
  const [sure, setSure] = useState(false);
  const action = useAction();
  return (
    <Row title={title} note={note}>
      <div {...stylex.props(styles.buttons)}>
        <Button
          label={sure ? "Delete permanently" : label}
          variant={sure ? "destructive" : "secondary"}
          onClick={() => {
            if (!sure) return setSure(true);
            void action.run(() => window.ivibe.backup.remove()).then(() => setSure(false));
          }}
        />
        {sure && <Button label="Cancel" variant="ghost" onClick={() => setSure(false)} />}
      </div>
      <Messages {...action} />
    </Row>
  );
}

/** Backing up from this computer: schedule, status, restore and download, the key, delete. */
function Manage({
  status,
  settings,
  cloud,
}: {
  status: BackupStatus;
  settings: SettingsState;
  cloud: CloudState;
}) {
  const [shownKey, setShownKey] = useState<string | null>(null);
  const action = useAction();
  const busy = status.busy !== null;
  const frequency = settings.settings?.backupFrequency ?? "off";
  const wouldReplace = (status.error ?? action.error ?? "").startsWith("Restore your backup first");
  const canBuy = !!cloud.status?.planOffer?.available;

  return (
    <>
      {status.deleteAfter !== null && (
        <Banner
          status="warning"
          title={`Your backup will be deleted on ${day(status.deleteAfter)}`}
          description={`Your Pro plan has ended, so backups have stopped. Renew Pro to keep it, or download it to this computer. ${daysUntil(status.deleteAfter)} days left.`}
          endContent={
            canBuy ? (
              <Button
                label="Renew Pro"
                size="sm"
                variant="primary"
                onClick={() => cloud.billing("checkout")}
              />
            ) : undefined
          }
        />
      )}

      <Row
        title="Automatic backup"
        note="Runs while iVibe is open. A backup that was due while it was closed runs at the next start."
      >
        <div>
          <SegmentedControl
            label="Automatic backup"
            value={frequency}
            isDisabled={!status.pro || !settings.settings}
            onChange={(value) => settings.change({ backupFrequency: value as BackupFrequency })}
          >
            {FREQUENCIES.map((entry) => (
              <SegmentedControlItem key={entry.value} value={entry.value} label={entry.label} />
            ))}
          </SegmentedControl>
        </div>
        <Text color="secondary" size="sm">
          {status.busy === "backup"
            ? "Backing up…"
            : status.lastBackupAt
              ? `Last backed up ${when(status.lastBackupAt)} · ${formatBytes(status.bytes)}`
              : "Not backed up yet."}
        </Text>
        <div {...stylex.props(styles.buttons)}>
          <Button
            label="Back up now"
            variant="primary"
            icon={icon(UploadCloud)}
            isLoading={status.busy === "backup"}
            isDisabled={!status.pro || busy}
            onClick={() =>
              void action.run(
                () => window.ivibe.backup.now(),
                () => "Backed up.",
              )
            }
          />
          <Button
            label="Restore to this computer"
            variant="secondary"
            icon={icon(RotateCcw)}
            isLoading={status.busy === "restore"}
            isDisabled={busy}
            onClick={() =>
              void action.run(
                () => window.ivibe.backup.restore(),
                (count) => `Restored ${count} ${count === 1 ? "result" : "results"}.`,
              )
            }
          />
          <Button
            label="Download my data"
            variant="secondary"
            icon={icon(Download)}
            isLoading={status.busy === "export"}
            isDisabled={busy}
            onClick={() =>
              void action.run(
                () => window.ivibe.backup.exportTo(),
                (folder) => (folder ? `Saved to ${folder}` : null),
              )
            }
          />
        </div>
        {wouldReplace && (
          <div {...stylex.props(styles.buttons)}>
            <Button
              label="Back up this computer instead"
              variant="ghost"
              isDisabled={busy}
              onClick={() =>
                void action.run(
                  () => window.ivibe.backup.now(true),
                  () => "Backed up.",
                )
              }
            />
          </div>
        )}
        <Messages error={action.error ?? (busy ? null : status.error)} done={action.done} />
      </Row>

      <Row
        title="Backup recovery key"
        note="You need it to restore on a new computer. Keep it somewhere safe."
      >
        {shownKey && <div {...stylex.props(styles.key)}>{shownKey}</div>}
        <div {...stylex.props(styles.buttons)}>
          <Button
            label={shownKey ? "Hide" : "Show recovery key"}
            variant="secondary"
            onClick={() =>
              shownKey
                ? setShownKey(null)
                : void action.run(async () => setShownKey(await window.ivibe.backup.reveal()))
            }
          />
          <Button
            label="Save as file"
            variant="secondary"
            icon={icon(FileDown)}
            onClick={() => void action.run(() => window.ivibe.backup.saveKey())}
          />
        </div>
      </Row>

      <DeleteRow
        title="Delete backup"
        note="Removes it from iVibe Cloud right away. History on this computer stays."
        label="Delete backup"
      />
    </>
  );
}

export function BackupSettings({
  status,
  settings,
  cloud,
}: {
  status: BackupStatus | null;
  settings: SettingsState;
  cloud: CloudState;
}) {
  if (!status) return null;

  // Signing in is the account row just above, on the same page.
  if (!status.signedIn) {
    return (
      <Row title="Backup" note="End-to-end encrypted, included with iVibe Pro. Sign in to use it.">
        {WHAT}
      </Row>
    );
  }

  if (status.offline && !status.setUp) {
    return (
      <Row title="Backup">
        <Text color="secondary">Couldn't reach iVibe Cloud. Check your connection.</Text>
      </Row>
    );
  }

  if (!status.setUp) {
    if (!status.pro) {
      const canBuy = !!cloud.status?.planOffer?.available;
      return (
        <Row title="Backup" note="End-to-end encrypted, included with iVibe Pro.">
          {WHAT}
          {canBuy && (
            <div {...stylex.props(styles.buttons)}>
              <Button
                label="Get iVibe Pro"
                variant="primary"
                onClick={() => cloud.billing("checkout")}
              />
            </div>
          )}
        </Row>
      );
    }
    return <Setup onDone={() => void window.ivibe.backup.status()} />;
  }

  if (!status.keyOnDevice) return <Connect status={status} />;
  return <Manage status={status} settings={settings} cloud={cloud} />;
}

const NOTICE_DAYS = [1, 7, 30];

function noticeKey(deleteAfter: number, days: number) {
  return `ivibe.backupNotice.${deleteAfter}.${days}`;
}

function wasDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * The Record page's reminder that a backup is about to be deleted after Pro ended (§6.10): shown
 * 30, 7 and 1 day before, each dismissable once.
 */
export function BackupNotice({
  status,
  onOpen,
}: {
  status: BackupStatus | null;
  onOpen: () => void;
}) {
  const [, setDismissed] = useState(0);
  if (!status?.setUp || status.deleteAfter === null) return null;
  const left = daysUntil(status.deleteAfter);
  const threshold = NOTICE_DAYS.find((days) => left <= days);
  if (threshold === undefined) return null;
  const key = noticeKey(status.deleteAfter, threshold);
  if (wasDismissed(key)) return null;
  return (
    <Banner
      status="warning"
      title={
        left <= 1
          ? "Your backup will be deleted tomorrow"
          : `Your backup will be deleted in ${left} days`
      }
      description="Your Pro plan has ended. Renew Pro to keep it, or download your data."
      endContent={<Button label="Open Backup" size="sm" variant="secondary" onClick={onOpen} />}
      isDismissable
      onDismiss={() => {
        try {
          localStorage.setItem(key, "1");
        } catch {
          // Shown again next launch; nothing lost.
        }
        setDismissed((count) => count + 1);
      }}
    />
  );
}
