// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, dialog, nativeImage, safeStorage } from "electron";
import type { HistoryEntry } from "../shared/ipc.ts";
import {
  backupNow,
  backupStatus,
  beginBackup,
  confirmBackup,
  deleteBackup,
  exportBackup,
  restoreBackup,
  startBackups,
} from "./backup.ts";
import { backupCall, cloudStatus, refreshCloud } from "./cloud.ts";
import { deleteStore } from "./db.ts";
import { addHistory, clearHistory, listHistory, proofFolder } from "./history.ts";
import { readSettings, updateSettings } from "./settings.ts";

/**
 * Dev only: `--ivibe-backup-test` runs a whole backup cycle against a Worker (normally
 * `wrangler dev` with local D1 and R2) as a signed-in Pro user: set up, incremental backups, a
 * "new computer" restore with the recovery key, the replace guard, export and delete.
 * IVIBE_API_URL points at the Worker and IVIBE_TEST_TOKEN is a session it knows.
 */

const log = (...parts: unknown[]) => console.log("IVIBE_BACKUPTEST", ...parts);

function check(condition: unknown, what: string): void {
  if (!condition) throw new Error(`failed: ${what}`);
  log("ok", what);
}

async function fails(work: () => Promise<unknown>, message: string, what: string) {
  try {
    await work();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    check(text.includes(message), `${what} (${text})`);
    return;
  }
  throw new Error(`failed: ${what} (it succeeded)`);
}

/** Called once the app is ready, instead of starting iVibe; exits with the result. */
export function startBackupSelfTest(): void {
  seedSession();
  startBackups({
    applySettings: (change) => updateSettings(change),
    historyChanged: () => undefined,
    onStatus: () => undefined,
  });
  void runBackupSelfTest().then((code) => app.exit(code));
}

/** Before the app reads its session: sign in as the test user. */
export function seedSession(): void {
  const token = process.env.IVIBE_TEST_TOKEN;
  if (!token) throw new Error("IVIBE_TEST_TOKEN is required");
  writeFileSync(
    join(app.getPath("userData"), "cloud.bin"),
    safeStorage.encryptString(JSON.stringify({ token, login: "backup-test" })),
  );
}

/** A screenshot-like image: flat panels and thin lines, the way an editor looks. */
function testScreenshot(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const line = y % 18 < 2 && x > 60 && x < 60 + ((y * 37) % 900);
      const shade = x < 240 ? 0x25 : line ? 0xd0 : 0x1a;
      pixels[i] = shade;
      pixels[i + 1] = line ? 0x9c : shade;
      pixels[i + 2] = shade;
      pixels[i + 3] = 0xff;
    }
  }
  return nativeImage.createFromBitmap(pixels, { width, height }).toPNG();
}

async function remoteObjects() {
  const remote = await backupCall<{ objects?: { name: string }[] }>("/v1/backup");
  const names = (remote.objects ?? []).map((object) => object.name);
  return {
    snapshots: names.filter((name) => name.startsWith("s-")).length,
    shots: names.filter((name) => name.startsWith("b-")).length,
  };
}

/** What a new computer has: no key, no backup state, no History. */
function wipeComputer(keepKey = false): void {
  if (!keepKey) rmSync(join(app.getPath("userData"), "backup-key.bin"), { force: true });
  deleteStore("backup.local");
  clearHistory();
}

async function runBackupSelfTest(): Promise<number> {
  try {
    await refreshCloud();
    check(cloudStatus().signedIn, "signed in");
    let status = await backupStatus();
    check(status.pro && !status.setUp, "Pro, with no backup yet");

    const png = testScreenshot(1280, 720);
    const first: HistoryEntry = {
      id: "backup-test-1",
      mode: "fix",
      createdAt: Date.now() - 60_000,
      targetName: "Claude Code",
      delivery: "pasted",
      text: "Fix the login button: it submits twice. नमस्ते, ünïcödé ✓",
      proof: [],
    };
    const file = join(proofFolder(first.id), "proof-1.png");
    mkdirSync(proofFolder(first.id), { recursive: true });
    writeFileSync(file, png);
    first.proof = [{ title: "Login form", file, line: "Screenshot 1: the button" }];
    const second: HistoryEntry = {
      ...first,
      id: "backup-test-2",
      mode: "dictate",
      createdAt: Date.now(),
      text: "Just a dictated note.",
      proof: [],
    };
    addHistory(first, second);
    const personal = readSettings().personal;
    updateSettings({ personal: { ...personal, name: "Backup Tester" }, backupFrequency: "off" });

    // Setup: the key is shown, and only the right last four characters turn it on.
    const recoveryKey = await beginBackup();
    check(/^([0-9A-F]{4} ){15}[0-9A-F]{4}$/.test(recoveryKey), "recovery key is 16 groups of 4");
    await fails(() => confirmBackup("0000"), "doesn't match", "a wrong confirmation is refused");
    status = await confirmBackup(recoveryKey.slice(-4).toLowerCase());
    check(status.setUp && status.keyOnDevice, "backup is set up, key kept on this computer");
    check(readSettings().backupFrequency === "weekly", "schedule turned on as weekly");
    status = await backupStatus();
    check(
      status.lastBackupAt !== null && status.bytes > 0,
      `first backup made (${status.bytes} B)`,
    );
    let objects = await remoteObjects();
    check(objects.snapshots === 1 && objects.shots === 1, "1 snapshot + 1 screenshot uploaded");

    // Incremental: the screenshot is uploaded once; two snapshots are kept.
    await backupNow();
    await backupNow();
    objects = await remoteObjects();
    check(objects.snapshots === 2 && objects.shots === 1, "later backups reuse the screenshot");

    // A new computer: nothing here but the recovery key the user wrote down.
    wipeComputer();
    updateSettings({ personal: { ...personal, name: "Someone else" } });
    status = await backupStatus();
    check(status.setUp && !status.keyOnDevice, "new computer sees the backup, without its key");
    await fails(() => backupNow(), "recovery key", "backing up needs the key first");
    await fails(() => restoreBackup("not a key"), "isn't a recovery key", "garbage key refused");
    await fails(() => restoreBackup("0".repeat(64)), "doesn't match", "another key is refused");
    const restored = await restoreBackup(recoveryKey.toLowerCase().replace(/ /g, "-"));
    check(restored === 2, "2 results restored");
    const history = listHistory();
    const back = history.find((entry) => entry.id === first.id);
    check(back?.text === first.text, "text restored exactly, unicode included");
    const shot = back?.proof[0];
    check(shot?.title === "Login form" && shot.line === first.proof[0]!.line, "proof restored");
    const size =
      shot && existsSync(shot.file) ? nativeImage.createFromPath(shot.file).getSize() : null;
    check(size?.width === 1280 && size.height === 720, "screenshot restored as a 1280×720 PNG");
    check(readSettings().personal.name === "Backup Tester", "settings restored");
    check((await backupStatus()).keyOnDevice, "key kept after restore");
    await backupNow();
    objects = await remoteObjects();
    check(objects.snapshots === 2 && objects.shots === 1, "backing up after restore reuses it");

    // Download my data.
    const out = join(app.getPath("temp"), "ivibe-backup-test-export");
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [out] })) as never;
    const folder = await exportBackup();
    check(folder !== null && existsSync(join(folder, "history.md")), "export writes history.md");
    const exported = JSON.parse(readFileSync(join(folder!, "history.json"), "utf8")) as unknown[];
    check(exported.length === 2, "export has both results");
    check(existsSync(join(folder!, "settings.json")), "export has settings.json");
    log("export folder", folder, readdirSync(join(folder!, "screenshots")));

    // A second computer that never restored must not replace the backup by accident.
    wipeComputer(true);
    await fails(() => backupNow(), "Restore your backup first", "replace guard");
    await backupNow({ replace: true });
    objects = await remoteObjects();
    check(objects.snapshots === 1 && objects.shots === 0, "replace backs up this computer instead");

    // Delete: gone from iVibe Cloud, and the key is forgotten here.
    status = await deleteBackup();
    check(!status.setUp && !status.keyOnDevice, "backup deleted");
    check(readSettings().backupFrequency === "off", "schedule turned off");
    log("PASS");
    return 0;
  } catch (error) {
    log("FAIL", error instanceof Error ? error.message : error);
    return 1;
  }
}
