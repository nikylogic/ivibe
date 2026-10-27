// SPDX-License-Identifier: AGPL-3.0-only

import { join } from "node:path";
import { BrowserWindow, nativeTheme, screen, shell } from "electron";
import type { Display } from "electron";

/**
 * The app's windows (docs/architecture.md §4.3): the main UI, the recording HUD and the hidden
 * recorder that hosts the capture pipeline.
 */

const preload = (name: string) => join(import.meta.dirname, "../preload", `${name}.cjs`);

/** Dev server in development, the app:// protocol in production. */
export function pageUrl(page: "ui" | "hud" | "recorder"): string {
  const devServer = process.env.ELECTRON_RENDERER_URL;
  return devServer ? `${devServer}/${page}/index.html` : `app://ivibe/${page}/index.html`;
}

function harden(window: BrowserWindow): void {
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(ivibe\.tech|github\.com|dev\.meta\.ai)\//.test(url))
      void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
}

/** Matches --color-background-body in the renderer theme, so the title bar blends in. */
const canvas = () =>
  nativeTheme.shouldUseDarkColors
    ? { color: "#121110", symbolColor: "#a39e94" }
    : { color: "#f4f1ea", symbolColor: "#6f6a60" };

export function createUiWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: "iVibe",
    backgroundColor: canvas().color,
    // A frameless look: macOS keeps its traffic lights, Windows and Linux get overlay controls.
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 18, y: 18 } }
      : { titleBarOverlay: { ...canvas(), height: 44 } }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preload("ui"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  harden(window);
  window.once("ready-to-show", () => window.show());
  if (process.platform !== "darwin") {
    const updateOverlay = () => {
      window.setBackgroundColor(canvas().color);
      window.setTitleBarOverlay({ ...canvas(), height: 44 });
    };
    nativeTheme.on("updated", updateOverlay);
    window.once("closed", () => nativeTheme.off("updated", updateOverlay));
  }
  void window.loadURL(pageUrl("ui"));
  return window;
}

export function createRecorderWindow(): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: preload("recorder"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Capture must keep running while the window is hidden.
      backgroundThrottling: false,
    },
  });
  harden(window);
  void window.loadURL(pageUrl("recorder"));
  return window;
}

// Room for the caption card as it grows, plus its shadow. The transparent margin lets clicks
// through (setIgnoreMouseEvents) until the pointer is over the card itself.
export const HUD_SIZE = { width: 480, height: 200 };
/** The pill grown into a result panel. */
export const HUD_EXPANDED_SIZE = { width: 560, height: 640 };

export function createHudWindow(display: Display): BrowserWindow {
  const { x, y, width, height } = display.workArea;
  const window = new BrowserWindow({
    // Bottom centre, just above the taskbar or dock.
    x: Math.round(x + (width - HUD_SIZE.width) / 2),
    y: y + height - HUD_SIZE.height - 8,
    ...HUD_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // Clicking Stop must not take focus from the app the result gets pasted into (D20).
    focusable: false,
    webPreferences: {
      preload: preload("hud"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  // Keeps the HUD out of the recording on Windows; masked by the pipeline elsewhere.
  window.setContentProtection(true);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setIgnoreMouseEvents(true, { forward: true });
  harden(window);
  void window.loadURL(pageUrl("hud"));
  return window;
}

/** The display the user is working on: the one under the cursor. */
export function displayUnderCursor(): Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}
