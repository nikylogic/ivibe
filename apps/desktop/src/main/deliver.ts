// SPDX-License-Identifier: AGPL-3.0-only

import { ClipboardItem, clipboard } from "electron";
import type { TargetApp } from "@ivibe/engine";
import { focusedWindow, isOwnWindow, pasteInto } from "./os-bridge.ts";
import type { FocusedWindow } from "./os-bridge.ts";

/**
 * Puts the result where the user was working (docs/architecture.md D20): pasted into the target
 * window when it still has focus, otherwise left on the clipboard. The user's clipboard is put
 * back after a paste.
 */

export type Delivery = "pasted" | "copied";

export interface DeliverRequest {
  window: FocusedWindow | null;
  target: TargetApp;
  text: string;
  /** PNGs pasted one by one ahead of the text (chat apps and editors). */
  images: Uint8Array[];
  autoPaste: boolean;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Snapshots the clipboard so it can be restored after pasting. */
async function saveClipboard(): Promise<() => Promise<void>> {
  try {
    const items = await clipboard.read();
    // Copy the payloads now; the originals are gone once the clipboard changes.
    const saved = await Promise.all(
      items.map(async (item) => {
        const entries = await Promise.all(
          item.types.map(async (type) => [type, await item.getType(type)] as const),
        );
        return new ClipboardItem(Object.fromEntries(entries));
      }),
    );
    return async () => {
      if (saved.length > 0) await clipboard.write(saved).catch(() => undefined);
    };
  } catch {
    return async () => undefined;
  }
}

const writeImage = (png: Uint8Array) =>
  clipboard.write([
    new ClipboardItem({ "image/png": new Blob([png.slice()], { type: "image/png" }) }),
  ]);

/**
 * Pastes only if focus is still on the target window, or on iVibe itself (the user clicked Stop
 * in the pill or the app), in which case focus goes back to the target first. If they moved to
 * another app, pasting there would be a surprise, so the text is copied instead.
 */
async function canPaste(window: FocusedWindow): Promise<boolean> {
  const now = await focusedWindow();
  if (!now) return false;
  return now.handle === window.handle || isOwnWindow(now);
}

export async function deliver({
  window,
  target,
  text,
  images,
  autoPaste,
}: DeliverRequest): Promise<Delivery> {
  if (!autoPaste || !window || !(await canPaste(window))) {
    await clipboard.writeText(text);
    return "copied";
  }

  const isTerminal = target.kind === "terminal-agent" || target.kind === "terminal";
  const restore = await saveClipboard();
  for (const png of images) {
    await writeImage(png);
    if (!(await pasteInto(window, isTerminal))) {
      await clipboard.writeText(text);
      return "copied";
    }
    // Chat apps upload a pasted image before they accept the next paste.
    await pause(450);
  }
  await clipboard.writeText(text);
  if (!(await pasteInto(window, isTerminal))) return "copied";

  // Give the app time to read the clipboard before restoring the user's.
  await pause(600);
  await restore();
  return "pasted";
}
