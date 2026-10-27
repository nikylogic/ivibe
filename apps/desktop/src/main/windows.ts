// SPDX-License-Identifier: AGPL-3.0-only

import { join } from "node:path";
import { BrowserWindow, screen, shell } from "electron";
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

export function createUiWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: "iVibe",
    backgroundColor: "#0b0b1a",
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

export const HUD_SIZE = { width: 360, height: 64 };

export function createHudWindow(display: Display): BrowserWindow {
  const { x, y, width } = display.workArea;
  const window = new BrowserWindow({
    x: Math.round(x + (width - HUD_SIZE.width) / 2),
    y: y + 16,
    ...HUD_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
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
  harden(window);
  void window.loadURL(pageUrl("hud"));
  return window;
}

/** The display the user is working on: the one under the cursor. */
export function displayUnderCursor(): Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}
