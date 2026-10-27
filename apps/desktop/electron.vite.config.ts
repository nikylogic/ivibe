// SPDX-License-Identifier: AGPL-3.0-only

import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { astryxStylex } from "@astryxdesign/build/vite";

// Cross-origin isolation lets ONNX Runtime (OCR) use WebAssembly threads (docs/architecture.md §4.2).
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads can't require shared chunks, so each entry is bundled on its own.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          ui: resolve(__dirname, "src/preload/ui.ts"),
          hud: resolve(__dirname, "src/preload/hud.ts"),
          recorder: resolve(__dirname, "src/preload/recorder.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [...astryxStylex(), react()],
    server: { headers: isolationHeaders },
    build: {
      rollupOptions: {
        input: {
          ui: resolve(__dirname, "src/renderer/ui/index.html"),
          hud: resolve(__dirname, "src/renderer/hud/index.html"),
          recorder: resolve(__dirname, "src/renderer/recorder/index.html"),
        },
      },
    },
  },
});
