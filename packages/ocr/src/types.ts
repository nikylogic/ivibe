// SPDX-License-Identifier: AGPL-3.0-only

/** A rectangle in frame pixel coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** "f0016": the frame's index in the recording. */
export type FrameId = `f${string}`;

/** "f0016:l41": frame plus line number, cited by the agent and the report. */
export type LineId = `${FrameId}:l${number}`;

export interface OcrWord {
  text: string;
  bbox: Rect;
}

export interface OcrLine {
  id: LineId;
  /** Verbatim text. */
  text: string;
  bbox: Rect;
  conf: number | null;
  /** Word boxes, used for precise redaction. */
  words: OcrWord[];
}

/** Anything OCR can read: a decoded frame or a canvas holding one. */
export type OcrImage = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

export interface RecognizeOptions {
  /** The frame the lines belong to; it prefixes every line ID. */
  frame: FrameId;
  /** Read only this part of the image (default: all of it). Boxes stay in frame coordinates. */
  region?: Rect;
}

export interface OcrEngine {
  readonly name: string;
  recognize(image: OcrImage, options: RecognizeOptions): Promise<OcrLine[]>;
}

export const frameId = (index: number): FrameId => `f${String(index).padStart(4, "0")}`;
