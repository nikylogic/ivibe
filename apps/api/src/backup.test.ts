// SPDX-License-Identifier: AGPL-3.0-only

import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_LIMIT_BYTES,
  RETENTION_MS,
  backupDeleteRoute,
  backupGetRoute,
  backupPutRoute,
  backupSetupRoute,
  backupStatusRoute,
  deletionDate,
  expireBackups,
} from "./backup.ts";
import type { AppEnv, Env } from "./env.ts";
import { testDb } from "./test-db.test-helper.ts";

/** R2 as a Map: just what the backup routes use. */
class FakeR2 {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer) {
    this.objects.set(key, new Uint8Array(value));
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? { body: bytes, size: bytes.length } : null;
  }
  async delete(keys: string | string[]) {
    for (const key of [keys].flat()) this.objects.delete(key);
  }
  async list({ prefix }: { prefix: string }) {
    const objects = [...this.objects.keys()].filter((key) => key.startsWith(prefix));
    return { objects: objects.map((key) => ({ key })), truncated: false };
  }
}

let sqlite: DatabaseSync;
let env: Env;
let r2: FakeR2;
const KEY_CHECK = "a".repeat(64);
const day = 86_400_000;

function app() {
  const hono = new Hono<AppEnv>();
  hono.use("*", async (c, next) => {
    c.set("session", { userId: "u", deviceHash: "d" });
    await next();
  });
  hono.get("/backup", backupStatusRoute);
  hono.post("/backup", backupSetupRoute);
  hono.delete("/backup", backupDeleteRoute);
  hono.put("/backup/objects/:name", backupPutRoute);
  hono.get("/backup/objects/:name", backupGetRoute);
  return (path: string, init?: RequestInit) =>
    hono.fetch(new Request(`https://api.test${path}`, init), env);
}

function subscribe(status: string, eventAt: number) {
  sqlite
    .prepare(
      "INSERT INTO subscriptions (id, user_id, customer_id, status, event_at, created_at) VALUES ('sub', 'u', 'cus', ?, ?, 0) ON CONFLICT (id) DO UPDATE SET status = excluded.status, event_at = excluded.event_at",
    )
    .run(status, eventAt);
}

const put = (name: string, bytes: number) => ({
  method: "PUT",
  body: new Uint8Array(bytes),
  headers: { "content-length": String(bytes) },
});

beforeEach(() => {
  const test = testDb();
  sqlite = test.sqlite;
  r2 = new FakeR2();
  env = { DB: test.db, BACKUPS: r2 as unknown as R2Bucket } as Env;
  sqlite.prepare("INSERT INTO users (id, created_at) VALUES ('u', 0)").run();
});

describe("deletion date", () => {
  it("is none while Pro is live, and 90 days after the plan ended otherwise", () => {
    expect(deletionDate(true, 123, 0)).toBeNull();
    expect(deletionDate(false, null, 1000)).toBe(1000 + RETENTION_MS);
    expect(deletionDate(false, null, null, 5000)).toBe(5000 + RETENTION_MS);
    // Once set, it doesn't move.
    expect(deletionDate(false, 42, 1000)).toBe(42);
  });
});

describe("backup routes", () => {
  it("are Pro only to set up and upload", async () => {
    const call = app();
    const setup = { method: "POST", body: JSON.stringify({ keyCheck: KEY_CHECK }) };
    expect((await call("/backup", setup)).status).toBe(402);
    subscribe("active", Date.now());
    expect((await call("/backup", setup)).status).toBe(200);
    expect((await call("/backup", setup)).status).toBe(409);
    expect((await call("/backup/objects/s-0123456789", put("s-0123456789", 100))).status).toBe(200);

    const status = (await (await call("/backup")).json()) as Record<string, unknown>;
    expect(status).toMatchObject({ pro: true, setUp: true, keyCheck: KEY_CHECK, bytes: 100 });
    expect(status.deleteAfter).toBeNull();
    expect(r2.objects.has("users/u/s-0123456789")).toBe(true);
  });

  it("refuse names that aren't the desktop's and anything over the limit", async () => {
    subscribe("active", Date.now());
    const call = app();
    await call("/backup", { method: "POST", body: JSON.stringify({ keyCheck: KEY_CHECK }) });
    expect((await call("/backup/objects/..%2Fother", put("x", 1))).status).toBe(400);
    sqlite.prepare("UPDATE backups SET bytes = ?").run(BACKUP_LIMIT_BYTES - 10);
    expect((await call("/backup/objects/b-0123456789", put("b", 100))).status).toBe(413);
  });

  it("stop uploads when Pro ends, but keep restore open and set the deletion date", async () => {
    subscribe("active", Date.now());
    const call = app();
    await call("/backup", { method: "POST", body: JSON.stringify({ keyCheck: KEY_CHECK }) });
    await call("/backup/objects/b-0123456789", put("b", 10));
    const ended = Date.now();
    subscribe("cancelled", ended);

    expect((await call("/backup/objects/b-9876543210", put("b", 10))).status).toBe(402);
    expect((await call("/backup/objects/b-0123456789")).status).toBe(200);
    const status = (await (await call("/backup")).json()) as { deleteAfter: number };
    expect(status.deleteAfter).toBe(ended + RETENTION_MS);
  });

  it("delete everything on request", async () => {
    subscribe("active", Date.now());
    const call = app();
    await call("/backup", { method: "POST", body: JSON.stringify({ keyCheck: KEY_CHECK }) });
    await call("/backup/objects/b-0123456789", put("b", 10));
    expect((await call("/backup", { method: "DELETE" })).status).toBe(200);
    expect(r2.objects.size).toBe(0);
    expect(await (await call("/backup")).json()).toMatchObject({ setUp: false });
  });
});

describe("expiry", () => {
  async function withBackup() {
    subscribe("active", 0);
    const call = app();
    await call("/backup", { method: "POST", body: JSON.stringify({ keyCheck: KEY_CHECK }) });
    await call("/backup/objects/b-0123456789", put("b", 10));
  }

  it("deletes a backup 90 days after Pro ended, and not a day before", async () => {
    await withBackup();
    const ended = 10 * day;
    subscribe("expired", ended);
    expect(await expireBackups(env, ended + RETENTION_MS - day)).toBe(0);
    expect(r2.objects.size).toBe(1);
    expect(await expireBackups(env, ended + RETENTION_MS)).toBe(1);
    expect(r2.objects.size).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM backups").get()).toEqual({ n: 0 });
  });

  it("cancels the deletion when Pro comes back", async () => {
    await withBackup();
    subscribe("cancelled", 10 * day);
    await expireBackups(env, 11 * day);
    subscribe("active", 20 * day);
    await expireBackups(env, 21 * day);
    expect(sqlite.prepare("SELECT delete_after FROM backups").get()).toEqual({
      delete_after: null,
    });
    expect(await expireBackups(env, 10 * day + RETENTION_MS + day)).toBe(0);
  });
});
