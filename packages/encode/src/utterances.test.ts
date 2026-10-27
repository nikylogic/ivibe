// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { UtteranceSegmenter } from "./utterances.ts";
import type { Utterance } from "./utterances.ts";

const RATE = 16_000;
const CHUNK = RATE / 20; // 50 ms

/** Feeds `ms` of audio at a constant level (RMS), in 50-ms chunks. */
function feed(segmenter: UtteranceSegmenter, ms: number, level: number): void {
  for (let i = 0; i < ms / 50; i++) segmenter.push(new Float32Array(CHUNK).fill(level), level);
}

function collect(options: Partial<ConstructorParameters<typeof UtteranceSegmenter>[0]> = {}) {
  const utterances: Utterance[] = [];
  const segmenter = new UtteranceSegmenter({
    sampleRate: RATE,
    onUtterance: (u) => utterances.push(u),
    ...options,
  });
  return { segmenter, utterances };
}

describe("UtteranceSegmenter", () => {
  it("emits one utterance per pause, with pre-roll and timing", () => {
    const { segmenter, utterances } = collect();
    feed(segmenter, 1000, 0.002); // room tone
    feed(segmenter, 1500, 0.1); // speech
    feed(segmenter, 800, 0.002); // pause ends it
    feed(segmenter, 1000, 0.1);
    segmenter.flush();

    expect(utterances).toHaveLength(2);
    const [first] = utterances;
    expect(first!.startMs).toBe(750); // 250 ms pre-roll before speech at 1000 ms
    // 250 pre-roll + 1500 speech + 150 tail.
    expect(first!.endMs - first!.startMs).toBeCloseTo(1900, 0);
    expect(first!.samples.length).toBe((1900 / 1000) * RATE);
    // Only 100 ms of silence follows the first close (at 3200 ms), so the pre-roll is short.
    expect(utterances[1]!.startMs).toBeCloseTo(3200, 0);
  });

  it("ignores short bumps", () => {
    const { segmenter, utterances } = collect();
    feed(segmenter, 500, 0.002);
    feed(segmenter, 100, 0.2);
    feed(segmenter, 1000, 0.002);
    expect(utterances).toHaveLength(0);
  });

  it("cuts long monologues", () => {
    const { segmenter, utterances } = collect({ maxUtteranceMs: 3000 });
    feed(segmenter, 7000, 0.1);
    expect(utterances.length).toBe(2);
    expect(segmenter.isSpeaking).toBe(true);
  });

  it("adapts to steady background noise", () => {
    const { segmenter, utterances } = collect();
    feed(segmenter, 5000, 0.009); // a fan, just under the floor at first
    feed(segmenter, 2000, 0.014); // slightly louder hum: still under 3× the learned floor
    feed(segmenter, 1000, 0.009);
    expect(utterances).toHaveLength(0);
  });
});
