// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, nativeImage } from "electron";
import type { HistoryDetail, HistoryEntry } from "../shared/ipc.ts";
import type { Payload } from "./compose.ts";

/**
 * Finished results, kept on this device so they can be read, copied and pasted again. The text is
 * what was pasted (already redacted); the screenshots stay where compose saved them,
 * userData/proof/<id>. Nothing here is uploaded.
 */

const MAX_ENTRIES = 200;
const PREVIEW_WIDTH = 640;

const file = () => join(app.getPath("userData"), "history.json");
const proofFolder = (id: string) => join(app.getPath("userData"), "proof", id);

let cached: HistoryEntry[] | null = null;

function isEntry(value: unknown): value is HistoryEntry {
  const entry = value as HistoryEntry;
  return (
    typeof entry?.id === "string" &&
    typeof entry.text === "string" &&
    typeof entry.createdAt === "number" &&
    Array.isArray(entry.proof)
  );
}

export function listHistory(): HistoryEntry[] {
  if (cached) return cached;
  try {
    const stored: unknown = JSON.parse(readFileSync(file(), "utf8"));
    cached = Array.isArray(stored) ? stored.filter(isEntry) : [];
  } catch {
    cached = [];
  }
  return cached;
}

function save(entries: HistoryEntry[]): void {
  // Written beside the real file and renamed, so a crash never leaves half a history.
  const temp = `${file()}.tmp`;
  writeFileSync(temp, JSON.stringify(entries));
  renameSync(temp, file());
  cached = entries;
}

function removeProof(entry: HistoryEntry): void {
  if (entry.proof.length > 0) rmSync(proofFolder(entry.id), { recursive: true, force: true });
}

/** Adds a result, newest first, dropping the oldest past the cap. */
export function addHistory(entry: HistoryEntry): void {
  const entries = [entry, ...listHistory().filter((other) => other.id !== entry.id)];
  for (const dropped of entries.splice(MAX_ENTRIES)) removeProof(dropped);
  save(entries);
}

export function getHistory(id: string): HistoryDetail | null {
  const entry = listHistory().find((candidate) => candidate.id === id);
  if (!entry) return null;
  const previews = entry.proof.map((shot) => {
    if (!existsSync(shot.file)) return "";
    const image = nativeImage.createFromPath(shot.file);
    return image.isEmpty()
      ? ""
      : image.resize({ width: PREVIEW_WIDTH, quality: "good" }).toDataURL();
  });
  return { ...entry, previews };
}

/** The entry as a payload that can be pasted again; screenshots whose files are gone are left out. */
export function historyPayload(entry: HistoryEntry): Payload {
  const proof = entry.proof.flatMap((shot) => {
    try {
      return [{ line: shot.line, file: shot.file, png: new Uint8Array(readFileSync(shot.file)) }];
    } catch {
      return [];
    }
  });
  return { text: entry.text, proof };
}

export function deleteHistory(id: string): void {
  const entries = listHistory();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return;
  removeProof(entry);
  save(entries.filter((candidate) => candidate !== entry));
}

export function clearHistory(): void {
  for (const entry of listHistory()) removeProof(entry);
  save([]);
}
