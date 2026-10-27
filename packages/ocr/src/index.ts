// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @packageDocumentation
 * On-device OCR with PaddleOCR on ONNX Runtime Web. The browser engine lives in the
 * `@ivibe/ocr/web` entry so Node code never loads onnxruntime-web.
 *
 * Design: docs/architecture.md §4.8.
 */

export { frameId } from "./types.ts";
export type {
  FrameId,
  LineId,
  OcrEngine,
  OcrImage,
  OcrLine,
  OcrWord,
  RecognizeOptions,
  Rect,
} from "./types.ts";
export { spanBox, splitWords, toOcrLines } from "./lines.ts";
export type { TextRun } from "./lines.ts";
export { PaddleOcrEngine } from "./paddle.ts";
export type { CanvasFactory, PaddleService } from "./paddle.ts";
export { FakeOcr } from "./fake.ts";
