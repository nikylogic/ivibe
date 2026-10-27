// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  GRID_COLUMNS,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  compareThumbnails,
  toGrayscale,
} from "./change.ts";
import { KeyframeSelector } from "./keyframes.ts";

const blank = (value = 0) => new Uint8Array(THUMB_WIDTH * THUMB_HEIGHT).fill(value);

describe("compareThumbnails", () => {
  it("treats identical frames as identical", () => {
    const result = compareThumbnails(blank(40), blank(40));
    expect(result.changeClass).toBe("identical");
    expect(result.changedTiles).toEqual([]);
  });

  it("finds a small change and the tile it is in", () => {
    const before = blank(40);
    const after = blank(40);
    // Light up the 4×4 tile at column 3, row 2 (a toast appearing).
    for (let y = 8; y < 12; y++) for (let x = 12; x < 16; x++) after[y * THUMB_WIDTH + x] = 240;
    const result = compareThumbnails(before, after);
    expect(result.changeClass).toBe("minor");
    expect(result.changedTiles).toEqual([2 * GRID_COLUMNS + 3]);
    expect(result.probableAppSwitch).toBe(false);
  });

  it("flags a full-screen change as major and a probable app switch", () => {
    const result = compareThumbnails(blank(20), blank(220));
    expect(result.changeClass).toBe("major");
    expect(result.probableAppSwitch).toBe(true);
  });

  it("rejects thumbnails of the wrong size", () => {
    expect(() => compareThumbnails(new Uint8Array(10), blank())).toThrow(RangeError);
  });
});

describe("toGrayscale", () => {
  it("converts RGBA to luma", () => {
    const rgba = new Uint8ClampedArray(THUMB_WIDTH * THUMB_HEIGHT * 4).fill(255);
    const gray = toGrayscale(rgba);
    expect(gray[0]).toBe(255);
    expect(gray.length).toBe(THUMB_WIDTH * THUMB_HEIGHT);
  });
});

describe("KeyframeSelector", () => {
  it("keeps the first frame, major changes and one frame per gap", () => {
    const selector = new KeyframeSelector({ maxGapMs: 3000 });
    expect(selector.consider(0, "first")).toBe(true);
    expect(selector.consider(250, "minor")).toBe(false);
    expect(selector.consider(500, "major")).toBe(true);
    expect(selector.consider(3600, "minor")).toBe(true);
    expect(selector.consider(3850, "identical")).toBe(false);
    expect(selector.count).toBe(3);
  });

  it("never exceeds the cap and keeps a slot for the final frame", () => {
    const selector = new KeyframeSelector({ maxKeyframes: 4 });
    const kept = [0, 1, 2, 3, 4].filter((i) => selector.consider(i * 100, "major"));
    expect(kept).toHaveLength(3);
    selector.keepFinal();
    expect(selector.count).toBe(4);
  });
});
