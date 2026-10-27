// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Change detection between sampled frames (docs/architecture.md §4.7, step 2).
 *
 * Frames are compared as 64×36 grayscale thumbnails. The thumbnail is split into a 16×9 grid
 * of 4×4-pixel tiles so we also know *where* the screen changed, which drives incremental OCR.
 */

export const THUMB_WIDTH = 64;
export const THUMB_HEIGHT = 36;
export const GRID_COLUMNS = 16;
export const GRID_ROWS = 9;

const TILE_WIDTH = THUMB_WIDTH / GRID_COLUMNS;
const TILE_HEIGHT = THUMB_HEIGHT / GRID_ROWS;

/** Mean absolute difference (0–255) above which a tile counts as changed. */
const TILE_THRESHOLD = 6;
/** Below 0.2% average change, two frames are treated as identical. */
const IDENTICAL_BELOW = 0.002;
/** Above 8% average change, the change is major (always a keyframe candidate). */
const MAJOR_ABOVE = 0.08;
/** More than 60% of tiles changing at once is usually an app or tab switch. */
const APP_SWITCH_ABOVE = 0.6;

export type ChangeClass = "identical" | "minor" | "major";

export interface FrameChange {
  /** Average absolute difference as a fraction of full scale (0–1). */
  change: number;
  changeClass: ChangeClass;
  /** Indices (row * GRID_COLUMNS + column) of the tiles that changed. */
  changedTiles: number[];
  /** Fraction of tiles that changed (0–1). */
  changedTileRatio: number;
  /** True when most of the screen changed at once. */
  probableAppSwitch: boolean;
}

/** Converts a 64×36 RGBA thumbnail to grayscale luma (Rec. 601 weights). */
export function toGrayscale(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const pixels = THUMB_WIDTH * THUMB_HEIGHT;
  if (rgba.length !== pixels * 4) {
    throw new RangeError(`Expected ${pixels * 4} RGBA bytes, got ${rgba.length}`);
  }
  const gray = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    gray[i] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  return gray;
}

/** Compares two grayscale thumbnails produced by {@link toGrayscale}. */
export function compareThumbnails(previous: Uint8Array, current: Uint8Array): FrameChange {
  if (previous.length !== current.length || current.length !== THUMB_WIDTH * THUMB_HEIGHT) {
    throw new RangeError("Thumbnails must both be 64×36 grayscale");
  }

  let total = 0;
  const tileSums = new Float64Array(GRID_COLUMNS * GRID_ROWS);
  for (let y = 0; y < THUMB_HEIGHT; y++) {
    const tileRow = Math.floor(y / TILE_HEIGHT);
    for (let x = 0; x < THUMB_WIDTH; x++) {
      const i = y * THUMB_WIDTH + x;
      const diff = Math.abs(current[i]! - previous[i]!);
      total += diff;
      tileSums[tileRow * GRID_COLUMNS + Math.floor(x / TILE_WIDTH)]! += diff;
    }
  }

  const pixelsPerTile = TILE_WIDTH * TILE_HEIGHT;
  const changedTiles: number[] = [];
  tileSums.forEach((sum, index) => {
    if (sum / pixelsPerTile > TILE_THRESHOLD) changedTiles.push(index);
  });

  const change = total / (THUMB_WIDTH * THUMB_HEIGHT * 255);
  const changedTileRatio = changedTiles.length / tileSums.length;
  return {
    change,
    changeClass: change < IDENTICAL_BELOW ? "identical" : change > MAJOR_ABOVE ? "major" : "minor",
    changedTiles,
    changedTileRatio,
    probableAppSwitch: changedTileRatio > APP_SWITCH_ABOVE,
  };
}
