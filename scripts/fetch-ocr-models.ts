// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Downloads the PP-OCRv5 mobile English models next to the desktop renderer and checks them
 * against pinned SHA-256 hashes, so OCR never touches the network at run time
 * (docs/architecture.md §4.8). ONNX Runtime's WebAssembly is bundled by Vite.
 *
 * Output: apps/desktop/src/renderer/public/ocr/ (gitignored; Vite copies it into the build).
 *
 * Usage: pnpm ocr:fetch
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODEL_BASE = "https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main";

/** Model files and their expected hashes. Update both together. */
const MODELS = [
  {
    file: "det.ort",
    url: `${MODEL_BASE}/detection/PP-OCRv5_mobile_det_infer.ort`,
    sha256: "30acfc4e21f2a23669d01a75aaeb92190f96874613108a0f7086bed264420abc",
  },
  {
    file: "rec.ort",
    url: `${MODEL_BASE}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`,
    sha256: "74ff9e508379375b5149a3c7764221fa9ba7680b7e2f2e458f26b7c7993a89b0",
  },
  {
    file: "dict.txt",
    url: `${MODEL_BASE}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
    sha256: "c60d46e9e01d500ed6388fe8681051eac9cf6692e0d57238315be171927a0a1b",
  },
] as const;

const root = join(import.meta.dirname, "..");
const outDir = join(root, "apps/desktop/src/renderer/public/ocr");

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function fetchModel(model: (typeof MODELS)[number]): Promise<void> {
  const target = join(outDir, model.file);
  const existing = await readFile(target).catch(() => null);
  if (existing && (!model.sha256 || sha256(existing) === model.sha256)) {
    console.log(`ok       ${model.file}`);
    return;
  }

  const response = await fetch(model.url);
  if (!response.ok) throw new Error(`${model.url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = sha256(bytes);
  if (model.sha256 && hash !== model.sha256) {
    throw new Error(`${model.file}: expected sha256 ${model.sha256}, got ${hash}`);
  }
  await writeFile(target, bytes);
  console.log(`fetched  ${model.file} (${(bytes.byteLength / 1e6).toFixed(1)} MB) sha256 ${hash}`);
}

await mkdir(outDir, { recursive: true });
for (const model of MODELS) await fetchModel(model);
