// SPDX-License-Identifier: AGPL-3.0-only

import type { Context, MiddlewareHandler } from "hono";
import { planOf, planOffer, tierOf } from "./billing.ts";
import type { AppEnv, Env } from "./env.ts";
import { apiError } from "./runs.ts";
import { loadSettings } from "./settings.ts";
import { now, pkceChallenge, randomToken, sha256, toCredits } from "./util.ts";
import { balanceOf, trialOnly, trialState } from "./wallet.ts";

/**
 * Desktop sign-in with GitHub (docs/architecture.md §6.2), PKCE-protected:
 *
 * 1. The app opens auth.ivibe.tech/github?challenge=… in the system browser.
 * 2. GitHub sends the user back to /github/callback; we create the account and hand the app a
 *    one-time code through the tech.ivibe.app:// link.
 * 3. The app posts the code, its PKCE verifier and its device hash to /token and gets a
 *    session token, which it keeps in the OS keychain. The device is bound to the session here.
 *
 * Signing in grants nothing: the free trial starts on the first Cloud call (runs.ts, D24).
 */

type Ctx = Context<AppEnv>;

const STATE_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 90 * 86_400_000;

const isChallenge = (value: string | undefined): value is string =>
  !!value && /^[A-Za-z0-9_-]{43}$/.test(value);

export async function githubStart(c: Ctx): Promise<Response> {
  const challenge = c.req.query("challenge");
  if (!isChallenge(challenge)) return c.text("Open this page from the iVibe app.", 400);
  const state = randomToken();
  await c.env.DB.prepare("INSERT INTO oauth_states (state, challenge, created_at) VALUES (?, ?, ?)")
    .bind(state, challenge, now())
    .run();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${c.env.AUTH_URL}/github/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  created_at: string;
}

async function githubUser(c: Ctx, code: string): Promise<GitHubUser | null> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${c.env.AUTH_URL}/github/callback`,
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "iVibe",
    },
  });
  return userResponse.ok ? ((await userResponse.json()) as GitHubUser) : null;
}

/** Finds or creates the account (with an empty wallet) for a GitHub user. */
async function upsertUser(db: D1Database, user: GitHubUser): Promise<string> {
  const existing = await db
    .prepare("SELECT id FROM users WHERE github_id = ?")
    .bind(String(user.id))
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare(
        "UPDATE users SET github_login = ?, name = ?, email = COALESCE(?, email) WHERE id = ?",
      )
      .bind(user.login, user.name, user.email, existing.id)
      .run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  const at = now();
  const githubCreatedAt = Date.parse(user.created_at);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, email, name, github_created_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        String(user.id),
        user.login,
        user.email,
        user.name,
        Number.isNaN(githubCreatedAt) ? null : githubCreatedAt,
        at,
      ),
    db
      .prepare("INSERT INTO wallets (user_id, balance, held, updated_at) VALUES (?, 0, 0, ?)")
      .bind(id, at),
  ]);
  return id;
}

export const page = (title: string, body: string, appLink?: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · iVibe</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b1a;color:#e8e6f5;font:16px/1.5 system-ui,sans-serif;text-align:center}
main{max-width:420px;padding:24px}h1{font-size:24px;margin:0 0 8px}a{display:inline-block;margin-top:20px;padding:10px 22px;border-radius:999px;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600}</style>
</head><body><main><h1>${title}</h1><p>${body}</p>${appLink ? `<a href="${appLink}">Open iVibe</a><script>location.href=${JSON.stringify(appLink)}</script>` : ""}</main></body></html>`;

export async function githubCallback(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const state = c.req.query("state") ?? "";
  const code = c.req.query("code");
  const saved = await db
    .prepare("DELETE FROM oauth_states WHERE state = ? RETURNING challenge, created_at")
    .bind(state)
    .first<{ challenge: string; created_at: number }>();
  if (!saved || !code || now() - saved.created_at > STATE_TTL_MS) {
    return c.html(page("Sign-in expired", "Start again from the iVibe app."), 400);
  }
  const user = await githubUser(c, code);
  if (!user)
    return c.html(
      page("Sign-in failed", "GitHub didn't confirm the sign-in. Try again from the iVibe app."),
      400,
    );

  const userId = await upsertUser(db, user);
  const loginCode = randomToken();
  await db
    .prepare(
      "INSERT INTO login_codes (code_hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await sha256(loginCode), userId, saved.challenge, now() + CODE_TTL_MS)
    .run();
  const appLink = `${c.env.APP_SCHEME}://auth?code=${encodeURIComponent(loginCode)}`;
  return c.html(page(`Signed in as ${user.login}`, "You can go back to iVibe now.", appLink));
}

/** POST auth.ivibe.tech/token { code, verifier, device } → a session token. */
export async function exchangeToken(c: Ctx): Promise<Response> {
  const db = c.env.DB;
  const body = await c.req
    .json<{ code?: unknown; verifier?: unknown; device?: unknown }>()
    .catch(() => ({}));
  const { code, verifier, device } = body as {
    code?: unknown;
    verifier?: unknown;
    device?: unknown;
  };
  if (
    typeof code !== "string" ||
    typeof verifier !== "string" ||
    typeof device !== "string" ||
    !/^[a-f0-9]{64}$/.test(device)
  ) {
    return apiError(c, 400, "bad_request", "code, verifier and device are required");
  }
  const saved = await db
    .prepare("DELETE FROM login_codes WHERE code_hash = ? RETURNING user_id, challenge, expires_at")
    .bind(await sha256(code))
    .first<{ user_id: string; challenge: string; expires_at: number }>();
  if (!saved || saved.expires_at < now() || (await pkceChallenge(verifier)) !== saved.challenge) {
    return apiError(c, 401, "invalid_code", "That sign-in link has expired. Sign in again.");
  }

  const deviceHash = await sha256(`device:${c.env.HASH_SALT}:${device}`);

  const token = randomToken("ivs_");
  const at = now();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, device_hash, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(await sha256(token), saved.user_id, deviceHash, at, at, at + SESSION_TTL_MS)
    .run();

  return c.json({ token, ...(await account(c.env, saved.user_id)) });
}

/** The account as the app shows it: who, credits left, and where the free trial stands. */
async function account(env: Env, userId: string) {
  const db = env.DB;
  const user = await db
    .prepare("SELECT github_login, name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ github_login: string; name: string | null }>();
  const [settings, available, trial, plan, trialOnlyAccount] = await Promise.all([
    loadSettings(db),
    balanceOf(db, userId),
    trialState(db, userId),
    planOf(db, userId),
    trialOnly(db, userId),
  ]);
  return {
    user: { login: user?.github_login, name: user?.name },
    credits: toCredits(available),
    // available (starts on the first recording) | granted | device_limit | network_limit | account_too_new
    trial,
    trialCredits: toCredits(settings.trialAmount),
    // iVibe Pro (D26): the latest subscription, and what checkout would sell.
    plan,
    planOffer: planOffer(env, settings),
    // The sidebar badge: pro | trial | free.
    tier: tierOf(plan, !trialOnlyAccount, trial, available),
  };
}

/** Bearer session for /v1/*. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token.startsWith("ivs_"))
    return apiError(c, 401, "unauthorized", "Sign in to use iVibe Cloud.");
  const tokenHash = await sha256(token);
  const session = await c.env.DB.prepare(
    "SELECT user_id, device_hash, last_used_at, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ user_id: string; device_hash: string; last_used_at: number; expires_at: number }>();
  if (!session || session.expires_at < now()) {
    return apiError(c, 401, "unauthorized", "Your sign-in expired. Sign in again.");
  }
  // Touch at most once an hour, to keep writes down.
  if (now() - session.last_used_at > 3_600_000) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?")
        .bind(now(), tokenHash)
        .run(),
    );
  }
  c.set("session", { userId: session.user_id, deviceHash: session.device_hash });
  await next();
};

export async function signOut(c: Ctx): Promise<Response> {
  const token = (c.req.header("authorization") ?? "").slice(7);
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
  return c.json({ ok: true });
}

export async function me(c: Ctx): Promise<Response> {
  return c.json(await account(c.env, c.get("session").userId));
}
