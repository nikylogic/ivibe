// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { EMPTY_PERSONAL, normalizePersonal } from "@ivibe/engine";
import type { OutputMode, Settings } from "../shared/ipc.ts";
import { defaultShortcuts, isValidAccelerator } from "../shared/shortcuts.ts";
import type { ShortcutMap } from "../shared/shortcuts.ts";

/** User preferences, stored as JSON in the app's data folder. */

export const DEFAULT_SETTINGS: Settings = {
  mode: "fix",
  autoPaste: true,
  proofImages: true,
  microphone: "",
  clickToPaste: true,
  personal: EMPTY_PERSONAL,
  shortcuts: defaultShortcuts(process.platform),
  keepHistory: true,
};

const MODES: OutputMode[] = ["fix", "prompt", "dictate"];

/**
 * Keeps valid accelerators from a change, unless two modes would share one; anything else falls
 * back to the current value.
 */
function mergeShortcuts(current: ShortcutMap, change: unknown): ShortcutMap {
  if (!change || typeof change !== "object") return current;
  const next = { ...current };
  for (const mode of MODES) {
    const value = (change as Partial<Record<OutputMode, unknown>>)[mode];
    if (isValidAccelerator(value)) next[mode] = value;
  }
  return new Set(Object.values(next)).size === MODES.length ? next : current;
}

const file = () => join(app.getPath("userData"), "settings.json");

let cached: Settings | null = null;

export function readSettings(): Settings {
  if (cached) return cached;
  try {
    const stored = JSON.parse(readFileSync(file(), "utf8")) as Partial<Settings>;
    cached = {
      ...DEFAULT_SETTINGS,
      ...stored,
      personal: normalizePersonal(stored.personal),
      shortcuts: mergeShortcuts(DEFAULT_SETTINGS.shortcuts, stored.shortcuts),
    };
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  return cached;
}

export function updateSettings(change: Partial<Settings>): Settings {
  const next: Settings = { ...readSettings() };
  if (change.mode === "fix" || change.mode === "prompt" || change.mode === "dictate") {
    next.mode = change.mode;
  }
  if (typeof change.autoPaste === "boolean") next.autoPaste = change.autoPaste;
  if (typeof change.proofImages === "boolean") next.proofImages = change.proofImages;
  if (typeof change.microphone === "string") next.microphone = change.microphone;
  if (typeof change.clickToPaste === "boolean") next.clickToPaste = change.clickToPaste;
  if (typeof change.keepHistory === "boolean") next.keepHistory = change.keepHistory;
  if (change.shortcuts !== undefined)
    next.shortcuts = mergeShortcuts(next.shortcuts, change.shortcuts);
  if (change.personal !== undefined) {
    next.personal = normalizePersonal({ ...next.personal, ...change.personal });
  }
  writeFileSync(file(), JSON.stringify(next, null, 2));
  cached = next;
  return next;
}
