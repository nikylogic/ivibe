// SPDX-License-Identifier: AGPL-3.0-only

import type { FrameId, LineId, OcrLine, OcrWord, Rect } from "./types.ts";

/** A text run as the recognizer reports it, before IDs and word boxes. */
export interface TextRun {
  text: string;
  bbox: Rect;
  conf: number | null;
}

/**
 * The box of characters [start, end) of a line. PaddleOCR only returns line boxes, so character
 * positions are interpolated: exact for monospace code, close enough for UI text once padded.
 */
export function spanBox(line: { text: string; bbox: Rect }, start: number, end: number): Rect {
  const length = Math.max(1, line.text.length);
  const charWidth = line.bbox.width / length;
  return {
    x: line.bbox.x + start * charWidth,
    y: line.bbox.y,
    width: Math.max(1, (end - start) * charWidth),
    height: line.bbox.height,
  };
}

export function splitWords(line: { text: string; bbox: Rect }): OcrWord[] {
  const words: OcrWord[] = [];
  for (const match of line.text.matchAll(/\S+/g)) {
    words.push({
      text: match[0],
      bbox: spanBox(line, match.index, match.index + match[0].length),
    });
  }
  return words;
}

/** Sorts runs into reading order (top to bottom, then left to right) and assigns line IDs. */
export function toOcrLines(frame: FrameId, runs: readonly TextRun[]): OcrLine[] {
  const sorted = runs
    .filter((run) => run.text.trim().length > 0)
    .toSorted((a, b) => {
      const sameRow = Math.abs(a.bbox.y - b.bbox.y) < Math.min(a.bbox.height, b.bbox.height) / 2;
      return sameRow ? a.bbox.x - b.bbox.x : a.bbox.y - b.bbox.y;
    });
  return sorted.map((run, index) => ({
    id: `${frame}:l${index}` as LineId,
    text: run.text,
    bbox: run.bbox,
    conf: run.conf,
    words: splitWords(run),
  }));
}
