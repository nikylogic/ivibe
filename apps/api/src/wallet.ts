// SPDX-License-Identifier: AGPL-3.0-only

import type { Settings } from "./settings.ts";
import { now, utcDay } from "./util.ts";

/**
 * The money rules (docs/architecture.md §6.5), all in micro-dollars of Meta usage:
 *
 * 1. Before a call, reserve the most it can cost from the user's wallet and the day's pool.
 * 2. After it, charge what Meta's usage says it cost (never more than the reservation) and give
 *    the rest back. A failed call gives it all back.
 * 3. A recording reserves once for all its live captions, and each caption draws from that
 *    reservation; what was drawn is charged when the recording closes.
 * 4. What a run used is written before its result goes back, so a run whose settle never ran is
 *    charged that, not released for free.
 *
 * Each step is one D1 batch, which runs as a single transaction. The CHECK constraints in the
 * schema decide whether a reservation fits, so concurrent runs can't overspend.
 */

export type HoldOutcome = "ok" | "insufficient_credits" | "capacity_paused";

/** True (1) once the account has any grant besides the free trial, i.e. has paid (D25, D26). */
const PAID =
  "EXISTS (SELECT 1 FROM ledger WHERE user_id = ? AND kind = 'grant' AND ref != 'trial')";

const constraint = (error: unknown, name: string) =>
  error instanceof Error && error.message.includes(name);

export async function hold(
  db: D1Database,
  settings: Settings,
  run: { id: string; userId: string; kind: string; amount: number },
): Promise<HoldOutcome> {
  const day = utcDay();
  const at = now();
  try {
    // Paying accounts skip the free daily pool; whether one has paid is decided inside the
    // transaction, so a payment landing mid-run can't leave the pool unbalanced.
    await db.batch([
      db
        .prepare("INSERT OR IGNORE INTO daily_pool (day, cap) VALUES (?, ?)")
        .bind(day, settings.dailyCap),
      db
        .prepare(
          `INSERT INTO runs (id, user_id, kind, day, hold, status, created_at, pooled) VALUES (?, ?, ?, ?, ?, 'held', ?, NOT ${PAID})`,
        )
        .bind(run.id, run.userId, run.kind, day, run.amount, at, run.userId),
      db
        .prepare("UPDATE wallets SET held = held + ?, updated_at = ? WHERE user_id = ?")
        .bind(run.amount, at, run.userId),
      db
        .prepare(
          "UPDATE daily_pool SET held = held + ? WHERE day = ? AND (SELECT pooled FROM runs WHERE id = ?) = 1",
        )
        .bind(run.amount, day, run.id),
    ]);
    return "ok";
  } catch (error) {
    if (constraint(error, "wallet_funds")) return "insufficient_credits";
    if (constraint(error, "pool_cap")) return "capacity_paused";
    throw error;
  }
}

/**
 * Settles a reservation exactly once: charges what the run used (capped at the reservation) and
 * releases the rest. `actual`, when given, is recorded as the use first. Everything happens in
 * one transaction that reads the run's row itself, so a draw landing at the same moment is
 * either charged or refused, never lost. A second settle of the same run changes nothing.
 */
export async function settle(
  db: D1Database,
  runId: string,
  actual: number | null = null,
  usage: unknown = null,
): Promise<number> {
  const at = now();
  const open = "SELECT user_id, day, hold, used, pooled FROM runs WHERE id = ? AND status = 'held'";
  const [, , , , settled] = await db.batch([
    db
      .prepare("UPDATE runs SET used = ? WHERE id = ? AND status = 'held' AND ? IS NOT NULL")
      .bind(actual === null ? 0 : Math.max(0, Math.ceil(actual)), runId, actual),
    db
      .prepare(
        `UPDATE wallets SET held = wallets.held - r.hold, balance = wallets.balance - MIN(r.used, r.hold), updated_at = ?
         FROM (${open}) AS r WHERE wallets.user_id = r.user_id`,
      )
      .bind(at, runId),
    db
      .prepare(
        `UPDATE daily_pool SET held = daily_pool.held - r.hold, used = daily_pool.used + MIN(r.used, r.hold)
         FROM (${open}) AS r WHERE daily_pool.day = r.day AND r.pooled = 1`,
      )
      .bind(runId),
    db
      .prepare(
        `INSERT INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at)
         SELECT ?, user_id, 'charge', -MIN(used, hold), id, 'charge:' || id, ?
         FROM runs WHERE id = ? AND status = 'held' AND MIN(used, hold) > 0`,
      )
      .bind(crypto.randomUUID(), at, runId),
    db
      .prepare(
        `UPDATE runs SET status = CASE WHEN MIN(used, hold) > 0 THEN 'settled' ELSE 'released' END,
           cost = MIN(used, hold), actual_cost = used, usage = ?, settled_at = ?
         WHERE id = ? AND status = 'held' RETURNING cost`,
      )
      .bind(usage === null ? null : JSON.stringify(usage), at, runId),
  ]);
  return (settled?.results?.[0] as { cost?: number } | undefined)?.cost ?? 0;
}

/**
 * Records what a run cost before its result goes back, so that if the settle after it never
 * runs (the Worker stopped), settleStale still charges it rather than releasing it free.
 */
export async function markUsed(db: D1Database, runId: string, cost: number): Promise<void> {
  await db
    .prepare("UPDATE runs SET used = ? WHERE id = ? AND status = 'held'")
    .bind(Math.max(0, Math.ceil(cost)), runId)
    .run();
}

/** How long a recording's reservation can be drawn from: the longest recording, plus writing. */
export const RECORDING_TTL_MS = 20 * 60_000;

/**
 * Takes `amount` from an open recording's reservation, in one statement. Refused (false) when the
 * recording isn't this user's, is closed or expired, or the draw would go over what was reserved,
 * so no number of parallel or repeated calls can use more than the reservation.
 */
export async function draw(
  db: D1Database,
  recordingId: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const { meta } = await db
    .prepare(
      `UPDATE runs SET used = used + ? WHERE id = ? AND user_id = ? AND kind = 'recording'
         AND status = 'held' AND created_at > ? AND used + ? <= hold`,
    )
    .bind(amount, recordingId, userId, now() - RECORDING_TTL_MS, amount)
    .run();
  return meta.changes === 1;
}

/** Gives a draw back when its Meta call failed, so a failed caption costs nothing. */
export async function undraw(db: D1Database, recordingId: string, amount: number): Promise<void> {
  await db
    .prepare(
      "UPDATE runs SET used = MAX(0, used - ?) WHERE id = ? AND kind = 'recording' AND status = 'held'",
    )
    .bind(amount, recordingId)
    .run();
}

/**
 * Settles runs that were never settled (the Worker was stopped, a recording never closed): each
 * is charged what it recorded as used and the rest is released. Recordings stay open for
 * RECORDING_TTL_MS; every other run settles within seconds, so 10 minutes means it died.
 */
export async function settleStale(db: D1Database, olderThanMs = 10 * 60_000): Promise<number> {
  const at = now();
  const { results } = await db
    .prepare(
      `SELECT id FROM runs WHERE status = 'held'
         AND created_at < CASE WHEN kind = 'recording' THEN ? ELSE ? END LIMIT 200`,
    )
    .bind(at - Math.max(olderThanMs, RECORDING_TTL_MS), at - olderThanMs)
    .all<{ id: string }>();
  for (const run of results) await settle(db, run.id);
  return results.length;
}

export async function balanceOf(db: D1Database, userId: string): Promise<number> {
  const wallet = await db
    .prepare("SELECT balance - held AS available FROM wallets WHERE user_id = ?")
    .bind(userId)
    .first<{ available: number }>();
  return wallet?.available ?? 0;
}

/**
 * True while the account has only ever had the free trial: no paid or manual grant. Those runs
 * use the cheaper contributor model (D25); paying users never do.
 */
export async function trialOnly(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT ${PAID} AS paid`).bind(userId).first<{ paid: number }>();
  return !row?.paid;
}

export type TrialOutcome =
  "granted" | "already_claimed" | "device_limit" | "network_limit" | "account_too_new";

/**
 * The free trial, once per account, at most N per computer ever and M per network a day.
 * Hashes come in already salted (auth.ts).
 */
export async function grantTrial(
  db: D1Database,
  settings: Settings,
  claim: {
    userId: string;
    deviceHash: string;
    networkHash: string;
    githubCreatedAt: number | null;
  },
): Promise<TrialOutcome> {
  const existing = await db
    .prepare("SELECT 1 FROM trial_claims WHERE user_id = ?")
    .bind(claim.userId)
    .first();
  if (existing) return "already_claimed";

  const minAge = settings.trialMinGithubAgeDays * 86_400_000;
  if (claim.githubCreatedAt !== null && now() - claim.githubCreatedAt < minAge)
    return "account_too_new";

  const day = utcDay();
  const [device, network] = await db.batch<{ n: number }>([
    db
      .prepare("SELECT COUNT(*) AS n FROM trial_claims WHERE device_hash = ?")
      .bind(claim.deviceHash),
    db
      .prepare("SELECT COUNT(*) AS n FROM trial_claims WHERE network_hash = ? AND day = ?")
      .bind(claim.networkHash, day),
  ]);
  if ((device?.results[0]?.n ?? 0) >= settings.trialPerDevice) return "device_limit";
  if ((network?.results[0]?.n ?? 0) >= settings.trialPerNetworkPerDay) return "network_limit";

  const at = now();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO trial_claims (user_id, device_hash, network_hash, day, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(claim.userId, claim.deviceHash, claim.networkHash, day, settings.trialAmount, at),
      db
        .prepare(
          "INSERT INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at) VALUES (?, ?, 'grant', ?, 'trial', ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          claim.userId,
          settings.trialAmount,
          `grant:trial:${claim.userId}`,
          at,
        ),
      db
        .prepare("UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
        .bind(settings.trialAmount, at, claim.userId),
    ]);
  } catch (error) {
    // Two first calls racing: the first one's claim stands.
    if (constraint(error, "UNIQUE")) return "already_claimed";
    throw error;
  }
  return "granted";
}

/** Trial outcomes that never change for an account; a network limit is retried another day. */
const FINAL: readonly string[] = ["granted", "device_limit", "account_too_new"];

/**
 * Starts the free trial on the account's first Cloud call (D24), with the device bound to the
 * session at sign-in and the network the call came from. Called only when a reservation finds
 * no credits, so it costs nothing on normal calls. Each outcome is recorded on the account.
 */
export async function activateTrial(
  db: D1Database,
  settings: Settings,
  claim: { userId: string; deviceHash: string; networkHash: string },
): Promise<TrialOutcome> {
  const user = await db
    .prepare("SELECT github_created_at, trial_status, trial_checked_day FROM users WHERE id = ?")
    .bind(claim.userId)
    .first<{
      github_created_at: number | null;
      trial_status: string | null;
      trial_checked_day: string | null;
    }>();
  if (!user) return "already_claimed";
  const day = utcDay();
  if (user.trial_status && FINAL.includes(user.trial_status)) {
    return user.trial_status === "granted"
      ? "already_claimed"
      : (user.trial_status as TrialOutcome);
  }
  if (user.trial_status === "network_limit" && user.trial_checked_day === day)
    return "network_limit";

  const outcome = await grantTrial(db, settings, {
    ...claim,
    githubCreatedAt: user.github_created_at,
  });
  const status = outcome === "already_claimed" ? "granted" : outcome;
  await db
    .prepare("UPDATE users SET trial_status = ?, trial_checked_day = ? WHERE id = ?")
    .bind(status, day, claim.userId)
    .run();
  return outcome;
}

/** What the account's trial looks like, for the app: not started yet, active, or refused. */
export async function trialState(db: D1Database, userId: string): Promise<string> {
  const user = await db
    .prepare("SELECT trial_status, trial_checked_day FROM users WHERE id = ?")
    .bind(userId)
    .first<{ trial_status: string | null; trial_checked_day: string | null }>();
  if (!user?.trial_status) return "available";
  if (user.trial_status === "network_limit" && user.trial_checked_day !== utcDay()) {
    return "available";
  }
  return user.trial_status;
}
