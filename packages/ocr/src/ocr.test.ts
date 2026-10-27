// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { FakeOcr } from "./fake.ts";
import { spanBox, splitWords, toOcrLines } from "./lines.ts";
import { PaddleOcrEngine } from "./paddle.ts";
import type { CanvasFactory, PaddleService } from "./paddle.ts";
import { frameId } from "./types.ts";

describe("lines", () => {
  it("formats frame IDs", () => {
    expect(frameId(16)).toBe("f0016");
  });

  it("interpolates word boxes from character positions", () => {
    const line = { text: "const key = 1", bbox: { x: 100, y: 10, width: 130, height: 20 } };
    const words = splitWords(line);
    expect(words.map((w) => w.text)).toEqual(["const", "key", "=", "1"]);
    expect(words[1]!.bbox).toEqual({ x: 160, y: 10, width: 30, height: 20 });
    expect(spanBox(line, 0, 5).width).toBe(50);
  });

  it("orders runs top to bottom, then left to right", () => {
    const lines = toOcrLines("f0002", [
      { text: "second", bbox: { x: 0, y: 40, width: 60, height: 20 }, conf: 0.9 },
      { text: "right", bbox: { x: 200, y: 12, width: 50, height: 20 }, conf: 0.9 },
      { text: "left", bbox: { x: 0, y: 10, width: 40, height: 20 }, conf: 0.9 },
      { text: "  ", bbox: { x: 0, y: 80, width: 40, height: 20 }, conf: 0.9 },
    ]);
    expect(lines.map((l) => `${l.id} ${l.text}`)).toEqual([
      "f0002:l0 left",
      "f0002:l1 right",
      "f0002:l2 second",
    ]);
  });

  it("FakeOcr returns its fixture for any frame", async () => {
    const ocr = new FakeOcr([{ text: "hi", bbox: { x: 0, y: 0, width: 10, height: 10 }, conf: 1 }]);
    const lines = await ocr.recognize(null, { frame: "f0007" });
    expect(lines[0]!.id).toBe("f0007:l0");
  });
});

const napiCanvas = createCanvas as unknown as CanvasFactory;

describe("PaddleOcrEngine", () => {
  it("offsets region results into frame coordinates", async () => {
    const service: PaddleService = {
      recognize: () =>
        Promise.resolve({
          results: [{ text: "Save", box: { x: 5, y: 6, width: 40, height: 18 }, confidence: 0.98 }],
        }),
    };
    const engine = new PaddleOcrEngine(service, napiCanvas);
    const image = createCanvas(400, 300) as unknown as OffscreenCanvas;
    const lines = await engine.recognize(image, {
      frame: "f0001",
      region: { x: 100, y: 200, width: 80, height: 40 },
    });
    expect(lines[0]!.bbox).toEqual({ x: 105, y: 206, width: 40, height: 18 });
  });
});

// The real models come from `pnpm ocr:fetch`; without them (e.g. a fresh CI runner) this is skipped.
const modelDir = join(import.meta.dirname, "../../../apps/desktop/src/renderer/public/ocr");
const haveModels = existsSync(join(modelDir, "rec.ort"));

describe.runIf(haveModels)("PP-OCRv5 on onnxruntime-node", () => {
  it("reads code and a token from a rendered editor screenshot", { timeout: 60_000 }, async () => {
    const { PaddleOcrService } = await import("ppu-paddle-ocr");
    const service = new PaddleOcrService({
      model: {
        detection: join(modelDir, "det.ort"),
        recognition: join(modelDir, "rec.ort"),
        charactersDictionary: join(modelDir, "dict.txt"),
      },
    });
    await service.initialize();

    const canvas = createCanvas(1280, 360);
    const context = canvas.getContext("2d");
    context.fillStyle = "#1e1e1e";
    context.fillRect(0, 0, 1280, 360);
    context.fillStyle = "#d4d4d4";
    context.font = "28px monospace";
    context.fillText("function saveDraft(form) {", 40, 80);
    context.fillText("const token = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';", 40, 150);
    context.fillText("TypeError: Cannot read properties of undefined", 40, 220);

    const engine = new PaddleOcrEngine(service as unknown as PaddleService, napiCanvas);
    const started = performance.now();
    const lines = await engine.recognize(canvas as unknown as OffscreenCanvas, { frame: "f0000" });
    const elapsed = performance.now() - started;
    await service.destroy();

    const text = lines.map((l) => l.text).join("\n");
    console.log(`OCR ${lines.length} lines in ${elapsed.toFixed(0)} ms:\n${text}`);
    expect(text).toContain("saveDraft");
    expect(text).toMatch(/ghp_A1b2C3d4/);
    expect(text).toContain("TypeError");
  });
});
