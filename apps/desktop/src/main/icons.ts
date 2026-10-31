// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="electron-vite/node" />

import { nativeImage } from "electron";
import type { NativeImage } from "electron";
import winOnLight from "../../../../logo/desktop/windows/tray-on-light.ico?asset";
import winRecOnLight from "../../../../logo/desktop/windows/tray-recording-on-light.ico?asset";
import macOnLight from "../../../../logo/desktop/macos/tray-on-light.png?asset";
import macOnLight2x from "../../../../logo/desktop/macos/tray-on-light@2x.png?asset";
import macRecOnLight from "../../../../logo/desktop/macos/tray-recording-on-light.png?asset";
import macRecOnLight2x from "../../../../logo/desktop/macos/tray-recording-on-light@2x.png?asset";
import linuxOnLight from "../../../../logo/desktop/linux/tray-on-light.png?asset";
import linuxOnLight2x from "../../../../logo/desktop/linux/tray-on-light@2x.png?asset";
import linuxRecOnLight from "../../../../logo/desktop/linux/tray-recording-on-light.png?asset";
import linuxRecOnLight2x from "../../../../logo/desktop/linux/tray-recording-on-light@2x.png?asset";
import linuxAppIcon from "../../../../logo/desktop/linux/icons/512x512.png?asset";
import windowsAppIcon from "../../../../logo/desktop/windows/icon.ico?asset";

/**
 * The tray and menu-bar icons from logo/ (see logo/README.md): the mascot on the same white tile
 * as the app icon, whatever the colour of the taskbar or menu bar, with a red dot while recording.
 */

/** A PNG with its @2x file added for high-DPI screens (asset files lose the @2x naming). */
function png(path: string, path2x: string): NativeImage {
  const image = nativeImage.createFromPath(path);
  image.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(path2x).toPNG() });
  return image;
}

function trayIcon(recording: boolean): NativeImage {
  if (process.platform === "win32") {
    return nativeImage.createFromPath(recording ? winRecOnLight : winOnLight);
  }
  if (process.platform === "darwin") {
    return recording ? png(macRecOnLight, macRecOnLight2x) : png(macOnLight, macOnLight2x);
  }
  return recording ? png(linuxRecOnLight, linuxRecOnLight2x) : png(linuxOnLight, linuxOnLight2x);
}

export const trayIcons = {
  idle: () => trayIcon(false),
  recording: () => trayIcon(true),
};

/**
 * The window's taskbar icon. Linux always takes it from the window; on Windows the installed app
 * has it built in (electron-builder.yml), but `pnpm dev` runs electron.exe and would show
 * Electron's. macOS uses the app bundle's icon.
 */
export const windowIcon =
  process.platform === "win32"
    ? windowsAppIcon
    : process.platform === "linux"
      ? linuxAppIcon
      : undefined;
