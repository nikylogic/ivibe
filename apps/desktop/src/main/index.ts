// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BrowserWindow,
  Menu,
  clipboard,
  nativeTheme,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  screen,
  shell,
} from "electron";
import type { Display, Rectangle } from "electron";
import { Channels } from "../shared/ipc.ts";
import type {
  AppInfo,
  OutputMode,
  RecorderEvent,
  RecordingStatus,
  Settings,
  ShortcutKey,
  ShortcutStatus,
} from "../shared/ipc.ts";
import { PASTE_SHORTCUT } from "../shared/shortcuts.ts";
import { accessOrder } from "./access.ts";
import { byokStatus, clearByokKey, readByokKey, saveByokKey } from "./byok.ts";
import {
  APP_SCHEME,
  cloudStatus,
  cloudToken,
  cloudUsage,
  handleAppLink,
  onCloudChange,
  openBilling,
  refreshCloud,
  signIn,
  signOut,
} from "./cloud.ts";
import type { MetaAccess } from "./cloud.ts";
import { onTrayThemeChange, trayIcons } from "./icons.ts";
import {
  checkForUpdates,
  installUpdate,
  onUpdateStatus,
  startUpdater,
  updateStatus,
} from "./updater.ts";
import { ClickToPaste } from "./click-to-paste.ts";
import {
  capsLockOff,
  disposeOsBridge,
  focusedWindow,
  isKeyHeld,
  isOwnWindow,
  virtualKey,
  warmUpOsBridge,
} from "./os-bridge.ts";
import { DictateGesture } from "./gesture.ts";
import { readSettings, updateSettings } from "./settings.ts";
import {
  backupNow,
  backupStatus,
  beginBackup,
  confirmBackup,
  connectBackup,
  deleteBackup,
  exportBackup,
  restoreBackup,
  revealRecoveryKey,
  saveRecoveryKeyFile,
  startBackups,
} from "./backup.ts";
import { fallbackText } from "./compose.ts";
import {
  addHistory,
  clearHistory,
  deleteHistory,
  getHistory,
  historyPayload,
  listHistory,
} from "./history.ts";
import { seedSession, startBackupSelfTest } from "./backup-selftest.ts";
import { RecordingController } from "./recording.ts";
import {
  createHudWindow,
  hudBounds,
  createRecorderWindow,
  createUiWindow,
  displayUnderCursor,
  HUD_EXPANDED_SIZE,
  HUD_SIZE,
} from "./windows.ts";

/** Dev only: --ivibe-snapshot=<dir> runs the self-test and saves PNGs of each window state. */
const SNAPSHOT_DIR = process.argv.find((arg) => arg.startsWith("--ivibe-snapshot="))?.split("=")[1];
const SELF_TEST = process.argv.includes("--ivibe-selftest") || SNAPSHOT_DIR !== undefined;

// Test runs can narrate from a WAV file (Chromium's fake capture), to exercise live captions.
const FAKE_MIC = SELF_TEST ? process.env.IVIBE_FAKE_MIC : undefined;
if (FAKE_MIC) {
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-file-for-fake-audio-capture", FAKE_MIC);
}
const SELF_TEST_RECORD_MS = FAKE_MIC ? 12_000 : 5000;

/** Dev only: --ivibe-backup-test runs a backup cycle against IVIBE_API_URL (backup-selftest.ts). */
const BACKUP_TEST = process.argv.includes("--ivibe-backup-test");

// Test runs use their own profile, so they work next to a running copy of the app.
if (BACKUP_TEST) {
  const profile = join(app.getPath("temp"), "ivibe-backup-test");
  rmSync(profile, { recursive: true, force: true });
  app.setPath("userData", profile);
} else if (SELF_TEST) app.setPath("userData", join(app.getPath("temp"), "ivibe-selftest"));
else if (!app.requestSingleInstanceLock()) app.quit();

// Sign-in comes back as tech.ivibe.app://auth?code=… (iVibe Cloud, cloud.ts).
if (!SELF_TEST) {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(APP_SCHEME, process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(APP_SCHEME);
  }
}

/** The user's own key and/or iVibe Cloud session, in the order Settings picks (access.ts). */
function metaAccess(): MetaAccess[] {
  // Test runs have their own profile, so they read the key from the environment (.env).
  let key = readByokKey() ?? (SELF_TEST ? (process.env.META_API_KEY ?? null) : null);
  // IVIBE_TEST_RETRY: the first attempt runs on a key Meta refuses, so Retry can be tested.
  if (SELF_TEST && process.env.IVIBE_TEST_RETRY && !selfTestRetried) key = "LLM_refused";
  return accessOrder(readSettings(), key, { token: cloudToken(), status: cloudStatus() });
}

const authLink = (argv: string[]) => argv.find((arg) => arg.startsWith(`${APP_SCHEME}://`));

// app:// serves the built renderer with cross-origin isolation (WebAssembly threads for OCR)
// and a strict CSP. It must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let uiWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let shortcutStatus: ShortcutStatus = { fix: false, prompt: false, dictate: false };
let quitting = false;

const recorder = () => {
  if (!recorderWindow || recorderWindow.isDestroyed()) recorderWindow = createRecorderWindow();
  return recorderWindow;
};
// Created once the app is ready (it needs the default session).
let recording: RecordingController;

function serveRendererFiles(): void {
  const root = join(import.meta.dirname, "../renderer");
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const file = normalize(join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    let response: Response;
    try {
      response = await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:",
    );
    return new Response(response.body, { status: response.status, headers });
  });
}

/**
 * Shows the app window. `toFront` is for clicks in the pill: the pill never takes focus, so
 * Windows would otherwise open the window behind the app the user is in.
 */
function showUi({ toFront = false } = {}): void {
  if (!uiWindow || uiWindow.isDestroyed()) {
    uiWindow = createUiWindow();
    uiWindow.on("close", (event) => {
      // Closing the window keeps iVibe in the tray, ready for the hotkey.
      if (!quitting && !SELF_TEST) {
        event.preventDefault();
        uiWindow?.hide();
      }
    });
  } else {
    uiWindow.show();
    uiWindow.focus();
  }
  if (toFront) {
    const window = uiWindow;
    window.setAlwaysOnTop(true);
    window.once("ready-to-show", () => window.focus());
    setTimeout(() => {
      if (!window.isDestroyed()) window.setAlwaysOnTop(false);
    }, 400);
  }
}

function broadcast(channel: string, value: unknown): void {
  for (const window of [uiWindow, hudWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
  }
}

// ---------------------------------------------------------------------------------------------
// Mode shortcuts (settings.shortcuts): each starts a recording in its mode; any of them stops one.

let registeredShortcuts: string[] = [];
let shortcutsPaused: ReturnType<typeof setTimeout> | undefined;

const isRecordingNow = () => {
  const { phase } = recording.status;
  return phase === "recording" || phase === "starting";
};

function startInMode(mode: OutputMode): void {
  if (readSettings().mode !== mode) changeSettings({ mode });
  void startRecording();
}

/** Hold to talk, or double-press for hands-free (main/gesture.ts). */
const dictateGesture = new DictateGesture({
  isHeld: async () => {
    const vk = virtualKey(readSettings().shortcuts.dictate);
    return vk !== null && (await isKeyHeld(vk)) === true;
  },
  isRecording: isRecordingNow,
  start: () => startInMode("dictate"),
  stop: () => void recording.stop(),
  cancel: () => recording.cancel(),
  settled: () => void settleCapsLock(),
});

/** Gestures need to see the key come back up, which only the Windows helper can. */
const canHold = (accelerator: string) =>
  process.platform === "win32" && virtualKey(accelerator) !== null;

function onModeShortcut(mode: OutputMode, accelerator: string): void {
  if (mode === "dictate" && canHold(accelerator)) {
    // Another mode's recording: this press stops it, like any shortcut.
    if (isRecordingNow() && dictateGesture.state === "idle") void recording.stop();
    else dictateGesture.press();
    return;
  }
  if (isRecordingNow()) void recording.stop();
  else startInMode(mode);
  void settleCapsLock();
}

let settlingCaps = false;

/**
 * A Caps Lock shortcut still toggles Caps Lock. Once a press (or gesture) is over, switch it back
 * off, with the shortcuts unregistered so that key press doesn't fire them again.
 */
async function settleCapsLock(): Promise<void> {
  if (process.platform !== "win32" || SELF_TEST || settlingCaps) return;
  if (!registeredShortcuts.some((accelerator) => accelerator.split("+").includes("Capslock"))) {
    return;
  }
  settlingCaps = true;
  unregisterShortcuts();
  try {
    await capsLockOff();
  } finally {
    if (shortcutsPaused === undefined) registerShortcuts();
    settlingCaps = false;
  }
}

function unregisterShortcuts(): void {
  for (const accelerator of registeredShortcuts) globalShortcut.unregister(accelerator);
  registeredShortcuts = [];
}

function registerShortcuts(): void {
  unregisterShortcuts();
  const { shortcuts } = readSettings();
  // Test runs leave the user's keys (Caps Lock included) alone.
  if (SELF_TEST) {
    shortcutStatus = { fix: true, prompt: true, dictate: true };
    return;
  }
  const status = { ...shortcutStatus };
  for (const mode of Object.keys(shortcuts) as OutputMode[]) {
    const accelerator = shortcuts[mode];
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => onModeShortcut(mode, accelerator));
    } catch {
      // An accelerator this platform can't express counts as unavailable.
    }
    if (ok) registeredShortcuts.push(accelerator);
    status[mode] = ok;
  }
  shortcutStatus = status;
  broadcast(Channels.shortcutsChanged, shortcutStatus);
}

/** Forwards keys to the UI while a new shortcut is recorded (see {@link pauseShortcuts}). */
let captureKeys: ((event: Electron.Event, input: Electron.Input) => void) | null = null;
let captureContents: Electron.WebContents | null = null;

function stopCapture(): void {
  if (captureKeys && captureContents && !captureContents.isDestroyed()) {
    captureContents.off("before-input-event", captureKeys);
  }
  captureKeys = null;
  captureContents = null;
}

/**
 * While the user records a new shortcut, the mode shortcuts are unregistered and the window's
 * keys are read here, before Electron's menu sees them: otherwise a bare Alt opens the hidden
 * menu bar and takes focus from the page. The pause lifts itself, so a closed window can't leave
 * iVibe without shortcuts.
 */
function pauseShortcuts(paused: boolean, contents?: Electron.WebContents): void {
  clearTimeout(shortcutsPaused);
  stopCapture();
  if (paused && contents) {
    unregisterShortcuts();
    captureContents = contents;
    captureKeys = (event, input) => {
      event.preventDefault();
      if (input.type !== "keyDown" && input.type !== "keyUp") return;
      if (input.isAutoRepeat) return;
      const key: ShortcutKey = {
        type: input.type === "keyDown" ? "down" : "up",
        code: input.code,
        ctrlKey: input.control,
        altKey: input.alt,
        shiftKey: input.shift,
        metaKey: input.meta,
      };
      contents.send(Channels.shortcutsKey, key);
    };
    contents.on("before-input-event", captureKeys);
    shortcutsPaused = setTimeout(() => pauseShortcuts(false), 30_000);
    return;
  }
  shortcutsPaused = undefined;
  dictateGesture.reset();
  registerShortcuts();
  // Pressing Caps Lock while recording a shortcut toggled it.
  void settleCapsLock();
}

function toggleRecording(): void {
  const { phase } = recording.status;
  if (phase === "recording" || phase === "starting") void recording.stop();
  else void startRecording();
}

let startCalledAt = 0;
/** Self-test: the IVIBE_TEST_RETRY failure has been retried. */
let selfTestRetried = false;

async function startRecording(display = displayUnderCursor()): Promise<void> {
  startCalledAt = Date.now();
  recording.reset();
  // A pill left expanded on the last result starts over at its normal size.
  if (hudExpanded) closeHud();
  const hud = pill();
  // On the display being recorded, which may not be the one it last showed on.
  if (!hud.isVisible()) hud.setBounds(pillBounds(display));
  await recording.start(display);
}

/** The pointer is on the pill, so a move of its window is the user dragging it. */
let pointerOnPill = false;

/** Where the pill goes on a display: bottom centre, or where the user last dragged it there. */
function pillBounds(display: Display): Rectangle {
  const base = hudBounds(display);
  const offset = readSettings().pillOffsets[String(display.id)];
  if (!offset) return base;
  const area = display.workArea;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    ...base,
    x: clamp(base.x + offset.dx, area.x, area.x + area.width - base.width),
    y: clamp(base.y + offset.dy, area.y, area.y + area.height - base.height),
  };
}

/** The pill's window, made at launch and kept (hidden) between recordings. */
function pill(): BrowserWindow {
  if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;
  const window = createHudWindow(displayUnderCursor());
  window.setBounds(pillBounds(displayUnderCursor()));
  // Remembers a drag, per display, as an offset from the usual spot.
  window.on("moved", () => {
    if (!pointerOnPill || hudExpanded || !window.isVisible()) return;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const base = hudBounds(display);
    changeSettings({
      pillOffsets: {
        ...readSettings().pillOffsets,
        [String(display.id)]: { dx: bounds.x - base.x, dy: bounds.y - base.y },
      },
    });
  });
  hudWindow = window;
  return window;
}

/** Esc cancels a recording. It is only taken while one runs, so Esc works normally otherwise. */
let escapeTaken = false;

function takeEscape(take: boolean): void {
  if (take === escapeTaken || SELF_TEST) return;
  if (take) {
    try {
      escapeTaken = globalShortcut.register("Escape", () => recording.cancel());
    } catch {
      escapeTaken = false;
    }
  } else {
    globalShortcut.unregister("Escape");
    escapeTaken = false;
  }
}

let hudHideTimer: ReturnType<typeof setTimeout> | undefined;
let clickToPaste: ClickToPaste | null = null;

/** The paste shortcut: the latest result, into the app in front (not iVibe itself). */
async function pasteLastResult(): Promise<void> {
  if (!recording.hasResult) return;
  const window = await focusedWindow();
  if (!window || isOwnWindow(window)) return;
  clickToPaste?.disarm();
  await recording.pasteResult(window);
}
let hudExpanded = false;

/** Hides the pill; its window stays loaded for the next recording. */
function closeHud(): void {
  clearTimeout(hudHideTimer);
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.hide();
    hudWindow.setIgnoreMouseEvents(true, { forward: true });
    if (hudExpanded) hudWindow.setBounds({ ...hudWindow.getBounds(), ...HUD_SIZE });
  }
  hudExpanded = false;
}

/** After a result, the pill fades out by itself unless it is held (hovered or expanded). */
function scheduleHudClose(ms: number): void {
  clearTimeout(hudHideTimer);
  hudHideTimer = setTimeout(closeHud, ms);
}

function holdHud(held: boolean): void {
  const phase = recording.status.phase;
  if (phase !== "review" && phase !== "error") return;
  if (held) clearTimeout(hudHideTimer);
  else scheduleHudClose(3000);
}

function onStatus(status: RecordingStatus): void {
  broadcast(Channels.recordingState, status);
  const recordingNow = status.phase === "recording" || status.phase === "starting";
  takeEscape(recordingNow);
  tray?.setImage(recordingNow ? trayIcons.recording() : trayIcons.idle());
  tray?.setToolTip(recordingNow ? "iVibe — recording" : "iVibe");
  updateTrayMenu();

  // The pill stays up through processing and shows the outcome, then fades out by itself.
  // Up as soon as the shortcut is pressed; the mic opening shouldn't hold it back.
  if (status.phase === "starting" || status.phase === "recording") {
    clearTimeout(hudHideTimer);
    if (hudWindow && !hudWindow.isDestroyed() && !hudWindow.isVisible()) {
      hudWindow.showInactive();
      console.log(`[iVibe timing] start: pill shown after ${Date.now() - startCalledAt} ms`);
    }
  }
  if (status.phase === "idle") closeHud();
  // A copied result waits for a click into a text field (click-to-paste) and keeps the pill up.
  const waiting = status.phase === "review" && status.result?.waiting === true;
  if (waiting) clickToPaste?.arm();
  else clickToPaste?.disarm();
  if (status.phase === "review" || status.phase === "error") {
    // The compact pill's job ends with the result: it goes at once (click-to-paste stays armed).
    // Only an error stays up to be read.
    if (status.phase === "review" && status.pill === "compact") closeHud();
    else if (waiting) clearTimeout(hudHideTimer);
    else if (!hudExpanded) scheduleHudClose(status.phase === "review" ? 5000 : 7000);
    if (SELF_TEST && process.env.IVIBE_TEST_RETRY && status.canRetry && !selfTestRetried) {
      selfTestRetried = true;
      console.log(`IVIBE_SELFTEST retrying after: ${status.error}`);
      setTimeout(() => void snapshot(hudWindow, "hud-retry").then(() => recording.retry()), 700);
    } else if (SELF_TEST) void finishSelfTest(status);
    // A pasted result stays out of the way; only a bare recording summary opens the app.
    else if (status.phase === "review" && !status.result) showUi();
  }
}

const MODE_LABELS: Record<OutputMode, string> = {
  fix: "Fix: screen and voice",
  prompt: "Prompt: voice only",
  dictate: "Dictate: clean up and paste",
};

function changeSettings(change: Partial<Settings>): Settings {
  const settings = updateSettings(change);
  if (change.appearance) nativeTheme.themeSource = settings.appearance;
  broadcast(Channels.settingsChanged, settings);
  if (change.shortcuts && shortcutsPaused === undefined) registerShortcuts();
  updateTrayMenu();
  return settings;
}

function updateTrayMenu(): void {
  if (!tray) return;
  const { phase } = recording.status;
  const recordingNow = phase === "recording" || phase === "starting";
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: recordingNow ? "Stop recording" : "Start recording",
        click: toggleRecording,
      },
      ...(recordingNow ? [{ label: "Cancel recording", click: () => recording.cancel() }] : []),
      { type: "separator" },
      ...(Object.keys(MODE_LABELS) as OutputMode[]).map((mode) => ({
        label: MODE_LABELS[mode],
        type: "radio" as const,
        checked: readSettings().mode === mode,
        click: () => changeSettings({ mode }),
      })),
      { type: "separator" },
      { label: "Open iVibe", click: () => showUi() },
      ...updateMenu(),
      { type: "separator" },
      { label: "Quit iVibe", role: "quit" },
    ]),
  );
}

function updateMenu(): Electron.MenuItemConstructorOptions[] {
  const update = updateStatus();
  if (update.phase === "ready") {
    return [{ label: `Restart to update to ${update.version}`, click: installUpdate }];
  }
  if (update.phase === "available") {
    return [{ label: `Download iVibe ${update.version}`, click: installUpdate }];
  }
  return [];
}

function registerIpc(): void {
  ipcMain.handle(Channels.recordingStart, () => startRecording());
  ipcMain.handle(Channels.recordingStop, () => recording.stop());
  ipcMain.handle(Channels.recordingCancel, () => recording.cancel());
  ipcMain.handle(Channels.recordingRetry, () => recording.retry());
  // The pill turns click-through off while the pointer is over the card.
  ipcMain.on(Channels.hudInteractive, (event, interactive: boolean) => {
    if (event.sender !== hudWindow?.webContents) return;
    pointerOnPill = interactive;
    hudWindow.setIgnoreMouseEvents(!interactive, { forward: true });
    // The pill doesn't fade out while the pointer is on it.
    holdHud(interactive || hudExpanded);
  });
  ipcMain.handle(Channels.hudOpenApp, () => {
    closeHud();
    showUi({ toFront: true });
  });
  ipcMain.handle(Channels.hudExpand, (event, expanded: unknown) => {
    if (event.sender !== hudWindow?.webContents) return;
    hudExpanded = expanded === true;
    // Grows upward from the pill's bottom edge, centred where it is now.
    const bounds = hudWindow.getBounds();
    const size = hudExpanded ? HUD_EXPANDED_SIZE : HUD_SIZE;
    hudWindow.setBounds({
      x: Math.round(bounds.x + (bounds.width - size.width) / 2),
      y: bounds.y + bounds.height - size.height,
      ...size,
    });
    holdHud(hudExpanded);
  });
  ipcMain.handle(Channels.hudDismiss, (event) => {
    if (event.sender === hudWindow?.webContents) closeHud();
  });
  ipcMain.handle(Channels.recordingGet, () => recording.status);
  ipcMain.handle(Channels.byokStatus, () => byokStatus());
  ipcMain.handle(Channels.byokSet, (_event, key: unknown) => {
    if (typeof key !== "string") throw new Error("Invalid key");
    return saveByokKey(key);
  });
  ipcMain.handle(Channels.byokClear, () => clearByokKey());
  ipcMain.handle(Channels.cloudStatus, () => cloudStatus());
  ipcMain.handle(Channels.cloudSignIn, () => signIn());
  ipcMain.handle(Channels.cloudSignOut, () => signOut());
  ipcMain.handle(Channels.cloudUsage, () => cloudUsage());
  ipcMain.handle(Channels.cloudBilling, (_event, page: unknown) =>
    page === "checkout" || page === "portal" ? openBilling(page) : undefined,
  );
  // Backups: keys and files stay in main; the renderer only ever gets the recovery key to show.
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  ipcMain.handle(Channels.backupStatus, () => backupStatus());
  ipcMain.handle(Channels.backupBegin, () => beginBackup());
  ipcMain.handle(Channels.backupConfirm, (_event, lastGroup: unknown) =>
    confirmBackup(text(lastGroup) ?? ""),
  );
  ipcMain.handle(Channels.backupNow, (_event, replace: unknown) =>
    backupNow({ replace: replace === true }),
  );
  ipcMain.handle(Channels.backupConnect, (_event, key: unknown) => connectBackup(text(key) ?? ""));
  ipcMain.handle(Channels.backupRestore, (_event, key: unknown) => restoreBackup(text(key)));
  ipcMain.handle(Channels.backupExport, (_event, key: unknown) => exportBackup(text(key)));
  ipcMain.handle(Channels.backupReveal, () => revealRecoveryKey());
  ipcMain.handle(Channels.backupSaveKey, () => saveRecoveryKeyFile());
  ipcMain.handle(Channels.backupDelete, () => deleteBackup());
  ipcMain.handle(Channels.settingsGet, () => readSettings());
  ipcMain.handle(Channels.settingsSet, (_event, change: Partial<Settings>) =>
    changeSettings(change ?? {}),
  );
  ipcMain.handle(Channels.resultCopy, async () => {
    const text = recording.status.result?.text;
    if (text) await clipboard.writeText(text);
  });
  ipcMain.handle(Channels.proofOpen, async (_event, index: unknown) => {
    // Only files the latest result produced, never a path from the renderer.
    const file = typeof index === "number" ? recording.status.result?.proof[index]?.file : null;
    if (file) await shell.openPath(file);
  });
  // History: the renderer names entries by id; files only ever come from the stored entries.
  const entryFor = (id: unknown) =>
    typeof id === "string" ? listHistory().find((entry) => entry.id === id) : undefined;
  ipcMain.handle(Channels.historyList, () => listHistory());
  ipcMain.handle(Channels.historyGet, (_event, id: unknown) =>
    typeof id === "string" ? getHistory(id) : null,
  );
  ipcMain.handle(Channels.historyCopy, (_event, id: unknown) => {
    const entry = entryFor(id);
    if (entry) clipboard.writeText(fallbackText(historyPayload(entry)));
  });
  ipcMain.handle(Channels.historyReuse, (_event, id: unknown) => {
    const detail = typeof id === "string" ? getHistory(id) : null;
    if (!detail) return false;
    const payload = historyPayload(detail);
    clipboard.writeText(fallbackText(payload));
    return recording.reuse(payload, {
      mode: detail.mode,
      text: detail.text,
      targetName: "the clipboard",
      delivery: "copied",
      proofImages: payload.proof.length,
      proof: detail.proof.map((shot, index) => ({
        title: shot.title,
        file: shot.file,
        preview: detail.previews[index] ?? "",
      })),
      waiting: readSettings().clickToPaste,
    });
  });
  ipcMain.handle(Channels.historyOpenProof, async (_event, id: unknown, index: unknown) => {
    const file = typeof index === "number" ? entryFor(id)?.proof[index]?.file : undefined;
    if (file) await shell.openPath(file);
  });
  ipcMain.handle(Channels.historyDelete, (_event, id: unknown) => {
    if (typeof id === "string") deleteHistory(id);
    broadcast(Channels.historyChanged, listHistory());
  });
  ipcMain.handle(Channels.historyClear, () => {
    clearHistory();
    broadcast(Channels.historyChanged, listHistory());
  });
  ipcMain.handle(Channels.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }));
  ipcMain.handle(Channels.updateStatus, () => updateStatus());
  ipcMain.handle(Channels.updateCheck, () => checkForUpdates());
  ipcMain.handle(Channels.updateInstall, () => installUpdate());
  ipcMain.handle(Channels.shortcutsStatus, (): ShortcutStatus => shortcutStatus);
  ipcMain.handle(Channels.shortcutsPause, (event, paused: unknown) => {
    if (event.sender !== uiWindow?.webContents) return;
    pauseShortcuts(paused === true, event.sender);
  });
  ipcMain.on(Channels.recorderEvent, (event, payload: RecorderEvent) => {
    // Only the recorder window may report recorder events.
    if (event.sender !== recorderWindow?.webContents) return;
    if (payload.type === "level") broadcast(Channels.recordingLevel, payload.rms);
    recording.handleRecorderEvent(payload);
  });
}

/**
 * A fake app with a broken Save button, its console and a leaked token, shown during the
 * self-test so the recording proves OCR, redaction and proof highlights end to end. The token is
 * assembled at run time to keep secret scanners quiet.
 */
function showSelfTestFixture(display: Display): BrowserWindow {
  const token = ["ghp", "_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
  const field = (label: string, value: string) =>
    `<div style="color:#555;margin:22px 0 8px">${label}</div>
    <div style="border:2px solid #ddd;background:#fff;padding:14px 16px;width:560px">${value}</div>`;
  const html = `<!doctype html><body style="margin:0;display:flex;height:100vh;
    font:24px system-ui,'Segoe UI',sans-serif">
    <main style="flex:1;background:#f4f4f6;color:#111;padding:56px 64px">
      <div style="font-size:40px;font-weight:700;margin-bottom:12px">Edit profile</div>
      ${field("Name", "Asha Rao")}${field("Email", "asha@example.com")}
      ${field("Bio", "Building things on weekends")}
      <div style="display:inline-block;margin-top:40px;background:#5146e5;color:#fff;
        font-weight:700;padding:16px 56px">Save</div>
    </main>
    <aside style="width:44%;background:#1e1e1e;color:#d4d4d4;padding:40px;
      font:21px/1.7 Consolas,Menlo,monospace">
      <div style="color:#aaa">Console</div><br>
      <div style="color:#f48771">Uncaught (in promise) TypeError:<br>
      &nbsp;&nbsp;Cannot read properties of undefined (reading 'map')<br>
      &nbsp;&nbsp;&nbsp;&nbsp;at saveProfile (ProfileForm.tsx:41:28)<br>
      &nbsp;&nbsp;&nbsp;&nbsp;at onClick (ProfileForm.tsx:67:9)</div><br>
      <div style="color:#9cdcfe">POST /api/profile 200 (48 ms)</div>
      <div>GITHUB_TOKEN = "${token}"</div>
    </aside></body>`;
  const { workArea } = display;
  const fixture = new BrowserWindow({
    ...workArea,
    frame: false,
    alwaysOnTop: true,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  void fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return fixture;
}

// Self-test: record a few seconds without user input and print the summary (CI and Spikes S11
// and S12). It fails unless the fixture's token was found and redacted.
async function snapshot(window: BrowserWindow | null, name: string): Promise<void> {
  if (!SNAPSHOT_DIR || !window || window.isDestroyed()) return;
  const image = await window.webContents.capturePage();
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(join(SNAPSHOT_DIR, `${name}.png`), image.toPNG());
}

function runSelfTest(): void {
  console.log("IVIBE_SELFTEST start");
  if (SNAPSHOT_DIR) {
    nativeTheme.themeSource = "light";
    showUi();
    setTimeout(() => void snapshot(uiWindow, "ui-idle"), 1200);
    setTimeout(() => {
      void snapshot(hudWindow, "hud");
      void snapshot(uiWindow, "ui-recording");
    }, SELF_TEST_RECORD_MS - 1200);
    // The pill hovered, as a user reaching for Stop would (React listens for mouseover).
    setTimeout(() => {
      const hover = (type: string) =>
        hudWindow?.webContents.executeJavaScript(
          `document.querySelector("[data-pill]")?.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, relatedTarget: document.body }))`,
        );
      void hover("mouseover")
        ?.then(() => new Promise((resolve) => setTimeout(resolve, 400)))
        .then(() => snapshot(hudWindow, "hud-hover"))
        .then(() => hover("mouseout"));
    }, SELF_TEST_RECORD_MS - 2600);
    const working = (status: RecordingStatus) => {
      if (status.phase !== "writing") return;
      recording.off("status", working);
      setTimeout(() => void snapshot(hudWindow, "hud-working"), 300);
    };
    recording.on("status", working);
    recording.on("feedback", (feedback) => {
      if (feedback.type !== "fallback") return;
      console.log(`IVIBE_SELFTEST fallback to ${feedback.to}`);
      setTimeout(() => void snapshot(hudWindow, "hud-fallback"), 250);
    });
  }
  // One display for both, so moving the mouse during the test can't split them.
  const display = displayUnderCursor();
  // IVIBE_NO_FIXTURE keeps the app in front (Dictate editing a selection there).
  if (!process.env.IVIBE_NO_FIXTURE) showSelfTestFixture(display);
  recording.on("result", (entry) =>
    console.log(`IVIBE_SELFTEST text ${JSON.stringify(entry.text)}`),
  );
  setTimeout(() => void startRecording(display), 1500);
  // Time the recording from when capture starts, not from launch.
  const stopLater = (status: RecordingStatus) => {
    if (status.phase !== "recording") return;
    recording.off("status", stopLater);
    setTimeout(() => void recording.stop(), SELF_TEST_RECORD_MS - 1500);
  };
  recording.on("status", stopLater);
  setTimeout(() => {
    console.log("IVIBE_SELFTEST timeout", JSON.stringify(recording.status));
    app.exit(2);
  }, 90_000);
}

/**
 * Self-tests never paste, since a keystroke would land in whatever window the developer is
 * using. IVIBE_MODE picks the mode under test.
 */
function selfTestSettings(): Settings {
  const mode = process.env.IVIBE_MODE;
  return {
    ...readSettings(),
    autoPaste: false,
    clickToPaste: false,
    ...(process.env.IVIBE_CLEANUP === "off" ? { dictateCleanup: false } : {}),
    ...(process.env.IVIBE_PILL === "full" || process.env.IVIBE_PILL === "compact"
      ? { pill: process.env.IVIBE_PILL }
      : {}),
    ...(mode === "fix" || mode === "prompt" || mode === "dictate" ? { mode } : {}),
  };
}

async function finishSelfTest(status: RecordingStatus): Promise<void> {
  console.log(`IVIBE_SELFTEST result ${JSON.stringify(status)}`);
  if (SNAPSHOT_DIR) {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
    await settle();
    await snapshot(hudWindow, "hud-review");
    if (status.result) {
      // Click View, as a user would, to capture the expanded pill.
      await hudWindow?.webContents.executeJavaScript(
        `[...document.querySelectorAll("button")].find((b) => b.textContent === "View")?.click()`,
      );
      await settle();
      await snapshot(hudWindow, "hud-expanded");
    }
    // A fresh profile opens on the welcome screen; capture it, then skip it as a user would.
    if (!readSettings().welcomed) {
      await snapshot(uiWindow, "ui-welcome-light");
      await uiWindow?.webContents.executeJavaScript(
        `[...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Skip for now")?.click()`,
      );
      await settle();
      console.log(`IVIBE_SELFTEST welcome skipped: ${readSettings().welcomed}`);
    }
    await snapshot(uiWindow, "ui-review-light");
    nativeTheme.themeSource = "dark";
    await settle();
    await snapshot(uiWindow, "ui-review-dark");
    // The settings page and the collapsed sidebar, opened as a user would.
    const click = (label: string) =>
      uiWindow?.webContents.executeJavaScript(
        `[...document.querySelectorAll("button, a, [role=button], [role=menuitem]")].find((el) => el.getAttribute("aria-label") === ${JSON.stringify(label)} || el.textContent?.trim() === ${JSON.stringify(label)})?.click()`,
      );
    // Settings lives in the account menu in the sidebar footer.
    const accountMenu = () =>
      uiWindow?.webContents.executeJavaScript(
        `document.querySelector('[aria-label$="Account menu"]')?.click()`,
      );
    await accountMenu();
    await settle();
    await click("Settings");
    await settle();
    await snapshot(uiWindow, "ui-settings-dark");
    await click("Personal");
    await new Promise((resolve) => setTimeout(resolve, 70));
    await snapshot(uiWindow, "ui-settings-switching-dark");
    await settle();
    await snapshot(uiWindow, "ui-settings-personal-dark");
    await click("General");
    await settle();
    await snapshot(uiWindow, "ui-settings-general-dark");
    // Appearance → Light, as a user would, then back to what it was.
    const appearance = readSettings().appearance;
    await uiWindow?.webContents.executeJavaScript(
      `[...document.querySelectorAll('[role="radio"]')].find((el) => el.textContent?.trim() === "Light")?.click()`,
    );
    await settle();
    await snapshot(uiWindow, "ui-settings-general-light");
    changeSettings({ appearance });
    nativeTheme.themeSource = "dark";
    await settle();
    await click("System");
    await settle();
    await snapshot(uiWindow, "ui-settings-system-dark");
    await click("Shortcuts");
    await settle();
    await snapshot(uiWindow, "ui-settings-shortcuts-dark");
    await click("Billing");
    await settle();
    await snapshot(uiWindow, "ui-settings-billing-dark");
    await click("iVibe Cloud");
    await settle();
    await snapshot(uiWindow, "ui-settings-cloud-dark");
    await click("Meta API key");
    await settle();
    await snapshot(uiWindow, "ui-settings-key-dark");
    await click("iVibe Cloud");
    await settle();
    if ((await backupStatus()).pro) {
      // Turning backup on, as a user would: the key, then its last four characters.
      await click("Turn on backup");
      await settle();
      await snapshot(uiWindow, "ui-backup-key-dark");
      const last = revealRecoveryKey().slice(-4);
      await click("I've saved it");
      await settle();
      await uiWindow?.webContents.executeJavaScript(
        `document.querySelector("main input")?.focus()`,
      );
      uiWindow?.webContents.insertText(last);
      await settle();
      await snapshot(uiWindow, "ui-backup-confirm-dark");
      await click("Turn on backup");
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await snapshot(uiWindow, "ui-backup-manage-dark");
      await click("Show recovery key");
      await settle();
      await snapshot(uiWindow, "ui-backup-shown-dark");
    }
    await uiWindow?.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
    );
    await settle();
    // The account menu in the sidebar footer, on the full-width sidebar.
    await click("Expand sidebar");
    await settle();
    await snapshot(uiWindow, "ui-profile-dark");
    // Hover the account button with a real pointer, so :hover wakes the blob.
    const account: { x: number; y: number } | undefined =
      await uiWindow?.webContents.executeJavaScript(
        `(() => { const r = document.querySelector('[aria-label$="Account menu"]')?.getBoundingClientRect(); return r && { x: Math.round(r.x + r.width - 20), y: Math.round(r.y + r.height / 2) }; })()`,
      );
    if (account) {
      uiWindow?.webContents.sendInputEvent({ type: "mouseMove", ...account });
      await settle();
      await snapshot(uiWindow, "ui-profile-hover-dark");
    }
    await uiWindow?.webContents.executeJavaScript(
      `document.querySelector('[aria-label$="Account menu"]')?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const blobState = await uiWindow?.webContents.executeJavaScript(
      `JSON.stringify({ root: !!document.querySelector('[aria-label$="Account menu"] .mo-root'), expr: !!document.querySelector('[aria-label$="Account menu"] .mo-expr') })`,
    );
    console.log("IVIBE_SELFTEST blob after press:", blobState);
    await accountMenu();
    await settle();
    await snapshot(uiWindow, "ui-profile-menu-dark");
    await uiWindow?.webContents.executeJavaScript(
      `document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
    );
    await settle();
    await click("History");
    await new Promise((resolve) => setTimeout(resolve, 70));
    await snapshot(uiWindow, "ui-page-switching-dark");
    await settle();
    await uiWindow?.webContents.executeJavaScript(
      `document.querySelector('main [aria-expanded="false"]')?.click()`,
    );
    await settle();
    await snapshot(uiWindow, "ui-history-dark");
    // Switching mode slides the selection and cross-fades what depends on it.
    const pickMode = (label: string) =>
      uiWindow?.webContents.executeJavaScript(
        `[...document.querySelectorAll('[role="radio"]')].find((el) => el.textContent?.trim().startsWith(${JSON.stringify(label)}))?.click()`,
      );
    await pickMode("Prompt");
    await new Promise((resolve) => setTimeout(resolve, 70));
    await snapshot(uiWindow, "ui-history-mode-switching-dark");
    await settle();
    await pickMode("Fix");
    await settle();
    await click("Record");
    await settle();
    await pickMode("Dictate");
    await new Promise((resolve) => setTimeout(resolve, 70));
    await snapshot(uiWindow, "ui-mode-switching-dark");
    await settle();
    await snapshot(uiWindow, "ui-mode-dictate-dark");
    await pickMode("Fix");
    await settle();
    // Mid-motion frames, to check that the sidebar clips rather than reflows as it moves.
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await click("Collapse sidebar");
    await wait(60);
    await snapshot(uiWindow, "ui-collapsing-dark");
    await settle();
    await snapshot(uiWindow, "ui-collapsed-dark");
    await click("Expand sidebar");
    await wait(60);
    await snapshot(uiWindow, "ui-expanding-dark");
    await settle();
    await click("Collapse sidebar");
    await settle();
    await uiWindow?.webContents.executeJavaScript(
      `document.querySelector('[aria-label^="Shortcut "]')?.click()`,
    );
    await settle();
    await snapshot(uiWindow, "ui-shortcut-capture-dark");
    // Real key events through Electron's input pipeline: hold Ctrl, then Ctrl+F9 saves it.
    uiWindow?.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "Control",
      modifiers: ["control"],
    });
    await settle();
    await snapshot(uiWindow, "ui-shortcut-held-dark");
    uiWindow?.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "F9",
      modifiers: ["control"],
    });
    uiWindow?.webContents.sendInputEvent({ type: "keyUp", keyCode: "F9", modifiers: ["control"] });
    uiWindow?.webContents.sendInputEvent({ type: "keyUp", keyCode: "Control" });
    await settle();
    await snapshot(uiWindow, "ui-shortcut-saved-dark");
    console.log("IVIBE_SELFTEST shortcuts", JSON.stringify(readSettings().shortcuts));
  }
  if (status.phase !== "review") app.exit(1);
  else if (status.mode !== "fix") app.exit(status.result ? 0 : 4);
  else app.exit(status.summary?.privacy.redactions["github-token"] ? 0 : 3);
}

app.on("second-instance", (_event, argv) => {
  const link = authLink(argv);
  if (link) {
    showUi({ toFront: true });
    void handleAppLink(link);
  } else if (argv.includes("--toggle")) toggleRecording();
  else showUi();
});

// macOS delivers deep links as an event instead of a second instance.
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (!app.isReady()) return;
  showUi({ toFront: true });
  void handleAppLink(url);
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  disposeOsBridge();
});

// Stay in the tray when every window is closed.
app.on("window-all-closed", () => undefined);

void app.whenReady().then(() => {
  if (BACKUP_TEST) return startBackupSelfTest();
  if (!process.env.ELECTRON_RENDERER_URL) serveRendererFiles();
  // Windows, their title-bar overlay and the renderer's light/dark tokens all follow this.
  nativeTheme.themeSource = readSettings().appearance;
  recording = new RecordingController({
    recorder,
    access: metaAccess,
    settings: () => (SELF_TEST ? selfTestSettings() : readSettings()),
  });
  clickToPaste = new ClickToPaste({
    onField: async (window) => {
      await recording.pasteResult(window);
    },
    onExpire: () => recording.stopWaiting(),
  });
  warmUpOsBridge();
  registerIpc();
  onCloudChange((status) => {
    broadcast(Channels.cloudChanged, status);
    if (!status.pending) void backupStatus();
  });
  startBackups({
    applySettings: (change) => changeSettings(change),
    historyChanged: () => broadcast(Channels.historyChanged, listHistory()),
    onStatus: (status) => broadcast(Channels.backupChanged, status),
  });
  // Self-tests are signed out, unless IVIBE_TEST_TOKEN signs them in (the Backup screens).
  if (SELF_TEST && process.env.IVIBE_TEST_TOKEN) seedSession();
  // IVIBE_TEST_BYOK stores the .env key as the user's own, for the "both" screens and fallback.
  if (SELF_TEST && process.env.IVIBE_TEST_BYOK && process.env.META_API_KEY) {
    saveByokKey(process.env.META_API_KEY);
  }
  if (!SELF_TEST || process.env.IVIBE_TEST_TOKEN) void refreshCloud();
  recording.on("status", onStatus);
  recording.on("feedback", (feedback) => broadcast(Channels.recordingFeedback, feedback));
  recording.on("result", (entry) => {
    if (!readSettings().keepHistory) return;
    addHistory(entry);
    broadcast(Channels.historyChanged, listHistory());
  });
  recorderWindow = createRecorderWindow();
  pill();

  tray = new Tray(trayIcons.idle());
  tray.setToolTip("iVibe");
  onTrayThemeChange(() => {
    const { phase } = recording.status;
    tray?.setImage(
      phase === "recording" || phase === "starting" ? trayIcons.recording() : trayIcons.idle(),
    );
  });
  tray.on("click", () => showUi());
  updateTrayMenu();

  onUpdateStatus((status) => {
    broadcast(Channels.updateChanged, status);
    updateTrayMenu();
  });
  if (!SELF_TEST) startUpdater();

  registerShortcuts();
  globalShortcut.register(PASTE_SHORTCUT, () => void pasteLastResult());

  if (SELF_TEST) {
    recorderWindow.webContents.once("did-finish-load", runSelfTest);
  } else {
    showUi();
  }
});
