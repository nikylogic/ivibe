// SPDX-License-Identifier: AGPL-3.0-only

/** Limits and prices from D1 `settings`, cached for 30 s per isolate so changes apply quickly. */

export interface Settings {
  cloudEnabled: boolean;
  trialAmount: number;
  trialPerDevice: number;
  trialPerNetworkPerDay: number;
  trialMinGithubAgeDays: number;
  dailyCap: number;
  price: {
    sparkInput: number;
    sparkCached: number;
    sparkOutput: number;
    /** muse-spark-1.3-contributor, used for free-trial runs (D25). */
    trialInput: number;
    trialOutput: number;
    samImage: number;
    asrSecond: number;
  };
  hold: { fix: number; write: number };
  /** iVibe Pro (D26): the Dodo product, what each paid month adds, and its label in the app. */
  plan: { productId: string; amount: number; priceLabel: string };
}

let cached: { at: number; value: Settings } | null = null;

export async function loadSettings(db: D1Database): Promise<Settings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  const { results } = await db
    .prepare("SELECT key, value FROM settings")
    .all<{ key: string; value: string }>();
  const raw = new Map(results.map((row) => [row.key, row.value]));
  const num = (key: string, fallback: number) => {
    const value = Number(raw.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  const value: Settings = {
    cloudEnabled: raw.get("cloud_enabled") !== "0",
    trialAmount: num("trial_amount", 500_000),
    trialPerDevice: num("trial_per_device", 2),
    trialPerNetworkPerDay: num("trial_per_network_per_day", 2),
    trialMinGithubAgeDays: num("trial_min_github_age_days", 14),
    dailyCap: num("daily_cap", 7_000_000),
    price: {
      sparkInput: num("price_spark_input", 1.25),
      sparkCached: num("price_spark_cached", 0.15),
      sparkOutput: num("price_spark_output", 4.25),
      // Until Meta's console confirms the contributor price, trial runs are metered at the
      // standard rate, so a wrong guess can't let a trial spend more than its credits.
      trialInput: num("price_trial_input", 1.25),
      trialOutput: num("price_trial_output", 4.25),
      samImage: num("price_sam_image", 2500),
      asrSecond: num("price_asr_second", 50),
    },
    hold: { fix: num("hold_fix", 120_000), write: num("hold_write", 25_000) },
    plan: {
      productId: raw.get("plan_product_id") ?? "",
      amount: num("plan_amount", 4_000_000),
      priceLabel: raw.get("plan_price_label") ?? "$8/month",
    },
  };
  cached = { at: Date.now(), value };
  return value;
}
