// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubCallback, requireSession } from "./auth.ts";
import { returnPage } from "./billing.ts";
import type { AppEnv, Env } from "./env.ts";
import { testDb } from "./test-db.test-helper.ts";
import { buyRoute, WEB_COOKIE, webMeRoute, webSignOutRoute } from "./web.ts";

const SITE = "https://site.test";
const AUTH = "https://auth.test";

let sqlite: DatabaseSync;
let env: Env;
let dodoBodies: { path: string; body: { return_url?: string; metadata?: object } | null }[];

const app = new Hono<AppEnv>();
app.use("/web/*", (c, next) => cors({ origin: c.env.SITE_URL, credentials: true })(c, next));
app.get("/buy", buyRoute);
app.get("/github/callback", githubCallback);
app.get("/web/me", webMeRoute);
app.post("/web/sign-out", webSignOutRoute);
app.get("/return", returnPage);
app.get("/needs-session", requireSession, (c) => c.text("ran"));

const request = (path: string, init: RequestInit = {}) =>
  app.request(`http://localhost${path}`, init, env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);

/** Signs in through the real GitHub path and returns the cookie the browser would hold. */
async function signIn(): Promise<string> {
  const start = await request("/buy");
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const back = await request(`/github/callback?state=${state}&code=gh`, {
    headers: { cookie: start.headers.get("set-cookie")!.split(";")[0]! },
  });
  expect(back.status).toBe(302);
  expect(back.headers.get("location")).toBe(`${AUTH}/buy`);
  const set = back.headers.getSetCookie().find((line) => line.startsWith(`${WEB_COOKIE}=`))!;
  expect(set).toContain("HttpOnly");
  expect(set).toContain("Secure");
  return set.split(";")[0]!;
}

const subscribe = (status: string) =>
  sqlite
    .prepare(
      `INSERT INTO subscriptions (id, user_id, customer_id, product_id, status, event_at, created_at)
       SELECT 'sub', id, 'cus_1', 'pdt_pro', ?, 1, 1 FROM users LIMIT 1`,
    )
    .run(status);

beforeEach(() => {
  let db: D1Database;
  ({ sqlite, db } = testDb());
  sqlite
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("plan_product_id", "pdt_pro");
  env = {
    DB: db,
    API_URL: "https://api.test",
    AUTH_URL: AUTH,
    SITE_URL: SITE,
    APP_SCHEME: "tech.ivibe.app",
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
    DODO_API_URL: "https://dodo.test",
    DODO_API_KEY: "key",
  } as unknown as Env;
  dodoBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (value: object) => new Response(JSON.stringify(value));
      if (url.includes("login/oauth/access_token")) return json({ access_token: "t" });
      if (url.includes("api.github.com/user")) {
        return json({
          id: 7,
          login: "octo",
          name: "Octo",
          email: "o@example.com",
          created_at: "2020-01-01T00:00:00Z",
        });
      }
      const path = url.replace("https://dodo.test", "");
      dodoBodies.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === "/checkouts") return json({ checkout_url: "https://dodo.test/pay" });
      return json({ link: "https://dodo.test/portal" });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("the Buy link", () => {
  it("sends someone signed out to GitHub", async () => {
    const response = await request("/buy");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("github.com/login/oauth/authorize");
  });

  it("carries on to checkout after GitHub, tied to the account", async () => {
    const cookie = await signIn();
    const response = await request("/buy", { headers: { cookie } });
    expect(response.headers.get("location")).toBe("https://dodo.test/pay");
    const { id } = sqlite.prepare("SELECT id FROM users").get() as { id: string };
    const checkout = dodoBodies.find((call) => call.path === "/checkouts")!;
    expect(checkout.body?.metadata).toEqual({ user_id: id });
    expect(checkout.body?.return_url).toBe("https://api.test/v1/billing/return?from=web");
  });

  it("sends someone already on Pro to the portal, not a second checkout", async () => {
    const cookie = await signIn();
    subscribe("active");
    const response = await request("/buy", { headers: { cookie } });
    expect(response.headers.get("location")).toBe("https://dodo.test/portal");
    expect(dodoBodies.some((call) => call.path === "/checkouts")).toBe(false);
  });

  it("ignores an expired cookie", async () => {
    const cookie = await signIn();
    sqlite.prepare("UPDATE web_sessions SET expires_at = 1").run();
    const response = await request("/buy", { headers: { cookie } });
    expect(response.headers.get("location")).toContain("github.com");
  });

  it("explains itself when Dodo is down, and charges nothing", async () => {
    const cookie = await signIn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    const response = await request("/buy", { headers: { cookie } });
    expect(response.headers.get("location")).toBe(`${SITE}/account/checkout-failed`);
  });

  it("refuses a sign-in link that started in someone else's browser", async () => {
    const start = await request("/buy");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const back = await request(`/github/callback?state=${state}&code=attacker`);
    expect(back.headers.get("location")).toBe(`${SITE}/?buy=cancelled#pricing`);
    expect(back.headers.get("set-cookie")).toBeNull();
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM web_sessions").get()).toEqual({ n: 0 });
  });

  it("returns to pricing when GitHub sign-in is declined", async () => {
    const start = await request("/buy");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const back = await request(`/github/callback?state=${state}&error=access_denied`);
    expect(back.headers.get("location")).toBe(`${SITE}/?buy=cancelled#pricing`);
  });
});

describe("the web session", () => {
  it("can't run anything: the app's session check refuses it", async () => {
    const cookie = await signIn();
    const token = cookie.split("=")[1]!;
    const response = await request("/needs-session", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it("says who's signed in and whether they're on Pro, to our site only", async () => {
    expect(await (await request("/web/me")).json()).toEqual({ signedIn: false });
    const cookie = await signIn();
    const signedIn = await request("/web/me", { headers: { cookie, origin: SITE } });
    expect(await signedIn.json()).toEqual({ signedIn: true, login: "octo", pro: false });
    expect(signedIn.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(signedIn.headers.get("access-control-allow-credentials")).toBe("true");
    subscribe("active");
    const pro = await request("/web/me", { headers: { cookie } });
    expect(await pro.json()).toMatchObject({ pro: true });
  });

  it("signs out only from our site", async () => {
    const cookie = await signIn();
    const stranger = await request("/web/sign-out", {
      method: "POST",
      headers: { cookie, origin: "https://evil.test" },
    });
    expect(stranger.status).toBe(403);
    const ours = await request("/web/sign-out", {
      method: "POST",
      headers: { cookie, origin: SITE },
    });
    expect(ours.status).toBe(200);
    expect(await (await request("/web/me", { headers: { cookie } })).json()).toEqual({
      signedIn: false,
    });
  });
});

describe("coming back from Dodo", () => {
  it("sends website buyers to the welcome page, or back to pricing on failure", async () => {
    const paid = await request("/return?from=web&status=active");
    expect(paid.headers.get("location")).toBe(`${SITE}/welcome`);
    const failed = await request("/return?from=web&status=failed");
    expect(failed.headers.get("location")).toBe(`${SITE}/?buy=failed#pricing`);
    const portal = await request("/return?from=web-portal");
    expect(portal.headers.get("location")).toBe(`${SITE}/#pricing`);
  });

  it("still sends the app's buyers back to the app", async () => {
    const paid = await request("/return?status=active");
    expect(paid.headers.get("location")).toBe(`${SITE}/account/pro#open=1`);
    const declined = await request("/return?status=failed");
    expect(declined.headers.get("location")).toBe(`${SITE}/account/payment-failed`);
    const portal = await request("/return?from=portal");
    expect(portal.headers.get("location")).toBe(`${SITE}/account/all-set#open=1`);
  });
});
