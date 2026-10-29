// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="electron-vite/node" />

import { nativeImage, nativeTheme, systemPreferences } from "electron";
import type { NativeImage } from "electron";
import winOnLight from "../../../../logo/desktop/windows/tray-on-light.ico?asset";
import winOnDark from "../../../../logo/desktop/windows/tray-on-dark.ico?asset";
import winRecOnLight from "../../../../logo/desktop/windows/tray-recording-on-light.ico?asset";
import winRecOnDark from "../../../../logo/desktop/windows/tray-recording-on-dark.ico?asset";
import macOnLight from "../../../../logo/desktop/macos/tray-on-light.png?asset";
import macOnLight2x from "../../../../logo/desktop/macos/tray-on-light@2x.png?asset";
import macOnDark from "../../../../logo/desktop/macos/tray-on-dark.png?asset";
import macOnDark2x from "../../../../logo/desktop/macos/tray-on-dark@2x.png?asset";
import macRecOnLight from "../../../../logo/desktop/macos/tray-recording-on-light.png?asset";
import macRecOnLight2x from "../../../../logo/desktop/macos/tray-recording-on-light@2x.png?asset";
import macRecOnDark from "../../../../logo/desktop/macos/tray-recording-on-dark.png?asset";
import macRecOnDark2x from "../../../../logo/desktop/macos/tray-recording-on-dark@2x.png?asset";
import linuxOnDark from "../../../../logo/desktop/linux/tray-on-dark.png?asset";
import linuxOnDark2x from "../../../../logo/desktop/linux/tray-on-dark@2x.png?asset";
import linuxRecOnDark from "../../../../logo/desktop/linux/tray-recording-on-dark.png?asset";
import linuxRecOnDark2x from "../../../../logo/desktop/linux/tray-recording-on-dark@2x.png?asset";
import linuxAppIcon from "../../../../logo/desktop/linux/icons/512x512.png?asset";

/**
 * The tray and menu-bar icons from logo/ (see logo/README.md): the mascot on a small tile that
 * is light on a light taskbar or menu bar and dark on a dark one, with a red dot while recording.
 */

/** A PNG with its @2x file added for high-DPI screens (asset files lose the @2x naming). */
function png(path: string, path2x: string): NativeImage {
  const image = nativeImage.createFromPath(path);
  image.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(path2x).toPNG() });
  return image;
}

/**
 * Whether the taskbar or menu bar is dark. That is the OS setting, not the app's own appearance
 * (nativeTheme.themeSource), which the user can set the other way.
 */
function darkBar(): boolean {
  if (process.platform === "win32") return nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
  if (process.platform === "darwin") {
    return systemPreferences.getUserDefault("AppleInterfaceStyle", "string") === "Dark";
  }
  // Most Linux panels are dark, whatever the theme (GNOME's top bar always is).
  return true;
}

function trayIcon(recording: boolean): NativeImage {
  const dark = darkBar();
  if (process.platform === "win32") {
    return nativeImage.createFromPath(
      recording ? (dark ? winRecOnDark : winRecOnLight) : dark ? winOnDark : winOnLight,
    );
  }
  if (process.platform === "darwin") {
    if (recording)
      return dark ? png(macRecOnDark, macRecOnDark2x) : png(macRecOnLight, macRecOnLight2x);
    return dark ? png(macOnDark, macOnDark2x) : png(macOnLight, macOnLight2x);
  }
  return recording ? png(linuxRecOnDark, linuxRecOnDark2x) : png(linuxOnDark, linuxOnDark2x);
}

export const trayIcons = {
  idle: () => trayIcon(false),
  recording: () => trayIcon(true),
};

/** Calls back when the taskbar or menu bar switches between light and dark. */
export function onTrayThemeChange(callback: () => void): void {
  nativeTheme.on("updated", callback);
  if (process.platform === "darwin") {
    systemPreferences.subscribeNotification("AppleInterfaceThemeChangedNotification", callback);
  }
}

/**
 * The window icon on Linux, where the taskbar takes it from the window. Windows and macOS use
 * the icon built into the app (electron-builder.yml).
 */
export const windowIcon = process.platform === "linux" ? linuxAppIcon : undefined;
