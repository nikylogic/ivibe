// SPDX-License-Identifier: AGPL-3.0-only

import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, Env } from "./env.ts";
import { closeRecordingRoute, openRecordingRoute, transcribeRoute } from "./runs.ts";
import { testDb } from "./test-db.test-helper.ts";

/** Recordings end to end: the routes, the real schema and a stand-in for Meta. */

let sqlite: DatabaseSync;
let env: Env;
let background: Promise<unknown>[];
let user = "u";
let metaStatus = 200;

const hono = new Hono<AppEnv>();
hono.use(async (c, next) => {
  c.set("session", { userId: user, deviceHash: "d" });
  await next();
});
hono.post("/v1/transcribe", transcribeRoute);
hono.post("/v1/recordings", openRecordingRoute);
hono.post("/v1/recordings/:id/close", closeRecordingRoute);

const ctx = {
  waitUntil: (promise: Promise<unknown>) => void background.push(promise),
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

const call = (path: string, init: RequestInit = {}) =>
  hono.fetch(new Request(`https://api.test${path}`, { method: "POST", ...init }), env, ctx);

/** A silent 16 kHz mono WAV of `seconds`. */
function wav(seconds: number): Uint8Array {
  const samples = 16_000 * seconds;
  const out = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => out.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, 16_000, true);
  out.setUint32(28, 32_000, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, "data");
  out.setUint32(40, samples * 2, true);
  return new Uint8Array(out.buffer);
}

const caption = (seconds: number, recording?: string) =>
  call(`/v1/transcribe?languages=${recording ? `&recording=${recording}` : ""}`, {
    body: wav(seconds),
    headers: { "content-type": "audio/wav" },
  });

const open = async (mode = "dictate") => {
  const response = await call("/v1/recordings", {
    body: JSON.stringify({ mode }),
    headers: { "content-type": "application/json" },
  });
  return { status: response.status, body: (await response.json()) as { id?: string } };
};

function addUser(id: string, balance: number) {
  sqlite.prepare("INSERT INTO users (id, created_at) VALUES (?, 0)").run(id);
  sqlite
    .prepare("INSERT INTO wallets (user_id, balance, held, updated_at) VALUES (?, ?, 0, 0)")
    .run(id, balance);
  // A paid account: no free trial or daily pool in the way.
  sqlite
    .prepare(
      "INSERT INTO ledger (id, user_id, kind, amount, ref, idempotency_key, created_at) VALUES (?, ?, 'grant', ?, 'subscription', ?, 0)",
    )
    .run(`g-${id}`, id, balance, `g-${id}`);
}

const wallet = (id: string) =>
  sqlite.prepare("SELECT balance, held FROM wallets WHERE user_id = ?").get(id) as {
    balance: number;
    held: number;
  };

beforeEach(() => {
  const test = testDb();
  sqlite = test.sqlite;
  env = { DB: test.db, META_API_KEY: "k" } as Env;
  background = [];
  user = "u";
  metaStatus = 200;
  addUser("u", 1_000_000);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      metaStatus === 200
        ? Response.json({ transcript: "hello" })
        : Response.json({ error: { type: "server_error" } }, { status: metaStatus }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("recordings", () => {
  it("reserves once, draws each caption, and charges only what was used", async () => {
    const { status, body } = await open();
    expect(status).toBe(200);
    // Dictate: (300 s × 2 + 30 s) × 50 µ$.
    expect(wallet("u").held).toBe(31_500);

    expect((await caption(3, body.id)).status).toBe(200);
    expect((await caption(2, body.id)).status).toBe(200);
    // No reservation or settle of their own.
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM runs").get()).toEqual({ n: 1 });

    const closed = await call(`/v1/recordings/${body.id}/close`);
    expect(((await closed.json()) as { cost: number }).cost).toBe(250);
    expect(wallet("u")).toEqual({ balance: 999_750, held: 0 });
  });

  it("doesn't charge a caption Meta failed", async () => {
    const { body } = await open();
    await caption(3, body.id);
    metaStatus = 500;
    expect((await caption(4, body.id)).status).toBe(502);
    await call(`/v1/recordings/${body.id}/close`);
    expect(wallet("u").balance).toBe(1_000_000 - 150);
  });

  it("charges captions past a closed recording on their own reservation", async () => {
    const { body } = await open();
    await call(`/v1/recordings/${body.id}/close`);
    expect((await caption(2, body.id)).status).toBe(200);
    await Promise.all(background);
    expect(wallet("u")).toEqual({ balance: 999_900, held: 0 });
  });

  it("won't let another account draw on or close a recording", async () => {
    const { body } = await open();
    addUser("v", 1_000_000);
    user = "v";
    expect((await caption(2, body.id)).status).toBe(200);
    await Promise.all(background);
    // Charged to v's own wallet, not drawn from u's recording.
    expect(wallet("v").balance).toBe(999_900);
    expect((await call(`/v1/recordings/${body.id}/close`)).status).toBe(404);
    user = "u";
    await call(`/v1/recordings/${body.id}/close`);
    expect(wallet("u")).toEqual({ balance: 1_000_000, held: 0 });
  });

  it("reserves what a low balance has, and refuses an empty one before recording", async () => {
    addUser("low", 5_000);
    user = "low";
    expect((await open()).status).toBe(200);
    expect(wallet("low").held).toBe(5_000);

    addUser("empty", 0);
    // Its free trial is long gone, so there's nothing left to start.
    sqlite.prepare("UPDATE users SET trial_status = 'granted' WHERE id = 'empty'").run();
    user = "empty";
    const refused = await open();
    expect(refused.status).toBe(402);
    expect(wallet("empty")).toEqual({ balance: 0, held: 0 });
  });

  it("records what a caption used on its run", async () => {
    // What settleStale charges if the background settle never runs (wallet.test.ts).
    const response = await caption(2);
    expect(sqlite.prepare("SELECT used FROM runs").get()).toEqual({ used: 100 });
    expect(response.status).toBe(200);
  });

  it("rejects a mode it doesn't know", async () => {
    expect((await open("everything")).status).toBe(400);
  });
});
