// SPDX-License-Identifier: AGPL-3.0-only

import { EMPTY_PERSONAL, normalizePersonal } from "@ivibe/engine";
import type { OutputMode, Settings } from "../shared/ipc.ts";
import { database } from "./db.ts";
import { isAppLanguage } from "../shared/languages.ts";
import { defaultShortcuts, isValidAccelerator } from "../shared/shortcuts.ts";
import type { ShortcutMap } from "../shared/shortcuts.ts";

/** User preferences, stored in the local database (main/db.ts). */

export const DEFAULT_SETTINGS: Settings = {
  mode: "fix",
  appearance: "system",
  language: "en",
  autoPaste: true,
  proofImages: true,
  microphone: "",
  clickToPaste: true,
  personal: EMPTY_PERSONAL,
  shortcuts: defaultShortcuts(process.platform),
  keepHistory: true,
  backupFrequency: "off",
  welcomed: false,
  dictateCleanup: true,
  editSelection: true,
  pill: "compact",
  sounds: true,
  pillOffsets: {},
  runOn: "auto",
  runFallback: true,
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

let cached: Settings | null = null;

export function readSettings(): Settings {
  if (cached) return cached;
  try {
    const row = database().prepare("SELECT json FROM settings WHERE id = 1").get() as
      { json: string } | undefined;
    const stored = (row ? JSON.parse(row.json) : {}) as Partial<Settings>;
    cached = {
      ...DEFAULT_SETTINGS,
      ...stored,
      language: isAppLanguage(stored.language) ? stored.language : DEFAULT_SETTINGS.language,
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
  if (
    change.appearance === "system" ||
    change.appearance === "light" ||
    change.appearance === "dark"
  ) {
    next.appearance = change.appearance;
  }
  if (isAppLanguage(change.language)) next.language = change.language;
  if (typeof change.autoPaste === "boolean") next.autoPaste = change.autoPaste;
  if (typeof change.proofImages === "boolean") next.proofImages = change.proofImages;
  if (typeof change.microphone === "string") next.microphone = change.microphone;
  if (typeof change.clickToPaste === "boolean") next.clickToPaste = change.clickToPaste;
  if (typeof change.keepHistory === "boolean") next.keepHistory = change.keepHistory;
  if (["off", "daily", "weekly", "monthly"].includes(change.backupFrequency as string)) {
    next.backupFrequency = change.backupFrequency!;
  }
  if (typeof change.welcomed === "boolean") next.welcomed = change.welcomed;
  if (typeof change.dictateCleanup === "boolean") next.dictateCleanup = change.dictateCleanup;
  if (typeof change.editSelection === "boolean") next.editSelection = change.editSelection;
  if (typeof change.sounds === "boolean") next.sounds = change.sounds;
  if (change.pillOffsets && typeof change.pillOffsets === "object") {
    next.pillOffsets = Object.fromEntries(
      Object.entries(change.pillOffsets)
        .filter(
          ([, offset]) =>
            Number.isFinite(offset?.dx) &&
            Number.isFinite(offset?.dy) &&
            Math.abs(offset.dx) < 20_000 &&
            Math.abs(offset.dy) < 20_000,
        )
        .slice(0, 16)
        .map(([display, { dx, dy }]) => [display, { dx: Math.round(dx), dy: Math.round(dy) }]),
    );
  }
  if (change.pill === "compact" || change.pill === "full") next.pill = change.pill;
  if (change.runOn === "auto" || change.runOn === "cloud" || change.runOn === "key") {
    next.runOn = change.runOn;
  }
  if (typeof change.runFallback === "boolean") next.runFallback = change.runFallback;
  if (change.shortcuts !== undefined)
    next.shortcuts = mergeShortcuts(next.shortcuts, change.shortcuts);
  if (change.personal !== undefined) {
    next.personal = normalizePersonal({ ...next.personal, ...change.personal });
  }
  database()
    .prepare(
      "INSERT INTO settings (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = ?",
    )
    .run(JSON.stringify(next), JSON.stringify(next));
  cached = next;
  return next;
}
