// SPDX-License-Identifier: AGPL-3.0-only

import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb, testSettings } from "./test-db.test-helper.ts";
import {
  activateTrial,
  balanceOf,
  grantTrial,
  hold,
  releaseStale,
  settle,
  trialOnly,
  trialState,
} from "./wallet.ts";

const settings = testSettings;

let sqlite: DatabaseSync;
let db: D1Database;
const OLD_ACCOUNT = Date.now() - 365 * 86_400_000;

function addUser(id: string, balance = 0) {
  sqlite.prepare("INSERT INTO users (id, created_at) VALUES (?, 0)").run(id);
  sqlite
    .prepare("INSERT INTO wallets (user_id, balance, held, updated_at) VALUES (?, ?, 0, 0)")
    .run(id, balance);
}

const wallet = (id: string) =>
  sqlite.prepare("SELECT balance, held FROM wallets WHERE user_id = ?").get(id) as {
    balance: number;
    held: number;
  };

const ledgerSum = (id: string) =>
  (
    sqlite
      .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE user_id = ?")
      .get(id) as { n: number }
  ).n;

beforeEach(() => {
  ({ sqlite, db } = testDb());
});

describe("hold and settle", () => {
  it("reserves, then charges the real cost and gives back the rest", async () => {
    addUser("u", 500_000);
    expect(await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 })).toBe(
      "ok",
    );
    expect(wallet("u")).toEqual({ balance: 500_000, held: 100_000 });
    expect(await balanceOf(db, "u")).toBe(400_000);

    expect(await settle(db, "r1", 41_234.4)).toBe(41_235);
    expect(wallet("u")).toEqual({ balance: 458_765, held: 0 });
  });

  it("never charges more than was reserved", async () => {
    addUser("u", 500_000);
    await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 });
    expect(await settle(db, "r1", 250_000)).toBe(100_000);
    expect(wallet("u").balance).toBe(400_000);
    const run = sqlite.prepare("SELECT cost, actual_cost FROM runs WHERE id = 'r1'").get();
    expect(run).toEqual({ cost: 100_000, actual_cost: 250_000 });
  });

  it("settles a run only once", async () => {
    addUser("u", 500_000);
    await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 });
    await settle(db, "r1", 30_000);
    expect(await settle(db, "r1", 30_000)).toBe(0);
    expect(wallet("u")).toEqual({ balance: 470_000, held: 0 });
  });

  it("refuses a reservation the balance can't cover, and changes nothing", async () => {
    addUser("u", 50_000);
    expect(await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 })).toBe(
      "insufficient_credits",
    );
    expect(wallet("u")).toEqual({ balance: 50_000, held: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM runs").get()).toEqual({ n: 0 });
  });

  it("stops parallel runs from overspending together", async () => {
    addUser("u", 150_000);
    expect(await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 })).toBe(
      "ok",
    );
    expect(await hold(db, settings, { id: "r2", userId: "u", kind: "fix", amount: 100_000 })).toBe(
      "insufficient_credits",
    );
    expect(
      await hold(db, settings, { id: "r3", userId: "u", kind: "dictate", amount: 15_000 }),
    ).toBe("ok");
  });

  it("pauses everyone once the day's pool is full", async () => {
    addUser("a", 900_000);
    addUser("b", 900_000);
    expect(await hold(db, settings, { id: "r1", userId: "a", kind: "fix", amount: 600_000 })).toBe(
      "ok",
    );
    expect(await hold(db, settings, { id: "r2", userId: "b", kind: "fix", amount: 600_000 })).toBe(
      "capacity_paused",
    );
    await settle(db, "r1", 100_000);
    expect(await hold(db, settings, { id: "r3", userId: "b", kind: "fix", amount: 600_000 })).toBe(
      "ok",
    );
  });

  it("releases reservations left by runs that never finished", async () => {
    addUser("u", 500_000);
    await hold(db, settings, { id: "r1", userId: "u", kind: "fix", amount: 100_000 });
    sqlite.prepare("UPDATE runs SET created_at = 0").run();
    expect(await releaseStale(db)).toBe(1);
    expect(wallet("u")).toEqual({ balance: 500_000, held: 0 });
  });

  it("keeps the ledger equal to the balance", async () => {
    addUser("u");
    await grantTrial(db, settings, {
      userId: "u",
      deviceHash: "d",
      networkHash: "n",
      githubCreatedAt: OLD_ACCOUNT,
    });
    for (let i = 0; i < 5; i++) {
      await hold(db, settings, { id: `r${i}`, userId: "u", kind: "fix", amount: 100_000 });
      await settle(db, `r${i}`, 37_000 + i);
    }
    expect(ledgerSum("u")).toBe(wallet("u").balance);
  });
});

describe("free trial", () => {
  const claim = (
    userId: string,
    deviceHash = "d1",
    networkHash = "n1",
    githubCreatedAt = OLD_ACCOUNT,
  ) => grantTrial(db, settings, { userId, deviceHash, networkHash, githubCreatedAt });

  it("grants 50 credits once per account", async () => {
    addUser("u");
    expect(await claim("u")).toBe("granted");
    expect(await claim("u")).toBe("already_claimed");
    expect(wallet("u").balance).toBe(500_000);
  });

  it("allows two trials per computer, ever", async () => {
    for (const id of ["a", "b", "c"]) addUser(id);
    expect(await claim("a", "pc", "n1")).toBe("granted");
    expect(await claim("b", "pc", "n2")).toBe("granted");
    expect(await claim("c", "pc", "n3")).toBe("device_limit");
    expect(wallet("c").balance).toBe(0);
  });

  it("allows two trials per network a day", async () => {
    for (const id of ["a", "b", "c"]) addUser(id);
    expect(await claim("a", "pc1", "home")).toBe("granted");
    expect(await claim("b", "pc2", "home")).toBe("granted");
    expect(await claim("c", "pc3", "home")).toBe("network_limit");
    sqlite.prepare("UPDATE trial_claims SET day = '2000-01-01'").run();
    expect(await claim("c", "pc3", "home")).toBe("granted");
  });

  it("skips brand-new GitHub accounts", async () => {
    addUser("u");
    expect(await claim("u", "d", "n", Date.now() - 86_400_000)).toBe("account_too_new");
    expect(wallet("u").balance).toBe(0);
  });

  it("counts an account as trial-only until it has a paid grant", async () => {
    addUser("u");
    expect(await trialOnly(db, "u")).toBe(true);
    await claim("u");
    expect(await trialOnly(db, "u")).toBe(true);
    sqlite
      .prepare(
        "INSERT INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at) VALUES ('p', 'u', 'grant', 100, 'purchase', 'k', 0)",
      )
      .run();
    expect(await trialOnly(db, "u")).toBe(false);
  });
});

describe("trial on the first Cloud call", () => {
  function addAccount(id: string, githubCreatedAt = OLD_ACCOUNT) {
    addUser(id);
    sqlite.prepare("UPDATE users SET github_created_at = ? WHERE id = ?").run(githubCreatedAt, id);
  }
  const start = (userId: string, deviceHash = "pc", networkHash = "home") =>
    activateTrial(db, settings, { userId, deviceHash, networkHash });

  it("waits until the first call, then grants once", async () => {
    addAccount("u");
    expect(await trialState(db, "u")).toBe("available");
    expect(wallet("u").balance).toBe(0);
    expect(await start("u")).toBe("granted");
    expect(await trialState(db, "u")).toBe("granted");
    expect(await start("u")).toBe("already_claimed");
    expect(wallet("u").balance).toBe(500_000);
  });

  it("grants only once when two first calls race", async () => {
    addAccount("u");
    const outcomes = await Promise.all([start("u"), start("u")]);
    expect(outcomes.filter((outcome) => outcome === "granted")).toHaveLength(1);
    expect(wallet("u").balance).toBe(500_000);
  });

  it("remembers a final refusal instead of re-checking", async () => {
    addAccount("new", Date.now() - 86_400_000);
    expect(await start("new")).toBe("account_too_new");
    sqlite.prepare("UPDATE users SET github_created_at = ? WHERE id = 'new'").run(OLD_ACCOUNT);
    expect(await start("new")).toBe("account_too_new");
    expect(await trialState(db, "new")).toBe("account_too_new");
  });

  it("retries a network refusal on a later day", async () => {
    for (const id of ["a", "b", "c"]) addAccount(id);
    await start("a", "pc1");
    await start("b", "pc2");
    expect(await start("c", "pc3")).toBe("network_limit");
    expect(await trialState(db, "c")).toBe("network_limit");
    sqlite.prepare("UPDATE trial_claims SET day = '2000-01-01'").run();
    sqlite.prepare("UPDATE users SET trial_checked_day = '2000-01-01' WHERE id = 'c'").run();
    expect(await trialState(db, "c")).toBe("available");
    expect(await start("c", "pc3")).toBe("granted");
  });

  it("counts the device bound at sign-in across accounts", async () => {
    for (const id of ["a", "b", "c"]) addAccount(id);
    expect(await start("a", "pc", "n1")).toBe("granted");
    expect(await start("b", "pc", "n2")).toBe("granted");
    expect(await start("c", "pc", "n3")).toBe("device_limit");
  });
});
