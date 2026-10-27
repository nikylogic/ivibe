// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BrowserWindow,
  Menu,
  nativeTheme,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  net,
  protocol,
} from "electron";
import { Channels } from "../shared/ipc.ts";
import type { AppInfo, RecorderEvent, RecordingStatus } from "../shared/ipc.ts";
import { byokStatus, clearByokKey, saveByokKey } from "./byok.ts";
import { trayIcons } from "./icons.ts";
import { RecordingController } from "./recording.ts";
import {
  createHudWindow,
  createRecorderWindow,
  createUiWindow,
  displayUnderCursor,
} from "./windows.ts";

const HOTKEY = "Control+Alt+R";
/** Dev only: --ivibe-snapshot=<dir> runs the self-test and saves PNGs of each window state. */
const SNAPSHOT_DIR = process.argv.find((arg) => arg.startsWith("--ivibe-snapshot="))?.split("=")[1];
const SELF_TEST = process.argv.includes("--ivibe-selftest") || SNAPSHOT_DIR !== undefined;

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
let hotkeyRegistered = false;
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

function showUi(): void {
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
}

function broadcast(channel: string, value: unknown): void {
  for (const window of [uiWindow, hudWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
  }
}

function toggleRecording(): void {
  const { phase } = recording.status;
  if (phase === "recording" || phase === "starting") void recording.stop();
  else void startRecording();
}

async function startRecording(): Promise<void> {
  recording.reset();
  const display = displayUnderCursor();
  if (!hudWindow || hudWindow.isDestroyed()) hudWindow = createHudWindow(display);
  await recording.start(display);
}

function onStatus(status: RecordingStatus): void {
  broadcast(Channels.recordingState, status);
  const recordingNow = status.phase === "recording" || status.phase === "starting";
  tray?.setImage(recordingNow ? trayIcons.recording() : trayIcons.idle());
  tray?.setToolTip(recordingNow ? "iVibe — recording" : "iVibe");
  updateTrayMenu();

  if (status.phase === "recording") hudWindow?.showInactive();
  if (!recordingNow && hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.destroy();
    hudWindow = null;
  }
  if (status.phase === "review" || status.phase === "error") {
    if (SELF_TEST) void finishSelfTest(status);
    else showUi();
  }
}

function updateTrayMenu(): void {
  if (!tray) return;
  const { phase } = recording.status;
  const recordingNow = phase === "recording" || phase === "starting";
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: recordingNow ? "Stop recording" : "Start recording",
        accelerator: HOTKEY,
        click: toggleRecording,
      },
      ...(recordingNow ? [{ label: "Cancel recording", click: () => recording.cancel() }] : []),
      { type: "separator" },
      { label: "Open iVibe", click: showUi },
      { type: "separator" },
      { label: "Quit iVibe", role: "quit" },
    ]),
  );
}

function registerIpc(): void {
  ipcMain.handle(Channels.recordingStart, () => startRecording());
  ipcMain.handle(Channels.recordingStop, () => recording.stop());
  ipcMain.handle(Channels.recordingCancel, () => recording.cancel());
  ipcMain.handle(Channels.recordingGet, () => recording.status);
  ipcMain.handle(Channels.byokStatus, () => byokStatus());
  ipcMain.handle(Channels.byokSet, (_event, key: unknown) => {
    if (typeof key !== "string") throw new Error("Invalid key");
    return saveByokKey(key);
  });
  ipcMain.handle(Channels.byokClear, () => clearByokKey());
  ipcMain.handle(Channels.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    hotkey: HOTKEY,
    hotkeyRegistered,
  }));
  ipcMain.on(Channels.recorderEvent, (event, payload: RecorderEvent) => {
    // Only the recorder window may report recorder events.
    if (event.sender !== recorderWindow?.webContents) return;
    if (payload.type === "level") broadcast(Channels.recordingLevel, payload.rms);
    recording.handleRecorderEvent(payload);
  });
}

/**
 * A fake editor screen with a fake token, shown during the self-test so the recording proves
 * OCR and redaction end to end. The token is assembled at run time to keep secret scanners quiet.
 */
function showSelfTestFixture(): BrowserWindow {
  const token = ["ghp", "_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
  const html = `<!doctype html><body style="margin:0;background:#1e1e1e;color:#d4d4d4;
    font:28px/1.8 Consolas,Menlo,monospace;padding:48px">
    <div>// settings.ts</div><div>function saveDraft(form) {</div>
    <div>&nbsp;&nbsp;const token = "${token}";</div>
    <div>TypeError: Cannot read properties of undefined</div></body>`;
  const { workArea } = displayUnderCursor();
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
    }, 3800);
  }
  showSelfTestFixture();
  setTimeout(() => void startRecording(), 1500);
  setTimeout(() => void recording.stop(), 5000);
  setTimeout(() => {
    console.log("IVIBE_SELFTEST timeout", JSON.stringify(recording.status));
    app.exit(2);
  }, 30_000);
}

async function finishSelfTest(status: RecordingStatus): Promise<void> {
  console.log(`IVIBE_SELFTEST result ${JSON.stringify(status)}`);
  if (SNAPSHOT_DIR) {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
    await settle();
    await snapshot(uiWindow, "ui-review-light");
    nativeTheme.themeSource = "dark";
    await settle();
    await snapshot(uiWindow, "ui-review-dark");
  }
  if (status.phase !== "review") app.exit(1);
  else app.exit(status.summary?.privacy.redactions["github-token"] ? 0 : 3);
}

app.on("second-instance", (_event, argv) => {
  if (argv.includes("--toggle")) toggleRecording();
  else showUi();
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => globalShortcut.unregisterAll());

// Stay in the tray when every window is closed.
app.on("window-all-closed", () => undefined);

void app.whenReady().then(() => {
  if (!process.env.ELECTRON_RENDERER_URL) serveRendererFiles();
  recording = new RecordingController(recorder);
  registerIpc();
  recording.on("status", onStatus);
  recorderWindow = createRecorderWindow();

  tray = new Tray(trayIcons.idle());
  tray.setToolTip("iVibe");
  tray.on("click", showUi);
  updateTrayMenu();

  hotkeyRegistered = globalShortcut.register(HOTKEY, toggleRecording);

  if (SELF_TEST) {
    recorderWindow.webContents.once("did-finish-load", runSelfTest);
  } else {
    showUi();
  }
});
