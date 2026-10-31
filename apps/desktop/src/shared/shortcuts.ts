// SPDX-License-Identifier: AGPL-3.0-only

import type { OutputMode } from "./ipc.ts";

/**
 * Global shortcuts, one per mode, stored as Electron accelerators ("Control+Capslock").
 * Pressing a mode's shortcut starts a recording in that mode; pressing any of them while
 * recording stops it.
 */

export type ShortcutMap = Record<OutputMode, string>;

/**
 * One key for the most common mode and a modifier on it for the others. Caps Lock on Windows.
 * Electron can't register Caps Lock on macOS, where it is a modifier, so the Mac gets Option+Space,
 * the key Mac voice apps use, within thumb's reach. Linux desktops take Alt+Space for the window
 * menu, so Linux keeps letters.
 */
export function defaultShortcuts(platform: string): ShortcutMap {
  if (platform === "win32") {
    return { dictate: "Capslock", fix: "Control+Capslock", prompt: "Alt+Capslock" };
  }
  if (platform === "darwin") {
    return { dictate: "Alt+Space", fix: "Control+Alt+Space", prompt: "Alt+Shift+Space" };
  }
  return { dictate: "Control+Alt+D", fix: "Control+Alt+F", prompt: "Control+Alt+P" };
}

/** macOS defaults before 0.1.3; kept so settings still on them move to the new ones. */
export const OLD_MAC_SHORTCUTS: ShortcutMap = {
  dictate: "Control+Alt+D",
  fix: "Control+Alt+F",
  prompt: "Control+Alt+P",
};

/** Pastes the latest result; fixed, so it is always where the result's hint says it is. */
export const PASTE_SHORTCUT = "Control+Alt+V";

const MODIFIERS = ["Control", "Alt", "Shift", "Super"] as const;

/** Keys that work as a shortcut without a modifier. */
const STANDALONE = /^(Capslock|F([1-9]|1\d|2[0-4]))$/;

const NAMED: Record<string, string> = {
  CapsLock: "Capslock",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

/** The key part of an accelerator from KeyboardEvent.code, or null for modifiers and unknowns. */
function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

export type CaptureResult =
  | { type: "shortcut"; accelerator: string }
  /** Only modifiers so far; keep listening. */
  | { type: "pending" }
  | { type: "invalid"; message: string };

/** Turns a keydown into an accelerator while the user is recording a new shortcut. */
export function acceleratorFromEvent(event: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): CaptureResult {
  const key = keyFromCode(event.code);
  if (!key) return { type: "pending" };
  const prefix = heldModifiers(event);
  const modifiers = prefix ? prefix.split("+") : [];
  if (modifiers.length === 0 && !STANDALONE.test(key)) {
    return { type: "invalid", message: "Add Ctrl, Alt or Shift, or use Caps Lock or an F key." };
  }
  if (modifiers.length === 1 && modifiers[0] === "Shift" && !STANDALONE.test(key)) {
    return { type: "invalid", message: "Shift alone would block typing. Add Ctrl or Alt." };
  }
  return { type: "shortcut", accelerator: [...modifiers, key].join("+") };
}

/** The modifiers held in a key event, as an accelerator prefix ("Control+Alt"), for live display. */
export function heldModifiers(event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string {
  return [
    event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
  ]
    .filter(Boolean)
    .join("+");
}

/** Whether a stored value is an accelerator this app could have produced. */
export function isValidAccelerator(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const parts = value.split("+");
  const key = parts.pop();
  if (!key || !parts.every((part) => (MODIFIERS as readonly string[]).includes(part))) {
    return false;
  }
  return parts.length > 0 || STANDALONE.test(key);
}

/** Keycap labels for display: symbols on macOS, names elsewhere. */
export function acceleratorKeys(accelerator: string, isMac: boolean): string[] {
  const names: Record<string, [mac: string, other: string]> = {
    Control: ["⌃", "Ctrl"],
    Alt: ["⌥", "Alt"],
    Shift: ["⇧", "Shift"],
    Super: ["⌘", "Win"],
    Capslock: ["⇪", "Caps Lock"],
    Up: ["↑", "↑"],
    Down: ["↓", "↓"],
    Left: ["←", "←"],
    Right: ["→", "→"],
  };
  return accelerator.split("+").map((part) => names[part]?.[isMac ? 0 : 1] ?? part);
}
