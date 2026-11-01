// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The website's small view of a buyer, held in a cookie only auth.ivibe.tech can read (D31). There
 * is no login page: Buy signs someone in on the way to checkout, and this only asks who they are.
 */

const AUTH_URL = import.meta.env.DEV ? "http://localhost:8787/auth" : "https://auth.ivibe.tech";

/** Signs in if needed, then opens checkout, or the billing portal for someone already on Pro. */
export const BUY_URL = `${AUTH_URL}/buy`;

/** Opens the app on its billing screen, so it picks up the new plan straight away. */
export const OPEN_APP_URL = "tech.ivibe.app://billing";

export type WebAccount =
  { signedIn: false } | { signedIn: true; login: string | null; pro: boolean };

/** Null when the server can't be reached, so callers can tell that apart from signed out. */
export async function fetchAccount(): Promise<WebAccount | null> {
  try {
    const response = await fetch(`${AUTH_URL}/web/me`, { credentials: "include" });
    return response.ok ? ((await response.json()) as WebAccount) : null;
  } catch {
    return null;
  }
}

export async function signOutOfWeb(): Promise<boolean> {
  try {
    const response = await fetch(`${AUTH_URL}/web/sign-out`, {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}
