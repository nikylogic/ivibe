// SPDX-License-Identifier: AGPL-3.0-only

export interface Env {
  DB: D1Database;
  /** ivibe-backups: Pro users' end-to-end encrypted backups (§6.10). */
  BACKUPS: R2Bucket;
  /** https://api.ivibe.tech */
  API_URL: string;
  /** https://auth.ivibe.tech; GitHub redirects back here. */
  AUTH_URL: string;
  /** https://ivibe.tech: the one site allowed to ask who's signed in, and where buyers return. */
  SITE_URL: string;
  APP_SCHEME: string;
  META_API_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Unset: the Google route says it isn't available, and the website goes straight to GitHub. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Salts every stored device and network hash, so they can't be reversed or matched elsewhere. */
  HASH_SALT: string;
  /** https://test.dodopayments.com or https://live.dodopayments.com */
  DODO_API_URL: string;
  /** Unset until the Dodo account is set up; checkout then says Pro is coming soon. */
  DODO_API_KEY?: string;
  /** whsec_…, from the webhook endpoint in Dodo's dashboard. */
  DODO_WEBHOOK_SECRET?: string;
  /** A send-only Resend key. Unset: emails wait in the outbox and nothing else changes. */
  RESEND_API_KEY?: string;
}

export interface Session {
  userId: string;
  deviceHash: string;
}

export type AppEnv = { Bindings: Env; Variables: { session: Session } };
