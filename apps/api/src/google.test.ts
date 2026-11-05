// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeToken,
  githubCallback,
  githubStart,
  googleCallback,
  googleStart,
  me,
  requireSession,
} from "./auth.ts";
import type { AppEnv, Env } from "./env.ts";
import { testDb } from "./test-db.test-helper.ts";
import { pkceChallenge } from "./util.ts";
import { buyRoute } from "./web.ts";

const AUTH = "https://auth.test";
const VERIFIER = "v".repeat(43);
const DEVICE = "a".repeat(64);

let sqlite: DatabaseSync;
let env: Env;
let google: { sub: string; email: string; email_verified: boolean; name?: string };
let github: { id: number; emails: { email: string; primary: boolean; verified: boolean }[] };

const app = new Hono<AppEnv>();
app.get("/buy", buyRoute);
app.get("/github", githubStart);
app.get("/github/callback", githubCallback);
app.get("/google", googleStart);
app.get("/google/callback", googleCallback);
app.post("/token", exchangeToken);
app.get("/me", requireSession, me);

const request = (path: string, init: RequestInit = {}) =>
  app.request(`http://localhost${path}`, init, env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);

/** The whole desktop path: start, provider, deep link, token. Returns the account the app sees. */
async function signIn(provider: "github" | "google") {
  const start = await request(`/${provider}?challenge=${await pkceChallenge(VERIFIER)}`);
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const back = await request(`/${provider}/callback?state=${state}&code=c`);
  const landed = new URL(back.headers.get("location")!);
  if (landed.pathname !== "/account/signed-in") return { landed };
  const code = new URLSearchParams(landed.hash.slice(1)).get("code")!;
  const token = await request("/token", {
    method: "POST",
    body: JSON.stringify({ code, verifier: VERIFIER, device: DEVICE }),
  });
  expect(token.status).toBe(200);
  const account = (await token.json()) as { token: string; user: { login: string; name: string } };
  return { account };
}

const users = () =>
  sqlite.prepare("SELECT id, github_id, google_id, email FROM users").all() as {
    id: string;
    github_id: string | null;
    google_id: string | null;
    email: string;
  }[];

beforeEach(() => {
  let db: D1Database;
  ({ sqlite, db } = testDb());
  env = {
    DB: db,
    API_URL: "https://api.test",
    AUTH_URL: AUTH,
    SITE_URL: "https://site.test",
    APP_SCHEME: "tech.ivibe.app",
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    DODO_API_URL: "https://dodo.test",
  } as unknown as Env;
  google = { sub: "g1", email: "person@example.com", email_verified: true, name: "A Person" };
  github = {
    id: 7,
    emails: [{ email: "person@example.com", primary: true, verified: true }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      const json = (value: unknown) => new Response(JSON.stringify(value));
      if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "t" });
      if (url.includes("openidconnect.googleapis.com")) return json(google);
      if (url.includes("login/oauth/access_token")) return json({ access_token: "t" });
      if (url.endsWith("/user/emails")) return json(github.emails);
      if (url.endsWith("/user")) {
        return json({
          id: github.id,
          login: "octo",
          name: "Octo",
          email: null,
          created_at: "2020-01-01T00:00:00Z",
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Google sign-in", () => {
  it("creates an account with a wallet and shows the address as the login", async () => {
    const { account } = await signIn("google");
    expect(account!.user.login).toBe("person@example.com");
    expect(account!.user.name).toBe("A Person");
    const [user] = users();
    expect(user).toMatchObject({ google_id: "g1", github_id: null });
    expect(sqlite.prepare("SELECT 1 FROM wallets WHERE user_id = ?").get(user!.id)).toBeTruthy();
  });

  it("returns to the same account on the next sign-in", async () => {
    await signIn("google");
    await signIn("google");
    expect(users()).toHaveLength(1);
  });

  it("refuses an address Google hasn't verified", async () => {
    google.email_verified = false;
    const result = await signIn("google");
    expect(result.landed?.href).toBe("https://site.test/account/sign-in-failed#provider=Google");
    expect(users()).toHaveLength(0);
  });

  it("says so when it isn't configured", async () => {
    env.GOOGLE_CLIENT_ID = undefined;
    const response = await request(`/google?challenge=${await pkceChallenge(VERIFIER)}`);
    expect(response.headers.get("location")).toBe("https://site.test/account/google-unavailable");
  });

  it("keeps the login code and address off every server, after the #", async () => {
    google.email = "<b>@example.com";
    const start = await request(`/google?challenge=${await pkceChallenge(VERIFIER)}`);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const back = await request(`/google/callback?state=${state}&code=c`);
    const landed = new URL(back.headers.get("location")!);
    expect(landed.origin + landed.pathname).toBe("https://site.test/account/signed-in");
    expect(landed.search).toBe("");
    const fragment = new URLSearchParams(landed.hash.slice(1));
    expect(fragment.get("code")).toBeTruthy();
    expect(fragment.get("name")).toBe("<b>@example.com");
  });
});

describe("one person, one account", () => {
  it("links Google to the GitHub account with the same verified address", async () => {
    await signIn("github");
    const { account } = await signIn("google");
    expect(users()).toHaveLength(1);
    expect(users()[0]).toMatchObject({ github_id: "7", google_id: "g1" });
    expect(account!.user.login).toBe("octo");
  });

  it("links GitHub to the Google account with the same verified address", async () => {
    await signIn("google");
    await signIn("github");
    expect(users()).toHaveLength(1);
    expect(users()[0]).toMatchObject({ github_id: "7", google_id: "g1" });
  });

  it("matches addresses whatever their case", async () => {
    await signIn("github");
    google.email = "Person@Example.com";
    await signIn("google");
    expect(users()).toHaveLength(1);
  });

  it("doesn't link GitHub through an address GitHub hasn't verified", async () => {
    await signIn("google");
    github.emails = [{ email: "person@example.com", primary: true, verified: false }];
    await signIn("github");
    expect(users()).toHaveLength(2);
  });

  it("doesn't move a Google account onto one already linked to another", async () => {
    await signIn("google");
    google = { ...google, sub: "g2" };
    await signIn("google");
    expect(users()).toHaveLength(2);
  });
});

describe("the Buy link", () => {
  it("offers both when Google is set up", async () => {
    const response = await request("/buy");
    expect(response.headers.get("location")).toBe("https://site.test/account/sign-in");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("goes to the chosen provider and ties the sign-in to this browser", async () => {
    const response = await request("/buy?with=google");
    expect(response.headers.get("location")).toContain("accounts.google.com");
    expect(response.headers.get("set-cookie")).toContain("__Host-ivibe_state");
  });

  it("goes straight to GitHub while Google isn't set up", async () => {
    env.GOOGLE_CLIENT_ID = undefined;
    const response = await request("/buy?with=google");
    expect(response.headers.get("location")).toContain("github.com/login/oauth/authorize");
  });
});
