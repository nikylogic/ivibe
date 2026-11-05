// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import type { AppEnv } from "./env.ts";

/**
 * Every page people see after sign-in or billing is a real page of the website
 * (apps/web/src/account-pages.tsx), so it looks like the website. This Worker only says which one.
 *
 * Anything private goes after the #, which browsers never send to a server or in a Referer. A login
 * code seen there is still useless without the app's PKCE verifier.
 */

export type Moment =
  | "sign-in"
  | "signed-in"
  | "pro"
  | "all-set"
  | "payment-failed"
  | "checkout-failed"
  | "sign-in-expired"
  | "sign-in-failed"
  | "google-unavailable"
  | "pro-coming-soon"
  | "open-from-app";

export function moment(
  c: Context<AppEnv>,
  name: Moment,
  fragment?: Record<string, string>,
): Response {
  const hash = fragment ? `#${new URLSearchParams(fragment)}` : "";
  return c.redirect(`${c.env.SITE_URL}/account/${name}${hash}`);
}
