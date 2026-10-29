// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from "hono";
import {
  backupDeleteObjectRoute,
  backupDeleteRoute,
  backupGetRoute,
  backupPutRoute,
  backupSetupRoute,
  backupStatusRoute,
  expireBackups,
} from "./backup.ts";
import { checkoutRoute, planOffer, portalRoute, returnPage, webhookRoute } from "./billing.ts";
import { exchangeToken, githubCallback, githubStart, me, requireSession, signOut } from "./auth.ts";
import type { AppEnv, Env } from "./env.ts";
import { closeRecordingRoute, composeRoute, openRecordingRoute, transcribeRoute } from "./runs.ts";
import { loadSettings } from "./settings.ts";
import { usageRoute } from "./usage.ts";
import { now } from "./util.ts";
import { settleStale } from "./wallet.ts";

/** iVibe Cloud (docs/architecture.md §6). */

/** auth.ivibe.tech: GitHub sign-in for the desktop app. */
const auth = new Hono<AppEnv>();
auth.get("/", (c) => c.redirect("https://ivibe.tech"));
auth.get("/github", githubStart);
auth.get("/github/callback", githubCallback);
auth.post("/token", exchangeToken);
auth.post("/sign-out", signOut);

/** api.ivibe.tech: everything the app calls once signed in. */
const api = new Hono<AppEnv>();
api.get("/", (c) => c.redirect("https://ivibe.tech"));
api.get("/health", (c) => c.json({ ok: true }));

/** Public config the desktop caches: whether Cloud is on and what the trial is. */
api.get("/v1/config", async (c) => {
  const settings = await loadSettings(c.env.DB);
  return c.json({
    cloudEnabled: settings.cloudEnabled,
    trialCredits: Math.floor(settings.trialAmount / 10_000),
    plan: planOffer(c.env, settings),
  });
});

/** Reached without a session: Dodo's browser redirect and its signed webhooks. */
const PUBLIC = new Set(["/v1/config", "/v1/billing/return", "/v1/billing/webhook"]);
api.use("/v1/*", async (c, next) => (PUBLIC.has(c.req.path) ? next() : requireSession(c, next)));
api.get("/v1/me", me);
api.get("/v1/usage", usageRoute);
api.post("/v1/transcribe", transcribeRoute);
api.post("/v1/recordings", openRecordingRoute);
api.post("/v1/recordings/:id/close", closeRecordingRoute);
api.post("/v1/compose", composeRoute);
api.post("/v1/billing/checkout", checkoutRoute);
api.post("/v1/billing/portal", portalRoute);
api.get("/v1/billing/return", returnPage);
api.post("/v1/billing/webhook", webhookRoute);
api.get("/v1/backup", backupStatusRoute);
api.post("/v1/backup", backupSetupRoute);
api.delete("/v1/backup", backupDeleteRoute);
api.put("/v1/backup/objects/:name", backupPutRoute);
api.get("/v1/backup/objects/:name", backupGetRoute);
api.delete("/v1/backup/objects/:name", backupDeleteObjectRoute);

for (const app of [auth, api]) {
  app.onError((error, c) => {
    console.error(error);
    return c.json(
      { error: "internal", message: "Something went wrong on our side. Try again." },
      500,
    );
  });
}

export default {
  // One Worker serves both. In production auth.ivibe.tech is told apart by its host. In
  // `pnpm dev` AUTH_URL is localhost:8787/auth and matched by path, since wrangler dev rewrites
  // every request's host to the first route.
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const authUrl = new URL(env.AUTH_URL);
    const prefix = authUrl.pathname.replace(/\/$/, "");
    const isAuth = prefix
      ? url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
      : url.hostname === authUrl.hostname;
    if (!isAuth) return api.fetch(request, env, ctx);
    if (prefix) url.pathname = url.pathname.slice(prefix.length) || "/";
    return auth.fetch(new Request(url, request), env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const settled = await settleStale(env.DB);
    if (settled > 0) console.log(`settled ${settled} stale reservations`);
    const day = 86_400_000;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(now() - day),
      env.DB.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(now()),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
      env.DB.prepare("DELETE FROM webhook_events WHERE received_at < ?").bind(now() - 30 * day),
    ]);
    const expired = await expireBackups(env);
    if (expired > 0) console.log(`deleted ${expired} backups 90 days after Pro ended`);
  },
} satisfies ExportedHandler<Env>;
