// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
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
  shell,
} from "electron";
import type { Display } from "electron";
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
import { byokStatus, clearByokKey, readByokKey, saveByokKey } from "./byok.ts";
import { trayIcons } from "./icons.ts";
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
import { fallbackText } from "./compose.ts";
import {
  addHistory,
  clearHistory,
  deleteHistory,
  getHistory,
  historyPayload,
  listHistory,
} from "./history.ts";
import { RecordingController } from "./recording.ts";
import {
  createHudWindow,
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

// Test runs use their own profile, so they work next to a running copy of the app.
if (SELF_TEST) app.setPath("userData", join(app.getPath("temp"), "ivibe-selftest"));
else if (!app.requestSingleInstanceLock()) app.quit();

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

async function startRecording(display = displayUnderCursor()): Promise<void> {
  recording.reset();
  // A pill left expanded on the last result starts over at its normal size.
  if (hudExpanded) closeHud();
  if (!hudWindow || hudWindow.isDestroyed()) hudWindow = createHudWindow(display);
  await recording.start(display);
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

function closeHud(): void {
  clearTimeout(hudHideTimer);
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.destroy();
  hudWindow = null;
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
  tray?.setImage(recordingNow ? trayIcons.recording() : trayIcons.idle());
  tray?.setToolTip(recordingNow ? "iVibe — recording" : "iVibe");
  updateTrayMenu();

  // The pill stays up through processing and shows the outcome, then fades out by itself.
  if (status.phase === "recording") {
    clearTimeout(hudHideTimer);
    hudWindow?.showInactive();
  }
  if (status.phase === "idle") closeHud();
  // A copied result waits for a click into a text field (click-to-paste) and keeps the pill up.
  const waiting = status.phase === "review" && status.result?.waiting === true;
  if (waiting) clickToPaste?.arm();
  else clickToPaste?.disarm();
  if (status.phase === "review" || status.phase === "error") {
    if (waiting) clearTimeout(hudHideTimer);
    else if (!hudExpanded) scheduleHudClose(status.phase === "review" ? 5000 : 7000);
    if (SELF_TEST) void finishSelfTest(status);
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
      { type: "separator" },
      { label: "Quit iVibe", role: "quit" },
    ]),
  );
}

function registerIpc(): void {
  ipcMain.handle(Channels.recordingStart, () => startRecording());
  ipcMain.handle(Channels.recordingStop, () => recording.stop());
  ipcMain.handle(Channels.recordingCancel, () => recording.cancel());
  // The pill turns click-through off while the pointer is over the card.
  ipcMain.on(Channels.hudInteractive, (event, interactive: boolean) => {
    if (event.sender !== hudWindow?.webContents) return;
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
  }
  // One display for both, so moving the mouse during the test can't split them.
  const display = displayUnderCursor();
  showSelfTestFixture(display);
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
    await snapshot(uiWindow, "ui-review-light");
    nativeTheme.themeSource = "dark";
    await settle();
    await snapshot(uiWindow, "ui-review-dark");
    // The settings dialog and the collapsed sidebar, opened as a user would.
    const click = (label: string) =>
      uiWindow?.webContents.executeJavaScript(
        `[...document.querySelectorAll("button, a, [role=button]")].find((el) => el.getAttribute("aria-label") === ${JSON.stringify(label)} || el.textContent?.trim() === ${JSON.stringify(label)})?.click()`,
      );
    await click("Settings");
    await settle();
    await snapshot(uiWindow, "ui-settings-dark");
    await click("Personal");
    await settle();
    await snapshot(uiWindow, "ui-settings-personal-dark");
    await click("General");
    await settle();
    await snapshot(uiWindow, "ui-settings-general-dark");
    await click("Shortcuts");
    await settle();
    await snapshot(uiWindow, "ui-settings-shortcuts-dark");
    await uiWindow?.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
    );
    await click("History");
    await settle();
    await uiWindow?.webContents.executeJavaScript(
      `document.querySelector('[aria-expanded="false"]')?.click()`,
    );
    await settle();
    await snapshot(uiWindow, "ui-history-dark");
    await click("Record");
    await settle();
    await click("Collapse sidebar");
    await settle();
    await snapshot(uiWindow, "ui-collapsed-dark");
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
  if (argv.includes("--toggle")) toggleRecording();
  else showUi();
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
  if (!process.env.ELECTRON_RENDERER_URL) serveRendererFiles();
  recording = new RecordingController({
    recorder,
    // Test runs have their own profile, so they read the key from the environment (.env).
    apiKey: () => readByokKey() ?? (SELF_TEST ? (process.env.META_API_KEY ?? null) : null),
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
  recording.on("status", onStatus);
  recording.on("feedback", (feedback) => broadcast(Channels.recordingFeedback, feedback));
  recording.on("result", (entry) => {
    if (!readSettings().keepHistory) return;
    addHistory(entry);
    broadcast(Channels.historyChanged, listHistory());
  });
  recorderWindow = createRecorderWindow();

  tray = new Tray(trayIcons.idle());
  tray.setToolTip("iVibe");
  tray.on("click", () => showUi());
  updateTrayMenu();

  registerShortcuts();
  globalShortcut.register(PASTE_SHORTCUT, () => void pasteLastResult());

  if (SELF_TEST) {
    recorderWindow.webContents.once("did-finish-load", runSelfTest);
  } else {
    showUi();
  }
});
