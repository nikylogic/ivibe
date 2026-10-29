// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Settings } from "./settings.ts";

/**
 * The ledger against the real schema on SQLite, which is what D1 runs. A small adapter gives
 * node:sqlite D1's API, with batch() as one transaction like D1's.
 */

type Row = Record<string, unknown>;

class Statement {
  constructor(
    readonly db: DatabaseSync,
    readonly sql: string,
    readonly args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.db, this.sql, args);
  }
  #params() {
    return this.args as (string | number | null)[];
  }
  async first<T = Row>() {
    return (this.db.prepare(this.sql).get(...this.#params()) ?? null) as T | null;
  }
  async all<T = Row>() {
    return { results: this.db.prepare(this.sql).all(...this.#params()) as T[] };
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.#params());
    return { meta: { changes: Number(result.changes) } };
  }
}

export class FakeD1 {
  constructor(readonly db: DatabaseSync) {}
  prepare(sql: string) {
    return new Statement(this.db, sql);
  }
  async batch(statements: Statement[]) {
    this.db.exec("BEGIN");
    try {
      const results = statements.map((statement) => ({
        results: statement.db
          .prepare(statement.sql)
          .all(...(statement.args as (string | number | null)[])),
      }));
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** A fresh in-memory database with every migration applied, in order. */
export function testDb(): { sqlite: DatabaseSync; db: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = join(import.meta.dirname, "../migrations");
  for (const file of readdirSync(migrations).sort()) {
    sqlite.exec(readFileSync(join(migrations, file), "utf8"));
  }
  return { sqlite, db: new FakeD1(sqlite) as unknown as D1Database };
}

export const testSettings: Settings = {
  cloudEnabled: true,
  trialAmount: 500_000,
  trialPerDevice: 2,
  trialPerNetworkPerDay: 2,
  trialMinGithubAgeDays: 14,
  dailyCap: 1_000_000,
  price: {
    sparkInput: 1.25,
    sparkCached: 0.15,
    sparkOutput: 4.25,
    trialInput: 0.1,
    trialOutput: 0.2,
    samImage: 2500,
    asrSecond: 50,
  },
  hold: { fix: 100_000, write: 15_000 },
  plan: { productId: "pdt_pro", amount: 4_000_000, priceLabel: "$8/month" },
};
