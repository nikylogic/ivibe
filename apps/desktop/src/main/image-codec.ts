// SPDX-License-Identifier: AGPL-3.0-only

import { BrowserWindow } from "electron";

/**
 * Converts screenshots between PNG and WebP with Chromium's encoders, in a hidden window with no
 * page of its own (Node and nativeImage can't write WebP). Backups store WebP at quality 90:
 * 430 KB → 64 KB per screenshot with small text still crisp (§6.10); restores turn it back into
 * PNG, which the clipboard and terminal agents expect.
 */

const IDLE_MS = 60_000;

let window: BrowserWindow | null = null;
let idle: NodeJS.Timeout | undefined;

async function codecWindow(): Promise<BrowserWindow> {
  clearTimeout(idle);
  idle = setTimeout(() => {
    window?.destroy();
    window = null;
  }, IDLE_MS);
  if (window && !window.isDestroyed()) return window;
  window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL("data:text/html,<!doctype html><title>codec</title>");
  return window;
}

async function convert(bytes: Uint8Array, from: string, to: string, quality: number) {
  const codec = await codecWindow();
  const base64: string = await codec.webContents.executeJavaScript(`(async () => {
    const source = await (await fetch("data:${from};base64,${Buffer.from(bytes).toString("base64")}")).blob();
    const image = await createImageBitmap(source);
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    const out = new Uint8Array(await (await canvas.convertToBlob({ type: "${to}", quality: ${quality} })).arrayBuffer());
    let text = "";
    for (let i = 0; i < out.length; i += 8192) text += String.fromCharCode(...out.subarray(i, i + 8192));
    return btoa(text);
  })()`);
  return Buffer.from(base64, "base64");
}

export const pngToWebp = (png: Uint8Array) => convert(png, "image/png", "image/webp", 0.9);

export const webpToPng = (webp: Uint8Array) => convert(webp, "image/webp", "image/png", 1);
