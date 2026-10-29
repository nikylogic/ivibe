// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { app, nativeImage } from "electron";
import type { HistoryDetail, HistoryEntry } from "../shared/ipc.ts";
import type { Payload } from "./compose.ts";
import { database, inTransaction } from "./db.ts";

/**
 * Finished results, kept on this device so they can be read, copied and pasted again. Rows live
 * in the local database (main/db.ts); the text is what was pasted (already redacted) and the
 * screenshots stay where compose saved them, userData/proof/<id>. Only an end-to-end encrypted
 * backup, if the user turns it on, ever leaves the device (main/backup.ts).
 */

export const MAX_ENTRIES = 200;
const PREVIEW_WIDTH = 640;

export const proofFolder = (id: string) => join(app.getPath("userData"), "proof", id);

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
  const rows = database().prepare("SELECT json FROM history ORDER BY created_at DESC").all() as {
    json: string;
  }[];
  cached = rows.flatMap((row) => {
    try {
      const entry: unknown = JSON.parse(row.json);
      return isEntry(entry) ? [entry] : [];
    } catch {
      return [];
    }
  });
  return cached;
}

function removeProof(entry: HistoryEntry): void {
  if (entry.proof.length > 0) rmSync(proofFolder(entry.id), { recursive: true, force: true });
}

/** Adds results (newest first overall), dropping the oldest past the cap. */
export function addHistory(...added: HistoryEntry[]): void {
  const db = database();
  const insert = db.prepare(
    "INSERT INTO history (id, created_at, json) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET created_at = excluded.created_at, json = excluded.json",
  );
  inTransaction(db, () => {
    for (const entry of added) insert.run(entry.id, entry.createdAt, JSON.stringify(entry));
  });
  cached = null;
  const dropped = listHistory().slice(MAX_ENTRIES);
  if (dropped.length > 0) {
    const remove = db.prepare("DELETE FROM history WHERE id = ?");
    inTransaction(db, () => {
      for (const entry of dropped) remove.run(entry.id);
    });
    for (const entry of dropped) removeProof(entry);
    cached = null;
  }
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
  const entry = listHistory().find((candidate) => candidate.id === id);
  if (!entry) return;
  removeProof(entry);
  database().prepare("DELETE FROM history WHERE id = ?").run(id);
  cached = null;
}

export function clearHistory(): void {
  for (const entry of listHistory()) removeProof(entry);
  database().exec("DELETE FROM history");
  cached = null;
}
