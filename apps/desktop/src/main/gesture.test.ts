// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOUBLE_MS, DictateGesture, HOLD_MS } from "./gesture.ts";

let held = false;
let recording = false;
let log: string[] = [];

function makeGesture() {
  return new DictateGesture({
    isHeld: async () => held,
    isRecording: () => recording,
    start: () => {
      recording = true;
      log.push("start");
    },
    stop: () => {
      recording = false;
      log.push("stop");
    },
    cancel: () => {
      recording = false;
      log.push("cancel");
    },
    settled: () => log.push("settled"),
  });
}

/** Presses the key for `ms`, then releases it and lets the poller notice. */
async function tap(gesture: DictateGesture, ms: number) {
  held = true;
  gesture.press();
  await vi.advanceTimersByTimeAsync(ms);
  held = false;
  await vi.advanceTimersByTimeAsync(50);
}

describe("DictateGesture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    held = false;
    recording = false;
    log = [];
  });
  afterEach(() => vi.useRealTimers());

  it("records while the key is held", async () => {
    const gesture = makeGesture();
    await tap(gesture, HOLD_MS + 200);
    expect(log).toEqual(["start", "stop", "settled"]);
    expect(gesture.state).toBe("idle");
  });

  it("ignores the hotkey repeating while held", async () => {
    const gesture = makeGesture();
    held = true;
    gesture.press();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100);
      gesture.press();
    }
    held = false;
    await vi.advanceTimersByTimeAsync(50);
    expect(log).toEqual(["start", "stop", "settled"]);
  });

  it("cancels a single tap", async () => {
    const gesture = makeGesture();
    await tap(gesture, 80);
    expect(gesture.state).toBe("tapped");
    await vi.advanceTimersByTimeAsync(DOUBLE_MS);
    expect(log).toEqual(["start", "cancel", "settled"]);
  });

  it("goes hands-free on a double-press and stops on the next one", async () => {
    const gesture = makeGesture();
    await tap(gesture, 80);
    await tap(gesture, 80);
    expect(gesture.state).toBe("handsfree");
    await vi.advanceTimersByTimeAsync(5000);
    expect(recording).toBe(true);

    await tap(gesture, 80);
    await tap(gesture, 80);
    expect(log).toEqual(["start", "settled", "stop", "settled"]);
    expect(gesture.state).toBe("idle");
  });

  it("keeps hands-free going after a single tap", async () => {
    const gesture = makeGesture();
    await tap(gesture, 80);
    await tap(gesture, 80);
    await tap(gesture, 80);
    await vi.advanceTimersByTimeAsync(DOUBLE_MS);
    expect(gesture.state).toBe("handsfree");
    expect(recording).toBe(true);
  });

  it("starts over when the recording was stopped another way", async () => {
    const gesture = makeGesture();
    await tap(gesture, 80);
    await tap(gesture, 80);
    recording = false; // e.g. the Stop button
    await tap(gesture, HOLD_MS + 100);
    expect(log.filter((entry) => entry === "start")).toHaveLength(2);
    expect(gesture.state).toBe("idle");
  });
});
