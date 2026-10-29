// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyEvent, planOf, tierOf, verifyWebhook } from "./billing.ts";
import { periodStart, usageRoute } from "./usage.ts";
import { testDb, testSettings as settings } from "./test-db.test-helper.ts";
import { balanceOf, hold, settle, trialOnly } from "./wallet.ts";

const SECRET = `whsec_${Buffer.from("test-secret-0123456789").toString("base64")}`;

function sign(id: string, timestamp: number, body: string) {
  const key = Buffer.from(SECRET.slice(6), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${mac}`;
}

describe("webhook signatures", () => {
  const body = JSON.stringify({ type: "payment.succeeded", data: {} });
  const nowS = 1_800_000_000;

  it("accepts Dodo's Standard Webhooks signature", async () => {
    const signature = sign("msg_1", nowS, body);
    expect(
      await verifyWebhook({ id: "msg_1", timestamp: String(nowS), signature }, body, SECRET, nowS),
    ).toBe(true);
  });

  it("accepts any one of several signatures (secret rotation)", async () => {
    const signature = `v1,bm90LWl0 ${sign("msg_1", nowS, body)}`;
    expect(
      await verifyWebhook({ id: "msg_1", timestamp: String(nowS), signature }, body, SECRET, nowS),
    ).toBe(true);
  });

  it("refuses a changed body, another id, an old timestamp or missing headers", async () => {
    const signature = sign("msg_1", nowS, body);
    const headers = { id: "msg_1", timestamp: String(nowS), signature };
    expect(await verifyWebhook(headers, `${body} `, SECRET, nowS)).toBe(false);
    expect(await verifyWebhook({ ...headers, id: "msg_2" }, body, SECRET, nowS)).toBe(false);
    expect(await verifyWebhook(headers, body, SECRET, nowS + 301)).toBe(false);
    expect(await verifyWebhook({ ...headers, signature: undefined }, body, SECRET, nowS)).toBe(
      false,
    );
  });
});

let sqlite: DatabaseSync;
let db: D1Database;

beforeEach(() => {
  ({ sqlite, db } = testDb());
  sqlite.prepare("INSERT INTO users (id, created_at) VALUES ('u', 0)").run();
  sqlite
    .prepare("INSERT INTO wallets (user_id, balance, held, updated_at) VALUES ('u', 0, 0, 0)")
    .run();
});

const subscription = (status: string, extra: object = {}) => ({
  type: `subscription.${status}`,
  data: {
    subscription_id: "sub_1",
    status,
    product_id: settings.plan.productId,
    customer: { customer_id: "cus_1" },
    metadata: { user_id: "u" },
    next_billing_date: "2026-11-28T00:00:00Z",
    cancel_at_next_billing_date: false,
    ...extra,
  },
});

const payment = (paymentId: string, metadata: object = { user_id: "u" }) => ({
  type: "payment.succeeded",
  data: {
    payment_id: paymentId,
    subscription_id: "sub_1",
    metadata,
    product_cart: [{ product_id: settings.plan.productId }],
  },
});

describe("subscription events", () => {
  it("records the plan from the checkout's metadata", async () => {
    expect(await applyEvent(db, settings, subscription("active"), 1000)).toBe("applied");
    expect(await planOf(db, "u")).toEqual({
      status: "active",
      renewsAt: "2026-11-28T00:00:00Z",
      cancelAtPeriodEnd: false,
    });
  });

  it("ignores an older event that arrives late", async () => {
    await applyEvent(db, settings, subscription("cancelled"), 2000);
    await applyEvent(db, settings, subscription("active"), 1000);
    expect((await planOf(db, "u"))?.status).toBe("cancelled");
  });

  it("follows later events without metadata through the known subscription", async () => {
    await applyEvent(db, settings, subscription("active"), 1000);
    await applyEvent(
      db,
      settings,
      subscription("active", { metadata: {}, cancel_at_next_billing_date: true }),
      2000,
    );
    expect((await planOf(db, "u"))?.cancelAtPeriodEnd).toBe(true);
  });

  it("ignores subscriptions it can't tie to an account", async () => {
    const stray = subscription("active", { metadata: { user_id: "nobody" } });
    expect(await applyEvent(db, settings, stray, 1000)).toBe("ignored");
    expect(await planOf(db, "u")).toBeNull();
  });
});

describe("payments", () => {
  /** The wallet's balance always equals the sum of its ledger rows. */
  const ledgerTotal = () =>
    (
      sqlite.prepare("SELECT SUM(amount) AS total FROM ledger WHERE user_id = 'u'").get() as {
        total: number;
      }
    ).total;

  it("sets the plan's credits once per payment, with no roll-over", async () => {
    expect(await applyEvent(db, settings, payment("pay_1"), 1000)).toBe("applied");
    expect(await applyEvent(db, settings, payment("pay_1"), 1000)).toBe("applied");
    expect(await balanceOf(db, "u")).toBe(4_000_000);
    // A month later, with 1,500,000 left: the renewal resets to 4,000,000, not 5,500,000.
    sqlite.prepare("UPDATE wallets SET balance = 1500000").run();
    sqlite
      .prepare(
        "INSERT INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at) VALUES ('spent', 'u', 'charge', -2500000, 'r', 'spent', 0)",
      )
      .run();
    await applyEvent(db, settings, payment("pay_2"), 2000);
    await applyEvent(db, settings, payment("pay_2"), 2000);
    expect(await balanceOf(db, "u")).toBe(4_000_000);
    expect(ledgerTotal()).toBe(4_000_000);
  });

  it("drops the free trial's leftover credits at the first payment", async () => {
    sqlite.prepare("UPDATE wallets SET balance = 300000").run();
    sqlite
      .prepare(
        "INSERT INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at) VALUES ('t', 'u', 'grant', 300000, 'trial', 'trial:u', 0)",
      )
      .run();
    await applyEvent(db, settings, payment("pay_1"), 1000);
    expect(await balanceOf(db, "u")).toBe(4_000_000);
    expect(ledgerTotal()).toBe(4_000_000);
  });

  it("keeps what a run in progress holds through a reset", async () => {
    await applyEvent(db, settings, payment("pay_1"), 1000);
    expect(await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 })).toBe(
      "ok",
    );
    await applyEvent(db, settings, payment("pay_2"), 2000);
    expect(await settle(db, "r1", 60_000)).toBe(60_000);
    expect(await balanceOf(db, "u")).toBe(4_000_000 + 100_000 - 60_000);
  });

  it("takes the credits away when the plan ends, not while a card is retried", async () => {
    await applyEvent(db, settings, subscription("active"), 1000);
    await applyEvent(db, settings, payment("pay_1"), 1000);
    await applyEvent(db, settings, subscription("on_hold"), 2000);
    expect(await balanceOf(db, "u")).toBe(4_000_000);
    await applyEvent(db, settings, subscription("cancelled"), 3000);
    await applyEvent(db, settings, subscription("cancelled"), 3000);
    expect(await balanceOf(db, "u")).toBe(0);
    expect(ledgerTotal()).toBe(0);
    // Coming back: the next payment sets a fresh month.
    await applyEvent(db, settings, subscription("active"), 4000);
    await applyEvent(db, settings, payment("pay_2"), 4000);
    expect(await balanceOf(db, "u")).toBe(4_000_000);
  });

  it("ignores a late, older cancellation", async () => {
    await applyEvent(db, settings, subscription("active"), 5000);
    await applyEvent(db, settings, payment("pay_1"), 5000);
    await applyEvent(db, settings, subscription("cancelled"), 1000);
    expect(await balanceOf(db, "u")).toBe(4_000_000);
  });

  it("asks Dodo to retry a payment for a subscription it hasn't seen yet", async () => {
    expect(await applyEvent(db, settings, payment("pay_1", {}), 1000)).toBe("retry");
    expect(await balanceOf(db, "u")).toBe(0);
    await applyEvent(db, settings, subscription("active"), 1000);
    expect(await applyEvent(db, settings, payment("pay_1", {}), 1000)).toBe("applied");
    expect(await balanceOf(db, "u")).toBe(4_000_000);
  });

  it("ignores another brand's subscriptions and payments on the same Dodo business", async () => {
    const other = subscription("active", { product_id: "pdt_dexmeet", metadata: {} });
    expect(await applyEvent(db, settings, other, 1000)).toBe("ignored");
    const sale = {
      type: "payment.succeeded",
      data: {
        payment_id: "pay_x",
        subscription_id: "sub_x",
        metadata: {},
        product_cart: [{ product_id: "pdt_dexmeet" }],
      },
    };
    expect(await applyEvent(db, settings, sale, 1000)).toBe("ignored");
    expect(await planOf(db, "u")).toBeNull();
  });

  it("ignores one-off payments", async () => {
    const oneOff = { type: "payment.succeeded", data: { payment_id: "pay_9", metadata: {} } };
    expect(await applyEvent(db, settings, oneOff, 1000)).toBe("ignored");
  });

  it("moves a paying account to the standard model and off the free daily pool", async () => {
    expect(await trialOnly(db, "u")).toBe(true);
    await applyEvent(db, settings, payment("pay_1"), 1000);
    expect(await trialOnly(db, "u")).toBe(false);

    // The free pool is used up for the day, yet the paying user's run still goes through.
    const full = { ...settings, dailyCap: 10 };
    expect(await hold(db, full, { id: "r1", userId: "u", kind: "fix", amount: 100_000 })).toBe(
      "ok",
    );
    expect(await settle(db, "r1", 60_000)).toBe(60_000);
    expect(await balanceOf(db, "u")).toBe(4_000_000 - 60_000);
    const pool = sqlite.prepare("SELECT used, held FROM daily_pool").get() as {
      used: number;
      held: number;
    };
    expect(pool).toEqual({ used: 0, held: 0 });
  });
});

describe("tier", () => {
  const plan = (status: string) => ({ status, renewsAt: null, cancelAtPeriodEnd: false });

  it("is Pro while a subscription is live, even with a failed renewal being retried", () => {
    expect(tierOf(plan("active"), true, "granted", 0)).toBe("pro");
    expect(tierOf(plan("past_due"), true, "granted", 0)).toBe("pro");
  });

  it("is Trial while an unpaid account has trial credits, or hasn't started them", () => {
    expect(tierOf(null, false, "available", 0)).toBe("trial");
    expect(tierOf(null, false, "granted", 120)).toBe("trial");
  });

  it("is Free once the trial is spent or refused, or a plan ended", () => {
    expect(tierOf(null, false, "granted", 0)).toBe("free");
    expect(tierOf(null, false, "device_limit", 0)).toBe("free");
    expect(tierOf(plan("cancelled"), true, "granted", 900_000)).toBe("free");
    expect(tierOf(plan("failed"), false, "available", 0)).toBe("trial");
  });
});

describe("usage", () => {
  it("starts a Pro period one month before the renewal", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(new Date(periodStart("2026-11-28T07:42:38Z", now)).toISOString()).toBe(
      "2026-10-28T07:42:38.000Z",
    );
  });

  it("reports credits left and what was spent, by kind, to the cent of a credit", async () => {
    await applyEvent(db, settings, payment("pay_1"), 1000);
    await hold(db, settings, { id: "d1", userId: "u", kind: "dictate", amount: 25_000 });
    await settle(db, "d1", 812);
    await hold(db, settings, { id: "f1", userId: "u", kind: "fix", amount: 100_000 });
    await settle(db, "f1", 31_400);
    await hold(db, settings, { id: "t1", userId: "u", kind: "transcribe", amount: 600 });
    await settle(db, "t1", 600);
    await hold(db, settings, { id: "open", userId: "u", kind: "fix", amount: 100_000 });

    let body: Record<string, unknown> = {};
    const c = {
      env: { DB: db },
      get: () => ({ userId: "u", deviceHash: "d" }),
      json: (value: Record<string, unknown>) => ((body = value), new Response()),
    };
    await usageRoute(c as never);
    expect(body).toMatchObject({
      available: 386.72, // 400 − 3.28 spent − 10 reserved by the open run
      held: 10,
      spent: 3.28,
      added: 400,
      period: { kind: "30d" },
    });
    expect(body.byKind).toEqual(
      expect.arrayContaining([
        { kind: "dictate", runs: 1, credits: 0.08 },
        { kind: "fix", runs: 1, credits: 3.14 },
        { kind: "transcribe", runs: 1, credits: 0.06 },
      ]),
    );
    expect((body.recent as { kind: string }[]).map((run) => run.kind).sort()).toEqual([
      "dictate",
      "fix",
    ]);
  });
});
