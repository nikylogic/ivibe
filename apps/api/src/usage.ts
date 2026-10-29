// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import { SUBSCRIBED, planOf } from "./billing.ts";
import type { AppEnv } from "./env.ts";

/**
 * GET /v1/usage: what the Billing page shows. Credits left, and what was spent in the current
 * period (since the last Pro renewal, otherwise the last 30 days) by kind of run, from the same
 * `runs` rows the ledger charges. Amounts are credits to two decimals (1 credit = 1 cent of Meta
 * usage), so a 0.08-credit dictation shows as spent rather than rounding to nothing.
 */

const DAY_MS = 86_400_000;
const credits = (micro: number) => Math.round(micro / 100) / 100;

/** Start of the Pro billing period that ends at `renewsAt` (one month earlier). */
export function periodStart(renewsAt: string, now = Date.now()): number {
  const start = new Date(renewsAt);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return Math.min(start.getTime(), now);
}

export async function usageRoute(c: Context<AppEnv>): Promise<Response> {
  const db = c.env.DB;
  const { userId } = c.get("session");
  const plan = await planOf(db, userId);
  const pro = !!plan?.renewsAt && SUBSCRIBED.has(plan.status);
  const from = pro ? periodStart(plan.renewsAt!) : Date.now() - 30 * DAY_MS;

  const [wallet, byKind, granted, recent] = await Promise.all([
    db
      .prepare("SELECT balance, held FROM wallets WHERE user_id = ?")
      .bind(userId)
      .first<{ balance: number; held: number }>(),
    db
      .prepare(
        "SELECT kind, COUNT(*) AS runs, SUM(cost) AS cost FROM runs WHERE user_id = ? AND status = 'settled' AND created_at >= ? GROUP BY kind",
      )
      .bind(userId, from)
      .all<{ kind: string; runs: number; cost: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS amount FROM ledger WHERE user_id = ? AND kind = 'grant' AND created_at >= ?",
      )
      .bind(userId, from)
      .first<{ amount: number }>(),
    db
      .prepare(
        "SELECT kind, cost, created_at FROM runs WHERE user_id = ? AND status = 'settled' AND kind != 'transcribe' ORDER BY created_at DESC LIMIT 15",
      )
      .bind(userId)
      .all<{ kind: string; cost: number; created_at: number }>(),
  ]);

  const kinds = byKind.results.map((row) => ({
    kind: row.kind,
    runs: row.runs,
    credits: credits(row.cost),
  }));
  return c.json({
    available: credits((wallet?.balance ?? 0) - (wallet?.held ?? 0)),
    // Reserved by a run still in progress; returned or charged when it finishes.
    held: credits(wallet?.held ?? 0),
    period: { from: new Date(from).toISOString(), kind: pro ? "billing" : "30d" },
    spent: credits(byKind.results.reduce((sum, row) => sum + row.cost, 0)),
    added: credits(granted?.amount ?? 0),
    byKind: kinds,
    // Recent recordings (captions are folded into the totals above, not listed one by one).
    recent: recent.results.map((row) => ({
      kind: row.kind,
      credits: credits(row.cost),
      at: new Date(row.created_at).toISOString(),
    })),
  });
}
