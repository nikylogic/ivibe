// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { githubAuthorizeUrl, page } from "./auth.ts";
import { planOf, purchaseLink, SUBSCRIBED } from "./billing.ts";
import type { AppEnv } from "./env.ts";
import { now, randomToken, sha256 } from "./util.ts";

/**
 * Buying Pro on the website (D31). One link does it all, so the site never waits or guesses:
 *
 *   GET auth.ivibe.tech/buy
 *     signed in, no plan → Dodo checkout
 *     signed in, on Pro  → Dodo's portal, so nobody pays twice
 *     signed out         → GitHub, then back here and on to one of the above
 *
 * A web session is a cookie only this host can read, kept apart from the app's sessions, and it can
 * only buy or manage a plan: requireSession never accepts it, so it can't run or spend anything.
 */

type Ctx = Context<AppEnv>;

export const WEB_COOKIE = "__Host-ivibe_web";
const STATE_COOKIE = "__Host-ivibe_state";
const WEB_SESSION_TTL_MS = 30 * 86_400_000;

const cookieOptions = {
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "Lax",
} as const;

async function webUser(c: Ctx): Promise<{ userId: string; login: string | null } | null> {
  const token = getCookie(c, WEB_COOKIE);
  if (!token?.startsWith("ivw_")) return null;
  const row = await c.env.DB.prepare(
    `SELECT w.user_id, w.expires_at, u.github_login FROM web_sessions w
     JOIN users u ON u.id = w.user_id WHERE w.token_hash = ?`,
  )
    .bind(await sha256(token))
    .first<{ user_id: string; expires_at: number; github_login: string | null }>();
  if (!row || row.expires_at < now()) return null;
  return { userId: row.user_id, login: row.github_login };
}

export async function buyRoute(c: Ctx): Promise<Response> {
  const user = await webUser(c);
  if (!user) {
    const state = randomToken();
    await c.env.DB.prepare(
      "INSERT INTO oauth_states (state, challenge, created_at, purpose) VALUES (?, '', ?, 'web')",
    )
      .bind(state, now())
      .run();
    // Ties the sign-in to this browser, so nobody can send a buyer a link that signs them in as
    // someone else and has them pay for that account.
    setCookie(c, STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
    return c.redirect(githubAuthorizeUrl(c, state));
  }
  try {
    const link = await purchaseLink(c.env, user.userId, "web");
    if (link) return c.redirect(link.url);
    return c.html(
      page("iVibe Pro is coming soon", "Until then, add your own Meta key to use iVibe for free."),
      503,
    );
  } catch (error) {
    console.error(error);
    return c.html(
      page("Checkout didn't open", "You weren't charged. Please try again in a moment."),
      502,
    );
  }
}

/** Whether this browser is the one that started the website sign-in with this state. */
export function startedHere(c: Ctx, state: string | undefined): boolean {
  return !!state && getCookie(c, STATE_COOKIE) === state;
}

/** The end of a website sign-in: sets the cookie and carries on to checkout. */
export async function finishWebSignIn(c: Ctx, userId: string): Promise<Response> {
  setCookie(c, STATE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  const token = randomToken("ivw_");
  const at = now();
  await c.env.DB.prepare(
    "INSERT INTO web_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256(token), userId, at, at + WEB_SESSION_TTL_MS)
    .run();
  setCookie(c, WEB_COOKIE, token, { ...cookieOptions, maxAge: WEB_SESSION_TTL_MS / 1000 });
  return c.redirect(`${c.env.AUTH_URL}/buy`);
}

/** What the site shows: who's signed in, and whether Buy should say Manage. */
export async function webMeRoute(c: Ctx): Promise<Response> {
  c.header("Cache-Control", "no-store");
  const user = await webUser(c);
  if (!user) return c.json({ signedIn: false });
  const plan = await planOf(c.env.DB, user.userId);
  return c.json({
    signedIn: true,
    login: user.login,
    pro: !!plan && SUBSCRIBED.has(plan.status),
  });
}

export async function webSignOutRoute(c: Ctx): Promise<Response> {
  // Only our own site can sign someone out.
  if (c.req.header("origin") !== c.env.SITE_URL) return c.json({ error: "forbidden" }, 403);
  const token = getCookie(c, WEB_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM web_sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  }
  setCookie(c, WEB_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return c.json({ ok: true });
}
