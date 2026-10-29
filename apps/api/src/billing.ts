// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import { page } from "./auth.ts";
import type { AppEnv, Env } from "./env.ts";
import { apiError } from "./runs.ts";
import { loadSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { now } from "./util.ts";

/**
 * iVibe Pro (D26): a monthly subscription sold through Dodo Payments, the merchant of record.
 * Dodo collects the money; each successful payment resets the wallet the trial uses to the
 * plan's credits, so our ledger stays the only balance (D9). Credits don't roll over: what is
 * left at a renewal is replaced, and when the plan ends the balance goes to zero.
 *
 *   POST /v1/billing/checkout  → a Dodo checkout URL (or the portal, if already subscribed)
 *   POST /v1/billing/portal    → the Dodo customer portal (cancel, card, invoices)
 *   GET  /v1/billing/return    → the page Dodo sends the browser back to
 *   POST /v1/billing/webhook   → Dodo's signed events (Standard Webhooks)
 */

type Ctx = Context<AppEnv>;

/** Subscription states in which the user is on Pro (on_hold/past_due: Dodo is retrying a card). */
export const SUBSCRIBED = new Set(["active", "on_hold", "past_due"]);
const TOLERANCE_S = 5 * 60;
/** A plan in one of these states has ended: its credits go (D26). */
const ENDED = new Set(["cancelled", "expired"]);

/**
 * A plan ended: the wallet keeps only what a run in progress holds. The credits taken away get
 * an `adjust` ledger row, so the ledger still adds up to the balance. Once per `key`.
 */
async function endCredits(db: D1Database, userId: string, key: string): Promise<void> {
  const at = now();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at)
         SELECT ?, user_id, 'adjust', held - balance, 'plan-ended', ?, ? FROM wallets
         WHERE user_id = ? AND balance > held`,
      )
      .bind(crypto.randomUUID(), key, at, userId),
    db
      .prepare(
        "UPDATE wallets SET balance = held, updated_at = ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ? AND created_at = ?)",
      )
      .bind(at, userId, key, at),
  ]);
}

export interface Plan {
  status: string;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

/** The account's latest subscription, or null if it never had one. */
export async function planOf(db: D1Database, userId: string): Promise<Plan | null> {
  const row = await db
    .prepare(
      "SELECT status, renews_at, cancel_at_period_end FROM subscriptions WHERE user_id = ? ORDER BY event_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<{ status: string; renews_at: string | null; cancel_at_period_end: number }>();
  return row
    ? { status: row.status, renewsAt: row.renews_at, cancelAtPeriodEnd: !!row.cancel_at_period_end }
    : null;
}

export type Tier = "pro" | "trial" | "free";

/**
 * The badge the app shows, decided here so it always matches how runs are served: Pro while a
 * subscription is live; Trial while an account that never paid still has its free credits (or
 * hasn't started them); Free otherwise (trial spent or refused, or a plan that ended).
 */
export function tierOf(plan: Plan | null, paid: boolean, trial: string, available: number): Tier {
  if (plan && SUBSCRIBED.has(plan.status)) return "pro";
  if (!paid && (trial === "available" || (trial === "granted" && available > 0))) return "trial";
  return "free";
}

/** What the app shows before checkout. */
export const planOffer = (env: Env, settings: Settings) => ({
  available: !!env.DODO_API_KEY && !!settings.plan.productId,
  price: settings.plan.priceLabel,
  credits: Math.floor(settings.plan.amount / 10_000),
});

async function dodo<T>(env: Env, path: string, body?: object): Promise<T> {
  const response = await fetch(`${env.DODO_API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DODO_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Dodo ${path.split("/")[1]} HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function portalLink(c: Ctx, customerId: string): Promise<string> {
  const back = encodeURIComponent(`${c.env.API_URL}/v1/billing/return?from=portal`);
  const { link } = await dodo<{ link: string }>(
    c.env,
    `/customers/${encodeURIComponent(customerId)}/customer-portal/session?return_url=${back}`,
  );
  return link;
}

const latestCustomer = (db: D1Database, userId: string) =>
  db
    .prepare(
      "SELECT customer_id, status FROM subscriptions WHERE user_id = ? ORDER BY event_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<{ customer_id: string; status: string }>();

export async function checkoutRoute(c: Ctx): Promise<Response> {
  const settings = await loadSettings(c.env.DB);
  if (!planOffer(c.env, settings).available) {
    return apiError(
      c,
      503,
      "billing_unavailable",
      "iVibe Pro is coming soon. Until then, add your own Meta API key in Settings to keep going for free.",
    );
  }
  const { userId } = c.get("session");
  const last = await latestCustomer(c.env.DB, userId);
  // Already on Pro: a second checkout would double-bill, so send them to manage it instead.
  if (last && SUBSCRIBED.has(last.status)) {
    return c.json({ url: await portalLink(c, last.customer_id), portal: true });
  }
  const user = await c.env.DB.prepare("SELECT email, name, github_login FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string | null; name: string | null; github_login: string | null }>();
  const customer = last
    ? { customer_id: last.customer_id }
    : user?.email
      ? { email: user.email, name: user.name ?? user.github_login ?? user.email }
      : undefined;
  const session = await dodo<{ checkout_url: string | null }>(c.env, "/checkouts", {
    product_cart: [{ product_id: settings.plan.productId, quantity: 1 }],
    ...(customer ? { customer } : {}),
    // Copied onto the subscription and its payments, which is how webhooks find the account.
    metadata: { user_id: userId },
    return_url: `${c.env.API_URL}/v1/billing/return`,
  });
  if (!session.checkout_url) throw new Error("Dodo returned no checkout_url");
  return c.json({ url: session.checkout_url, portal: false });
}

export async function portalRoute(c: Ctx): Promise<Response> {
  if (!c.env.DODO_API_KEY) {
    return apiError(c, 503, "billing_unavailable", "Billing isn't available right now.");
  }
  const last = await latestCustomer(c.env.DB, c.get("session").userId);
  if (!last) return apiError(c, 400, "no_subscription", "You don't have an iVibe Pro plan yet.");
  return c.json({ url: await portalLink(c, last.customer_id) });
}

/** Where Dodo sends the browser after checkout (`?status=active|failed|…`) or the portal. */
export function returnPage(c: Ctx): Response {
  const appLink = `${c.env.APP_SCHEME}://billing`;
  if (c.req.query("from") === "portal") {
    return c.html(page("All set", "You can go back to iVibe now.", appLink));
  }
  const status = c.req.query("status");
  if (status && status !== "active" && status !== "succeeded") {
    return c.html(
      page("Payment didn't go through", "Nothing was charged. You can try again from iVibe."),
    );
  }
  return c.html(
    page(
      "Welcome to iVibe Pro",
      "Your credits will appear in the app within a few seconds. You can go back to iVibe now.",
      appLink,
    ),
  );
}

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/**
 * Standard Webhooks: HMAC-SHA256 of `id.timestamp.body` with the base64 secret after `whsec_`,
 * any of the space-separated `v1,<base64>` signatures may match, and the timestamp must be recent.
 */
export async function verifyWebhook(
  headers: { id?: string; timestamp?: string; signature?: string },
  body: string,
  secret: string,
  nowS = Date.now() / 1000,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (!(Math.abs(nowS - Number(timestamp)) <= TOLERANCE_S)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    try {
      if (await crypto.subtle.verify("HMAC", key, fromBase64(value), data)) return true;
    } catch {
      // Not base64: try the next signature.
    }
  }
  return false;
}

interface DodoEvent {
  type: string;
  data: {
    subscription_id?: string | null;
    payment_id?: string;
    status?: string;
    product_id?: string;
    customer?: { customer_id?: string };
    metadata?: Record<string, unknown>;
    product_cart?: { product_id?: string }[] | null;
    next_billing_date?: string | null;
    cancel_at_next_billing_date?: boolean;
  };
}

export type EventOutcome = "applied" | "ignored" | "retry";

/** The account an event belongs to: the checkout's metadata, else the subscription we know. */
async function accountFor(db: D1Database, data: DodoEvent["data"]): Promise<string | null> {
  const fromMetadata = data.metadata?.user_id;
  if (typeof fromMetadata === "string") {
    const user = await db.prepare("SELECT id FROM users WHERE id = ?").bind(fromMetadata).first();
    if (user) return fromMetadata;
  }
  if (!data.subscription_id) return null;
  const known = await db
    .prepare("SELECT user_id FROM subscriptions WHERE id = ?")
    .bind(data.subscription_id)
    .first<{ user_id: string }>();
  return known?.user_id ?? null;
}

/** Applies one verified event. `eventAt` (ms) orders subscription updates. */
export async function applyEvent(
  db: D1Database,
  settings: Settings,
  event: DodoEvent,
  eventAt: number,
): Promise<EventOutcome> {
  const { data } = event;

  if (event.type.startsWith("subscription.")) {
    if (!data.subscription_id || !data.status || !data.customer?.customer_id) return "ignored";
    // The Dodo business also sells other brands' products; only iVibe Pro is ours.
    if (data.product_id && data.product_id !== settings.plan.productId) return "ignored";
    const userId = await accountFor(db, data);
    if (!userId) {
      console.error(`billing: ${event.type} for an unknown account`);
      return "ignored";
    }
    const recorded = await db
      .prepare(
        `INSERT INTO subscriptions (id, user_id, customer_id, product_id, status, renews_at, cancel_at_period_end, event_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, renews_at = excluded.renews_at,
           cancel_at_period_end = excluded.cancel_at_period_end, product_id = excluded.product_id,
           customer_id = excluded.customer_id, event_at = excluded.event_at
         WHERE excluded.event_at >= subscriptions.event_at`,
      )
      .bind(
        data.subscription_id,
        userId,
        data.customer.customer_id,
        data.product_id ?? null,
        data.status,
        data.next_billing_date ?? null,
        data.cancel_at_next_billing_date ? 1 : 0,
        eventAt,
        now(),
      )
      .run();
    // The plan ended (not a card being retried): unused credits go. A late, older event
    // that didn't change the record changes nothing here either.
    if (recorded.meta.changes > 0 && ENDED.has(data.status)) {
      await endCredits(db, userId, `end:${data.subscription_id}:${eventAt}`);
    }
    return "applied";
  }

  if (event.type === "payment.succeeded") {
    // Only subscription payments add credits; we sell nothing else yet.
    if (!data.subscription_id || !data.payment_id) return "ignored";
    const userId = await accountFor(db, data);
    if (!userId) {
      // A Pro payment whose subscription event hasn't arrived yet: let Dodo deliver it again.
      // Anything else is another brand's sale on the same Dodo business (D26), not ours.
      const pro = data.product_cart?.some((item) => item.product_id === settings.plan.productId);
      return pro && settings.plan.productId ? "retry" : "ignored";
    }
    const key = `grant:payment:${data.payment_id}`;
    const at = now();
    // One transaction, and only if this payment wasn't granted before: what is left from last
    // month (or the trial) is taken away, then the month's credits are set. No roll-over.
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at)
           SELECT ?, user_id, 'adjust', held - balance, 'renewal', ?, ? FROM wallets
           WHERE user_id = ? AND balance > held AND NOT EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)`,
        )
        .bind(crypto.randomUUID(), `reset:${key}`, at, userId, key),
      db
        .prepare(
          "UPDATE wallets SET balance = held + ?, updated_at = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)",
        )
        .bind(settings.plan.amount, at, userId, key),
      db
        .prepare(
          "INSERT OR IGNORE INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at) VALUES (?, ?, 'grant', ?, 'subscription', ?, ?)",
        )
        .bind(crypto.randomUUID(), userId, settings.plan.amount, key, at),
    ]);
    return "applied";
  }

  if (event.type.startsWith("refund.") || event.type.startsWith("dispute.")) {
    // Rare, and the credits may already be spent: handled by hand from Dodo's dashboard for now.
    console.error(`billing: ${event.type} needs a manual look`);
  }
  return "ignored";
}

export async function webhookRoute(c: Ctx): Promise<Response> {
  const secret = c.env.DODO_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "not_configured" }, 503);
  const body = await c.req.text();
  const headers = {
    id: c.req.header("webhook-id"),
    timestamp: c.req.header("webhook-timestamp"),
    signature: c.req.header("webhook-signature"),
  };
  if (!(await verifyWebhook(headers, body, secret))) return c.json({ error: "bad_signature" }, 401);

  const db = c.env.DB;
  const event = JSON.parse(body) as DodoEvent;
  const id = headers.id!;
  await db
    .prepare("INSERT OR IGNORE INTO webhook_events (id, type, received_at) VALUES (?, ?, ?)")
    .bind(id, event.type, now())
    .run();
  const seen = await db
    .prepare("SELECT processed_at FROM webhook_events WHERE id = ?")
    .bind(id)
    .first<{ processed_at: number | null }>();
  if (seen?.processed_at) return c.json({ ok: true, duplicate: true });

  const outcome = await applyEvent(
    db,
    await loadSettings(db),
    event,
    Number(headers.timestamp) * 1000,
  );
  if (outcome === "retry") return c.json({ error: "retry" }, 503);
  await db.prepare("UPDATE webhook_events SET processed_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ ok: true, outcome });
}
