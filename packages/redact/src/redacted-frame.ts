// SPDX-License-Identifier: AGPL-3.0-only

import type { FrameId, OcrLine } from "@ivibe/ocr";
import type { Redaction, ScanReport } from "./scan.ts";

/**
 * Invariant: no pixel leaves the recorder unless its frame was OCR-scanned and redacted
 * (docs/architecture.md §4.9). The brand stops a raw frame from type-checking as redacted, and
 * the WeakSet stops a cast from getting one past `assertRedacted`.
 */

declare const brand: unique symbol;
const issued = new WeakSet<object>();

/** A frame straight from capture, with its OCR lines. */
export interface ScannedFrame {
  readonly id: FrameId;
  readonly tMs: number;
  readonly image: ImageBitmap;
}

/** The only frame type that encoders, the bundle writer and uploaders accept. */
export interface RedactedFrame {
  readonly id: FrameId;
  readonly tMs: number;
  /** Boxes already painted. */
  readonly image: ImageBitmap;
  readonly boxes: readonly Redaction[];
  readonly blackout: boolean;
  /** OCR lines with secrets masked. */
  readonly lines: readonly OcrLine[];
  readonly [brand]: true;
}

/** Paints opaque boxes over a copy of the image. */
export type Painter = (image: ImageBitmap, boxes: readonly Redaction[]) => ImageBitmap;

export const paintOffscreen: Painter = (image, boxes) => {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  context.drawImage(image, 0, 0);
  context.fillStyle = "#000";
  for (const { rect } of boxes) context.fillRect(rect.x, rect.y, rect.width, rect.height);
  return canvas.transferToImageBitmap();
};

/** The sole constructor: it needs the ScanReport the scanner produced for this frame. */
export function redact(
  frame: ScannedFrame,
  report: ScanReport,
  paint: Painter = paintOffscreen,
): RedactedFrame {
  const image = report.boxes.length > 0 ? paint(frame.image, report.boxes) : frame.image;
  const result = Object.freeze({
    id: frame.id,
    tMs: frame.tMs,
    image,
    boxes: Object.freeze([...report.boxes]),
    blackout: report.blackout,
    lines: Object.freeze([...report.lines]),
  }) as RedactedFrame;
  issued.add(result);
  return result;
}

/** Encoders call this too, so a type cast can't smuggle in a raw frame. */
export function assertRedacted(frame: object): asserts frame is RedactedFrame {
  if (!issued.has(frame)) throw new Error("unredacted frame");
}
