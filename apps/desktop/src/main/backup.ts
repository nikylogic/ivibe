// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { app, dialog, safeStorage } from "electron";
import type { BackupStatus, HistoryEntry, Settings } from "../shared/ipc.ts";
import {
  decryptObject,
  encryptObject,
  formatRecoveryKey,
  generateBackupKey,
  keyCheck,
  objectName,
  parseRecoveryKey,
} from "./backup-crypto.ts";
import { CloudError, backupCall, backupDownload, cloudStatus } from "./cloud.ts";
import { deleteStore, readStore, writeStore } from "./db.ts";
import { addHistory, listHistory, proofFolder } from "./history.ts";
import { pngToWebp, webpToPng } from "./image-codec.ts";
import { readSettings } from "./settings.ts";

/**
 * End-to-end encrypted backups for iVibe Pro (D28, docs/architecture.md §6.10).
 *
 * A backup is one encrypted snapshot (settings and History as JSON, Brotli-compressed) plus one
 * encrypted object per screenshot (WebP, quality 90), each uploaded once. The key never leaves
 * this computer except as the recovery key the user writes down; it is kept in the OS keychain
 * so scheduled backups run unattended. iVibe Cloud keeps the latest two snapshots; screenshots
 * neither of them uses are deleted.
 */

const DAY = 86_400_000;
const INTERVAL: Record<Exclude<Settings["backupFrequency"], "off">, number> = {
  daily: DAY,
  weekly: 7 * DAY,
  monthly: 30 * DAY,
};
const CHECK_EVERY_MS = 60 * 60_000;
const SNAPSHOTS_KEPT = 2;
const LOCAL = "backup.local";

/** Settings that travel with a backup; the microphone and first-run state belong to a device. */
const RESTORED_SETTINGS = [
  "mode",
  "appearance",
  "language",
  "autoPaste",
  "proofImages",
  "clickToPaste",
  "personal",
  "shortcuts",
  "keepHistory",
] as const satisfies readonly (keyof Settings)[];

interface Snapshot {
  version: 1;
  createdAt: number;
  settings: Partial<Settings>;
  history: (Omit<HistoryEntry, "proof"> & {
    proof: { title: string; line: string; object: string | null }[];
  })[];
}

/** What this computer remembers about the backup, in the local database. */
interface LocalState {
  /** Newest first: the snapshots this computer made or restored, and the screenshots each uses. */
  snapshots: { name: string; blobs: string[] }[];
  /** Screenshot file → its object in the backup, so each is uploaded once. */
  shots: Record<string, string>;
  lastBackupAt: number | null;
}

interface Remote {
  pro: boolean;
  setUp: boolean;
  keyCheck?: string;
  bytes?: number;
  lastBackupAt?: number | null;
  deleteAfter?: number | null;
  objects?: { name: string; size: number; createdAt: number }[];
}

export interface BackupHooks {
  /** Applies restored settings the way a change from the UI would. */
  applySettings: (change: Partial<Settings>) => void;
  historyChanged: () => void;
  onStatus: (status: BackupStatus) => void;
}

const keyFile = () => join(app.getPath("userData"), "backup-key.bin");

let hooks: BackupHooks | null = null;
let pendingKey: Buffer | null = null;
let busy: BackupStatus["busy"] = null;
let lastError: string | null = null;
let lastRemote: Remote | null = null;
let offline = false;

// --- Key and local state -------------------------------------------------------------------

function readKey(): Buffer | null {
  if (!existsSync(keyFile()) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return Buffer.from(safeStorage.decryptString(readFileSync(keyFile())), "hex");
  } catch {
    return null;
  }
}

function saveKey(key: Buffer): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage isn't available on this system, so the key can't be kept.");
  }
  writeFileSync(keyFile(), safeStorage.encryptString(key.toString("hex")), { mode: 0o600 });
}

function local(): LocalState {
  return readStore<LocalState>(LOCAL) ?? { snapshots: [], shots: {}, lastBackupAt: null };
}

function forget(): void {
  rmSync(keyFile(), { force: true });
  deleteStore(LOCAL);
}

// --- Status --------------------------------------------------------------------------------

async function fetchRemote(): Promise<Remote> {
  const remote = await backupCall<Remote>("/v1/backup");
  lastRemote = remote;
  offline = false;
  return remote;
}

function snapshotStatus(): BackupStatus {
  const signedIn = cloudStatus().signedIn;
  const remote = signedIn ? lastRemote : null;
  return {
    signedIn,
    pro: remote?.pro ?? false,
    setUp: remote?.setUp ?? false,
    keyOnDevice: readKey() !== null,
    lastBackupAt: remote?.lastBackupAt ?? local().lastBackupAt,
    bytes: remote?.bytes ?? 0,
    deleteAfter: remote?.deleteAfter ?? null,
    busy,
    error: lastError,
    offline: signedIn && offline,
  };
}

function publish(): BackupStatus {
  const status = snapshotStatus();
  hooks?.onStatus(status);
  return status;
}

export async function backupStatus(): Promise<BackupStatus> {
  if (!cloudStatus().signedIn) {
    lastRemote = null;
    return publish();
  }
  try {
    await fetchRemote();
  } catch (error) {
    if (error instanceof CloudError && error.code === "offline") offline = true;
  }
  return publish();
}

/** Runs one job at a time, keeping its failure for the UI. */
async function job<T>(kind: NonNullable<BackupStatus["busy"]>, work: () => Promise<T>): Promise<T> {
  if (busy) throw new Error("A backup is already running.");
  busy = kind;
  lastError = null;
  publish();
  try {
    return await work();
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    busy = null;
    await backupStatus();
  }
}

function matchingKey(remote: Remote, provided?: string): Buffer {
  if (!remote.setUp) throw new Error("There's no backup in iVibe Cloud yet.");
  const key = provided === undefined ? readKey() : parseRecoveryKey(provided);
  if (!key) {
    throw new Error(
      provided === undefined
        ? "Enter your recovery key to use this backup on this computer."
        : "That isn't a recovery key. It has 64 letters and numbers.",
    );
  }
  if (keyCheck(key) !== remote.keyCheck) {
    throw new Error("That recovery key doesn't match this backup.");
  }
  return key;
}

// --- Setup ---------------------------------------------------------------------------------

/** Step 1: a new key, shown to the user. Nothing is saved or uploaded until they confirm. */
export async function beginBackup(): Promise<string> {
  const remote = await fetchRemote();
  if (!remote.pro) throw new Error("Backups are part of iVibe Pro.");
  if (remote.setUp) throw new Error("A backup already exists. Connect it with its recovery key.");
  pendingKey = generateBackupKey();
  return formatRecoveryKey(pendingKey);
}

/** Step 2: the user typed the last group of the key back, so they have it. */
export async function confirmBackup(lastGroup: string): Promise<BackupStatus> {
  const key = pendingKey;
  if (!key) throw new Error("Start again: the recovery key was not created.");
  const expected = formatRecoveryKey(key).split(" ").at(-1)!;
  if (lastGroup.trim().toUpperCase() !== expected) {
    throw new Error("That doesn't match the last four characters of your recovery key.");
  }
  await backupCall("/v1/backup", {
    method: "POST",
    type: "application/json",
    body: JSON.stringify({ keyCheck: keyCheck(key) }),
  });
  saveKey(key);
  pendingKey = null;
  writeStore(LOCAL, { snapshots: [], shots: {}, lastBackupAt: null } satisfies LocalState);
  if (readSettings().backupFrequency === "off") hooks?.applySettings({ backupFrequency: "weekly" });
  await backupNow();
  return snapshotStatus();
}

/** Uses an existing backup on this computer, after checking the recovery key. */
export async function connectBackup(recoveryKey: string): Promise<BackupStatus> {
  const key = matchingKey(await fetchRemote(), recoveryKey);
  saveKey(key);
  return backupStatus();
}

export function revealRecoveryKey(): string {
  const key = pendingKey ?? readKey();
  if (!key) throw new Error("This computer doesn't have the recovery key.");
  return formatRecoveryKey(key);
}

export async function saveRecoveryKeyFile(): Promise<boolean> {
  const recoveryKey = revealRecoveryKey();
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save your iVibe recovery key",
    defaultPath: join(app.getPath("documents"), "iVibe recovery key.txt"),
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (canceled || !filePath) return false;
  writeFileSync(
    filePath,
    [
      "iVibe backup recovery key",
      "",
      recoveryKey,
      "",
      "Your iVibe backup is end-to-end encrypted with this key. iVibe can't read it or recover it.",
      "Keep this file somewhere safe, such as a password manager. You need it to restore your",
      "History on a new computer.",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  return true;
}

// --- Backing up ------------------------------------------------------------------------------

async function upload(key: Buffer, name: string, plaintext: Uint8Array): Promise<void> {
  const body = encryptObject(key, name, plaintext);
  await backupCall(`/v1/backup/objects/${name}`, {
    method: "PUT",
    type: "application/octet-stream",
    body: new Uint8Array(body),
  });
}

/**
 * Backs up History and settings. `replace` is needed when this computer never made or restored a
 * snapshot but one exists: backing up would replace another computer's History with this one's.
 */
export function backupNow(options: { replace?: boolean } = {}): Promise<void> {
  return job("backup", async () => {
    const remote = await fetchRemote();
    if (!remote.pro) throw new Error("Backups are part of iVibe Pro.");
    const key = matchingKey(remote);
    const state = local();
    const objects = remote.objects ?? [];
    const remoteNames = new Set(objects.map((object) => object.name));
    const known = state.snapshots.some((snapshot) => remoteNames.has(snapshot.name));
    if (!known && objects.some((object) => object.name.startsWith("s-")) && !options.replace) {
      throw new Error(
        "Restore your backup first. Backing up from this computer would replace it with this computer's History.",
      );
    }

    const history: Snapshot["history"] = [];
    for (const entry of listHistory()) {
      const proof: Snapshot["history"][number]["proof"] = [];
      for (const shot of entry.proof) {
        let name: string | undefined = state.shots[shot.file];
        if (!name || !remoteNames.has(name)) {
          if (!existsSync(shot.file)) {
            proof.push({ title: shot.title, line: shot.line, object: null });
            continue;
          }
          name = objectName("b");
          await upload(key, name, await pngToWebp(readFileSync(shot.file)));
          state.shots[shot.file] = name;
          remoteNames.add(name);
        }
        proof.push({ title: shot.title, line: shot.line, object: name });
      }
      history.push({ ...entry, proof });
    }

    const settings = readSettings();
    const snapshot: Snapshot = {
      version: 1,
      createdAt: Date.now(),
      settings: Object.fromEntries(RESTORED_SETTINGS.map((field) => [field, settings[field]])),
      history,
    };
    const name = objectName("s");
    await upload(key, name, brotliCompressSync(JSON.stringify(snapshot)));
    const blobs = [
      ...new Set(history.flatMap((entry) => entry.proof.flatMap((shot) => shot.object ?? []))),
    ];
    state.snapshots = [{ name, blobs }, ...state.snapshots].slice(0, SNAPSHOTS_KEPT);
    state.lastBackupAt = snapshot.createdAt;

    // Everything the kept snapshots don't use goes: older snapshots and unused screenshots.
    const keep = new Set(state.snapshots.flatMap((kept) => [kept.name, ...kept.blobs]));
    state.shots = Object.fromEntries(
      Object.entries(state.shots).filter(([, object]) => keep.has(object)),
    );
    writeStore(LOCAL, state);
    for (const object of objects) {
      if (!keep.has(object.name)) {
        await backupCall(`/v1/backup/objects/${object.name}`, { method: "DELETE" }).catch(
          () => undefined,
        );
      }
    }
  });
}

// --- Restore and export ----------------------------------------------------------------------

async function latestSnapshot(remote: Remote, key: Buffer) {
  const latest = (remote.objects ?? [])
    .filter((object) => object.name.startsWith("s-"))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) throw new Error("The backup has nothing in it yet.");
  const sealed = await backupDownload(`/v1/backup/objects/${latest.name}`);
  const snapshot = JSON.parse(
    brotliDecompressSync(decryptObject(key, latest.name, sealed)).toString("utf8"),
  ) as Snapshot;
  if (snapshot.version !== 1) throw new Error("This backup was made by a newer iVibe. Update it.");
  return { name: latest.name, snapshot };
}

async function screenshot(key: Buffer, object: string): Promise<Buffer> {
  return decryptObject(key, object, await backupDownload(`/v1/backup/objects/${object}`));
}

/** Brings the backup's History and settings onto this computer, next to what is already here. */
export function restoreBackup(recoveryKey?: string): Promise<number> {
  return job("restore", async () => {
    const remote = await fetchRemote();
    const key = matchingKey(remote, recoveryKey);
    const { name, snapshot } = await latestSnapshot(remote, key);
    const state = local();
    const entries: HistoryEntry[] = [];
    for (const entry of snapshot.history) {
      const proof: HistoryEntry["proof"] = [];
      for (const [index, shot] of entry.proof.entries()) {
        if (!shot.object) continue;
        const folder = proofFolder(entry.id);
        mkdirSync(folder, { recursive: true });
        const file = join(folder, `proof-${index + 1}.png`);
        writeFileSync(file, await webpToPng(await screenshot(key, shot.object)));
        state.shots[file] = shot.object;
        proof.push({ title: shot.title, line: shot.line, file });
      }
      entries.push({ ...entry, proof });
    }
    addHistory(...entries);
    hooks?.historyChanged();
    hooks?.applySettings(snapshot.settings);
    saveKey(key);
    const blobs = snapshot.history.flatMap((entry) => entry.proof.flatMap((s) => s.object ?? []));
    state.snapshots = [{ name, blobs: [...new Set(blobs)] }];
    state.lastBackupAt = snapshot.createdAt;
    writeStore(LOCAL, state);
    return entries.length;
  });
}

const markdown = (snapshot: Snapshot) =>
  [
    "# iVibe History",
    "",
    `Exported from an iVibe backup made on ${new Date(snapshot.createdAt).toLocaleString()}.`,
    "",
    ...snapshot.history.flatMap((entry) => [
      `## ${new Date(entry.createdAt).toLocaleString()} · ${entry.mode} · ${entry.targetName}`,
      "",
      entry.text,
      "",
      ...entry.proof.flatMap((shot, index) =>
        shot.object ? [`![${shot.title}](screenshots/${entry.id}-${index + 1}.webp)`, ""] : [],
      ),
    ]),
  ].join("\n");

/** Saves the backup, decrypted, as plain files in a folder the user picks. */
export function exportBackup(recoveryKey?: string): Promise<string | null> {
  return job("export", async () => {
    const remote = await fetchRemote();
    const key = matchingKey(remote, recoveryKey);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choose where to save your iVibe data",
      defaultPath: app.getPath("documents"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return null;
    const { snapshot } = await latestSnapshot(remote, key);
    const stamp = new Date(snapshot.createdAt).toISOString().slice(0, 10);
    const folder = join(filePaths[0], `iVibe backup ${stamp}`);
    mkdirSync(join(folder, "screenshots"), { recursive: true });
    const history = [];
    for (const entry of snapshot.history) {
      const proof = [];
      for (const [index, shot] of entry.proof.entries()) {
        if (!shot.object) continue;
        const file = `screenshots/${entry.id}-${index + 1}.webp`;
        writeFileSync(join(folder, file), await screenshot(key, shot.object));
        proof.push({ title: shot.title, line: shot.line, file });
      }
      history.push({ ...entry, proof });
    }
    writeFileSync(join(folder, "history.json"), JSON.stringify(history, null, 2));
    writeFileSync(join(folder, "settings.json"), JSON.stringify(snapshot.settings, null, 2));
    writeFileSync(join(folder, "history.md"), markdown(snapshot));
    return folder;
  });
}

/** "Delete backup" and "Start over": removes it from iVibe Cloud and forgets the key here. */
export async function deleteBackup(): Promise<BackupStatus> {
  await backupCall("/v1/backup", { method: "DELETE" });
  forget();
  pendingKey = null;
  lastError = null;
  hooks?.applySettings({ backupFrequency: "off" });
  return backupStatus();
}

// --- Schedule --------------------------------------------------------------------------------

async function runIfDue(): Promise<void> {
  const { backupFrequency } = readSettings();
  if (backupFrequency === "off" || busy || !cloudStatus().signedIn || !readKey()) return;
  const last = local().lastBackupAt ?? 0;
  if (Date.now() - last < INTERVAL[backupFrequency]) return;
  // A failure is shown in Settings → iVibe Cloud → Backup and retried at the next check.
  await backupNow().catch((error: unknown) =>
    console.warn("Scheduled backup failed:", error instanceof Error ? error.message : error),
  );
}

/** Checks shortly after launch, then hourly; a backup missed while iVibe was closed runs then. */
export function startBackups(next: BackupHooks): void {
  hooks = next;
  setTimeout(() => void runIfDue(), 30_000);
  setInterval(() => void runIfDue(), CHECK_EVERY_MS);
}
