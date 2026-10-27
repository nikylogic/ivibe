// SPDX-License-Identifier: AGPL-3.0-only

import { ort } from "./ort-env.ts";
import { PaddleOcrService } from "ppu-paddle-ocr/web";
import { PaddleOcrEngine } from "./paddle.ts";
import type { PaddleService } from "./paddle.ts";

export interface WebOcrOptions {
  /** Where `pnpm ocr:fetch` put the models, e.g. "/ocr/". */
  baseUrl: string;
}

/**
 * PaddleOCR on ONNX Runtime Web with the models and WebAssembly served by the app itself, so OCR
 * needs no network access (the renderer's CSP only allows 'self').
 */
export async function createWebOcr({ baseUrl }: WebOcrOptions): Promise<PaddleOcrEngine> {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  // Threads need cross-origin isolation, which the app:// protocol provides.
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 1)
    : 1;

  const service = new PaddleOcrService({
    model: {
      detection: `${base}det.ort`,
      recognition: `${base}rec.ort`,
      charactersDictionary: `${base}dict.txt`,
    },
    processing: { engine: "canvas-native" },
  });
  await service.initialize();
  return new PaddleOcrEngine(service as unknown as PaddleService);
}
