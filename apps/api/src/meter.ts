// SPDX-License-Identifier: AGPL-3.0-only

import type { ClientOptions } from "@ivibe/engine";
import type { Settings } from "./settings.ts";

/** Spark's usage block; cached tokens are billed at the lower rate. */
export interface SparkUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

export function sparkCost(usage: SparkUsage, price: Settings["price"], trial = false): number {
  const input = usage.input_tokens ?? 0;
  if (trial) return input * price.trialInput + (usage.output_tokens ?? 0) * price.trialOutput;
  const cached = Math.min(usage.input_tokens_details?.cached_tokens ?? 0, input);
  return (
    (input - cached) * price.sparkInput +
    cached * price.sparkCached +
    (usage.output_tokens ?? 0) * price.sparkOutput
  );
}

/**
 * Adds up what one request's Meta calls cost, from the usage each response reports. A Spark
 * response without usage can't be priced, so the run is charged its full reservation instead.
 */
export class Meter {
  cost = 0;
  unpriced = false;
  readonly calls: { model: string; usage?: SparkUsage }[] = [];
  readonly #price: Settings["price"];
  readonly #apiKey: string;
  /** Free-trial run: Spark calls use the contributor model (D25). */
  readonly trial: boolean;

  constructor(settings: Settings, apiKey: string, trial = false) {
    this.#price = settings.price;
    this.#apiKey = apiKey;
    this.trial = trial;
  }

  /** A client for the engine whose successful responses are metered as `model`. */
  client(model: "spark" | "sam" | "asr", signal?: AbortSignal): ClientOptions {
    return {
      apiKey: this.#apiKey,
      signal,
      trial: this.trial,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (!response.ok) {
          // Meta's error type and code only: its message can echo the user's request.
          const body = (await response
            .clone()
            .json()
            .catch(() => ({}))) as { error?: { type?: string; code?: string } };
          console.error(
            `meta ${model} HTTP ${response.status} type=${body.error?.type ?? "?"} code=${body.error?.code ?? "?"}`,
          );
          return response;
        }
        if (model === "sam") {
          this.cost += this.#price.samImage;
          this.calls.push({ model });
        } else if (model === "spark") {
          const body = (await response.clone().json()) as { usage?: SparkUsage };
          this.calls.push({ model, usage: body.usage });
          if (body.usage) this.cost += sparkCost(body.usage, this.#price, this.trial);
          else this.unpriced = true;
        }
        return response;
      },
    };
  }

  /** What to charge, given what was reserved. */
  charge(reserved: number): number {
    return this.unpriced ? reserved : this.cost;
  }
}
