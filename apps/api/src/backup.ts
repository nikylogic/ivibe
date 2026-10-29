// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import { SUBSCRIBED } from "./billing.ts";
import type { AppEnv, Env } from "./env.ts";
import { now } from "./util.ts";

/**
 * End-to-end encrypted backups for iVibe Pro (D28, docs/architecture.md §6.10). The desktop
 * compresses and encrypts everything with a key only the user's devices hold; this side stores
 * opaque objects in R2 and knows their names, sizes and times, nothing else.
 *
 * - Uploads need a live Pro plan. Restore, export and delete stay open after it ends.
 * - 90 days after Pro ends the backup is deleted (the cron, `expireBackups`); Pro again before
 *   then cancels it.
 * - 500 MB per user, never shown in the app: with History capped at 200 results a full backup
 *   is under ~40 MB.
 */

type Ctx = Context<AppEnv>;

export const BACKUP_LIMIT_BYTES = 500 * 1024 * 1024;
export const MAX_OBJECT_BYTES = 25 * 1024 * 1024;
/** One scheduled backup a day and up to five "Back up now". */
export const MAX_SNAPSHOTS_PER_DAY = 6;
export const RETENTION_MS = 90 * 86_400_000;

const NAME = /^[sb]-[a-z0-9-]{8,80}$/;
const KEY_CHECK = /^[0-9a-f]{64}$/;

const objectKey = (userId: string, name: string) => `users/${userId}/${name}`;

interface BackupRow {
  key_check: string;
  bytes: number;
  last_backup_at: number | null;
  delete_after: number | null;
  created_at: number;
}

/** Whether the latest subscription is live, and when it last changed (its end, if it ended). */
async function proState(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      "SELECT status, event_at FROM subscriptions WHERE user_id = ? ORDER BY event_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<{ status: string; event_at: number }>();
  return { pro: !!row && SUBSCRIBED.has(row.status), changedAt: row?.event_at ?? null };
}

/**
 * The deletion date for a backup given the plan: none while Pro is live, otherwise 90 days after
 * the plan ended (or after we first noticed, if no end is recorded). Kept once set.
 */
export function deletionDate(
  pro: boolean,
  current: number | null,
  endedAt: number | null,
  at = now(),
): number | null {
  if (pro) return null;
  return current ?? (endedAt ?? at) + RETENTION_MS;
}

async function loadBackup(db: D1Database, userId: string) {
  const backup = await db
    .prepare(
      "SELECT key_check, bytes, last_backup_at, delete_after, created_at FROM backups WHERE user_id = ?",
    )
    .bind(userId)
    .first<BackupRow>();
  const { pro, changedAt } = await proState(db, userId);
  if (backup) {
    const deleteAfter = deletionDate(pro, backup.delete_after, changedAt);
    if (deleteAfter !== backup.delete_after) {
      await db
        .prepare("UPDATE backups SET delete_after = ? WHERE user_id = ?")
        .bind(deleteAfter, userId)
        .run();
      backup.delete_after = deleteAfter;
    }
  }
  return { backup, pro };
}

const fail = (
  c: Ctx,
  status: 400 | 402 | 403 | 404 | 409 | 413 | 429,
  code: string,
  message: string,
) => c.json({ error: code, message }, status);

/** GET /v1/backup: the backup's state, and the objects it holds (for restore and cleanup). */
export async function backupStatusRoute(c: Ctx): Promise<Response> {
  const { userId } = c.get("session");
  const { backup, pro } = await loadBackup(c.env.DB, userId);
  if (!backup) return c.json({ pro, setUp: false });
  const { results } = await c.env.DB.prepare(
    "SELECT name, size, created_at FROM backup_objects WHERE user_id = ? ORDER BY created_at",
  )
    .bind(userId)
    .all<{ name: string; size: number; created_at: number }>();
  return c.json({
    pro,
    setUp: true,
    keyCheck: backup.key_check,
    bytes: backup.bytes,
    lastBackupAt: backup.last_backup_at,
    deleteAfter: backup.delete_after,
    objects: results.map((row) => ({ name: row.name, size: row.size, createdAt: row.created_at })),
  });
}

/** POST /v1/backup { keyCheck }: turns backups on for a Pro user, with a new key. */
export async function backupSetupRoute(c: Ctx): Promise<Response> {
  const { userId } = c.get("session");
  const body = (await c.req.json().catch(() => null)) as { keyCheck?: unknown } | null;
  if (typeof body?.keyCheck !== "string" || !KEY_CHECK.test(body.keyCheck)) {
    return fail(c, 400, "bad_request", "Expected keyCheck");
  }
  const { backup, pro } = await loadBackup(c.env.DB, userId);
  if (!pro) return fail(c, 402, "pro_required", "Backups are part of iVibe Pro.");
  if (backup) {
    return fail(c, 409, "exists", "A backup already exists. Delete it first to start over.");
  }
  await c.env.DB.prepare(
    "INSERT INTO backups (user_id, key_check, bytes, created_at) VALUES (?, ?, 0, ?)",
  )
    .bind(userId, body.keyCheck, now())
    .run();
  return c.json({ ok: true });
}

/** PUT /v1/backup/objects/:name — an encrypted snapshot (s-…) or screenshot (b-…). */
export async function backupPutRoute(c: Ctx): Promise<Response> {
  const { userId } = c.get("session");
  const name = c.req.param("name") ?? "";
  if (!NAME.test(name)) return fail(c, 400, "bad_request", "Invalid object name");
  const declared = Number(c.req.header("content-length") ?? NaN);
  if (!Number.isFinite(declared) || declared > MAX_OBJECT_BYTES) {
    return fail(c, 413, "too_large", "That file is too large to back up.");
  }
  const { backup, pro } = await loadBackup(c.env.DB, userId);
  if (!backup) return fail(c, 404, "not_set_up", "Turn on backup first.");
  if (!pro) return fail(c, 402, "pro_required", "Backups are part of iVibe Pro.");

  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_OBJECT_BYTES) {
    return fail(c, 413, "too_large", "That file is too large to back up.");
  }
  const previous = await c.env.DB.prepare(
    "SELECT size FROM backup_objects WHERE user_id = ? AND name = ?",
  )
    .bind(userId, name)
    .first<{ size: number }>();
  const bytes = backup.bytes - (previous?.size ?? 0) + body.byteLength;
  if (bytes > BACKUP_LIMIT_BYTES) {
    return fail(c, 413, "quota", "Your backup is full. Delete it and start over, or contact us.");
  }
  const snapshot = name.startsWith("s-");
  if (snapshot) {
    const recent = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM backup_objects WHERE user_id = ? AND name LIKE 's-%' AND created_at > ?",
    )
      .bind(userId, now() - 86_400_000)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_SNAPSHOTS_PER_DAY) {
      return fail(c, 429, "rate_limited", "That's enough backups for today. Try again tomorrow.");
    }
  }

  await c.env.BACKUPS.put(objectKey(userId, name), body);
  const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO backup_objects (user_id, name, size, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, name) DO UPDATE SET size = excluded.size, created_at = excluded.created_at",
    ).bind(userId, name, body.byteLength, at),
    c.env.DB.prepare(
      `UPDATE backups SET bytes = ?${snapshot ? ", last_backup_at = ?" : ""} WHERE user_id = ?`,
    ).bind(...(snapshot ? [bytes, at, userId] : [bytes, userId])),
  ]);
  return c.json({ ok: true, bytes });
}

/** GET /v1/backup/objects/:name — for restore and export, also during the 90 days after Pro. */
export async function backupGetRoute(c: Ctx): Promise<Response> {
  const { userId } = c.get("session");
  const name = c.req.param("name") ?? "";
  if (!NAME.test(name)) return fail(c, 400, "bad_request", "Invalid object name");
  const { backup } = await loadBackup(c.env.DB, userId);
  if (!backup) return fail(c, 404, "not_set_up", "There is no backup.");
  const object = await c.env.BACKUPS.get(objectKey(userId, name));
  if (!object) return fail(c, 404, "not_found", "That part of the backup is missing.");
  return new Response(object.body, {
    headers: { "content-type": "application/octet-stream", "content-length": String(object.size) },
  });
}

/** DELETE /v1/backup/objects/:name — the desktop removes screenshots no snapshot needs. */
export async function backupDeleteObjectRoute(c: Ctx): Promise<Response> {
  const { userId } = c.get("session");
  const name = c.req.param("name") ?? "";
  if (!NAME.test(name)) return fail(c, 400, "bad_request", "Invalid object name");
  const row = await c.env.DB.prepare(
    "SELECT size FROM backup_objects WHERE user_id = ? AND name = ?",
  )
    .bind(userId, name)
    .first<{ size: number }>();
  if (row) {
    await c.env.BACKUPS.delete(objectKey(userId, name));
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM backup_objects WHERE user_id = ? AND name = ?").bind(
        userId,
        name,
      ),
      c.env.DB.prepare("UPDATE backups SET bytes = MAX(0, bytes - ?) WHERE user_id = ?").bind(
        row.size,
        userId,
      ),
    ]);
  }
  return c.json({ ok: true });
}

/** Deletes a user's whole backup: every R2 object under their prefix, then the rows. */
export async function deleteBackup(env: Env, userId: string): Promise<void> {
  const prefix = `users/${userId}/`;
  let cursor: string | undefined;
  do {
    const listing = await env.BACKUPS.list({ prefix, cursor });
    if (listing.objects.length > 0) {
      await env.BACKUPS.delete(listing.objects.map((object) => object.key));
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM backup_objects WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM backups WHERE user_id = ?").bind(userId),
  ]);
}

/** DELETE /v1/backup — "Delete backup" and "Start over". Allowed at any time. */
export async function backupDeleteRoute(c: Ctx): Promise<Response> {
  await deleteBackup(c.env, c.get("session").userId);
  return c.json({ ok: true });
}

/**
 * Cron: keeps every backup's deletion date in step with its plan, and deletes the ones whose
 * 90 days have passed.
 */
export async function expireBackups(env: Env, at = now()): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT b.user_id, b.delete_after,
       (SELECT status FROM subscriptions WHERE user_id = b.user_id ORDER BY event_at DESC LIMIT 1) AS status,
       (SELECT event_at FROM subscriptions WHERE user_id = b.user_id ORDER BY event_at DESC LIMIT 1) AS changed_at
     FROM backups b`,
  ).all<{
    user_id: string;
    delete_after: number | null;
    status: string | null;
    changed_at: number | null;
  }>();
  let deleted = 0;
  for (const row of results) {
    const pro = !!row.status && SUBSCRIBED.has(row.status);
    const deleteAfter = deletionDate(pro, row.delete_after, row.changed_at, at);
    if (deleteAfter !== null && deleteAfter <= at) {
      await deleteBackup(env, row.user_id);
      deleted += 1;
    } else if (deleteAfter !== row.delete_after) {
      await env.DB.prepare("UPDATE backups SET delete_after = ? WHERE user_id = ?")
        .bind(deleteAfter, row.user_id)
        .run();
    }
  }
  return deleted;
}
