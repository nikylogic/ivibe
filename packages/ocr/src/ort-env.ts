// SPDX-License-Identifier: AGPL-3.0-only

import * as ort from "onnxruntime-web";

/**
 * Imported before ppu-paddle-ocr, which points ONNX Runtime at a CDN unless `wasmPaths` is
 * already set. An empty override keeps ONNX Runtime on the WebAssembly file the bundler emitted
 * next to the app, so OCR never needs the network.
 */
ort.env.wasm.wasmPaths ??= {};

export { ort };
