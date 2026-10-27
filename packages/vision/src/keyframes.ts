// SPDX-License-Identifier: AGPL-3.0-only

import type { ChangeClass } from "./change.ts";

/**
 * Chooses keyframes while recording (docs/architecture.md §4.7, step 4): every major change,
 * the first frame, and at least one frame every few seconds, up to a cap. The last frame is
 * added by the caller when recording stops.
 */
export class KeyframeSelector {
  readonly maxKeyframes: number;
  readonly maxGapMs: number;
  #count = 0;
  #lastKeptMs = Number.NEGATIVE_INFINITY;

  constructor(options: { maxKeyframes?: number; maxGapMs?: number } = {}) {
    this.maxKeyframes = options.maxKeyframes ?? 48;
    this.maxGapMs = options.maxGapMs ?? 3000;
  }

  get count(): number {
    return this.#count;
  }

  /** Whether the frame at `timeMs` should be kept. Call once per sampled frame, in order. */
  consider(timeMs: number, changeClass: ChangeClass | "first"): boolean {
    // One slot stays free for the final frame.
    if (this.#count >= this.maxKeyframes - 1) return false;
    const keep =
      changeClass === "first" ||
      changeClass === "major" ||
      (changeClass === "minor" && timeMs - this.#lastKeptMs >= this.maxGapMs);
    if (keep) {
      this.#count++;
      this.#lastKeptMs = timeMs;
    }
    return keep;
  }

  /** Reserves the slot for the last frame of the recording. */
  keepFinal(): void {
    this.#count = Math.min(this.#count + 1, this.maxKeyframes);
  }
}
