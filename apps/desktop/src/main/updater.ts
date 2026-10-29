// SPDX-License-Identifier: AGPL-3.0-only

import { EventEmitter } from "node:events";
import { Notification, app, shell } from "electron";
import updater from "electron-updater";
import type { UpdatePhase, UpdateStatus } from "../shared/ipc.ts";

/**
 * Updates from GitHub Releases (electron-builder.yml `publish`), through electron-updater.
 *
 * Windows (NSIS), Linux AppImage and deb download the update in the background and install it on
 * restart. macOS can't: Squirrel.Mac only installs updates signed with a Developer ID, and the
 * hackathon builds are ad-hoc signed (docs/architecture.md §11). There the app checks the same
 * feed and links to the download instead.
 */

const { autoUpdater } = updater;

const CHECK_EVERY = 6 * 60 * 60 * 1000;
export const RELEASES_URL = "https://github.com/nikylogic/ivibe/releases/latest";

/** Whether this build can install an update itself, or the user downloads it. */
const canInstall = process.platform !== "darwin";

const events = new EventEmitter<{ status: [UpdateStatus] }>();
let status: UpdateStatus = { phase: "idle", canInstall };
/** Notifies once per version, not at every 4-hourly check. */
let notified: string | undefined;

function set(next: UpdatePhase): void {
  status = { ...next, canInstall };
  events.emit("status", status);
}

export function updateStatus(): UpdateStatus {
  return status;
}

export function onUpdateStatus(listener: (status: UpdateStatus) => void): void {
  events.on("status", listener);
}

function notify(version: string): void {
  if (notified === version || !Notification.isSupported()) return;
  notified = version;
  const notification = new Notification({
    title: `iVibe ${version} is available`,
    body: canInstall ? "Restart iVibe to update." : "Click to download it.",
  });
  notification.on("click", () => installUpdate());
  notification.show();
}

/** Starts checking at launch and every few hours. Development builds have no feed. */
export function startUpdater(): void {
  if (!app.isPackaged) return;
  // Windows shows notifications only for the ID on the installer's Start menu shortcut (appId).
  if (process.platform === "win32") app.setAppUserModelId("tech.ivibe.app");
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.logger = { info() {}, warn: console.warn, error: console.error, debug() {} };

  autoUpdater.on("checking-for-update", () => {
    if (status.phase !== "downloading" && status.phase !== "ready") set({ phase: "checking" });
  });
  autoUpdater.on("update-not-available", () => set({ phase: "latest" }));
  autoUpdater.on("update-available", (info) => {
    if (canInstall) set({ phase: "downloading", version: info.version, percent: 0 });
    else {
      set({ phase: "available", version: info.version });
      notify(info.version);
    }
  });
  autoUpdater.on("download-progress", (progress) => {
    if (status.phase !== "downloading") return;
    set({ phase: "downloading", version: status.version, percent: Math.round(progress.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    set({ phase: "ready", version: info.version });
    notify(info.version);
  });
  autoUpdater.on("error", (error) => {
    console.warn(`[iVibe update] ${error.message}`);
    // A failed check (offline, GitHub down) retries at the next one; a ready update stays ready.
    if (status.phase !== "ready") set({ phase: "error", message: "Couldn't check for updates." });
  });

  void checkForUpdates();
  setInterval(() => void checkForUpdates(), CHECK_EVERY).unref();
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status;
  if (status.phase === "downloading" || status.phase === "ready") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Reported through the "error" event.
  }
  return status;
}

/** Restarts into the downloaded update, or opens the download page on macOS. */
export function installUpdate(): void {
  if (status.phase === "ready") autoUpdater.quitAndInstall();
  else if (status.phase === "available") void shell.openExternal(RELEASES_URL);
}
