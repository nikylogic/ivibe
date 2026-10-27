// SPDX-License-Identifier: AGPL-3.0-only

import { toOcrLines } from "./lines.ts";
import type { TextRun } from "./lines.ts";
import type { OcrEngine, OcrImage, OcrLine, RecognizeOptions } from "./types.ts";

/** The slice of ppu-paddle-ocr's PaddleOcrService this engine uses (web and Node builds alike). */
export interface PaddleService {
  recognize(
    image: never,
    options: { flatten: true; noCache?: boolean; strategy?: "per-box" | "per-line" | "cross-line" },
  ): Promise<{
    results: { text: string; box: TextRun["bbox"]; confidence: number }[];
  }>;
}

/** Creates a canvas of the given size: OffscreenCanvas in browsers, @napi-rs/canvas in tests. */
export type CanvasFactory = (width: number, height: number) => OffscreenCanvas;

const offscreen: CanvasFactory = (width, height) => new OffscreenCanvas(width, height);

/**
 * PaddleOCR (PP-OCRv5 mobile) behind the OcrEngine interface (docs/architecture.md §4.8). The
 * service is passed in so the same code runs on ONNX Runtime Web in the app and on
 * onnxruntime-node in tests.
 */
export class PaddleOcrEngine implements OcrEngine {
  readonly name = "paddle-ocr-v5-mobile";
  readonly #service: PaddleService;
  readonly #createCanvas: CanvasFactory;

  constructor(service: PaddleService, createCanvas: CanvasFactory = offscreen) {
    this.#service = service;
    this.#createCanvas = createCanvas;
  }

  async recognize(image: OcrImage, { frame, region }: RecognizeOptions): Promise<OcrLine[]> {
    const area = region ?? { x: 0, y: 0, width: image.width, height: image.height };
    const width = Math.max(1, Math.round(area.width));
    const height = Math.max(1, Math.round(area.height));
    const canvas = this.#createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    context.drawImage(
      image as CanvasImageSource,
      area.x,
      area.y,
      width,
      height,
      0,
      0,
      width,
      height,
    );

    // Cross-line batching read short lines that per-line dropped, and was faster (Spike S12).
    // Frames are unique, so the library's result cache would only hold on to memory.
    const result = await this.#service.recognize(canvas as never, {
      flatten: true,
      noCache: true,
      strategy: "cross-line",
    });
    const runs: TextRun[] = result.results.map((item) => ({
      text: item.text,
      bbox: {
        x: item.box.x + area.x,
        y: item.box.y + area.y,
        width: item.box.width,
        height: item.box.height,
      },
      conf: Number.isFinite(item.confidence) ? item.confidence : null,
    }));
    return toOcrLines(frame, runs);
  }
}
