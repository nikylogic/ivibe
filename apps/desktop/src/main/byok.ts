// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type { ByokStatus } from "../shared/ipc.ts";

/**
 * The user's own Meta Model API key (docs/architecture.md §4.11). Encrypted with the OS
 * keychain through safeStorage, readable only in the main process, never sent to a renderer.
 */

const keyFile = () => join(app.getPath("userData"), "byok.bin");

export function validateKeyFormat(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Paste your Meta Model API key.";
  if (!trimmed.startsWith("LLM_")) return "Meta Model API keys start with LLM_.";
  if (trimmed.length < 20 || /\s/.test(trimmed)) return "That doesn't look like a complete key.";
  return null;
}

export function byokStatus(): ByokStatus {
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const key = readByokKey();
  return key
    ? { hasKey: true, hint: key.slice(-4), encryptionAvailable }
    : { hasKey: false, encryptionAvailable };
}

export function saveByokKey(key: string): ByokStatus {
  const problem = validateKeyFormat(key);
  if (problem) throw new Error(problem);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage isn't available on this system, so the key can't be saved.");
  }
  writeFileSync(keyFile(), safeStorage.encryptString(key.trim()), { mode: 0o600 });
  return byokStatus();
}

export function clearByokKey(): ByokStatus {
  rmSync(keyFile(), { force: true });
  return byokStatus();
}

/** Main-process only: returns the decrypted key, or null. */
export function readByokKey(): string | null {
  const file = keyFile();
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(file));
  } catch {
    return null;
  }
}
