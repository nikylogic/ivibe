// SPDX-License-Identifier: AGPL-3.0-only

import type { CloudStatus, Settings } from "../shared/ipc.ts";
import type { MetaAccess } from "./cloud.ts";

/**
 * Which of the user's ways to reach Meta a recording runs on (docs/architecture.md D29): their
 * own key, an iVibe Cloud session, or both in the order Settings → Meta API key picks, with the
 * second as a fallback when the first can't run.
 */

/** The order to try, first to last; empty means there is nothing to run on. */
export function accessOrder(
  settings: Pick<Settings, "runOn" | "runFallback">,
  key: string | null,
  cloud: { token: string | null; status: CloudStatus },
): MetaAccess[] {
  const own: MetaAccess | null = key ? { kind: "byok", key } : null;
  const session: MetaAccess | null = cloud.token ? { kind: "cloud", token: cloud.token } : null;
  if (!own || !session) return [own ?? session].filter((access) => access !== null);
  // Pro is paid for, so it goes first; otherwise the key does and Cloud credits are saved.
  const cloudFirst =
    settings.runOn === "cloud" || (settings.runOn === "auto" && cloud.status.tier === "pro");
  const order = cloudFirst ? [session, own] : [own, session];
  return settings.runFallback ? order : order.slice(0, 1);
}

/** iVibe Cloud refusals that the user's own key can get past. */
const CLOUD_REFUSALS = new Set([
  "insufficient_credits",
  "capacity_paused",
  "cloud_disabled",
  "unauthorized",
  "device_limit",
  "network_limit",
  "account_too_new",
  // Meta refused iVibe Cloud's own key or limits; the user's key may still work. Plain
  // "upstream" (Meta itself failing) would fail the same way on the user's key.
  "upstream_refused",
]);

/** Meta refusing the key itself (invalid, no billing, rate limited), which Cloud can get past. */
const KEY_REFUSALS = new Set([401, 402, 403, 429]);

/** Whether an error means "this way can't run", so the next one should be tried. */
export function shouldFallBack(access: MetaAccess, error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (access.kind === "cloud") {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && CLOUD_REFUSALS.has(code);
  }
  const { name, status } = error as { name?: unknown; status?: unknown };
  return name === "MetaApiError" && typeof status === "number" && KEY_REFUSALS.has(status);
}
