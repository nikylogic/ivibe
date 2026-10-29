// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";

/**
 * The local database, userData/ivibe.db (docs/architecture.md §6.10): settings, History and the
 * backup's own bookkeeping, in SQLite built into Electron's Node. Screenshots stay as files in
 * userData/proof/<id>, because terminal agents are pointed at them by path.
 *
 * Earlier versions kept settings.json and history.json; they are imported once and renamed to
 * *.migrated, so nothing is lost if the import ever has to be redone by hand.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_created ON history (created_at DESC);
CREATE TABLE IF NOT EXISTS store (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
`;

let db: DatabaseSync | null = null;

export const dbFile = () => join(app.getPath("userData"), "ivibe.db");

export function database(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(dbFile());
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrateJsonFiles(db);
  return db;
}

function migrateJsonFiles(target: DatabaseSync): void {
  const userData = app.getPath("userData");
  const settingsFile = join(userData, "settings.json");
  const historyFile = join(userData, "history.json");

  const read = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };

  if (existsSync(settingsFile)) {
    const stored = read(settingsFile);
    const empty = !target.prepare("SELECT 1 FROM settings WHERE id = 1").get();
    if (stored && typeof stored === "object" && empty) {
      target.prepare("INSERT INTO settings (id, json) VALUES (1, ?)").run(JSON.stringify(stored));
    }
    renameSync(settingsFile, `${settingsFile}.migrated`);
  }

  if (existsSync(historyFile)) {
    const stored = read(historyFile);
    if (Array.isArray(stored)) {
      const insert = target.prepare(
        "INSERT OR IGNORE INTO history (id, created_at, json) VALUES (?, ?, ?)",
      );
      inTransaction(target, () => {
        for (const entry of stored as { id?: unknown; createdAt?: unknown }[]) {
          if (typeof entry?.id === "string" && typeof entry.createdAt === "number") {
            insert.run(entry.id, entry.createdAt, JSON.stringify(entry));
          }
        }
      });
    }
    renameSync(historyFile, `${historyFile}.migrated`);
  }
}

export function inTransaction<T>(target: DatabaseSync, work: () => T): T {
  target.exec("BEGIN");
  try {
    const result = work();
    target.exec("COMMIT");
    return result;
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  }
}

/** A small JSON value by key (backup bookkeeping and the like). */
export function readStore<T>(key: string): T | null {
  const row = database().prepare("SELECT json FROM store WHERE key = ?").get(key) as
    { json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.json) as T;
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: unknown): void {
  database()
    .prepare("INSERT INTO store (key, json) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET json = ?")
    .run(key, JSON.stringify(value), JSON.stringify(value));
}

export function deleteStore(key: string): void {
  database().prepare("DELETE FROM store WHERE key = ?").run(key);
}
