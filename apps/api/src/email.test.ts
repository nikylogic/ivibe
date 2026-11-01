// SPDX-License-Identifier: AGPL-3.0-only

import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueEmail, sendQueuedEmails } from "./email.ts";
import type { Env } from "./env.ts";
import { testDb } from "./test-db.test-helper.ts";

let sqlite: DatabaseSync;
let db: D1Database;
let env: Env;
let bodies: { to: string[]; subject: string; html: string; text: string }[];
let headers: Headers[];
let respond: () => Response;

const addUser = (id: string, email: string | null, login = "octo") =>
  sqlite
    .prepare(
      "INSERT INTO users (id, github_id, github_login, email, name, created_at) VALUES (?, ?, ?, ?, 'O', 1)",
    )
    .run(id, id, login, email);

const statusOf = (id: string) =>
  (sqlite.prepare("SELECT status FROM email_outbox WHERE id = ?").get(id) as { status: string })
    .status;

beforeEach(() => {
  ({ sqlite, db } = testDb());
  env = { DB: db, SITE_URL: "https://site.test", RESEND_API_KEY: "key" } as unknown as Env;
  bodies = [];
  headers = [];
  respond = () => new Response("{}");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      headers.push(new Headers(init.headers));
      return respond();
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("sending queued email", () => {
  it("sends once, with an HTML and a plain-text version", async () => {
    addUser("u1", "o@example.com");
    await queueEmail(db, "u1", "welcome").run();
    expect(await sendQueuedEmails(env)).toBe(1);
    expect(bodies[0]?.to).toEqual(["o@example.com"]);
    expect(bodies[0]?.subject).toBe("Welcome to iVibe");
    expect(bodies[0]?.html).toContain("https://site.test/download");
    expect(bodies[0]?.text).toContain("Download iVibe: https://site.test/download");
    expect(headers[0]?.get("idempotency-key")).toBe("welcome:u1");
    expect(statusOf("welcome:u1")).toBe("sent");
    expect(await sendQueuedEmails(env)).toBe(0);
    expect(bodies).toHaveLength(1);
  });

  it("can only ever queue each email once per person", async () => {
    addUser("u1", "o@example.com");
    await queueEmail(db, "u1", "pro").run();
    await queueEmail(db, "u1", "pro").run();
    await sendQueuedEmails(env);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.subject).toBe("You're on iVibe Pro");
  });

  it("skips an account with no address", async () => {
    addUser("u1", null);
    await queueEmail(db, "u1", "welcome").run();
    expect(await sendQueuedEmails(env)).toBe(0);
    expect(bodies).toHaveLength(0);
    expect(statusOf("welcome:u1")).toBe("skipped");
  });

  it("escapes what comes from GitHub", async () => {
    addUser("u1", "o@example.com", "<b>x</b>");
    await queueEmail(db, "u1", "welcome").run();
    await sendQueuedEmails(env);
    expect(bodies[0]?.html).not.toContain("<b>x</b>");
    expect(bodies[0]?.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("does nothing without a key, and keeps the email for later", async () => {
    addUser("u1", "o@example.com");
    await queueEmail(db, "u1", "welcome").run();
    env.RESEND_API_KEY = undefined;
    expect(await sendQueuedEmails(env)).toBe(0);
    expect(statusOf("welcome:u1")).toBe("queued");
  });

  it("stops at the daily limit and sends the rest later", async () => {
    addUser("u1", "o@example.com");
    addUser("u2", "p@example.com");
    const insert = sqlite.prepare(
      "INSERT INTO email_outbox (id, user_id, kind, status, created_at, sent_at) VALUES (?, 'u1', 'pro', 'sent', 1, ?)",
    );
    for (let index = 0; index < 90; index++) insert.run(`old:${index}`, Date.now());
    await queueEmail(db, "u2", "welcome").run();
    expect(await sendQueuedEmails(env)).toBe(0);
    expect(statusOf("welcome:u2")).toBe("queued");
    sqlite.prepare("UPDATE email_outbox SET sent_at = 1 WHERE id LIKE 'old:%'").run();
    expect(await sendQueuedEmails(env)).toBe(1);
  });

  it("retries a failure, then gives up", async () => {
    addUser("u1", "o@example.com");
    await queueEmail(db, "u1", "welcome").run();
    respond = () => new Response("no", { status: 500 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await sendQueuedEmails(env);
    expect(statusOf("welcome:u1")).toBe("queued");
    sqlite.prepare("UPDATE email_outbox SET attempts = 23").run();
    await sendQueuedEmails(env);
    expect(statusOf("welcome:u1")).toBe("failed");
  });

  it("leaves everything queued when rate limited, without using up a try", async () => {
    addUser("u1", "o@example.com");
    await queueEmail(db, "u1", "welcome").run();
    respond = () => new Response("slow down", { status: 429 });
    await sendQueuedEmails(env);
    const row = sqlite.prepare("SELECT status, attempts FROM email_outbox").get();
    expect(row).toEqual({ status: "queued", attempts: 0 });
  });
});
