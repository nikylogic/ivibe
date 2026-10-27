// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Settings } from "../shared/ipc.ts";

/** User preferences, stored as JSON in the app's data folder. */

export const DEFAULT_SETTINGS: Settings = {
  mode: "fix",
  autoPaste: true,
  proofImages: true,
};

const file = () => join(app.getPath("userData"), "settings.json");

let cached: Settings | null = null;

export function readSettings(): Settings {
  if (cached) return cached;
  try {
    const stored = JSON.parse(readFileSync(file(), "utf8")) as Partial<Settings>;
    cached = { ...DEFAULT_SETTINGS, ...stored };
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
  writeFileSync(file(), JSON.stringify(next, null, 2));
  cached = next;
  return next;
}
