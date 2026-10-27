// SPDX-License-Identifier: AGPL-3.0-only

import { ClipboardItem, clipboard } from "electron";
import type { TargetApp } from "@ivibe/engine";
import { focusedWindow, isOwnWindow, pasteInto } from "./os-bridge.ts";
import type { FocusedWindow, PasteKind } from "./os-bridge.ts";

/**
 * Puts the result where the user was working (docs/architecture.md D20): pasted into the target
 * window when it still has focus, otherwise left on the clipboard. The user's clipboard is put
 * back after a paste.
 */

export type Delivery = "pasted" | "copied";

/** Text and PNG images, pasted in order so each screenshot follows the line about it. */
export type Part = string | Uint8Array;

export interface DeliverRequest {
  window: FocusedWindow | null;
  target: TargetApp;
  parts: Part[];
  /** What goes on the clipboard when the result can't be pasted (images become file paths). */
  fallbackText: string;
  autoPaste: boolean;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long the app gets to read the clipboard before it changes again. Chat apps upload a pasted
 * image before they take the next paste; Claude Code reads the image through a helper process.
 */
const IMAGE_SETTLE_MS = { app: 600, terminal: 1500 };
const TEXT_SETTLE_MS = 250;
const RESTORE_AFTER_MS = 600;

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
  parts,
  fallbackText,
  autoPaste,
}: DeliverRequest): Promise<Delivery> {
  if (!autoPaste || !window || !(await canPaste(window))) {
    await clipboard.writeText(fallbackText);
    return "copied";
  }

  const isTerminal = target.kind === "terminal-agent" || target.kind === "terminal";
  const restore = await saveClipboard();
  for (const part of parts) {
    const isImage = typeof part !== "string";
    if (isImage) await writeImage(part);
    else if (part) await clipboard.writeText(part);
    else continue;

    const kind: PasteKind = isTerminal ? (isImage ? "terminal-image" : "terminal-text") : "text";
    if (!(await pasteInto(window, kind))) {
      // The whole result goes on the clipboard, with screenshots as file paths.
      await clipboard.writeText(fallbackText);
      return "copied";
    }
    await pause(isImage ? IMAGE_SETTLE_MS[isTerminal ? "terminal" : "app"] : TEXT_SETTLE_MS);
  }

  // Give the app time to read the clipboard before restoring the user's.
  await pause(RESTORE_AFTER_MS);
  await restore();
  return "pasted";
}
